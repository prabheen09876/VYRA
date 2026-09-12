import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { CaptureControl, CaptureMessage, PoseLandmark } from '@vyra/core';

const mocked = vi.hoisted(() => ({
  configure: null as ((control: CaptureControl) => void) | null,
  send: vi.fn(), detect: vi.fn(), close: vi.fn(), create: vi.fn(),
}));
vi.mock('./bridge', () => ({ createCaptureBridge: (configure: (control: CaptureControl) => void) => {
  mocked.configure = configure;
  return { embedded: true, send: mocked.send, dispose: vi.fn() };
} }));
vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: vi.fn(async () => ({})) },
  PoseLandmarker: { createFromOptions: mocked.create },
}));

/** Small DOM adapter for the actual capture entry point; no camera, browser, or model download. */
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
  context = { clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(), lineWidth: 0, strokeStyle: '', fillStyle: '' };
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  removeChild() {}
  appendChild() {}
  getContext() { return this.context; }
  play = vi.fn(async () => {});
  click() { this.dispatchEvent(new Event('click')); }
}

function standing(): PoseLandmark[] {
  const landmarks: PoseLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.95, presence: 0.95 }));
  for (const [shoulder, elbow, wrist, hip, knee, ankle, x] of [[11,13,15,23,25,27,0.4], [12,14,16,24,26,28,0.6]]) {
    for (const [index, y] of [[shoulder,0.15],[elbow,0.27],[wrist,0.39],[hip,0.45],[knee,0.66],[ankle,0.9]]) landmarks[index] = { ...landmarks[index], x, y };
  }
  return landmarks;
}

let nodes: Map<string, Element>, documentTarget: EventTarget & { hidden: boolean }, windowTarget: EventTarget;
let animation: Map<number, FrameRequestCallback>, nextFrame: number;
let camera: ReturnType<typeof vi.fn>, track: EventTarget & { stop: Mock<() => void> }, pose: PoseLandmark[];
const node = (id: string) => {
  if (!nodes.has(id)) { const element = new Element(); element.parentElement = new Element(); nodes.set(id, element); }
  return nodes.get(id)!;
};
const messages = () => mocked.send.mock.calls.map(([message]) => message as CaptureMessage);
const poses = () => messages().filter(message => message.type === 'capture.pose');
const cameraStates = () => messages().filter(message => message.type === 'capture.camera').map(message => message.state);
function frame(time: number, advanceVideo = true) {
  if (advanceVideo) node('video').currentTime += 0.1;
  const callbacks = [...animation.values()]; animation.clear(); callbacks.forEach(callback => callback(time));
}
function configure(overrides: Partial<CaptureControl> = {}) {
  mocked.configure!({ type: 'capture.configure', exercise: 'squat', enabled: false, reset: false, poseStream: true, ...overrides });
}
async function enableCamera() {
  const before = messages().filter(message => message.type === 'capture.ready').length;
  node('start-camera').click();
  await vi.waitFor(() => expect(messages().filter(message => message.type === 'capture.ready')).toHaveLength(before + 1));
}

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); mocked.configure = null;
  nodes = new Map(); animation = new Map(); nextFrame = 0; pose = standing();
  track = Object.assign(new EventTarget(), { stop: vi.fn<() => void>() });
  camera = vi.fn(async () => ({ getTracks: () => [track] }));
  mocked.detect.mockImplementation(() => ({ landmarks: pose.length ? [pose] : [] }));
  mocked.create.mockResolvedValue({ detectForVideo: mocked.detect, close: mocked.close });
  documentTarget = Object.assign(new EventTarget(), {
    hidden: false, body: new Element(), referrer: 'http://localhost:8081/',
    querySelector: () => node('app'), getElementById: node,
  });
  windowTarget = Object.assign(new EventTarget(), { isSecureContext: true });
  vi.stubGlobal('document', documentTarget); vi.stubGlobal('window', windowTarget);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: camera } });
  vi.stubGlobal('location', { search: '', href: 'http://localhost:8787/capture/', origin: 'http://localhost:8787' });
  vi.stubGlobal('fetch', vi.fn(async () => ({ status: 404, ok: false })));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { animation.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => animation.delete(id));
  node('mirror-camera').setAttribute('aria-pressed', 'true');
  await import('./main');
});
afterEach(() => { windowTarget.dispatchEvent(new Event('pagehide')); vi.unstubAllGlobals(); });

describe('capture camera and local pose lifecycle', () => {
  it('does not request camera access on mount or host configuration', async () => {
    configure({ enabled: true, reset: true });
    await Promise.resolve();
    expect(camera).not.toHaveBeenCalled();
    expect(mocked.create).not.toHaveBeenCalled();
    expect(messages().some(message => message.type === 'capture.ready')).toBe(false);
    expect(cameraStates()).toEqual(['stopped']);
    expect(messages().at(-1)).toMatchObject({ type: 'capture.tracking', visible: false, cue: expect.stringContaining('Enable camera') });
    await enableCamera();
    expect(camera).toHaveBeenCalledTimes(1);
    expect(cameraStates()).toEqual(['stopped', 'starting', 'running']);
  });

  it('streams warmup before calibration without reps, and mirroring changes only presentation', async () => {
    configure(); await enableCamera(); frame(100);
    const first = poses().at(-1)!;
    expect(first.visible).toBe(true); expect(first.landmarks).toHaveLength(33);
    expect(messages().filter(message => message.type === 'capture.rep')).toHaveLength(0);
    expect(node('overlay').hidden).toBe(true);
    expect(node('overlay').context.stroke).not.toHaveBeenCalled();
    expect(node('mode').textContent).toBe('On-device tracking');
    node('mirror-camera').click(); frame(200);
    expect(node('video').parentElement!.classes.has('unmirrored')).toBe(true);
    expect(poses().at(-1)!.landmarks).toEqual(first.landmarks);
    configure({ debugOverlay: true }); frame(300);
    expect(node('overlay').hidden).toBe(false); expect(node('overlay').context.stroke).toHaveBeenCalled();
    expect(node('mode').textContent).toBe('Live body tracking');
    expect(camera).toHaveBeenCalledTimes(1);
  });

  it('throttles pose delivery and clears both dropped tracking and frozen video', async () => {
    configure({ debugOverlay: true }); await enableCamera(); frame(100);
    const count = poses().length; frame(120);
    expect(poses()).toHaveLength(count);
    pose = []; frame(200);
    expect(poses().at(-1)).toMatchObject({ visible: false, confidence: 0, landmarks: [] });
    pose = standing(); frame(300);
    expect(poses().at(-1)!.visible).toBe(true);
    expect(node('overlay').context.stroke).toHaveBeenCalled();
    node('overlay').context.clearRect.mockClear();
    frame(1100, false);
    expect(node('overlay').context.clearRect).toHaveBeenCalledOnce();
    expect(node('status').textContent).toBe('Camera feed paused');
    expect(node('status').dataset.visible).toBe('false');
    expect(node('cue').textContent).toContain('Camera feed paused');
    expect(node('confidence').textContent).toBe('Not in view');
    expect(poses().at(-1)).toMatchObject({ visible: false, confidence: 0, landmarks: [] });
    expect(messages().at(-1)).toMatchObject({ type: 'capture.tracking', visible: false, cue: expect.stringContaining('paused') });
  });

  it('clears a subscribed avatar when the host disables streaming during a reset', async () => {
    configure(); await enableCamera(); frame(100);
    expect(poses().at(-1)!.visible).toBe(true);
    configure({ poseStream: false, reset: true });
    expect(poses().at(-1)).toMatchObject({ visible: false, landmarks: [] });
    expect(cameraStates().at(-1)).toBe('running');
    const count = poses().length; frame(300);
    expect(poses()).toHaveLength(count);
  });

  it('releases the track and detector on stop and requires another explicit start', async () => {
    configure(); await enableCamera(); frame(100);
    node('pause-camera').click();
    expect(cameraStates().at(-1)).toBe('stopped');
    expect(track.stop).toHaveBeenCalledTimes(1); expect(mocked.close).toHaveBeenCalledTimes(1);
    expect(node('video').srcObject).toBeNull(); expect(animation.size).toBe(0);
    expect(poses().at(-1)).toMatchObject({ visible: false, landmarks: [] });
    expect(node('placeholder').hidden).toBe(false);
    configure({ enabled: true });
    expect(camera).toHaveBeenCalledTimes(1);
    await enableCamera(); expect(camera).toHaveBeenCalledTimes(2);
  });

  it('stops when hidden, clears the avatar, and stays stopped when returning', async () => {
    configure(); await enableCamera(); frame(100);
    documentTarget.hidden = true; documentTarget.dispatchEvent(new Event('visibilitychange'));
    expect(track.stop).toHaveBeenCalledTimes(1); expect(animation.size).toBe(0);
    expect(poses().at(-1)!.visible).toBe(false);
    expect(cameraStates().at(-1)).toBe('stopped');
    documentTarget.hidden = false; documentTarget.dispatchEvent(new Event('visibilitychange'));
    configure(); expect(camera).toHaveBeenCalledTimes(1);
  });

  it('reports stopped when the camera track ends outside the app', async () => {
    configure(); await enableCamera(); frame(100);
    track.dispatchEvent(new Event('ended'));
    expect(cameraStates().at(-1)).toBe('stopped');
    expect(poses().at(-1)!.visible).toBe(false);
    expect(mocked.close).toHaveBeenCalledTimes(1);
  });

  it('reports stopped after a permission error without claiming tracking is running', async () => {
    camera.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
    configure(); node('start-camera').click();
    await vi.waitFor(() => expect(messages().some(message => message.type === 'capture.error')).toBe(true));
    expect(cameraStates()).toContain('starting');
    expect(cameraStates()).not.toContain('running');
    expect(cameraStates().at(-1)).toBe('stopped');
  });

  it('releases a late permission result after the page has become inactive', async () => {
    let resolve!: (value: { getTracks(): { stop(): void }[] }) => void;
    camera.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    configure(); node('start-camera').click();
    documentTarget.hidden = true; documentTarget.dispatchEvent(new Event('visibilitychange'));
    resolve({ getTracks: () => [track] });
    await vi.waitFor(() => expect(track.stop).toHaveBeenCalledTimes(1));
    expect(mocked.create).not.toHaveBeenCalled();
    expect(messages().some(message => message.type === 'capture.ready')).toBe(false);
  });
});
