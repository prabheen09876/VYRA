import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { CHARACTERS, characterFor, isLivePoseFresh, type CharacterId, type CaptureCameraState, type CaptureMessage, type CapturePoseMessage, type Exercise } from '@vyra/core';
import { Button, Copy, Eyebrow, Heading, Screen, Stat } from '../src/components/ui';
import CaptureSurface from '../src/components/CaptureSurface';
import HeroView from '../src/components/HeroView';
import { displayFitnessStage } from '../src/components/FitnessUI';
import { isTrainingCharacter } from '../src/lib/liveCharacter';
import { useScreenFocus } from '../src/lib/useScreenFocus';
import { useApp } from '../src/state/AppProvider';
import { useCoach } from '../src/state/CoachProvider';
import { colors, displayWeight, fonts } from '../src/theme';

type Tracking = Extract<CaptureMessage, { type: 'capture.tracking' }>;
type Rep = Extract<CaptureMessage, { type: 'capture.rep' }>;
type SetPhase = 'ready' | 'running' | 'paused' | 'finished';
const timeLabel = (milliseconds: number) => {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

export default function TrainingScreen() {
  const { profile, session } = useApp();
  const { isOpen: coachOpen, openCoach } = useCoach();
  const { width } = useWindowDimensions();
  const focused = useScreenFocus();
  const wide = width >= 950;
  const [avatar, setAvatar] = useState<CharacterId>(() => characterFor(profile?.characterId).id);
  const liveAvatar = isTrainingCharacter(avatar);
  const stage = displayFitnessStage(profile?.stage);
  const [exercise, setExercise] = useState<Exercise>('squat');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [overlay, setOverlay] = useState(true);
  const [phase, setPhase] = useState<SetPhase>('ready');
  const [generation, setGeneration] = useState(0);
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [reps, setReps] = useState(0);
  const [formTotal, setFormTotal] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [now, setNow] = useState(Date.now());
  const livePose = useRef<CapturePoseMessage | null>(null);
  const runningSince = useRef<number | null>(null);
  const lastRepAt = useRef(0);
  const counting = useRef(false);
  const latestExercise = useRef(exercise);
  latestExercise.current = exercise;
  counting.current = focused && cameraOpen && !coachOpen && phase === 'running';

  const pause = useCallback(() => {
    counting.current = false;
    if (runningSince.current !== null) {
      const duration = Math.max(0, Date.now() - runningSince.current);
      setElapsed(value => value + duration);
      runningSince.current = null;
    }
    setPhase(current => current === 'running' ? 'paused' : current);
  }, []);
  useEffect(() => { if (coachOpen) pause(); }, [coachOpen, pause]);
  useEffect(() => { setAvatar(characterFor(profile?.characterId).id); }, [profile?.id, profile?.characterId]);
  useEffect(() => {
    if (!focused) { pause(); setCameraOpen(false); livePose.current = null; setTracking(null); }
  }, [focused, pause]);
  useEffect(() => {
    pause(); setCameraOpen(false); livePose.current = null; setTracking(null);
    setReps(0); setFormTotal(0); setElapsed(0); setPhase('ready'); setGeneration(value => value + 1);
  }, [session.apiUrl, profile?.id, pause]);
  useEffect(() => {
    if (!focused || !cameraOpen) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [focused, cameraOpen]);
  useEffect(() => () => { counting.current = false; livePose.current = null; }, []);

  const onPose = useCallback((message: CapturePoseMessage) => { livePose.current = message; }, []);
  const onCameraState = useCallback((state: CaptureCameraState) => {
    if (state === 'stopped') { pause(); livePose.current = null; setTracking(null); }
  }, [pause]);
  const onRep = useCallback((message: Rep) => {
    if (!counting.current || message.exercise !== latestExercise.current || message.occurredAt <= lastRepAt.current
      || message.occurredAt < (runningSince.current ?? Infinity)) return;
    lastRepAt.current = message.occurredAt;
    setReps(value => value + 1);
    setFormTotal(value => value + message.formScore);
  }, []);
  const clearSet = (nextExercise = exercise) => {
    pause(); setExercise(nextExercise); setPhase('ready'); setReps(0); setFormTotal(0); setElapsed(0);
    lastRepAt.current = 0; setGeneration(value => value + 1); livePose.current = null; setTracking(null);
  };
  const start = () => {
    if (!focused || !cameraOpen || coachOpen || !isLivePoseFresh(livePose.current) || !tracking?.visible) return;
    runningSince.current = Date.now(); setNow(runningSince.current); setPhase('running');
  };
  const finish = () => { pause(); setPhase('finished'); setCameraOpen(false); livePose.current = null; setTracking(null); };
  const bodyVisible = cameraOpen && focused && !coachOpen && isLivePoseFresh(livePose.current);
  const visible = bodyVisible && !!tracking?.visible;
  const totalTime = elapsed + (phase === 'running' && runningSince.current !== null ? Math.max(0, now - runningSince.current) : 0);
  const summary = phase === 'finished';

  return <Screen>
    <View style={styles.heading}>
      <Eyebrow>Live training</Eyebrow>
      <Heading size={wide ? 52 : 38}>Your movement, on screen.</Heading>
      <Copy>Practise your form with live body tracking and your character beside you. Take your next workout to the Arena to earn XP.</Copy>
    </View>
    <View style={[styles.toolbar, wide && { flexDirection: 'row', justifyContent: 'space-between' }]}>
      <View style={styles.choices}>{(['squat', 'pushup'] as const).map(value => <Pressable key={value} accessibilityRole="button"
        accessibilityState={{ selected: exercise === value, disabled: phase === 'running' }} disabled={phase === 'running'}
        onPress={() => { if (exercise !== value) clearSet(value); }} style={[styles.choice, exercise === value && styles.selected]}>
        <Text style={[styles.choiceText, exercise === value && { color: colors.brand }]}>{value === 'squat' ? 'Squats' : 'Push-ups'}</Text>
      </Pressable>)}</View>
      <Text style={styles.hint}>{exercise === 'squat' ? 'Stand back. Keep your head and feet in view.' : 'Use a side view. Keep shoulders, hips and feet in view.'}</Text>
    </View>
    <View style={[styles.studio, wide && { flexDirection: 'row' }]}>
      <View style={styles.column}>
        <Text style={styles.label}>YOUR CAMERA</Text>
        {cameraOpen && focused ? <CaptureSurface exercise={exercise} enabled={phase === 'running'} resetKey={`practice:${exercise}:${generation}`}
          onRep={onRep} onTracking={setTracking} onPose={onPose} onCameraState={onCameraState} debugOverlay={overlay} /> : <View style={styles.cameraPlaceholder}>
          <View style={styles.cameraSymbol}><View style={styles.lens} /></View>
          <Heading size={29}>{summary ? 'Set complete.' : 'Ready when you are.'}</Heading>
          <Text style={styles.placeholderCopy}>{summary ? `${reps} valid ${exercise === 'squat' ? 'squats' : 'push-ups'} in ${timeLabel(totalTime)}. Your camera is off.` : 'Choose an exercise, then enable your camera. Your video stays on this device.'}</Text>
          <Button onPress={() => { if (summary) clearSet(); setCameraOpen(true); }}>{summary ? 'Prepare another set' : 'Set up camera'}</Button>
        </View>}
        <View style={styles.setBar}>
          <View style={styles.metrics}>
            <View accessibilityLiveRegion="polite"><Stat value={reps} label="valid reps" color={colors.brand} /></View>
            <Stat value={timeLabel(totalTime)} label="set time" />
            <Stat value={reps ? `${Math.round(formTotal / reps)}%` : '—'} label="average rep form" />
          </View>
          <View style={styles.setActions}>
            {phase === 'running' ? <Button onPress={pause} variant="secondary">Pause set</Button> : <Button onPress={start} disabled={!visible || summary}>{phase === 'paused' ? 'Resume set' : 'Start set'}</Button>}
            {(phase === 'running' || phase === 'paused') && <Button onPress={finish} variant="secondary">Finish</Button>}
          </View>
        </View>
        <Text accessibilityLiveRegion="polite" style={styles.cue}>{summary ? 'Practice complete. Head to the Arena when you want a workout that earns XP.' : phase === 'paused' ? 'Set paused. Get back into position, then press Resume set to continue counting.' : phase === 'running' ? bodyVisible ? (tracking?.cue || 'Complete each movement and return to the starting position.') : 'Tracking lost. Move fully into frame to continue counting.' : visible ? 'Camera ready. Press Start set to begin counting your reps.' : cameraOpen ? tracking?.cue || 'Enable the camera and hold your starting position until tracking is ready.' : 'Set up your camera to begin. Changing exercise starts a new set.'}</Text>
      </View>
      <View style={styles.column}>
        <View style={styles.avatarHeading}><Text style={styles.label}>{liveAvatar ? 'LIVE AVATAR' : 'YOUR CHARACTER'}</Text><Text style={[styles.liveLabel, liveAvatar && bodyVisible && { color: colors.brand }]}>{liveAvatar ? bodyVisible ? 'Following you' : 'Waiting for movement' : 'Character preview'}</Text></View>
        <View style={styles.avatarStage}>
          {focused && <HeroView characterId={avatar} stage={stage.id} livePose={liveAvatar ? livePose : undefined} active={focused && liveAvatar} style={{ height: 390 }} />}
          <View style={styles.avatarOptions}>{CHARACTERS.map(character => <Pressable key={character.id} accessibilityRole="radio" accessibilityLabel={`${character.name}, ${isTrainingCharacter(character.id) ? 'live avatar' : 'character preview'}`} accessibilityState={{ checked: avatar === character.id }}
            onPress={() => setAvatar(character.id)} style={[styles.avatarChoice, avatar === character.id && styles.selected]}>
            <Text style={[styles.choiceText, styles.avatarName, avatar === character.id && { color: colors.brand }]}>{character.name}</Text>
            <Text style={[styles.avatarKind, isTrainingCharacter(character.id) && { color: colors.accent }]}>{isTrainingCharacter(character.id) ? 'Live avatar' : 'Preview'}</Text>
          </Pressable>)}</View>
          <Text style={styles.avatarNote}>Body tracking and reps work with every character. Base Male and Nami also follow your pose. This choice is for your practice session.</Text>
        </View>
      </View>
    </View>
    <View style={styles.footer}>
      <Pressable accessibilityRole="switch" accessibilityLabel="Show tracking overlay" accessibilityState={{ checked: overlay }} onPress={() => setOverlay(value => !value)} style={styles.toggle}>
        <View style={[styles.toggleBox, overlay && styles.toggleOn]}><Text style={styles.check}>{overlay ? '✓' : ''}</Text></View><Text style={styles.choiceText}>Show tracking overlay</Text>
      </Pressable>
      {cameraOpen && <Button variant="quiet" onPress={() => { pause(); setCameraOpen(false); livePose.current = null; setTracking(null); }}>Turn camera off</Button>}
      <Button variant="quiet" onPress={() => { pause(); openCoach(); }}>Ask the Coach</Button>
      <Button variant="secondary" onPress={() => { finish(); router.push(profile?.fitness ? '/arena' : profile ? '/onboarding' : '/profile'); }}>Work out for XP</Button>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  heading: { gap: 15, maxWidth: 790, marginBottom: 30 },
  toolbar: { gap: 16, alignItems: 'flex-start', marginBottom: 22 },
  choices: { flexDirection: 'row', gap: 10 }, choice: { minHeight: 46, minWidth: 106, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: 24, borderWidth: 1, borderColor: colors.lineControl },
  selected: { borderColor: colors.brand, backgroundColor: colors.glassStrong },
  choiceText: { fontFamily: fonts.body, fontSize: 14, color: colors.text, fontWeight: '600' },
  hint: { fontFamily: fonts.body, color: colors.muted, fontSize: 14, lineHeight: 22, alignSelf: 'center', flexShrink: 1 },
  studio: { gap: 24 }, column: { flex: 1, minWidth: 0, gap: 12 },
  label: { fontFamily: fonts.body, color: colors.muted, fontSize: 11, letterSpacing: 1.5, fontWeight: '700' },
  cameraPlaceholder: { minHeight: 492, borderRadius: 24, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 19, padding: 26 },
  cameraSymbol: { width: 66, height: 50, borderWidth: 2, borderColor: colors.faint, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  lens: { width: 24, height: 24, borderWidth: 2, borderColor: colors.brand, borderRadius: 12 },
  placeholderCopy: { maxWidth: 330, fontFamily: fonts.body, color: colors.muted, fontSize: 15, lineHeight: 24, textAlign: 'center' },
  avatarHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  liveLabel: { fontFamily: fonts.body, color: colors.faint, fontSize: 11 },
  avatarStage: { minHeight: 492, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.backgroundElevated, borderRadius: 24, overflow: 'hidden', paddingBottom: 18, gap: 13 },
  avatarOptions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  avatarChoice: { flexBasis: '28%', flexGrow: 1, minWidth: 80, maxWidth: 160, minHeight: 58, gap: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.lineControl, borderRadius: 16, paddingHorizontal: 8, paddingVertical: 8 },
  avatarName: { fontSize: 13, textAlign: 'center' },
  avatarKind: { fontFamily: fonts.body, fontSize: 10, lineHeight: 15, color: colors.muted },
  avatarNote: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.muted, textAlign: 'center', paddingHorizontal: 16 },
  setBar: { paddingVertical: 24, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 24 },
  metrics: { flexDirection: 'row', justifyContent: 'space-around', flexWrap: 'wrap', gap: 16 },
  setActions: { flexDirection: 'row', gap: 12, justifyContent: 'center', flexWrap: 'wrap' },
  cue: { fontFamily: fonts.body, color: colors.muted, fontSize: 14, lineHeight: 23, paddingBottom: 20 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16, marginBottom: 20 },
  toggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 'auto' },
  toggleBox: { width: 23, height: 23, borderWidth: 1, borderColor: colors.lineControl, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  toggleOn: { backgroundColor: colors.brand, borderColor: colors.brand }, check: { fontSize: 16, color: colors.ink, fontWeight: displayWeight.heavy },
});
