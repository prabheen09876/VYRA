import { STAGES } from './catalog';
import { isCharacterId } from './characters';
import type { BodyCheckInInput, EvolutionStage, FitnessGoal, FitnessSetupInput, Profile, StartingBuild } from './contracts';

export const FITNESS_GOALS: { id: FitnessGoal; name: string; description: string }[] = [
  { id: 'gain_weight', name: 'Build mass', description: 'Work toward a higher target weight while building a workout habit.' },
  { id: 'lose_weight', name: 'Reduce weight', description: 'Work toward a lower target weight alongside regular workouts.' },
  { id: 'maintain_weight', name: 'Build strength', description: 'Keep your weight steady while progressing through workouts.' },
];
export const STARTING_BUILDS: { id: StartingBuild; name: string }[] = [
  { id: 'thin', name: 'Thin' }, { id: 'average', name: 'Average' },
  { id: 'broad', name: 'Broad' }, { id: 'prefer_not_to_say', name: 'Prefer not to say' },
];
export type FitnessStage = Omit<(typeof STAGES)[number], 'id'> & { id: Exclude<EvolutionStage, 'legendary'>; weightProgress: number };
const WEIGHT_MILESTONES = { starter: 0, developing: 0.25, strong: 0.6, elite: 1 } as const;
export const FITNESS_STAGES: FitnessStage[] = STAGES.filter(stage => stage.id !== 'legendary').map(stage => ({
  ...stage, id: stage.id as FitnessStage['id'], weightProgress: WEIGHT_MILESTONES[stage.id as FitnessStage['id']],
}));
export const CHECK_IN_INTERVAL_DAYS = 7;
export const MAX_CHECK_INS = 90;
export const MAINTENANCE_TOLERANCE = 0.02;

function validMeasurement(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
export function validateBodyCheckIn(input: BodyCheckInInput): void {
  if (!input || !validMeasurement(input.weightKg, 20, 350)) throw new Error('Enter a weight between 20 and 350 kg.');
  if (!validMeasurement(input.heightCm, 100, 250)) throw new Error('Enter a height between 100 and 250 cm.');
}
export function validateFitnessSetup(input: FitnessSetupInput): void {
  validateBodyCheckIn(input);
  if (!FITNESS_GOALS.some(goal => goal.id === input.goal)) throw new Error('Choose a fitness goal.');
  if (!STARTING_BUILDS.some(build => build.id === input.startingBuild)) throw new Error('Choose how you describe your starting build, or prefer not to say.');
  if (!isCharacterId(input.characterId)) throw new Error('Choose one of the available characters.');
  if (!validMeasurement(input.targetWeightKg, 20, 350)) throw new Error('Enter a target weight between 20 and 350 kg.');
  if (input.goal === 'gain_weight' && input.targetWeightKg - input.weightKg < 0.1 - 1e-8) throw new Error('For Build mass, choose a target above your current weight.');
  if (input.goal === 'lose_weight' && input.weightKg - input.targetWeightKg < 0.1 - 1e-8) throw new Error('For Reduce weight, choose a target below your current weight.');
  if (input.goal === 'maintain_weight' && Math.abs(input.targetWeightKg - input.weightKg) > 1e-8) throw new Error('For Build strength, use your current weight as your target.');
}

export function fitnessProgress(profile: Profile, now = Date.now()) {
  const fitness = profile.fitness;
  const latest = fitness?.checkIns.at(-1);
  const latestWeightKg = latest?.weightKg ?? fitness?.startWeightKg ?? 0;
  const latestHeightCm = latest?.heightCm ?? fitness?.startHeightCm ?? 0;
  const hasFollowUp = !!latest;
  let weightProgress = 0;
  if (fitness) {
    if (fitness.goal === 'maintain_weight') {
      weightProgress = Math.abs(latestWeightKg - fitness.targetWeightKg) <= fitness.targetWeightKg * MAINTENANCE_TOLERANCE + 1e-8 ? 1 : 0;
    } else {
      const change = fitness.targetWeightKg - fitness.startWeightKg;
      if (change !== 0) weightProgress = Math.max(0, Math.min(1, (latestWeightKg - fitness.startWeightKg) / change));
    }
  }
  const stageIndex = profile.stage === 'legendary' ? FITNESS_STAGES.length - 1 : FITNESS_STAGES.findIndex(stage => stage.id === profile.stage);
  return {
    weightProgress, latestWeightKg, latestHeightCm, hasFollowUp,
    checkInDue: !!fitness && now - (latest?.at ?? fitness.startedAt) >= CHECK_IN_INTERVAL_DAYS * 86400000,
    nextStage: FITNESS_STAGES[stageIndex + 1] ?? null,
  };
}

/** Weight is one self-reported goal metric, never a fitness or muscle measurement. */
export function stageForFitness(profile: Profile): FitnessStage['id'] {
  const progress = fitnessProgress(profile);
  return [...FITNESS_STAGES].reverse().find(stage => stage.id === 'starter' || (
    progress.hasFollowUp && profile.xp >= stage.xp && profile.activeDays >= stage.days &&
    progress.weightProgress + 1e-8 >= stage.weightProgress
  ))!.id;
}

/** Earned stages stay earned when a measurement fluctuates or a check-in is missed. */
export function advanceFitnessStage(profile: Profile): void {
  const current = profile.stage === 'legendary' ? 'elite' : profile.stage;
  const computed = stageForFitness(profile);
  profile.stage = FITNESS_STAGES.findIndex(stage => stage.id === computed) > FITNESS_STAGES.findIndex(stage => stage.id === current) ? computed : current;
}
