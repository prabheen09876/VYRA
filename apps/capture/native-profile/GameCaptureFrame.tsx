/** Copied ONLY into a separate SDK54 custom build. Expo Go never imports native pose modules. */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, Button, StyleSheet, Text, View } from 'react-native';
import {
  BASELINE_VERSION, CompleteCycleCounter, assessPose, classifyBaseline, extractPoseFeatures,
  predictMovementStage, validateStageModel, type CaptureControl, type CaptureMessage,
  type MovementStage, type PoseFrame, type StageModelArtifact,
} from '@vyra/core';
import { NativePoseCamera } from './NativePoseCamera';

export interface CaptureFrameProps {
  url: string;
  control: CaptureControl;
  resetKey: string;
  onMessage(message: CaptureMessage): void;
}

/** Preserves CaptureSurface's game protocol, including epoch rep timestamps and phase/reset gating. */
export default function CaptureFrame({ url, control, resetKey, onMessage }: CaptureFrameProps) {
  const [cameraActive, setCameraActive] = useState(AppState.currentState === 'active');
  const [cue, setCue] = useState('Allow the native camera, then hold the top position.');
  const [mode, setMode] = useState('Geometric baseline · no team model loaded');
  const latest = useRef({ control, onMessage }); latest.current = { control, onMessage };
  const active = useRef(cameraActive); active.current = cameraActive;
  const model = useRef<StageModelArtifact | null>(null), counter = useRef(new CompleteCycleCounter());
  const calibration = useRef<number | null>(null), calibrated = useRef(false);
  const frameTimes = useRef<number[]>([]), lastTracking = useRef(-Infinity), readyVersion = useRef('');
  const clear = useCallback(() => { counter.current.reset(); calibration.current = null; calibrated.current = false; }, []);

  useLayoutEffect(() => {
    counter.current.configure({ ...control, reset: true }); clear();
  }, [control, resetKey, clear]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        active.current = false; setCameraActive(false); clear();
        latest.current.onMessage({ type: 'capture.tracking', protocolVersion: 1, visible: false, confidence: 0, stage: 'other', fps: 0, cue: 'Camera paused. Tap Resume camera to recalibrate.' });
      }
    });
    return () => { subscription.remove(); active.current = false; clear(); };
  }, [clear]);
  useEffect(() => {
    const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 12000);
    let cancelled = false;
    model.current = null; readyVersion.current = ''; clear(); setMode('Geometric baseline · no team model loaded');
    // The configured backend supplies only a small, validated numeric artifact. Camera frames stay local.
    void (async () => {
      try {
        const endpoint = new URL('/models/movement-stage.json', url);
        const response = await fetch(endpoint.href, { signal: abort.signal });
        if (response.status === 404) return;
        if (!response.ok) throw new Error(`Model HTTP ${response.status}`);
        if (Number(response.headers.get('content-length')) > 2_000_000) throw new Error('Stage model exceeds 2 MB');
        const text = await response.text();
        if (text.length > 2_000_000) throw new Error('Stage model exceeds 2 MB');
        const artifact = validateStageModel(JSON.parse(text));
        if (artifact.provenance.kind !== 'team-recorded') throw new Error('Synthetic fixtures cannot be used as a team model');
        if (!cancelled) { model.current = artifact; clear(); setMode(`Team-trained · ${artifact.modelVersion}`); }
      } catch {
        if (!cancelled) setMode('Geometric baseline · trained model unavailable');
      } finally { clearTimeout(timeout); }
    })();
    return () => { cancelled = true; abort.abort(); clearTimeout(timeout); };
  }, [url, clear]);

  const receiveFrame = useCallback((frame: PoseFrame) => {
    if (!active.current) return;
    const { control: current, onMessage: emit } = latest.current;
    const modelVersion = model.current?.modelVersion ?? BASELINE_VERSION;
    if (readyVersion.current !== modelVersion) {
      readyVersion.current = modelVersion;
      emit({ type: 'capture.ready', protocolVersion: 1, modelVersion, inferenceMode: model.current ? 'learned' : 'baseline' });
    }
    const exercise = current.exercise ?? 'squat';
    const assessment = assessPose(frame.landmarks, exercise);
    const features = extractPoseFeatures(frame.landmarks, frame, assessment.side);
    const geometric = features ? classifyBaseline(features, exercise) : { stage: 'other' as MovementStage, confidence: 0, formScore: 0, cue: assessment.cue };
    const prediction = model.current && features ? predictMovementStage(model.current, features) : geometric;
    const stage = prediction.confidence >= 0.65 ? prediction.stage : 'other';
    const visible = assessment.visible && features !== null;
    if (!visible) clear();
    else if (!calibrated.current) {
      if (stage !== `${exercise}_top`) calibration.current = null;
      else if (calibration.current === null) calibration.current = frame.timestamp;
      else if (frame.timestamp - calibration.current >= 900) calibrated.current = true;
    }
    const confidence = Math.min(assessment.confidence, prediction.confidence);
    const completed = counter.current.update({ timestamp: frame.timestamp, stage, visible: visible && calibrated.current, confidence, formScore: geometric.formScore });
    if (completed && current.enabled && current.exercise === completed.exercise) {
      emit({ type: 'capture.rep', protocolVersion: 1, ...completed, modelVersion, occurredAt: Date.now() });
    }
    frameTimes.current = [...frameTimes.current.filter(time => frame.timestamp - time < 2000), frame.timestamp];
    if (frame.timestamp - lastTracking.current >= 250) {
      const elapsed = frame.timestamp - frameTimes.current[0];
      const fps = elapsed >= 500 ? (frameTimes.current.length - 1) * 1000 / elapsed : 0;
      const messageCue = !visible ? assessment.cue : !calibrated.current ? 'Hold the top position for one second to calibrate.' : current.enabled ? geometric.cue : 'Camera ready. Waiting for the movement phase.';
      setCue(messageCue);
      emit({ type: 'capture.tracking', protocolVersion: 1, visible: visible && calibrated.current,
        confidence: visible ? assessment.confidence : 0, stage, fps: Math.round(fps * 10) / 10,
        formScore: visible ? geometric.formScore : undefined, cue: messageCue });
      lastTracking.current = frame.timestamp;
    }
  }, [clear]);
  const fail = useCallback((message: string) => {
    active.current = false; setCameraActive(false); clear();
    latest.current.onMessage({ type: 'capture.error', protocolVersion: 1, code: 'NATIVE_CAMERA_FAILED', message });
  }, [clear]);
  const loseTracking = useCallback(() => {
    clear(); frameTimes.current = []; setCue('Step back into view and hold the top position.');
    latest.current.onMessage({ type: 'capture.tracking', protocolVersion: 1, visible: false, confidence: 0, stage: 'other', fps: 0, cue: 'Tracking paused. Step back into view and recalibrate.' });
  }, [clear]);
  return <View style={styles.camera}>
    <NativePoseCamera active={cameraActive} onFrame={receiveFrame} onError={fail} onTrackingLoss={loseTracking} />
    <View pointerEvents="none" style={styles.status}><Text style={styles.mode}>{mode}</Text><Text style={styles.cue}>{cue}</Text></View>
    {!cameraActive && <View style={styles.resume}><Button title="Resume camera" onPress={() => { clear(); frameTimes.current = []; lastTracking.current = -Infinity; readyVersion.current = ''; active.current = true; setCameraActive(true); }} /></View>}
  </View>;
}
// Nocturne literals — see the note in App.tsx on why this harness cannot import the theme.
// The status panel sits over live video, so it is `f2` (95%) rather than the old `dd`: even with a
// blown-out white frame behind it the 11px `mode` label holds 5.12:1, past the 4.5:1 body floor.
const styles = StyleSheet.create({ camera: { flex: 1, minHeight: 280, overflow: 'hidden', backgroundColor: '#05070A' }, status: { position: 'absolute', left: 12, right: 12, bottom: 12, gap: 6, padding: 10, borderRadius: 10, backgroundColor: '#05070Af2' }, mode: { color: '#5EEAD4', fontSize: 11 }, cue: { color: '#F2F5F8', fontSize: 13 }, resume: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#05070Af2' } });
