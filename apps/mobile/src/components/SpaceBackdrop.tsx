import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { alpha, atmosphere, colors } from '../theme';

/**
 * Full-bleed deep-space atmosphere: a pure-black void up top easing into a deep blue-teal horizon
 * at the bottom, with a fine starfield over it. Purely decorative and non-interactive — mount
 * it as the FIRST child of a screen's outer container so it paints behind the header and the
 * scroller (every react-native-web View is its own stacking context, so sibling order is the paint
 * order and a negative zIndex cannot push a later sibling behind an earlier one).
 *
 * Web draws the whole thing as tiled/positioned background gradients on ONE node — no per-star
 * elements, GPU-rasterized once, repaints only on resize. Native cannot tile a background
 * reliably, so it composes a LinearGradient base with a small, seeded set of dot views.
 */

/** Fully transparent void, for every gradient fade-out. Derived from the token rather than typed
 *  out by hand, because a hand-written clear stop is exactly how a dead palette's RGB survives a
 *  repalette unnoticed: `alpha(x, 0)` is invisible on its own, but CAGradientLayer (native) and any
 *  renderer that interpolates un-premultiplied will smear that RGB back through the ramp. */
const VOID_CLEAR = alpha(atmosphere.void, 0);

// Stars stay near-white / faintly cool — they read as light, not as a hue. The two dimmer layers
// carry just enough blue cast to sit in the sky rather than fight it.
const STAR_LAYERS = [
  'radial-gradient(circle at 18% 26%, rgba(255,255,255,0.95) 0px, rgba(255,255,255,0) 1.25px)',
  'radial-gradient(circle at 63% 71%, rgba(219,232,248,0.80) 0px, rgba(219,232,248,0) 1.10px)',
  'radial-gradient(circle at 41% 12%, rgba(255,255,255,0.50) 0px, rgba(255,255,255,0) 1.00px)',
  'radial-gradient(circle at 86% 44%, rgba(196,216,240,0.42) 0px, rgba(196,216,240,0) 0.90px)',
];
// Coprime-ish tile sizes so the repeat never resolves into a visible grid.
const STAR_SIZES = '167px 131px, 229px 197px, 97px 89px, 311px 283px';
// The mid stop of the horizon bloom: a deep sea-teal bridging `haze` down into the void.
// Both channels and alpha are load-bearing. CSS gradients interpolate PREMULTIPLIED, so this stop
// pulls the ramp down harder than a naive un-premultiplied reading suggests: at the brightest
// on-screen point (bottom-centre — the radial is centred at 50%/116% with an 80% vertical radius,
// so the nearest visible pixel is 16/80 = 20% along, i.e. 0.2/0.36 of the way from `haze` to here)
// it resolves to ~rgba(34,154,149,0.127) and flattens over `horizon` to rgb(15,51,61).
// That is also where the native bloom's final stop lands (rgb(15,51,61)), so the two paths agree
// to within 1/255 per channel instead of drifting apart.
// At that point: `colors.text` 12.30:1, `colors.muted` 6.15:1 — both comfortably body-safe, which
// they were not under the old orchid bloom (`muted` sat at 4.55:1, one tweak away from failing).
// `colors.faint` reaches 3.70:1 here — past the 3:1 for large text and UI boundaries but still
// under the 4.5:1 body floor, so keep body-size `faint` out of the bottom ~25% of a SpaceBackdrop
// screen. Unlike before, this IS now fixable from this file if it ever needs to be: the ceiling is
// theme-owned `atmosphere.haze`, and at alpha 0.16 (down from 0.46) there is real headroom left.
const BLOOM_MID = 'rgba(20,80,96,0.10)';
const NEBULAE = [
  `radial-gradient(78% 52% at 76% 18%, ${atmosphere.hazeSoft} 0%, ${VOID_CLEAR} 72%)`,
  `radial-gradient(132% 80% at 50% 116%, ${atmosphere.haze} 0%, ${BLOOM_MID} 36%, ${VOID_CLEAR} 72%)`,
];
const BASE = `linear-gradient(180deg, ${atmosphere.void} 0%, ${atmosphere.deep} 42%, ${atmosphere.mid} 74%, ${atmosphere.horizon} 100%)`;

// Earlier layers paint on top in CSS, so stars sit above the nebulae, which sit above the base.
const webSky = {
  backgroundImage: [...STAR_LAYERS, ...NEBULAE, BASE].join(', '),
  backgroundSize: `${STAR_SIZES}, 100% 100%, 100% 100%, 100% 100%`,
  backgroundRepeat: 'repeat, repeat, repeat, repeat, no-repeat, no-repeat, no-repeat',
} as unknown as ViewStyle;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const nextStar = mulberry32(0x5d3a71);
const NATIVE_STARS = Array.from({ length: 36 }, () => ({
  top: nextStar() * 96, left: nextStar() * 98, size: 1 + nextStar() * 1.6, opacity: 0.2 + nextStar() * 0.55,
}));

export default function SpaceBackdrop({ style }: { style?: StyleProp<ViewStyle> }) {
  if (Platform.OS === 'web') return <View pointerEvents="none" style={[StyleSheet.absoluteFill, webSky, style]} />;
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
    <LinearGradient colors={[atmosphere.void, atmosphere.deep, atmosphere.mid, atmosphere.horizon]}
      locations={[0, 0.42, 0.74, 1]} style={StyleSheet.absoluteFill} />
    {NATIVE_STARS.map((star, index) => <View key={index} style={[styles.star, {
      top: (star.top + '%') as ViewStyle['top'], left: (star.left + '%') as ViewStyle['left'],
      width: star.size, height: star.size, opacity: star.opacity,
    }]} />)}
    {/* Bottom horizon bloom — the vertical stand-in for the web branch's `haze` radial, so the
        stops are tuned to land on the same flattened color at the screen's bottom edge rather than
        to match the web string literally: this last stop over `horizon` gives rgb(14.9,51.1,61.0)
        against the web radial's rgb(14.8,51.0,60.8). Keep the two in step when either moves.
        Discs are the wrong primitive here: a `borderRadius` larger than half the shorter side is
        clamped, so a wide, short "disc" paints as a stadium with a long flat top edge — three hard
        bands across the lower screen rather than a glow. A vertical gradient that starts fully
        transparent has no edge at all, which is what the effect actually needs. The clear stop
        repeats the bloom's own RGB: iOS interpolates un-premultiplied, so a differently-hued
        transparent stop would drag a muddy band through the middle of the ramp. */}
    <LinearGradient pointerEvents="none" colors={['rgba(34,152,148,0)', 'rgba(34,152,148,0.05)', 'rgba(34,152,148,0.13)']}
      locations={[0, 0.62, 1]} style={[StyleSheet.absoluteFill, styles.bloom]} />
  </View>;
}

/**
 * The large soft disc that sits behind the hero character. Kept here so the page sky and the
 * character halo share one set of atmosphere stops.
 */
/** Insets (as a fraction of the radius) of the concentric discs that stand in for the web branch's
 *  radial gradient on native. Each contributes the same low alpha, so they sum toward the centre
 *  and the outermost is faint enough to have no perceptible edge. */
const ORB_STEPS = [0, 0.13, 0.26, 0.39, 0.52];

export function AtmosphereOrb({ size, style }: { size: number; style?: StyleProp<ViewStyle> }) {
  const web = Platform.OS === 'web';
  return <View pointerEvents="none" style={[{ width: size, height: size }, style]}>
    {web
      ? <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }, { backgroundImage: `radial-gradient(circle at 50% 48%, ${alpha(colors.brand, 0.16)} 0%, ${alpha(colors.spark, 0.10)} 38%, rgba(24,60,120,0.06) 60%, ${VOID_CLEAR} 74%)` } as unknown as ViewStyle]} />
      : ORB_STEPS.map(inset => <View key={inset} style={{
          position: 'absolute', top: size * inset * 0.5, left: size * inset * 0.5,
          width: size * (1 - inset), height: size * (1 - inset), borderRadius: (size * (1 - inset)) / 2,
          backgroundColor: alpha(colors.brand, 0.034),
        }} />)}
    {/* Two rims, both drawn outside the web/native branch so the paths cannot drift apart here.
        The outer is neutral silver (`lineStrong`'s hue at a decorative alpha) — it reads as a lit
        planet edge rather than as a colour, which is the whole point of a rationed palette. The
        inner is a faint mint from the `accent` family, the only place the halo admits a hue at all,
        and it ties the stage back to the wordmark and the nav underline.
        Both are deliberately quiet: the character's own flare is the bright thing on this stage,
        and a loud halo behind it would read as two competing light sources. The five native alphas
        (0.034 each) composite to 1-0.966^5 = 0.16, matching the web radial's centre stop exactly —
        move one and recompute the other. */}
    <View style={[StyleSheet.absoluteFill, styles.orbRing, { borderRadius: size / 2 }]} />
    <View style={[styles.orbRing, {
      borderRadius: size / 2, borderColor: 'rgba(94,234,212,0.10)',
      top: size * 0.14, left: size * 0.14, right: size * 0.14, bottom: size * 0.14,
    }]} />
  </View>;
}

const styles = StyleSheet.create({
  // Stars are light, not hue: near-white with the faintest cool cast, matching the web layers.
  star: { position: 'absolute', borderRadius: 2, backgroundColor: '#FFFFFF' },
  bloom: { top: '48%' },
  orbRing: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(190,208,232,0.16)' },
});
