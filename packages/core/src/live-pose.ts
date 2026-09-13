import type { CaptureMessage, CapturePoseMessage, PoseLandmark } from './contracts';

export const LIVE_POSE_INTERVAL_MS = 1000 / 15;
export const LIVE_POSE_MAX_AGE_MS = 750;
const MAX_MESSAGE_LENGTH = 24_000;
const stages = ['squat_top', 'squat_bottom', 'pushup_top', 'pushup_bottom', 'other'];
const finite = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const text = (value: unknown, limit: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= limit;

function inputObject(value: unknown): Record<string, unknown> | null {
  try {
    if (typeof value === 'string') {
      if (value.length > MAX_MESSAGE_LENGTH) return null;
      value = JSON.parse(value) as unknown;
    }
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

/** MediaPipe can report points just outside the image; reject implausible coordinates, not cropping. */
function landmark(value: unknown): PoseLandmark | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const point = inputObject(value);
  if (!point || !finite(point.x, -2, 3) || !finite(point.y, -2, 3) || !finite(point.visibility, 0, 1)) return null;
  if (point.z !== undefined && !finite(point.z, -10, 10)) return null;
  if (point.presence !== undefined && !finite(point.presence, 0, 1)) return null;
  return {
    x: point.x, y: point.y, visibility: point.visibility,
    ...(point.z !== undefined ? { z: point.z as number } : {}),
    ...(point.presence !== undefined ? { presence: point.presence as number } : {}),
  };
}

export function parseCapturePoseMessage(value: unknown): CapturePoseMessage | null {
  const input = inputObject(value);
  if (!input || input.type !== 'capture.pose' || input.protocolVersion !== 1 || typeof input.visible !== 'boolean'
    || !finite(input.timestamp, 0, Number.MAX_SAFE_INTEGER) || !finite(input.confidence, 0, 1)
    || !finite(input.width, 0, 8192) || !Number.isInteger(input.width)
    || !finite(input.height, 0, 8192) || !Number.isInteger(input.height) || !Array.isArray(input.landmarks)) return null;
  const base = { type: 'capture.pose' as const, protocolVersion: 1 as const, timestamp: input.timestamp, width: input.width, height: input.height };
  if (!input.visible) return input.landmarks.length === 0 && input.confidence === 0
    ? { ...base, visible: false, confidence: 0, landmarks: [] } : null;
  if (input.width === 0 || input.height === 0 || input.landmarks.length !== 33) return null;
  const points = Array.from(input.landmarks, landmark);
  if (points.some(point => point === null)) return null;
  return { ...base, visible: true, confidence: input.confidence, landmarks: points as PoseLandmark[] };
}

export function emptyCapturePose(timestamp = Date.now(), width = 0, height = 0): CapturePoseMessage {
  return { type: 'capture.pose', protocolVersion: 1, timestamp, width, height, landmarks: [], visible: false, confidence: 0 };
}

export function isLivePoseFresh(pose: CapturePoseMessage | null, now = Date.now()): boolean {
  return !!pose?.visible && now >= pose.timestamp && now - pose.timestamp <= LIVE_POSE_MAX_AGE_MS;
}

/** Strict bridge parsing is shared by iframe and WebView; unknown fields never reach app state. */
export function parseCaptureMessage(value: unknown): CaptureMessage | null {
  const input = inputObject(value);
  if (!input || input.protocolVersion !== 1) return null;
  switch (input.type) {
    case 'capture.pose': return parseCapturePoseMessage(input);
    case 'capture.camera':
      return ['starting', 'running', 'stopped'].includes(input.state as string)
        ? { type: 'capture.camera', protocolVersion: 1, state: input.state as 'starting' | 'running' | 'stopped' } : null;
    case 'capture.ready':
      return text(input.modelVersion, 160) && ['learned', 'baseline'].includes(input.inferenceMode as string)
        ? { type: 'capture.ready', protocolVersion: 1, modelVersion: input.modelVersion, inferenceMode: input.inferenceMode as 'learned' | 'baseline' } : null;
    case 'capture.error':
      return text(input.code, 100) && text(input.message, 2000)
        ? { type: 'capture.error', protocolVersion: 1, code: input.code, message: input.message } : null;
    case 'capture.rep':
      return ['squat', 'pushup'].includes(input.exercise as string) && finite(input.confidence, 0, 1)
        && finite(input.formScore, 0, 100) && text(input.modelVersion, 160) && finite(input.occurredAt, 0, Number.MAX_SAFE_INTEGER)
        ? { type: 'capture.rep', protocolVersion: 1, exercise: input.exercise as 'squat' | 'pushup', confidence: input.confidence,
          formScore: input.formScore, modelVersion: input.modelVersion, occurredAt: input.occurredAt } : null;
    case 'capture.tracking':
      return typeof input.visible === 'boolean' && finite(input.confidence, 0, 1) && stages.includes(input.stage as string)
        && finite(input.fps, 0, 1000) && typeof input.cue === 'string' && input.cue.length <= 2000
        && (input.formScore === undefined || finite(input.formScore, 0, 100))
        ? { type: 'capture.tracking', protocolVersion: 1, visible: input.visible, confidence: input.confidence,
          stage: input.stage as Extract<CaptureMessage, { type: 'capture.tracking' }>['stage'], fps: input.fps, cue: input.cue,
          ...(input.formScore !== undefined ? { formScore: input.formScore as number } : {}) } : null;
    default: return null;
  }
}
