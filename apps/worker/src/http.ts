export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export async function readJson(request: Request, maxBytes = 8192): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new HttpError(415, 'JSON_REQUIRED', 'Send application/json.');
  if (!request.body) throw new HttpError(400, 'INVALID_JSON', 'A JSON body is required.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > maxBytes) { await reader.cancel(); throw new HttpError(413, 'BODY_TOO_LARGE', 'Request body is too large.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
    return value as Record<string, unknown>;
  } catch { throw new HttpError(400, 'INVALID_JSON', 'A JSON object is required.'); }
}
export function randomToken(): string { return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join(''); }
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}
export async function authenticate(request: Request, env: Env): Promise<string> {
  const match = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('authorization') ?? '');
  if (!match) throw new HttpError(401, 'AUTH_REQUIRED', 'Restore or create a guest session.');
  const row = await env.DB.prepare('SELECT id FROM profiles WHERE token_hash = ?').bind(await hashToken(match[1])).first<{ id: string }>();
  if (!row) throw new HttpError(401, 'INVALID_SESSION', 'This guest session is no longer available.');
  return row.id;
}
/** Loopback hosts, defined exactly as `local()` does in apps/capture/src/bridge.ts. */
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
/** Hosts that can only be reached from the machine itself or from the same private network: the
 *  loopback names above, the RFC 1918 ranges a laptop gets from a home or office router, link-local
 *  addresses, and mDNS `.local` names. Never a routable public host. */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (LOOPBACK_HOSTS.includes(hostname) || host === '::1' || host.endsWith('.local')) return true;
  const parts = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!parts || parts.slice(1).some(part => Number(part) > 255)) return false;
  const [a, b] = [Number(parts[1]), Number(parts[2])];
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}
function isPrivateOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && isPrivateHost(url.hostname);
  } catch { return false; }
}
/**
 * An origin may call this API if it IS this API, is named in CORS_ORIGINS, or is on a private
 * address while this worker is itself on one.
 *
 * That last clause exists because a dev server's address is not stable: Expo moves to 8082 when
 * 8081 is busy and Vite walks upward the same way, and testing two players needs the LAN address
 * rather than loopback. A fixed list silently breaks the whole app the moment either shifts — the
 * browser drops the response and every call surfaces as "cannot reach the server", which points at
 * the network rather than at CORS. It is self-gating in the same shape as `localDevelopment` in the
 * capture bridge: a deployed worker answers on its own public https origin, where `isPrivateOrigin`
 * is false, so CORS_ORIGINS remains a strict exact-match allowlist in production. Both ends are
 * checked, so a public page can never talk its way into a developer's worker.
 */
function isAllowedOrigin(origin: string, request: Request, env: Env): boolean {
  const self = new URL(request.url).origin;
  if (origin === self) return true;
  if (env.CORS_ORIGINS.split(',').map(s => s.trim()).includes(origin)) return true;
  return isPrivateOrigin(origin) && isPrivateOrigin(self);
}
export function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers({ 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' });
  const origin = request.headers.get('origin');
  if (origin && isAllowedOrigin(origin, request, env)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    headers.set('Access-Control-Max-Age', '600');
  }
  return headers;
}
