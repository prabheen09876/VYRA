import { describe, expect, it } from 'vitest';
import type { CaptureMessage, MatchSnapshot } from '@vyra/core';
import type { ExerciseWindow } from '@vyra/core/match';
import { rememberExerciseWindow, routeCapturedRep } from './rep-window';

const squat: ExerciseWindow = { id: 'match:2', exercise: 'squat', startedAt: 5000, endsAt: 25000 };
const pushup: ExerciseWindow = { id: 'match:4', exercise: 'pushup', startedAt: 37000, endsAt: 62000 };
const rep = (exercise: 'squat' | 'pushup', occurredAt: number): Extract<CaptureMessage, { type: 'capture.rep' }> => ({
  type: 'capture.rep', protocolVersion: 1, exercise, occurredAt,
  confidence: 0.9, formScore: 0.85, modelVersion: 'baseline-v1',
});

describe('camera rep phase routing', () => {
  it('preserves a predeadline squat ID when its message arrives during transition', () => {
    const event = routeCapturedRep({
      rep: rep('squat', 24499), windows: [squat], phase: 'transition',
      serverOffset: 500, clientNow: 24520, stopped: false,
    });
    expect(event).toMatchObject({ phaseId: 'match:2', exercise: 'squat', occurredAt: 24999 });
  });

  it('preserves a predeadline push-up ID during resolution', () => {
    const event = routeCapturedRep({
      rep: rep('pushup', 61999), windows: [squat, pushup], phase: 'resolve',
      serverOffset: 0, clientNow: 62500, stopped: false,
    });
    expect(event?.phaseId).toBe('match:4');
  });

  it('rejects a rep completed exactly at the phase deadline', () => {
    expect(routeCapturedRep({
      rep: rep('squat', 25000), windows: [squat], phase: 'transition',
      serverOffset: 0, clientNow: 25020, stopped: false,
    })).toBeNull();
  });

  it('rejects messages beyond the server grace window', () => {
    expect(routeCapturedRep({
      rep: rep('pushup', 61999), windows: [pushup], phase: 'resolve',
      serverOffset: 0, clientNow: 64001, stopped: false,
    })).toBeNull();
  });

  it('never retags an old rep into a later round of the same exercise', () => {
    const later: ExerciseWindow = { id: 'match:7', exercise: 'squat', startedAt: 76000, endsAt: 96000 };
    expect(routeCapturedRep({
      rep: rep('squat', 24999), windows: [pushup, later], phase: 'squat',
      serverOffset: 0, clientNow: 76010, stopped: false,
    })).toBeNull();
  });

  it('does not forward after a stop or completed match', () => {
    const input = {
      rep: rep('pushup', 61999), windows: [pushup], phase: 'resolve' as const,
      serverOffset: 0, clientNow: 62010, stopped: false,
    };
    expect(routeCapturedRep({ ...input, stopped: true })).toBeNull();
    expect(routeCapturedRep({ ...input, phase: 'finished' })).toBeNull();
  });

  it('retains the previous window while observing transition or resolution snapshots', () => {
    const windows = [squat];
    const snapshot = { phase: 'transition', phaseId: 'match:3', phaseStartedAt: 25000, phaseEndsAt: 37000 } as MatchSnapshot;
    expect(rememberExerciseWindow(windows, snapshot)).toBe(windows);
    expect(rememberExerciseWindow(windows, { ...snapshot, phase: 'pushup', phaseId: 'match:4', phaseStartedAt: 37000, phaseEndsAt: 62000 })).toEqual([squat, pushup]);
  });
});
