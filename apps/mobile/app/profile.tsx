import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { STAGES } from '@vyra/core';
import { Button, Copy, Heading, Loading, Meter, Notice, Pill, Screen, Stat, layout } from '../src/components/ui';
import { useApp } from '../src/state/AppProvider';
import { errorMessage } from '../src/lib/api';
import { colors, fonts } from '../src/theme';

export default function ProfileScreen() {
  const { profile, session, booting, busy, connect, connectionError, refreshProfile, setPreferences } = useApp();
  const [name, setName] = useState(session.name);
  const [apiUrl, setApiUrl] = useState(session.apiUrl);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const { width } = useWindowDimensions();
  useEffect(() => { setName(session.name); setApiUrl(session.apiUrl); }, [session.name, session.apiUrl]);
  const stage = STAGES.find(item => item.id === (profile?.stage || 'starter'))!;
  const next = STAGES[STAGES.findIndex(item => item.id === stage.id) + 1];
  const save = async () => {
    setFormError(null); setSaved(false);
    try { await connect(name, apiUrl); setSaved(true); } catch (failure) { setFormError(errorMessage(failure)); }
  };
  if (booting) return <Screen><Loading /></Screen>;
  return <Screen>
    <View style={layout.section}><Heading size={41}>{profile ? 'Your journey, so far.' : 'Every hero needs a name.'}</Heading><Copy>{profile ? 'Progress earned through the days you choose to show up.' : 'Create your player to save workout progress, evolve your hero, and collect your first rewards.'}</Copy></View>
    <View style={[styles.columns, width >= 850 && { flexDirection: 'row', alignItems: 'flex-start' }]}>
      <View style={{ flex: 1, gap: 25 }}>
        {profile ? <>
          <View style={styles.identity}><View style={styles.avatar}><Text style={styles.initial}>{profile.name.charAt(0).toUpperCase()}</Text></View><View style={{ gap: 9 }}><Text style={styles.name}>{profile.name}</Text><Pill color={stage.color}>{stage.name} Vanguard</Pill></View></View>
          <View style={styles.stats}><Stat value={profile.xp.toLocaleString()} label="total XP" color={colors.teal} /><Stat value={profile.streak} label="day streak" color={colors.coral} /><Stat value={profile.wins} label="battle wins" /></View>
          <View style={layout.panel}><Heading size={24}>{next ? 'Your next evolution' : 'You reached Legendary'}</Heading><View style={layout.split}><Text style={styles.muted}>{next ? next.name : stage.name}</Text><Text style={styles.value}>{profile.xp.toLocaleString()} / {next?.xp.toLocaleString() || '7,500'} XP</Text></View><Meter value={profile.xp} max={next?.xp || 7500} color={stage.color} /><View style={layout.split}><Text style={styles.muted}>Active days</Text><Text style={styles.value}>{profile.activeDays}{next ? ' / ' + next.days : ''}</Text></View><Copy>{next ? 'Both XP and active days build your next stage. Consistency counts.' : 'Your journey continues through workouts, streaks, and your collection.'}</Copy></View>
          <View style={styles.records}><Record label="Valid repetitions" value={profile.totalReps} /><Record label="Qualified workouts" value={profile.qualifiedMatches} /><Record label="Active days this week" value={profile.weeklyActiveDays} /><Record label="Collectibles owned" value={profile.ownedCosmetics.length} /></View>
          <Button variant="secondary" onPress={() => router.push('/collection')}>Showcase my hero</Button>
        </> : <View style={styles.welcome}><View style={styles.welcomeSymbol}><Text style={styles.welcomeGlyph}>V</Text></View><Heading size={30}>Start small.{'\n'}Become something epic.</Heading><Copy>Your character reflects your workout consistency. Its fantasy physique is a game reward, not a measurement of your body.</Copy><View style={styles.promise}><Text style={styles.promiseText}>One original hero</Text><Text style={styles.promiseText}>Five evolutions to earn</Text><Text style={styles.promiseText}>No paid power-ups</Text></View></View>}
      </View>
      <View style={[styles.settings, { flex: 1 }]}>
        <View style={layout.panel}><Heading size={25}>{profile ? 'Connection' : 'Create your player'}</Heading>
          <View><Text style={layout.label}>Player name</Text><TextInput accessibilityLabel="Player name" value={name} onChangeText={setName} editable={!profile || apiUrl.trim().replace(/\/+$/, '') !== session.apiUrl} placeholder="What should we call you?" placeholderTextColor="#7E96AF" maxLength={24} autoComplete="nickname" autoCorrect={false} style={[layout.input, !!profile && { opacity: 0.8 }]} /></View>
          <View><Text style={layout.label}>VYRA server address</Text><TextInput accessibilityLabel="VYRA server address" value={apiUrl} onChangeText={setApiUrl} placeholder="https://your-vyra-server.example" placeholderTextColor="#7E96AF" autoCapitalize="none" autoCorrect={false} keyboardType="url" style={layout.input} /></View>
          <Text style={styles.setupHint}>{Platform.OS === 'web' ? 'For local setup, start the VYRA server at http://localhost:8787. Your camera also needs the capture app served at /capture/.' : 'Use a server address your phone can reach. For camera capture on a phone, use HTTPS. localhost points to the phone itself.'}</Text>
          {profile && apiUrl.trim().replace(/\/+$/, '') !== session.apiUrl && <Text style={styles.setupHint}>Each server has a separate player. This device keeps your saved guest identity for each address, so you can switch back.</Text>}
          {(formError || connectionError) && <Text accessibilityLiveRegion="polite" style={layout.error}>{formError || connectionError}</Text>}
          {saved && <Text accessibilityLiveRegion="polite" style={styles.saved}>Connected. Your player is ready.</Text>}
          <Button onPress={save} loading={busy}>{profile ? 'Save connection' : 'Create player & connect'}</Button>
          {profile && saved && <Button variant="secondary" onPress={() => router.push('/arena')}>Enter the arena</Button>}
        </View>
        <View style={styles.preferences}><Heading size={24}>Make it comfortable.</Heading>
          <View style={styles.setting}><View style={styles.settingCopy}><Text style={styles.settingTitle}>Audio cues</Text><Text style={styles.settingDescription}>Hear movement instructions and round changes.</Text></View><Switch accessibilityLabel="Audio cues" value={!session.muted} onValueChange={value => setPreferences({ muted: !value })} trackColor={{ false: '#485A70', true: '#458D82' }} thumbColor={!session.muted ? colors.teal : '#CBD5E1'} /></View>
          <View style={styles.setting}><View style={styles.settingCopy}><Text style={styles.settingTitle}>Reduce motion</Text><Text style={styles.settingDescription}>Keep the hero still outside interactions.</Text></View><Switch accessibilityLabel="Reduce motion" value={session.reducedMotion} onValueChange={value => setPreferences({ reducedMotion: value })} trackColor={{ false: '#485A70', true: '#458D82' }} thumbColor={session.reducedMotion ? colors.teal : '#CBD5E1'} /></View>
        </View>
        <View style={styles.privacy}><Text style={styles.settingTitle}>Your camera, your device.</Text><Text style={styles.settingDescription}>Pose detection runs on your device. Repetition events and tracking status reach the arena; video stays here. Your profile is saved with a guest session on this device; keep its app data to keep access.</Text></View>
      </View>
    </View>
  </Screen>;
}
function Record({ label, value }: { label: string; value: number }) {
  return <View style={layout.split}><Text style={styles.muted}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}
const styles = StyleSheet.create({
  columns: { gap: 32 }, identity: { flexDirection: 'row', gap: 20, alignItems: 'center' }, avatar: { width: 83, height: 94, borderRadius: 26, backgroundColor: '#2C515F', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#477887' },
  initial: { fontFamily: fonts.display, color: colors.teal, fontSize: 41, fontWeight: '800' }, name: { fontFamily: fonts.display, color: colors.text, fontSize: 30, fontWeight: '800' },
  stats: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 23, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line },
  muted: { fontFamily: fonts.body, color: colors.muted, fontSize: 14 }, value: { fontFamily: fonts.body, color: colors.text, fontSize: 14, fontWeight: '600' },
  records: { gap: 23, paddingHorizontal: 3 }, settings: { gap: 26 },
  setupHint: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, lineHeight: 20 }, saved: { fontFamily: fonts.body, color: colors.teal, fontSize: 14, lineHeight: 21 },
  preferences: { gap: 21, paddingHorizontal: 2 }, setting: { flexDirection: 'row', gap: 20, alignItems: 'center' }, settingCopy: { flex: 1, gap: 5 },
  settingTitle: { fontFamily: fonts.body, color: colors.text, fontWeight: '600', fontSize: 15 }, settingDescription: { fontFamily: fonts.body, color: colors.muted, fontSize: 13, lineHeight: 21 },
  privacy: { gap: 8, paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.line },
  welcome: { gap: 25, paddingVertical: 10 }, welcomeSymbol: { height: 100, width: 92, borderRadius: 27, backgroundColor: '#294D59', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-6deg' }] },
  welcomeGlyph: { fontFamily: fonts.display, fontSize: 59, fontWeight: '800', color: colors.teal }, promise: { gap: 14, marginTop: 5 }, promiseText: { color: colors.text, fontFamily: fonts.body, fontSize: 16 },
});
