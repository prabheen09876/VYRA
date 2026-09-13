// Structured exercise library scraped from simplyfitness.com.
// NOTE: `Exercise` is already a rep-type union in contracts.ts — these types are
// deliberately named CatalogExercise / ExerciseSuggestion to avoid a barrel collision.

/** The eight canonical muscle groups (the source site's own hub taxonomy). */
export const MUSCLE_GROUPS = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'abdominals', 'legs', 'calves',
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

/** Display labels for each canonical group. */
export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  abdominals: 'Abs',
  legs: 'Legs',
  calves: 'Calves',
};

/** A full exercise record, as committed to data/exercises/exercises.json. */
export interface CatalogExercise {
  slug: string;
  name: string;
  url: string;
  subtitle: string;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  muscleLabels: string[];
  equipment: string[];
  startingPosition: string;
  execution: string;
  /** Worker-served path (`/exercise-images/<slug>.<ext>`), or null when the source had no illustration. */
  image: string | null;
  /** Original CDN URL the illustration was downloaded from (provenance). */
  imageSource: string | null;
}

/** Compact projection returned to the Coach chat and mobile cards. */
export interface ExerciseSuggestion {
  slug: string;
  name: string;
  subtitle: string;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  equipment: string[];
  image: string | null;
}

export function isMuscleGroup(value: string): value is MuscleGroup {
  return (MUSCLE_GROUPS as readonly string[]).includes(value);
}

/** Narrow a full record down to the compact suggestion shape. */
export function toExerciseSuggestion(exercise: CatalogExercise): ExerciseSuggestion {
  return {
    slug: exercise.slug,
    name: exercise.name,
    subtitle: exercise.subtitle,
    primaryMuscles: exercise.primaryMuscles,
    secondaryMuscles: exercise.secondaryMuscles,
    equipment: exercise.equipment,
    image: exercise.image,
  };
}
