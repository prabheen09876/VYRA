import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { STAGES } from '@vyra/core';
import HeroView from '../src/components/HeroShowcase';
import { Button, Copy, Eyebrow, Heading, Loading, Meter, Notice, Pill, Screen, Stat, layout } from '../src/components/ui';
import { useApp } from '../src/state/AppProvider';
import { colors, fonts } from '../src/theme';

export default function HomeScreen() {
  const { profile, session, booting, connectionError, refreshProfile } = useApp();
  const { width } = useWindowDimensions();
  const wide = width >= 850;
  const stage = STAGES.find(item => item.id === (profile?.stage || 'starter'))!;
  const next = STAGES[STAGES.findIndex(item => item.id === stage.id) + 1];
  if (booting) return <Screen><Loading /></Screen>;
  return <Screen>
    {connectionError && <Notice title="Your profile is offline" action={() => refreshProfile().catch(() => undefined)}>{connectionError}</Notice>}
    <View style={[styles.heroSection, wide && styles.heroWide]}>
      <View style={[styles.intro, wide && { flex: 0.92 }]}>
        <Eyebrow>{profile ? 'Good to see you, ' + profile.name : 'Your fitness adventure starts here'}</Eyebrow>
        <Heading size={wide ? 56 : 40}>Real effort.{'\n'}Legendary energy.</Heading>
        <Copy>Move in the real world. Grow a hero that shows how far you’ve come.</Copy>
        <View style={styles.progress}>
          <View style={layout.split}><Pill color={stage.color}>{stage.name} hero</Pill><Text style={styles.xp}>{profile ? profile.xp.toLocaleString() + ' XP' : 'A fresh beginning'}</Text></View>
          <Meter value={profile?.xp || 0} max={next?.xp || 7500} color={stage.color} label="Hero evolution progress" />
          <Text style={styles.next}>{profile ? next ? next.name + ' at ' + next.xp.toLocaleString() + ' XP and ' + next.days + ' active days' : 'Legendary evolution achieved. Keep your story going.' : 'Earn your first evolution by completing a workout.'}</Text>
        </View>
        <Button onPress={() => router.push(profile ? '/arena' : '/profile')} style={styles.mainAction}>{profile ? 'Enter the arena' : 'Create your player'}</Button>
        <Text style={styles.small}>Squats build your guard. Push-ups power your attack.</Text>
      </View>
      <View style={[styles.heroStage, wide && { flex: 1.08, height: 490 }]}>
        <View style={styles.heroGlow} />
        <View style={styles.orbit} />
        <Text style={styles.heroName}>Vanguard</Text>
        <HeroView stage={profile?.stage || 'starter'} equipment={profile?.equipped} pose="idle" active={!session.reducedMotion} style={styles.hero} />
        <View style={styles.heroCaption}><View style={[styles.captionDot, { backgroundColor: stage.color }]} /><Text style={styles.heroCaptionText}>Built by you. One workout at a time.</Text></View>
        <Pressable accessibilityRole="button" onPress={() => router.push('/collection')} style={styles.explore}><Text style={styles.exploreText}>Explore all five evolutions</Text><Text style={styles.exploreArrow}>›</Text></Pressable>
      </View>
    </View>
    {profile && <View style={styles.stats}>
      <Stat value={profile.streak} label="day streak" color={colors.coral} />
      <View style={styles.statDivider} />
      <Stat value={profile.totalReps} label="valid reps" />
      <View style={styles.statDivider} />
      <Stat value={profile.ownedCosmetics.length} label="collectibles earned" color={colors.teal} />
    </View>}
    <View style={[styles.bottomSection, wide && { flexDirection: 'row' }]}>
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/arena', params: { mode: 'pvp' } })} style={styles.challenge}>
        <View style={styles.challengeGraphic}><View style={[styles.fist, { transform: [{ rotate: '-12deg' }] }]} /><View style={[styles.fist, { backgroundColor: colors.coral, transform: [{ rotate: '12deg' }] }]} /></View>
        <View style={{ flex: 1, gap: 5 }}><Text style={styles.challengeTitle}>Better with a rival.</Text><Text style={styles.challengeCopy}>Invite a friend to a private 1v1 workout.</Text></View><Text style={styles.chevron}>›</Text>
      </Pressable>
      <View style={styles.practice}>
        <Text style={styles.practiceTitle}>Make room for your next level.</Text>
        <Text style={styles.challengeCopy}>A clear floor, your phone, and a few minutes. Your camera counts every valid rep.</Text>
        <Button variant="quiet" onPress={() => router.push('/calibrate')} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}>Check my camera</Button>
      </View>
    </View>
  </Screen>;
}
const styles = StyleSheet.create({
  heroSection: { gap: 20 }, heroWide: { flexDirection: 'row', alignItems: 'center', gap: 44, minHeight: 530 },
  intro: { gap: 20 }, progress: { gap: 12, marginTop: 4, maxWidth: 450 },
  xp: { fontFamily: fonts.body, color: colors.text, fontSize: 14, fontWeight: '600' },
  next: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, lineHeight: 19 },
  mainAction: { alignSelf: 'stretch', maxWidth: 450, minHeight: 58 },
  small: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, lineHeight: 18 },
  heroStage: { height: 390, position: 'relative', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 32, backgroundColor: '#1B3046' },
  hero: { width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 },
  heroGlow: { width: 280, height: 280, borderRadius: 140, backgroundColor: '#284859', position: 'absolute', top: 70 },
  orbit: { width: 370, height: 370, borderRadius: 185, borderColor: '#385268', borderWidth: 1, position: 'absolute', top: 26 },
  heroName: { position: 'absolute', top: 25, left: 25, fontFamily: fonts.display, fontWeight: '700', color: '#93B1C7', fontSize: 18, letterSpacing: -0.2 },
  heroCaption: { position: 'absolute', bottom: 56, flexDirection: 'row', alignItems: 'center', gap: 7 },
  captionDot: { width: 6, height: 6, borderRadius: 3 },
  heroCaptionText: { color: colors.muted, fontSize: 11, fontFamily: fonts.body },
  explore: { position: 'absolute', bottom: 4, left: 18, right: 18, paddingHorizontal: 14, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exploreText: { fontFamily: fonts.body, color: colors.text, fontSize: 13, fontWeight: '600' },
  exploreArrow: { fontSize: 25, color: colors.teal },
  stats: { marginTop: 32, paddingVertical: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderTopColor: colors.line, borderBottomColor: colors.line, borderTopWidth: 1, borderBottomWidth: 1 },
  statDivider: { width: 1, height: 37, backgroundColor: colors.line },
  bottomSection: { gap: 24, marginTop: 34 },
  challenge: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 18, padding: 24, borderRadius: 24, backgroundColor: '#213850', minHeight: 150 },
  challengeGraphic: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  fist: { height: 43, width: 22, borderRadius: 8, backgroundColor: colors.teal },
  challengeTitle: { fontFamily: fonts.display, fontSize: 23, fontWeight: '700', color: colors.text, letterSpacing: -0.5 },
  challengeCopy: { fontFamily: fonts.body, color: colors.muted, fontSize: 14, lineHeight: 22, maxWidth: 360 },
  chevron: { fontSize: 30, color: colors.muted },
  practice: { flex: 1, paddingVertical: 8, paddingHorizontal: 6, gap: 10 },
  practiceTitle: { fontFamily: fonts.display, color: colors.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
});
