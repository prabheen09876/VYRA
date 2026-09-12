import React, { useCallback, useRef, useState } from 'react';
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
  return <Screen noNav back={() => router.replace('/')}>
    <TestModeBadge />
    {/* `ember` reads as heat/effort, which is what this screen is about — and it ties the page
        label to the head-to-head card below, which carries the same hue. 5.4:1 on the Pill's
        own glass over the page, so it clears 4.5:1 at the Pill's 11px. */}
    <View style={layout.section}><Pill color={colors.ember}>The arena</Pill><Heading size={42}>Your effort is{'\n'}your superpower.</Heading><Copy>Three rounds. Squats for guard, push-ups for attack. Move well and go at your own pace.</Copy></View>
    {!profile && <Notice title="Create your player first" action={() => router.push('/profile')} actionLabel="Open profile">Your profile saves the XP and collectibles you earn.</Notice>}
    <View style={[styles.modes, width >= 750 && { flexDirection: 'row' }]}>
      {([
        // Each mode carries a fixed identity hue (it does not change with selection): orchid `brand`
        // for the default solo path, red `ember` for the head-to-head one. The hue is carried by the
        // 49px symbol and the selected border/ring only — both are large text or UI boundary, so 3:1
        // applies and both clear it (brand 4.59:1, ember 5.06:1 over the SELECTED card fill, which is
        // glassStrong, not glass). It is deliberately NOT carried by the 11px tag Pill: see below.
        { id: 'solo', title: 'Solo training', symbol: '◈', detail: 'Face a transparent training bot. Find your rhythm and earn real progress.', color: colors.brand, tag: 'You + training bot' },
        { id: 'pvp', title: 'Private 1v1', symbol: '◇', detail: 'Create a room and invite one friend. Your cameras count the reps. Your effort decides the round.', color: colors.ember, tag: 'You + a friend' },
      ] as const).map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: mode === item.id }} onPress={() => setMode(item.id)} style={[styles.mode, mode === item.id && { borderColor: item.color, backgroundColor: colors.glassStrong }]}>
        <View style={layout.split}><Text style={[styles.symbol, { color: item.color }]}>{item.symbol}</Text><View style={[styles.radio, mode === item.id && { borderColor: item.color, borderWidth: 6 }]} /></View>
        {/* The tag Pill does NOT take `item.color`. Pill paints its own `colors.glass` on top of the
            card, and when the card is selected that card is already `glassStrong` — two translucent
            layers, so the real backdrop is rgb(35,25,48), not the bare rgb(15,11,23). `brand` lands
            at 4.24:1 there and fails 4.5:1 at the Pill's 11px, and solo is selected on first paint.
            `muted` is 6.25:1 selected / 6.80:1 unselected and keeps the orchid cast. */}
        <Text style={styles.modeTitle}>{item.title}</Text><Text style={styles.modeCopy}>{item.detail}</Text><Pill color={colors.muted}>{item.tag}</Pill>
      </Pressable>)}
    </View>
    {error && <Notice title="Could not enter the arena">{error}</Notice>}
    {searching && <Notice tone="info" title="Searching for an opponent…" action={cancelSearch} actionLabel="Cancel search">We’ll open your room when an opponent is found. You can prepare your camera there before getting ready.</Notice>}
    <View style={styles.actions}>
      <Button onPress={() => begin()} loading={pending === 'create'} disabled={!!pending || searching} style={{ flex: 1 }}>{!profile ? 'Create your player' : mode === 'pvp' ? 'Create private room' : !calibrated ? 'Prepare my camera' : 'Start solo training'}</Button>
      {mode === 'pvp' && !!profile && <Button variant="secondary" onPress={beginRandom} loading={pending === 'random'} disabled={!!pending || searching} style={{ flex: 1 }}>Battle with Randoms</Button>}
    </View>
    <View style={styles.rules}><Text style={styles.ruleText}>Squats add guard</Text><View style={styles.ruleDot} /><Text style={styles.ruleText}>Push-ups deal damage</Text><View style={styles.ruleDot} /><Text style={styles.ruleText}>Stop any time</Text></View>
    <View style={styles.join}>
      <Heading size={25}>Have a room code?</Heading><Copy>Join the private room your friend created.</Copy>
      <View style={[layout.row, { alignItems: 'stretch' }]}><TextInput accessibilityLabel="Private room code" placeholder="ROOM CODE" placeholderTextColor={colors.faint} autoCapitalize="characters" autoCorrect={false} maxLength={12} value={room} onChangeText={setRoom} style={[layout.input, { flex: 1, letterSpacing: 3, fontWeight: '700' }]} /><Button variant="secondary" onPress={() => begin(true)} disabled={!room.trim() || !!pending || searching} loading={pending === 'join'}>Join room</Button></View>
    </View>
  </Screen>;
}
const styles = StyleSheet.create({
  modes: { gap: 18, marginBottom: 22 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 },
  mode: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: radii.xl, padding: 25, gap: 14, backgroundColor: colors.glass },
  symbol: { fontSize: 49, lineHeight: 58 },
  // Unchecked, this ring is the ONLY thing that draws the control, so 1.4.11 wants 3:1 against the
  // card behind it. `lineStrong` manages 1.84 there; `lineControl` flattens to 3.28:1 over the
  // card's glass fill. Checked, the ring is overridden inline with the mode's own hue.
  radio: { width: 23, height: 23, borderRadius: 12, borderWidth: 2, borderColor: colors.lineControl },
  modeTitle: { fontFamily: fonts.display, color: colors.text, fontSize: 29, fontWeight: displayWeight.heavy, letterSpacing: -0.9 },
  modeCopy: { fontFamily: fonts.body, color: colors.muted, fontSize: 15, lineHeight: 23, minHeight: 46 },
  rules: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, flexWrap: 'wrap', paddingVertical: 20 },
  ruleText: { color: colors.muted, fontFamily: fonts.body, fontSize: 12 }, ruleDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.muted },
  join: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 12, paddingTop: 30, gap: 16, maxWidth: 650 },
});
