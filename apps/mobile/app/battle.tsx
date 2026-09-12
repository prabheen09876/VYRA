import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { TIMING, type Exercise, type PlayerState } from '@vyra/core';
import CaptureSurface from '../src/components/CaptureSurface';
import SimulatedCaptureSurface from '../src/components/SimulatedCaptureSurface';
import TestModeBadge from '../src/components/TestModeBadge';
import { Button, Copy, Heading, Loading, Meter, Notice, Pill, Screen, layout } from '../src/components/ui';
import { useApp } from '../src/state/AppProvider';
import { ARENA_TEST_MODE } from '../src/lib/testMode';
import { colors, displayWeight, fonts, radii } from '../src/theme';

// Input Provider swap point: same props, same onRep/onTracking pathway into the real backend.
// Flip ARENA_TEST_MODE off (see src/lib/testMode.ts) to go back to the real camera — nothing
// else in this screen or in AppProvider needs to change.
const InputSurface = ARENA_TEST_MODE ? SimulatedCaptureSurface : CaptureSurface;

const phaseCopy = {
  lobby: { title: 'Getting ready', copy: 'Waiting for both players.' },
  countdown: { title: 'Find your stance.', copy: 'Squats come first. Get your whole body in frame.' },
  squat: { title: 'Build your guard.', copy: 'Each valid squat strengthens your defense.' },
  transition: { title: 'Get ready for push-ups.', copy: 'Move your phone if needed. Set up a clear side view.' },
  pushup: { title: 'Power your attack.', copy: 'Each valid push-up adds to your attack.' },
  resolve: { title: 'Round complete.', copy: 'Your attacks and guard are being resolved together.' },
  recovery: { title: 'Breathe. You earned it.', copy: 'Take a short recovery before the next round.' },
  finished: { title: 'Workout complete.', copy: 'Your results are ready.' },
  interrupted: { title: 'Workout stopped.', copy: 'Your camera is no longer counting.' },
} as const;

export default function BattleScreen() {
  const { profile, session, snapshot, match, serverOffset, matchError, localStopped, socketStatus, sendRep, sendTracking, stopMatch, setPreferences } = useApp();
  const [now, setNow] = useState(Date.now());
  const { width } = useWindowDimensions();
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (snapshot?.phase === 'finished' || snapshot?.phase === 'interrupted') router.replace('/results');
  }, [snapshot?.phase]);
  const stop = () => { stopMatch('Player stopped the workout'); router.replace('/results'); };
  if (!match) return <Screen noNav><Notice title="No workout is running" action={() => router.replace('/arena')} actionLabel="Choose a workout">Create a solo session or join a private room to enter a live workout.</Notice></Screen>;
  if (!snapshot) return <Screen noNav back={stop}><Loading text="Joining your workout…" />{matchError && <Notice title="Arena connection failed" action={() => router.replace('/arena')} actionLabel="Choose a new workout">{matchError}</Notice>}</Screen>;
  const copy = phaseCopy[snapshot.phase];
  const exercise: Exercise | null = snapshot.phase === 'squat' || snapshot.phase === 'pushup' ? snapshot.phase : null;
  const remaining = Math.max(0, Math.ceil((snapshot.phaseEndsAt - now - serverOffset) / 1000));
  const duration = Math.max(1, snapshot.phaseEndsAt - snapshot.phaseStartedAt);
  const elapsed = Math.max(0, now + serverOffset - snapshot.phaseStartedAt);
  const me = snapshot.players.find(player => player.id === profile?.id);
  const opponent = snapshot.players.find(player => player.id !== profile?.id);
  const counting = !!exercise && !localStopped && socketStatus === 'connected';
  return <Screen noNav back={stop}>
    <TestModeBadge />
    <View style={[layout.split, { marginBottom: 18 }]}><Pill color={colors.ember}>Round {snapshot.round} of {TIMING.maxRounds}</Pill><Button variant="quiet" onPress={() => setPreferences({ muted: !session.muted })}>{session.muted ? 'Sound off' : 'Sound on'}</Button></View>
    <View style={styles.scoreboard}>{me && <PlayerBar player={me} yours />}{opponent && <PlayerBar player={opponent} />}</View>
    <View style={styles.phaseHeader}><View style={{ flex: 1, gap: 8 }}><Heading size={width >= 750 ? 39 : 30}>{copy.title}</Heading><Copy>{copy.copy}</Copy></View><View style={styles.timer}><Text style={styles.time}>{remaining}</Text><Text style={styles.seconds}>seconds</Text></View></View>
    {/* Phase clock: ember for the push-up attack (heat, effort), brand orchid for squats and for
        every non-exercise phase. Deliberately not success/accent so it never reads as a third
        health bar next to the scoreboard above. */}
    <View style={{ marginBottom: 24 }}><Meter value={duration - elapsed} max={duration} color={exercise === 'pushup' ? colors.ember : colors.brand} label="Time remaining in this phase" /></View>
    {matchError && <Notice title={localStopped ? 'Workout interrupted' : 'Arena update'}>{matchError}</Notice>}
    <View style={[styles.columns, width >= 850 && { flexDirection: 'row' }]}>
      <View style={{ flex: 1.5 }}><InputSurface exercise={exercise} enabled={counting} suspended={localStopped || snapshot.phase === 'interrupted' || snapshot.phase === 'finished'} resetKey={snapshot.phaseId} onRep={sendRep} onTracking={sendTracking} /></View>
      <View style={[styles.side, width >= 850 && { flex: 0.7 }]}>
        <View style={styles.repPanel}><Text style={styles.repLabel}>{exercise === 'pushup' ? 'Your push-ups this round' : 'Your squats this round'}</Text><Text style={[styles.repCount, { color: exercise === 'pushup' ? colors.ember : colors.brand }]}>{exercise === 'pushup' ? me?.pushups ?? 0 : me?.squats ?? 0}</Text><Text style={styles.repCaption}>{counting ? 'Valid reps accepted by the arena' : 'Rep counting is paused during this phase'}</Text></View>
        <View style={styles.coach}><Pill color={colors.spark}>{snapshot.decision.source === 'ai' ? 'AI game master' : 'Rules game master'}</Pill><Text style={styles.coachText}>{snapshot.decision.reason}</Text><Text style={styles.coachSmall}>{snapshot.phase === 'recovery' ? 'Next round: ' : 'Round pace: '}{snapshot.phase === 'recovery' ? snapshot.decision.template : snapshot.template}</Text></View>
        <View style={layout.split}><Text style={styles.totalLabel}>Your workout total</Text><Text style={styles.totalValue}>{me?.totalReps ?? 0} reps</Text></View>
        <Button variant="danger" onPress={stop}>Stop workout</Button>
        <Text style={styles.stopNote}>Rest whenever you need to. Stop if a movement hurts. Keep this app open while you train.</Text>
      </View>
    </View>
  </Screen>;
}
function PlayerBar({ player, yours = false }: { player: PlayerState; yours?: boolean }) {
  // The scoreboard's one job is telling the two health bars apart at a glance mid-rep, so the
  // pair is held at opposite ends of the wheel: green for you, hot magenta for the rival. Both
  // clear 4.5:1 on the pure-black ground as the HP readout (11.2:1 and 5.6:1).
  const color = yours ? colors.success : colors.accent;
  return <View style={styles.playerBar}><View style={layout.split}><Text numberOfLines={1} style={styles.playerName}>{player.name}{yours ? ' (you)' : player.isBot ? ' · bot' : ''}</Text><Text style={[styles.hp, { color }]}>{Math.max(0, Math.round(player.hp))} HP</Text></View><Meter value={player.hp} max={100} color={color} label={player.name + ' health'} /><View style={layout.split}><Text style={styles.guard}>Guard {Math.round(player.guard * 100)}%</Text><Text style={styles.guard}>{player.totalReps} total reps</Text></View></View>;
}
const styles = StyleSheet.create({
  scoreboard: { flexDirection: 'row', gap: 22, marginBottom: 30 }, playerBar: { flex: 1, gap: 10, minWidth: 0 },
  playerName: { fontFamily: fonts.body, color: colors.text, fontSize: 14, fontWeight: '700', flex: 1 }, hp: { fontFamily: fonts.body, fontWeight: '700', fontSize: 13 },
  guard: { fontFamily: fonts.body, color: colors.muted, fontSize: 11 },
  phaseHeader: { flexDirection: 'row', alignItems: 'center', gap: 18, marginBottom: 20 },
  timer: { minWidth: 76, alignItems: 'center', gap: 0 }, time: { fontFamily: fonts.display, fontSize: 52, lineHeight: 58, fontWeight: displayWeight.heavy, color: colors.text, fontVariant: ['tabular-nums'] },
  seconds: { fontFamily: fonts.body, color: colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2 },
  columns: { gap: 24 }, side: { gap: 20 },
  repPanel: { padding: 24, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.line, borderRadius: radii.xl, alignItems: 'center', gap: 7 },
  repLabel: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, fontWeight: '700', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1.2 }, repCount: { fontFamily: fonts.display, fontSize: 78, lineHeight: 91, fontWeight: displayWeight.heavy },
  repCaption: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  coach: { gap: 12, paddingVertical: 6 }, coachText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 24, color: colors.text },
  coachSmall: { fontFamily: fonts.body, fontSize: 12, color: colors.muted }, totalLabel: { fontFamily: fonts.body, color: colors.muted, fontSize: 14 },
  totalValue: { fontFamily: fonts.body, color: colors.text, fontSize: 16, fontWeight: '700' }, stopNote: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, lineHeight: 20 },
});
