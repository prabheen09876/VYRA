import { COSMETICS, STAGES, stageFor } from './catalog';
import { DEFAULT_CHARACTER_ID, isCharacterId, type CharacterId } from './characters';
import { advanceFitnessStage, MAX_CHECK_INS, validateBodyCheckIn, validateFitnessSetup } from './fitness';
import type { BodyCheckInInput, CosmeticSlot, FitnessSetupInput, Profile, RewardReceipt } from './contracts';

export interface ProgressionState {
  profile: Profile;
  qualifiedByDay: Record<string, number>;
  activeDayKeys: string[];
  goalBonusWeeks: string[];
}
export interface RewardInput { matchId: string; totalReps: number; won: boolean; finishedAt: number }
const DAY_MS = 86400000;
const KOLKATA_OFFSET = 19800000;
export function dayKey(at: number): string { return new Date(at + KOLKATA_OFFSET).toISOString().slice(0, 10); }
export function weekKey(at: number): string {
  const date = new Date(at + KOLKATA_OFFSET);
  const day = (date.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - day * DAY_MS).toISOString().slice(0, 10);
}
export function createProgression(id: string, name: string): ProgressionState {
  return { profile: { id, name, xp: 0, activeDays: 0, stage: 'starter', streak: 0, lastActiveDay: null,
    weeklyActiveDays: 0, totalReps: 0, wins: 0, qualifiedMatches: 0, ownedCosmetics: ['origin-suit'], equipped: { outfit: 'origin-suit' }, characterId: DEFAULT_CHARACTER_ID },
    qualifiedByDay: {}, activeDayKeys: [], goalBonusWeeks: [] };
}
function weekForDay(day: string): string { return weekKey(Date.parse(`${day}T12:00:00Z`)); }
function streakEndingAt(day: string, activeDays: string[]): number {
  const active = new Set(activeDays); let streak = 0;
  for (let at = Date.parse(`${day}T00:00:00Z`); active.has(new Date(at).toISOString().slice(0, 10)); at -= DAY_MS) streak++;
  return streak;
}
export function displayProfile(state: ProgressionState, now: number): Profile {
  const profile = structuredClone(state.profile);
  profile.weeklyActiveDays = state.activeDayKeys.filter(day => weekForDay(day) === weekKey(now)).length;
  if (profile.lastActiveDay !== dayKey(now) && profile.lastActiveDay !== dayKey(now - DAY_MS)) profile.streak = 0;
  return profile;
}
export function applyReward(state: ProgressionState, input: RewardInput): { state: ProgressionState; receipt: RewardReceipt } {
  if (!Number.isInteger(input.totalReps) || input.totalReps < 0 || input.totalReps > 1000 || !Number.isFinite(input.finishedAt)) throw new Error('Invalid completed-match performance.');
  const next = structuredClone(state);
  const p = next.profile;
  const before = p.stage;
  const today = dayKey(input.finishedAt), week = weekKey(input.finishedAt);
  const qualified = input.totalReps >= 10;
  const capped = qualified && (next.qualifiedByDay[today] ?? 0) >= 3;
  let matchXp = 0, streakXp = 0, goalXp = 0;
  p.totalReps += input.totalReps;
  if (qualified) {
    p.qualifiedMatches++;
    if (input.won) p.wins++;
    next.qualifiedByDay[today] = (next.qualifiedByDay[today] ?? 0) + 1;
    if (!capped) {
      matchXp = 50 + 5 * input.totalReps + (input.won ? 25 : 0);
      if (!next.activeDayKeys.includes(today)) {
        next.activeDayKeys.push(today); next.activeDayKeys.sort();
        p.lastActiveDay = next.activeDayKeys.at(-1)!; p.activeDays = next.activeDayKeys.length;
        p.streak = streakEndingAt(p.lastActiveDay, next.activeDayKeys);
        streakXp = 10 * Math.min(streakEndingAt(today, next.activeDayKeys), 7);
        p.weeklyActiveDays = next.activeDayKeys.filter(day => weekForDay(day) === weekForDay(p.lastActiveDay!)).length;
        if (next.activeDayKeys.filter(day => weekForDay(day) === week).length >= 3 && !next.goalBonusWeeks.includes(week)) {
          goalXp = 100; next.goalBonusWeeks.push(week);
        }
      }
      p.xp += matchXp + streakXp + goalXp;
    }
  }
  if (p.fitness) advanceFitnessStage(p);
  else {
    // Preserve existing profiles until they opt into their personal target journey.
    const computedStage = stageFor(p.xp, p.activeDays);
    p.stage = STAGES.findIndex(s => s.id === computedStage) > STAGES.findIndex(s => s.id === before) ? computedStage : before;
  }
  const unlocked: string[] = [];
  const add = (id: string, allowed: boolean) => { if (allowed && !p.ownedCosmetics.includes(id)) { p.ownedCosmetics.push(id); unlocked.push(id); } };
  add('ion-skin', p.qualifiedMatches >= 1); add('pulse-bracers', p.totalReps >= 100);
  add('champion-pose', p.wins >= 5); add('nova-aura', p.stage === 'legendary' || (!!p.fitness && p.stage === 'elite'));
  return { state: next, receipt: { id: `${input.matchId}:${p.id}`, qualified, xp: matchXp + streakXp + goalXp,
    matchXp, streakXp, goalXp, stageBefore: before, stageAfter: p.stage, unlocked, dailyLimitReached: capped } };
}
export function isCosmeticSlot(value: unknown): value is CosmeticSlot {
  return value === 'outfit' || value === 'skin' || value === 'accessory' || value === 'pose' || value === 'aura';
}
export function equipCosmetic(state: ProgressionState, slot: CosmeticSlot, itemId: string): ProgressionState {
  if (!isCosmeticSlot(slot)) throw new Error('Choose a valid cosmetic slot.');
  const item = COSMETICS.find(c => c.id === itemId && c.slot === slot);
  if (!item || !state.profile.ownedCosmetics.includes(itemId)) throw new Error('This cosmetic has not been unlocked for that slot.');
  const next = structuredClone(state); next.profile.equipped[slot] = itemId; return next;
}
export function unequipCosmetic(state: ProgressionState, slot: CosmeticSlot): ProgressionState {
  if (!isCosmeticSlot(slot)) throw new Error('Choose a valid cosmetic slot.');
  const next = structuredClone(state);
  delete next.profile.equipped[slot];
  return next;
}
export function resetEquipment(state: ProgressionState): ProgressionState {
  const next = structuredClone(state);
  next.profile.equipped = { outfit: 'origin-suit' };
  return next;
}

function validateCheckInTime(now: number): void {
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) throw new Error('Invalid check-in time.');
}
function unlockEliteAura(profile: Profile): void {
  if (profile.stage === 'elite' && !profile.ownedCosmetics.includes('nova-aura')) profile.ownedCosmetics.push('nova-aura');
}
export function setupFitness(state: ProgressionState, input: FitnessSetupInput, now: number): ProgressionState {
  if (state.profile.fitness) throw new Error('Your fitness journey has already been set up. Add a check-in to update your measurements.');
  validateFitnessSetup(input);
  validateCheckInTime(now);
  const next = structuredClone(state);
  next.profile.characterId = input.characterId;
  next.profile.fitness = {
    goal: input.goal, startingBuild: input.startingBuild, startedAt: now,
    startWeightKg: input.weightKg, startHeightCm: input.heightCm, targetWeightKg: input.targetWeightKg,
    checkIns: [],
  };
  // A returning player keeps earned progress; new players begin at Starter for every build.
  if (next.profile.stage === 'legendary') next.profile.stage = 'elite';
  unlockEliteAura(next.profile);
  return next;
}
export function recordBodyCheckIn(state: ProgressionState, input: BodyCheckInInput, now: number): ProgressionState {
  if (!state.profile.fitness) throw new Error('Set up your fitness journey before adding a check-in.');
  validateBodyCheckIn(input);
  validateCheckInTime(now);
  const day = dayKey(now);
  if (day <= dayKey(state.profile.fitness.startedAt)) throw new Error('Your starting measurements are saved. Add your first follow-up from tomorrow; a weekly check-in is enough.');
  const previous = state.profile.fitness.checkIns.at(-1);
  if (previous && now < previous.at) throw new Error('A newer check-in is already saved. Refresh your profile before trying again.');
  const next = structuredClone(state);
  const fitness = next.profile.fitness!;
  const checkIn = { day, at: now, weightKg: input.weightKg, heightCm: input.heightCm };
  // Retrying or correcting today's report replaces it instead of manufacturing extra days.
  const index = fitness.checkIns.findIndex(entry => entry.day === day);
  if (index >= 0) fitness.checkIns[index] = checkIn;
  else fitness.checkIns.push(checkIn);
  fitness.checkIns = fitness.checkIns.slice(-MAX_CHECK_INS);
  advanceFitnessStage(next.profile);
  unlockEliteAura(next.profile);
  return next;
}
export function selectCharacter(state: ProgressionState, characterId: CharacterId): ProgressionState {
  if (!isCharacterId(characterId)) throw new Error('Choose one of the available characters.');
  const next = structuredClone(state);
  next.profile.characterId = characterId;
  return next;
}
