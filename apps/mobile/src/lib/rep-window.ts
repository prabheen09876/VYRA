import type { CaptureMessage, MatchSnapshot, Phase, RepEvent } from '@vyra/core';
import { REP_LATE_WINDOW, type ExerciseWindow } from '@vyra/core/match';

type CapturedRep = Extract<CaptureMessage, { type: 'capture.rep' }>;

/** Keep completed movement windows through transition/resolve for in-flight bridge events. */
export function rememberExerciseWindow(windows: ExerciseWindow[], snapshot: MatchSnapshot): ExerciseWindow[] {
  if (snapshot.phase !== 'squat' && snapshot.phase !== 'pushup') return windows;
  if (windows.some(window => window.id === snapshot.phaseId)) return windows;
  return [...windows, {
    id: snapshot.phaseId, exercise: snapshot.phase,
    startedAt: snapshot.phaseStartedAt, endsAt: snapshot.phaseEndsAt,
  }].slice(-2);
}

/** Route by capture time and the original window, never by the latest snapshot's phase ID. */
export function routeCapturedRep(input: {
  rep: CapturedRep;
  windows: readonly ExerciseWindow[];
  phase: Phase;
  serverOffset: number;
  clientNow: number;
  stopped: boolean;
}): Omit<RepEvent, 'seq'> | null {
  const { rep, windows, phase, serverOffset, clientNow, stopped } = input;
  if (stopped || !Number.isFinite(rep.occurredAt) || !Number.isFinite(rep.confidence) ||
      !Number.isFinite(serverOffset) || !Number.isFinite(clientNow)) return null;
  const gracePhase = rep.exercise === 'squat' ? 'transition' : 'resolve';
  if (phase !== rep.exercise && phase !== gracePhase) return null;
  const occurredAt = rep.occurredAt + serverOffset;
  const serverNow = clientNow + serverOffset;
  const window = windows.find(candidate =>
    candidate.exercise === rep.exercise && occurredAt >= candidate.startedAt && occurredAt < candidate.endsAt,
  );
  if (!window || serverNow > window.endsAt + REP_LATE_WINDOW ||
      serverNow - occurredAt > REP_LATE_WINDOW || occurredAt > serverNow + 500) return null;
  return {
    phaseId: window.id, exercise: rep.exercise, occurredAt,
    confidence: rep.confidence, formScore: rep.formScore, modelVersion: rep.modelVersion,
  };
}
