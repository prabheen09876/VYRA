import { describe, expect, it } from 'vitest';
import { parseCaptureControl, resolveParentOrigin } from './bridge';
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
});
