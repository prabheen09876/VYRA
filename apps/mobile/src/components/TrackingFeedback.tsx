import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CaptureMessage } from '@vyra/core';
import { colors, displayWeight, fonts } from '../theme';

type Tracking = Extract<CaptureMessage, { type: 'capture.tracking' }>;
const movements: Record<Tracking['stage'], string> = {
  squat_top: 'Standing', squat_bottom: 'Squat lowered',
  pushup_top: 'Arms extended', pushup_bottom: 'Push-up lowered', other: 'Between positions',
};

/** Form and landmark confidence are different readings; neither is model accuracy. */
export default function TrackingFeedback({ tracking }: { tracking: Tracking | null }) {
  const visible = !!tracking?.visible;
  const form = visible && tracking?.formScore !== undefined ? Math.round(tracking.formScore) : null;
  const bodySeen = visible || (tracking?.confidence ?? 0) > 0;
  return <View style={styles.panel}>
    <View style={styles.row}>
      <View style={styles.metric}>
        <Text style={styles.label}>LIVE FORM</Text>
        <Text accessibilityLabel={form === null ? 'Live form unavailable' : `Live form ${form} percent`} style={styles.form}>{form === null ? '—' : `${form}%`}</Text>
        <View accessibilityRole="progressbar" accessibilityLabel="Live form" accessibilityValue={form === null ? { text: 'Unavailable' } : { min: 0, max: 100, now: form }} style={styles.track}>
          <View style={[styles.fill, { width: `${form ?? 0}%` }]} />
        </View>
      </View>
      <View style={styles.metric}>
        <Text style={styles.label}>MOVEMENT</Text>
        <Text style={styles.value}>{visible ? movements[tracking!.stage] : bodySeen ? 'Calibrating' : '—'}</Text>
      </View>
    </View>
    <View style={styles.row}>
      <View style={styles.metric}><Text style={styles.label}>TRACKING CONFIDENCE</Text><Text style={styles.value}>{bodySeen ? `${Math.round(tracking!.confidence * 100)}%` : '—'}</Text></View>
      <View style={styles.metric}><Text style={styles.label}>TRACKING RATE</Text><Text style={styles.value}>{tracking && tracking.fps > 0 ? `${tracking.fps.toFixed(1)} fps` : '—'}</Text></View>
    </View>
    <Text style={styles.note}>Form estimates your posture. Tracking confidence reflects how clearly your body is seen.</Text>
  </View>;
}

const styles = StyleSheet.create({
  panel: { marginHorizontal: 18, marginTop: 16, paddingTop: 16, gap: 14, borderTopWidth: 1, borderTopColor: colors.line },
  row: { flexDirection: 'row', gap: 18 },
  metric: { flex: 1, minWidth: 0, gap: 6 },
  label: { fontFamily: fonts.body, color: colors.muted, fontSize: 10, lineHeight: 15, letterSpacing: 0.8, fontWeight: '600' },
  form: { fontFamily: fonts.display, color: colors.accent, fontSize: 32, lineHeight: 38, fontWeight: displayWeight.heavy, fontVariant: ['tabular-nums'] },
  value: { fontFamily: fonts.body, color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '600', fontVariant: ['tabular-nums'] },
  track: { maxWidth: 150, height: 4, borderRadius: 2, backgroundColor: colors.glassStrong, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.brand, borderRadius: 2 },
  note: { fontFamily: fonts.body, color: colors.muted, fontSize: 11, lineHeight: 17 },
});
