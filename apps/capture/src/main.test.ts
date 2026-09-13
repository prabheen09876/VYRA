import { beforeEach, afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { CaptureControl, CaptureMessage } from '@vyra/core';
import type { PoseResult } from './poseClient';

const mocked = vi.hoisted(() => ({
  configure: null as ((control: CaptureControl) => void) | null,
  send: vi.fn(),
}));
vi.mock('./bridge', () => ({ createCaptureBridge: (configure: (control: CaptureControl) => void) => {
  mocked.configure = configure;
  return { embedded: true, send: mocked.send, dispose: vi.fn() };
} }));

/** Controllable WebSocket standing in for the local pose server. */
class FakeSocket {
  static instances: FakeSocket[] = [];
  static failNext = 0;
  url: string; binaryType = ''; readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  sent: unknown[] = [];
  constructor(url: string) {
    if (FakeSocket.failNext > 0) { FakeSocket.failNext -= 1; throw new Error('connection refused'); }
    this.url = url; FakeSocket.instances.push(this);
  }
  send(data: unknown) { this.sent.push(data); }
  close() { this.readyState = 3; this.onclose?.(new Event('close')); }
  // test drivers
  open() { this.readyState = 1; this.onopen?.(new Event('open')); }
  emit(message: unknown) { this.onmessage?.({ data: JSON.stringify(message) }); }
}

/** Small DOM adapter for the capture entry point — no real camera, canvas or socket. */
class Element extends EventTarget {
  hidden = false; disabled = false; textContent = ''; innerHTML = ''; value = 'squat';
  width = 640; height = 480; videoWidth = 640; videoHeight = 480; readyState = 4; currentTime = 0;
  srcObject: unknown = null; dataset: Record<string, string> = {}; style: Record<string, string> = {};
  parentElement: Element | null = null;
  attributes = new Map<string, string>();
  classes = new Set<string>();
  classList = {
    add: (...names: string[]) => names.forEach(name => this.classes.add(name)),
    remove: (...names: string[]) => names.forEach(name => this.classes.delete(name)),
    toggle: (name: string, force = !this.classes.has(name)) => { if (force) this.classes.add(name); else this.classes.delete(name); return force; },
  };
  context = { clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(), drawImage: vi.fn(), lineWidth: 0, strokeStyle: '', fillStyle: '' };
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  removeChild() {}
  appendChild() {}
  getContext() { return this.context; }
  toDataURL() { return 'data:image/jpeg;base64,AAAA'; }
  play = vi.fn(async () => {});
  click() { this.dispatchEvent(new Event('click')); }
}

/** A COCO-17 keypoint grid with every mapped joint confidently visible. */
function keypoints(confidence = 0.9): number[][] {
  return Array.from({ length: 17 }, (_, i) => [80 + i * 20, 60 + i * 22, confidence]);
}
function serverResult(overrides: Partial<PoseResult> = {}): PoseResult {
  return {
    type: 'result', exercise: 'squat', person: true, side: 'right', keypoints: keypoints(),
    width: 640, height: 480, reps: 0, stage: 'UP', movementStage: 'squat_top', formScore: 0,
    status: 'TRACKING', error: '', liveFeedback: '', primaryAngle: 170, secondaryAngle: 8,
    primaryLabel: 'Knee', secondaryLabel: 'Torso lean', confidence: 0.9, repCompleted: false,
    repValid: false, inferenceMs: 30, ...overrides,
  };
}

let nodes: Map<string, Element>, documentTarget: EventTarget & { hidden: boolean };
let windowTarget: EventTarget & { isSecureContext: boolean; setTimeout: (cb: () => void, ms: number) => number };
let animation: Map<number, FrameRequestCallback>, nextFrame: number;
let timers: Map<number, () => void>, nextTimer: number;
let camera: ReturnType<typeof vi.fn>, track: EventTarget & { stop: Mock<() => void> }, clock: number;
function flushTimers() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(run => run()); }
const node = (id: string) => {
  if (!nodes.has(id)) { const element = new Element(); element.parentElement = new Element(); nodes.set(id, element); }
  return nodes.get(id)!;
};
const messages = () => mocked.send.mock.calls.map(([message]) => message as CaptureMessage);
const kinds = (type: CaptureMessage['type']) => messages().filter(message => message.type === type);
const poses = () => messages().filter((message): message is Extract<CaptureMessage, { type: 'capture.pose' }> => message.type === 'capture.pose');
const cameraStates = () => kinds('capture.camera').map(message => (message as { state: string }).state);
const reps = () => kinds('capture.rep');
function frame(time: number, advanceVideo = true) {
  clock = time;
  if (advanceVideo) node('video').currentTime += 0.1;
  const callbacks = [...animation.values()]; animation.clear(); callbacks.forEach(callback => callback(time));
}
function step(ws: FakeSocket, time: number, overrides: Partial<PoseResult> = {}, advanceVideo = true) {
  frame(time, advanceVideo); ws.emit(serverResult(overrides));
}
function configure(overrides: Partial<CaptureControl> = {}) {
  mocked.configure!({ type: 'capture.configure', exercise: 'squat', enabled: false, reset: false, poseStream: true, ...overrides });
}
async function enableCamera() {
  node('start-camera').click();
  await vi.waitFor(() => expect(FakeSocket.instances.length).toBeGreaterThan(0));
  const ws = FakeSocket.instances.at(-1)!;
  ws.open();
  ws.emit({ type: 'ready', modelVersion: 'yolo26n-pose', inferenceMode: 'learned' });
  await vi.waitFor(() => expect(kinds('capture.ready').length).toBeGreaterThan(0));
  return ws;
}

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); mocked.configure = null;
  nodes = new Map(); animation = new Map(); nextFrame = 0; timers = new Map(); nextTimer = 0; clock = 0;
  FakeSocket.instances = []; FakeSocket.failNext = 0;
  track = Object.assign(new EventTarget(), { stop: vi.fn<() => void>() });
  camera = vi.fn(async () => ({ getTracks: () => [track] }));
  documentTarget = Object.assign(new EventTarget(), {
    hidden: false, body: new Element(), referrer: 'http://localhost:8081/',
    querySelector: () => node('app'), getElementById: node, createElement: () => new Element(),
  });
  windowTarget = Object.assign(new EventTarget(), {
    isSecureContext: true,
    setTimeout: (callback: () => void, _ms: number) => { timers.set(++nextTimer, callback); return nextTimer; },
  });
  vi.stubGlobal('document', documentTarget); vi.stubGlobal('window', windowTarget);
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('clearTimeout', (id: number) => timers.delete(id));
  vi.stubGlobal('atob', (value: string) => value);
  vi.stubGlobal('performance', { now: () => clock });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: camera } });
  vi.stubGlobal('location', { search: '', hostname: 'localhost', href: 'http://localhost:8787/capture/', origin: 'http://localhost:8787' });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { animation.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => animation.delete(id));
  node('mirror-camera').setAttribute('aria-pressed', 'true');
  await import('./main');
});
afterEach(() => { windowTarget.dispatchEvent(new Event('pagehide')); vi.unstubAllGlobals(); });

describe('capture WebSocket pose lifecycle', () => {
  it('does not connect or request the camera on mount or host configuration', async () => {
    configure({ enabled: true, reset: true });
    await Promise.resolve();
    expect(camera).not.toHaveBeenCalled();
    expect(FakeSocket.instances).toHaveLength(0);
    expect(kinds('capture.ready')).toHaveLength(0);
    expect(cameraStates()).toEqual(['stopped']);
    expect(messages().at(-1)).toMatchObject({ type: 'capture.tracking', visible: false, cue: expect.stringContaining('Enable camera') });
  });

  it('connects to the local server and announces ready and running on Enable', async () => {
    configure();
    const ws = await enableCamera();
    expect(ws.url).toBe('ws://localhost:8765');
    expect(camera).toHaveBeenCalledTimes(1);
    expect(cameraStates()).toEqual(['stopped', 'starting', 'running']);
    expect(kinds('capture.ready').at(-1)).toMatchObject({ modelVersion: 'yolo26n-pose', inferenceMode: 'learned' });
  });

  it('streams live pose, metrics and skeleton from a person result', async () => {
    configure({ debugOverlay: true });
    const ws = await enableCamera();
    step(ws, 100);
    const pose = poses().at(-1)!;
    expect(pose).toMatchObject({ visible: true });
    expect(pose.landmarks).toHaveLength(33);
    expect(pose.landmarks.filter(l => (l.visibility ?? 0) > 0)).toHaveLength(15);
    expect(node('reps').textContent).toBe('0');
    expect(node('angle-primary-label').textContent).toBe('Knee');
    expect(node('angle-primary').textContent).toBe('170°');
    expect(node('confidence').textContent).toBe('90%');
    expect(node('status').textContent).toBe('Tracking ready');
    expect(node('overlay').hidden).toBe(false);
    expect(node('overlay').context.stroke).toHaveBeenCalled();
    expect(node('mode').textContent).toBe('Live body tracking');
    expect(ws.sent.length).toBeGreaterThan(0);
  });

  it('throttles live pose delivery to the avatar interval', async () => {
    configure();
    const ws = await enableCamera();
    step(ws, 100);
    const count = poses().length;
    step(ws, 120);
    expect(poses()).toHaveLength(count);
    step(ws, 200);
    expect(poses().length).toBeGreaterThan(count);
  });

  it('clears the avatar when the person leaves the frame', async () => {
    configure();
    const ws = await enableCamera();
    step(ws, 100);
    expect(poses().at(-1)!.visible).toBe(true);
    step(ws, 200, { person: false, keypoints: [], confidence: 0, movementStage: 'other', primaryAngle: null, secondaryAngle: null });
    expect(poses().at(-1)).toMatchObject({ visible: false, confidence: 0, landmarks: [] });
    expect(node('confidence').textContent).toBe('Not in view');
    expect(messages().at(-1)).toMatchObject({ type: 'capture.tracking', visible: false });
  });

  it('relays a completed rep only while enabled and the exercise matches', async () => {
    configure({ exercise: 'squat', enabled: true, reset: true });
    const ws = await enableCamera();
    step(ws, 100, { reps: 1, repCompleted: true, repValid: true, formScore: 82, stage: 'UP' });
    expect(reps()).toHaveLength(1);
    expect(reps().at(-1)).toMatchObject({ exercise: 'squat', formScore: 82, modelVersion: 'yolo26n-pose' });
    expect(node('reps').textContent).toBe('1');
    // a pushup completion is ignored while the squat set is active
    step(ws, 200, { exercise: 'pushup', reps: 1, repCompleted: true, repValid: true });
    expect(reps()).toHaveLength(1);
  });

  it('never relays a rep while practice is paused', async () => {
    configure({ exercise: 'squat', enabled: false });
    const ws = await enableCamera();
    step(ws, 100, { reps: 1, repCompleted: true, repValid: true });
    expect(reps()).toHaveLength(0);
  });

  it('mirroring changes only presentation, not the streamed landmarks', async () => {
    configure();
    const ws = await enableCamera();
    step(ws, 100);
    const first = poses().at(-1)!;
    node('mirror-camera').click();
    step(ws, 200);
    expect(node('video').parentElement!.classes.has('unmirrored')).toBe(true);
    expect(poses().at(-1)!.landmarks).toEqual(first.landmarks);
  });

  it('clears a subscribed avatar when the host disables streaming during a reset', async () => {
    configure();
    const ws = await enableCamera();
    step(ws, 100);
    expect(poses().at(-1)!.visible).toBe(true);
    configure({ poseStream: false, reset: true });
    expect(poses().at(-1)).toMatchObject({ visible: false, landmarks: [] });
    expect(cameraStates().at(-1)).toBe('running');
    const count = poses().length;
    step(ws, 300);
    expect(poses()).toHaveLength(count);
  });

  it('clears tracking and reports a frozen camera feed', async () => {
    configure({ debugOverlay: true });
    const ws = await enableCamera();
    step(ws, 100); step(ws, 300);
    node('overlay').context.clearRect.mockClear();
    frame(1200, false);
    expect(node('status').textContent).toBe('Camera feed paused');
    expect(node('cue').textContent).toContain('Camera feed paused');
    expect(node('confidence').textContent).toBe('Not in view');
    expect(poses().at(-1)).toMatchObject({ visible: false, landmarks: [] });
  });

  it('releases the track and socket on stop and requires another explicit start', async () => {
    configure();
    const ws = await enableCamera();
    step(ws, 100);
    node('pause-camera').click();
    expect(cameraStates().at(-1)).toBe('stopped');
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(ws.readyState).toBe(3);
    expect(node('video').srcObject).toBeNull();
    expect(animation.size).toBe(0);
    expect(poses().at(-1)).toMatchObject({ visible: false, landmarks: [] });
    expect(node('placeholder').hidden).toBe(false);
    await enableCamera();
    expect(camera).toHaveBeenCalledTimes(2);
  });

  it('stops when the tab is hidden and stays stopped when it returns', async () => {
    configure();
    const ws = await enableCamera();
    step(ws, 100);
    documentTarget.hidden = true; documentTarget.dispatchEvent(new Event('visibilitychange'));
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(animation.size).toBe(0);
    expect(cameraStates().at(-1)).toBe('stopped');
    documentTarget.hidden = false; documentTarget.dispatchEvent(new Event('visibilitychange'));
    configure();
    expect(camera).toHaveBeenCalledTimes(1);
  });

  it('reports stopped when the camera track ends outside the app', async () => {
    configure();
    await enableCamera();
    track.dispatchEvent(new Event('ended'));
    expect(cameraStates().at(-1)).toBe('stopped');
    expect(poses().at(-1)!.visible).toBe(false);
  });

  it('reports stopped after a permission error without claiming tracking is running', async () => {
    camera.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
    configure();
    node('start-camera').click();
    await vi.waitFor(() => expect(kinds('capture.error').length).toBeGreaterThan(0));
    expect(cameraStates()).toContain('starting');
    expect(cameraStates()).not.toContain('running');
    expect(cameraStates().at(-1)).toBe('stopped');
  });

  it('surfaces an offline pose server but keeps the camera preview and recovers on reconnect', async () => {
    FakeSocket.failNext = 1; // first socket construction throws (server not running)
    configure();
    node('start-camera').click();
    await vi.waitFor(() => expect(kinds('capture.error').length).toBeGreaterThan(0));
    expect(messages().at(-1)).toMatchObject({ type: 'capture.error', code: 'POSE_SERVER_OFFLINE' });
    expect(cameraStates().at(-1)).toBe('stopped');
    expect(node('placeholder').hidden).toBe(true); // preview stays up
    expect(node('video').srcObject).not.toBeNull();
    expect(camera).toHaveBeenCalledTimes(1);
    // the scheduled reconnect now finds the server up
    flushTimers();
    const ws = FakeSocket.instances.at(-1)!;
    ws.open();
    ws.emit({ type: 'ready', modelVersion: 'yolo26n-pose', inferenceMode: 'learned' });
    expect(cameraStates().at(-1)).toBe('running');
    step(ws, 100);
    expect(poses().at(-1)!.visible).toBe(true);
    expect(camera).toHaveBeenCalledTimes(1);
  });

  it('reconnects seamlessly after a transient socket drop without reopening the camera', async () => {
    configure();
    const ws = await enableCamera();
    step(ws, 100);
    ws.close();
    expect(cameraStates().at(-1)).toBe('running'); // never told the host the camera stopped
    expect(messages().at(-1)).toMatchObject({ type: 'capture.tracking', visible: false, cue: expect.stringContaining('Reconnecting') });
    flushTimers();
    const next = FakeSocket.instances.at(-1)!;
    expect(next).not.toBe(ws);
    next.open();
    next.emit({ type: 'ready', modelVersion: 'yolo26n-pose', inferenceMode: 'learned' });
    step(next, 200);
    expect(poses().at(-1)!.visible).toBe(true);
    expect(camera).toHaveBeenCalledTimes(1);
    expect(kinds('capture.ready')).toHaveLength(1); // no duplicate ready on a seamless reconnect
  });
});
