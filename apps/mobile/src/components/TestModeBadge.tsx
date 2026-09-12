import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radii } from '../theme';
import { ARENA_TEST_MODE } from '../lib/testMode';

/** Renders nothing in a normal build. See src/lib/testMode.ts. */
export default function TestModeBadge() {
  if (!ARENA_TEST_MODE) return null;
  return <View style={styles.badge}><View style={styles.dot} /><Text style={styles.text}>TEST MODE — SIMULATED INPUT</Text></View>;
}
const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: 'rgba(255,209,123,0.12)', borderWidth: 1, borderColor: colors.gold, marginBottom: 16 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.gold },
  text: { fontFamily: fonts.body, color: colors.gold, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
});
