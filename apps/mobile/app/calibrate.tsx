import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { CaptureMessage, Exercise } from '@vyra/core';
import CaptureSurface from '../src/components/CaptureSurface';
import { Button, Copy, Heading, Notice, Pill, Screen, layout } from '../src/components/ui';
import { useApp } from '../src/state/AppProvider';
import { colors, fonts, radii } from '../src/theme';

export default function CalibrationScreen() {
  const params = useLocalSearchParams<{ next?: string; mode?: string; room?: string }>();
  const { session, calibration, setCalibration, announce, setPreferences } = useApp();
  const [exercise, setExercise] = useState<Exercise>('squat');
  const [attempt, setAttempt] = useState(0);
  const counts = useRef({ squat: 0, pushup: 0 });
  const { width } = useWindowDimensions();
  useEffect(() => { setCalibration('squat', 0); setCalibration('pushup', 0); }, [setCalibration]);
  const onRep = (rep: Extract<CaptureMessage, { type: 'capture.rep' }>) => {
    if (rep.exercise !== exercise || counts.current[exercise] >= 2) return;
    counts.current[exercise] += 1;
    setCalibration(exercise, counts.current[exercise]);
    if (counts.current[exercise] === 2) announce(exercise === 'squat' ? 'Squats calibrated. Get ready for two practice push-ups.' : 'Camera check complete. You are ready.');
  };
  const done = calibration.squat >= 2 && calibration.pushup >= 2;
  const count = calibration[exercise];
  const goArena = () => router.replace({ pathname: '/arena', params: { mode: params.mode || 'solo', room: params.room || '' } });
  return <Screen noNav back={() => router.back()}>
    <View style={[layout.split, { marginBottom: 22 }]}><Pill>Camera check</Pill><Button variant="quiet" onPress={() => setPreferences({ muted: !session.muted })}>{session.muted ? 'Sound off' : 'Sound on'}</Button></View>
    <View style={layout.section}><Heading size={38}>{done ? 'You’re ready to move.' : exercise === 'squat' ? 'Give yourself some space.' : 'Time to find your floor angle.'}</Heading><Copy>{done ? 'Both movements are calibrated. These practice reps do not earn XP.' : exercise === 'squat' ? 'Place your phone securely and step back until your head, hips, and feet fit in the camera.' : 'Use a side view with your shoulders, hips, and ankles visible. Keep your phone steady.'}</Copy></View>
    <View style={[styles.columns, width >= 850 && { flexDirection: 'row' }]}>
      <View style={{ flex: 1.4 }}>
        <CaptureSurface exercise={exercise} enabled={!done && count < 2} resetKey={'practice-' + exercise + '-' + attempt} onRep={onRep} />
      </View>
      <View style={[styles.instructions, width >= 850 && { flex: 0.8 }]}>
        <View style={layout.split}><Text style={styles.stepLabel}>{exercise === 'squat' ? 'Step 1 of 2' : 'Step 2 of 2'}</Text><Text style={styles.count}>{count}<Text style={styles.countMax}> / 2</Text></Text></View>
        <Heading size={29}>{exercise === 'squat' ? 'Two practice squats' : 'Two practice push-ups'}</Heading>
        <Text style={styles.instruction}>{exercise === 'squat' ? 'Stand tall, lower into a controlled squat, then return to standing. A full movement counts as one rep.' : 'Start in your top position, lower in control, then push back up. A full movement counts as one rep.'}</Text>
        <View style={styles.checklist}>
          <Check complete={calibration.squat >= 2} title="Squats" count={calibration.squat} />
          <Check complete={calibration.pushup >= 2} title="Push-ups" count={calibration.pushup} />
        </View>
        {done ? <Button onPress={goArena}>Choose my workout</Button> : exercise === 'squat' && count >= 2 ? <Button onPress={() => setExercise('pushup')}>Set up push-ups</Button> : <View style={styles.waiting}><Text style={styles.waitingText}>Your camera will count the reps.</Text></View>}
        <Copy>No rep showing? Step into the light, check that your whole body is visible, and move steadily.</Copy>
        <Pressable accessibilityRole="button" style={styles.restart} onPress={() => { counts.current = { squat: 0, pushup: 0 }; setCalibration('squat', 0); setCalibration('pushup', 0); setExercise('squat'); setAttempt(value => value + 1); }}><Text style={styles.restartText}>Restart camera check</Text></Pressable>
      </View>
    </View>
    {!session.apiUrl && <Notice title="Add your server address" action={() => router.push('/profile')} actionLabel="Open setup">Your camera page loads from the VYRA server you configure in Profile.</Notice>}
  </Screen>;
}
function Check({ complete, title, count }: { complete: boolean; title: string; count: number }) {
  return <View style={layout.split}><View style={layout.row}><View style={[styles.check, complete && { backgroundColor: colors.teal }]}><Text style={{ color: colors.ink, fontWeight: '800' }}>{complete ? '✓' : ''}</Text></View><Text style={styles.checkTitle}>{title}</Text></View><Text style={styles.checkCount}>{count} / 2</Text></View>;
}
const styles = StyleSheet.create({
  columns: { gap: 28, marginBottom: 28 }, instructions: { gap: 19, paddingVertical: 8 },
  stepLabel: { fontFamily: fonts.body, color: colors.teal, fontWeight: '700', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.6 },
  count: { fontFamily: fonts.display, color: colors.teal, fontSize: 43, fontWeight: '900' }, countMax: { fontSize: 24, color: colors.muted },
  instruction: { fontFamily: fonts.body, color: colors.muted, fontSize: 16, lineHeight: 26 },
  checklist: { gap: 18, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 22 },
  check: { width: 25, height: 25, borderRadius: 9, borderWidth: 1, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' },
  checkTitle: { color: colors.text, fontFamily: fonts.body, fontSize: 16, fontWeight: '600' }, checkCount: { color: colors.muted, fontFamily: fonts.body, fontSize: 14 },
  waiting: { borderRadius: radii.md, padding: 16, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.line }, waitingText: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, textAlign: 'center' },
  restart: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }, restartText: { color: colors.teal, fontFamily: fonts.body, fontSize: 14, fontWeight: '600' },
});
