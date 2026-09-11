import { describe, expect, it } from 'vitest';
import { applyReward, createProgression, dayKey, displayProfile, equipCosmetic, weekKey, type ProgressionState } from './progression';
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
});
