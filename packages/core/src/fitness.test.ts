import { describe, expect, it } from 'vitest';
import type { FitnessSetupInput } from './contracts';
import { FITNESS_STAGES, fitnessProgress, validateBodyCheckIn, validateFitnessSetup } from './fitness';
import { applyReward, createProgression, recordBodyCheckIn, selectCharacter, setupFitness, type ProgressionState } from './progression';

const start = Date.parse('2026-08-01T10:00:00+05:30');
const day = (offset: number) => start + offset * 86400000;
const setup: FitnessSetupInput = { goal: 'gain_weight', startingBuild: 'thin', heightCm: 175, weightKg: 50, targetWeightKg: 60, characterId: 'mikasa' };
const create = (input: Partial<FitnessSetupInput> = {}) => setupFitness(createProgression('fitness-test', 'Fitness QA'), { ...setup, ...input }, start);
const report = (state: ProgressionState, weightKg: number, offset = 1) => recordBodyCheckIn(state, { weightKg, heightCm: 175 }, day(offset));
function train(state: ProgressionState, offset: number, totalReps = 50) {
  return applyReward(state, { matchId: `workout-${offset}`, totalReps, won: false, finishedAt: day(offset) });
}

describe('personal fitness journey', () => {
  it('starts a thin beginner at Starter with their chosen character and immutable baseline', () => {
    const state = create();
    expect(state.profile.stage).toBe('starter');
    expect(state.profile.characterId).toBe('mikasa');
    expect(state.profile.fitness).toEqual({ goal: 'gain_weight', startingBuild: 'thin', startedAt: start, startHeightCm: 175, startWeightKg: 50, targetWeightKg: 60, checkIns: [] });
    expect(fitnessProgress(state.profile)).toMatchObject({ weightProgress: 0, hasFollowUp: false });
    expect(FITNESS_STAGES.map(stage => stage.id)).toEqual(['starter', 'developing', 'strong', 'elite']);
  });

  it('requires workout days, XP and body progress, ending at Elite', () => {
    let state = create();
    for (let offset = 1; offset <= 14; offset++) state = train(state, offset).state;
    expect(state.profile.xp).toBeGreaterThan(3000);
    expect(state.profile.stage).toBe('starter');
    state = report(state, 52.4, 15);
    expect(state.profile.stage).toBe('starter');
    state = report(state, 52.5, 16);
    expect(state.profile.stage).toBe('developing');
    state = report(state, 56, 17);
    expect(state.profile.stage).toBe('strong');
    state = report(state, 60, 18);
    expect(state.profile.stage).toBe('elite');
    expect(state.profile.ownedCosmetics).toContain('nova-aura');
    for (let offset = 19; offset <= 50; offset++) state = train(state, offset).state;
    expect(state.profile.stage).toBe('elite');
    expect(fitnessProgress(state.profile).nextStage).toBeNull();
  });

  it('does not award stages or XP just for hitting the target weight', () => {
    const measured = report(create(), 60);
    expect(measured.profile.stage).toBe('starter');
    expect(measured.profile.xp).toBe(0);
    expect(measured.profile.activeDays).toBe(0);
    const workout = train(measured, 2, 1000);
    expect(workout.state.profile.xp).toBeGreaterThan(3000);
    expect(workout.state.profile.stage).toBe('developing');
    expect(workout.receipt).toMatchObject({ stageBefore: 'starter', stageAfter: 'developing' });
    let state = workout.state;
    for (let offset = 3; offset <= 6; offset++) state = train(state, offset).state;
    expect(state.profile.activeDays).toBe(5);
    expect(state.profile.stage).toBe('strong');
  });

  it('includes the Elite cosmetic in the real workout reward receipt when workouts finish the gates', () => {
    let state = report(create(), 60);
    for (let offset = 2; offset <= 14; offset++) state = train(state, offset).state;
    const final = train(state, 15);
    expect(final.state.profile.stage).toBe('elite');
    expect(final.receipt.unlocked).toContain('nova-aura');
  });

  it('measures weight change in the chosen direction and clamps overshoot', () => {
    const gain = create();
    expect(fitnessProgress(report(gain, 45).profile).weightProgress).toBe(0);
    expect(fitnessProgress(report(gain, 65).profile).weightProgress).toBe(1);
    const lose = create({ goal: 'lose_weight', weightKg: 80, targetWeightKg: 70 });
    expect(fitnessProgress(report(lose, 77.5).profile).weightProgress).toBe(0.25);
    expect(fitnessProgress(report(lose, 85).profile).weightProgress).toBe(0);
    expect(fitnessProgress(report(lose, 65).profile).weightProgress).toBe(1);
  });

  it('requires a follow-up in the maintenance range for the strength goal', () => {
    let state = train(create({ goal: 'maintain_weight', weightKg: 60, targetWeightKg: 60 }), 0).state;
    expect(state.profile.stage).toBe('starter');
    state = report(state, 62);
    expect(state.profile.stage).toBe('starter');
    state = report(state, 61.2, 2);
    expect(state.profile.stage).toBe('developing');
  });

  it('keeps earned stages through fluctuations and missed check-ins without changing workout stats', () => {
    let state = train(create(), 0).state;
    state = report(state, 52.5);
    const xp = state.profile.xp;
    state = report(state, 49, 2);
    expect(state.profile.stage).toBe('developing');
    expect(state.profile.xp).toBe(xp);
    expect(state.profile.activeDays).toBe(1);
    expect(fitnessProgress(state.profile, day(9)).checkInDue).toBe(true);
    expect(fitnessProgress(state.profile, day(8)).checkInDue).toBe(false);
  });

  it('uses server calendar days, rejects baseline-day follow-ups and replaces corrections', () => {
    const beforeMidnight = Date.parse('2026-08-01T18:29:59Z');
    const state = setupFitness(createProgression('a', 'A'), setup, beforeMidnight);
    expect(() => recordBodyCheckIn(state, { weightKg: 51, heightCm: 176 }, beforeMidnight + 500)).toThrow(/tomorrow/);
    const afterMidnight = recordBodyCheckIn(state, { weightKg: 51, heightCm: 176 }, beforeMidnight + 1000);
    const corrected = recordBodyCheckIn(afterMidnight, { weightKg: 50.5, heightCm: 175 }, beforeMidnight + 2000);
    expect(corrected.profile.fitness!.checkIns).toEqual([{ day: '2026-08-02', at: beforeMidnight + 2000, weightKg: 50.5, heightCm: 175 }]);
    expect(corrected.profile.fitness!.startWeightKg).toBe(50);
    expect(state.profile.fitness!.checkIns).toEqual([]);
    expect(() => recordBodyCheckIn(corrected, { weightKg: 51, heightCm: 175 }, beforeMidnight + 1000)).toThrow(/newer/);
  });

  it('caps history while retaining the original baseline for goal progress', () => {
    let state = create();
    for (let offset = 1; offset <= 100; offset++) state = report(state, 55, offset);
    expect(state.profile.fitness!.checkIns).toHaveLength(90);
    expect(state.profile.fitness!.startWeightKg).toBe(50);
    expect(fitnessProgress(state.profile).weightProgress).toBe(0.5);
  });

  it('does not reset prior achievements when setting up or switching characters', () => {
    const old = createProgression('returning', 'Returning');
    old.profile.xp = 9000; old.profile.stage = 'legendary'; old.profile.activeDays = 30;
    old.profile.ownedCosmetics.push('ion-skin'); old.profile.equipped.skin = 'ion-skin';
    const upgraded = setupFitness(old, setup, start);
    expect(upgraded.profile).toMatchObject({ xp: 9000, activeDays: 30, stage: 'elite' });
    const changed = selectCharacter(upgraded, 'sakura');
    expect(changed.profile).toEqual({ ...upgraded.profile, characterId: 'sakura' });
    expect(() => setupFitness(changed, setup, start)).toThrow(/already/);
    expect(() => report(createProgression('a', 'A'), 55)).toThrow(/Set up/);
  });

  it.each([
    { weightKg: NaN }, { heightCm: Infinity }, { targetWeightKg: Infinity }, { weightKg: '50' },
    { weightKg: 0 }, { heightCm: 99 }, { targetWeightKg: 351 },
    { goal: 'invalid' }, { startingBuild: 'invalid' }, { characterId: 'missing' },
    { targetWeightKg: 45 }, { goal: 'lose_weight', targetWeightKg: 60 },
    { goal: 'maintain_weight', targetWeightKg: 60 },
  ])('rejects invalid setup %j', patch => {
    expect(() => validateFitnessSetup({ ...setup, ...patch } as FitnessSetupInput)).toThrow();
  });

  it('validates measurements and dates independently on every update', () => {
    expect(() => validateBodyCheckIn({ weightKg: 50, heightCm: 0 })).toThrow();
    expect(() => recordBodyCheckIn(create(), { weightKg: -1, heightCm: 175 }, day(1))).toThrow();
    expect(() => setupFitness(createProgression('a', 'A'), setup, NaN)).toThrow(/time/);
    expect(() => recordBodyCheckIn(create(), { weightKg: 55, heightCm: 175 }, Infinity)).toThrow(/time/);
    expect(() => selectCharacter(create(), 'unknown' as never)).toThrow(/character/);
  });
});
