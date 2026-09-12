import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CaptureMessage, Exercise } from '@vyra/core';
import { colors, fonts, radii } from '../theme';

interface Props {
  exercise: Exercise | null;
  enabled: boolean;
  suspended?: boolean;
  resetKey: string;
  onRep: (message: Extract<CaptureMessage, { type: 'capture.rep' }>) => void;
  onTracking?: (message: Extract<CaptureMessage, { type: 'capture.tracking' }>) => void;
}

// Comfortably above the backend's minimum rep interval (600ms squat / 800ms push-up in
// packages/core/src/match.ts) so simulated reps are never rejected as REP_TOO_FAST.
const REP_INTERVAL_MS: Record<Exercise, number> = { squat: 1100, pushup: 1300 };

/**
 * Development-only stand-in for CaptureSurface (see src/lib/testMode.ts). Same prop interface,
 * same output: it emits ordinary `capture.rep` / `capture.tracking` CaptureMessage events into
 * the caller's onRep/onTracking — exactly what CaptureFrame relays from the real camera page.
 * AppProvider.sendRep still runs every simulated rep through routeCapturedRep and the real
 * WebSocket `rep` command, so the backend's rep validation, combat resolution and reward
 * settlement all still execute for real. Swapping this back out for CaptureSurface is the entire
 * removal step once the final ML model ships.
 */
export default function SimulatedCaptureSurface({ exercise, enabled, suspended = false, resetKey, onRep, onTracking }: Props) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (!exercise || !enabled || suspended) return;
    onTracking?.({
      type: 'capture.tracking', protocolVersion: 1, visible: true, confidence: 0.97,
      stage: exercise === 'squat' ? 'squat_bottom' : 'pushup_bottom', fps: 30, formScore: 0.9,
      cue: 'Simulated input active.',
    });
    timer.current = setInterval(() => {
      onRep({
        type: 'capture.rep', protocolVersion: 1, exercise, confidence: 0.95, formScore: 0.9,
        modelVersion: 'test-mode-simulated', occurredAt: Date.now(),
      });
    }, REP_INTERVAL_MS[exercise]);
    return () => { if (timer.current) clearInterval(timer.current); };
    // resetKey (the current phaseId) intentionally restarts the interval on every new phase.
  }, [exercise, enabled, suspended, resetKey, onRep, onTracking]);

  return <View style={styles.frame}>
    <View style={styles.badge}><View style={styles.dot} /><Text style={styles.badgeText}>TEST MODE — SIMULATED INPUT</Text></View>
    <Text style={styles.title}>{exercise ? (exercise === 'squat' ? 'Simulating squats…' : 'Simulating push-ups…') : 'Waiting for the next exercise phase…'}</Text>
    <Text style={styles.copy}>Camera and pose detection are bypassed for this build. Reps are generated automatically and sent through the real backend rep validation and combat pipeline — nothing here is calculated on the client.</Text>
  </View>;
}
const styles = StyleSheet.create({
  frame: { borderRadius: 24, backgroundColor: '#080F19', borderColor: colors.gold, borderWidth: 1, borderStyle: 'dashed', padding: 24, minHeight: 320, justifyContent: 'center', gap: 14 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: 'rgba(255,209,123,0.12)', borderWidth: 1, borderColor: colors.gold },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.gold },
  badgeText: { fontFamily: fonts.body, color: colors.gold, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  title: { fontFamily: fonts.display, color: colors.text, fontSize: 22, fontWeight: '800' },
  copy: { fontFamily: fonts.body, color: colors.muted, fontSize: 14, lineHeight: 21, maxWidth: 480 },
});
