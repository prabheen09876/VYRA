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
export function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers({ 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' });
  const origin = request.headers.get('origin');
  if (origin && (origin === new URL(request.url).origin || env.CORS_ORIGINS.split(',').map(s => s.trim()).includes(origin))) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    headers.set('Access-Control-Max-Age', '600');
  }
  return headers;
}
