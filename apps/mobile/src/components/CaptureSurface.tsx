import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { emptyCapturePose, LIVE_POSE_MAX_AGE_MS, type CaptureCameraState, type CaptureControl, type CaptureMessage, type CapturePoseMessage, type Exercise } from '@vyra/core';
import CaptureFrame from './CaptureFrame';
import TrackingFeedback from './TrackingFeedback';
import { useApp } from '../state/AppProvider';
import { colors, displayWeight, fonts } from '../theme';
import { useScreenFocus } from '../lib/useScreenFocus';

interface Props {
  exercise: Exercise | null;
  enabled: boolean;
  suspended?: boolean;
  resetKey: string;
  onRep: (message: Extract<CaptureMessage, { type: 'capture.rep' }>) => void;
  onTracking?: (message: Extract<CaptureMessage, { type: 'capture.tracking' }>) => void;
  onPose?: (message: CapturePoseMessage) => void;
  onCameraState?: (state: CaptureCameraState) => void;
  debugOverlay?: boolean;
}

export default function CaptureSurface({ exercise, enabled, suspended = false, resetKey, onRep, onTracking, onPose, onCameraState, debugOverlay = false }: Props) {
  const { session, announce } = useApp();
  const focused = useScreenFocus();
  const [attempt, setAttempt] = useState(0);
  const [resumeRequired, setResumeRequired] = useState(false);
  const [ready, setReady] = useState<Extract<CaptureMessage, { type: 'capture.ready' }> | null>(null);
  const [tracking, setTracking] = useState<Extract<CaptureMessage, { type: 'capture.tracking' }> | null>(null);
  const [now, setNow] = useState(Date.now());
  const lastTrackingAt = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const lastCue = useRef({ text: '', at: 0 });
  const poseHandler = useRef(onPose);
  const cameraHandler = useRef(onCameraState);
  poseHandler.current = onPose;
  cameraHandler.current = onCameraState;
  useEffect(() => {
    setTracking(null);
    lastTrackingAt.current = 0;
    poseHandler.current?.(emptyCapturePose());
    return () => { poseHandler.current?.(emptyCapturePose()); };
  }, [focused, suspended, resetKey, attempt]);
  useEffect(() => {
    if (!focused || suspended || resumeRequired || !ready) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [focused, suspended, resumeRequired, ready]);
  useEffect(() => {
    if (!focused || suspended) cameraHandler.current?.('stopped');
    return () => { cameraHandler.current?.('stopped'); };
  }, [focused, suspended, attempt]);
  useEffect(() => {
    if (!focused) {
      setResumeRequired(true);
      setReady(null);
      setTracking(null);
    }
  }, [focused]);
  const control = useMemo<CaptureControl>(() => ({
    type: 'capture.configure', exercise, enabled, reset: true, poseStream: !!onPose, debugOverlay,
  }), [exercise, enabled, resetKey, !!onPose, debugOverlay]);
  const receive = (message: CaptureMessage) => {
    if (message.type === 'capture.ready') { setReady(message); setError(null); }
    else if (message.type === 'capture.camera') {
      if (message.state !== 'running') {
        setReady(null); setTracking(null); lastTrackingAt.current = 0;
        poseHandler.current?.(emptyCapturePose());
      }
      onCameraState?.(message.state);
    }
    else if (message.type === 'capture.error') { setError(message.message); setTracking(null); lastTrackingAt.current = 0; }
    else if (message.type === 'capture.tracking') {
      lastTrackingAt.current = Date.now();
      setNow(lastTrackingAt.current);
      setTracking(message);
      if ((enabled || onPose) && !suspended && focused && !resumeRequired) onTracking?.(message);
      if (enabled && message.cue && message.cue !== lastCue.current.text && Date.now() - lastCue.current.at > 6500) {
        lastCue.current = { text: message.cue, at: Date.now() };
        announce(message.cue);
      }
    } else if (message.type === 'capture.pose' && !suspended && focused && !resumeRequired) onPose?.(message);
    else if (message.type === 'capture.rep' && enabled && message.exercise === exercise && !suspended && focused && !resumeRequired) onRep(message);
  };
  const trackingFresh = !!ready && !error && !!tracking && now >= lastTrackingAt.current && now - lastTrackingAt.current <= LIVE_POSE_MAX_AGE_MS;
  const liveTracking = trackingFresh ? tracking : null;
  const stale = !!ready && !!tracking && !trackingFresh && !error;
  if (!session.apiUrl) return <View style={styles.unavailable}>
    <Text style={styles.title}>Connect your server first</Text>
    <Text style={styles.copy}>Set the VYRA server address in Profile to load the camera.</Text>
  </View>;
  if (suspended) return <View style={styles.unavailable}><Text style={styles.title}>Camera stopped</Text><Text style={styles.copy}>This workout is no longer counting movement.</Text></View>;
  if (!focused) return <View style={styles.unavailable}><Text style={styles.copy}>Camera paused while this screen is inactive.</Text></View>;
  if (resumeRequired) return <View style={styles.unavailable}>
    <Text style={styles.title}>Camera paused</Text><Text style={styles.copy}>Resume when you are back in position.</Text>
    <Pressable accessibilityRole="button" style={styles.retry} onPress={() => { setResumeRequired(false); setAttempt(value => value + 1); }}><Text style={styles.retryText}>Resume camera</Text></Pressable>
  </View>;
  return <View style={styles.frame}>
    <View style={styles.camera}>
      <CaptureFrame key={attempt} url={session.apiUrl + '/capture/'} control={control} resetKey={resetKey} onMessage={receive} />
    </View>
    <View style={styles.status}>
      {/* Electric blue while the pose is locked on, danger red the moment you drop out of frame —
          the same `spark`/`danger` info-vs-error pairing ui.tsx's `Notice` uses, so this reads as
          one system. Both states are also carried by the adjacent status line, so the dot is never
          the only signal.
          The skeleton drawn over the live video belongs to a SEPARATE app that cannot import this
          theme, so it carries the same two values as literals: apps/capture/src/main.ts strokes
          '#3D7BFF' / '#FF5A5F' and styles.css sets the badge dot from --track / --alert. All three
          read one tracking state — re-tint them together or the same state shows two colours. */}
      <View style={[styles.dot, { backgroundColor: liveTracking?.visible ? colors.spark : colors.danger }]} />
      <Text style={styles.statusText}>
        {error ? 'Camera needs attention' : stale ? 'Tracking paused. Move into frame or restart your camera.' : tracking?.cue || (!ready ? 'Enable the camera when you are ready to move.' : 'Stand back so your whole body is visible.')}
      </Text>
    </View>
    <TrackingFeedback tracking={liveTracking} />
    <View style={styles.footnote}>
      <Text style={styles.modelText}>{debugOverlay ? 'Live body tracking' : 'On-device rep tracking'}</Text>
      <Text style={styles.modelText}>Video stays on this device</Text>
    </View>
    {error && <View style={styles.error}>
      <Text style={styles.errorText}>{error}</Text>
      <Text style={styles.copy}>Use a secure camera address on phones. Camera access must also be allowed in your device settings.</Text>
      <Pressable accessibilityRole="button" style={styles.retry} onPress={() => { setAttempt(v => v + 1); setError(null); setReady(null); }}><Text style={styles.retryText}>Restart camera</Text></Pressable>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  // Same `surface` the camera frame paints behind the WebView/iframe, so the video area and the
  // status strip below it read as one card with no seam. Read from the theme rather than repeated
  // as a literal here, so the two cannot drift apart again.
  frame: { borderRadius: 24, backgroundColor: colors.surface, overflow: 'hidden', borderColor: colors.line, borderWidth: 1 },
  camera: { height: 390, minHeight: 320 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingTop: 16 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { flex: 1, fontFamily: fonts.body, color: colors.text, fontSize: 15, lineHeight: 22 },
  footnote: { padding: 18, paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 },
  modelText: { fontFamily: fonts.body, fontSize: 11, color: colors.muted },
  error: { padding: 18, paddingTop: 0, gap: 12 },
  errorText: { color: colors.danger, fontFamily: fonts.body, fontSize: 15, lineHeight: 23 },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  // Bare text action, so the label itself has to carry the affordance: brand mint on `surface`
  // is 9.92:1, far past body text, and stays clearly apart from the red error copy above it.
  retryText: { fontFamily: fonts.body, color: colors.brand, fontWeight: '700', fontSize: 15 },
  unavailable: { minHeight: 320, padding: 28, alignItems: 'center', justifyContent: 'center', gap: 14, borderRadius: 24, backgroundColor: colors.surface },
  title: { fontFamily: fonts.display, color: colors.text, fontSize: 24, fontWeight: displayWeight.heavy },
  copy: { fontFamily: fonts.body, fontSize: 14, lineHeight: 22, color: colors.muted },
});
