import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, usePathname } from 'expo-router';
import { colors, fonts } from '../theme';
import { useApp } from '../state/AppProvider';

export function Button({ children, onPress, variant = 'primary', disabled, loading, style, accessibilityLabel }: {
  children: React.ReactNode; onPress: () => void | Promise<void>; variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string;
}) {
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled: disabled || loading, busy: loading }}
    disabled={disabled || loading}
    onPress={() => void onPress()}
    style={({ pressed }) => [
      styles.button, styles[variant], (disabled || loading) && styles.disabled, pressed && { opacity: 0.78 }, style,
    ]}
  >{loading ? <ActivityIndicator color={variant === 'primary' ? colors.ink : colors.teal} /> :
    <Text style={[styles.buttonText, { color: variant === 'primary' ? colors.ink : variant === 'danger' ? colors.danger : colors.text }]}>{children}</Text>}
  </Pressable>;
}

export function Screen({ children, noNav = false, back, style }: React.PropsWithChildren<{
  noNav?: boolean; back?: () => void; style?: StyleProp<ViewStyle>;
}>) {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const { profile } = useApp();
  const wide = width >= 850;
  const nav = [
    { path: '/', title: 'My hero', mark: '◈' },
    { path: '/collection', title: 'Collection', mark: '◇' },
    { path: '/profile', title: 'Profile', mark: '◎' },
  ] as const;
  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
    <View style={styles.header}>
      <View style={styles.headerInner}>
        <Pressable accessibilityRole="button" accessibilityLabel={back ? 'Go back' : 'VYRA home'} onPress={back || (() => router.push('/'))} style={styles.brandHit}>
          {back ? <Text style={styles.back}>‹</Text> : <View style={styles.brandIcon}><View style={styles.brandSlash} /><View style={[styles.brandSlash, styles.brandSlashSecond]} /></View>}
          <Text style={styles.wordmark}>{back ? 'Back' : 'VYRA'}</Text>
        </Pressable>
        {wide && !noNav && <View style={styles.desktopNav}>{nav.map(item =>
          <Pressable key={item.path} accessibilityRole="button" accessibilityState={{ selected: pathname === item.path }} onPress={() => router.push(item.path)} style={[styles.desktopNavItem, pathname === item.path && styles.navSelected]}>
            <Text style={[styles.navText, pathname === item.path && { color: colors.teal }]}>{item.title}</Text>
          </Pressable>
        )}</View>}
        <Pressable accessibilityRole="button" accessibilityLabel="Open player profile" onPress={() => router.push('/profile')} style={styles.avatar}>
          <Text style={styles.avatarText}>{profile?.name?.slice(0, 1).toUpperCase() || 'V'}</Text>
        </Pressable>
      </View>
    </View>
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, !wide && !noNav && { paddingBottom: 104 }, style]} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
    {!wide && !noNav && <SafeAreaView edges={['bottom']} style={styles.bottomNav}>
      <View style={styles.bottomRow}>{nav.map(item =>
        <Pressable key={item.path} accessibilityRole="button" accessibilityState={{ selected: pathname === item.path }} onPress={() => router.push(item.path)} style={styles.bottomItem}>
          <Text style={[styles.navMark, { color: pathname === item.path ? colors.teal : colors.muted }]}>{item.mark}</Text>
          <Text style={[styles.navText, { fontSize: 12, color: pathname === item.path ? colors.teal : colors.muted }]}>{item.title}</Text>
        </Pressable>
      )}</View>
    </SafeAreaView>}
  </SafeAreaView>;
}

export function Heading({ children, size = 34, style }: React.PropsWithChildren<{ size?: number; style?: StyleProp<ViewStyle> }>) {
  return <View style={style}><Text style={[styles.heading, { fontSize: size, lineHeight: size * 1.12 }]}>{children}</Text></View>;
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
  panel: { backgroundColor: colors.surface, borderRadius: 22, padding: 22, gap: 16 },
  input: { fontFamily: fonts.body, fontSize: 16, color: colors.text, backgroundColor: '#122136', borderWidth: 1, borderColor: colors.line, minHeight: 54, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  label: { fontFamily: fonts.body, color: colors.text, fontSize: 15, fontWeight: '600', marginBottom: 8 },
  error: { fontFamily: fonts.body, color: colors.danger, fontSize: 14, lineHeight: 22 },
  line: { height: 1, backgroundColor: colors.line },
});
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { borderBottomWidth: 1, borderBottomColor: '#283B51', paddingHorizontal: 24 },
  headerInner: { width: '100%', maxWidth: 1180, alignSelf: 'center', minHeight: 82, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandHit: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 11, minWidth: 100 },
  brandIcon: { width: 24, height: 28, flexDirection: 'row' },
  brandSlash: { width: 9, height: 25, backgroundColor: colors.teal, transform: [{ rotate: '-24deg' }], borderRadius: 2 },
  brandSlashSecond: { transform: [{ rotate: '24deg' }], backgroundColor: colors.text, marginLeft: 5 },
  wordmark: { fontFamily: fonts.display, fontSize: 27, fontWeight: '800', letterSpacing: -1.3, color: colors.text },
  back: { color: colors.teal, fontSize: 38, lineHeight: 42 },
  avatar: { width: 44, height: 44, borderRadius: 16, backgroundColor: '#31475D', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#516C82' },
  avatarText: { fontFamily: fonts.body, fontWeight: '700', fontSize: 16, color: colors.text },
  desktopNav: { flexDirection: 'row', gap: 8 },
  desktopNavItem: { minHeight: 44, paddingHorizontal: 22, justifyContent: 'center', borderRadius: 22 },
  navSelected: { backgroundColor: '#213E48' },
  navText: { fontFamily: fonts.body, color: colors.muted, fontSize: 14, fontWeight: '600' },
  scroll: { flex: 1 },
  content: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 30, paddingBottom: 48 },
  bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.background, borderTopColor: colors.line, borderTopWidth: 1 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-around', minHeight: 72 },
  bottomItem: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 3, minHeight: 64 },
  navMark: { fontSize: 25, lineHeight: 29 },
  button: { minHeight: 52, paddingHorizontal: 22, paddingVertical: 14, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  primary: { backgroundColor: colors.teal },
  secondary: { backgroundColor: colors.raised, borderColor: '#4B6379' },
  quiet: { backgroundColor: 'transparent' },
  danger: { backgroundColor: '#392C36', borderColor: '#705059' },
  disabled: { opacity: 0.42 },
  buttonText: { fontFamily: fonts.body, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  heading: { fontFamily: fonts.display, fontWeight: '800', letterSpacing: -1.2, color: colors.text },
  copy: { fontFamily: fonts.body, fontSize: 16, lineHeight: 25, maxWidth: 650 },
  eyebrow: { fontFamily: fonts.body, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  pill: { paddingVertical: 5, paddingHorizontal: 11, borderRadius: 20, borderWidth: 1, alignSelf: 'flex-start', backgroundColor: '#172B3A' },
  pillText: { fontFamily: fonts.body, fontSize: 12, fontWeight: '600' },
  notice: { padding: 18, borderRadius: 12, borderLeftWidth: 3, backgroundColor: colors.surface, gap: 7, marginBottom: 18 },
  noticeTitle: { fontFamily: fonts.body, color: colors.text, fontSize: 16, fontWeight: '700' },
  noticeCopy: { fontFamily: fonts.body, color: colors.muted, fontSize: 14, lineHeight: 22 },
  meter: { height: 7, borderRadius: 4, backgroundColor: '#314259', overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 4 },
  stat: { gap: 4 },
  statValue: { fontFamily: fonts.display, fontSize: 30, fontWeight: '700', letterSpacing: -0.7 },
  statLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, lineHeight: 18 },
  loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 16 },
});
