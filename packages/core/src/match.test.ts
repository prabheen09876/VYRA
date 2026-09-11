import { describe, expect, it } from 'vitest';
import { advanceMatch, createMatch, damageFor, fallbackDecision, guardFor, hasReliableTracking, interruptMatch, joinMatch, missingHeartbeat, readyPlayer, recordRep, recordTracking, validateDecision, type MatchState } from './match';
import type { Phase } from './contracts';

const host = { id: 'a', name: 'A' }, guest = { id: 'b', name: 'B' };
function start(mode: 'pvp' | 'solo' = 'pvp'): MatchState {
  const state = createMatch('match', 'ABC234', mode, host, 0);
  if (mode === 'pvp') joinMatch(state, guest, 0);
  readyPlayer(state, 'a', 0);
  if (mode === 'pvp') readyPlayer(state, 'b', 0);
  return state;
}
function phase(state: MatchState, target: Phase): void {
  for (let steps = 0; state.snapshot.phase !== target && steps < 30; steps++) advanceMatch(state, state.snapshot.phaseEndsAt);
  expect(state.snapshot.phase).toBe(target);
}
function reps(state: MatchState, player: string, count: number): void {
  for (let n = 0; n < count; n++) {
    const occurredAt = state.snapshot.phaseStartedAt + 1000 * (n + 1);
    expect(recordRep(state, player, { phaseId: state.snapshot.phaseId, seq: (state.sequence[player] ?? 0) + 1,
      exercise: state.snapshot.phase as 'squat' | 'pushup', occurredAt, confidence: 0.9, modelVersion: 'test-mlp' }, occurredAt).accepted).toBe(true);
  }
}
describe('shared match engine', () => {
  it('makes squats meaningful and resolves both attacks together', () => {
    const state = start(); phase(state, 'squat'); reps(state, 'a', 6); reps(state, 'b', 2);
    expect(state.snapshot.players.map(p => p.guard)).toEqual([0.30000000000000004, 0.1]);
    phase(state, 'pushup'); reps(state, 'a', 5); reps(state, 'b', 6);
    expect(state.snapshot.players.map(p => p.hp)).toEqual([100, 100]);
    phase(state, 'recovery'); expect(state.snapshot.players.map(p => p.hp)).toEqual([66, 64]);
    expect(state.snapshot.players.every(p => p.guard === 0)).toBe(true);
  });
  it('produces identical combat for reversed player arrival order', () => {
    const states = [start(), start()];
    for (let i = 0; i < states.length; i++) {
      const state = states[i]; phase(state, 'squat');
      for (const player of i ? ['b', 'a'] : ['a', 'b']) reps(state, player, player === 'a' ? 6 : 2);
      phase(state, 'pushup');
      for (const player of i ? ['b', 'a'] : ['a', 'b']) reps(state, player, player === 'a' ? 5 : 6);
      phase(state, 'recovery');
    }
    expect(states[0].snapshot.players).toEqual(states[1].snapshot.players);
  });
  it('caps guard, preserves chip damage, and draws simultaneous knockouts', () => {
    expect(guardFor(100)).toBe(0.4); expect(damageFor(1, 1)).toBe(5);
    const state = start(); phase(state, 'pushup');
    state.snapshot.players.forEach(p => { p.hp = 8; }); reps(state, 'a', 1); reps(state, 'b', 1);
    phase(state, 'finished'); expect(state.snapshot.winnerId).toBeNull(); expect(state.snapshot.reason).toBe('draw');
  });
  it('finishes even the longest three-pair match in 236 seconds', () => {
    const state = start();
    for (let step = 0; state.snapshot.phase !== 'finished' && step < 30; step++) {
      state.nextDecision = { template: 'push', reason: 'Test', source: 'fallback' };
      advanceMatch(state, state.snapshot.phaseEndsAt);
    }
    expect(state.snapshot.round).toBe(3); expect(state.finishedAt).toBe(236000); expect(state.snapshot.winnerId).toBeNull();
  });
  it('rejects duplicates, stale phases, low confidence, future and implausibly fast reps', () => {
    const state = start(); phase(state, 'squat');
    const base = { phaseId: state.snapshot.phaseId, seq: 1, exercise: 'squat' as const, occurredAt: 6000, confidence: 0.9, modelVersion: 'trained' };
    expect(recordRep(state, 'a', base, 6000).accepted).toBe(true);
    expect(recordRep(state, 'a', base, 6001).code).toBe('DUPLICATE_REP');
    expect(recordRep(state, 'a', { ...base, seq: 2, occurredAt: 6100 }, 6100).code).toBe('REP_TOO_FAST');
    expect(recordRep(state, 'a', { ...base, seq: 2, confidence: 0.2 }, 7000).code).toBe('UNVERIFIED_REP');
    expect(recordRep(state, 'a', { ...base, seq: 2, occurredAt: 10000 }, 7000).code).toBe('LATE_REP');
    expect(recordRep(state, 'a', { ...base, seq: 2, phaseId: 'old' }, 7000).code).toBe('WRONG_PHASE');
    expect(state.snapshot.players[0].totalReps).toBe(1);
  });
  it('allows bounded final-frame delivery during settlement but never after it', () => {
    const state = start(); phase(state, 'pushup');
    const window = state.exerciseWindow!; advanceMatch(state, window.endsAt);
    const event = { phaseId: window.id, seq: 1, exercise: 'pushup' as const, occurredAt: window.endsAt - 100, confidence: 1, modelVersion: 'trained' };
    expect(recordRep(state, 'a', event, window.endsAt + 100).accepted).toBe(true);
    advanceMatch(state, state.snapshot.phaseEndsAt);
    expect(recordRep(state, 'b', event, window.endsAt + 2001).accepted).toBe(false);
  });
  it('commits bot performance before observing live human effort', () => {
    const state = start('solo'); phase(state, 'squat'); const targets = { ...state.botTargets };
    reps(state, 'a', 10); expect(state.botTargets).toEqual(targets);
    advanceMatch(state, state.snapshot.phaseEndsAt);
    expect(state.snapshot.players[1].squats).toBe(targets.squat);
  });
  it('interrupts without winners/rewards and rejects post-stop reps', () => {
    const state = start(); phase(state, 'squat'); reps(state, 'a', 1);
    expect(missingHeartbeat(state, 13000)).toBe(true);
    interruptMatch(state, 'background', 13000); expect(state.snapshot.phase).toBe('interrupted');
    expect(state.snapshot.winnerId).toBeNull(); expect(state.snapshot.rewards).toBeUndefined();
    expect(() => readyPlayer(state, 'a', 14000)).toThrow(/new match/);
  });
  it('allows only bounded AI templates and short reasons', () => {
    expect(validateDecision({ template: 'marathon', reason: 'Go' })).toBeNull();
    expect(validateDecision({ template: 'push', reason: '' })).toBeNull();
    expect(validateDecision({ template: 'recovery', reason: 'Take a shorter pair.' })).toEqual({ template: 'recovery', reason: 'Take a shorter pair.', source: 'ai' });
  });
  it('requires tracking coverage for both players and phases, and remembers brief visibility loss', () => {
    const state = start(); phase(state, 'squat');
    expect(hasReliableTracking(state)).toBe(false);
    const trackPhase = () => {
      for (let at = state.snapshot.phaseStartedAt + 1000; at < state.snapshot.phaseEndsAt; at += 1000) {
        for (const id of ['a', 'b']) expect(recordTracking(state, id, state.snapshot.phaseId, true, 0.9, at)).toBe(true);
      }
    };
    trackPhase(); phase(state, 'pushup'); trackPhase();
    expect(hasReliableTracking(state)).toBe(true);
    expect(recordTracking(state, 'a', state.snapshot.phaseId, false, 0.1, state.snapshot.phaseEndsAt - 900)).toBe(true);
    expect(hasReliableTracking(state)).toBe(false);
    expect(fallbackDecision(state).template).toBe('balanced');
    expect(recordTracking(state, 'a', 'stale', true, 0.9, state.snapshot.phaseEndsAt - 500)).toBe(false);
  });
  it('allows initial camera calibration without hiding later tracking loss', () => {
    const state = start();
    for (const exercise of ['squat', 'pushup'] as const) {
      phase(state, exercise);
      for (const id of ['a', 'b']) {
        expect(recordTracking(state, id, state.snapshot.phaseId, false, 0, state.snapshot.phaseStartedAt)).toBe(true);
        expect(recordTracking(state, id, state.snapshot.phaseId, false, 0.2, state.snapshot.phaseStartedAt + 900)).toBe(true);
        expect(state.tracking[id][exercise]!.lost).toBe(false);
        expect(state.tracking[id][exercise]!.samples).toBe(0);
      }
      for (let at = state.snapshot.phaseStartedAt + 1000; at < state.snapshot.phaseEndsAt; at += 1000) {
        for (const id of ['a', 'b']) recordTracking(state, id, state.snapshot.phaseId, true, 0.9, at);
      }
    }
    expect(hasReliableTracking(state)).toBe(true);
    recordTracking(state, 'b', state.snapshot.phaseId, false, 0, state.snapshot.phaseEndsAt - 900);
    expect(hasReliableTracking(state)).toBe(false);
  });
});
