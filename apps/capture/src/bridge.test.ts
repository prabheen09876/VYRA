import { describe, expect, it } from 'vitest';
import { parseCaptureControl, resolveParentOrigin } from './bridge';
import { CompleteCycleCounter } from '@vyra/core';
describe('capture bridge trust boundary', () => {
  it('accepts only the defined configure command with explicit booleans and movement', () => {
    expect(parseCaptureControl('{"type":"capture.configure","exercise":"squat","enabled":true,"reset":true}')).toEqual({ type: 'capture.configure', exercise: 'squat', enabled: true, reset: true });
    expect(parseCaptureControl({ type: 'capture.configure', exercise: 'deadlift', enabled: true, reset: true })).toBeNull();
    expect(parseCaptureControl({ type: 'capture.configure', exercise: 'squat', enabled: 'true', reset: true })).toBeNull();
    expect(parseCaptureControl('not json')).toBeNull();
  });
  it('requires the real referrer origin and refuses a query-selected third-party origin', () => {
    expect(resolveParentOrigin('https://capture.example', 'https://app.example/game', 'https://app.example', ['https://app.example'])).toBe('https://app.example');
    expect(resolveParentOrigin('https://capture.example', 'https://untrusted.example/game', null)).toBeNull();
    expect(resolveParentOrigin('https://capture.example', 'https://app.example/game', 'https://attacker.example')).toBeNull();
    expect(resolveParentOrigin('https://capture.example', '', 'https://attacker.example')).toBeNull();
    expect(resolveParentOrigin('http://localhost:5174', 'http://localhost:8081/', null)).toBe('http://localhost:8081');
  });
  it('allows only explicit local pose and overlay toggles', () => {
    const input = { type: 'capture.configure', exercise: 'squat', enabled: false, reset: false, poseStream: true, debugOverlay: false };
    expect(parseCaptureControl(input)).toEqual(input);
    expect(parseCaptureControl({ ...input, poseStream: 'true' })).toBeNull();
    expect(parseCaptureControl({ ...input, debugOverlay: 1 })).toBeNull();
    expect(parseCaptureControl(' '.repeat(2001))).toBeNull();
  });
  it('preserves a complete-cycle rep across a display-only control update', () => {
    const counter = new CompleteCycleCounter();
    counter.configure({ type: 'capture.configure', exercise: 'squat', enabled: true, reset: true });
    const update = (stage: 'squat_top' | 'squat_bottom', times: number[]) => times.map(timestamp => counter.update({ timestamp, stage, visible: true, confidence: 0.95, formScore: 90 })).filter(Boolean);
    update('squat_top', [100, 200, 300]);
    update('squat_bottom', [700, 800, 900]);
    counter.configure(parseCaptureControl({ type: 'capture.configure', exercise: 'squat', enabled: true, reset: false, poseStream: true, debugOverlay: true })!);
    expect(update('squat_top', [1200, 1300, 1400])).toEqual([{ exercise: 'squat', confidence: 0.95, formScore: 90 }]);
  });
});
