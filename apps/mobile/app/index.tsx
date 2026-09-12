import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { STAGES } from '@vyra/core';
import CharacterGallery from '../src/components/CharacterGallery';
import SpaceBackdrop, { AtmosphereOrb } from '../src/components/SpaceBackdrop';
import { HERO_GALLERY, presentationFor } from '../src/lib/heroGallery';
import { displayEms } from '../src/lib/displayMetrics';
import {
  Button, Copy, Eyebrow, Heading, Loading, Meter, Notice, Pill, Screen, Stat, layout,
  CHROME_HEIGHT, CONTENT_PAD_TOP,
} from '../src/components/ui';
import { useApp } from '../src/state/AppProvider';
import { colors, displayGradient, fonts, glow, radii } from '../src/theme';

// Two-column cinematic hero: copy + character select on the left, the 3D character on the right.
const HERO_GAP = 56;
const COPY_FLEX = 1.34;
const STAGE_FLEX = 1;
// The headline is two lines, always. Its font size is derived from the column width divided by the
// measured width of the widest line, so it stays unbroken at any viewport and in whichever face the
// display stack resolves to — not just at the resolution and on the machine it was designed on.
const HEADLINE_LINES = ['REAL EFFORT.', 'LEGENDARY ENERGY.'];
/** Ems of the condensed-black stack, used only where the host can't be measured (native). */
const HEADLINE_EMS_FALLBACK = 8.3;
const HEADLINE_MAX = 92;
/** Shaves a sliver off the fitted size so sub-pixel rounding can never tip a line into wrapping. */
const HEADLINE_FIT = 0.99;
// Strip at the foot of the stage reserved for the character caption, so the model's feet land
// above it instead of colliding with the text. The caption's own height is measured rather than
// assumed — its blurb wraps to a different number of lines per character and per stage width, and
// any fixed band under-reserves the moment it wraps twice.
/** How far the caption floats above the foot of the stage. Mirrored in `styles.stageCaption`. */
const CAPTION_INSET = 8;
/** Gap left between the model's feet and the top of the caption. */
const CAPTION_CLEARANCE = 14;
/** Stand-in for the caption's height on the very first paint, before it has reported a layout. */
const CAPTION_H_ESTIMATE = 104;
const STAGE_H_COMPACT = 380;
// Viability thresholds for the two-column hero, expressed as what the composition actually needs
// rather than as guessed breakpoints. Below HERO_MIN_COPY_W the two action pills wrap onto separate
// rows and push the character cards out of the fold; below HERO_MIN_H the copy stack has no room to
// breathe. Either shortfall drops the page to the stacked, naturally-scrolling layout.
const HERO_MIN_COPY_W = 500;
const HERO_MIN_H = 600;
// Upper bound on the hero. Past this the copy column — which centres a ~590px stack inside it —
// would strand hundreds of pixels of dead air between the buttons and the character cards, so on
// very tall displays the hero stops growing and the sections below simply come into view instead.
const HERO_MAX_H = 940;

export default function HomeScreen() {
  const { profile, session, booting, connectionError, refreshProfile } = useApp();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 850;
  const stage = STAGES.find(item => item.id === (profile?.stage || 'starter'))!;
  const next = STAGES[STAGES.findIndex(item => item.id === stage.id) + 1];
  const [selectedId, setSelectedId] = useState(HERO_GALLERY[0].id);
  const selected = HERO_GALLERY.find(character => character.id === selectedId) ?? HERO_GALLERY[0];
  const presentation = presentationFor(selected);
  const [captionH, setCaptionH] = useState(CAPTION_H_ESTIMATE);

  const contentW = Math.min(width, 1320) - 48;
  const columnsW = contentW - HERO_GAP;
  const copyW = (columnsW * COPY_FLEX) / (COPY_FLEX + STAGE_FLEX);
  const stageW = columnsW - copyW;
  // Hero height, derived from the window and Screen's own chrome metrics — never vh, which is a TS
  // error against DimensionValue and is silently dropped by Yoga on native. This is the whole fold
  // minus the content padding, so the hero lands exactly on it. `insets.bottom` comes off too:
  // Screen's SafeAreaView only claims the top/side edges, so nothing else reserves the home
  // indicator, and the caption's tappable row sits at the very bottom of this box.
  const heroH = Math.min(HERO_MAX_H, Math.max(0, height - insets.top - insets.bottom - CHROME_HEIGHT - CONTENT_PAD_TOP));
  // Gating on the same heroH that sizes the section, rather than on a clamped minimum, is what keeps
  // the promise: whenever the cinematic layout is used, it provably fits the first viewport.
  const cinematic = heroH >= HERO_MIN_H && copyW >= HERO_MIN_COPY_W;
  // Widest line wins — measured rather than assumed, so editing the copy above can't silently
  // reintroduce a wrap. Both calls are cached, so this is a map lookup after the first render.
  // `.toUpperCase()` because styles.display paints it uppercase whatever case the copy is typed in.
  const headlineEms = Math.max(...HEADLINE_LINES.map(line => displayEms(line.toUpperCase(), HEADLINE_EMS_FALLBACK)));
  // Floor, not round: rounding up is exactly the half-pixel that would tip a fitted line into
  // wrapping. The lower clamps are legibility floors only — they sit below every fitted size the
  // measured stacks produce down to a 280px viewport, so they never override the fit.
  const headingSize = cinematic
    ? Math.floor(Math.max(34, Math.min(HEADLINE_MAX, (copyW * HEADLINE_FIT) / headlineEms)))
    : Math.floor(Math.max(20, Math.min(58, (width - 48) / (headlineEms + 0.4))));
  // The canvas stops short of the caption so the model's feet land above the text at every width,
  // and the orb re-centres on the shortened canvas rather than on the whole stage.
  const captionBand = captionH + CAPTION_INSET + CAPTION_CLEARANCE;
  const stageCanvasH = (cinematic ? heroH : STAGE_H_COMPACT) - captionBand;
  const orbSize = cinematic ? Math.min(stageW * 1.42, stageCanvasH * 0.94) : Math.min(width * 0.82, 340);

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
  if (booting) return <Screen backdrop={<SpaceBackdrop />}><Loading /></Screen>;

  const cards = <View style={styles.gallery}>
    <View style={[layout.split, { marginBottom: 13 }]}>
      <Text style={styles.galleryTitle}>Choose your hero</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push('/collection')}><Text style={styles.galleryViewAll}>View all ›</Text></Pressable>
    </View>
    <View style={styles.galleryRow}>{HERO_GALLERY.map(character => {
      const active = character.id === selectedId;
      return <Pressable key={character.id} accessibilityRole="radio" accessibilityState={{ checked: active, disabled: !character.available }}
        disabled={!character.available} onPress={() => setSelectedId(character.id)}
        style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
          styles.card, hovered && !active && styles.cardHover, active && styles.cardActive, !character.available && styles.cardLocked,
        ]}>
        <View style={[styles.cardGlyphWrap, active && styles.cardGlyphWrapActive]}><Text style={[styles.cardGlyph, active && { color: colors.teal }]}>{character.glyph}</Text></View>
        <Text style={styles.cardName} numberOfLines={1}>{character.name}</Text>
        <Text style={[styles.cardTag, { color: character.available ? colors.teal : colors.faint }]} numberOfLines={1}>{character.tag}</Text>
      </Pressable>;
    })}</View>
  </View>;

  return <Screen backdrop={<SpaceBackdrop />}>
    {connectionError && <Notice title="Your profile is offline" action={() => refreshProfile().catch(() => undefined)}>{connectionError}</Notice>}
    <View style={[styles.heroSection, cinematic && [styles.heroWide, { height: heroH }]]}>
      <Animated.View style={[styles.intro, cinematic && { flex: COPY_FLEX, minWidth: 0 }, {
        opacity: introMotion, transform: [{ translateY: introMotion.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
      }]}>
        <View style={[styles.introBody, cinematic && styles.introBodyWide]}>
          <Eyebrow>{profile ? 'Welcome back, ' + profile.name : 'A fitness protocol, not a fitness app'}</Eyebrow>
          <Heading size={headingSize} textStyle={[styles.display, { lineHeight: headingSize * 0.94 }, displayGradient]}>{HEADLINE_LINES.join('\n')}</Heading>
          <Copy style={styles.lead}>Move in the real world. Grow a hero that shows exactly how far you’ve come — no shortcuts, no filters.</Copy>
          <View style={styles.progress}>
            <View style={layout.split}><Pill color={stage.color}>{stage.name} hero</Pill><Text style={styles.xp}>{profile ? profile.xp.toLocaleString() + ' XP' : 'A fresh beginning'}</Text></View>
            <Meter value={profile?.xp || 0} max={next?.xp || 7500} color={stage.color} label="Hero evolution progress" />
            <Text style={styles.next}>{profile ? next ? next.name + ' at ' + next.xp.toLocaleString() + ' XP and ' + next.days + ' active days' : 'Legendary evolution achieved. Keep your story going.' : 'Earn your first evolution by completing a workout.'}</Text>
          </View>
          <View style={styles.actions}>
            <Button onPress={() => router.push(profile ? '/arena' : '/profile')} icon={<Text style={styles.iconGlyph}>▸</Text>}>{profile ? 'Enter the arena' : 'Create your player'}</Button>
            <Button variant="secondary" onPress={() => router.push('/calibrate')}>Check my camera</Button>
          </View>
        </View>
        {cards}
      </Animated.View>
      <Animated.View style={[styles.heroStage, cinematic && { flex: STAGE_FLEX, height: heroH }, {
        opacity: heroMotion, transform: [{ scale: heroMotion.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
      }]}>
        <AtmosphereOrb size={orbSize} style={[styles.orb, { top: stageCanvasH * 0.5, marginTop: -orbSize * 0.5 }]} />
        {selected.available && selected.glb
          ? <CharacterGallery glb={selected.glb} label={selected.name} active={!session.reducedMotion} style={[styles.hero, { height: stageCanvasH }]}
              yaw={presentation.yaw} targetHeight={presentation.targetHeight} framing={presentation.framing} pedestal={false} />
          : <View style={[styles.hero, { height: stageCanvasH }, styles.comingSoon]}><Text style={styles.comingSoonGlyph}>{selected.glyph}</Text><Text style={styles.comingSoonText}>{selected.name} is coming soon</Text></View>}
        {/* Bottom-anchored, so its height feeds back into the canvas height above rather than
            being pushed around by it — no layout loop. Rounded up and change-gated to keep
            sub-pixel jitter from re-rendering the stage. */}
        <View style={styles.stageCaption} pointerEvents="box-none"
          onLayout={event => { const next = Math.ceil(event.nativeEvent.layout.height); setCaptionH(current => (current === next ? current : next)); }}>
          <View style={styles.captionRow}><View style={[styles.captionDot, { backgroundColor: selected.available ? colors.teal : colors.faint }]} /><Text style={styles.stageName}>{selected.name.toUpperCase()}</Text></View>
          <Text style={styles.stageBlurb} numberOfLines={2}>{selected.available ? selected.blurb || selected.name + ' — ready to battle.' : 'This model will unlock soon.'}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/collection')} style={styles.explore}>
            <Text style={styles.exploreText}>Explore your Vanguard evolutions</Text><Text style={styles.exploreArrow}>›</Text>
          </Pressable>
        </View>
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
        <View style={styles.challengeGraphic}><View style={[styles.fist, { transform: [{ rotate: '-12deg' }] }]} /><View style={[styles.fist, { backgroundColor: colors.blue, transform: [{ rotate: '12deg' }] }]} /></View>
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
  heroSection: { gap: 40 },
  heroWide: { flexDirection: 'row', alignItems: 'stretch', gap: HERO_GAP },
  intro: { gap: 26 },
  introBody: { gap: 20 },
  introBodyWide: { flex: 1, justifyContent: 'center', gap: 20 },
  display: { textTransform: 'uppercase' },
  lead: { maxWidth: 430 },
  progress: { gap: 11, maxWidth: 420 },
  xp: { fontFamily: fonts.body, color: colors.text, fontSize: 14, fontWeight: '600' },
  next: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, lineHeight: 19 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 2 },
  iconGlyph: { color: colors.text, fontSize: 11 },

  gallery: { maxWidth: 430, paddingBottom: 28 },
  galleryTitle: { fontFamily: fonts.body, color: colors.text, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.8 },
  galleryViewAll: { fontFamily: fonts.body, color: colors.teal, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2 },
  // Cards flex and wrap rather than sitting at a fixed width: three 104px cards plus gaps are
  // 336px, which already overflows the content column on a 360pt phone, and every character added
  // to HERO_GALLERY makes it worse. Growing to `maxWidth` keeps today's roster looking identical
  // on desktop; `flexBasis` is the point below which they wrap to a second row instead of clipping.
  galleryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { flexGrow: 1, flexBasis: 92, maxWidth: 118, paddingVertical: 14, paddingHorizontal: 8, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: 'rgba(10,18,36,0.55)', alignItems: 'center', gap: 9 },
  cardHover: { borderColor: colors.lineStrong, backgroundColor: 'rgba(18,30,56,0.7)' },
  cardActive: { borderColor: 'rgba(111,233,218,0.75)', backgroundColor: 'rgba(18,44,62,0.62)', ...glow(colors.teal, 20, 0.45) },
  cardLocked: { opacity: 0.5 },
  cardGlyphWrap: { width: 42, height: 42, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(6,14,32,0.85)' },
  cardGlyphWrapActive: { borderColor: colors.teal, backgroundColor: 'rgba(12,52,66,0.85)' },
  cardGlyph: { fontFamily: fonts.display, color: colors.text, fontSize: 17, fontWeight: '900' },
  cardName: { fontFamily: fonts.body, color: colors.text, fontSize: 12, fontWeight: '700' },
  cardTag: { fontFamily: fonts.body, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.9 },

  heroStage: { height: STAGE_H_COMPACT, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  orb: { position: 'absolute', alignSelf: 'center' },
  hero: { width: '100%', position: 'absolute', top: 0, left: 0 },
  comingSoon: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  comingSoonGlyph: { fontFamily: fonts.display, color: colors.faint, fontSize: 40, fontWeight: '900' },
  comingSoonText: { fontFamily: fonts.body, color: colors.muted, fontSize: 14 },
  stageCaption: { position: 'absolute', right: 0, bottom: CAPTION_INSET, maxWidth: 250, gap: 4, alignItems: 'flex-end' },
  captionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  captionDot: { width: 6, height: 6, borderRadius: 3 },
  stageName: { fontFamily: fonts.display, color: colors.text, fontSize: 15, fontWeight: '900', letterSpacing: 2.4 },
  stageBlurb: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, lineHeight: 19, textAlign: 'right' },
  explore: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 },
  exploreText: { fontFamily: fonts.body, color: colors.text, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.4 },
  exploreArrow: { fontSize: 18, color: colors.teal },

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
