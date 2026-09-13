import { afterEach, describe, expect, it, vi } from 'vitest';
import { MUSCLE_GROUPS } from '@vyra/core';
import { EXERCISE_CATALOG } from './exercise-catalog';
import { handleCoachChat, type CoachEnv } from './coach';
import { listExercises, normalizeMuscleGroup, suggestExercisesForQuestion } from './exercises';

function request(body: unknown): Request {
  return new Request('https://worker.test/api/coach/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
// No HF token and AI disabled: the offline path, which is where exercise cards must still work.
const offlineEnv = { HF_TOKEN: undefined, AI_ENABLED: 'false', AI: undefined } as unknown as CoachEnv;
afterEach(() => { vi.restoreAllMocks(); });

describe('exercise catalog', () => {
  it('bundles a de-duplicated catalog with valid muscle groups and local image paths', () => {
    expect(EXERCISE_CATALOG.length).toBeGreaterThan(140);
    expect(new Set(EXERCISE_CATALOG.map(e => e.slug)).size).toBe(EXERCISE_CATALOG.length);
    for (const exercise of EXERCISE_CATALOG) {
      expect(exercise.name.length).toBeGreaterThan(1);
      expect(exercise.startingPosition.length).toBeGreaterThan(1);
      expect(exercise.execution.length).toBeGreaterThan(1);
      expect(exercise.primaryMuscles.length).toBeGreaterThan(0);
      for (const group of [...exercise.primaryMuscles, ...exercise.secondaryMuscles]) {
        expect(MUSCLE_GROUPS).toContain(group);
      }
      if (exercise.image !== null) expect(exercise.image).toMatch(/^\/exercise-images\/[a-z0-9-]+\.[a-z0-9]+$/);
    }
  });

  it('never leaks prototype secrets or machine paths into the shipped catalog', () => {
    const serialized = JSON.stringify(EXERCISE_CATALOG);
    expect(serialized).not.toMatch(/HF_TOKEN|MISTRAL_API_KEY|C:\\\\Users|\.env|chroma/i);
  });
});

describe('listExercises', () => {
  it('returns the whole catalog when no muscle is given', () => {
    expect(listExercises().length).toBe(EXERCISE_CATALOG.length);
  });

  it('filters to a canonical group by primary muscle', () => {
    const legs = listExercises('legs');
    expect(legs.length).toBeGreaterThan(0);
    expect(legs.every(e => e.primaryMuscles.includes('legs'))).toBe(true);
  });

  it('accepts common synonyms via normalizeMuscleGroup', () => {
    expect(normalizeMuscleGroup('abs')).toBe('abdominals');
    expect(normalizeMuscleGroup('delts')).toBe('shoulders');
    expect(normalizeMuscleGroup('quads')).toBe('legs');
    expect(normalizeMuscleGroup('legs')).toBe('legs');
    expect(normalizeMuscleGroup('stocks')).toBeNull();
  });

  it('returns nothing for an unknown muscle filter rather than the whole catalog', () => {
    expect(listExercises('stocks')).toEqual([]);
  });
});

describe('suggestExercisesForQuestion', () => {
  it('suggests exercises for an explicit muscle-group request', () => {
    const legs = suggestExercisesForQuestion('give me some leg exercises');
    expect(legs?.group).toBe('legs');
    expect(legs?.exercises.length).toBeGreaterThan(0);
    expect(legs?.exercises.length).toBeLessThanOrEqual(6);
    expect(legs?.exercises.every(e => e.primaryMuscles.includes('legs'))).toBe(true);

    expect(suggestExercisesForQuestion('best tricep workout please')?.group).toBe('triceps');
    expect(suggestExercisesForQuestion('what should I do on shoulder day?')?.group).toBe('shoulders');
  });

  it('ignores questions that are not exercise-list intents', () => {
    expect(suggestExercisesForQuestion('what is progressive overload?')).toBeNull();
    expect(suggestExercisesForQuestion('how much protein should I eat?')).toBeNull();
    // A muscle word with no "give me exercises" intent should not trigger a list.
    expect(suggestExercisesForQuestion('why do my legs feel sore?')).toBeNull();
  });
});

describe('coach chat exercise suggestions', () => {
  it('answers a muscle-group request with concrete cards even when AI is disabled', async () => {
    const reply = await handleCoachChat(request({ question: 'give me tricep exercises' }), offlineEnv, 'player-1');
    expect(reply.mode).toBe('knowledge');
    expect(reply.exercises?.length).toBeGreaterThan(0);
    expect(reply.exercises?.every(e => e.primaryMuscles.includes('triceps'))).toBe(true);
    expect(reply.answer.toLowerCase()).toContain('triceps exercises');
  });

  it('does not attach exercises to a non-exercise question', async () => {
    const reply = await handleCoachChat(request({ question: 'what is progressive overload?' }), offlineEnv, 'player-1');
    expect(reply.exercises).toBeUndefined();
  });
});
