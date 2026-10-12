import {
  EventBrainError,
  eventBrainErrorResponse,
  generateEventScript,
  MAX_GENERATION_BODY_BYTES,
  readAIConfiguration,
  type StructuredProvider,
} from './service.ts';

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super('The request body is too large.');
    this.name = 'RequestBodyTooLargeError';
  }
}

export class InvalidRequestBodyError extends Error {
  constructor() {
    super('The request body must contain valid UTF-8 JSON.');
    this.name = 'InvalidRequestBodyError';
  }
}

export async function readLimitedText(request: Request, maximumBytes: number): Promise<string> {
  const statedLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(statedLength) && statedLength > maximumBytes) throw new RequestBodyTooLargeError();
  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new InvalidRequestBodyError();
  }
}

export function createMemoryRateLimiter(limit = MAX_REQUESTS_PER_WINDOW, windowMs = WINDOW_MS, now = Date.now) {
  const callers = new Map<string, { count: number; resetAt: number }>();
  return (key: string): boolean => {
    const time = now();
    if (callers.size > 1000) {
      for (const [caller, entry] of callers) {
        if (entry.resetAt <= time) callers.delete(caller);
      }
    }
    const current = callers.get(key);
    if (!current || current.resetAt <= time) {
      callers.set(key, { count: 1, resetAt: time + windowMs });
      return true;
    }
    if (current.count >= limit) return false;
    current.count += 1;
    return true;
  };
}

interface GenerationHandlerOptions {
  environment?: () => Record<string, string | undefined>;
  createProvider?: (apiKey: string) => StructuredProvider;
  allowRequest?: (key: string) => boolean;
  timeoutMs?: number;
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function createGenerationHandler(options: GenerationHandlerOptions = {}) {
  const environment = options.environment ?? (() => process.env);
  const createProvider = options.createProvider ?? (() => {
    throw new Error('The AI provider is not configured.');
  });
  const allowRequest = options.allowRequest ?? createMemoryRateLimiter();

  return async function handleGeneration(request: Request): Promise<Response> {
    const config = readAIConfiguration(environment());
    if (!config) {
      return json({ error: { code: 'AI_NOT_CONFIGURED', message: 'AI generation is not configured yet. Set OPENAI_API_KEY and OPENAI_MODEL in apps/site/.env.local, then restart the website.' } }, 503);
    }

    const caller = (request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')?.trim()
      || 'unknown').slice(0, 128);
    if (!allowRequest(caller)) {
      return json({ error: { code: 'REQUEST_RATE_LIMIT', message: 'Too many generation attempts. Wait a few minutes and try again.' } }, 429);
    }

    try {
      const bodyText = await readLimitedText(request, MAX_GENERATION_BODY_BYTES);
      let body: unknown;
      try {
        body = JSON.parse(bodyText);
      } catch {
        throw new EventBrainError(400, 'INVALID_JSON', 'The request could not be read. Please review the form and try again.');
      }
      const script = await generateEventScript(body, createProvider(config.apiKey), config.model, options.timeoutMs);
      return json({ script }, 200);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return json({ error: { code: 'REQUEST_TOO_LARGE', message: 'The event details exceed the request limit. Shorten the guide and try again.' } }, 413);
      }
      if (error instanceof InvalidRequestBodyError) {
        return json({ error: { code: 'INVALID_BODY', message: 'The request could not be read. Please review the form and try again.' } }, 400);
      }
      const result = eventBrainErrorResponse(error);
      return json(result.body, result.status);
    }
  };
}
