import React, { useEffect, useState } from 'react';
import { Platform, Share, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Copy, Heading, Loading, Notice, Pill, Screen, layout } from '../src/components/ui';
import { useApp } from '../src/state/AppProvider';
import { colors, fonts } from '../src/theme';

export default function LobbyScreen() {
  const { profile, snapshot, match, socketStatus, matchError, localStopped, ready, stopMatch, calibrated } = useApp();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!snapshot) return;
    if (snapshot.phase === 'finished' || snapshot.phase === 'interrupted') router.replace('/results');
    else if (snapshot.phase !== 'lobby') router.replace('/battle');
  }, [snapshot?.phase]);
  const leave = () => { stopMatch('Player left the lobby'); router.replace('/'); };
  const shareCode = async () => {
    if (!match) return;
    if (Platform.OS === 'web') {
      try { await navigator.clipboard.writeText(match.roomCode); setCopied(true); } catch { setCopied(false); }
    } else await Share.share({ message: 'Join my VYRA workout. Open Private 1v1 and enter room code ' + match.roomCode + '.' });
  };
  const me = snapshot?.players.find(player => player.id === profile?.id);
  if (!match) return <Screen noNav><Notice title="No room is open" action={() => router.replace('/arena')} actionLabel="Choose a workout">Start a solo session or create a room to enter the arena.</Notice></Screen>;
  return <Screen noNav back={leave} style={{ maxWidth: 820 }}>
    <View style={layout.section}><Pill color={colors.coral}>{snapshot?.mode === 'solo' ? 'Solo training' : 'Private arena'}</Pill><Heading size={42}>{snapshot?.mode === 'solo' ? 'Meet your training partner.' : 'A little friendly rivalry.'}</Heading><Copy>{snapshot?.mode === 'solo' ? 'The bot follows a fixed practice pace. Your own reps always come from your camera.' : 'Share your room code. The countdown begins when both players are ready.'}</Copy></View>
    {snapshot?.mode !== 'solo' && <View style={styles.codeBlock}><Text style={styles.codeLabel}>Your private room code</Text><Text selectable style={styles.code}>{match.roomCode}</Text><Button variant="secondary" onPress={shareCode}>{copied ? 'Code copied' : Platform.OS === 'web' ? 'Copy room code' : 'Share room code'}</Button></View>}
    {!snapshot ? <Loading text={socketStatus === 'connecting' ? 'Connecting to your arena…' : 'Waiting for the arena…'} /> : <View style={styles.players}>
      {snapshot.players.map((player, index) => <View key={player.id} style={styles.player}>
        <View style={[styles.playerAvatar, { backgroundColor: index === 0 ? '#2D5C61' : '#694C4B' }]}><Text style={styles.playerInitial}>{player.isBot ? '◈' : player.name.charAt(0).toUpperCase()}</Text></View>
        <View style={{ flex: 1, gap: 5 }}><Text style={styles.playerName}>{player.name}{player.id === profile?.id ? ' (you)' : ''}</Text><Text style={styles.playerType}>{player.isBot ? 'Training bot' : 'Camera-powered player'}</Text></View>
        <Pill color={player.ready ? colors.teal : colors.muted}>{player.ready ? 'Ready' : 'Getting ready'}</Pill>
      </View>)}
      {snapshot.players.length < 2 && <View style={[styles.player, { borderStyle: 'dashed', borderWidth: 1, borderColor: colors.line }]}><View style={[styles.playerAvatar, { backgroundColor: colors.surface }]}><Text style={styles.playerInitial}>?</Text></View><View style={{ gap: 5, flex: 1 }}><Text style={styles.playerName}>Waiting for your friend</Text><Text style={styles.playerType}>They can join with the room code.</Text></View></View>}
    </View>}
    {matchError && <Notice title={localStopped ? 'Session interrupted' : 'Arena needs attention'}>{matchError}</Notice>}
    {!calibrated && <Notice title="Your camera check is incomplete">Leave this room and complete two practice reps for each movement before starting.</Notice>}
    <Button onPress={ready} disabled={socketStatus !== 'connected' || !!me?.ready || localStopped || !calibrated}>{me?.ready ? 'Ready. Waiting for your partner…' : 'I’m ready'}</Button>
    <Text style={styles.note}>Keep your phone steady and your full body in view. Leaving the app stops this workout.</Text>
    <Button variant="quiet" onPress={leave}>Leave room</Button>
  </Screen>;
}
const styles = StyleSheet.create({
  codeBlock: { alignItems: 'center', padding: 28, backgroundColor: colors.surface, borderRadius: 26, marginBottom: 26, gap: 16 },
  codeLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 14 }, code: { color: colors.text, fontFamily: fonts.display, fontWeight: '800', fontSize: 43, letterSpacing: 7 },
  players: { gap: 14, marginBottom: 26 }, player: { padding: 18, borderRadius: 20, backgroundColor: '#1A2B40', flexDirection: 'row', alignItems: 'center', gap: 15 },
  playerAvatar: { width: 54, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  playerInitial: { fontFamily: fonts.display, color: colors.text, fontSize: 25, fontWeight: '700' },
  playerName: { fontFamily: fonts.body, color: colors.text, fontWeight: '700', fontSize: 16 }, playerType: { fontFamily: fonts.body, color: colors.muted, fontSize: 12 },
  note: { fontFamily: fonts.body, color: colors.muted, fontSize: 13, lineHeight: 21, textAlign: 'center', marginVertical: 18, paddingHorizontal: 15 },
});
