import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { MatchMode } from '@vyra/core';
import { Button, Copy, Heading, Notice, Pill, Screen, layout } from '../src/components/ui';
import { useApp } from '../src/state/AppProvider';
import { errorMessage } from '../src/lib/api';
import { colors, fonts } from '../src/theme';

export default function ArenaScreen() {
  const params = useLocalSearchParams<{ mode?: string; room?: string }>();
  const { profile, calibrated, createMatch, joinMatch } = useApp();
  const [mode, setMode] = useState<MatchMode>(params.mode === 'pvp' ? 'pvp' : 'solo');
  const [room, setRoom] = useState(params.room || '');
  const [pending, setPending] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const begin = async (joining = false) => {
    if (!profile) { router.push('/profile'); return; }
    if (!calibrated) {
      router.push({ pathname: '/calibrate', params: { next: 'arena', mode, room: joining ? room : '' } });
      return;
    }
    setPending(joining ? 'join' : 'create'); setError(null);
    try {
      await (joining ? joinMatch(room) : createMatch(mode));
      router.push('/lobby');
    } catch (failure) { setError(errorMessage(failure)); } finally { setPending(null); }
  };
  return <Screen noNav back={() => router.replace('/')}>
    <View style={layout.section}><Pill color={colors.coral}>The arena</Pill><Heading size={42}>Your effort is{'\n'}your superpower.</Heading><Copy>Three rounds. Squats for guard, push-ups for attack. Move well and go at your own pace.</Copy></View>
    {!profile && <Notice title="Create your player first" action={() => router.push('/profile')} actionLabel="Open profile">Your profile saves the XP and collectibles you earn.</Notice>}
    <View style={[styles.modes, width >= 750 && { flexDirection: 'row' }]}>
      {([
        { id: 'solo', title: 'Solo training', symbol: '◈', detail: 'Face a transparent training bot. Find your rhythm and earn real progress.', color: colors.teal, tag: 'You + training bot' },
        { id: 'pvp', title: 'Private 1v1', symbol: '◇', detail: 'Create a room and invite one friend. Your cameras count the reps. Your effort decides the round.', color: colors.coral, tag: 'You + a friend' },
      ] as const).map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: mode === item.id }} onPress={() => setMode(item.id)} style={[styles.mode, mode === item.id && { borderColor: item.color, backgroundColor: '#233C4F' }]}>
        <View style={layout.split}><Text style={[styles.symbol, { color: item.color }]}>{item.symbol}</Text><View style={[styles.radio, mode === item.id && { borderColor: item.color, borderWidth: 6 }]} /></View>
        <Text style={styles.modeTitle}>{item.title}</Text><Text style={styles.modeCopy}>{item.detail}</Text><Pill color={item.color}>{item.tag}</Pill>
      </Pressable>)}
    </View>
    {error && <Notice title="Could not enter the arena">{error}</Notice>}
    <Button onPress={() => begin()} loading={pending === 'create'} disabled={!!pending} style={{ marginTop: 8 }}>{!profile ? 'Create your player' : !calibrated ? 'Prepare my camera' : mode === 'solo' ? 'Start solo training' : 'Create private room'}</Button>
    <View style={styles.rules}><Text style={styles.ruleText}>Squats add guard</Text><View style={styles.ruleDot} /><Text style={styles.ruleText}>Push-ups deal damage</Text><View style={styles.ruleDot} /><Text style={styles.ruleText}>Stop any time</Text></View>
    <View style={styles.join}>
      <Heading size={25}>Have a room code?</Heading><Copy>Join the private room your friend created.</Copy>
      <View style={[layout.row, { alignItems: 'stretch' }]}><TextInput accessibilityLabel="Private room code" placeholder="ROOM CODE" placeholderTextColor="#7C93AB" autoCapitalize="characters" autoCorrect={false} maxLength={12} value={room} onChangeText={setRoom} style={[layout.input, { flex: 1, letterSpacing: 3, fontWeight: '700' }]} /><Button variant="secondary" onPress={() => begin(true)} disabled={!room.trim() || !!pending} loading={pending === 'join'}>Join room</Button></View>
    </View>
  </Screen>;
}
const styles = StyleSheet.create({
  modes: { gap: 18, marginBottom: 22 }, mode: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 24, padding: 25, gap: 14, backgroundColor: colors.surface },
  symbol: { fontSize: 49, lineHeight: 58 }, radio: { width: 23, height: 23, borderRadius: 12, borderWidth: 2, borderColor: '#698096' },
  modeTitle: { fontFamily: fonts.display, color: colors.text, fontSize: 29, fontWeight: '700', letterSpacing: -0.7 },
  modeCopy: { fontFamily: fonts.body, color: colors.muted, fontSize: 15, lineHeight: 23, minHeight: 46 },
  rules: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, flexWrap: 'wrap', paddingVertical: 20 },
  ruleText: { color: colors.muted, fontFamily: fonts.body, fontSize: 12 }, ruleDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.muted },
  join: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 12, paddingTop: 30, gap: 16, maxWidth: 650 },
});
