import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { characterFor, fitnessProgress, type CharacterId } from '@vyra/core';
import CharacterGallery from '../src/components/CharacterGallery';
import { FitnessProgressPanel, displayFitnessStage } from '../src/components/FitnessUI';
import ModelCredit from '../src/components/ModelCredit';
import SpaceBackdrop, { AtmosphereOrb } from '../src/components/SpaceBackdrop';
import { HERO_GALLERY, presentationFor, type GalleryCharacter } from '../src/lib/heroGallery';
import { displayEms, useDisplayFontReady } from '../src/lib/displayMetrics';
import { characterAssetFor } from '../src/lib/characterAssets';
import { errorMessage } from '../src/lib/api';
import {
  Button, Copy, Eyebrow, Heading, Loading, Notice, Screen, Stat, Triangle,
  CHROME_HEIGHT, CONTENT_PAD_TOP,
} from '../src/components/ui';
import { useApp } from '../src/state/AppProvider';
import { colors, displayGradient, displayWeight, fonts, glow, radii } from '../src/theme';

// Two-column cinematic hero: copy + character select on the left, the 3D character on the right.
const HERO_GAP = 56;
const COPY_FLEX = 1.34;
const STAGE_FLEX = 1;
// The headline is two lines, always. Its font size is derived from the column width divided by the
// measured width of the widest line, so it stays unbroken at any viewport and in whichever face the
// display stack resolves to — not just at the resolution and on the machine it was designed on.
const HEADLINE_LINES = ['REAL EFFORT.', 'LEGENDARY ENERGY.'];
/** Ems of the native condensed faces, used only where the host can't be measured (native). Web
 *  measures the real thing: self-hosted Oswald at `displayWeight.heavy` is 7.45 ems for the longer
 *  line. This stays deliberately wider than that — over-estimating only makes the fitted size
 *  smaller, while under-estimating wraps the headline, which is the one thing it must never do. */
const HEADLINE_EMS_FALLBACK = 8.3;
/** Ceiling on the fitted size. The fit alone would take the headline to ~92px on a 1440px viewport,
 *  which is where it stopped reading as a headline and started reading as a wall — it spanned the
 *  copy column edge to edge and crowded the character stage beside it. 78 keeps it dominant without
 *  that, and is what the lead paragraph and the two action pills are spaced against. */
const HEADLINE_MAX = 78;
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

// Character rail. The cards are a fixed portrait size rather than flexible, because a portrait is
// the point — a flexible card collapses to a chip on a phone and stops reading as a character.
// Fixed width means the rail cannot wrap gracefully, so it scrolls horizontally instead (see
// `styles.galleryRow`); three cards plus gaps are 639px, which does not fit the copy column until
// roughly a 1260px viewport, and wrapping there would silently push the rail through the fold.
const CARD_W = 205;
const CARD_H = 250;
const CARD_GAP = 12;

// Viability thresholds for the two-column hero, expressed as what the composition actually needs
// rather than as guessed breakpoints. Below HERO_MIN_COPY_W the two action pills wrap onto separate
// rows; below HERO_MIN_H the copy stack plus the 250px rail no longer clears the fold. Either
// shortfall drops the page to the stacked, naturally-scrolling layout.
//
// HERO_MIN_H is 660 rather than the copy stack's own ~648 so the guarantee survives a safe-area
// inset: an iPad in landscape spends 44px on insets, which turns an 800px viewport into 639px of
// hero — below the stack, and therefore correctly demoted to the stacked layout instead of clipped.
const HERO_MIN_COPY_W = 500;
const HERO_MIN_H = 660;
// Upper bound on the hero. Past this the copy column — which centres a ~650px stack inside it —
// would strand hundreds of pixels of dead air between the buttons and the character cards, so on
// very tall displays the hero stops growing and the sections below simply come into view instead.
const HERO_MAX_H = 940;

/**
 * One character in the hero rail: full-bleed portrait art, name at the top, accent badge at the
 * foot, and a padlock over the artwork when the character is not yet playable.
 *
 * A locked card is NOT a dimmed copy of an unlocked one. Its art is already an anonymous silhouette
 * baked offline (see `GalleryCharacter.art`), so the locked state is carried by that plus the
 * padlock and a muted name — never by `opacity` on the card, which would drag the name and the badge
 * down with it (the old build landed at 1.68:1 doing exactly that). The badge in particular stays at
 * full saturation: it is the one mark that says a character is coming.
 */
function HeroCard({ character, active, onPress, disabled = false }: { character: GalleryCharacter; active: boolean; onPress: () => void; disabled?: boolean }) {
  const locked = !character.available;
  return <Pressable
    accessibilityRole="radio"
    accessibilityState={{ checked: active, disabled: locked || disabled }}
    accessibilityLabel={`${character.name}${locked ? ', locked' : ''}`}
    disabled={locked || disabled}
    onPress={onPress}
    style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
      styles.card,
      hovered && !active && !locked && styles.cardHover,
      active && [styles.cardActive, { borderColor: character.accent, ...glow(character.accent, 22, 0.5) }],
    ]}
  >
    {/* Base wash under the cutout, so the card never flashes empty while the PNG decodes. A locked
        card gets a lighter slate ground, and one that barely darkens top-to-bottom: its art is a
        flat #0A0614 silhouette whose mass sits in the LOWER half, so a ground that faded to the
        unlocked card's near-black would swallow the figure exactly where there is most of it. Held
        this way the shape reads at 1.25:1 at the foot and 1.57:1 at the head — a shadow you can
        make out, not a picture of somebody, which is the point of a locked slot.
        The silhouette hex above is baked into the PNGs by scripts/make-hero-cards.mjs and so is NOT
        a palette value these two stops can be re-cut against freely; they were recomputed against
        it, not against each other. */}
    <LinearGradient
      colors={locked ? ['#2A3444', '#1B222D'] : ['#141A22', '#080B10']}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
    <Image source={character.art} style={styles.cardArt} resizeMode="cover" accessible={false} />
    {/* Top and bottom scrims, in `colors.ink`. The name sits at the top and the badge at the foot,
        so both ends need darkening; the middle stays clear so the portrait is not veiled. At 0.88
        the top scrim holds the name at 14.1:1 even over pure white artwork, and at 8.95:1 for the
        muted name on a locked card. */}
    <LinearGradient
      colors={['rgba(5,7,10,0.88)', 'rgba(5,7,10,0.04)', 'rgba(5,7,10,0.94)']}
      locations={[0, 0.42, 1]}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
    <Text style={[styles.cardName, locked && styles.cardNameLocked]} numberOfLines={1}>{character.name.toUpperCase()}</Text>
    {locked && <View style={styles.cardLockWrap} pointerEvents="none"><Text style={styles.cardLock}>🔒</Text></View>}
    <View style={[styles.cardBadge, { backgroundColor: character.accent, ...glow(character.accent, 14, 0.65) }]} pointerEvents="none">
      <Text style={styles.cardBadgeGlyph}>{character.badge}</Text>
    </View>
  </Pressable>;
}

export default function HomeScreen() {
  const { profile, session, booting, connectionError, refreshProfile, selectCharacter } = useApp();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 850;
  const stage = displayFitnessStage(profile?.stage);
  const [selectedId, setSelectedId] = useState<CharacterId>(characterFor(profile?.characterId).id);
  const [selecting, setSelecting] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const selectionPending = useRef(false);
  useEffect(() => { if (profile) setSelectedId(characterFor(profile.characterId).id); }, [profile?.id, profile?.characterId]);
  const chooseCharacter = async (id: CharacterId) => {
    if (selectionPending.current || id === selectedId) return;
    setSelectionError(null);
    if (!profile) { setSelectedId(id); return; }
    selectionPending.current = true; setSelecting(true);
    try { await selectCharacter(id); setSelectedId(id); }
    catch (failure) { setSelectionError(errorMessage(failure)); }
    finally { selectionPending.current = false; setSelecting(false); }
  };
  const selected = HERO_GALLERY.find(character => character.id === selectedId) ?? HERO_GALLERY[0];
  const presentation = presentationFor(selected);
  // One flag for "the 3D model is on screen", so the licence credit below can never drift out of
  // sync with whether the model it credits is actually being shown.
  const showingModel = selected.available && !!selected.glb;
  const [captionH, setCaptionH] = useState(CAPTION_H_ESTIMATE);
  // Re-renders this screen once the web font settles. Without it the headline keeps the size it was
  // fitted to against the system fallback on first paint, which is a different width from Oswald.
  useDisplayFontReady();

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
    <Pressable accessibilityRole="button" accessibilityLabel="View all characters" onPress={() => router.push('/collection')} style={styles.galleryViewAll}>
      <Text style={styles.galleryViewAllText}>View all</Text>
      <Triangle size={5} color={colors.brand} />
    </Pressable>
    {/* Horizontal rather than wrapping: the cards are a fixed 205px, so on anything narrower than
        ~1260px a wrapping row silently becomes two rows and shoves the rail through the fold.
        Scrolling degrades honestly instead, and a partly-visible third card is its own affordance. */}
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.galleryRow}
      style={styles.galleryScroll}
    >
      {HERO_GALLERY.map(character =>
        <HeroCard key={character.id} character={character} active={character.id === selectedId} disabled={selecting} onPress={() => void chooseCharacter(character.id)} />
      )}
    </ScrollView>
  </View>;

  return <Screen backdrop={<SpaceBackdrop />}>
    {connectionError && <Notice title="Your profile is offline" action={() => refreshProfile().catch(() => undefined)}>{connectionError}</Notice>}
    {selectionError && <View accessibilityLiveRegion="polite"><Notice title="Could not save your character">{selectionError} Your previous character is still selected. Choose a card to try again.</Notice></View>}
    {selecting && <Text accessibilityLiveRegion="polite" style={styles.next}>Saving your character…</Text>}
    <View style={[styles.heroSection, cinematic && [styles.heroWide, { height: heroH }]]}>
      <Animated.View style={[styles.intro, cinematic && { flex: COPY_FLEX, minWidth: 0 }, {
        opacity: introMotion, transform: [{ translateY: introMotion.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
      }]}>
        <View style={[styles.introBody, cinematic && styles.introBodyWide]}>
          <Eyebrow>{profile ? 'Welcome back, ' + profile.name : 'A fitness protocol, not a fitness app'}</Eyebrow>
          {/* One Text, not two. displayGradient clips a single background box to the glyphs; split
              across two elements each line gets its own box and the ramp restarts on line two. */}
          <Heading size={headingSize} textStyle={[styles.display, { lineHeight: headingSize * 0.94 }, displayGradient]}>{HEADLINE_LINES.join('\n')}</Heading>
          <Copy style={styles.lead}>Move in the real world. Grow a hero that shows exactly how far you’ve come — no shortcuts, no filters.</Copy>
          <View style={styles.actions}>
            <Button onPress={() => router.push(profile ? profile.fitness ? '/arena' : '/onboarding' : '/profile')} icon={<Triangle size={5} color={colors.text} style={{ marginLeft: 1 }} />}>{profile ? profile.fitness ? 'Enter the arena' : 'Set my goal' : 'Create your player'}</Button>
            <Button variant="secondary" onPress={() => router.push('/calibrate')}>Check my camera</Button>
          </View>
        </View>
        {cards}
      </Animated.View>
      <Animated.View style={[styles.heroStage, cinematic && { flex: STAGE_FLEX, height: heroH }, {
        opacity: heroMotion, transform: [{ scale: heroMotion.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
      }]}>
        <AtmosphereOrb size={orbSize} style={[styles.orb, { top: stageCanvasH * 0.5, marginTop: -orbSize * 0.5 }]} />
        {showingModel
          ? <CharacterGallery glb={characterAssetFor(selected.id, stage.id)} label={`${selected.name}, ${stage.name} stage`} active={!session.reducedMotion} style={[styles.hero, { height: stageCanvasH }]}
              yaw={presentation.yaw} targetHeight={presentation.targetHeight} framing={presentation.framing}
              flare={presentation.flare} pedestal={false} />
          : <View style={[styles.hero, { height: stageCanvasH }, styles.comingSoon]}><Text style={styles.comingSoonGlyph}>{selected.glyph}</Text><Text style={styles.comingSoonText}>{selected.name} is coming soon</Text></View>}
        {/* Bottom-anchored, so its height feeds back into the canvas height above rather than
            being pushed around by it — no layout loop. Rounded up and change-gated to keep
            sub-pixel jitter from re-rendering the stage. */}
        <View style={styles.stageCaption} pointerEvents="box-none"
          onLayout={event => { const next = Math.ceil(event.nativeEvent.layout.height); setCaptionH(current => (current === next ? current : next)); }}>
          <View style={styles.captionRow}><View style={[styles.captionDot, { backgroundColor: selected.available ? selected.accent : colors.faint }]} /><Text style={styles.stageName}>{selected.name.toUpperCase()}</Text></View>
          <Text style={styles.stageBlurb} numberOfLines={2}>{selected.available ? `${stage.name} · ${selected.blurb || selected.name + ' — ready to battle.'}` : 'This model will unlock soon.'}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/collection')} style={styles.explore}>
            <Text style={styles.exploreText}>Explore your evolutions</Text><Triangle size={5} color={colors.brand} />
          </Pressable>
          {/* Inside the measured caption on purpose: its onLayout above feeds the height back into
              stageCanvasH, so the credit reserves its own space instead of overlapping the model. */}
          {showingModel && selected.attribution && <ModelCredit attribution={selected.attribution} style={styles.credit} />}
        </View>
      </Animated.View>
    </View>
    {/* Evolution progress. It used to sit in the hero copy stack; the hero is now the headline, the
        two actions and the character rail, so progress lives here — still above the stats, but
        below the fold. Only rendered for a signed-in player, so there is no empty-state band. */}
    {profile?.fitness && <View style={styles.progress}>
      <FitnessProgressPanel profile={profile} compact />
      <Button variant="secondary" onPress={() => router.push('/check-in')}>{fitnessProgress(profile).checkInDue ? 'Record your weekly check-in' : 'View measurements & check-ins'}</Button>
    </View>}
    {profile && !profile.fitness && <View style={styles.progress}><Notice title="Your next step: set a goal" tone="info" action={() => router.push('/onboarding')} actionLabel="Set my goal & character">Save your starting measurements to connect workout progress with your chosen target. Existing XP stays saved.</Notice></View>}
    {profile && <View style={styles.stats}>
      <Stat value={profile.streak} label="day streak" color={colors.ember} />
      <View style={styles.statDivider} />
      <Stat value={profile.totalReps} label="valid reps" />
      <View style={styles.statDivider} />
      <Stat value={profile.ownedCosmetics.length} label="collectibles earned" color={colors.accent} />
    </View>}
    <View style={[styles.bottomSection, wide && { flexDirection: 'row' }]}>
      <Pressable accessibilityRole="button" onPress={() => profile?.fitness ? router.push({ pathname: '/arena', params: { mode: 'pvp' } }) : router.push(profile ? '/onboarding' : '/profile')} style={styles.challenge}>
        <View style={styles.challengeGraphic}><View style={[styles.fist, { transform: [{ rotate: '-12deg' }] }]} /><View style={[styles.fist, { backgroundColor: colors.spark, transform: [{ rotate: '12deg' }] }]} /></View>
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
  // 20, not 26: the rail is 135px taller than the chip row it replaced, and this gap plus the
  // rail's own paddingBottom are where that height is bought back out of the fold budget.
  intro: { gap: 20 },
  introBody: { gap: 20 },
  introBodyWide: { flex: 1, justifyContent: 'center', gap: 20 },
  display: { textTransform: 'uppercase' },
  lead: { maxWidth: 430 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 2 },

  gallery: { paddingBottom: 8 },
  galleryViewAll: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', minHeight: 28, marginBottom: 13 },
  galleryViewAllText: { fontFamily: fonts.body, color: colors.text, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.8 },
  // `overflow: visible` so an active card's glow is not clipped by the scroller; the row is wider
  // than the column by design, and the ScrollView still bounds the scrollable area.
  galleryScroll: { overflow: 'visible' },
  galleryRow: { flexDirection: 'row', gap: CARD_GAP, paddingRight: 4 },
  card: {
    width: CARD_W, height: CARD_H, borderRadius: radii.md, overflow: 'hidden',
    borderWidth: 2, borderColor: 'transparent', backgroundColor: colors.backgroundElevated,
    justifyContent: 'flex-start',
  },
  cardHover: { borderColor: colors.lineStrong },
  cardActive: { borderWidth: 2 },
  // Explicit 100%/100% rather than StyleSheet.absoluteFill: react-native-web renders Image as a
  // div that falls back to the source's INTRINSIC size (410x500 here) when height is auto, so
  // absoluteFill alone leaves the art overflowing the 205x250 card. borderRadius is repeated on the
  // image so no square corner peeks past the parent's clip.
  cardArt: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', borderRadius: radii.md - 2 },
  cardName: { fontFamily: fonts.display, color: colors.text, fontSize: 14, fontWeight: displayWeight.heavy, letterSpacing: 1.7, margin: 14 },
  cardNameLocked: { color: colors.muted },
  cardLockWrap: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  cardLock: { fontSize: 30 },
  cardBadge: { position: 'absolute', left: 14, bottom: 14, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  cardBadgeGlyph: { fontSize: 15, lineHeight: 19 },

  heroStage: { height: STAGE_H_COMPACT, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  orb: { position: 'absolute', alignSelf: 'center' },
  hero: { width: '100%', position: 'absolute', top: 0, left: 0 },
  comingSoon: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  comingSoonGlyph: { fontFamily: fonts.display, color: colors.faint, fontSize: 40, fontWeight: displayWeight.heavy },
  comingSoonText: { fontFamily: fonts.body, color: colors.muted, fontSize: 14 },
  stageCaption: { position: 'absolute', right: 0, bottom: CAPTION_INSET, maxWidth: 250, gap: 4, alignItems: 'flex-end' },
  captionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  captionDot: { width: 6, height: 6, borderRadius: 3 },
  stageName: { fontFamily: fonts.display, color: colors.text, fontSize: 15, fontWeight: displayWeight.heavy, letterSpacing: 2.4 },
  stageBlurb: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, lineHeight: 19, textAlign: 'right' },
  explore: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 },
  exploreText: { fontFamily: fonts.body, color: colors.text, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.4 },
  // Sits inside the measured stage caption, so it stays narrower than the caption's 250 cap.
  credit: { maxWidth: 230, marginTop: 2 },

  // 560, not the 420 this block used inside the copy column: out here the container is up to
  // 1272px wide, where 420 strands a fragment and an unconstrained Meter becomes a hairline.
  progress: { gap: 11, maxWidth: 560, marginTop: 44 },
  xp: { fontFamily: fonts.body, color: colors.text, fontSize: 14, fontWeight: '600' },
  next: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, lineHeight: 19 },

  stats: { marginTop: 40, paddingVertical: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderTopColor: colors.line, borderBottomColor: colors.line, borderTopWidth: 1, borderBottomWidth: 1 },
  statDivider: { width: 1, height: 37, backgroundColor: colors.line },
  bottomSection: { gap: 24, marginTop: 40 },
  challenge: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 18, padding: 26, borderRadius: radii.xl, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.line, minHeight: 150 },
  challengeGraphic: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  fist: { height: 43, width: 22, borderRadius: 8, backgroundColor: colors.brand },
  challengeTitle: { fontFamily: fonts.display, fontSize: 23, fontWeight: displayWeight.heavy, color: colors.text, letterSpacing: -0.6 },
  challengeCopy: { fontFamily: fonts.body, color: colors.muted, fontSize: 14, lineHeight: 22, maxWidth: 360 },
  chevron: { fontSize: 30, color: colors.muted },
  practice: { flex: 1, padding: 26, borderRadius: radii.xl, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.line, gap: 10, justifyContent: 'center' },
  practiceTitle: { fontFamily: fonts.display, color: colors.text, fontSize: 22, fontWeight: displayWeight.heavy, letterSpacing: -0.6 },
});
