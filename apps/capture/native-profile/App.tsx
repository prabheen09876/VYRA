import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Button, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { BASELINE_VERSION, CompleteCycleCounter, assessPose, classifyBaseline, extractPoseFeatures, predictMovementStage, validateStageModel, type Exercise, type PoseFrame, type StageModelArtifact } from '@vyra/core';
import { NativePoseCamera } from './NativePoseCamera';

/** Native Android feasibility screen, deliberately separate from the primary Expo Go game. */
export default function App() {
  const [exercise, setExercise] = useState<Exercise>('squat');
  const [enabled, setEnabled] = useState(false), [cameraActive, setCameraActive] = useState(true);
  const [reps, setReps] = useState(0), [cue, setCue] = useState('Hold the top position to calibrate.');
  const [error, setError] = useState(''), [model, setModel] = useState<StageModelArtifact | null>(null);
  const [rate, setRate] = useState<string>('Waiting for real frames');
  const counter = useRef(new CompleteCycleCounter());
  const calibration = useRef<number | null>(null), calibrated = useRef(false), frameTimes = useRef<number[]>([]);
  useEffect(() => {
    counter.current.configure({ type: 'capture.configure', exercise, enabled, reset: true });
    calibration.current = null; calibrated.current = false;
  }, [exercise, enabled]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') { setEnabled(false); setCameraActive(false); counter.current.reset(); }
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    const url = process.env.EXPO_PUBLIC_STAGE_MODEL_URL;
    if (!url) return;
    let cancelled = false;
    void fetch(url).then(response => { if (!response.ok) throw new Error(`Model HTTP ${response.status}`); return response.json(); })
      .then(json => {
        const artifact = validateStageModel(json);
        if (artifact.provenance.kind !== 'team-recorded') throw new Error('Synthetic fixtures are not team-trained movement models');
        if (!cancelled) { counter.current.reset(); calibration.current = null; calibrated.current = false; setModel(artifact); }
      }).catch(reason => { if (!cancelled) setError(`Using geometric baseline: ${reason instanceof Error ? reason.message : String(reason)}`); });
    return () => { cancelled = true; };
  }, []);
  const receiveFrame = useCallback((frame: PoseFrame) => {
    const assessment = assessPose(frame.landmarks, exercise);
    const features = extractPoseFeatures(frame.landmarks, frame, assessment.side);
    if (!assessment.visible || !features) {
      counter.current.reset(); calibrated.current = false; calibration.current = null; setCue(assessment.cue); return;
    }
    const baseline = classifyBaseline(features, exercise);
    const prediction = model ? predictMovementStage(model, features) : baseline;
    const stage = prediction.confidence >= 0.65 ? prediction.stage : 'other';
    if (!calibrated.current) {
      if (stage !== `${exercise}_top`) calibration.current = null;
      else if (calibration.current === null) calibration.current = frame.timestamp;
      else if (frame.timestamp - calibration.current >= 900) calibrated.current = true;
    }
    const rep = counter.current.update({ timestamp: frame.timestamp, stage,
      visible: assessment.visible && calibrated.current,
      confidence: Math.min(assessment.confidence, prediction.confidence), formScore: baseline.formScore });
    if (rep && enabled) setReps(previous => previous + 1);
    setCue(!calibrated.current ? 'Hold the top position for one second.' : enabled ? baseline.cue : 'Ready. Start practice when comfortable.');
    frameTimes.current = [...frameTimes.current.filter(time => frame.timestamp - time < 2000), frame.timestamp];
    const elapsed = frame.timestamp - frameTimes.current[0];
    if (elapsed >= 500) setRate(`${((frameTimes.current.length - 1) * 1000 / elapsed).toFixed(1)} observed updates/s`);
  }, [exercise, enabled, model]);
  return <SafeAreaView style={styles.page}>
    <Text style={styles.title}>Native pose spike</Text>
    <Text style={styles.note}>{model ? `Team-trained: ${model.modelVersion}` : `Geometric baseline: ${BASELINE_VERSION}`}</Text>
    <View style={styles.camera}><NativePoseCamera active={cameraActive} onFrame={receiveFrame} onError={setError} /></View>
    <Text style={styles.cue}>{cue}</Text><Text style={styles.count}>{reps} complete reps</Text>
    <Text style={styles.note}>{rate}</Text>
    <View style={styles.buttons}><Button title={enabled ? 'Pause practice' : 'Start practice'} onPress={() => { setCameraActive(true); setEnabled(previous => !previous); }} />
      <Button title={exercise === 'squat' ? 'Switch to push-ups' : 'Switch to squats'} onPress={() => { setEnabled(false); setReps(0); setExercise(previous => previous === 'squat' ? 'pushup' : 'squat'); }} /></View>
    <Text style={styles.error}>{error}</Text>
    <Text style={styles.note}>This isolated prototype requires a custom development build. Build compatibility, device performance and camera coordinates need physical verification.</Text>
  </SafeAreaView>;
}
// Nocturne literals rather than an import: this harness is copied out of the repo by
// scripts/prepare-native-profile.mjs into a standalone Expo project that cannot resolve
// apps/mobile/src/theme.ts. Values mirror it — background/surface/text/muted/accent/danger.
const styles = StyleSheet.create({ page: { flex: 1, padding: 20, gap: 12, backgroundColor: '#05070A' }, title: { color: '#F2F5F8', fontSize: 26, fontWeight: '700' }, note: { color: '#A8B0BC', fontSize: 12, lineHeight: 18 }, camera: { height: '48%', minHeight: 220, overflow: 'hidden', borderRadius: 14, backgroundColor: '#10141A' }, cue: { color: '#F2F5F8', fontSize: 15 }, count: { color: '#5EEAD4', fontSize: 26, fontWeight: '700' }, buttons: { gap: 8 }, error: { color: '#FF5A5F', fontSize: 12 } });
