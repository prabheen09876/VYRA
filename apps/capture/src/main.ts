import {
  emptyCapturePose, LIVE_POSE_INTERVAL_MS, LIVE_POSE_MAX_AGE_MS,
  type CaptureCameraState, type CaptureControl, type CaptureMessage, type Exercise, type MovementStage,
} from '@vyra/core';
import { createCaptureBridge } from './bridge';
import {
  buildPoseMessage, dataUrlToBytes, parseServerMessage, resolvePoseServerUrl,
  type PoseResult,
} from './poseClient';
import brandLogo from '../../../packages/brand/assets/logo.png';
import './styles.css';

const params = new URLSearchParams(location.search);
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <main class="studio">
    <header class="masthead"><span class="brand"><img class="brand-logo" src="${brandLogo}" alt="" width="38" height="38" /><span>VYRA</span></span><span class="mode" id="mode">YOLO26 tracking</span></header>
    <h1>Make your movement count.</h1>
    <p class="intro">Set your device down, leave room to move, and keep your whole body in view. The live preview and rep counter come from the on-device YOLO26 pose server.</p>
    <div class="workspace">
      <section class="camera" aria-label="Live movement camera">
        <video id="video" autoplay playsinline muted></video><canvas id="overlay" aria-hidden="true" hidden></canvas>
        <div class="camera-placeholder" id="placeholder">
          <svg viewBox="0 0 80 80" fill="none" aria-hidden="true"><rect x="11" y="21" width="58" height="44" rx="10" stroke="currentColor" stroke-width="2"/><path d="M27 21l5-8h16l5 8" stroke="currentColor" stroke-width="2"/><circle cx="40" cy="43" r="13" stroke="currentColor" stroke-width="2"/><path d="M53 31h6" stroke="currentColor" stroke-width="2"/></svg>
          <p id="camera-help">Your camera stays on this device. Only movement results are shared with the game.</p>
          <button class="primary" id="start-camera">Enable camera</button>
        </div>
        <span class="camera-badge" id="status" data-visible="false">Camera off</span>
        <div class="camera-tools" id="camera-tools" hidden><button id="mirror-camera" aria-pressed="true">Mirror on</button><button id="pause-camera">Stop camera</button></div>
        <p class="cue" id="cue" aria-live="polite">Place the camera at a slight side angle for squats.</p>
      </section>
      <aside class="side-panel" aria-label="Practice controls">
        <label>Practice movement<select id="exercise"><option value="squat">Squat</option><option value="pushup">Push-up</option></select></label>
        <div class="counter"><strong id="reps">0</strong><span>reps</span></div>
        <button id="practice" disabled>Start practice</button>
        <div class="metrics">
          <span>Form<strong id="form">—</strong></span><span>Phase<strong id="phase">—</strong></span>
          <span id="angle-primary-cell"><span id="angle-primary-label">Angle</span><strong id="angle-primary">—</strong></span>
          <span id="angle-secondary-cell"><span id="angle-secondary-label">Angle</span><strong id="angle-secondary">—</strong></span>
          <span>Confidence<strong id="confidence">—</strong></span><span>Tracking rate<strong id="fps">—</strong></span>
        </div>
        <p class="note">Reps count only while a set is running. YOLO26 tracks your joints; form and depth are scored per rep.</p>
      </aside>
    </div>
    <div class="error" id="error" role="status"></div>
    <div class="actions"><button id="reset">Reset practice</button><button id="stop-camera" disabled>Stop camera</button><button id="debug-overlay" aria-pressed="false">Show tracking overlay</button></div>
    <footer class="footer"><span>On-device YOLO26 pose processing. No video recording or upload.</span></footer>
  </main>`;

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const setText = (id: string, value: string) => { element(id).textContent = value; };
const video = element<HTMLVideoElement>('video'), canvas = element<HTMLCanvasElement>('overlay');
const context = canvas.getContext('2d')!;
const sendCanvas = document.createElement('canvas');
const sendContext = sendCanvas.getContext('2d')!;
const startButton = element<HTMLButtonElement>('start-camera'), stopButton = element<HTMLButtonElement>('stop-camera');
const practiceButton = element<HTMLButtonElement>('practice'), exerciseSelect = element<HTMLSelectElement>('exercise');
const errorBox = element<HTMLDivElement>('error'), status = element<HTMLSpanElement>('status'), cue = element<HTMLParagraphElement>('cue');
const mode = element<HTMLSpanElement>('mode');

const MAX_SEND_WIDTH = 640;
const JPEG_QUALITY = 0.6;
const RESULT_STALE_MS = 1500;
const RECONNECT_DELAY_MS = 1600;
const CONNECT_TIMEOUT_MS = 15000;
const TRACKING_INTERVAL_MS = 240;

let control: CaptureControl = { type: 'capture.configure', exercise: 'squat', enabled: false, reset: true };
let stream: MediaStream | null = null, socket: WebSocket | null = null;
let running = false, booting = false, socketReady = false, intentionalClose = false, cameraLive = false;
let frameRequest = 0, runGeneration = 0, reconnectTimer = 0;
let awaitingResult = false, lastSentAt = -Infinity, lastResultAt = -Infinity, lastVideoTime = -1, frameStale = false;
let modelVersion = 'yolo26n-pose', inferenceMode: 'learned' | 'baseline' = 'learned';
let poseWasVisible = false, offlineReported = false, reps = 0;
let resultTimes: number[] = [];
let lastPoseEmit = -Infinity, lastTrackingEmit = -Infinity, lastTrackingVisible = false, connectTimer = 0;

const bridge = createCaptureBridge(configure);
document.body.classList.toggle('embedded', bridge.embedded);
if (bridge.embedded) { mode.parentElement!.removeChild(mode); element<HTMLElement>('status').parentElement!.appendChild(mode); }

const emit = (message: CaptureMessage) => bridge.send(message);
const emitCameraState = (state: CaptureCameraState) => emit({ type: 'capture.camera', protocolVersion: 1, state });
const serverExercise = (): Exercise => control.exercise ?? (exerciseSelect.value as Exercise);
function updateModelLabel() {
  mode.textContent = control.debugOverlay ? 'Live body tracking' : socketReady ? `YOLO26 · ${modelVersion}` : 'YOLO26 tracking';
}

function setError(code: string, message: string) {
  errorBox.textContent = message;
  emitCameraState('stopped');
  emit({ type: 'capture.error', protocolVersion: 1, code, message });
}
function clearLivePose(force = false) {
  if (control.poseStream || force) emit(emptyCapturePose(Date.now(), video.videoWidth || 0, video.videoHeight || 0));
  poseWasVisible = false;
}

function configure(next: CaptureControl) {
  const exerciseChanged = next.exercise !== control.exercise;
  const resetServer = next.reset || exerciseChanged || (next.enabled && !control.enabled);
  const wasStreaming = !!control.poseStream;
  control = { ...next };
  if (resetServer) { reps = 0; setText('reps', '0'); }
  if (resetServer || wasStreaming !== !!next.poseStream) clearLivePose(wasStreaming);
  canvas.hidden = !next.debugOverlay;
  if (!next.debugOverlay) context.clearRect(0, 0, canvas.width, canvas.height);
  const debugButton = element<HTMLButtonElement>('debug-overlay');
  debugButton.setAttribute('aria-pressed', String(!!next.debugOverlay));
  debugButton.textContent = next.debugOverlay ? 'Hide tracking overlay' : 'Show tracking overlay';
  updateModelLabel();
  if (next.exercise) exerciseSelect.value = next.exercise;
  sendConfigure(resetServer);
  if (!running && !booting) {
    emitCameraState('stopped');
    emit({ type: 'capture.tracking', protocolVersion: 1, visible: false, confidence: 0, stage: 'other', fps: 0, cue: 'Camera off. Tap Enable camera when you are ready.' });
  }
}
function setPractice(enabled: boolean) {
  configure({ ...control, type: 'capture.configure', exercise: exerciseSelect.value as Exercise, enabled, reset: enabled });
  practiceButton.textContent = enabled ? 'Pause practice' : 'Start practice';
}
function sendConfigure(reset: boolean) {
  if (socket && socketReady) {
    socket.send(JSON.stringify({ type: 'configure', exercise: serverExercise(), enabled: control.enabled, reset }));
  }
}

function connectSocket() {
  const generation = runGeneration;
  const url = resolvePoseServerUrl(location.hostname, params.get('poseServer'));
  let ws: WebSocket;
  try { ws = new WebSocket(url); } catch (error) {
    reportOffline(url, error); scheduleReconnect(generation); return;
  }
  ws.binaryType = 'arraybuffer';
  socket = ws; socketReady = false;
  clearTimeout(connectTimer);
  connectTimer = window.setTimeout(() => { if (generation === runGeneration && !socketReady) reportOffline(url, null); }, CONNECT_TIMEOUT_MS);
  ws.onopen = () => { if (generation !== runGeneration) { ws.close(); return; } status.textContent = 'Loading pose model…'; };
  ws.onmessage = event => { if (generation === runGeneration) handleServerMessage(event.data); };
  ws.onerror = () => { /* onclose follows and drives recovery */ };
  ws.onclose = () => {
    clearTimeout(connectTimer);
    if (generation !== runGeneration || intentionalClose) return;
    socketReady = false; awaitingResult = false;
    interruptTracking('Reconnecting to the pose server…');
    scheduleReconnect(generation);
  };
}
function scheduleReconnect(generation: number) {
  clearTimeout(reconnectTimer);
  reconnectTimer = window.setTimeout(() => { if (generation === runGeneration && cameraLive) connectSocket(); }, RECONNECT_DELAY_MS);
}
function reportOffline(url: string, error: unknown) {
  if (offlineReported) return;
  offlineReported = true;
  const detail = error instanceof Error ? ` (${error.message})` : '';
  setError('POSE_SERVER_OFFLINE', `Can't reach the pose server at ${url}. Start it with "npm run pose:server", then tap Restart camera.${detail}`);
}

function handleServerMessage(data: unknown) {
  const message = parseServerMessage(data);
  if (!message) return;
  if (message.type === 'ready') {
    clearTimeout(connectTimer);
    modelVersion = message.modelVersion; inferenceMode = message.inferenceMode;
    const wasRunning = running;
    socketReady = true; running = true; errorBox.textContent = '';
    // Re-announce running+ready on first connect and after recovering from an offline blip,
    // so the host restores tracking; stay silent on a seamless transient reconnect.
    if (!wasRunning || offlineReported) {
      emitCameraState('running');
      emit({ type: 'capture.ready', protocolVersion: 1, modelVersion, inferenceMode });
    }
    if (!wasRunning) frameRequest = requestAnimationFrame(pump);
    offlineReported = false;
    updateModelLabel();
    sendConfigure(true);
    return;
  }
  if (message.type === 'error') return;
  handleResult(message);
}

const CONNECTIONS = [
  [0, 3], [0, 4], [5, 6], [5, 7], [7, 9], [6, 8], [8, 10], [5, 11], [6, 12], [11, 12],
  [11, 13], [13, 15], [12, 14], [14, 16],
];
function drawSkeleton(keypoints: number[][], width: number, height: number, visible: boolean) {
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!(width > 0) || !(height > 0)) return;
  const sx = canvas.width / width, sy = canvas.height / height;
  const conf = (i: number) => (Array.isArray(keypoints[i]) ? keypoints[i][2] ?? 0 : 0);
  const at = (i: number) => ({ x: (keypoints[i]?.[0] ?? 0) * sx, y: (keypoints[i]?.[1] ?? 0) * sy });
  // Same spark/danger pair as the badge dot and CaptureSurface's status dot — one tracking state.
  context.lineWidth = Math.max(2, canvas.width / 240); context.strokeStyle = visible ? '#3D7BFF' : '#FF5A5F'; context.fillStyle = '#F2F5F8';
  for (const [a, b] of CONNECTIONS) {
    if (conf(a) < 0.35 || conf(b) < 0.35) continue;
    const p = at(a), q = at(b);
    context.beginPath(); context.moveTo(p.x, p.y); context.lineTo(q.x, q.y); context.stroke();
  }
  for (let i = 0; i < 17; i++) {
    if (conf(i) < 0.35) continue;
    const p = at(i);
    context.beginPath(); context.arc(p.x, p.y, Math.max(3, canvas.width / 150), 0, Math.PI * 2); context.fill();
  }
}

function cueFor(result: PoseResult, visible: boolean): string {
  if (!visible) return serverExercise() === 'squat'
    ? 'Step back until your shoulders, hips, knees and feet are in view.'
    : 'Set up side-on. Keep your shoulders, hands, hips and feet in view.';
  if (!control.enabled) return bridge.embedded ? 'Camera ready. Waiting for the movement phase.' : 'Ready. Start practice when you are comfortable.';
  return result.liveFeedback || result.error || (result.stage === 'DOWN' ? 'Drive back up to finish the rep.' : 'Lower with control.');
}

function handleResult(result: PoseResult) {
  lastResultAt = performance.now(); awaitingResult = false; frameStale = false;
  const now = lastResultAt;
  resultTimes.push(now); resultTimes = resultTimes.filter(t => now - t < 2000);
  const elapsed = now - resultTimes[0], fps = elapsed >= 500 ? (resultTimes.length - 1) * 1000 / elapsed : 0;
  const visible = result.person && result.confidence >= 0.4;

  reps = result.reps; setText('reps', String(reps));
  const messageCue = cueFor(result, visible);
  cue.textContent = messageCue;
  status.textContent = visible ? (control.enabled ? 'Tracking' : 'Tracking ready') : 'Adjust your position';
  status.dataset.visible = String(visible);

  setText('form', result.formScore > 0 ? `${Math.round(result.formScore)}%` : '—');
  setText('phase', !visible ? '—' : result.stage === 'DOWN' ? 'Down' : 'Up');
  setText('angle-primary-label', result.primaryLabel || 'Angle');
  setText('angle-secondary-label', result.secondaryLabel || 'Angle');
  setText('angle-primary', visible && result.primaryAngle !== null ? `${Math.round(result.primaryAngle)}°` : '—');
  setText('angle-secondary', visible && result.secondaryAngle !== null ? `${Math.round(result.secondaryAngle)}°` : '—');
  setText('confidence', visible ? `${Math.round(result.confidence * 100)}%` : 'Not in view');
  setText('fps', fps ? `${fps.toFixed(1)} fps` : 'Measuring…');

  if (control.poseStream) {
    if (visible) {
      if (now - lastPoseEmit >= LIVE_POSE_INTERVAL_MS) { emit(buildPoseMessage(result, Date.now())); lastPoseEmit = now; }
      poseWasVisible = true;
    } else if (poseWasVisible) clearLivePose();
  }

  if (visible !== lastTrackingVisible || now - lastTrackingEmit >= TRACKING_INTERVAL_MS) {
    emit({ type: 'capture.tracking', protocolVersion: 1, visible, confidence: visible ? result.confidence : 0,
      stage: visible ? result.movementStage : ('other' as MovementStage), fps: Math.round(fps * 10) / 10,
      formScore: visible && result.formScore > 0 ? result.formScore : undefined, cue: messageCue });
    lastTrackingEmit = now; lastTrackingVisible = visible;
  }

  if (result.repCompleted && control.enabled && control.exercise === result.exercise) {
    emit({ type: 'capture.rep', protocolVersion: 1, exercise: result.exercise,
      confidence: Math.max(0, Math.min(1, result.confidence)), formScore: Math.round(result.formScore),
      modelVersion, occurredAt: Date.now() });
  }

  if (control.debugOverlay) drawSkeleton(result.keypoints, result.width, result.height, visible);
}

function interruptTracking(message: string) {
  clearLivePose();
  context.clearRect(0, 0, canvas.width, canvas.height);
  status.textContent = 'Restoring tracking'; status.dataset.visible = 'false'; cue.textContent = message;
  setText('confidence', 'Not in view'); setText('fps', '—');
  lastTrackingVisible = false;
  emit({ type: 'capture.tracking', protocolVersion: 1, visible: false, confidence: 0, stage: 'other', fps: 0, cue: message });
}

function captureFrameBytes(): Uint8Array | null {
  const w = video.videoWidth, h = video.videoHeight;
  if (!(w > 0) || !(h > 0)) return null;
  const scale = Math.min(1, MAX_SEND_WIDTH / w);
  const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
  if (sendCanvas.width !== cw || sendCanvas.height !== ch) { sendCanvas.width = cw; sendCanvas.height = ch; }
  sendContext.drawImage(video, 0, 0, cw, ch);
  try { return dataUrlToBytes(sendCanvas.toDataURL('image/jpeg', JPEG_QUALITY)); } catch { return null; }
}

function pump(now: number) {
  if (!running) return;
  frameRequest = requestAnimationFrame(pump);
  if (awaitingResult && now - lastSentAt > RESULT_STALE_MS) awaitingResult = false;
  if (video.readyState < 2 || video.currentTime === lastVideoTime) {
    if (Number.isFinite(lastResultAt) && now - lastResultAt > LIVE_POSE_MAX_AGE_MS && !frameStale) {
      frameStale = true; clearLivePose();
      context.clearRect(0, 0, canvas.width, canvas.height);
      status.textContent = 'Camera feed paused'; status.dataset.visible = 'false';
      cue.textContent = 'Camera feed paused. Check your camera or restart it.';
      setText('confidence', 'Not in view'); setText('fps', '—');
      emit({ type: 'capture.tracking', protocolVersion: 1, visible: false, confidence: 0, stage: 'other', fps: 0, cue: cue.textContent });
    }
    return;
  }
  if (!socket || !socketReady || awaitingResult) return;
  const bytes = captureFrameBytes();
  if (!bytes) return;
  lastVideoTime = video.currentTime;
  // bytes spans a fresh full-length ArrayBuffer, so its buffer is exactly the frame.
  try { socket.send(bytes.buffer as ArrayBuffer); awaitingResult = true; lastSentAt = now; } catch { awaitingResult = false; }
}

async function startCamera() {
  if (running || booting || document.hidden) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    setError('SECURE_CONTEXT_REQUIRED', 'Camera access requires HTTPS or localhost. A plain HTTP address on your Wi-Fi network cannot enable the camera.'); return;
  }
  const generation = ++runGeneration;
  booting = true; startButton.disabled = true; errorBox.textContent = ''; offlineReported = false; intentionalClose = false;
  status.textContent = 'Opening camera…';
  emitCameraState('starting');
  emit({ type: 'capture.tracking', protocolVersion: 1, visible: false, confidence: 0, stage: 'other', fps: 0, cue: 'Opening camera and connecting to the pose server…' });
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 } } });
    if (generation !== runGeneration) { stream.getTracks().forEach(track => track.stop()); stream = null; return; }
    for (const track of stream.getTracks()) track.addEventListener('ended', () => { if (generation === runGeneration) stopCamera(); }, { once: true });
    video.srcObject = stream;
    await video.play();
    if (generation !== runGeneration) return;
    lastVideoTime = -1; lastResultAt = -Infinity; frameStale = false; awaitingResult = false; resultTimes = [];
    lastPoseEmit = -Infinity; lastTrackingEmit = -Infinity; lastTrackingVisible = false; cameraLive = true;
    element<HTMLElement>('placeholder').hidden = true; stopButton.disabled = false; practiceButton.disabled = false;
    element<HTMLElement>('camera-tools').hidden = false;
    status.textContent = 'Connecting to pose server…';
    connectSocket();
    // The frame pump starts only once the server is ready (see handleServerMessage), so it
    // never spins while running is still false.
  } catch (error) {
    stopCamera();
    const message = error instanceof DOMException && error.name === 'NotAllowedError'
      ? 'Camera permission was not granted. Allow camera access in your browser or Expo Go settings, then retry.'
      : `Camera could not start. ${error instanceof Error ? error.message : ''}`;
    setError('CAMERA_START_FAILED', message);
  } finally { booting = false; startButton.disabled = false; }
}

function stopCamera() {
  ++runGeneration; running = false; booting = false; socketReady = false; awaitingResult = false; intentionalClose = true; cameraLive = false;
  cancelAnimationFrame(frameRequest); clearTimeout(reconnectTimer); clearTimeout(connectTimer);
  stream?.getTracks().forEach(track => track.stop()); stream = null; video.srcObject = null;
  if (socket) { try { socket.close(); } catch { /* already closing */ } socket = null; }
  context.clearRect(0, 0, canvas.width, canvas.height);
  clearLivePose();
  element<HTMLElement>('camera-tools').hidden = true;
  element<HTMLElement>('placeholder').hidden = false; startButton.textContent = 'Enable camera';
  status.textContent = 'Camera off'; status.dataset.visible = 'false'; stopButton.disabled = true; practiceButton.disabled = true;
  for (const id of ['form', 'phase', 'angle-primary', 'angle-secondary', 'confidence', 'fps']) setText(id, '—');
  emitCameraState('stopped');
  emit({ type: 'capture.tracking', protocolVersion: 1, visible: false, confidence: 0, stage: 'other', fps: 0, cue: 'Camera paused. Tap Enable camera to resume.' });
}

startButton.addEventListener('click', () => void startCamera());
stopButton.addEventListener('click', stopCamera);
element<HTMLButtonElement>('pause-camera').addEventListener('click', stopCamera);
element<HTMLButtonElement>('mirror-camera').addEventListener('click', event => {
  const button = event.currentTarget as HTMLButtonElement;
  const mirrored = button.getAttribute('aria-pressed') !== 'true';
  button.setAttribute('aria-pressed', String(mirrored)); button.textContent = mirrored ? 'Mirror on' : 'Mirror off';
  video.parentElement!.classList.toggle('unmirrored', !mirrored);
});
element<HTMLButtonElement>('debug-overlay').addEventListener('click', () => configure({ ...control, reset: false, debugOverlay: !control.debugOverlay }));
practiceButton.addEventListener('click', () => setPractice(!control.enabled));
exerciseSelect.addEventListener('change', () => setPractice(false));
element<HTMLButtonElement>('reset').addEventListener('click', () => { reps = 0; setText('reps', '0'); configure({ ...control, reset: true }); });
document.addEventListener('visibilitychange', () => { if (document.hidden && (running || booting)) stopCamera(); });
window.addEventListener('pagehide', stopCamera);
