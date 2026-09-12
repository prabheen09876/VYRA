import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { atmosphere } from '../theme';

/**
 * Full-bleed deep-space atmosphere: a dark void up top fading into a blue horizon glow at the
 * bottom, with a fine starfield over it. Purely decorative and non-interactive — mount it as the
 * FIRST child of a screen's outer container so it paints behind the header and the scroller
 * (every react-native-web View is its own stacking context, so sibling order is the paint order
 * and a negative zIndex cannot push a later sibling behind an earlier one).
 *
 * Web draws the whole thing as tiled/positioned background gradients on ONE node — no per-star
 * elements, GPU-rasterized once, repaints only on resize. Native cannot tile a background
 * reliably, so it composes a LinearGradient base with a small, seeded set of dot views.
 */
const STAR_LAYERS = [
  'radial-gradient(circle at 18% 26%, rgba(255,255,255,0.95) 0px, rgba(255,255,255,0) 1.25px)',
  'radial-gradient(circle at 63% 71%, rgba(206,228,255,0.80) 0px, rgba(206,228,255,0) 1.10px)',
  'radial-gradient(circle at 41% 12%, rgba(255,255,255,0.50) 0px, rgba(255,255,255,0) 1.00px)',
  'radial-gradient(circle at 86% 44%, rgba(180,214,255,0.42) 0px, rgba(180,214,255,0) 0.90px)',
];
// Coprime-ish tile sizes so the repeat never resolves into a visible grid.
const STAR_SIZES = '167px 131px, 229px 197px, 97px 89px, 311px 283px';
const NEBULAE = [
  `radial-gradient(78% 52% at 76% 18%, ${atmosphere.hazeSoft} 0%, rgba(10,20,40,0) 72%)`,
  `radial-gradient(132% 80% at 50% 116%, ${atmosphere.haze} 0%, rgba(22,74,168,0.20) 36%, rgba(4,6,12,0) 72%)`,
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
    {/* Bottom horizon bloom. Discs are the wrong primitive here: a `borderRadius` larger than half
        the shorter side is clamped, so a wide, short "disc" paints as a stadium with a long flat
        top edge — three hard bands across the lower screen rather than a glow. A vertical gradient
        that starts fully transparent has no edge at all, which is what the effect actually needs. */}
    <LinearGradient pointerEvents="none" colors={['rgba(46,134,255,0)', 'rgba(58,148,255,0.10)', 'rgba(96,178,255,0.20)']}
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
      ? <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }, { backgroundImage: 'radial-gradient(circle at 50% 48%, rgba(120,190,255,0.26) 0%, rgba(58,132,240,0.16) 38%, rgba(32,92,196,0.07) 60%, rgba(4,8,20,0) 74%)' } as unknown as ViewStyle]} />
      : ORB_STEPS.map(inset => <View key={inset} style={{
          position: 'absolute', top: size * inset * 0.5, left: size * inset * 0.5,
          width: size * (1 - inset), height: size * (1 - inset), borderRadius: (size * (1 - inset)) / 2,
          backgroundColor: 'rgba(96,170,255,0.055)',
        }} />)}
    <View style={[StyleSheet.absoluteFill, styles.orbRing, { borderRadius: size / 2 }]} />
    <View style={[styles.orbRing, {
      borderRadius: size / 2, borderColor: 'rgba(126,205,255,0.10)',
      top: size * 0.14, left: size * 0.14, right: size * 0.14, bottom: size * 0.14,
    }]} />
  </View>;
}

const styles = StyleSheet.create({
  star: { position: 'absolute', borderRadius: 2, backgroundColor: '#FFFFFF' },
  bloom: { top: '48%' },
  orbRing: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(126,205,255,0.16)' },
});
