import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { MatchMode } from '@vyra/core';
import { Button, Copy, Heading, Notice, Pill, Screen, layout } from '../src/components/ui';
import TestModeBadge from '../src/components/TestModeBadge';
import { useApp } from '../src/state/AppProvider';
import { errorMessage } from '../src/lib/api';
import { isMatchmakingCancelled } from '../src/lib/matchmaking-client';
import { colors, displayWeight, fonts, radii } from '../src/theme';

export default function ArenaScreen() {
  const params = useLocalSearchParams<{ mode?: string; room?: string }>();
  const { profile, calibrated, createMatch, joinMatch, matchmakingStatus, enterMatchmaking, cancelMatchmaking } = useApp();
  const [mode, setMode] = useState<MatchMode>(params.mode === 'pvp' ? 'pvp' : 'solo');
  const [room, setRoom] = useState(params.room || '');
  const [pending, setPending] = useState<'create' | 'join' | 'random' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeAttempt = useRef(0);
  const focused = useRef(false);
  const { width } = useWindowDimensions();
  const searching = matchmakingStatus === 'searching';
  useEffect(() => {
    if (!pending && !searching && (params.mode === 'solo' || params.mode === 'pvp')) setMode(params.mode);
  }, [params.mode, pending, searching]);
  const chooseMode = (next: MatchMode) => {
    if (pending || searching) return;
    setMode(next); setError(null);
    router.setParams({ mode: next });
  };
  useFocusEffect(useCallback(() => {
    focused.current = true;
    setPending(null);
    return () => {
      focused.current = false;
      activeAttempt.current += 1;
      cancelMatchmaking();
    };
  }, [cancelMatchmaking]));
  const cancelSearch = () => {
    activeAttempt.current += 1;
    cancelMatchmaking();
    setPending(null);
    setError(null);
  };
  const begin = async (joining = false) => {
    if (pending || searching) return;
    if (!profile) { router.push('/profile'); return; }
    if (!profile.fitness) { router.push('/onboarding'); return; }
    if (!joining && mode === 'solo' && !calibrated) {
      router.push({ pathname: '/calibrate', params: { next: 'arena', mode, room: joining ? room : '' } });
      return;
    }
    const attempt = ++activeAttempt.current;
    setPending(joining ? 'join' : 'create'); setError(null);
    try {
      await (joining ? joinMatch(room) : createMatch(mode));
      if (focused.current && attempt === activeAttempt.current) router.push('/lobby');
    } catch (failure) {
      if (focused.current && attempt === activeAttempt.current) setError(errorMessage(failure));
    } finally {
      if (focused.current && attempt === activeAttempt.current) setPending(null);
    }
  };
  const beginRandom = async () => {
    if (pending || searching) return;
    if (!profile) { router.push('/profile'); return; }
    if (!profile.fitness) { router.push('/onboarding'); return; }
    const attempt = ++activeAttempt.current;
    setPending('random'); setError(null);
    try {
      await enterMatchmaking();
      if (focused.current && attempt === activeAttempt.current) router.push('/lobby');
    } catch (failure) {
      if (focused.current && attempt === activeAttempt.current && !isMatchmakingCancelled(failure)) setError(errorMessage(failure));
    } finally {
      if (focused.current && attempt === activeAttempt.current) setPending(null);
    }
  };
  return <Screen>
    <TestModeBadge />
    <View style={layout.section}><Pill color={colors.brand}>The arena</Pill><Heading size={42}>Choose how you play.</Heading><Copy>Train against a bot, find an opponent, or invite a friend. Three rounds of real squats and push-ups.</Copy></View>
    {!profile && <Notice title="Create your player first" action={() => router.push('/profile')} actionLabel="Open profile">Your profile saves the XP and collectibles you earn.</Notice>}
    {profile && !profile.fitness && <Notice title="Set your goal before you play" tone="info" action={() => router.push('/onboarding')} actionLabel="Set my goal">Choose your character and starting measurements to connect workouts with your progress.</Notice>}
    <View style={styles.modes}>
      {([
        { id: 'solo', title: 'Solo', symbol: '◈', detail: 'Train against a bot. Build your rhythm and earn progress at your own pace.', compact: 'Practise against a bot.', tag: 'Your own pace' },
        { id: 'pvp', title: 'Multiplayer', symbol: '◇', detail: 'Find an opponent online or invite a friend. Your real reps decide the round.', compact: 'Find a rival or invite a friend.', tag: 'Online 1v1' },
      ] as const).map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={item.title} accessibilityState={{ checked: mode === item.id, disabled: !!pending || searching }} disabled={!!pending || searching} onPress={() => chooseMode(item.id)} style={[styles.mode, width < 750 && styles.modeCompact, mode === item.id && styles.modeSelected]}>
        <View style={layout.split}><Text style={[styles.symbol, width < 750 && styles.symbolCompact, { color: mode === item.id ? colors.brand : colors.muted }]}>{item.symbol}</Text><View style={[styles.radio, mode === item.id && styles.radioSelected]} /></View>
        <Text style={[styles.modeTitle, width < 750 && styles.modeTitleCompact]}>{item.title}</Text><Text style={styles.modeCopy}>{width >= 750 ? item.detail : item.compact}</Text><Pill color={colors.muted}>{item.tag}</Pill>
      </Pressable>)}
    </View>
    {error && <Notice title="Could not enter the arena">{error}</Notice>}
    {searching && <Notice tone="info" title="Searching for an opponent…" action={cancelSearch} actionLabel="Cancel search">We’ll open your room when an opponent is found. You can prepare your camera there before getting ready.</Notice>}
    {mode === 'pvp' && <Copy style={styles.matchmakingHint}>Find your opponent first. You’ll prepare your camera together in the lobby.</Copy>}
    <View style={[styles.actions, width < 600 && { flexDirection: 'column' }]}>
      {mode === 'pvp' ? <>
        <Button onPress={beginRandom} loading={pending === 'random'} disabled={!!pending || searching} style={{ flex: 1 }}>Find an opponent</Button>
        <Button variant="secondary" onPress={() => begin()} loading={pending === 'create'} disabled={!!pending || searching} style={{ flex: 1 }}>Create private room</Button>
      </> : <Button onPress={() => begin()} loading={pending === 'create'} disabled={!!pending || searching} style={{ flex: 1 }}>{!profile ? 'Create your player' : !calibrated ? 'Prepare my camera' : 'Start solo training'}</Button>}
    </View>
    <View style={styles.rules}><Text style={styles.ruleText}>Squats add guard</Text><View style={styles.ruleDot} /><Text style={styles.ruleText}>Push-ups deal damage</Text><View style={styles.ruleDot} /><Text style={styles.ruleText}>Stop any time</Text></View>
    {!searching && <Button variant="quiet" onPress={() => router.push('/train')} disabled={!!pending}>Practise with a live avatar</Button>}
    {mode === 'pvp' && <View style={styles.join}>
      <Heading size={25}>Have a room code?</Heading><Copy>Join the private room your friend created.</Copy>
      <View style={[layout.row, { alignItems: 'stretch' }]}><TextInput accessibilityLabel="Private room code" placeholder="ROOM CODE" placeholderTextColor={colors.faint} autoCapitalize="characters" autoCorrect={false} maxLength={12} value={room} onChangeText={setRoom} style={[layout.input, { flex: 1, letterSpacing: 3, fontWeight: '700' }]} /><Button variant="secondary" onPress={() => begin(true)} disabled={!room.trim() || !!pending || searching} loading={pending === 'join'}>Join room</Button></View>
    </View>}
  </Screen>;
}
const styles = StyleSheet.create({
  modes: { flexDirection: 'row', gap: 14, marginBottom: 22 }, actions: { flexDirection: 'row', gap: 14, marginTop: 8 },
  mode: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: radii.xl, padding: 25, gap: 14, backgroundColor: colors.glass },
  modeCompact: { padding: 16, gap: 10, borderRadius: radii.lg },
  modeSelected: { borderColor: colors.brand, backgroundColor: colors.glassStrong },
  symbol: { fontSize: 49, lineHeight: 58 },
  symbolCompact: { fontSize: 32, lineHeight: 38 },
  // Unchecked, this ring is the ONLY thing that draws the control, so 1.4.11 wants 3:1 against the
  // card behind it. `lineStrong` manages 1.84 there; `lineControl` flattens to 3.28:1 over the
  // card's glass fill. Checked, the ring is overridden inline with the mode's own hue.
  radio: { width: 23, height: 23, borderRadius: 12, borderWidth: 2, borderColor: colors.lineControl },
  radioSelected: { borderColor: colors.brand, borderWidth: 6 },
  modeTitle: { fontFamily: fonts.display, color: colors.text, fontSize: 29, fontWeight: displayWeight.heavy, letterSpacing: -0.9 },
  modeTitleCompact: { fontSize: 24 },
  modeCopy: { fontFamily: fonts.body, color: colors.muted, fontSize: 15, lineHeight: 23, minHeight: 46 },
  matchmakingHint: { marginBottom: 10 },
  rules: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, flexWrap: 'wrap', paddingVertical: 20 },
  ruleText: { color: colors.muted, fontFamily: fonts.body, fontSize: 12 }, ruleDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.muted },
  join: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 12, paddingTop: 30, gap: 16, maxWidth: 650 },
});
