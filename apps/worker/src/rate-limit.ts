import { HttpError } from './http';

/**
 * Two limiters, because the two things being protected have different identities.
 *
 * HTTP requests are limited by Cloudflare's rate-limiting bindings (see `ratelimits` in both
 * wrangler configs). They are distributed, cost nothing to keep, and — crucially — do not allocate
 * per-key state that an attacker can grow. A Durable Object keyed by client IP would have been the
 * obvious alternative and is the wrong answer here: instantiating one DO per source address turns
 * the rate limiter itself into the amplifier, which is exactly the failure it exists to prevent.
 *
 * WebSocket messages cannot use those bindings: once the socket is open there is no further
 * request to meter, and a connected player can otherwise push messages as fast as the socket
 * drains. Each one costs a SQLite write plus a broadcast to every peer in the room, so the
 * amplification is real. They get the in-memory token bucket below instead, held per socket by the
 * Durable Object that owns it. Hibernation clears those buckets, which is harmless: a socket
 * quiet enough to hibernate is by definition not flooding, and a flood keeps the DO awake.
 */

/** The shape of a Cloudflare rate-limiting binding, narrowed to what this worker calls. */
export interface RateLimiterBinding { limit(options: { key: string }): Promise<{ success: boolean }> }

/**
 * The key an IP-scoped limiter should use. `cf-connecting-ip` is set by the edge and cannot be
 * spoofed by the client; `wrangler dev` sets it too. The `local` fallback only applies where the
 * header is genuinely absent, which off the edge means a direct connection to a dev server — one
 * shared bucket there is an acceptable dev-time approximation, not a production path.
 */
export function clientKey(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? 'local';
}

/** Consumes one token, or throws 429. The message is player-facing, so it says what to do next. */
export async function enforceLimit(limiter: RateLimiterBinding, key: string, code: string, message: string): Promise<void> {
  const { success } = await limiter.limit({ key });
  if (!success) throw new HttpError(429, code, message);
}

/**
 * A token bucket for one WebSocket. `capacity` is the burst a well-behaved client may spend at
 * once and `refillPerSecond` its sustained rate; both are sized in the Durable Objects that own
 * the sockets, against the real message cadence of the protocol.
 *
 * `overLimit` counts consecutive refusals rather than total ones, so an ordinary client that
 * briefly bursts past its allowance is throttled and then forgiven, while a client that keeps
 * pushing after being refused trips `shouldDisconnect()`. Without that second stage a flooder is
 * merely ignored, and ignoring it still costs a parse and a scheduler slot for every message.
 */
export class MessageBudget {
  private tokens: number;
  private updatedAt: number;
  private refusals = 0;
  constructor(private capacity: number, private refillPerSecond: number, now: number) {
    this.tokens = capacity;
    this.updatedAt = now;
  }
  /** True when this message may be handled. False means drop it. */
  take(now: number): boolean {
    // Clamp elapsed at zero: Date.now() can step backwards, and a negative refill would hand out
    // a permanent deficit that no amount of waiting repays.
    const elapsed = Math.max(0, now - this.updatedAt);
    this.tokens = Math.min(this.capacity, this.tokens + (elapsed / 1000) * this.refillPerSecond);
    this.updatedAt = now;
    if (this.tokens < 1) { this.refusals++; return false; }
    this.tokens -= 1;
    this.refusals = 0;
    return true;
  }
  /** True once a client has ignored enough refusals that the socket is worth closing. */
  shouldDisconnect(): boolean { return this.refusals >= 100; }
}

/**
 * Per-socket budgets, keyed by the socket object itself. A `WeakMap` is what keeps this from
 * leaking: the Durable Object never learns about every socket that goes away (an abrupt drop
 * delivers no `webSocketClose`), so a `Map` would retain an entry per connection for the lifetime
 * of the instance.
 */
export class SocketBudgets {
  private budgets = new WeakMap<WebSocket, MessageBudget>();
  constructor(private capacity: number, private refillPerSecond: number) {}
  for(socket: WebSocket, now: number): MessageBudget {
    let budget = this.budgets.get(socket);
    if (!budget) { budget = new MessageBudget(this.capacity, this.refillPerSecond, now); this.budgets.set(socket, budget); }
    return budget;
  }
}
