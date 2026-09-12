import { describe, expect, it } from 'vitest';
import { createQueue, enterQueue, leaveQueue } from './matchmaking';

const entry = (playerId: string, queuedAt = 0) => ({ playerId, name: playerId.toUpperCase(), queuedAt });

describe('matchmaking queue', () => {
  it('waits alone until a different player arrives', () => {
    const state = createQueue();
    expect(enterQueue(state, entry('a'))).toEqual({ outcome: 'searching' });
    expect(state.waiting).toHaveLength(1);
  });
  it('matches the next different waiting player and removes both from the queue', () => {
    const state = createQueue();
    enterQueue(state, entry('a'));
    const result = enterQueue(state, entry('b'));
    expect(result).toEqual({ outcome: 'matched', opponent: entry('a') });
    expect(state.waiting).toHaveLength(0);
  });
  it('never matches a player with themselves', () => {
    const state = createQueue();
    enterQueue(state, entry('a'));
    expect(enterQueue(state, entry('a'))).toEqual({ outcome: 'searching' });
    expect(state.waiting).toHaveLength(1);
  });
  it('entering twice while still waiting is idempotent, not a duplicate entry', () => {
    const state = createQueue();
    enterQueue(state, entry('a'));
    enterQueue(state, entry('a'));
    enterQueue(state, entry('a'));
    expect(state.waiting).toHaveLength(1);
    expect(enterQueue(state, entry('b'))).toEqual({ outcome: 'matched', opponent: entry('a') });
    expect(state.waiting).toHaveLength(0);
  });
  it('cancelling removes a waiting player; cancelling twice is a harmless no-op', () => {
    const state = createQueue();
    enterQueue(state, entry('a'));
    expect(leaveQueue(state, 'a')).toBe(true);
    expect(state.waiting).toHaveLength(0);
    expect(leaveQueue(state, 'a')).toBe(false);
  });
  it('disconnecting while searching is the same as cancelling: the slot is not left orphaned', () => {
    const state = createQueue();
    enterQueue(state, entry('a'));
    leaveQueue(state, 'a'); // simulates webSocketClose cleanup
    expect(enterQueue(state, entry('b'))).toEqual({ outcome: 'searching' });
    expect(state.waiting).toHaveLength(1);
  });
  it('pairs the first two of several simultaneous entrants and leaves the rest waiting', () => {
    const state = createQueue();
    expect(enterQueue(state, entry('a'))).toEqual({ outcome: 'searching' });
    expect(enterQueue(state, entry('b'))).toEqual({ outcome: 'matched', opponent: entry('a') });
    expect(enterQueue(state, entry('c'))).toEqual({ outcome: 'searching' });
    expect(enterQueue(state, entry('d'))).toEqual({ outcome: 'matched', opponent: entry('c') });
    expect(state.waiting).toHaveLength(0);
  });
  it('re-entering pairs with a waiting opponent instead of stalling on a leftover self-entry', () => {
    // The deadlock this guards: a queue row can outlive its socket, because nothing delivers
    // webSocketClose when a dev server reloads or a laptop sleeps. Returning `searching` on the
    // strength of that row skipped the opponent scan entirely, so with one stale row each, two
    // players sat in the same queue seeing each other and neither was ever matched.
    const state = { waiting: [entry('a', 1), entry('b', 2)] };
    expect(enterQueue(state, entry('a', 3))).toEqual({ outcome: 'matched', opponent: entry('b', 2) });
    expect(state.waiting).toHaveLength(0);
  });
  it('re-entering refreshes the entry rather than keeping the stale one', () => {
    const state = createQueue();
    enterQueue(state, entry('a', 1));
    enterQueue(state, entry('a', 9));
    expect(state.waiting).toEqual([entry('a', 9)]);
  });
  it('a fresh queue entry after being matched is a new, independent search', () => {
    const state = createQueue();
    enterQueue(state, entry('a'));
    enterQueue(state, entry('b')); // a+b matched and removed
    expect(enterQueue(state, entry('a'))).toEqual({ outcome: 'searching' });
    expect(state.waiting).toHaveLength(1);
  });
});
