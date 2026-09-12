/** Every character shares the same earned stages; appearance is a player choice. */
export const CHARACTERS = [
  { id: 'goku', name: 'Goku', title: 'Goku', description: 'A determined fighter who grows with your training.', sourceStem: 'Goku' },
  { id: 'base-male', name: 'Base Male', title: 'Base Male', description: 'A simple male avatar with a clear view of each evolution.', sourceStem: 'Base_Male' },
  { id: 'base-female', name: 'Base Female', title: 'Base Female', description: 'A simple female avatar with a clear view of each evolution.', sourceStem: 'Base_Female' },
  { id: 'mikasa', name: 'Mikasa', title: 'Mikasa', description: 'Steady focus and strength, one training day at a time.', sourceStem: 'Female_Mikasa' },
  { id: 'nami', name: 'Nami', title: 'Nami', description: 'An adventurous companion for your next milestone.', sourceStem: 'Female_Name' },
  { id: 'sakura', name: 'Sakura', title: 'Sakura', description: 'Build a lasting habit and watch your strength grow.', sourceStem: 'Female_Sakura' },
] as const;

export type CharacterId = (typeof CHARACTERS)[number]['id'];
export const DEFAULT_CHARACTER_ID: CharacterId = 'goku';

export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === 'string' && CHARACTERS.some(character => character.id === value);
}

export function characterFor(value: unknown): (typeof CHARACTERS)[number] {
  return CHARACTERS.find(character => character.id === value) ?? CHARACTERS[0];
}
