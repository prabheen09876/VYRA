import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CHARACTERS, characterFor, isLivePoseFresh, type CaptureCameraState, type CaptureMessage, type CapturePoseMessage, type CharacterId, type Exercise } from '@vyra/core';
import CaptureSurface from '../src/components/CaptureSurface';
import HeroView from '../src/components/HeroView';
import { displayFitnessStage } from '../src/components/FitnessUI';
import { Button, Copy, Heading, Notice, Pill, Screen, layout } from '../src/components/ui';
import { CHARACTER_ART } from '../src/lib/characterAssets';
import { isTrainingCharacter } from '../src/lib/liveCharacter';
import { useScreenFocus } from '../src/lib/useScreenFocus';
import { useApp } from '../src/state/AppProvider';
import { useCoach } from '../src/state/CoachProvider';
import { colors, displayWeight, fonts, radii } from '../src/theme';

export default function CalibrationScreen() {
  const params = useLocalSearchParams<{ next?: string; mode?: string; room?: string }>();
  const { profile, session, calibration, setCalibration, announce, setPreferences, snapshot, match, localStopped } = useApp();
  const { isOpen: coachOpen } = useCoach();
  const focused = useScreenFocus();
  const returningToLobby = params.next === 'lobby';
  const [exercise, setExercise] = useState<Exercise>('squat');
  const [attempt, setAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState<CharacterId>(() => characterFor(profile?.characterId).id);
  const [overlay, setOverlay] = useState(true);
  const [cameraState, setCameraState] = useState<CaptureCameraState>('stopped');
  const [tracking, setTracking] = useState<Extract<CaptureMessage, { type: 'capture.tracking' }> | null>(null);
  const [, setNow] = useState(Date.now());
  const counts = useRef({ squat: 0, pushup: 0 });
  const livePose = useRef<CapturePoseMessage | null>(null);
  const lastRepAt = useRef(0);
  const acceptAfter = useRef(Date.now());
  const counting = useRef(false);
  const streaming = useRef(false);
  const currentExercise = useRef(exercise);
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const done = calibration.squat >= 2 && calibration.pushup >= 2;
  const count = calibration[exercise];
  const followsPose = isTrainingCharacter(selectedId);
  const selected = characterFor(selectedId);
  const stage = displayFitnessStage(profile?.stage);
  currentExercise.current = exercise;
  streaming.current = focused && !coachOpen;
  counting.current = streaming.current && cameraState === 'running' && !done && counts.current[exercise] < 2;
  const reset = useCallback(() => {
    counts.current = { squat: 0, pushup: 0 }; lastRepAt.current = 0; acceptAfter.current = Date.now();
    currentExercise.current = 'squat'; livePose.current = null; setTracking(null);
    setCalibration('squat', 0); setCalibration('pushup', 0); setExercise('squat'); setAttempt(value => value + 1);
  }, [setCalibration]);
  useEffect(reset, [reset, profile?.id, session.apiUrl]);
  useEffect(() => { setSelectedId(characterFor(profile?.characterId).id); }, [profile?.id, profile?.characterId]);
  useEffect(() => {
    if (!focused || coachOpen) {
      counting.current = false; acceptAfter.current = Infinity; livePose.current = null;
      setTracking(null); setCameraState('stopped');
    }
  }, [focused, coachOpen]);
  useEffect(() => {
    if (!focused || coachOpen || cameraState !== 'running') return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [focused, coachOpen, cameraState]);
  useEffect(() => () => { counting.current = false; streaming.current = false; livePose.current = null; }, []);
  useEffect(() => {
    if (returningToLobby && (snapshot?.phase === 'finished' || snapshot?.phase === 'interrupted' || localStopped)) router.replace('/results');
  }, [returningToLobby, snapshot?.phase, localStopped]);
  const onPose = useCallback((message: CapturePoseMessage) => {
    livePose.current = streaming.current && message.visible ? message : null;
  }, []);
  const onTracking = useCallback((message: Extract<CaptureMessage, { type: 'capture.tracking' }>) => {
    if (!streaming.current) return;
    setTracking(message);
  }, []);
  const onCameraState = useCallback((state: CaptureCameraState) => {
    if (state !== 'stopped' && !streaming.current) return;
    setCameraState(state);
    if (state === 'running') { acceptAfter.current = Date.now(); setNow(Date.now()); }
    else {
      counting.current = false; acceptAfter.current = Infinity; livePose.current = null; setTracking(null);
    }
  }, []);
  const onRep = useCallback((rep: Extract<CaptureMessage, { type: 'capture.rep' }>) => {
    const selectedExercise = currentExercise.current, receivedAt = Date.now();
    if (!counting.current || rep.exercise !== selectedExercise || counts.current[selectedExercise] >= 2 || !Number.isFinite(rep.occurredAt)
      || rep.occurredAt <= lastRepAt.current || rep.occurredAt < acceptAfter.current
      || rep.occurredAt > receivedAt + 250 || receivedAt - rep.occurredAt > 2000) return;
    lastRepAt.current = rep.occurredAt;
    counts.current[selectedExercise] += 1;
    setCalibration(selectedExercise, counts.current[selectedExercise]);
    if (counts.current[selectedExercise] === 2) {
      counting.current = false;
      announce(selectedExercise === 'squat' ? 'Squats calibrated. Get ready for two practice push-ups.' : 'Camera check complete. You are ready.');
    }
  }, [setCalibration, announce]);
  const nextExercise = () => {
    counting.current = false; acceptAfter.current = Date.now(); currentExercise.current = 'pushup';
    livePose.current = null; setTracking(null); setExercise('pushup');
  };
  const visible = focused && !coachOpen && cameraState === 'running' && isLivePoseFresh(livePose.current);
  const trackingLabel = coachOpen ? 'Paused for Coach' : cameraState === 'starting' ? 'Starting camera…'
    : cameraState !== 'running' ? 'Camera off' : visible ? tracking?.visible ? 'Tracking your body' : 'Getting ready…' : 'Move fully into view';
  const goBack = () => returningToLobby ? router.back() : router.replace({ pathname: '/arena', params: { mode: params.mode || 'solo', room: params.room || '' } });
  if (returningToLobby && !match) return <Screen noNav><Notice title="No room is open" action={() => router.replace('/arena')} actionLabel="Return to the arena">Find an opponent or join a room before preparing for a match.</Notice></Screen>;
  return <Screen noNav back={goBack}>
    <View style={[layout.split, { marginBottom: 22 }]}><Pill>Camera check</Pill><Button variant="quiet" onPress={() => setPreferences({ muted: !session.muted })}>{session.muted ? 'Sound off' : 'Sound on'}</Button></View>
    <View style={layout.section}><Heading size={38}>{done ? 'You’re ready to move.' : exercise === 'squat' ? 'Give yourself some space.' : 'Time to find your floor angle.'}</Heading><Copy>{done ? 'Both movements are calibrated. These practice reps do not earn XP.' : exercise === 'squat' ? 'Place your phone securely and step back until your head, hips, and feet fit in the camera.' : 'Use a side view with your shoulders, hips, and ankles visible. Keep your phone steady.'}</Copy></View>
    <View style={[styles.columns, wide && { flexDirection: 'row' }]}>
      <View style={styles.column}>
        <View style={styles.panelHeading}><Text style={styles.panelTitle}>Your body tracking</Text><Text accessibilityLiveRegion="polite" style={[styles.liveStatus, visible && { color: colors.brand }]}>{trackingLabel}</Text></View>
        <CaptureSurface exercise={exercise} enabled={focused && !coachOpen && !done && count < 2} suspended={coachOpen}
          resetKey={'practice-' + exercise + '-' + attempt} onRep={onRep} onPose={onPose} onTracking={onTracking} onCameraState={onCameraState} debugOverlay={overlay} />
        <View style={styles.repProgress}><View style={{ gap: 5 }}><Text style={styles.stepLabel}>{exercise === 'squat' ? 'Step 1 of 2' : 'Step 2 of 2'}</Text><Text style={styles.panelTitle}>{exercise === 'squat' ? 'Practice squats' : 'Practice push-ups'}</Text></View><Text accessibilityLiveRegion="polite" style={styles.count}>{count}<Text style={styles.countMax}> / 2</Text></Text></View>
        {done ? <Button onPress={goBack}>{returningToLobby ? 'Return to your room' : 'Choose my workout'}</Button> : exercise === 'squat' && count >= 2 ? <Button onPress={nextExercise}>Set up push-ups</Button> : <View style={styles.waiting}><Text accessibilityLiveRegion="polite" style={styles.waitingText}>{2 - count} {exercise === 'squat' ? count === 1 ? 'squat' : 'squats' : count === 1 ? 'push-up' : 'push-ups'} left in this step.</Text></View>}
        <Pressable accessibilityRole="switch" accessibilityLabel="Show body tracking" accessibilityState={{ checked: overlay }} onPress={() => setOverlay(value => !value)} style={styles.overlayToggle}>
          <View style={[styles.check, overlay && styles.toggleOn]}><Text style={styles.toggleMark}>{overlay ? '✓' : ''}</Text></View><Text style={styles.toggleText}>Show body tracking</Text>
        </Pressable>
        <Text accessibilityLiveRegion="polite" style={styles.trackingCue}>{coachOpen ? 'Camera check paused while the Coach is open.' : visible ? tracking?.cue || 'Your body is in frame. Complete each movement steadily.' : cameraState === 'running' ? 'Keep your shoulders, hips and feet visible to track your movement.' : 'Enable the camera when you are ready. The body outline follows your real movement.'}</Text>
      </View>
      <View style={styles.column}>
        <View style={styles.panelHeading}><Text style={styles.panelTitle}>{followsPose ? 'Live avatar' : 'Character preview'}</Text><Text style={styles.liveStatus}>{followsPose && visible ? 'Following you' : stage.name + ' stage'}</Text></View>
        <View style={styles.avatarPanel}>
          {focused && <HeroView characterId={selectedId} stage={stage.id} livePose={followsPose ? livePose : undefined} active={followsPose && focused && !coachOpen} style={styles.hero} />}
          <View style={styles.avatarCaption}><Text style={styles.characterName}>{selected.name}</Text><Text style={styles.previewNote}>{followsPose ? 'Your live movement drives this avatar.' : 'This character is a static preview. Body tracking and rep counting stay live in your camera.'}</Text></View>
        </View>
        <View style={styles.characterPicker}>
          <Text style={styles.pickerTitle}>Choose a character</Text>
          <View style={styles.characters}>{CHARACTERS.map(character => <Pressable key={character.id} accessibilityRole="radio"
            accessibilityLabel={`${character.name}, ${isTrainingCharacter(character.id) ? 'live avatar' : 'character preview'}`}
            accessibilityState={{ checked: selectedId === character.id }} onPress={() => setSelectedId(character.id)}
            style={[styles.characterChoice, selectedId === character.id && styles.characterSelected]}>
            <Image source={CHARACTER_ART[character.id]} style={styles.characterArt} resizeMode="contain" accessible={false} />
            <Text style={styles.characterLabel}>{character.name}</Text><Text style={[styles.characterMode, isTrainingCharacter(character.id) && { color: colors.brand }]}>{isTrainingCharacter(character.id) ? 'Live avatar' : 'Preview'}</Text>
          </Pressable>)}</View>
          <Text style={styles.previewNote}>All six characters are available to preview. Your saved hero stays the same.</Text>
        </View>
      </View>
    </View>
    <View style={[styles.instructions, wide && styles.instructionsWide]}>
      <View style={styles.instructionColumn}>
        <Heading size={29}>{exercise === 'squat' ? 'Two practice squats' : 'Two practice push-ups'}</Heading>
        <Text style={styles.instruction}>{exercise === 'squat' ? 'Stand tall, lower into a controlled squat, then return to standing. A full movement counts as one rep.' : 'Start in your top position, lower in control, then push back up. A full movement counts as one rep.'}</Text>
      </View>
      <View style={styles.instructionColumn}>
        <View style={styles.checklist}>
          <Check complete={calibration.squat >= 2} title="Squats" count={calibration.squat} />
          <Check complete={calibration.pushup >= 2} title="Push-ups" count={calibration.pushup} />
        </View>
        <Copy>No rep showing? Step into the light, check that your whole body is visible, and move steadily.</Copy>
        <Pressable accessibilityRole="button" style={styles.restart} onPress={reset}><Text style={styles.restartText}>Restart camera check</Text></Pressable>
      </View>
    </View>
    {!session.apiUrl && <Notice title="Add your server address" action={() => router.push('/profile')} actionLabel="Open setup">Your camera page loads from the VYRA server you configure in Profile.</Notice>}
  </Screen>;
}
// The completed box mirrors the primary button (light fill, `ink` mark) so the screen's two
// "done / go" affordances read as one family: `text` fill with an `ink` tick is 18.1:1, where the
// same tick on a `brand` or `accent` fill would be 5.2:1 / 5.6:1 — passing, but a visibly weaker
// pairing for a 14px glyph, and it would spend the accent hue on a checklist row.
// Unchecked, the border is the box's ONLY boundary, so it runs on `lineControl` (3.24:1 over the
// page, clearing 1.4.11) instead of the decorative `lineStrong`, which is only 1.77:1.
function Check({ complete, title, count }: { complete: boolean; title: string; count: number }) {
  return <View style={layout.split}><View style={layout.row}><View style={[styles.check, complete && { backgroundColor: colors.text, borderColor: colors.text }]}><Text style={{ color: colors.ink, fontWeight: '800' }}>{complete ? '✓' : ''}</Text></View><Text style={styles.checkTitle}>{title}</Text></View><Text style={styles.checkCount}>{count} / 2</Text></View>;
}
const styles = StyleSheet.create({
  columns: { gap: 28, marginBottom: 28 }, column: { flex: 1, minWidth: 0, gap: 12 },
  panelHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  panelTitle: { fontFamily: fonts.body, color: colors.text, fontSize: 15, fontWeight: '700' },
  liveStatus: { fontFamily: fonts.body, color: colors.muted, fontSize: 12 },
  repProgress: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  overlayToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, alignSelf: 'flex-start' },
  toggleOn: { borderColor: colors.brand, backgroundColor: colors.brand },
  toggleMark: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  toggleText: { fontFamily: fonts.body, color: colors.text, fontSize: 14, fontWeight: '600' },
  trackingCue: { fontFamily: fonts.body, color: colors.muted, fontSize: 14, lineHeight: 22 },
  avatarPanel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radii.lg, overflow: 'hidden' },
  hero: { height: 335 }, avatarCaption: { padding: 16, paddingTop: 4, gap: 5 },
  characterName: { fontFamily: fonts.display, fontSize: 24, color: colors.text, fontWeight: displayWeight.heavy },
  previewNote: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, lineHeight: 19 },
  characterPicker: { gap: 10 }, pickerTitle: { fontFamily: fonts.body, color: colors.text, fontSize: 14, fontWeight: '600' },
  characters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  characterChoice: { width: '31%', flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 8, gap: 3, borderWidth: 1, borderColor: colors.lineControl, borderRadius: radii.sm, backgroundColor: colors.glass },
  characterSelected: { borderColor: colors.brand, backgroundColor: colors.glassStrong },
  characterArt: { width: '100%', height: 54 }, characterLabel: { fontFamily: fonts.body, color: colors.text, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  characterMode: { fontFamily: fonts.body, color: colors.muted, fontSize: 10 },
  instructions: { gap: 24, paddingVertical: 20, borderTopWidth: 1, borderTopColor: colors.line, marginBottom: 28 },
  instructionsWide: { flexDirection: 'row', gap: 40 }, instructionColumn: { flex: 1, gap: 16 },
  // Eyebrow sits on `brand` to match the "Camera check" Pill above it (5.2:1 on the page); the rep
  // counter next to it is progress you just earned, so it takes `accent` (5.6:1).
  stepLabel: { fontFamily: fonts.body, color: colors.brand, fontWeight: '700', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.6 },
  count: { fontFamily: fonts.display, color: colors.accent, fontSize: 43, fontWeight: displayWeight.heavy }, countMax: { fontSize: 24, color: colors.muted },
  instruction: { fontFamily: fonts.body, color: colors.muted, fontSize: 16, lineHeight: 26 },
  checklist: { gap: 18, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 22 },
  check: { width: 25, height: 25, borderRadius: 9, borderWidth: 1, borderColor: colors.lineControl, alignItems: 'center', justifyContent: 'center' },
  checkTitle: { color: colors.text, fontFamily: fonts.body, fontSize: 16, fontWeight: '600' }, checkCount: { color: colors.muted, fontFamily: fonts.body, fontSize: 14 },
  waiting: { borderRadius: radii.md, padding: 16, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.line }, waitingText: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, textAlign: 'center' },
  restart: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }, restartText: { color: colors.brand, fontFamily: fonts.body, fontSize: 14, fontWeight: '600' },
});
