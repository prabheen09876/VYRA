import { describe, expect, it } from 'vitest';
import type { MovementStage, PoseLandmark } from './contracts';
import { CompleteCycleCounter, FEATURE_NAMES, assessPose, classifyBaseline, extractPoseFeatures } from './pose';

function standing(): PoseLandmark[] {
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.95, presence: 0.95 }));
  for (const [shoulder, elbow, wrist, hip, knee, ankle, x] of [[11,13,15,23,25,27,0.4], [12,14,16,24,26,28,0.6]]) {
    for (const [index, y] of [[shoulder,0.15],[elbow,0.27],[wrist,0.39],[hip,0.45],[knee,0.66],[ankle,0.9]]) landmarks[index] = { ...landmarks[index], x, y };
  }
  return landmarks;
}

describe('pose input quality and features', () => {
  it('uses aspect-corrected finite joint geometry and preserves translation/scale invariance', () => {
    const pose = standing(), features = extractPoseFeatures(pose, { width: 640, height: 480 })!;
    expect(features).toHaveLength(FEATURE_NAMES.length);
    expect(features[0]).toBeCloseTo(1); expect(features[1]).toBeCloseTo(1); expect(features[2]).toBeCloseTo(1);
    const transformed = pose.map(point => ({ ...point, x: point.x * 0.7 + 0.1, y: point.y * 0.7 + 0.12 }));
    const other = extractPoseFeatures(transformed, { width: 640, height: 480 })!;
    features.forEach((value, i) => expect(other[i]).toBeCloseTo(value, 8));
    expect(classifyBaseline(features, 'squat').stage).toBe('squat_top');
    expect(classifyBaseline(features, 'pushup').stage).toBe('other');
  });
  it('accepts one fully visible side but rejects cropped feet or missing confidence', () => {
    const pose = standing();
    [12,14,16,24,26,28].forEach(i => { pose[i].visibility = 0.1; });
    expect(assessPose(pose, 'squat').visible).toBe(true);
    pose[27].y = 1.1; expect(assessPose(pose, 'squat').visible).toBe(false);
    expect(assessPose(standing().map(({ x, y }) => ({ x, y })), 'squat').visible).toBe(false);
    const invalid = standing(); invalid[11].visibility = NaN; invalid[12].visibility = NaN;
    expect(assessPose(invalid, 'squat').confidence).toBe(0);
  });
  it('rejects missing/degenerate coordinates and invalid image dimensions', () => {
    expect(extractPoseFeatures([], { width: 640, height: 480 })).toBeNull();
    expect(extractPoseFeatures(standing(), { width: 640, height: 0 })).toBeNull();
    const invalid = standing(); invalid[23].x = NaN;
    expect(extractPoseFeatures(invalid, { width: 640, height: 480 })).toBeNull();
  });
});

describe('complete movement cycles', () => {
  const makeCounter = () => { const counter = new CompleteCycleCounter(); counter.configure({ type: 'capture.configure', exercise: 'squat', enabled: true, reset: true }); return counter; };
  const stage = (counter: CompleteCycleCounter, name: MovementStage, times: number[], visible = true) => times.map(timestamp => counter.update({ timestamp, stage: name, visible, confidence: 0.95, formScore: 88 })).filter(Boolean);
  it('counts exactly one stable top-bottom-top cycle, without counting a held pose', () => {
    const counter = makeCounter();
    expect(stage(counter, 'squat_top', [100,200,300])).toHaveLength(0);
    expect(stage(counter, 'squat_bottom', [700,800,900])).toHaveLength(0);
    expect(stage(counter, 'squat_top', [1200,1300,1400,1500,1600])).toEqual([{ exercise: 'squat', confidence: 0.95, formScore: 88 }]);
  });
  it.each([5, 10])('counts complete reps with brief endpoint holds at %i fps', fps => {
    for (const exercise of ['squat', 'pushup'] as const) {
      const counter = new CompleteCycleCounter();
      counter.configure({ type: 'capture.configure', exercise, enabled: true, reset: true });
      const sequence: MovementStage[] = [
        ...Array<MovementStage>(3).fill(`${exercise}_top`),
        ...Array<MovementStage>(3).fill('other'),
        ...Array<MovementStage>(2).fill(`${exercise}_bottom`),
        ...Array<MovementStage>(3).fill('other'),
        ...Array<MovementStage>(4).fill(`${exercise}_top`),
      ];
      const reps = sequence.map((name, index) => counter.update({
        timestamp: 100 + index * 1000 / fps, stage: name, visible: true, confidence: 0.95, formScore: 88,
      })).filter(Boolean);
      expect(reps).toEqual([{ exercise, confidence: 0.95, formScore: 88 }]);
    }
  });
  it('allows a controlled three-second descent and ascent', () => {
    const counter = makeCounter();
    stage(counter, 'squat_top', [100,200,300]);
    stage(counter, 'other', Array.from({ length: 30 }, (_, index) => 400 + index * 100));
    stage(counter, 'squat_bottom', [3400,3500,3600]);
    stage(counter, 'other', Array.from({ length: 30 }, (_, index) => 3700 + index * 100));
    expect(stage(counter, 'squat_top', [6700,6800,6900])).toHaveLength(1);
  });
  it('rejects a one-frame endpoint glitch and a prolonged unrelated movement', () => {
    const counter = makeCounter();
    stage(counter, 'squat_top', [100,200,300]);
    stage(counter, 'squat_bottom', [700]);
    stage(counter, 'other', [800,900,1000]);
    expect(stage(counter, 'squat_top', [1200,1300,1400])).toHaveLength(0);
    stage(counter, 'other', Array.from({ length: 70 }, (_, index) => 1500 + index * 100));
    stage(counter, 'squat_bottom', [8500,8600,8700]);
    expect(stage(counter, 'squat_top', [9000,9100,9200])).toHaveLength(0);
  });
  it('does not count starting at the bottom or an incomplete cycle', () => {
    const counter = makeCounter();
    expect(stage(counter, 'squat_bottom', [100,200,300])).toHaveLength(0);
    expect(stage(counter, 'squat_top', [600,700,800])).toHaveLength(0);
    expect(stage(counter, 'squat_bottom', [1100,1200,1300])).toHaveLength(0);
  });
  it('disarms after lost visibility, a stale frame gap, and backwards timestamps', () => {
    for (const disruption of ['occluded', 'gap', 'backwards']) {
      const counter = makeCounter(); stage(counter, 'squat_top', [100,200,300]); stage(counter, 'squat_bottom', [600,700,800]);
      if (disruption === 'occluded') stage(counter, 'squat_top', [1000], false);
      else if (disruption === 'gap') stage(counter, 'squat_top', [2000]);
      else stage(counter, 'squat_top', [700]);
      expect(stage(counter, 'squat_top', [2200,2300,2400])).toHaveLength(0);
    }
  });
  it('never carries a partial cycle across phase resets, disabled phases or different exercises', () => {
    for (const next of [{ exercise: 'squat' as const, enabled: true }, { exercise: null, enabled: false }, { exercise: 'pushup' as const, enabled: true }]) {
      const counter = makeCounter(); stage(counter, 'squat_top', [100,200,300]); stage(counter, 'squat_bottom', [600,700,800]);
      counter.configure({ type: 'capture.configure', ...next, reset: true });
      expect(stage(counter, 'squat_top', [1000,1100,1200])).toHaveLength(0);
    }
  });
  it('rejects low-confidence endpoints and unrelated exercise predictions', () => {
    const counter = makeCounter(); stage(counter, 'squat_top', [100,200,300]); stage(counter, 'squat_bottom', [600,700,800]);
    counter.update({ timestamp: 900, stage: 'squat_top', visible: true, confidence: 0.2, formScore: 90 });
    expect(stage(counter, 'squat_top', [1000,1100,1200])).toHaveLength(0);
    stage(counter, 'squat_bottom', [1500,1600,1700]); stage(counter, 'pushup_top', [1800]);
    expect(stage(counter, 'squat_top', [1900,2000,2100])).toHaveLength(0);
  });
});
