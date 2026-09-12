import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router, usePathname } from 'expo-router';
import { alpha, colors, displayWeight, fonts, glow, radii, type } from '../theme';
import { useApp } from '../state/AppProvider';

/**
 * Solid right-pointing triangle, built from borders rather than a glyph. U+25B6/U+25B8 are absent
 * from Android's default Roboto and fall through to Noto Sans Symbols at an inconsistent optical
 * size (or to tofu), and react-native-svg is not a dependency — so the border trick is the only
 * way to get the same shape on native and web. Rotate it with `direction` for the other four ways.
 */
export function Triangle({ size = 6, color = colors.text, style }: { size?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  return <View style={[{
    width: 0, height: 0, borderStyle: 'solid',
    borderTopWidth: size, borderBottomWidth: size, borderLeftWidth: size * 1.3, borderRightWidth: 0,
    borderTopColor: 'transparent', borderBottomColor: 'transparent', borderRightColor: 'transparent', borderLeftColor: color,
  }, style]} />;
}

// Chrome metrics a screen needs in order to size a block against the fold. Exported (and used
// below) so the numbers can never drift out of sync with the styles they describe. A screen pins
// a block to the fold with `windowHeight - insets.top - CHROME_HEIGHT - CONTENT_PAD_TOP` — vh
// units are not an option (a TS error against DimensionValue, and silently dropped by Yoga on
// native, where the block would collapse to its content height).
export const HEADER_HEIGHT = 86;
export const HEADER_BORDER = 1;
export const CHROME_HEIGHT = HEADER_HEIGHT + HEADER_BORDER;
export const CONTENT_PAD_TOP = 30;

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
      {loading ? <ActivityIndicator color={variant === 'primary' ? colors.ink : colors.brand} /> : <>
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

export function Screen({ children, noNav = false, back, style, backdrop }: React.PropsWithChildren<{
  noNav?: boolean; back?: () => void; style?: StyleProp<ViewStyle>; backdrop?: React.ReactNode;
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
    {/* Default top-of-page wash for screens that don't mount a full SpaceBackdrop. Cool blue at a
        very low alpha — the `hazeSoft` hue, thinned further because this sits directly under the
        header rule and anything stronger reads as a tint on the chrome rather than as depth. */}
    {backdrop ?? <LinearGradient pointerEvents="none" colors={['rgba(61,123,255,0.06)', 'transparent']} style={styles.atmosphere} />}
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
        {/* Mirrors brandHit's minWidth so the centred nav is centred on the PAGE, not on whatever
            width the wordmark happens to occupy — space-between alone would bias it left. */}
        <View style={styles.headerTail}>
          <Pressable accessibilityRole="button" accessibilityLabel="Open player profile" onPress={() => { if (pathname !== '/profile') router.push('/profile'); }} style={styles.avatar}>
            <Text style={styles.avatarText}>{profile?.name?.slice(0, 1).toUpperCase() || 'V'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, !wide && !noNav && { paddingBottom: 112 }, style]} keyboardShouldPersistTaps="handled">
      <FadeIn key={pathname} skip={session.reducedMotion}>{children}</FadeIn>
    </ScrollView>
    {!wide && !noNav && <SafeAreaView edges={['bottom']} style={styles.bottomNav}>
      <View style={styles.bottomRow}>{nav.map(item =>
        <Pressable key={item.path} accessibilityRole="button" accessibilityState={{ selected: pathname === item.path }} onPress={() => { if (pathname !== item.path) router.push(item.path); }} style={styles.bottomItem}>
          <Text style={[styles.navMark, { color: pathname === item.path ? colors.brand : colors.faint }]}>{navMarks[item.path]}</Text>
          <Text style={[styles.navText, { fontSize: 11, color: pathname === item.path ? colors.text : colors.faint }]}>{item.title}</Text>
        </Pressable>
      )}</View>
    </SafeAreaView>}
  </SafeAreaView>;
}

export function Heading({ children, size = 34, style, textStyle }: React.PropsWithChildren<{
  size?: number; style?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle>;
}>) {
  const tracking = Math.max(-4, -size * 0.035);
  const leading = size >= 48 ? size * 1.03 : size * 1.12;
  // `style` lands on the wrapper View; `textStyle` reaches the glyphs themselves, which is where
  // a gradient fill or a tighter display leading has to be applied.
  return <View style={style}><Text style={[styles.heading, { fontSize: size, lineHeight: leading, letterSpacing: tracking }, textStyle]}>{children}</Text></View>;
}
export function Copy({ children, muted = true, style }: React.PropsWithChildren<{ muted?: boolean; style?: StyleProp<ViewStyle> }>) {
  return <View style={style}><Text style={[styles.copy, { color: muted ? colors.muted : colors.text }]}>{children}</Text></View>;
}
export function Eyebrow({ children, color = colors.accent }: React.PropsWithChildren<{ color?: string }>) {
  return <Text style={[styles.eyebrow, { color }]}>{children}</Text>;
}
export function Pill({ children, color = colors.brand }: React.PropsWithChildren<{ color?: string }>) {
  return <View style={[styles.pill, { borderColor: alpha(color, 0.36) }]}><Text style={[styles.pillText, { color }]}>{children}</Text></View>;
}
export function Notice({ title, children, action, actionLabel = 'Try again', tone = 'warning' }: React.PropsWithChildren<{
  title: string; action?: () => void | Promise<void>; actionLabel?: string; tone?: 'warning' | 'info';
}>) {
  return <View style={[styles.notice, { borderLeftColor: tone === 'info' ? colors.spark : colors.danger }]}>
    <Text style={styles.noticeTitle}>{title}</Text>
    {children && <Text style={styles.noticeCopy}>{children}</Text>}
    {action && <Button variant="quiet" onPress={action} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}>{actionLabel}</Button>}
  </View>;
}
export function Meter({ value, max, color = colors.accent, label }: { value: number; max: number; color?: string; label?: string }) {
  const progress = Math.min(1, Math.max(0, value / Math.max(1, max)));
  return <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max, now: value }} style={styles.meter}>
    <View style={[styles.meterFill, { width: ((progress * 100) + '%') as ViewStyle['width'], backgroundColor: color }]} />
  </View>;
}
export function Stat({ value, label, color = colors.text }: { value: string | number; label: string; color?: string }) {
  return <View style={styles.stat}><Text style={[styles.statValue, { color }]}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}
export function Loading({ text = 'Loading your player…' }: { text?: string }) {
  return <View style={styles.loading}><ActivityIndicator color={colors.brand} /><Copy>{text}</Copy></View>;
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
  header: { paddingHorizontal: 24, borderBottomWidth: HEADER_BORDER, borderBottomColor: colors.line },
  headerInner: { width: '100%', maxWidth: 1320, alignSelf: 'center', minHeight: HEADER_HEIGHT, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandHit: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 11, minWidth: 100 },
  headerTail: { minWidth: 100, alignItems: 'flex-end' },
  brandIcon: { width: 24, height: 28, flexDirection: 'row' },
  brandSlash: { width: 9, height: 25, backgroundColor: colors.brand, transform: [{ rotate: '-24deg' }], borderRadius: 2 },
  brandSlashSecond: { transform: [{ rotate: '24deg' }], backgroundColor: colors.text, marginLeft: 5 },
  wordmark: { fontFamily: fonts.display, fontSize: 22, fontWeight: displayWeight.heavy, letterSpacing: 1.5, color: colors.text },
  back: { color: colors.brand, fontSize: 38, lineHeight: 42 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.glass, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.lineStrong },
  avatarText: { fontFamily: fonts.body, fontWeight: '700', fontSize: 16, color: colors.text },
  desktopNav: { flexDirection: 'row', gap: 34 },
  desktopNavItem: { minHeight: 44, justifyContent: 'center', alignItems: 'stretch', gap: 9 },
  navIndicator: { height: 2, borderRadius: 1, backgroundColor: 'transparent' },
  navIndicatorActive: { backgroundColor: colors.brand, ...glow(colors.brand, 10, 0.9) },
  navText: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, fontWeight: '600', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1.9 },
  navTextActive: { color: colors.text },
  scroll: { flex: 1 },
  content: { width: '100%', maxWidth: 1320, alignSelf: 'center', paddingHorizontal: 24, paddingTop: CONTENT_PAD_TOP, paddingBottom: 48 },
  bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.backgroundElevated, borderTopColor: colors.line, borderTopWidth: 1 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-around', minHeight: 76 },
  bottomItem: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 4, minHeight: 64 },
  navMark: { fontSize: 23, lineHeight: 27 },
  button: { minHeight: 56, paddingHorizontal: 30, paddingVertical: 16, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent', flexDirection: 'row', gap: 12 },
  // White fill + `ink` label is 20.42:1 — the highest contrast any pairing in this palette can
  // reach — and this is the app's one high-emphasis action, so it gets it. Under Halo the white is
  // also doing palette work: it is the only fully-saturated-brightness surface on the page, so the
  // single primary action is the single loudest thing, without spending a hue on it.
  // Contrast is not what rules out a tinted fill — ink #05070A (L 0.00206) on brand #2DD4BF
  // (L 0.51380) is 10.57:1 and on accent #5EEAD4 (L 0.65970) is 13.42:1, both well past the 4.5:1
  // body floor at this 13px label. Keep white for system consistency (it is the primary treatment
  // everywhere — see CaptureFrame `button` and capture/src/styles.css `button.primary`); if a
  // redesign wants a mint primary, re-tint every primary together so it stays one decision.
  //
  // The glow is neutral light, not a tint: a coloured halo under a white pill is exactly the kind
  // of un-earned hue this palette rations.
  primary: { backgroundColor: '#FFFFFF', ...glow('rgba(226,235,245,0.9)', 26, 0.30) },
  // Ghost pill: a barely-there neutral fill (`surfaceRaised` at 55%) whose only real edge is the
  // border. That makes the border load-bearing under WCAG 1.4.11 — the fill flattens to rgb(15,19,24)
  // against a rgb(5,7,10) ground, which is 1.08:1 and invisible, so nothing else marks the control.
  // Hence `lineControl` and not `lineStrong`: over this fill it resolves to rgb(107,116,130), which
  // is 4.27:1 on the ground. `lineStrong` (alpha 0.24) resolves to rgb(57,64,74) = 1.99:1 and does
  // not clear the 3:1 a component boundary needs — it did not under the old palette either, so this
  // is a latent failure being fixed, not a regression introduced by the repalette.
  secondary: { backgroundColor: 'rgba(23,28,36,0.55)', borderColor: colors.lineControl },
  quiet: { backgroundColor: 'transparent' },
  // Same reasoning, same fix, one hue over: the destructive pill's boundary is its red ring, and at
  // the old 0.38 alpha that ring resolved to rgb(114,43,47) = 2.02:1. 0.62 lifts it to rgb(169,61,66)
  // = 3.24:1. This is the one place the palette spends a fully saturated warm hue on chrome, and it
  // is earned — there is exactly one destructive action in the app and it should look like one.
  danger: { backgroundColor: 'rgba(255,90,95,0.09)', borderColor: 'rgba(255,90,95,0.62)' },
  disabled: { opacity: 0.4 },
  buttonText: { fontFamily: fonts.body, fontSize: 13, fontWeight: '700', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1.4 },
  buttonIcon: { width: 24, height: 24, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  heading: { fontFamily: fonts.display, fontWeight: displayWeight.heavy, color: colors.text },
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
  statValue: { fontFamily: fonts.display, fontSize: 30, fontWeight: displayWeight.heavy, letterSpacing: -1 },
  statLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, lineHeight: 18, textTransform: 'uppercase', letterSpacing: 1.2 },
  loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 16 },
});
