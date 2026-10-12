import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
  companionHealthSchema,
  companionSnapshotSchema,
  desktopScriptTransferSchema,
  pairingCodeRequestSchema,
  pairingResponseSchema,
  type CompanionSnapshot,
  type DesktopScriptTransfer,
} from '@liltwise/contracts';

export const COMPANION_HOST = '127.0.0.1';
export const COMPANION_PORT = 43_129;
const PAIRING_LIFETIME_MS = 5 * 60 * 1000;
const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;
const MAX_REQUEST_BYTES = 1_000_000;
const MAX_PAIRING_ATTEMPTS = 5;
const MAX_TRANSFERS_PER_MINUTE = 10;
const CLIENT_HEADER = 'x-liltwise-client';
const PAIRING_HEADER = 'x-liltwise-pairing';
const ALLOWED_REQUEST_HEADERS = ['authorization', 'content-type', CLIENT_HEADER, PAIRING_HEADER];

interface CompanionServerOptions {
  port?: number;
  allowedOrigins: string[];
  now?: () => number;
  onStateChanged?: () => void;
}

interface PairingCode {
  digest: Buffer;
  expiresAt: number;
  failedAttempts: number;
}

interface Session {
  digest: Buffer;
  expiresAt: number;
  transferTimes: number[];
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function constantTimeDigestMatches(input: string, expectedDigest: Buffer): boolean {
  return timingSafeEqual(digest(input), expectedDigest);
}

function parseAllowedOrigins(origins: string[]): Set<string> {
  const result = new Set<string>();
  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error('A configured website origin is not a valid URL origin.');
    }
    const isLoopbackDevelopment = parsed.protocol === 'http:'
      && ['localhost', '127.0.0.1'].includes(parsed.hostname)
      && parsed.port === '3000';
    if (parsed.origin !== origin || (parsed.protocol !== 'https:' && !isLoopbackDevelopment)) {
      throw new Error('Configured website origins must be exact HTTPS origins (or the local development site).');
    }
    result.add(origin);
  }
  return result;
}

function json(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const content = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(content),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  response.end(content);
}

function readJson(request: IncomingMessage): Promise<unknown> {
  const contentType = request.headers['content-type'] ?? '';
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(contentType)) {
    return Promise.reject(Object.assign(new Error('Expected application/json.'), { status: 415 }));
  }
  const statedLength = Number(request.headers['content-length']);
  if (Number.isFinite(statedLength) && statedLength > MAX_REQUEST_BYTES) {
    return Promise.reject(Object.assign(new Error('The request is too large.'), { status: 413 }));
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let length = 0;
    let tooLarge = false;
    request.on('data', (chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += bytes.length;
      if (length > MAX_REQUEST_BYTES) {
        tooLarge = true;
        chunks.length = 0;
      } else if (!tooLarge) {
        chunks.push(bytes);
      }
    });
    request.on('end', () => {
      if (tooLarge) {
        reject(Object.assign(new Error('The request is too large.'), { status: 413 }));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);
      } catch {
        reject(Object.assign(new Error('The request must contain valid JSON.'), { status: 400 }));
      }
    });
    request.on('error', () => reject(Object.assign(new Error('The request could not be read.'), { status: 400 })));
  });
}

export function createCompanionServer(options: CompanionServerOptions) {
  const port = options.port ?? COMPANION_PORT;
  const now = options.now ?? Date.now;
  let allowedOrigins = new Set<string>();
  let configurationError = '';
  try {
    allowedOrigins = parseAllowedOrigins(options.allowedOrigins);
  } catch {
    configurationError = 'The configured website origin is invalid. Review LILTWISE_ALLOWED_WEB_ORIGINS and restart Liltwise.';
  }
  let server: Server | null = null;
  let available = false;
  let diagnostic = configurationError;
  let pairingCode: PairingCode | null = null;
  let pairingCodeForDisplay: string | null = null;
  let session: Session | null = null;
  let pendingImport: DesktopScriptTransfer | null = null;
  const receivedTransferIds = new Set<string>();

  function boundPort(): number {
    const address = server?.address();
    return address && typeof address === 'object' ? address.port : port;
  }

  function rememberTransferId(transferId: string): void {
    receivedTransferIds.add(transferId);
    while (receivedTransferIds.size > 50) {
      const oldest = receivedTransferIds.values().next().value as string | undefined;
      if (oldest) receivedTransferIds.delete(oldest);
      else break;
    }
  }

  function notifyState(): void {
    options.onStateChanged?.();
  }

  function activePairing(): PairingCode | null {
    if (pairingCode && pairingCode.expiresAt <= now()) {
      pairingCode = null;
      pairingCodeForDisplay = null;
      notifyState();
    }
    return pairingCode;
  }

  function activeSession(): Session | null {
    if (session && session.expiresAt <= now()) {
      session = null;
      notifyState();
    }
    return session;
  }

  function snapshot(): CompanionSnapshot {
    const code = activePairing();
    const currentSession = activeSession();
    return companionSnapshotSchema.parse({
      available,
      diagnostic,
      allowedWebsiteConfigured: allowedOrigins.size > 0,
      pairingCode: code ? pairingCodeForDisplay : null,
      pairingExpiresAt: code?.expiresAt ?? null,
      paired: Boolean(currentSession),
      pendingImport,
    });
  }

  function createPairingCode(): CompanionSnapshot {
    const code = String(randomInt(10_000_000, 100_000_000));
    const expiresAt = now() + PAIRING_LIFETIME_MS;
    pairingCode = { digest: digest(code), expiresAt, failedAttempts: 0 };
    pairingCodeForDisplay = code;
    session = null;
    notifyState();
    return snapshot();
  }

  function revokePairing(): CompanionSnapshot {
    pairingCode = null;
    pairingCodeForDisplay = null;
    session = null;
    notifyState();
    return snapshot();
  }

  function takePendingImport(transferId: string): DesktopScriptTransfer | null {
    if (!pendingImport || pendingImport.transferId !== transferId) return null;
    const value = pendingImport;
    pendingImport = null;
    notifyState();
    return value;
  }

  function discardPendingImport(transferId: string): boolean {
    if (!pendingImport || pendingImport.transferId !== transferId) return false;
    pendingImport = null;
    notifyState();
    return true;
  }

  function getOrigin(request: IncomingMessage): string | null {
    const origin = request.headers.origin;
    return origin && allowedOrigins.has(origin) ? origin : null;
  }

  function corsHeaders(request: IncomingMessage, origin: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Liltwise-Client, X-Liltwise-Pairing',
      'Access-Control-Max-Age': '300',
      Vary: 'Origin',
    };
    if (request.headers['access-control-request-private-network'] === 'true') {
      headers['Access-Control-Allow-Private-Network'] = 'true';
    }
    return headers;
  }

  function validateRequest(request: IncomingMessage, response: ServerResponse): { origin: string; cors: Record<string, string> } | null {
    if (request.headers.host !== `${COMPANION_HOST}:${boundPort()}`) {
      json(response, 403, { error: 'This host is not allowed.' });
      return null;
    }
    const origin = getOrigin(request);
    if (!origin) {
      json(response, 403, { error: 'This website origin is not allowed.' });
      return null;
    }
    const cors = corsHeaders(request, origin);
    if (request.method === 'OPTIONS') {
      const requestedMethod = request.headers['access-control-request-method']?.toUpperCase();
      const requestedHeaders = (request.headers['access-control-request-headers'] ?? '')
        .split(',').map((header) => header.trim().toLowerCase()).filter(Boolean);
      const knownPath = ['/health', '/pair', '/transfer', '/disconnect'].includes(new URL(request.url ?? '/', 'http://localhost').pathname);
      if (!knownPath || !['GET', 'POST'].includes(requestedMethod ?? '')
        || requestedHeaders.some((header) => !ALLOWED_REQUEST_HEADERS.includes(header))) {
        json(response, 403, { error: 'This preflight request is not allowed.' });
        return null;
      }
      response.writeHead(204, { ...cors, 'Content-Length': '0' });
      response.end();
      return null;
    }
    if (request.headers[CLIENT_HEADER] !== 'website') {
      json(response, 403, { error: 'This client is not allowed.' }, cors);
      return null;
    }
    return { origin, cors };
  }

  function authorize(request: IncomingMessage): Session | null {
    const current = activeSession();
    const authorization = request.headers.authorization ?? '';
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/u.exec(authorization);
    if (!current || !match) return null;
    return constantTimeDigestMatches(match[1] ?? '', current.digest) ? current : null;
  }

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const validated = validateRequest(request, response);
    if (!validated) return;
    const { cors } = validated;
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.search || url.hash) {
      json(response, 400, { error: 'Query strings are not accepted.' }, cors);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      const currentSession = activeSession();
      json(response, 200, companionHealthSchema.parse({ ok: true, paired: Boolean(currentSession) }), cors);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/pair') {
      if (request.headers[PAIRING_HEADER] !== '1') {
        json(response, 403, { error: 'Pairing requires the website pairing request.' }, cors);
        return;
      }
      let body: unknown;
      try {
        body = await readJson(request);
      } catch (error) {
        const status = (error as { status?: number }).status ?? 400;
        json(response, status, { error: status === 415 ? 'Pairing requires a JSON request.' : status === 413 ? 'The pairing request is too large.' : 'The pairing request is invalid.' }, cors);
        return;
      }
      const parsed = pairingCodeRequestSchema.safeParse(body);
      const currentCode = activePairing();
      if (!currentCode || !parsed.success) {
        if (currentCode) {
          currentCode.failedAttempts += 1;
          if (currentCode.failedAttempts >= MAX_PAIRING_ATTEMPTS) {
            pairingCode = null;
            pairingCodeForDisplay = null;
          }
          notifyState();
        }
        json(response, 401, { error: 'The pairing code is invalid or expired. Generate a new code in the desktop app.' }, cors);
        return;
      }
      const candidateCode = parsed.data.code;
      if (!constantTimeDigestMatches(candidateCode, currentCode.digest)) {
        currentCode.failedAttempts += 1;
        if (currentCode.failedAttempts >= MAX_PAIRING_ATTEMPTS) {
          pairingCode = null;
          pairingCodeForDisplay = null;
        }
        notifyState();
        json(response, 401, { error: 'The pairing code is invalid or expired. Generate a new code in the desktop app.' }, cors);
        return;
      }
      pairingCode = null;
      pairingCodeForDisplay = null;
      const token = randomBytes(32).toString('base64url');
      session = { digest: digest(token), expiresAt: now() + SESSION_LIFETIME_MS, transferTimes: [] };
      notifyState();
      json(response, 200, pairingResponseSchema.parse({ token }), cors);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/transfer') {
      const currentSession = authorize(request);
      if (!currentSession) {
        json(response, 401, { error: 'The desktop connection expired or was revoked. Pair again from the desktop app.' }, cors);
        return;
      }
      const timestamp = now();
      currentSession.transferTimes = currentSession.transferTimes.filter((time) => timestamp - time < 60_000);
      if (currentSession.transferTimes.length >= MAX_TRANSFERS_PER_MINUTE) {
        json(response, 429, { error: 'Too many script transfers. Wait a minute and try again.' }, cors);
        return;
      }
      currentSession.transferTimes.push(timestamp);
      let body: unknown;
      try {
        body = await readJson(request);
      } catch (error) {
        const status = (error as { status?: number }).status ?? 400;
        json(response, status, { error: status === 415 ? 'Script transfer requires a JSON request.' : status === 413 ? 'The script is too large to transfer.' : 'The script transfer is invalid.' }, cors);
        return;
      }
      const parsed = desktopScriptTransferSchema.safeParse(body);
      if (!parsed.success) {
        json(response, 400, { error: 'The script did not match the supported transfer format.' }, cors);
        return;
      }
      if (receivedTransferIds.has(parsed.data.transferId)) {
        json(response, 409, { error: 'This script transfer was already received.' }, cors);
        return;
      }
      if (pendingImport) {
        json(response, 409, { error: 'Review or dismiss the pending script in the desktop app before sending another.' }, cors);
        return;
      }
      pendingImport = parsed.data;
      rememberTransferId(parsed.data.transferId);
      notifyState();
      json(response, 202, { received: true, transferId: parsed.data.transferId }, cors);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/disconnect') {
      if (!authorize(request)) {
        json(response, 401, { error: 'The desktop connection is already disconnected or expired.' }, cors);
        return;
      }
      session = null;
      notifyState();
      json(response, 200, { disconnected: true }, cors);
      return;
    }

    json(response, 404, { error: 'This companion operation does not exist.' }, cors);
  }

  const api = {
    snapshot,
    getPort: boundPort,
    createPairingCode,
    revokePairing,
    takePendingImport,
    discardPendingImport,
    async start(): Promise<void> {
      if (server?.listening) return;
      if (configurationError) return;
      const nextServer = createServer((request, response) => {
        request.setTimeout(10_000, () => request.destroy());
        void handle(request, response).catch(() => {
          if (!response.headersSent) json(response, 500, { error: 'The companion request could not be completed.' });
          else response.destroy();
        });
      });
      nextServer.requestTimeout = 15_000;
      nextServer.headersTimeout = 10_000;
      nextServer.maxHeadersCount = 32;
      server = nextServer;
      await new Promise<void>((resolve, reject) => {
        const onError = (error: NodeJS.ErrnoException) => {
          nextServer.off('listening', onListening);
          server = null;
          available = false;
          diagnostic = error.code === 'EADDRINUSE'
            ? `Local companion port ${port} is already in use. Close the other app using it and restart Liltwise.`
            : 'The local companion could not start. Restart Liltwise and try again.';
          notifyState();
          reject(error);
        };
        const onListening = () => {
          nextServer.off('error', onError);
          available = true;
          diagnostic = '';
          notifyState();
          resolve();
        };
        nextServer.once('error', onError);
        nextServer.once('listening', onListening);
        nextServer.listen(port, COMPANION_HOST);
      });
    },
    async close(): Promise<void> {
      pairingCode = null;
      pairingCodeForDisplay = null;
      session = null;
      pendingImport = null;
      available = false;
      const currentServer = server;
      server = null;
      if (currentServer?.listening) {
        await new Promise<void>((resolve) => currentServer.close(() => resolve()));
      }
      notifyState();
    },
  };
  return api;
}
