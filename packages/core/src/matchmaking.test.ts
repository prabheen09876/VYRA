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
  it('a fresh queue entry after being matched is a new, independent search', () => {
    const state = createQueue();
    enterQueue(state, entry('a'));
    enterQueue(state, entry('b')); // a+b matched and removed
    expect(enterQueue(state, entry('a'))).toEqual({ outcome: 'searching' });
    expect(state.waiting).toHaveLength(1);
  });
});
