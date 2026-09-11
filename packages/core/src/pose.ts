import type { CaptureControl, Exercise, MovementStage, PoseLandmark } from './contracts';

export const FEATURE_VERSION = 'pose-geometry-v1';
export const FEATURE_NAMES = [
  'knee_angle', 'hip_angle', 'elbow_angle', 'body_verticality',
  'upper_arm_verticality', 'forearm_verticality', 'torso_shin_ratio',
  'wrist_shoulder_y', 'hip_shoulder_y', 'ankle_hip_y',
  'wrist_ankle_distance', 'shoulder_ankle_distance', 'knee_hip_y', 'stance_ratio',
] as const;
export const MOVEMENT_STAGES: MovementStage[] = ['squat_top', 'squat_bottom', 'pushup_top', 'pushup_bottom', 'other'];
export const BASELINE_VERSION = 'geometric-baseline-v1';
export interface FrameSize { width: number; height: number }
export interface PoseFrame extends FrameSize { landmarks: PoseLandmark[]; timestamp: number }
/** Native implementations emit the same normalized, unmirrored landmarks as the web adapter. */
export interface PoseAdapter {
  start(onFrame: (frame: PoseFrame) => void, onError: (error: Error) => void): Promise<void>;
  stop(): void;
}
type Side = 'left' | 'right';
const SIDES = { left: { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 }, right: { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 } } as const;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const finitePoint = (p: PoseLandmark | undefined): p is PoseLandmark => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
const quality = (p: PoseLandmark | undefined): number => {
  if (!finitePoint(p)) return 0;
  const value = Math.min(p.visibility ?? 0, p.presence ?? p.visibility ?? 0);
  return Number.isFinite(value) ? clamp(value, 0, 1) : 0;
};

export interface PoseAssessment { visible: boolean; confidence: number; side: Side; cue: string }
export function assessPose(landmarks: PoseLandmark[], exercise: Exercise, threshold = 0.65): PoseAssessment {
  const scores = (Object.entries(SIDES) as [Side, typeof SIDES.left | typeof SIDES.right][]).map(([side, ids]) => {
    const required = exercise === 'squat' ? [ids.shoulder, ids.hip, ids.knee, ids.ankle] : [ids.shoulder, ids.elbow, ids.wrist, ids.hip, ids.ankle];
    const confidence = Math.min(...required.map(i => {
      const p = landmarks[i];
      return finitePoint(p) && p.x >= 0.015 && p.x <= 0.985 && p.y >= 0.015 && p.y <= 0.985 ? quality(p) : 0;
    }));
    return { side, confidence };
  });
  const best = scores[0].confidence >= scores[1].confidence ? scores[0] : scores[1];
  const visible = landmarks.length === 33 && best.confidence >= threshold;
  return { ...best, visible, cue: visible ? 'Body in view' : exercise === 'squat' ? 'Step back until your shoulders, hips, knees and feet are in view.' : 'Place the camera to your side. Keep your shoulders, hands, hips and feet in view.' };
}

interface Point { x: number; y: number }
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
function angle(a: Point, b: Point, c: Point): number {
  const u = { x: a.x - b.x, y: a.y - b.y }, v = { x: c.x - b.x, y: c.y - b.y };
  const denominator = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y);
  if (denominator < 1e-8) return 0;
  return Math.acos(clamp((u.x * v.x + u.y * v.y) / denominator, -1, 1)) / Math.PI;
}
const verticality = (a: Point, b: Point) => Math.abs(a.y - b.y) / Math.max(distance(a, b), 1e-8);

/** Aspect-corrected, translation/scale-invariant 2D features; angles are divided by 180 degrees. */
export function extractPoseFeatures(landmarks: PoseLandmark[], size: FrameSize, preferredSide?: Side): number[] | null {
  if (landmarks.length !== 33 || !Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) return null;
  if (![11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].every(i => finitePoint(landmarks[i]))) return null;
  const points = landmarks.map(p => ({ x: p.x * size.width / size.height, y: p.y }));
  const sideQuality = (side: Side) => Math.min(...Object.values(SIDES[side]).map(i => quality(landmarks[i])));
  const ids = SIDES[preferredSide ?? (sideQuality('left') >= sideQuality('right') ? 'left' : 'right')];
  const shoulder = points[ids.shoulder], elbow = points[ids.elbow], wrist = points[ids.wrist];
  const hip = points[ids.hip], knee = points[ids.knee], ankle = points[ids.ankle];
  const torso = distance(shoulder, hip), shin = distance(knee, ankle);
  if (torso < 0.02 || shin < 0.01) return null;
  const features = [
    angle(hip, knee, ankle), angle(shoulder, hip, knee), angle(shoulder, elbow, wrist),
    verticality(shoulder, hip), verticality(shoulder, elbow), verticality(elbow, wrist),
    torso / shin, (wrist.y - shoulder.y) / torso, (hip.y - shoulder.y) / torso,
    (ankle.y - hip.y) / torso, distance(wrist, ankle) / torso,
    distance(shoulder, ankle) / torso, (knee.y - hip.y) / torso,
    distance(points[27], points[28]) / torso,
  ];
  return features.every(Number.isFinite) ? features.map(x => clamp(x, -8, 8)) : null;
}

export interface StagePrediction { stage: MovementStage; confidence: number; formScore: number; cue: string }
/** A transparent heuristic used only while no genuine team-recorded stage model is available. */
export function classifyBaseline(features: number[], exercise: Exercise): StagePrediction {
  if (features.length !== FEATURE_NAMES.length || features.some(x => !Number.isFinite(x))) return { stage: 'other', confidence: 0, formScore: 0, cue: 'Tracking unavailable' };
  const [knee, hip, elbow, upright] = features;
  if (exercise === 'squat') {
    if (upright < 0.65) return { stage: 'other', confidence: 0, formScore: 0, cue: 'Face slightly sideways with your whole body in view.' };
    if (knee >= 0.87 && hip >= 0.78) return { stage: 'squat_top', confidence: 1, formScore: 100, cue: 'Stand tall, then lower with control.' };
    if (knee <= 0.62 && hip <= 0.82) return { stage: 'squat_bottom', confidence: 1, formScore: Math.round(clamp(130 - knee * 90, 60, 100)), cue: 'Return to standing to complete the rep.' };
    return { stage: 'other', confidence: 0, formScore: 70, cue: 'Keep moving through a comfortable range.' };
  }
  if (upright > 0.62 || hip < 0.68) return { stage: 'other', confidence: 0, formScore: 0, cue: 'Set up side-on with shoulders, hips and ankles aligned.' };
  const formScore = Math.round(clamp((hip - 0.65) / 0.3 * 100, 0, 100));
  if (elbow >= 0.84) return { stage: 'pushup_top', confidence: 1, formScore, cue: 'Lower with control, then press back up.' };
  if (elbow <= 0.65) return { stage: 'pushup_bottom', confidence: 1, formScore, cue: 'Press back up to complete the rep.' };
  return { stage: 'other', confidence: 0, formScore, cue: 'Keep your body aligned through the movement.' };
}

export interface CounterInput { timestamp: number; stage: MovementStage; visible: boolean; confidence: number; formScore: number }
export interface CompletedRep { exercise: Exercise; confidence: number; formScore: number }
/** Debounced top -> bottom -> top cycles. A lost/late frame or phase change disarms the cycle. */
export class CompleteCycleCounter {
  private exercise: Exercise | null = null;
  private enabled = false;
  private state: 'unarmed' | 'top' | 'bottom' = 'unarmed';
  private candidate: MovementStage = 'other';
  private candidateSince = 0;
  private candidateFrames = 0;
  private lastTimestamp: number | null = null;
  private cycleStarted = 0;
  private lastRelevant = 0;
  private confidence = 1;
  private formScore = 100;

  configure(control: CaptureControl): void {
    if (control.reset || control.exercise !== this.exercise || control.enabled !== this.enabled) this.reset();
    this.exercise = control.exercise;
    this.enabled = control.enabled && control.exercise !== null;
  }

  reset(): void {
    this.state = 'unarmed'; this.candidate = 'other'; this.candidateFrames = 0;
    this.candidateSince = 0; this.lastTimestamp = null; this.cycleStarted = 0;
    this.lastRelevant = 0; this.confidence = 1; this.formScore = 100;
  }

  update(frame: CounterInput): CompletedRep | null {
    if (!this.enabled || !this.exercise) { this.reset(); return null; }
    if (!Number.isFinite(frame.timestamp) || !frame.visible || !Number.isFinite(frame.confidence) || !Number.isFinite(frame.formScore)) { this.reset(); return null; }
    if (this.lastTimestamp !== null && (frame.timestamp <= this.lastTimestamp || frame.timestamp - this.lastTimestamp > 650)) { this.reset(); this.lastTimestamp = frame.timestamp; return null; }
    this.lastTimestamp = frame.timestamp;
    const top: MovementStage = `${this.exercise}_top`, bottom: MovementStage = `${this.exercise}_bottom`;
    if (frame.stage !== 'other' && frame.stage !== top && frame.stage !== bottom) { this.reset(); return null; }
    if (this.state !== 'unarmed' && frame.timestamp - this.cycleStarted > 15000) { this.reset(); return null; }
    if (frame.stage === 'other') {
      this.candidate = 'other'; this.candidateFrames = 0;
      if (this.state !== 'unarmed' && frame.timestamp - this.lastRelevant > 2200) this.reset();
      return null;
    }
    if (frame.confidence < 0.65) { this.reset(); return null; }
    this.lastRelevant = frame.timestamp;
    if (this.candidate !== frame.stage) { this.candidate = frame.stage; this.candidateSince = frame.timestamp; this.candidateFrames = 1; }
    else this.candidateFrames += 1;
    this.confidence = Math.min(this.confidence, frame.confidence);
    if (this.state !== 'unarmed') this.formScore = Math.min(this.formScore, clamp(frame.formScore, 0, 100));
    if (this.candidateFrames < 3 || frame.timestamp - this.candidateSince < 140) return null;
    if (this.state === 'unarmed' && frame.stage === top) {
      this.state = 'top'; this.cycleStarted = frame.timestamp; this.confidence = frame.confidence; this.formScore = clamp(frame.formScore, 0, 100);
    } else if (this.state === 'top' && frame.stage === bottom && frame.timestamp - this.cycleStarted >= 250) {
      this.state = 'bottom';
    } else if (this.state === 'bottom' && frame.stage === top && frame.timestamp - this.cycleStarted >= 650) {
      const rep = { exercise: this.exercise, confidence: clamp(this.confidence, 0, 1), formScore: Math.round(this.formScore) };
      this.state = 'top'; this.cycleStarted = frame.timestamp; this.confidence = frame.confidence; this.formScore = frame.formScore;
      return rep;
    }
    return null;
  }
}
