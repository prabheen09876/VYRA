import { describe, expect, it } from 'vitest';
import { clientKey, enforceLimit, MessageBudget, SocketBudgets } from './rate-limit';

/** A stand-in for a Cloudflare rate-limiting binding that records the keys it was asked about. */
function fakeLimiter(succeed: boolean) {
  const keys: string[] = [];
  return { keys, limit: async ({ key }: { key: string }) => { keys.push(key); return { success: succeed }; } };
}

describe('clientKey', () => {
  it('keys on the edge-supplied client address', () => {
    const request = new Request('https://worker.test/api/x', { headers: { 'cf-connecting-ip': '203.0.113.7' } });
    expect(clientKey(request)).toBe('203.0.113.7');
  });
  it('falls back to a single shared bucket only when the edge header is absent', () => {
    expect(clientKey(new Request('https://worker.test/api/x'))).toBe('local');
  });
  it('ignores client-supplied forwarding headers, which are trivially spoofed', () => {
    // A caller that could pick its own rate-limit key would have no rate limit at all.
    const request = new Request('https://worker.test/api/x', {
      headers: { 'x-forwarded-for': '198.51.100.9', 'x-real-ip': '198.51.100.9' },
    });
    expect(clientKey(request)).toBe('local');
  });
});

describe('enforceLimit', () => {
  it('passes the key through to the binding untouched', async () => {
    const limiter = fakeLimiter(true);
    await enforceLimit(limiter, 'player-1', 'RATE_LIMITED', 'Slow down.');
    expect(limiter.keys).toEqual(['player-1']);
  });
  it('resolves silently while the caller is under its allowance', async () => {
    await expect(enforceLimit(fakeLimiter(true), 'k', 'RATE_LIMITED', 'Slow down.')).resolves.toBeUndefined();
  });
  it('throws a 429 carrying the caller-facing message once the allowance is spent', async () => {
    await expect(enforceLimit(fakeLimiter(false), 'k', 'RATE_LIMITED', 'Slow down.'))
      .rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED', message: 'Slow down.' });
  });
});

describe('MessageBudget', () => {
  it('allows a full burst and then refuses', () => {
    const budget = new MessageBudget(3, 1, 1000);
    expect([budget.take(1000), budget.take(1000), budget.take(1000)]).toEqual([true, true, true]);
    expect(budget.take(1000)).toBe(false);
  });
  it('refills at the configured rate', () => {
    const budget = new MessageBudget(2, 4, 0);
    budget.take(0); budget.take(0);
    expect(budget.take(0)).toBe(false);
    expect(budget.take(249)).toBe(false); // 4/s means one token per 250ms.
    expect(budget.take(250)).toBe(true);
  });
  it('never refills past its capacity, so idling does not bank an unlimited burst', () => {
    const budget = new MessageBudget(3, 10, 0);
    // An hour of silence must still only buy three messages back.
    expect([budget.take(3_600_000), budget.take(3_600_000), budget.take(3_600_000)]).toEqual([true, true, true]);
    expect(budget.take(3_600_000)).toBe(false);
  });
  it('treats a clock that steps backwards as no elapsed time, not as a refill', () => {
    // Date.now() is not monotonic. A negative elapsed would otherwise subtract tokens and leave a
    // deficit that no amount of waiting repays, permanently muting an honest socket.
    const budget = new MessageBudget(2, 1, 10_000);
    budget.take(10_000); budget.take(10_000);
    expect(budget.take(5_000)).toBe(false);
    expect(budget.take(11_000)).toBe(true);
  });
  it('only asks for a disconnect after a sustained flood, not a single overrun', () => {
    const budget = new MessageBudget(1, 0, 0);
    budget.take(0);
    for (let i = 0; i < 99; i++) expect(budget.take(0)).toBe(false);
    expect(budget.shouldDisconnect()).toBe(false);
    expect(budget.take(0)).toBe(false);
    expect(budget.shouldDisconnect()).toBe(true);
  });
  it('forgives a client that backs off, counting only consecutive refusals', () => {
    const budget = new MessageBudget(1, 1, 0);
    budget.take(0);
    for (let i = 0; i < 50; i++) budget.take(0);
    expect(budget.take(1000)).toBe(true); // Waited for a token: the streak resets.
    for (let i = 0; i < 99; i++) budget.take(1000);
    expect(budget.shouldDisconnect()).toBe(false);
  });
});

describe('SocketBudgets', () => {
  // Only object identity matters here, so a bare object stands in for a WebSocket.
  const socket = () => ({}) as unknown as WebSocket;
  it('gives one socket a single budget across messages', () => {
    const budgets = new SocketBudgets(2, 0);
    const one = socket();
    expect(budgets.for(one, 0).take(0)).toBe(true);
    expect(budgets.for(one, 0).take(0)).toBe(true);
    expect(budgets.for(one, 0).take(0)).toBe(false);
  });
  it('keeps sockets independent, so one flooder cannot mute its opponent', () => {
    const budgets = new SocketBudgets(1, 0);
    const flooder = socket(), opponent = socket();
    expect(budgets.for(flooder, 0).take(0)).toBe(true);
    expect(budgets.for(flooder, 0).take(0)).toBe(false);
    expect(budgets.for(opponent, 0).take(0)).toBe(true);
  });
});
