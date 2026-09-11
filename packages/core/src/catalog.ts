import type { CosmeticSlot, EvolutionStage, Rarity, TemplateId } from './contracts';
export const STAGES: { id: EvolutionStage; name: string; xp: number; days: number; color: string; description: string }[] = [
  { id: 'starter', name: 'Starter', xp: 0, days: 0, color: '#81B4CF', description: 'Every legend starts with one rep.' },
  { id: 'developing', name: 'Developing', xp: 100, days: 1, color: '#55DCCE', description: 'Your effort is starting to show.' },
  { id: 'strong', name: 'Strong', xp: 1000, days: 5, color: '#5E9EFF', description: 'Consistency becomes strength.' },
  { id: 'elite', name: 'Elite', xp: 3000, days: 14, color: '#AE8AFF', description: 'Built one workout at a time.' },
  { id: 'legendary', name: 'Legendary', xp: 7500, days: 30, color: '#FFD17B', description: 'A month of effort. A hero of your own.' }
];
export const TEMPLATES: Record<TemplateId, { squat: number; pushup: number }> = {
  recovery: { squat: 15000, pushup: 20000 }, balanced: { squat: 20000, pushup: 25000 }, push: { squat: 25000, pushup: 30000 }
};
export const TIMING = { countdown: 5000, transition: 12000, resolve: 2000, recovery: 12000, maxRounds: 3 } as const;
export interface Cosmetic { id: string; name: string; slot: CosmeticSlot; rarity: Rarity; color: string; requirement: string; description: string }
export const COSMETICS: Cosmetic[] = [
  { id: 'origin-suit', name: 'Origin suit', slot: 'outfit', rarity: 'common', color: '#273B53', requirement: 'Yours from the start', description: 'The uniform of a future legend.' },
  { id: 'ion-skin', name: 'Ion skin', slot: 'skin', rarity: 'rare', color: '#65DFCF', requirement: 'Complete your first workout', description: 'An electric teal finish, earned in motion.' },
  { id: 'pulse-bracers', name: 'Pulse bracers', slot: 'accessory', rarity: 'rare', color: '#FF906B', requirement: 'Complete 100 valid reps', description: 'A bright mark of work put in.' },
  { id: 'champion-pose', name: 'Champion flex', slot: 'pose', rarity: 'epic', color: '#AE8AFF', requirement: 'Win 5 battles', description: 'A victory worth showing off.' },
  { id: 'nova-aura', name: 'Nova aura', slot: 'aura', rarity: 'legendary', color: '#FFD17B', requirement: 'Reach Legendary evolution', description: 'Your consistency lights up the arena.' }
];
export const RARITY_COLORS: Record<Rarity, string> = { common: '#9DB0C8', rare: '#69B9FF', epic: '#BE9AFF', legendary: '#FFD17B' };
export function stageFor(xp: number, activeDays: number): EvolutionStage { return [...STAGES].reverse().find(s => xp >= s.xp && activeDays >= s.days)!.id; }
