import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import {
  BASELINE_VERSION, CompleteCycleCounter, MOVEMENT_STAGES, assessPose, classifyBaseline,
  extractPoseFeatures, predictMovementStage, validateStageModel,
  type CaptureControl, type CaptureMessage, type Exercise, type MovementStage,
  type PoseLandmark, type StageModelArtifact,
} from '@vyra/core';
import { createCaptureBridge } from './bridge';
import { DatasetRecorder } from './recorder';
import './styles.css';

const params = new URLSearchParams(location.search);
const labMode = params.get('lab') === '1';
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <main class="studio">
    <header class="masthead"><span class="brand">VYRA</span><span class="mode" id="mode">Geometric baseline · no team model loaded</span></header>
    <h1>Make your movement count.</h1>
    <p class="intro">Set your device down, leave room to move, and keep your whole body in view. Start with a comfortable practice rep.</p>
    <div class="workspace">
      <section class="camera" aria-label="Live movement camera">
        <video id="video" autoplay playsinline muted></video><canvas id="overlay" aria-hidden="true"></canvas>
        <div class="camera-placeholder" id="placeholder">
          <svg viewBox="0 0 80 80" fill="none" aria-hidden="true"><rect x="11" y="21" width="58" height="44" rx="10" stroke="currentColor" stroke-width="2"/><path d="M27 21l5-8h16l5 8" stroke="currentColor" stroke-width="2"/><circle cx="40" cy="43" r="13" stroke="currentColor" stroke-width="2"/><path d="M53 31h6" stroke="currentColor" stroke-width="2"/></svg>
          <p id="camera-help">Your camera stays on this device. Only movement results are shared with the game.</p>
          <button class="primary" id="start-camera">Enable camera</button>
        </div>
        <span class="camera-badge" id="status" data-visible="false">Camera off</span>
        <p class="cue" id="cue" aria-live="polite">Place the camera at a slight side angle for squats.</p>
      </section>
      <aside class="side-panel" aria-label="Practice controls">
        <label>Practice movement<select id="exercise"><option value="squat">Squat</option><option value="pushup">Push-up</option></select></label>
        <div class="counter"><strong id="reps">0</strong><span>complete reps</span></div>
        <button id="practice" disabled>Start practice</button>
        <div class="metrics"><span>Observed tracking rate<strong id="fps">—</strong></span><span>Landmark confidence<strong id="confidence">—</strong></span></div>
        <p class="note">A rep counts after you start at the top, lower, and return. Tracking loss clears incomplete movements.</p>
      </aside>
    </div>
    <div class="error" id="error" role="status"></div>
    <div class="actions"><button id="reset">Reset practice</button><button id="stop-camera" disabled>Stop camera</button></div>
    <footer class="footer"><span>On-device pose processing. No video recording or upload.</span><a href="${labMode ? './' : '?lab=1'}">${labMode ? 'Back to practice' : 'Open dataset recorder'}</a></footer>
    ${labMode ? `<section class="lab"><h2>Team dataset recorder</h2><p class="note">Record only consenting participants. P01–P03 are training, P04 is validation, and P05 is the final held-out participant. Label the actual movement yourself; the baseline never supplies training labels.</p>
      <div class="lab-grid"><label>Participant<select id="participant">${['P01','P02','P03','P04','P05'].map(id => `<option>${id}</option>`).join('')}</select></label><label>Clip ID<input id="clip" maxlength="64" /></label><label>Current ground-truth stage<select id="label">${MOVEMENT_STAGES.map(stage => `<option value="${stage}">${stage.replaceAll('_', ' ')}</option>`).join('')}</select></label></div>
      <div class="actions"><button id="record" disabled>Start labeled clip</button><button id="download" disabled>Download landmark JSONL</button></div><p class="lab-count" id="lab-count">0 labeled frames. Nothing has been uploaded.</p><p class="note">Change the stage label while recording, or record separate short holds. Use a new clip ID for each recording. Download before leaving this page.</p></section>` : ''}
  </main>`;

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const video = element<HTMLVideoElement>('video'), canvas = element<HTMLCanvasElement>('overlay');
const context = canvas.getContext('2d')!;
const startButton = element<HTMLButtonElement>('start-camera'), stopButton = element<HTMLButtonElement>('stop-camera');
const practiceButton = element<HTMLButtonElement>('practice'), exerciseSelect = element<HTMLSelectElement>('exercise');
const errorBox = element<HTMLDivElement>('error'), status = element<HTMLSpanElement>('status'), cue = element<HTMLParagraphElement>('cue');
const mode = element<HTMLSpanElement>('mode');
const counter = new CompleteCycleCounter(), recorder = new DatasetRecorder();
let control: CaptureControl = { type: 'capture.configure', exercise: 'squat', enabled: false, reset: true };
let detector: PoseLandmarker | null = null, stream: MediaStream | null = null, stageModel: StageModelArtifact | null = null;
let running = false, booting = false, frameRequest = 0, runGeneration = 0;
let embeddedStartAttempted = false;
let calibrated = false, calibrationStarted: number | null = null;
let lastVideoTime = -1, lastInferenceTime = -Infinity, lastTrackingMessage = -Infinity, practiceReps = 0;
let frameTimes: number[] = [];
const bridge = createCaptureBridge(configure);
document.body.classList.toggle('embedded', bridge.embedded);
if (bridge.embedded) { mode.parentElement!.removeChild(mode); element<HTMLElement>('status').parentElement!.appendChild(mode); }

const modelVersion = () => stageModel?.modelVersion ?? BASELINE_VERSION;
const emit = (message: CaptureMessage) => bridge.send(message);
function setError(code: string, message: string) {
  errorBox.textContent = message;
  emit({ type: 'capture.error', protocolVersion: 1, code, message });
}
function clearCalibration() { calibrated = false; calibrationStarted = null; counter.reset(); }
function configure(next: CaptureControl) {
  const changed = next.reset || next.exercise !== control.exercise || next.enabled !== control.enabled;
  control = { ...next };
  counter.configure(next);
  if (changed) clearCalibration();
  if (next.exercise) exerciseSelect.value = next.exercise;
  if (bridge.embedded) recorder.stop();
  if (bridge.embedded && !embeddedStartAttempted && !document.hidden) {
    embeddedStartAttempted = true;
    void startCamera();
  }
}
function setPractice(enabled: boolean) {
  configure({ type: 'capture.configure', exercise: exerciseSelect.value as Exercise, enabled, reset: true });
  practiceButton.textContent = enabled ? 'Pause practice' : 'Start practice';
}

async function fetchWithTimeout(url: string, timeout = 12000): Promise<Response> {
  const abort = new AbortController(), timeoutId = setTimeout(() => abort.abort(), timeout);
  try { return await fetch(url, { signal: abort.signal, credentials: 'same-origin' }); }
  finally { clearTimeout(timeoutId); }
}
async function loadStageModel() {
  stageModel = null;
  mode.textContent = 'Geometric baseline · no team model loaded';
  try {
    const response = await fetchWithTimeout(params.get('model') ?? '/models/movement-stage.json');
    if (response.status === 404) return;
    if (!response.ok) throw new Error(`Model request returned HTTP ${response.status}`);
    if (Number(response.headers.get('content-length')) > 2_000_000) throw new Error('Model is larger than the allowed 2 MB');
    const text = await response.text();
    if (text.length > 2_000_000) throw new Error('Model is larger than the allowed 2 MB');
    const validated = validateStageModel(JSON.parse(text));
    if (validated.provenance.kind !== 'team-recorded') throw new Error('Synthetic test fixtures cannot be used as a team-trained model');
    stageModel = validated;
    mode.textContent = `Team-trained stage model · ${stageModel.modelVersion}`;
  } catch (error) {
    mode.textContent = 'Geometric baseline · trained model unavailable';
    errorBox.textContent = `Continuing in geometric baseline mode. ${error instanceof Error ? error.message : 'The trained model could not be loaded.'}`;
  }
}

async function startCamera() {
  if (running || booting) return;
  if (bridge.embedded) embeddedStartAttempted = true;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    setError('SECURE_CONTEXT_REQUIRED', 'Camera access requires HTTPS or localhost. A plain HTTP address on your Wi-Fi network cannot enable the camera.'); return;
  }
  const generation = ++runGeneration;
  booting = true; startButton.disabled = true; errorBox.textContent = '';
  status.textContent = 'Opening camera…';
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 } } });
    if (generation !== runGeneration) { stream.getTracks().forEach(track => track.stop()); stream = null; return; }
    video.srcObject = stream;
    await video.play();
    status.textContent = 'Loading pose detector…';
    const wasmPath = new URL('wasm/', new URL(import.meta.env.BASE_URL, location.href)).href;
    const fileset = await FilesetResolver.forVisionTasks(wasmPath);
    const posePath = params.get('poseModel') ?? '/models/pose_landmarker_lite.task';
    try {
      detector = await PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: posePath, delegate: 'GPU' }, runningMode: 'VIDEO', numPoses: 1, outputSegmentationMasks: false, minPoseDetectionConfidence: 0.6, minPosePresenceConfidence: 0.6, minTrackingConfidence: 0.6 });
    } catch {
      // Some WebViews cannot initialize a WebGL delegate. This is still real on-device inference.
      detector = await PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: posePath, delegate: 'CPU' }, runningMode: 'VIDEO', numPoses: 1, outputSegmentationMasks: false, minPoseDetectionConfidence: 0.6, minPosePresenceConfidence: 0.6, minTrackingConfidence: 0.6 });
    }
    await loadStageModel();
    if (generation !== runGeneration) { detector?.close(); detector = null; return; }
    running = true; lastVideoTime = -1; lastInferenceTime = -Infinity; frameTimes = []; clearCalibration();
    element<HTMLElement>('placeholder').hidden = true; stopButton.disabled = false; practiceButton.disabled = false;
    if (labMode) element<HTMLButtonElement>('record').disabled = false;
    emit({ type: 'capture.ready', protocolVersion: 1, modelVersion: modelVersion(), inferenceMode: stageModel ? 'learned' : 'baseline' });
    frameRequest = requestAnimationFrame(processFrame);
  } catch (error) {
    stopCamera();
    const message = error instanceof DOMException && error.name === 'NotAllowedError'
      ? 'Camera permission was not granted. Allow camera access in your browser or Expo Go settings, then retry.'
      : `Camera or pose detector could not start. Check that the local WASM files and pose model are available, then retry. ${error instanceof Error ? error.message : ''}`;
    setError('CAMERA_START_FAILED', message);
  } finally { booting = false; startButton.disabled = false; }
}

function stopCamera() {
  ++runGeneration; running = false; cancelAnimationFrame(frameRequest); clearCalibration();
  stream?.getTracks().forEach(track => track.stop()); stream = null; video.srcObject = null;
  detector?.close(); detector = null; recorder.stop();
  context.clearRect(0, 0, canvas.width, canvas.height);
  element<HTMLElement>('placeholder').hidden = false; startButton.textContent = 'Enable camera';
  status.textContent = 'Camera off'; status.dataset.visible = 'false'; stopButton.disabled = true; practiceButton.disabled = true;
  element<HTMLElement>('fps').textContent = '—'; element<HTMLElement>('confidence').textContent = '—';
  if (labMode) { element<HTMLButtonElement>('record').disabled = true; updateLab(); }
  emit({ type: 'capture.tracking', protocolVersion: 1, visible: false, confidence: 0, stage: 'other', fps: 0, cue: 'Camera paused. Tap Enable camera to resume.' });
}

const CONNECTIONS = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,29],[29,31],[28,30],[30,32]];
function drawPose(landmarks: PoseLandmark[], visible: boolean) {
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
  context.clearRect(0, 0, canvas.width, canvas.height);
  // Nocturne spark / danger / text, the same pair as the `--track` / `--alert` badge dot in
  // styles.css and CaptureSurface.tsx's status dot. All three read the same tracking state, so
  // they move together or the screen shows one state in three colours.
  context.lineWidth = Math.max(2, canvas.width / 240); context.strokeStyle = visible ? '#3D7BFF' : '#FF5A5F'; context.fillStyle = '#F2F5F8';
  for (const [start, end] of CONNECTIONS) {
    const a = landmarks[start], b = landmarks[end];
    if (!a || !b || (a.visibility ?? 0) < 0.5 || (b.visibility ?? 0) < 0.5) continue;
    context.beginPath(); context.moveTo(a.x * canvas.width, a.y * canvas.height); context.lineTo(b.x * canvas.width, b.y * canvas.height); context.stroke();
  }
  for (const index of [11,12,13,14,15,16,23,24,25,26,27,28]) {
    const point = landmarks[index]; if (!point || (point.visibility ?? 0) < 0.5) continue;
    context.beginPath(); context.arc(point.x * canvas.width, point.y * canvas.height, Math.max(3, canvas.width / 150), 0, Math.PI * 2); context.fill();
  }
}

function processFrame(now: number) {
  if (!running || !detector) return;
  if (video.readyState < 2 || video.currentTime === lastVideoTime || now - lastInferenceTime < 95) { frameRequest = requestAnimationFrame(processFrame); return; }
  lastInferenceTime = now; lastVideoTime = video.currentTime;
  try {
    const result = detector.detectForVideo(video, now);
    const landmarks: PoseLandmark[] = result.landmarks[0] ?? [];
    const exercise = control.exercise ?? exerciseSelect.value as Exercise;
    const assessment = assessPose(landmarks, exercise);
    const features = extractPoseFeatures(landmarks, { width: video.videoWidth, height: video.videoHeight }, assessment.side);
    const geometric = features ? classifyBaseline(features, exercise) : { stage: 'other' as MovementStage, confidence: 0, formScore: 0, cue: assessment.cue };
    let prediction = geometric;
    if (stageModel && features) {
      const learned = predictMovementStage(stageModel, features);
      prediction = { ...geometric, stage: learned.confidence >= 0.65 ? learned.stage : 'other', confidence: learned.confidence };
    }
    const visible = assessment.visible && features !== null;
    const expectedTop = `${exercise}_top`;
    if (!visible) clearCalibration();
    else if (!calibrated) {
      if (prediction.stage !== expectedTop) calibrationStarted = null;
      else if (calibrationStarted === null) calibrationStarted = now;
      else if (now - calibrationStarted >= 900) calibrated = true;
    }
    const confidence = Math.min(assessment.confidence, prediction.confidence);
    const messageCue = !visible ? assessment.cue : !calibrated ? exercise === 'squat' ? 'Stand tall and hold still for one second to calibrate.' : 'Hold the top push-up position for one second to calibrate.' : control.enabled ? prediction.cue : bridge.embedded ? 'Camera ready. Waiting for the movement phase.' : 'Ready. Start practice when you are comfortable.';
    cue.textContent = messageCue; status.textContent = visible && calibrated ? 'Tracking ready' : visible ? 'Calibrating' : 'Adjust your position'; status.dataset.visible = String(visible && calibrated);
    const completed = counter.update({ timestamp: now, stage: prediction.stage, visible: visible && calibrated, confidence, formScore: geometric.formScore });
    if (completed && control.enabled && control.exercise === completed.exercise) {
      practiceReps += 1; element<HTMLElement>('reps').textContent = String(practiceReps);
      emit({ type: 'capture.rep', protocolVersion: 1, ...completed, modelVersion: modelVersion(), occurredAt: Date.now() });
    }
    frameTimes.push(now); frameTimes = frameTimes.filter(time => now - time < 2000);
    const elapsed = now - frameTimes[0], fps = elapsed >= 500 ? (frameTimes.length - 1) * 1000 / elapsed : 0;
    element<HTMLElement>('fps').textContent = fps ? `${fps.toFixed(1)} fps` : 'Measuring…';
    element<HTMLElement>('confidence').textContent = visible ? `${Math.round(assessment.confidence * 100)}%` : 'Not in view';
    if (now - lastTrackingMessage >= 250) {
      emit({ type: 'capture.tracking', protocolVersion: 1, visible: visible && calibrated, confidence: visible ? assessment.confidence : 0, stage: prediction.stage, fps: Math.round(fps * 10) / 10, formScore: visible ? geometric.formScore : undefined, cue: messageCue });
      lastTrackingMessage = now;
    }
    drawPose(landmarks, visible && calibrated);
    if (labMode && features && visible && recorder.recording) {
      recorder.record({ features, landmarks, capturedAt: Date.now(), videoTime: video.currentTime * 1000, width: video.videoWidth, height: video.videoHeight }); updateLab();
    }
  } catch (error) {
    stopCamera(); setError('INFERENCE_FAILED', `Pose processing stopped. ${error instanceof Error ? error.message : 'Unknown inference error'}`); return;
  }
  frameRequest = requestAnimationFrame(processFrame);
}

function updateLab() {
  if (!labMode) return;
  const record = element<HTMLButtonElement>('record');
  record.textContent = recorder.recording ? 'Stop labeled clip' : 'Start labeled clip'; record.classList.toggle('recording', recorder.recording);
  element<HTMLSelectElement>('participant').disabled = recorder.recording;
  element<HTMLInputElement>('clip').disabled = recorder.recording;
  element<HTMLButtonElement>('download').disabled = recorder.rows.length === 0;
  element<HTMLElement>('lab-count').textContent = `${recorder.rows.length} labeled frames${recorder.recording ? ' · recording' : ''}. Nothing has been uploaded.`;
}
startButton.addEventListener('click', () => void startCamera());
stopButton.addEventListener('click', stopCamera);
practiceButton.addEventListener('click', () => setPractice(!control.enabled));
exerciseSelect.addEventListener('change', () => { setPractice(false); recorder.stop(); updateLab(); });
element<HTMLButtonElement>('reset').addEventListener('click', () => { practiceReps = 0; element<HTMLElement>('reps').textContent = '0'; configure({ ...control, reset: true }); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { embeddedStartAttempted = true; if (running || booting) stopCamera(); }
});
window.addEventListener('pagehide', stopCamera);
if (labMode) {
  const clip = element<HTMLInputElement>('clip'); clip.value = `clip-${Date.now().toString(36)}`;
  element<HTMLButtonElement>('record').addEventListener('click', () => {
    try {
      if (recorder.recording) { recorder.stop(); clip.value = `clip-${Date.now().toString(36)}`; }
      else recorder.start(element<HTMLSelectElement>('participant').value, clip.value.trim(), element<HTMLSelectElement>('label').value as MovementStage, exerciseSelect.value as Exercise);
      updateLab();
    } catch (error) { errorBox.textContent = error instanceof Error ? error.message : 'Could not start recording.'; }
  });
  element<HTMLSelectElement>('label').addEventListener('change', event => recorder.setLabel((event.target as HTMLSelectElement).value as MovementStage));
  element<HTMLButtonElement>('download').addEventListener('click', () => recorder.download());
}
