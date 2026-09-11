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

export async function request<T>(base: string, path: string, options: { token?: string | null; body?: unknown; method?: string } = {}): Promise<T> {
  if (!base) throw new Error('Connect to your VYRA server in Profile before starting.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
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
    if (error instanceof Error && error.name === 'AbortError') throw new Error('The server took too long to respond. Check your connection and try again.');
    throw new Error('Cannot reach your VYRA server. Check the address, Wi-Fi, and that the server is running.');
  } finally { clearTimeout(timer); }
}

export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
