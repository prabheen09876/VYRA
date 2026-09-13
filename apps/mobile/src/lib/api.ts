export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function normalizeApiUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) throw new Error('Enter your VYRA server address to connect.');
  let parsed: URL;
  try { parsed = new URL(trimmed); } catch { throw new Error('Use a complete server address, beginning with https:// or http://.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Use an HTTP or HTTPS server address without a password, query, or fragment.');
  }
  return parsed.toString().replace(/\/+$/, '');
}

/** Hosts that can only ever mean "the machine asking": loopback, the private IPv4 ranges a laptop
 *  gets on a home or office network, link-local, and mDNS `.local` names. Deliberately the same
 *  notion of "local" the worker uses to decide CORS in apps/worker/src/http.ts. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
export function isLocalHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (LOOPBACK_HOSTS.has(host) || host.endsWith('.local')) return true;
  const parts = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!parts) return false;
  const [a, b] = [Number(parts[1]), Number(parts[2])];
  if (parts.slice(1).some(part => Number(part) > 255)) return false;
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

/**
 * Where a web build looks for the worker when EXPO_PUBLIC_API_URL is not set.
 *
 * Follows the host that served the page instead of hardcoding `localhost`. `localhost` is
 * machine-relative: a second laptop opening the app from this one resolves it to *itself*, so the
 * two players silently end up on two different workers — two separate matchmaking queues, both
 * reporting "searching", never pairing, and never erroring either. Deriving the host keeps every
 * device that can load the app pointed at the one worker that served it.
 *
 * The dev port is appended only for a local host, because that is the only arrangement where the
 * bundle and the API come from different ports (Expo/Vite on one, `wrangler dev` on 8787). A
 * deployed build is served by the worker itself through its `assets` binding, so there the API is
 * the page's own origin.
 */
export function defaultApiUrl(location: { protocol: string; hostname: string; origin: string } | null, devPort = '8787'): string {
  if (!location?.hostname) return '';
  if (!isLocalHostname(location.hostname)) return location.origin.replace(/\/+$/, '');
  return location.protocol + '//' + location.hostname + ':' + devPort;
}

interface SessionAddress {
  apiUrl: string;
  token: string | null;
  name: string;
  identities: Record<string, { token: string; name: string }>;
}

/**
 * How a saved session reconciles with a configured EXPO_PUBLIC_API_URL at launch.
 *
 * A configured address is a pin, not a default: the build was made for that server, so an address
 * saved by an earlier run must not quietly outrank it. Without this, a device that once connected to
 * `http://localhost:8787` keeps going there after the build is repointed at a LAN address — the app
 * looks configured while talking to a different worker, which for matchmaking means a queue the
 * other player is not in, with no error anywhere to show for it.
 *
 * Returns null when nothing needs to change, so the no-pin case (and the already-correct case) is
 * untouched and keeps whatever the device chose in Profile. A token is only meaningful to the server
 * that issued it, so adopting a new address carries over the identity saved for that address if
 * there is one and otherwise starts unauthenticated rather than sending a foreign token.
 */
export function adoptConfiguredApiUrl(saved: SessionAddress, configuredUrl: string): Pick<SessionAddress, 'apiUrl' | 'token' | 'name'> | null {
  if (!configuredUrl || saved.apiUrl === configuredUrl) return null;
  const known = saved.identities[configuredUrl];
  return { apiUrl: configuredUrl, token: known?.token ?? null, name: known?.name ?? saved.name };
}

export async function request<T>(base: string, path: string, options: { token?: string | null; body?: unknown; method?: string; signal?: AbortSignal } = {}): Promise<T> {
  if (!base) throw new Error('Connect to your VYRA server in Profile before starting.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  // The caller's signal rides alongside the timeout, so work the user has called off stops now
  // rather than running to completion invisibly and landing on the server 11 seconds later.
  const relay = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener('abort', relay, { once: true });
  try {
    const response = await fetch(base + path, {
      method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: 'Bearer ' + options.token } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: controller.signal,
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const result = data as { message?: string; error?: string | { message?: string } } | null;
      const detail = result?.message ?? (typeof result?.error === 'string' ? result.error : result?.error?.message);
      throw new ApiError(detail || 'The server could not complete that request. Please try again.', response.status);
    }
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(options.signal?.aborted
        ? 'That request was cancelled.'
        : 'The server took too long to respond. Check your connection and try again.');
    }
    throw new Error('Cannot reach your VYRA server. Check the address, Wi-Fi, and that the server is running.');
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', relay); }
}

export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
