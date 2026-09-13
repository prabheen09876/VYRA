import {
  MUSCLE_GROUPS, isMuscleGroup, toExerciseSuggestion,
  type CatalogExercise, type ExerciseSuggestion, type MuscleGroup,
} from '@vyra/core';
import { EXERCISE_CATALOG } from './exercise-catalog';

const MAX_SUGGESTIONS = 6;

// Maps the words a user might type to the site's eight canonical groups. Longer, more
// specific keywords are matched first so "front deltoid" resolves before a bare "front".
const MUSCLE_KEYWORDS: ReadonlyArray<readonly [string, MuscleGroup]> = [
  ['pectoral', 'chest'], ['pecs', 'chest'], ['pec', 'chest'], ['chest', 'chest'],
  ['trapezius', 'back'], ['trap', 'back'], ['lats', 'back'], ['lat', 'back'], ['rhomboid', 'back'],
  ['upper back', 'back'], ['back', 'back'],
  ['deltoid', 'shoulders'], ['delts', 'shoulders'], ['delt', 'shoulders'], ['shoulder', 'shoulders'], ['shoulders', 'shoulders'],
  ['triceps', 'triceps'], ['tricep', 'triceps'], ['tri', 'triceps'],
  ['biceps', 'biceps'], ['bicep', 'biceps'], ['forearm', 'biceps'],
  ['abdominal', 'abdominals'], ['abs', 'abdominals'], ['oblique', 'abdominals'], ['core', 'abdominals'], ['ab ', 'abdominals'],
  ['quadricep', 'legs'], ['quad', 'legs'], ['hamstring', 'legs'], ['glute', 'legs'], ['thigh', 'legs'],
  ['adductor', 'legs'], ['abductor', 'legs'], ['hip', 'legs'], ['legs', 'legs'], ['leg', 'legs'],
  ['calves', 'calves'], ['calf', 'calves'],
];

// A muscle keyword alone is not a request for a list — pair it with a clear "give me exercises" intent.
const EXERCISE_INTENT = /\b(exercises?|workouts?|work\s?out|movements?|moves?|routines?|training|train|drills?|lifts?|day|hit|target|build|grow|develop|strengthen|for\s+my)\b/i;

/** Detect the earliest-mentioned canonical muscle group in free text, or null. */
function detectMuscleGroup(text: string): MuscleGroup | null {
  const haystack = ` ${text.toLowerCase()} `;
  let best: { group: MuscleGroup; index: number } | null = null;
  for (const [keyword, group] of MUSCLE_KEYWORDS) {
    const index = haystack.indexOf(keyword);
    if (index === -1) continue;
    if (!best || index < best.index) best = { group, index };
  }
  return best?.group ?? null;
}

/** Normalize a `?muscle=` query value (canonical group or a synonym) to a group, or null. */
export function normalizeMuscleGroup(value: string | null | undefined): MuscleGroup | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (isMuscleGroup(trimmed)) return trimmed;
  return detectMuscleGroup(trimmed);
}

/** The full catalog, optionally filtered to exercises whose PRIMARY group matches (the site taxonomy). */
export function listExercises(muscle?: string | null): CatalogExercise[] {
  const group = normalizeMuscleGroup(muscle ?? null);
  const all = EXERCISE_CATALOG as readonly CatalogExercise[];
  if (muscle && !group) return [];
  return group ? all.filter(exercise => exercise.primaryMuscles.includes(group)) : [...all];
}

/**
 * When a question asks for a muscle group's exercises, return that group plus up to
 * MAX_SUGGESTIONS matches (primary matches first, then secondary as filler). Otherwise null.
 */
export function suggestExercisesForQuestion(question: string): { group: MuscleGroup; exercises: ExerciseSuggestion[] } | null {
  if (!EXERCISE_INTENT.test(question)) return null;
  const group = detectMuscleGroup(question);
  if (!group) return null;
  const all = EXERCISE_CATALOG as readonly CatalogExercise[];
  const primary = all.filter(exercise => exercise.primaryMuscles.includes(group));
  const secondary = all.filter(exercise => !exercise.primaryMuscles.includes(group) && exercise.secondaryMuscles.includes(group));
  const exercises = [...primary, ...secondary].slice(0, MAX_SUGGESTIONS).map(toExerciseSuggestion);
  if (!exercises.length) return null;
  return { group, exercises };
}

export { MUSCLE_GROUPS };
