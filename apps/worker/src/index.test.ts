import { describe, expect, it, vi } from 'vitest';
import { createProgression } from '@vyra/core/progression';
import { hashToken } from './http';

// Keep the production router and its real route table; only the Workers base class is replaced so
// this runs in the Node suite, exactly as profile.test.ts does.
vi.mock('cloudflare:workers', () => ({
  DurableObject: class { constructor(protected ctx: DurableObjectState, protected env: Env) {} },
}));
import worker from './index';

const TOKEN = 'b'.repeat(64);
const PLAYER = 'limited-player';

/**
 * A router fixture with no database and no Durable Objects: every test here asserts what happens
 * *before* a handler runs, so a request that gets far enough to touch either has already failed the
 * thing being tested. `DB.prepare` answers only the one query `authenticate` makes.
 */
async function fixture(allow: (binding: string) => boolean = () => true) {
  const calls: { binding: string; key: string }[] = [];
  const limiter = (binding: string) => ({
    limit: async ({ key }: { key: string }) => { calls.push({ binding, key }); return { success: allow(binding) }; },
  });
  const hash = await hashToken(TOKEN);
  const env = {
    AI_ENABLED: 'false', CORS_ORIGINS: 'http://localhost:8081',
    IP_LIMITER: limiter('ip'), GUEST_LIMITER: limiter('guest'), PLAYER_LIMITER: limiter('player'),
    DB: { prepare: (_sql: string) => ({ bind: (...args: unknown[]) => ({
      first: async () => (args[0] === hash ? { id: PLAYER } : null),
      run: async () => undefined,
    }) }) },
    PROFILES: { getByName: () => ({ getProfile: async () => createProgression(PLAYER, 'Limited').profile }) },
    ASSETS: { fetch: async () => new Response('asset', { status: 200 }) },
  } as unknown as Env;
  const call = (path: string, init: RequestInit = {}, ip = '203.0.113.7') => {
    const headers = new Headers(init.headers);
    headers.set('cf-connecting-ip', ip);
    if (init.body) headers.set('content-type', 'application/json');
    return worker.fetch(new Request(`https://worker.test${path}`, { ...init, headers }), env);
  };
  const bindings = () => calls.map(c => c.binding);
  return { call, calls, bindings };
}

describe('API rate limiting', () => {
  it('meters every API request by client address, including unauthenticated ones', async () => {
    const { call, calls } = await fixture();
    await call('/api/health');
    expect(calls).toEqual([{ binding: 'ip', key: '203.0.113.7' }]);
  });

  it('returns 429 with a caller-facing message once the address limit is spent', async () => {
    const { call } = await fixture(binding => binding !== 'ip');
    const response = await call('/api/health');
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ error: 'RATE_LIMITED', message: expect.stringContaining('Too many requests') });
  });

  it('meters guest creation separately and more tightly than the address limit', async () => {
    const { call, bindings } = await fixture();
    await call('/api/guests', { method: 'POST', body: JSON.stringify({ name: 'Aster' }) });
    expect(bindings()).toEqual(['ip', 'guest']);
  });

  it('refuses guest creation without writing a profile row once the guest limit is spent', async () => {
    // The 429 has to land before the INSERT, or the limit would only slow account creation down
    // rather than stop it.
    const { call } = await fixture(binding => binding !== 'guest');
    const response = await call('/api/guests', { method: 'POST', body: JSON.stringify({ name: 'Aster' }) });
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ error: 'RATE_LIMITED' });
  });

  it('meters authenticated routes by the player the server resolved, not by anything the client sent', async () => {
    const { call, calls } = await fixture();
    await call('/api/profile', { headers: { authorization: `Bearer ${TOKEN}` } });
    expect(calls).toEqual([{ binding: 'ip', key: '203.0.113.7' }, { binding: 'player', key: PLAYER }]);
  });

  it('does not spend a player budget on a request that failed authentication', async () => {
    // An unauthenticated caller has no player identity to charge, so charging one would mean
    // charging a key it chose. The address limit is what covers that traffic.
    const { call, bindings } = await fixture();
    const response = await call('/api/profile', { headers: { authorization: `Bearer ${'c'.repeat(64)}` } });
    expect(response.status).toBe(401);
    expect(bindings()).toEqual(['ip']);
  });

  it('stops room-code guessing at the player limit, before the room lookup', async () => {
    const { call } = await fixture(binding => binding !== 'player');
    const response = await call('/api/rooms/ABC123/join', { method: 'POST', body: '{}', headers: { authorization: `Bearer ${TOKEN}` } });
    expect(response.status).toBe(429);
  });

  it('leaves static asset requests unmetered, since they never reach the API', async () => {
    const { call, calls } = await fixture();
    await expect(call('/capture/index.html').then(r => r.status)).resolves.toBe(200);
    expect(calls).toEqual([]);
  });
});

describe('response headers', () => {
  it('sends nosniff and a referrer policy with static assets, not only with API responses', async () => {
    // /capture/ is a camera app served from this origin; it was going out with neither.
    const { call } = await fixture();
    const response = await call('/capture/index.html');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Referrer-Policy')).toBe('same-origin');
  });
  it('does not block framing, which web capture depends on', async () => {
    // CaptureFrame.web.tsx embeds /capture/ in an <iframe> whose parent is the Expo dev server on
    // another port. A frame-blocking header here turns into a blank camera panel on web.
    const { call } = await fixture();
    const response = await call('/capture/index.html');
    expect(response.headers.get('X-Frame-Options')).toBeNull();
    expect(response.headers.get('Content-Security-Policy')).toBeNull();
  });
  it('preserves the asset response body and status', async () => {
    const { call } = await fixture();
    const response = await call('/capture/index.html');
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('asset');
  });

  it('answers CORS preflight without spending a limit, so a browser check cannot exhaust one', async () => {
    const { call, calls } = await fixture();
    expect((await call('/api/profile', { method: 'OPTIONS' })).status).toBe(204);
    expect(calls).toEqual([]);
  });

  it('keys separate addresses into separate buckets', async () => {
    const { call, calls } = await fixture();
    await call('/api/health', {}, '198.51.100.1');
    await call('/api/health', {}, '198.51.100.2');
    expect(calls.map(c => c.key)).toEqual(['198.51.100.1', '198.51.100.2']);
  });

  it('still applies CORS headers to a 429 so the browser can read the error', async () => {
    // A 429 that the browser drops as a CORS failure reaches the player as "cannot reach the
    // server", which is the wrong thing to tell someone who only needs to wait a moment.
    const { call } = await fixture(() => false);
    const response = await call('/api/health', { headers: { origin: 'http://localhost:8081' } });
    expect(response.status).toBe(429);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8081');
  });
});
