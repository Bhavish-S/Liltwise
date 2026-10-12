import assert from 'node:assert/strict';
import { createServer as createNetServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { afterEach, test } from 'node:test';
import { createCompanionServer } from './companion-server.ts';

const origin = 'http://localhost:3000';
const servers: Array<ReturnType<typeof createCompanionServer>> = [];

function makeTransfer(transferId = 'd2719c28-9e8c-4c77-a2b3-68fae4f95ff4') {
  return {
    transferId,
    eventTitle: 'Design Summit',
    eventType: 'Conference',
    script: {
      title: 'Welcome',
      sections: [{
        id: 'welcome', title: 'Opening', purpose: 'Welcome guests',
        speechText: 'Good morning, everyone.', estimatedSeconds: 4, stageDirection: 'Smile',
      }],
      confirmations: [], factChecklist: [], totalWordCount: 3, estimatedMinutes: 0.1,
    },
  };
}

async function makeServer(now = () => Date.now()) {
  const server = createCompanionServer({ port: 0, allowedOrigins: [origin], now });
  servers.push(server);
  await server.start();
  const baseUrl = `http://127.0.0.1:${server.getPort()}`;
  const headers = { Origin: origin, 'X-Liltwise-Client': 'website' };
  return { server, baseUrl, headers };
}

async function pair(baseUrl: string, headers: Record<string, string>, code: string) {
  const response = await fetch(`${baseUrl}/pair`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', 'X-Liltwise-Pairing': '1' },
    body: JSON.stringify({ code }),
  });
  return { response, body: await response.json() as { token?: string } };
}

function requestWithHost(baseUrl: string, host: string, headers: Record<string, string>): Promise<number> {
  const url = new URL('/health', baseUrl);
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: url.hostname,
      port: Number(url.port),
      path: url.pathname,
      headers: { ...headers, Host: host },
    }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode ?? 0));
    });
    request.on('error', reject);
    request.end();
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

test('serves health only to the configured origin and expected host', async () => {
  const { baseUrl, headers } = await makeServer();
  const good = await fetch(`${baseUrl}/health`, { headers });
  assert.equal(good.status, 200);
  assert.deepEqual(await good.json(), { ok: true, paired: false });

  const wrongOrigin = await fetch(`${baseUrl}/health`, { headers: { ...headers, Origin: 'https://attacker.example' } });
  assert.equal(wrongOrigin.status, 403);
  assert.equal(await requestWithHost(baseUrl, 'attacker.example', headers), 403);
});

test('pairs once, accepts one script, rejects replay and revoked sessions', async () => {
  const { server, baseUrl, headers } = await makeServer();
  const code = server.createPairingCode().pairingCode;
  assert.ok(code);
  const paired = await pair(baseUrl, headers, code);
  assert.equal(paired.response.status, 200);
  assert.match(paired.body.token ?? '', /^[A-Za-z0-9_-]{43}$/u);
  assert.equal((await pair(baseUrl, headers, code)).response.status, 401);

  const transfer = makeTransfer();
  const send = () => fetch(`${baseUrl}/transfer`, {
    method: 'POST', headers: { ...headers, Authorization: `Bearer ${paired.body.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(transfer),
  });
  assert.equal((await send()).status, 202);
  assert.equal((await send()).status, 409);
  assert.equal(server.snapshot().pendingImport?.script.title, 'Welcome');
  assert.equal(server.takePendingImport(transfer.transferId)?.script.title, 'Welcome');
  assert.equal(server.takePendingImport(transfer.transferId), null);

  const secondTransfer = makeTransfer('91d8ce8e-24dc-4e9a-bafd-e2ceab180849');
  const sendSecond = () => fetch(`${baseUrl}/transfer`, {
    method: 'POST', headers: { ...headers, Authorization: `Bearer ${paired.body.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(secondTransfer),
  });
  assert.equal((await sendSecond()).status, 202);
  assert.equal(server.discardPendingImport(secondTransfer.transferId), true);
  assert.equal(server.snapshot().pendingImport, null);
  assert.equal((await sendSecond()).status, 409);

  const disconnected = await fetch(`${baseUrl}/disconnect`, {
    method: 'POST', headers: { ...headers, Authorization: `Bearer ${paired.body.token}`, 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(disconnected.status, 200);
  assert.equal((await send()).status, 401);
});

test('expires pairing codes and rejects attempts to reuse them', async () => {
  let now = 1_000;
  const { server, baseUrl, headers } = await makeServer(() => now);
  const code = server.createPairingCode().pairingCode;
  assert.ok(code);
  now += 5 * 60 * 1000;
  const expired = await pair(baseUrl, headers, code);
  assert.equal(expired.response.status, 401);
  assert.equal(server.snapshot().pairingCode, null);
});

test('expires paired sessions after eight hours', async () => {
  let now = 1_000;
  const { server, baseUrl, headers } = await makeServer(() => now);
  const code = server.createPairingCode().pairingCode;
  assert.ok(code);
  const paired = await pair(baseUrl, headers, code);
  now += 8 * 60 * 60 * 1000;
  const response = await fetch(`${baseUrl}/transfer`, {
    method: 'POST', headers: { ...headers, Authorization: `Bearer ${paired.body.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(makeTransfer()),
  });
  assert.equal(response.status, 401);
  assert.equal(server.snapshot().paired, false);
});

test('limits wrong pairing codes and validates transfer payloads', async () => {
  const { server, baseUrl, headers } = await makeServer();
  const code = server.createPairingCode().pairingCode;
  assert.ok(code);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await pair(baseUrl, headers, '00000000')).response.status, 401);
  }
  assert.equal(server.snapshot().pairingCode, null);

  const freshCode = server.createPairingCode().pairingCode;
  assert.ok(freshCode);
  const paired = await pair(baseUrl, headers, freshCode);
  const bad = await fetch(`${baseUrl}/transfer`, {
    method: 'POST', headers: { ...headers, Authorization: `Bearer ${paired.body.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...makeTransfer(), unexpected: true }),
  });
  assert.equal(bad.status, 400);
});

test('rejects malformed and oversized transfer requests', async () => {
  const { server, baseUrl, headers } = await makeServer();
  const code = server.createPairingCode().pairingCode;
  assert.ok(code);
  const paired = await pair(baseUrl, headers, code);
  const transferHeaders = { ...headers, Authorization: `Bearer ${paired.body.token}`, 'Content-Type': 'application/json' };
  const malformed = await fetch(`${baseUrl}/transfer`, { method: 'POST', headers: transferHeaders, body: '{' });
  assert.equal(malformed.status, 400);
  const oversized = await fetch(`${baseUrl}/transfer`, {
    method: 'POST', headers: transferHeaders, body: JSON.stringify({ content: 'x'.repeat(1_000_001) }),
  });
  assert.equal(oversized.status, 413);
});

test('limits script transfer requests per minute', async () => {
  const { server, baseUrl, headers } = await makeServer();
  const code = server.createPairingCode().pairingCode;
  assert.ok(code);
  const paired = await pair(baseUrl, headers, code);
  const send = () => fetch(`${baseUrl}/transfer`, {
    method: 'POST', headers: { ...headers, Authorization: `Bearer ${paired.body.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(makeTransfer()),
  });
  for (let attempt = 0; attempt < 10; attempt += 1) await send();
  assert.equal((await send()).status, 429);
});

test('reports a port conflict without crashing the companion app', async () => {
  const blocker = createNetServer();
  await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
  const address = blocker.address();
  assert.ok(address && typeof address === 'object');
  const server = createCompanionServer({ port: address.port, allowedOrigins: [origin] });
  servers.push(server);
  await assert.rejects(server.start());
  assert.equal(server.snapshot().available, false);
  assert.match(server.snapshot().diagnostic, /already in use/u);
  await new Promise<void>((resolve, reject) => blocker.close((error) => error ? reject(error) : resolve()));
});

test('does not start when the configured origin is invalid', async () => {
  const server = createCompanionServer({ allowedOrigins: ['http://example.com'] });
  servers.push(server);
  await server.start();
  assert.equal(server.snapshot().available, false);
  assert.match(server.snapshot().diagnostic, /origin is invalid/u);
});
