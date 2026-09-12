import React, { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { MatchMode } from '@vyra/core';
import { Button, Copy, Heading, Notice, Pill, Screen, layout } from '../src/components/ui';
import TestModeBadge from '../src/components/TestModeBadge';
import { useApp } from '../src/state/AppProvider';
import { errorMessage } from '../src/lib/api';
import { isMatchmakingCancellation } from '../src/lib/matchmaking-session';
import { ROOM_CODE_LENGTH, normalizeRoomCode } from '../src/lib/room-code';
import { colors, displayWeight, fonts, radii } from '../src/theme';

export default function ArenaScreen() {
  const params = useLocalSearchParams<{ mode?: string; room?: string }>();
  const { profile, calibrated, createMatch, joinMatch, matchmakingStatus, enterMatchmaking, cancelMatchmaking } = useApp();
  const [mode, setMode] = useState<MatchMode>(params.mode === 'pvp' ? 'pvp' : 'solo');
  const [room, setRoom] = useState(() => normalizeRoomCode(params.room || ''));
  const [pending, setPending] = useState<'create' | 'join' | 'random' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeAttempt = useRef(0);
  const focused = useRef(false);
  const { width } = useWindowDimensions();
  const searching = matchmakingStatus === 'searching';
  // Blur, not unmount: app/_layout.tsx renders a <Stack>, so /arena stays mounted underneath
  // anything pushed on top of it and an unmount cleanup would never run for most ways out. Leaving
  // must not strand the player in the server-side queue — they would be matched into a battle they
  // cannot see, and their next search refused as ALREADY_CONNECTED. Unconditional by design: this
  // only ends a *live* search, and a pairing already handed to the match socket has released its
  // session by now, so an established battle (room-code or random) is never cancelled by it.
  useFocusEffect(useCallback(() => {
    focused.current = true;
    setPending(null);
    return () => {
      focused.current = false;
      activeAttempt.current += 1;
      cancelMatchmaking();
    };
  }, [cancelMatchmaking]));
  // Bumps the attempt id before clearing anything, so the search this ends can no longer write its
  // own outcome back — which is what makes clearing `pending` here safe rather than a second writer.
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
    // Naming an opponent supersedes looking for any opponent. A queue search can stay open
    // indefinitely — that is what waiting *is* — so gating this screen's other actions behind it
    // left a player who had a room code staring at a greyed-out Join button with no hint why.
    // Claim the attempt id first so the abandoned search cannot clear the spinner this one owns.
    const attempt = ++activeAttempt.current;
    cancelMatchmaking();
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
    if (!calibrated) { router.push({ pathname: '/calibrate', params: { next: 'arena', mode: 'pvp' } }); return; }
    // Ignore everything a superseded search reports: cancelling and searching again must not let the
    // abandoned attempt clear the new one's spinner or raise a banner over it.
    const attempt = ++activeAttempt.current;
    const mine = () => focused.current && attempt === activeAttempt.current;
    setPending('random'); setError(null);
    try {
      await enterMatchmaking();
      if (mine()) router.push('/lobby');
    } catch (failure) {
      // A cancel is the player's own doing — it settles the search, but it is not an error.
      if (mine() && !isMatchmakingCancellation(failure)) setError(errorMessage(failure));
    } finally { if (mine()) setPending(null); }
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
    {searching && <Notice tone="info" title="Searching for an opponent…" action={cancelSearch} actionLabel="Cancel search">Hang tight — this jumps straight into a private match the moment someone else is found.</Notice>}
    <View style={styles.actions}>
      {/* `pending !== 'random'` throughout, and never `searching`: a search in flight is a wait, not
          a lock. Blocking on it meant an unanswered "Battle with Randoms" disabled every other way
          out of this screen — including the room code the player had already been given. */}
      <Button onPress={() => begin()} loading={pending === 'create'} disabled={!!pending && pending !== 'random'} style={{ flex: 1 }}>{!profile ? 'Create your player' : mode === 'pvp' ? 'Create private room' : !calibrated ? 'Prepare my camera' : 'Start solo training'}</Button>
      {mode === 'pvp' && !!profile && <Button variant="secondary" onPress={beginRandom} loading={pending === 'random'} disabled={!!pending && pending !== 'random'} style={{ flex: 1 }}>Battle with Randoms</Button>}
    </View>
    <View style={styles.rules}><Text style={styles.ruleText}>Squats add guard</Text><View style={styles.ruleDot} /><Text style={styles.ruleText}>Push-ups deal damage</Text><View style={styles.ruleDot} /><Text style={styles.ruleText}>Stop any time</Text></View>
    {!searching && <Button variant="quiet" onPress={() => router.push('/train')} disabled={!!pending}>Practise with a live avatar</Button>}
    <View style={styles.join}>
      <Heading size={25}>Have a room code?</Heading><Copy>Join the private room your friend created.</Copy>
      {/* minWidth 0 because react-native-web resets it on View but not on TextInput: left at `auto`
          the input refuses to shrink below its intrinsic width and pushes "Join room", which cannot
          shrink either, off the right edge of a phone-width screen. */}
      <View style={[layout.row, { alignItems: 'stretch' }]}><TextInput accessibilityLabel="Private room code" placeholder="ROOM CODE" placeholderTextColor={colors.faint} autoCapitalize="characters" autoCorrect={false} maxLength={ROOM_CODE_LENGTH} value={room} onChangeText={value => setRoom(normalizeRoomCode(value))} style={[layout.input, { flex: 1, minWidth: 0, letterSpacing: 3, fontWeight: '700' }]} /><Button variant="secondary" onPress={() => begin(true)} disabled={!room || (!!pending && pending !== 'random')} loading={pending === 'join'}>Join room</Button></View>
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
