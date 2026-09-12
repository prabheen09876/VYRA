import { describe, expect, it } from 'vitest';
import { CHARACTERS } from './characters';
import { COSMETICS } from './catalog';
import { applyReward, createProgression, dayKey, displayProfile, equipCosmetic, recordBodyCheckIn, resetEquipment, setupFitness, unequipCosmetic, weekKey, type ProgressionState } from './progression';
const date = (day: string) => Date.parse(`${day}T12:00:00+05:30`);
function award(state: ProgressionState, day: string, id: string, totalReps = 10, won = false) {
  return applyReward(state, { matchId: id, totalReps, won, finishedAt: date(day) });
}
describe('permanent account progression', () => {
  it('unlocks Developing and the first skin after a qualified first workout', () => {
    const { state, receipt } = award(createProgression('a', 'A'), '2026-09-07', 'one');
    expect(receipt.xp).toBe(110); expect(receipt.matchXp).toBe(100); expect(receipt.streakXp).toBe(10);
    expect(state.profile.stage).toBe('developing'); expect(receipt.unlocked).toEqual(['ion-skin']);
  });
  it('limits XP to the first three qualified daily matches and pays one streak bonus', () => {
    let state = createProgression('a', 'A'); const receipts = [];
    for (let i = 0; i < 4; i++) { const result = award(state, '2026-09-07', `${i}`); state = result.state; receipts.push(result.receipt); }
    expect(receipts.map(r => r.xp)).toEqual([110, 100, 100, 0]);
    expect(receipts[3].dailyLimitReached).toBe(true); expect(state.profile.activeDays).toBe(1); expect(state.profile.totalReps).toBe(40);
  });
  it('does not consume qualification capacity for a short match', () => {
    const short = award(createProgression('a', 'A'), '2026-09-07', 'short', 9, true);
    expect(short.receipt.qualified).toBe(false); expect(short.receipt.xp).toBe(0);
    expect(short.state.profile.wins).toBe(0); expect(short.state.profile.activeDays).toBe(0);
    expect(award(short.state, '2026-09-07', 'real').receipt.xp).toBe(110);
  });
  it('pays the weekly goal only once and caps streak bonuses at seven days', () => {
    let state = createProgression('a', 'A'); const receipts = [];
    for (let i = 7; i <= 14; i++) { const result = award(state, `2026-09-${String(i).padStart(2, '0')}`, `${i}`); state = result.state; receipts.push(result.receipt); }
    expect(receipts.map(r => r.streakXp)).toEqual([10, 20, 30, 40, 50, 60, 70, 70]);
    expect(receipts.map(r => r.goalXp)).toEqual([0, 0, 100, 0, 0, 0, 0, 0]);
  });
  it('handles delayed older-day settlements without resetting counters or duplicating bonuses', () => {
    let state = createProgression('a', 'A');
    state = award(state, '2026-09-07', 'monday').state;
    state = award(state, '2026-09-09', 'wednesday').state;
    const lateTuesday = award(state, '2026-09-08', 'late-tuesday'); state = lateTuesday.state;
    expect(state.profile.lastActiveDay).toBe('2026-09-09'); expect(state.profile.activeDays).toBe(3); expect(state.profile.streak).toBe(3);
    expect(lateTuesday.receipt.goalXp).toBe(100);
    const anotherTuesday = award(state, '2026-09-08', 'another-tuesday');
    expect(anotherTuesday.receipt.streakXp).toBe(0); expect(anotherTuesday.receipt.goalXp).toBe(0);
    expect(anotherTuesday.state.profile.activeDays).toBe(3);
  });
  it('uses Kolkata midnight and Monday week boundaries', () => {
    expect(dayKey(Date.parse('2026-09-07T18:29:59Z'))).toBe('2026-09-07');
    expect(dayKey(Date.parse('2026-09-07T18:30:00Z'))).toBe('2026-09-08');
    expect(weekKey(Date.parse('2026-09-06T18:30:00Z'))).toBe('2026-09-07');
  });
  it('keeps earned stages permanent while expired streaks and new weeks display correctly', () => {
    let state = createProgression('a', 'A');
    state = award(state, '2026-09-07', 'one').state;
    const profile = displayProfile(state, date('2026-09-21'));
    expect(profile.stage).toBe('developing'); expect(profile.streak).toBe(0); expect(profile.weeklyActiveDays).toBe(0);
    expect(award(state, '2026-09-21', 'two').state.profile.stage).toBe('developing');
  });
  it('requires ownership and matching slots without changing any combat stats', () => {
    let state = createProgression('a', 'A');
    expect(() => equipCosmetic(state, 'aura', 'nova-aura')).toThrow();
    state = award(state, '2026-09-07', 'one').state;
    const equipped = equipCosmetic(state, 'skin', 'ion-skin');
    expect(equipped.profile.equipped.skin).toBe('ion-skin'); expect(equipped.profile.xp).toBe(state.profile.xp);
    expect(() => equipCosmetic(state, 'outfit', 'ion-skin')).toThrow();
  });
  it('still unlocks earned rep and win cosmetics after the daily XP cap', () => {
    let state = createProgression('a', 'A');
    for (let index = 0; index < 4; index++) state = award(state, '2026-09-07', String(index), 20, true).state;
    expect(state.profile.ownedCosmetics).not.toContain('pulse-bracers');
    expect(state.profile.ownedCosmetics).not.toContain('champion-pose');
    const fifth = award(state, '2026-09-07', 'fifth', 20, true);
    expect(fifth.receipt).toMatchObject({ xp: 0, dailyLimitReached: true, unlocked: ['pulse-bracers', 'champion-pose'] });
    expect(fifth.state.profile).toMatchObject({ wins: 5, totalReps: 100, activeDays: 1 });
  });

  it.each(CHARACTERS)('removes effects and restores the original look for $name without resetting achievements', character => {
    let state = setupFitness(createProgression('a', 'A'), {
      goal: 'gain_weight', startingBuild: 'thin', weightKg: 55, targetWeightKg: 65,
      heightCm: 175, characterId: character.id,
    }, date('2026-09-06'));
    for (let index = 7; index <= 20; index++) state = award(state, `2026-09-${String(index).padStart(2, '0')}`, String(index), 50, index <= 11).state;
    state = recordBodyCheckIn(state, { weightKg: 65, heightCm: 175 }, date('2026-09-21'));
    expect(state.profile.stage).toBe('elite');
    expect(state.profile.ownedCosmetics).toEqual(expect.arrayContaining(COSMETICS.map(item => item.id)));
    for (const item of COSMETICS) state = equipCosmetic(state, item.slot, item.id);
    const before = structuredClone(state);
    const removed = unequipCosmetic(state, 'skin');
    expect(removed).toEqual({ ...before, profile: { ...before.profile, equipped: {
      outfit: 'origin-suit', accessory: 'pulse-bracers', pose: 'champion-pose', aura: 'nova-aura',
    } } });
    expect(unequipCosmetic(removed, 'skin')).toEqual(removed);
    const noOutfit = unequipCosmetic(removed, 'outfit');
    expect(noOutfit.profile.equipped.outfit).toBeUndefined();
    expect(resetEquipment(noOutfit)).toEqual({ ...before, profile: { ...before.profile, equipped: { outfit: 'origin-suit' } } });
    expect(state).toEqual(before);
  });

  it('validates removal slots and keeps locked items locked after resetting equipment', () => {
    const state = createProgression('a', 'A');
    expect(() => unequipCosmetic(state, '__proto__' as never)).toThrow(/slot/);
    expect(() => unequipCosmetic(state, 'xp' as never)).toThrow(/slot/);
    const reset = resetEquipment(unequipCosmetic(state, 'outfit'));
    expect(reset.profile.ownedCosmetics).toEqual(['origin-suit']);
    expect(() => equipCosmetic(reset, 'aura', 'nova-aura')).toThrow(/unlocked/);
    expect(reset).toEqual(state);
  });
});
