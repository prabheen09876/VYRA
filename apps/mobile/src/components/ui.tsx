import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router, usePathname } from 'expo-router';
import { colors, fonts, radii, type } from '../theme';
import { useApp } from '../state/AppProvider';

export function Button({ children, onPress, variant = 'primary', disabled, loading, style, accessibilityLabel, icon }: {
  children: React.ReactNode; onPress: () => void | Promise<void>; variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string; icon?: React.ReactNode;
}) {
  const labelColor = variant === 'primary' ? colors.ink : variant === 'danger' ? colors.danger : colors.text;
  const scale = useRef(new Animated.Value(1)).current;
  const springTo = (toValue: number) => Animated.spring(scale, { toValue, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled: disabled || loading, busy: loading }}
    disabled={disabled || loading}
    onPress={() => void onPress()}
    onPressIn={() => springTo(0.965)}
    onPressOut={() => springTo(1)}
    style={({ pressed }) => [pressed && { opacity: 0.88 }, style]}
  >
    <Animated.View style={[styles.button, styles[variant], (disabled || loading) && styles.disabled, { transform: [{ scale }] }]}>
      {loading ? <ActivityIndicator color={variant === 'primary' ? colors.ink : colors.teal} /> : <>
        <Text style={[styles.buttonText, { color: labelColor }]}>{children}</Text>
        {icon && <View style={[styles.buttonIcon, { backgroundColor: variant === 'primary' ? colors.ink : colors.glassStrong }]}>{icon}</View>}
      </>}
    </Animated.View>
  </Pressable>;
}

function FadeIn({ children, skip }: React.PropsWithChildren<{ skip?: boolean }>) {
  const progress = useRef(new Animated.Value(skip ? 1 : 0)).current;
  useEffect(() => {
    if (skip) return;
    Animated.timing(progress, { toValue: 1, duration: 420, useNativeDriver: true }).start();
  }, [skip, progress]);
  return <Animated.View style={{ opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
    {children}
  </Animated.View>;
}

export function Screen({ children, noNav = false, back, style }: React.PropsWithChildren<{
  noNav?: boolean; back?: () => void; style?: StyleProp<ViewStyle>;
}>) {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const { profile, session } = useApp();
  const wide = width >= 850;
  const nav = [
    { path: '/', title: 'My hero' },
    { path: '/collection', title: 'Collection' },
    { path: '/profile', title: 'Profile' },
  ] as const;
  const navMarks = { '/': '◈', '/collection': '◇', '/profile': '◎' } as const;
  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
    <LinearGradient pointerEvents="none" colors={['rgba(120,226,208,0.05)', 'transparent']} style={styles.atmosphere} />
    <View style={styles.header}>
      <View style={styles.headerInner}>
        <Pressable accessibilityRole="button" accessibilityLabel={back ? 'Go back' : 'VYRA home'} onPress={back || (() => { if (pathname !== '/') router.push('/'); })} style={styles.brandHit}>
          {back ? <Text style={styles.back}>‹</Text> : <View style={styles.brandIcon}><View style={styles.brandSlash} /><View style={[styles.brandSlash, styles.brandSlashSecond]} /></View>}
          <Text style={styles.wordmark}>{back ? 'BACK' : 'VYRA'}</Text>
        </Pressable>
        {wide && !noNav && <View style={styles.desktopNav}>{nav.map(item =>
          <Pressable key={item.path} accessibilityRole="button" accessibilityState={{ selected: pathname === item.path }} onPress={() => { if (pathname !== item.path) router.push(item.path); }} style={styles.desktopNavItem}>
            <Text style={[styles.navText, pathname === item.path && styles.navTextActive]}>{item.title}</Text>
            <View style={[styles.navIndicator, pathname === item.path && styles.navIndicatorActive]} />
          </Pressable>
        )}</View>}
        <Pressable accessibilityRole="button" accessibilityLabel="Open player profile" onPress={() => { if (pathname !== '/profile') router.push('/profile'); }} style={styles.avatar}>
          <Text style={styles.avatarText}>{profile?.name?.slice(0, 1).toUpperCase() || 'V'}</Text>
        </Pressable>
      </View>
    </View>
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, !wide && !noNav && { paddingBottom: 112 }, style]} keyboardShouldPersistTaps="handled">
      <FadeIn key={pathname} skip={session.reducedMotion}>{children}</FadeIn>
    </ScrollView>
    {!wide && !noNav && <SafeAreaView edges={['bottom']} style={styles.bottomNav}>
      <View style={styles.bottomRow}>{nav.map(item =>
        <Pressable key={item.path} accessibilityRole="button" accessibilityState={{ selected: pathname === item.path }} onPress={() => { if (pathname !== item.path) router.push(item.path); }} style={styles.bottomItem}>
          <Text style={[styles.navMark, { color: pathname === item.path ? colors.teal : colors.faint }]}>{navMarks[item.path]}</Text>
          <Text style={[styles.navText, { fontSize: 11, color: pathname === item.path ? colors.text : colors.faint }]}>{item.title}</Text>
        </Pressable>
      )}</View>
    </SafeAreaView>}
  </SafeAreaView>;
}

export function Heading({ children, size = 34, style }: React.PropsWithChildren<{ size?: number; style?: StyleProp<ViewStyle> }>) {
  const tracking = Math.max(-4, -size * 0.035);
  const leading = size >= 48 ? size * 1.03 : size * 1.12;
  return <View style={style}><Text style={[styles.heading, { fontSize: size, lineHeight: leading, letterSpacing: tracking }]}>{children}</Text></View>;
}
export function Copy({ children, muted = true, style }: React.PropsWithChildren<{ muted?: boolean; style?: StyleProp<ViewStyle> }>) {
  return <View style={style}><Text style={[styles.copy, { color: muted ? colors.muted : colors.text }]}>{children}</Text></View>;
}
export function Eyebrow({ children, color = colors.teal }: React.PropsWithChildren<{ color?: string }>) {
  return <Text style={[styles.eyebrow, { color }]}>{children}</Text>;
}
export function Pill({ children, color = colors.teal }: React.PropsWithChildren<{ color?: string }>) {
  return <View style={[styles.pill, { borderColor: color + '55' }]}><Text style={[styles.pillText, { color }]}>{children}</Text></View>;
}
export function Notice({ title, children, action, actionLabel = 'Try again', tone = 'warning' }: React.PropsWithChildren<{
  title: string; action?: () => void | Promise<void>; actionLabel?: string; tone?: 'warning' | 'info';
}>) {
  return <View style={[styles.notice, { borderLeftColor: tone === 'info' ? colors.teal : colors.coral }]}>
    <Text style={styles.noticeTitle}>{title}</Text>
    {children && <Text style={styles.noticeCopy}>{children}</Text>}
    {action && <Button variant="quiet" onPress={action} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}>{actionLabel}</Button>}
  </View>;
}
export function Meter({ value, max, color = colors.teal, label }: { value: number; max: number; color?: string; label?: string }) {
  const progress = Math.min(1, Math.max(0, value / Math.max(1, max)));
  return <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max, now: value }} style={styles.meter}>
    <View style={[styles.meterFill, { width: ((progress * 100) + '%') as ViewStyle['width'], backgroundColor: color }]} />
  </View>;
}
export function Stat({ value, label, color = colors.text }: { value: string | number; label: string; color?: string }) {
  return <View style={styles.stat}><Text style={[styles.statValue, { color }]}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}
export function Loading({ text = 'Loading your player…' }: { text?: string }) {
  return <View style={styles.loading}><ActivityIndicator color={colors.teal} /><Copy>{text}</Copy></View>;
}
export const layout = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  split: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  gap: { gap: 16 },
  section: { gap: 18, marginBottom: 32 },
  panel: { backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.line, borderRadius: radii.xl, padding: 22, gap: 16 },
  input: { fontFamily: fonts.body, fontSize: 16, color: colors.text, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.line, minHeight: 54, borderRadius: radii.md, paddingHorizontal: 16, paddingVertical: 12 },
  label: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 10 },
  error: { fontFamily: fonts.body, color: colors.danger, fontSize: 14, lineHeight: 22 },
  line: { height: 1, backgroundColor: colors.line },
});
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  atmosphere: { position: 'absolute', top: 0, left: 0, right: 0, height: 420 },
  header: { paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: colors.line },
  headerInner: { width: '100%', maxWidth: 1320, alignSelf: 'center', minHeight: 86, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandHit: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 11, minWidth: 100 },
  brandIcon: { width: 24, height: 28, flexDirection: 'row' },
  brandSlash: { width: 9, height: 25, backgroundColor: colors.teal, transform: [{ rotate: '-24deg' }], borderRadius: 2 },
  brandSlashSecond: { transform: [{ rotate: '24deg' }], backgroundColor: colors.text, marginLeft: 5 },
  wordmark: { fontFamily: fonts.display, fontSize: 22, fontWeight: '800', letterSpacing: 1.5, color: colors.text },
  back: { color: colors.teal, fontSize: 38, lineHeight: 42 },
  avatar: { width: 44, height: 44, borderRadius: radii.md, backgroundColor: colors.glass, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.lineStrong },
  avatarText: { fontFamily: fonts.body, fontWeight: '700', fontSize: 16, color: colors.text },
  desktopNav: { flexDirection: 'row', gap: 30 },
  desktopNavItem: { minHeight: 44, justifyContent: 'center', alignItems: 'center', gap: 8 },
  navIndicator: { height: 2, width: 14, borderRadius: 1, backgroundColor: 'transparent' },
  navIndicatorActive: { backgroundColor: colors.teal },
  navText: { fontFamily: fonts.body, color: colors.muted, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.6 },
  navTextActive: { color: colors.text },
  scroll: { flex: 1 },
  content: { width: '100%', maxWidth: 1320, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 30, paddingBottom: 48 },
  bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.backgroundElevated, borderTopColor: colors.line, borderTopWidth: 1 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-around', minHeight: 76 },
  bottomItem: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 4, minHeight: 64 },
  navMark: { fontSize: 23, lineHeight: 27 },
  button: { minHeight: 54, paddingHorizontal: 28, paddingVertical: 15, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent', flexDirection: 'row', gap: 12 },
  primary: { backgroundColor: colors.text },
  secondary: { backgroundColor: colors.glass, borderColor: colors.lineStrong },
  quiet: { backgroundColor: 'transparent' },
  danger: { backgroundColor: 'rgba(255,140,120,0.08)', borderColor: 'rgba(255,140,120,0.35)' },
  disabled: { opacity: 0.4 },
  buttonText: { fontFamily: fonts.body, fontSize: 14, fontWeight: '700', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1 },
  buttonIcon: { width: 24, height: 24, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  heading: { fontFamily: fonts.display, fontWeight: '900', color: colors.text },
  copy: { fontFamily: fonts.body, fontSize: 16, lineHeight: 26, maxWidth: 650 },
  eyebrow: { fontFamily: fonts.body, fontSize: type.eyebrow, fontWeight: '700', lineHeight: 18, textTransform: 'uppercase', letterSpacing: 2.2 },
  pill: { paddingVertical: 6, paddingHorizontal: 13, borderRadius: radii.pill, borderWidth: 1, alignSelf: 'flex-start', backgroundColor: colors.glass },
  pillText: { fontFamily: fonts.body, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1 },
  notice: { padding: 20, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.line, borderLeftWidth: 3, backgroundColor: colors.glass, gap: 7, marginBottom: 18 },
  noticeTitle: { fontFamily: fonts.body, color: colors.text, fontSize: 16, fontWeight: '700' },
  noticeCopy: { fontFamily: fonts.body, color: colors.muted, fontSize: 14, lineHeight: 22 },
  meter: { height: 6, borderRadius: 3, backgroundColor: colors.glassStrong, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 3 },
  stat: { gap: 4 },
  statValue: { fontFamily: fonts.display, fontSize: 30, fontWeight: '900', letterSpacing: -1 },
  statLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, lineHeight: 18, textTransform: 'uppercase', letterSpacing: 1.2 },
  loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 16 },
});
