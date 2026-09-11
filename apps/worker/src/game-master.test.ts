import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMatch, type MatchState, type TrackingQuality } from '@vyra/core/match';
import { chooseNextRound } from './game-master';

function completedPair(): MatchState {
  const state = createMatch('match', 'ABC234', 'solo', { id: 'a', name: 'A' }, 0);
  const quality = (startedAt: number, duration: number): TrackingQuality => ({ startedAt, endsAt: startedAt + duration,
    firstAt: startedAt + 1000, lastAt: startedAt + duration - 1000, samples: duration / 1000 - 1, maxGap: 1000, lost: false });
  state.tracking.a = { squat: quality(5000, 20000), pushup: quality(37000, 25000) };
  state.snapshot.phase = 'recovery'; state.snapshot.round = 1;
  return state;
}
afterEach(() => vi.useRealTimers());
describe('bounded AI game master', () => {
  it('keeps Balanced without an AI call when disabled or tracking was unreliable', async () => {
    const ai = { run: vi.fn() };
    expect((await chooseNextRound(ai, false, completedPair())).template).toBe('balanced');
    expect((await chooseNextRound(undefined, true, completedPair())).template).toBe('balanced');
    const lost = completedPair(); lost.tracking.a.squat!.lost = true;
    expect((await chooseNextRound(ai, true, lost)).template).toBe('balanced');
    expect(ai.run).not.toHaveBeenCalled();
  });
  it('accepts only a validated supported AI decision when both phases had coverage', async () => {
    const ai = { run: vi.fn().mockResolvedValue({ response: '{"template":"recovery","reason":"A shorter pair matches the current pace."}' }) };
    expect(await chooseNextRound(ai, true, completedPair())).toEqual({ template: 'recovery', reason: 'A shorter pair matches the current pace.', source: 'ai' });
  });
  it('uses Balanced for malformed JSON, unsupported templates, or provider errors', async () => {
    for (const response of ['not json', '{"template":"marathon","reason":"Go"}', '{"template":"push","reason":""}']) {
      expect((await chooseNextRound({ run: vi.fn().mockResolvedValue({ response }) }, true, completedPair())).template).toBe('balanced');
    }
    expect((await chooseNextRound({ run: vi.fn().mockRejectedValue(new Error('offline')) }, true, completedPair())).template).toBe('balanced');
  });
  it('returns Balanced at the2.5-second deadline when inference never completes', async () => {
    vi.useFakeTimers();
    const pending = chooseNextRound({ run: vi.fn().mockReturnValue(new Promise(() => {})) }, true, completedPair());
    await vi.advanceTimersByTimeAsync(2500);
    expect((await pending).template).toBe('balanced');
  });
});
