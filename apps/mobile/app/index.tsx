import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { STAGES } from '@vyra/core';
import HeroView from '../src/components/HeroShowcase';
import { Button, Copy, Eyebrow, Heading, Loading, Meter, Notice, Pill, Screen, Stat, layout } from '../src/components/ui';
import { useApp } from '../src/state/AppProvider';
import { colors, fonts, radii } from '../src/theme';

const METRICS = [
  { n: '01', label: 'Squats build guard' },
  { n: '02', label: 'Push-ups power attack' },
  { n: '03', label: 'Real reps earn XP' },
];

export default function HomeScreen() {
  const { profile, session, booting, connectionError, refreshProfile } = useApp();
  const { width } = useWindowDimensions();
  const wide = width >= 850;
  const stage = STAGES.find(item => item.id === (profile?.stage || 'starter'))!;
  const next = STAGES[STAGES.findIndex(item => item.id === stage.id) + 1];
  const introMotion = useRef(new Animated.Value(session.reducedMotion ? 1 : 0)).current;
  const heroMotion = useRef(new Animated.Value(session.reducedMotion ? 1 : 0)).current;
  useEffect(() => {
    if (session.reducedMotion) return;
    Animated.stagger(160, [
      Animated.timing(introMotion, { toValue: 1, duration: 520, useNativeDriver: true }),
      Animated.timing(heroMotion, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (booting) return <Screen><Loading /></Screen>;
  return <Screen>
    {connectionError && <Notice title="Your profile is offline" action={() => refreshProfile().catch(() => undefined)}>{connectionError}</Notice>}
    <View style={[styles.heroSection, wide && styles.heroWide]}>
      <Animated.View style={[styles.intro, wide && { flex: 0.95, maxWidth: 560 }, {
        opacity: introMotion, transform: [{ translateY: introMotion.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
      }]}>
        <Eyebrow>{profile ? 'Welcome back, ' + profile.name : 'A fitness protocol, not a fitness app'}</Eyebrow>
        <Heading size={wide ? 88 : 46} style={styles.display}>Real effort.{'\n'}Legendary energy.</Heading>
        <Copy style={styles.lead}>Move in the real world. Grow a hero that shows exactly how far you’ve come — no shortcuts, no filters.</Copy>
        <View style={styles.progress}>
          <View style={layout.split}><Pill color={stage.color}>{stage.name} hero</Pill><Text style={styles.xp}>{profile ? profile.xp.toLocaleString() + ' XP' : 'A fresh beginning'}</Text></View>
          <Meter value={profile?.xp || 0} max={next?.xp || 7500} color={stage.color} label="Hero evolution progress" />
          <Text style={styles.next}>{profile ? next ? next.name + ' at ' + next.xp.toLocaleString() + ' XP and ' + next.days + ' active days' : 'Legendary evolution achieved. Keep your story going.' : 'Earn your first evolution by completing a workout.'}</Text>
        </View>
        <View style={styles.actions}>
          <Button onPress={() => router.push(profile ? '/arena' : '/profile')} style={styles.mainAction} icon={<Text style={styles.iconGlyph}>▸</Text>}>{profile ? 'Enter the arena' : 'Create your player'}</Button>
          <Button variant="secondary" onPress={() => router.push('/calibrate')} style={styles.secondaryAction}>Check my camera</Button>
        </View>
        <View style={styles.metrics}>{METRICS.map(m =>
          <View key={m.n} style={styles.metricRow}>
            <Text style={styles.metricLabel}>{m.label}</Text>
            <Text style={styles.metricNumber}>{m.n}</Text>
          </View>
        )}</View>
      </Animated.View>
      <Animated.View style={[styles.heroStage, wide && { flex: 1.15, height: 640 }, {
        opacity: heroMotion, transform: [{ scale: heroMotion.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
      }]}>
        <View style={[styles.glowBox, { width: wide ? 620 : 320, height: wide ? 620 : 320 }]} pointerEvents="none">
          <Text style={[styles.watermark, wide ? { fontSize: 140, top: 240 } : { fontSize: 72, top: 124 }]} numberOfLines={1}>{stage.name.toUpperCase()}</Text>
          <View style={[styles.glowRing, wide ? { width: 620, height: 620, top: 0, left: 0 } : { width: 320, height: 320, top: 0, left: 0 }, { backgroundColor: 'rgba(120,226,208,0.045)' }]} />
          <View style={[styles.glowRing, wide ? { width: 420, height: 420, top: 100, left: 100 } : { width: 210, height: 210, top: 55, left: 55 }, { backgroundColor: 'rgba(120,226,208,0.07)' }]} />
          <View style={[styles.glowRing, wide ? { width: 240, height: 240, top: 190, left: 190 } : { width: 115, height: 115, top: 102, left: 102 }, { backgroundColor: 'rgba(120,226,208,0.09)' }]} />
        </View>
        <View style={styles.heroLabel}><Eyebrow color={colors.muted}>Vanguard — {stage.name.toLowerCase()} build</Eyebrow></View>
        <HeroView stage={profile?.stage || 'starter'} equipment={profile?.equipped} pose="idle" active={!session.reducedMotion} style={styles.hero} />
        <View style={styles.heroCaption}><View style={[styles.captionDot, { backgroundColor: stage.color }]} /><Text style={styles.heroCaptionText}>Built by you. One workout at a time.</Text></View>
        <Pressable accessibilityRole="button" onPress={() => router.push('/collection')} style={styles.explore}><Text style={styles.exploreText}>Explore all five evolutions</Text><Text style={styles.exploreArrow}>›</Text></Pressable>
      </Animated.View>
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
  heroSection: { gap: 40 }, heroWide: { flexDirection: 'row', alignItems: 'center', gap: 56, minHeight: 620 },
  intro: { gap: 22 }, display: { marginTop: 4 }, lead: { fontSize: 17, lineHeight: 27, maxWidth: 460 },
  progress: { gap: 12, marginTop: 6, maxWidth: 450 },
  xp: { fontFamily: fonts.body, color: colors.text, fontSize: 14, fontWeight: '600' },
  next: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, lineHeight: 19 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 6 },
  mainAction: { minHeight: 58 },
  secondaryAction: { minHeight: 58 },
  iconGlyph: { color: colors.text, fontSize: 11 },
  metrics: { marginTop: 18, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 18, gap: 13, maxWidth: 420 },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metricLabel: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.4 },
  metricNumber: { fontFamily: fonts.body, color: colors.faint, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  heroStage: { height: 420, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  hero: { width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 },
  glowBox: { position: 'relative' },
  watermark: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontFamily: fonts.display, fontWeight: '900', color: 'rgba(255,255,255,0.035)', letterSpacing: -4 },
  glowRing: { position: 'absolute', borderRadius: 999 },
  heroLabel: { position: 'absolute', top: 22, left: 22 },
  heroCaption: { position: 'absolute', bottom: 58, flexDirection: 'row', alignItems: 'center', gap: 7 },
  captionDot: { width: 6, height: 6, borderRadius: 3 },
  heroCaptionText: { color: colors.muted, fontSize: 11, fontFamily: fonts.body },
  explore: { position: 'absolute', bottom: 6, left: 22, right: 22, paddingHorizontal: 4, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exploreText: { fontFamily: fonts.body, color: colors.text, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  exploreArrow: { fontSize: 22, color: colors.teal },
  stats: { marginTop: 40, paddingVertical: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderTopColor: colors.line, borderBottomColor: colors.line, borderTopWidth: 1, borderBottomWidth: 1 },
  statDivider: { width: 1, height: 37, backgroundColor: colors.line },
  bottomSection: { gap: 24, marginTop: 40 },
  challenge: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 18, padding: 26, borderRadius: radii.xl, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.line, minHeight: 150 },
  challengeGraphic: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  fist: { height: 43, width: 22, borderRadius: 8, backgroundColor: colors.teal },
  challengeTitle: { fontFamily: fonts.display, fontSize: 23, fontWeight: '800', color: colors.text, letterSpacing: -0.6 },
  challengeCopy: { fontFamily: fonts.body, color: colors.muted, fontSize: 14, lineHeight: 22, maxWidth: 360 },
  chevron: { fontSize: 30, color: colors.muted },
  practice: { flex: 1, padding: 26, borderRadius: radii.xl, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.line, gap: 10, justifyContent: 'center' },
  practiceTitle: { fontFamily: fonts.display, color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.6 },
});
