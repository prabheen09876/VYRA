import { describe, expect, it } from 'vitest';
import type { CapturePoseMessage, PoseLandmark } from './contracts';
import { emptyCapturePose, isLivePoseFresh, LIVE_POSE_MAX_AGE_MS, parseCaptureMessage, parseCapturePoseMessage } from './live-pose';
import { assessPose, extractPoseFeatures } from './pose';

function packet(): CapturePoseMessage {
  const landmarks: PoseLandmark[] = Array.from({ length: 33 }, (_, index) => ({ x: 0.3 + index / 100, y: 0.3, z: -(index + 1) / 100, visibility: 0.95, presence: 0.9 }));
  for (const [shoulder, elbow, wrist, hip, knee, ankle, x] of [[11,13,15,23,25,27,0.4], [12,14,16,24,26,28,0.6]]) {
    for (const [index, y] of [[shoulder,0.15],[elbow,0.27],[wrist,0.39],[hip,0.45],[knee,0.66],[ankle,0.9]]) landmarks[index] = { ...landmarks[index], x, y };
  }
  return { type: 'capture.pose', protocolVersion: 1, timestamp: 10_000, width: 640, height: 480, landmarks, visible: true, confidence: 0.9 };
}

describe('local avatar pose protocol', () => {
  it('preserves raw anatomical indices and coordinates without mutating or retaining source points', () => {
    const input = packet(), copy = structuredClone(input);
    const parsed = parseCapturePoseMessage(input)!;
    expect(parsed).toEqual(copy);
    expect(parsed.landmarks).not.toBe(input.landmarks);
    expect(parsed.landmarks[11]).not.toBe(input.landmarks[11]);
    input.landmarks[11].x = 0.99;
    expect(parsed.landmarks[11].x).toBe(0.4);
    expect(parsed.landmarks[12].x).toBe(0.6);
    expect(parseCaptureMessage(JSON.stringify(copy))).toEqual(copy);
  });

  it.each([
    ['short packet', (input: CapturePoseMessage) => { input.landmarks.pop(); }],
    ['long packet', (input: CapturePoseMessage) => { input.landmarks.push({ ...input.landmarks[0] }); }],
    ['sparse packet', (input: CapturePoseMessage) => { delete input.landmarks[5]; }],
    ['NaN coordinate', (input: CapturePoseMessage) => { input.landmarks[0].x = NaN; }],
    ['infinite depth', (input: CapturePoseMessage) => { input.landmarks[0].z = Infinity; }],
    ['implausible coordinate', (input: CapturePoseMessage) => { input.landmarks[0].y = 1000; }],
    ['bad landmark quality', (input: CapturePoseMessage) => { input.landmarks[0].visibility = -0.1; }],
    ['missing landmark quality', (input: CapturePoseMessage) => { delete input.landmarks[0].visibility; }],
    ['bad presence', (input: CapturePoseMessage) => { input.landmarks[0].presence = 2; }],
    ['bad confidence', (input: CapturePoseMessage) => { input.confidence = 1.1; }],
    ['nonfinite timestamp', (input: CapturePoseMessage) => { input.timestamp = NaN; }],
    ['missing dimensions', (input: CapturePoseMessage) => { input.width = 0; }],
    ['oversized dimensions', (input: CapturePoseMessage) => { input.height = 9000; }],
  ])('rejects %s', (_, mutate) => {
    const input = packet(); mutate(input);
    expect(parseCapturePoseMessage(input)).toBeNull();
    expect(parseCaptureMessage(input)).toBeNull();
  });

  it('accepts finite out-of-frame points but requires actual point objects', () => {
    const input = packet(); input.landmarks[0].x = -0.1;
    expect(parseCapturePoseMessage(input)?.landmarks[0].x).toBe(-0.1);
    expect(parseCapturePoseMessage({ ...input, landmarks: input.landmarks.map(point => JSON.stringify(point)) })).toBeNull();
  });

  it('uses empty, zero-confidence loss packets so stale limbs cannot survive reset or stop', () => {
    const lost = emptyCapturePose(10_000);
    expect(parseCaptureMessage(lost)).toEqual(lost);
    expect(isLivePoseFresh(lost, 10_000)).toBe(false);
    expect(parseCapturePoseMessage({ ...packet(), visible: false })).toBeNull();
    expect(parseCapturePoseMessage({ ...lost, confidence: 0.8 })).toBeNull();
    expect(parseCapturePoseMessage({ ...lost, landmarks: [null] })).toBeNull();
  });

  it('expires frozen frames and refuses future timestamps', () => {
    const input = packet();
    expect(isLivePoseFresh(input, input.timestamp)).toBe(true);
    expect(isLivePoseFresh(input, input.timestamp + LIVE_POSE_MAX_AGE_MS)).toBe(true);
    expect(isLivePoseFresh(input, input.timestamp + LIVE_POSE_MAX_AGE_MS + 1)).toBe(false);
    expect(isLivePoseFresh(input, input.timestamp - 1)).toBe(false);
    expect(isLivePoseFresh(null)).toBe(false);
  });

  it('keeps exercise geometry unchanged by presentation mirroring', () => {
    const input = packet(), mirrored = input.landmarks.map(point => ({ ...point, x: 1 - point.x }));
    const raw = extractPoseFeatures(input.landmarks, input)!;
    const flipped = extractPoseFeatures(mirrored, input)!;
    raw.forEach((value, index) => expect(flipped[index]).toBeCloseTo(value, 8));
    expect(assessPose(input.landmarks, 'squat')).toEqual(assessPose(mirrored, 'squat'));
    // The bridge never applies this optional display transform to the transmitted pose.
    expect(parseCaptureMessage(input)).toEqual(input);
  });
});

describe('capture message boundary', () => {
  it('accepts only explicit camera lifecycle states', () => {
    for (const state of ['starting', 'running', 'stopped']) {
      const message = { type: 'capture.camera', protocolVersion: 1, state };
      expect(parseCaptureMessage(message)).toEqual(message);
      expect(parseCaptureMessage(JSON.stringify(message))).toEqual(message);
    }
    expect(parseCaptureMessage({ type: 'capture.camera', protocolVersion: 1, state: 'recording' })).toBeNull();
    expect(parseCaptureMessage({ type: 'capture.camera', protocolVersion: 1, state: true })).toBeNull();
  });
  it('rejects unknown commands, oversized payloads and malformed tracking/rep data', () => {
    for (const input of [null, [], 'not json', ' '.repeat(24_001), { type: 'capture.anything', protocolVersion: 1 },
      { type: 'capture.ready', protocolVersion: 2, modelVersion: 'baseline', inferenceMode: 'baseline' },
      { type: 'capture.rep', protocolVersion: 1, exercise: 'deadlift', confidence: 0.9, formScore: 90, modelVersion: 'baseline', occurredAt: 10_000 },
      { type: 'capture.tracking', protocolVersion: 1, visible: true, confidence: 0.9, stage: 'squat_top', fps: Infinity, cue: 'Ready' }]) {
      expect(parseCaptureMessage(input)).toBeNull();
    }
  });

  it('preserves valid zero scores instead of turning them into perfect form', () => {
    const rep = { type: 'capture.rep', protocolVersion: 1, exercise: 'pushup', confidence: 0.9, formScore: 0, modelVersion: 'baseline', occurredAt: 10_000 };
    const tracking = { type: 'capture.tracking', protocolVersion: 1, visible: false, confidence: 0, stage: 'other', fps: 0, formScore: 0, cue: 'Step into view' };
    expect(parseCaptureMessage(rep)).toEqual(rep);
    expect(parseCaptureMessage(tracking)).toEqual(tracking);
  });
});
