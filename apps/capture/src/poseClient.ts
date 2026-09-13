import {
  emptyCapturePose, parseCapturePoseMessage,
  type CapturePoseMessage, type Exercise, type MovementStage, type PoseLandmark,
} from '@vyra/core';

/** The JSON result the Python pose server returns for each processed frame. */
export interface PoseResult {
  type: 'result';
  exercise: Exercise;
  person: boolean;
  side: 'left' | 'right' | null;
  keypoints: number[][];
  width: number;
  height: number;
  reps: number;
  stage: 'UP' | 'DOWN';
  movementStage: MovementStage;
  formScore: number;
  status: string;
  error: string;
  liveFeedback: string;
  primaryAngle: number | null;
  secondaryAngle: number | null;
  primaryLabel: string;
  secondaryLabel: string;
  confidence: number;
  repCompleted: boolean;
  repValid: boolean;
  inferenceMs: number;
}

export interface PoseReady { type: 'ready'; modelVersion: string; inferenceMode: 'learned' | 'baseline' }
export interface PoseServerError { type: 'error'; message: string }
export type PoseServerMessage = PoseResult | PoseReady | PoseServerError;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/**
 * COCO-17 (what YOLO26-pose emits) → MediaPipe-33 landmark indices (what the
 * VYRA avatar solver and drawPose already consume). Only joints the app uses are
 * mapped; every other MediaPipe slot is filled with a zero-visibility placeholder
 * that both the solver's ≥0.45 gate and the overlay's ≥0.5 gate skip.
 */
export const COCO_TO_MP: Record<number, number> = {
  0: 0,   // nose
  3: 7,   // left ear   -> MP left ear
  4: 8,   // right ear  -> MP right ear
  5: 11,  // left shoulder
  6: 12,  // right shoulder
  7: 13,  // left elbow
  8: 14,  // right elbow
  9: 15,  // left wrist
  10: 16, // right wrist
  11: 23, // left hip
  12: 24, // right hip
  13: 25, // left knee
  14: 26, // right knee
  15: 27, // left ankle
  16: 28, // right ankle
};

const hidden = (): PoseLandmark => ({ x: 0, y: 0, z: 0, visibility: 0, presence: 0 });

/** Map the server's 17 pixel keypoints onto 33 normalized MediaPipe landmarks. */
export function cocoToLandmarks(keypoints: number[][], width: number, height: number): PoseLandmark[] {
  const landmarks: PoseLandmark[] = Array.from({ length: 33 }, hidden);
  if (!(width > 0) || !(height > 0)) return landmarks;
  for (const [cocoKey, mp] of Object.entries(COCO_TO_MP)) {
    const kp = keypoints[Number(cocoKey)];
    if (!Array.isArray(kp) || kp.length < 3) continue;
    const [px, py, conf] = kp;
    if (![px, py, conf].every(v => typeof v === 'number' && Number.isFinite(v))) continue;
    const visibility = clamp(conf, 0, 1);
    landmarks[mp] = {
      x: clamp(px / width, -2, 3),
      y: clamp(py / height, -2, 3),
      z: 0,
      visibility,
      presence: visibility,
    };
  }
  return landmarks;
}

/** Build the raw, unmirrored avatar pose message from a server result. */
export function buildPoseMessage(result: PoseResult, timestamp: number): CapturePoseMessage {
  const width = Math.round(result.width), height = Math.round(result.height);
  if (!result.person || !(width > 0) || !(height > 0)) return emptyCapturePose(timestamp, Math.max(0, width), Math.max(0, height));
  const landmarks = cocoToLandmarks(result.keypoints, width, height);
  const message = parseCapturePoseMessage({
    type: 'capture.pose', protocolVersion: 1, timestamp, width, height,
    landmarks, visible: true, confidence: clamp(result.confidence, 0, 1),
  });
  return message ?? emptyCapturePose(timestamp, width, height);
}

/** Validate and normalize a message from the pose server. Returns null if unusable. */
export function parseServerMessage(value: unknown): PoseServerMessage | null {
  let input: unknown = value;
  if (typeof value === 'string') {
    if (value.length > 200_000) return null;
    try { input = JSON.parse(value); } catch { return null; }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  if (data.type === 'ready') {
    const mode = data.inferenceMode === 'baseline' ? 'baseline' : 'learned';
    return { type: 'ready', modelVersion: str(data.modelVersion) || 'yolo26n-pose', inferenceMode: mode };
  }
  if (data.type === 'error') return { type: 'error', message: str(data.message) };
  if (data.type !== 'result') return null;
  const exercise: Exercise = data.exercise === 'pushup' ? 'pushup' : 'squat';
  const keypoints = Array.isArray(data.keypoints)
    ? (data.keypoints as unknown[]).map(row => (Array.isArray(row) ? (row as unknown[]).map(v => num(v)) : []))
    : [];
  const stage = data.stage === 'DOWN' ? 'DOWN' : 'UP';
  const validStages: MovementStage[] = ['squat_top', 'squat_bottom', 'pushup_top', 'pushup_bottom', 'other'];
  const movementStage = validStages.includes(data.movementStage as MovementStage) ? data.movementStage as MovementStage : 'other';
  const side = data.side === 'left' || data.side === 'right' ? data.side : null;
  return {
    type: 'result',
    exercise,
    person: data.person === true,
    side,
    keypoints,
    width: num(data.width),
    height: num(data.height),
    reps: Math.max(0, Math.round(num(data.reps))),
    stage,
    movementStage,
    formScore: clamp(num(data.formScore), 0, 100),
    status: str(data.status),
    error: str(data.error),
    liveFeedback: str(data.liveFeedback),
    primaryAngle: typeof data.primaryAngle === 'number' && Number.isFinite(data.primaryAngle) ? data.primaryAngle : null,
    secondaryAngle: typeof data.secondaryAngle === 'number' && Number.isFinite(data.secondaryAngle) ? data.secondaryAngle : null,
    primaryLabel: str(data.primaryLabel),
    secondaryLabel: str(data.secondaryLabel),
    confidence: clamp(num(data.confidence), 0, 1),
    repCompleted: data.repCompleted === true,
    repValid: data.repValid === true,
    inferenceMs: num(data.inferenceMs),
  };
}

/** Where to reach the local pose server: explicit override, else ws://<host>:8765. */
export function resolvePoseServerUrl(hostname: string | undefined, override: string | null): string {
  if (override && /^wss?:\/\//i.test(override)) return override;
  const host = hostname && hostname.length ? hostname : 'localhost';
  return `ws://${host}:8765`;
}

/** Decode a `data:image/jpeg;base64,...` URL into the raw bytes to send over the socket. */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
