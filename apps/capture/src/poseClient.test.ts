import { describe, expect, it } from 'vitest';
import {
  buildPoseMessage, cocoToLandmarks, dataUrlToBytes, parseServerMessage, resolvePoseServerUrl,
  type PoseResult,
} from './poseClient';

function result(overrides: Partial<PoseResult> = {}): PoseResult {
  return {
    type: 'result', exercise: 'squat', person: true, side: 'right',
    keypoints: Array.from({ length: 17 }, (_, i) => [100 + i, 80 + i, 0.9]),
    width: 640, height: 480, reps: 0, stage: 'UP', movementStage: 'squat_top', formScore: 0,
    status: '', error: '', liveFeedback: '', primaryAngle: 160, secondaryAngle: 12,
    primaryLabel: 'Knee', secondaryLabel: 'Torso lean', confidence: 0.8, repCompleted: false,
    repValid: false, inferenceMs: 25, ...overrides,
  };
}

describe('cocoToLandmarks', () => {
  it('maps the 15 used COCO joints into normalized MediaPipe slots and leaves the rest hidden', () => {
    const kp = Array.from({ length: 17 }, (_, i) => [i * 32, i * 24, 0.7]);
    const landmarks = cocoToLandmarks(kp, 640, 480);
    expect(landmarks).toHaveLength(33);
    // COCO 5 (left shoulder) -> MP 11
    expect(landmarks[11]).toMatchObject({ x: (5 * 32) / 640, y: (5 * 24) / 480, visibility: 0.7, presence: 0.7 });
    // COCO 16 (right ankle) -> MP 28
    expect(landmarks[28].visibility).toBeCloseTo(0.7);
    // an unmapped slot stays a zero-visibility placeholder
    expect(landmarks[1]).toMatchObject({ x: 0, y: 0, visibility: 0 });
    expect(landmarks.filter(l => (l.visibility ?? 0) > 0)).toHaveLength(15);
  });

  it('returns all-hidden landmarks for degenerate dimensions', () => {
    const landmarks = cocoToLandmarks([[1, 2, 0.9]], 0, 480);
    expect(landmarks.every(l => (l.visibility ?? 0) === 0)).toBe(true);
  });
});

describe('buildPoseMessage', () => {
  it('produces a visible pose message from a person result', () => {
    const message = buildPoseMessage(result(), 1234);
    expect(message).toMatchObject({ type: 'capture.pose', visible: true, width: 640, height: 480, timestamp: 1234 });
    expect(message.landmarks).toHaveLength(33);
    expect(message.confidence).toBeCloseTo(0.8);
  });

  it('returns an empty pose when no person is present', () => {
    const message = buildPoseMessage(result({ person: false }), 5);
    expect(message).toMatchObject({ visible: false, landmarks: [], confidence: 0 });
  });
});

describe('parseServerMessage', () => {
  it('parses and clamps a result payload', () => {
    const parsed = parseServerMessage(JSON.stringify(result({ reps: 3.6, formScore: 140, confidence: 2 })));
    expect(parsed).toMatchObject({ type: 'result', reps: 4, formScore: 100, confidence: 1, exercise: 'squat' });
  });

  it('parses ready and error frames and rejects junk', () => {
    expect(parseServerMessage('{"type":"ready","modelVersion":"yolo26n-pose","inferenceMode":"learned"}'))
      .toEqual({ type: 'ready', modelVersion: 'yolo26n-pose', inferenceMode: 'learned' });
    expect(parseServerMessage('{"type":"error","message":"boom"}')).toEqual({ type: 'error', message: 'boom' });
    expect(parseServerMessage('not json')).toBeNull();
    expect(parseServerMessage('{"type":"other"}')).toBeNull();
  });

  it('coerces an unknown movement stage to other', () => {
    const parsed = parseServerMessage(JSON.stringify(result({ movementStage: 'bogus' as PoseResult['movementStage'] })));
    expect(parsed).toMatchObject({ movementStage: 'other' });
  });
});

describe('resolvePoseServerUrl', () => {
  it('defaults to ws://<host>:8765', () => {
    expect(resolvePoseServerUrl('192.168.1.20', null)).toBe('ws://192.168.1.20:8765');
    expect(resolvePoseServerUrl(undefined, null)).toBe('ws://localhost:8765');
  });
  it('honours a ws(s) override and ignores a non-ws override', () => {
    expect(resolvePoseServerUrl('localhost', 'wss://pose.example:9000')).toBe('wss://pose.example:9000');
    expect(resolvePoseServerUrl('localhost', 'http://nope')).toBe('ws://localhost:8765');
  });
});

describe('dataUrlToBytes', () => {
  it('decodes the base64 payload after the comma', () => {
    const bytes = dataUrlToBytes('data:image/jpeg;base64,' + btoa('hi'));
    expect(Array.from(bytes)).toEqual(['h'.charCodeAt(0), 'i'.charCodeAt(0)]);
  });
});
