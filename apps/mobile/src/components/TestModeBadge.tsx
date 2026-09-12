import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { alpha, colors, fonts, radii } from '../theme';
import { ARENA_TEST_MODE } from '../lib/testMode';

/** Renders nothing in a normal build. See src/lib/testMode.ts. */
export default function TestModeBadge() {
  if (!ARENA_TEST_MODE) return null;
  return <View style={styles.badge}><View style={styles.dot} /><Text style={styles.text}>TEST MODE — SIMULATED INPUT</Text></View>;
}
// Mint on a mint glass wash. This is a byte-for-byte twin of the badge in
// src/components/SimulatedCaptureSurface.tsx (same string, same metrics) and battle.tsx renders
// both on the same screen, so the hue has to stay in lockstep with that file: single `accent`
// throughout — fill, hairline, dot and label — or the two chips read as two different states.
//
// Why not one of the warm hues: both are already load-bearing on every screen that mounts this
// badge. `ember` is the page-identity Pill hue on arena/lobby/battle (it sits directly below this
// badge on all three), and `danger` is Notice's warning rail. `accent` is the brightest value in
// the palette and is unmistakably not an ordinary Pill, which defaults to `brand`.
//
// Contrast: the label is `accent` (L 0.65970) over the 12% accent wash flattened on `background`
// (rgb(16,32,30), L 0.01286) = 11.44:1, and still 9.12:1 in the worst case where Screen's
// atmosphere gradient is at full strength beneath it — far past 4.5:1 for 11px text. The solid
// `accent` hairline is 13.63:1 against `background`, past the 3:1 a boundary needs. Under Halo
// this pairing has a lot of headroom, so it is safe to darken the wash if it ever reads too loud.
const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: alpha(colors.accent, 0.12), borderWidth: 1, borderColor: colors.accent, marginBottom: 16 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  text: { fontFamily: fonts.body, color: colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
});
