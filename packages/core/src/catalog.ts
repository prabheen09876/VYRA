import type { CosmeticSlot, EvolutionStage, Rarity, TemplateId } from './contracts';

// These colors are rendered as small foreground text (11-12px stage/rarity labels and Pills),
// not just as swatches, so every value is checked for >= 4.5:1 against the app background
// (#05070A) and kept on the same hues as apps/mobile/src/theme.ts.
//
// The ramp walks hue monotonically 212 -> 169 — cool slate, through cyan, to the brand teal and
// then the mint accent — while saturation AND contrast climb the whole way: 6.50:1, 7.65:1,
// 9.53:1, 10.83:1, 13.63:1 on the ground. So it reads as literally brightening as you power up,
// rather than as five unrelated colors. Keep both properties if you re-cut it; the contrast
// monotonicity is what makes the ramp legible to someone who cannot separate the hues.
//
// The last two are `colors.brand` and `colors.accent` exactly, which is what ties the evolution
// ladder to the app's own chrome: reaching Elite means wearing the app's colour.
export const STAGES: { id: EvolutionStage; name: string; xp: number; days: number; color: string; description: string }[] = [
  { id: 'starter', name: 'Starter', xp: 0, days: 0, color: '#8494A6', description: 'Every legend starts with one rep.' },
  { id: 'developing', name: 'Developing', xp: 100, days: 1, color: '#6FA8B8', description: 'Your effort is starting to show.' },
  { id: 'strong', name: 'Strong', xp: 1000, days: 5, color: '#4FC3C3', description: 'Consistency becomes strength.' },
  { id: 'elite', name: 'Elite', xp: 3000, days: 14, color: '#2DD4BF', description: 'Built one workout at a time.' },
  { id: 'legendary', name: 'Legendary', xp: 7500, days: 30, color: '#5EEAD4', description: 'A month of effort. A hero of your own.' }
];
export const TEMPLATES: Record<TemplateId, { squat: number; pushup: number }> = {
  recovery: { squat: 15000, pushup: 20000 }, balanced: { squat: 20000, pushup: 25000 }, push: { squat: 25000, pushup: 30000 }
};
export const TIMING = { countdown: 5000, transition: 12000, resolve: 2000, recovery: 12000, maxRounds: 3 } as const;
export interface Cosmetic { id: string; name: string; slot: CosmeticSlot; rarity: Rarity; color: string; requirement: string; description: string }
// All five are mutually distinct — a stage accent and a cosmetic swatch that resolve to the same
// hex become indistinguishable on the collection screen, where both are drawn side by side.
// Two pairings ARE intentional and should be preserved: champion-pose matches the Elite stage and
// nova-aura matches the Legendary stage, so the epic pose visually belongs to the Elite hero and
// the legendary aura to the Legendary hero.
//
// ion-skin and nova-aura are also re-tinted in 3D at apps/mobile/src/components/HeroView.shared.tsx.
// Those literals are copies of the values below; change both together or an equipped cosmetic
// renders one color on its card and another on the character.
export const COSMETICS: Cosmetic[] = [
  { id: 'origin-suit', name: 'Origin suit', slot: 'outfit', rarity: 'common', color: '#6E7A8C', requirement: 'Yours from the start', description: 'The uniform of a future legend.' },
  { id: 'ion-skin', name: 'Ion skin', slot: 'skin', rarity: 'rare', color: '#4D8BFF', requirement: 'Complete your first workout', description: 'An electric blue finish, earned in motion.' },
  { id: 'pulse-bracers', name: 'Pulse bracers', slot: 'accessory', rarity: 'rare', color: '#FF6B3D', requirement: 'Complete 100 valid reps', description: 'A bright mark of work put in.' },
  { id: 'champion-pose', name: 'Champion flex', slot: 'pose', rarity: 'epic', color: '#2DD4BF', requirement: 'Win 5 battles', description: 'A victory worth showing off.' },
  { id: 'nova-aura', name: 'Nova aura', slot: 'aura', rarity: 'legendary', color: '#5EEAD4', requirement: 'Reach Elite evolution', description: 'Your consistency lights up the arena.' }
];
// Drawn as the card border, rarity dot and rarity LABEL around art tinted with the cosmetic's own
// color, so these deliberately track the stage ramp instead of running on an independent scale.
// `common` is theme `faint` and `rare` is the Developing stage, so the four steps inherit the same
// climbing-contrast property as STAGES (5.55, 7.65, 10.83, 13.63 on the ground).
export const RARITY_COLORS: Record<Rarity, string> = { common: '#7E8794', rare: '#6FA8B8', epic: '#2DD4BF', legendary: '#5EEAD4' };
export function stageFor(xp: number, activeDays: number): EvolutionStage { return [...STAGES].reverse().find(s => xp >= s.xp && activeDays >= s.days)!.id; }
