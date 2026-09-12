import { describe, expect, it } from 'vitest';
import { authenticate, corsHeaders, hashToken, HttpError, randomToken, readJson } from './http';

function fakeEnv(rows: Record<string, { id: string }>): Env {
  const db = {
    prepare: (_sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async <T,>() => (rows[String(args[0])] ?? null) as T | null,
      }),
    }),
  };
  return { DB: db, CORS_ORIGINS: 'https://app.example.com,https://preview.example.com' } as unknown as Env;
}
function jsonRequest(body: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }): Request {
  return new Request('https://worker.test/api/x', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
}

describe('readJson', () => {
  it('parses a valid JSON object body', async () => {
    await expect(readJson(jsonRequest({ name: 'A' }))).resolves.toEqual({ name: 'A' });
  });
  it('rejects a missing content-type header', async () => {
    await expect(readJson(jsonRequest({ a: 1 }, {}))).rejects.toMatchObject({ status: 415, code: 'JSON_REQUIRED' });
  });
  it('rejects malformed JSON', async () => {
    await expect(readJson(jsonRequest('{not json'))).rejects.toMatchObject({ status: 400, code: 'INVALID_JSON' });
  });
  it('rejects a JSON array or primitive at the top level', async () => {
    await expect(readJson(jsonRequest([1, 2, 3]))).rejects.toMatchObject({ status: 400, code: 'INVALID_JSON' });
    await expect(readJson(jsonRequest('"just a string"'))).rejects.toMatchObject({ status: 400, code: 'INVALID_JSON' });
  });
  it('rejects a body over the 8192-byte limit', async () => {
    const request = jsonRequest({ name: 'x'.repeat(9000) });
    await expect(readJson(request)).rejects.toMatchObject({ status: 413, code: 'BODY_TOO_LARGE' });
  });
  it('accepts a body right at the boundary and rejects one byte over', async () => {
    // {"n":"...(8184 x's)"} is exactly 8192 bytes.
    const exact = jsonRequest({ n: 'x'.repeat(8184) });
    await expect(readJson(exact)).resolves.toBeTruthy();
    const over = jsonRequest({ n: 'x'.repeat(8185) });
    await expect(readJson(over)).rejects.toMatchObject({ status: 413, code: 'BODY_TOO_LARGE' });
  });
});

describe('authenticate', () => {
  it('rejects a missing Authorization header', async () => {
    const request = new Request('https://worker.test/api/profile');
    await expect(authenticate(request, fakeEnv({}))).rejects.toMatchObject({ status: 401, code: 'AUTH_REQUIRED' });
  });
  it('rejects a malformed bearer token (wrong shape, not just wrong value)', async () => {
    const request = new Request('https://worker.test/api/profile', { headers: { authorization: 'Bearer not-a-hex-token' } });
    await expect(authenticate(request, fakeEnv({}))).rejects.toMatchObject({ status: 401, code: 'AUTH_REQUIRED' });
  });
  it('rejects a well-formed token with no matching session', async () => {
    const token = randomToken();
    const request = new Request('https://worker.test/api/profile', { headers: { authorization: `Bearer ${token}` } });
    await expect(authenticate(request, fakeEnv({}))).rejects.toMatchObject({ status: 401, code: 'INVALID_SESSION' });
  });
  it('resolves the player id for a known token hash', async () => {
    const token = randomToken();
    const hash = await hashToken(token);
    const request = new Request('https://worker.test/api/profile', { headers: { authorization: `Bearer ${token}` } });
    await expect(authenticate(request, fakeEnv({ [hash]: { id: 'player-1' } }))).resolves.toBe('player-1');
  });
});

describe('corsHeaders', () => {
  const env = fakeEnv({});
  it('allows an origin present in CORS_ORIGINS', () => {
    const request = new Request('https://worker.test/api/x', { headers: { origin: 'https://app.example.com' } });
    expect(corsHeaders(request, env).get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
  });
  it('does not echo an origin absent from CORS_ORIGINS (no wildcard fallback)', () => {
    const request = new Request('https://worker.test/api/x', { headers: { origin: 'https://evil.example.com' } });
    expect(corsHeaders(request, env).get('Access-Control-Allow-Origin')).toBeNull();
  });
  it('allows a request with no Origin header through without CORS headers (non-browser clients)', () => {
    const request = new Request('https://worker.test/api/x');
    expect(corsHeaders(request, env).get('Access-Control-Allow-Origin')).toBeNull();
  });
  it('always sets Vary: Origin so a CDN cannot leak one origin\'s response to another', () => {
    const request = new Request('https://worker.test/api/x', { headers: { origin: 'https://app.example.com' } });
    expect(corsHeaders(request, env).get('Vary')).toBe('Origin');
  });

  // Local development: the web dev server's port moves (Expo takes 8082 when 8081 is busy), so a
  // loopback caller is allowed when the worker is itself on loopback — and only then.
  const localRequest = (origin: string, url = 'http://localhost:8787/api/x') => new Request(url, { headers: { origin } });
  it('allows any loopback port when the worker is itself on loopback', () => {
    for (const origin of ['http://localhost:8082', 'http://127.0.0.1:19006', 'http://[::1]:5173', 'https://localhost:8443']) {
      expect(corsHeaders(localRequest(origin), env).get('Access-Control-Allow-Origin')).toBe(origin);
    }
  });
  it('still rejects a non-loopback origin when the worker is on loopback', () => {
    expect(corsHeaders(localRequest('https://evil.example.com'), env).get('Access-Control-Allow-Origin')).toBeNull();
  });
  it('rejects a host that merely looks loopback', () => {
    for (const origin of ['http://localhost.evil.com', 'http://127.0.0.1.evil.com', 'http://notlocalhost']) {
      expect(corsHeaders(localRequest(origin), env).get('Access-Control-Allow-Origin')).toBeNull();
    }
  });
  it('does NOT allow a loopback origin once the worker is deployed to a public origin', () => {
    // The clause is self-gating: production keeps the strict exact-match allowlist.
    const request = new Request('https://worker.test/api/x', { headers: { origin: 'http://localhost:8082' } });
    expect(corsHeaders(request, env).get('Access-Control-Allow-Origin')).toBeNull();
  });

  // Two players on two laptops need the LAN address, not loopback — `localhost` on the second
  // laptop is the second laptop. Rejecting the LAN origin used to surface as "cannot reach your
  // VYRA server", pointing at the network rather than at CORS.
  const lan = (origin: string, url = 'http://192.168.1.20:8787/api/x') => new Request(url, { headers: { origin } });
  it('allows a private-network origin when the worker is itself on a private network', () => {
    for (const origin of ['http://192.168.1.20:8082', 'http://10.0.0.5:8082', 'http://172.16.3.4:8082', 'http://vyra.local:8082']) {
      expect(corsHeaders(lan(origin), env).get('Access-Control-Allow-Origin')).toBe(origin);
    }
  });
  it('allows loopback and LAN to mix, since both ends are still this machine or its network', () => {
    expect(corsHeaders(lan('http://localhost:8082'), env).get('Access-Control-Allow-Origin')).toBe('http://localhost:8082');
    const toLoopback = new Request('http://localhost:8787/api/x', { headers: { origin: 'http://192.168.1.20:8082' } });
    expect(corsHeaders(toLoopback, env).get('Access-Control-Allow-Origin')).toBe('http://192.168.1.20:8082');
  });
  it('still rejects a public origin when the worker is on a private address', () => {
    expect(corsHeaders(lan('https://evil.example.com'), env).get('Access-Control-Allow-Origin')).toBeNull();
  });
  it('does NOT allow a private-network origin once the worker is deployed publicly', () => {
    const request = new Request('https://worker.test/api/x', { headers: { origin: 'http://192.168.1.20:8082' } });
    expect(corsHeaders(request, env).get('Access-Control-Allow-Origin')).toBeNull();
  });
  it('allows a non-private LAN origin only when CORS_ORIGINS names it explicitly', () => {
    // 172.32.x.x is outside RFC 1918 (private ends at 172.31), so the private-network clause does
    // not cover it and the allowlist has to carry it — which is how wrangler.local.jsonc is set up.
    const listed = fakeEnv({});
    (listed as { CORS_ORIGINS: string }).CORS_ORIGINS = 'http://172.32.2.227:8082';
    const request = new Request('http://172.32.2.227:8787/api/x', { headers: { origin: 'http://172.32.2.227:8082' } });
    expect(corsHeaders(request, listed).get('Access-Control-Allow-Origin')).toBe('http://172.32.2.227:8082');
    expect(corsHeaders(request, env).get('Access-Control-Allow-Origin')).toBeNull();
  });
  it('allows the worker to call itself, so a listed API origin is never needed for same-origin pages', () => {
    // /capture/ is served by the worker: its Origin equals the worker's own, allowed before the list.
    const request = new Request('http://172.32.2.227:8787/api/x', { headers: { origin: 'http://172.32.2.227:8787' } });
    expect(corsHeaders(request, env).get('Access-Control-Allow-Origin')).toBe('http://172.32.2.227:8787');
  });
  it('rejects public addresses that merely sit near a private range', () => {
    // 172.32 is outside 172.16–172.31, 11.x and 193.168 are public, and 999.1.1.1 is not an address.
    for (const origin of ['http://172.32.0.1:8082', 'http://11.0.0.1:8082', 'http://193.168.1.20:8082', 'http://999.1.1.1:8082']) {
      expect(corsHeaders(lan(origin), env).get('Access-Control-Allow-Origin')).toBeNull();
    }
  });
});

describe('HttpError', () => {
  it('carries status and code alongside the message', () => {
    const error = new HttpError(404, 'NOT_FOUND', 'API route not found.');
    expect(error).toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'API route not found.' });
  });
});
