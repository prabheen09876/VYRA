import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { MUSCLE_GROUPS, MUSCLE_GROUP_LABELS, type CatalogExercise, type MuscleGroup } from '@vyra/core';
import { Button, Copy, Heading, Loading, Notice, Pill, Screen, layout } from '../src/components/ui';
import { useApp } from '../src/state/AppProvider';
import { errorMessage, request } from '../src/lib/api';
import { alpha, colors, fonts, radii } from '../src/theme';

type Filter = MuscleGroup | 'all';

/** Split the scraper's plain-text instructions into paragraph lines, marking "- " bullet lines. */
function lines(text: string): { text: string; bullet: boolean }[] {
  return text.split('\n').map(line => line.trim()).filter(Boolean).map(line =>
    line.startsWith('- ') ? { text: line.slice(2), bullet: true } : { text: line, bullet: false });
}

function Instructions({ label, body }: { label: string; body: string }) {
  return <View style={styles.instruction}>
    <Text style={styles.instructionLabel}>{label}</Text>
    {lines(body).map((line, index) => <View key={index} style={styles.instructionLine}>
      {line.bullet && <View style={styles.bulletDot} />}
      <Text style={[styles.instructionText, line.bullet && { flex: 1 }]}>{line.text}</Text>
    </View>)}
  </View>;
}

function ExerciseArt({ exercise, apiUrl, height }: { exercise: CatalogExercise; apiUrl: string; height: number }) {
  const [failed, setFailed] = useState(false);
  if (!exercise.image || failed) {
    return <View style={[styles.art, styles.artFallback, { height }]}>
      <Text style={styles.artFallbackMark}>{MUSCLE_GROUP_LABELS[exercise.primaryMuscles[0]]?.slice(0, 2).toUpperCase() ?? '—'}</Text>
    </View>;
  }
  return <View style={[styles.art, { height }]}>
    <Image accessible accessibilityLabel={`${exercise.name} illustration`} source={{ uri: `${apiUrl}${exercise.image}` }}
      onError={() => setFailed(true)} resizeMode="contain" style={styles.artImage} />
  </View>;
}

export default function ExercisesScreen() {
  const { session } = useApp();
  const params = useLocalSearchParams<{ slug?: string }>();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [all, setAll] = useState<CatalogExercise[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<CatalogExercise | null>(null);
  const consumedSlug = useRef<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await request<CatalogExercise[]>(session.apiUrl, '/api/exercises');
      setAll(Array.isArray(data) ? data : []);
    } catch (failure) { setError(errorMessage(failure)); }
  }, [session.apiUrl]);
  useEffect(() => { setAll(null); void load(); }, [load]);

  // A Coach card (or any deep link) may arrive with ?slug=…; open that exercise's how-to once loaded.
  useEffect(() => {
    if (!all) return;
    const slug = typeof params.slug === 'string' ? params.slug : undefined;
    if (!slug || consumedSlug.current === slug) return;
    const match = all.find(exercise => exercise.slug === slug);
    if (match) { consumedSlug.current = slug; setSelected(match); }
  }, [all, params.slug]);

  const counts = useMemo(() => {
    const map = new Map<MuscleGroup, number>();
    for (const group of MUSCLE_GROUPS) map.set(group, (all ?? []).filter(e => e.primaryMuscles.includes(group)).length);
    return map;
  }, [all]);
  const visible = useMemo(() =>
    !all ? [] : filter === 'all' ? all : all.filter(e => e.primaryMuscles.includes(filter)), [all, filter]);

  const cardWidth = width >= 900 ? '31.6%' : width >= 560 ? '47.8%' : '100%';
  const dialogWide = width >= 760;
  const dialogHeight = Math.max(280, height - insets.top - insets.bottom - 32);
  const detailArtHeight = dialogWide ? 300 : Math.min(280, Math.max(200, height * 0.32));

  return <Screen>
    <View style={layout.section}>
      <Heading size={41}>Exercise library.</Heading>
      <Copy>Every movement is illustrated with its target muscles, equipment, and step-by-step form. Ask your Coach for “leg”, “tricep”, or “shoulder” exercises and it draws from this same library.</Copy>
    </View>

    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} style={styles.filterScroll}>
      <FilterChip label="All" count={all?.length} active={filter === 'all'} onPress={() => setFilter('all')} />
      {MUSCLE_GROUPS.map(group => <FilterChip key={group} label={MUSCLE_GROUP_LABELS[group]} count={counts.get(group)} active={filter === group} onPress={() => setFilter(group)} />)}
    </ScrollView>

    {error && !all && <Notice title="Could not load the exercise library" action={() => void load()}>{error}</Notice>}
    {!all && !error && <Loading text="Loading exercises…" />}

    {all && <>
      <Text style={styles.resultCount}>{visible.length} {visible.length === 1 ? 'exercise' : 'exercises'}{filter !== 'all' ? ` · ${MUSCLE_GROUP_LABELS[filter]}` : ''}</Text>
      <View style={styles.grid}>{visible.map(exercise => <Pressable key={exercise.slug} accessibilityRole="button"
        accessibilityLabel={`${exercise.name}. ${exercise.subtitle}. Open details.`} onPress={() => setSelected(exercise)}
        style={[styles.card, { width: cardWidth }]}>
        <ExerciseArt exercise={exercise} apiUrl={session.apiUrl} height={150} />
        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={2}>{exercise.name}</Text>
          <View style={styles.pillRow}>{exercise.primaryMuscles.map(group => <Pill key={group}>{MUSCLE_GROUP_LABELS[group]}</Pill>)}</View>
          {!!exercise.equipment.length && <Text style={styles.cardEquipment} numberOfLines={1}>{exercise.equipment.join(' · ')}</Text>}
        </View>
      </Pressable>)}</View>
    </>}

    <Modal visible={!!selected} transparent animationType={session.reducedMotion ? 'none' : 'fade'} onRequestClose={() => setSelected(null)} presentationStyle="overFullScreen">
      <View style={[styles.modalBackdrop, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16, paddingHorizontal: width < 500 ? 12 : 24 }]}>
        {selected && <View accessibilityViewIsModal style={[styles.modalFrame, { maxHeight: dialogHeight }]}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
              <Text style={styles.modalEyebrow}>{selected.primaryMuscles.map(g => MUSCLE_GROUP_LABELS[g]).join(' · ')}</Text>
              <Heading size={dialogWide ? 30 : 24}>{selected.name}</Heading>
            </View>
            <Button variant="quiet" onPress={() => setSelected(null)} accessibilityLabel="Close exercise details" style={styles.closeButton}>Close</Button>
          </View>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <View style={[styles.modalColumns, dialogWide && { flexDirection: 'row', alignItems: 'flex-start' }]}>
              <View style={[dialogWide ? { flex: 1 } : undefined]}>
                <ExerciseArt exercise={selected} apiUrl={session.apiUrl} height={detailArtHeight} />
              </View>
              <View style={[styles.modalDetails, dialogWide && { flex: 1.05 }]}>
                <Copy muted={false}>{selected.subtitle}</Copy>
                <View style={styles.pillRow}>
                  {selected.primaryMuscles.map(g => <Pill key={`p-${g}`}>{MUSCLE_GROUP_LABELS[g]}</Pill>)}
                  {selected.secondaryMuscles.map(g => <Pill key={`s-${g}`} color={colors.muted}>{MUSCLE_GROUP_LABELS[g]}</Pill>)}
                </View>
                {!!selected.equipment.length && <View style={styles.equipmentBlock}>
                  <Text style={styles.instructionLabel}>Equipment</Text>
                  <Text style={styles.instructionText}>{selected.equipment.join(' · ')}</Text>
                </View>}
              </View>
            </View>
            <Instructions label="Starting position" body={selected.startingPosition} />
            <Instructions label="Execution" body={selected.execution} />
            <Text style={styles.attribution}>Source: simplyfitness.com</Text>
          </ScrollView>
        </View>}
      </View>
    </Modal>
  </Screen>;
}

function FilterChip({ label, count, active, onPress }: { label: string; count?: number; active: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress}
    style={[styles.chip, active && styles.chipActive]}>
    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    {typeof count === 'number' && <Text style={[styles.chipCount, active && styles.chipTextActive]}>{count}</Text>}
  </Pressable>;
}

const styles = StyleSheet.create({
  filterScroll: { marginBottom: 18, overflow: 'visible' },
  filterRow: { flexDirection: 'row', gap: 9, paddingRight: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 40, paddingHorizontal: 15, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.lineControl, backgroundColor: colors.glass },
  chipActive: { borderColor: colors.brand, backgroundColor: colors.glassStrong },
  chipText: { fontFamily: fonts.body, fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  chipTextActive: { color: colors.text },
  chipCount: { fontFamily: fonts.body, fontSize: 11, fontWeight: '700', color: colors.faint },
  resultCount: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  card: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.glass, borderRadius: radii.lg, overflow: 'hidden' },
  art: { width: '100%', backgroundColor: alpha(colors.brand, 0.05), alignItems: 'center', justifyContent: 'center' },
  artImage: { width: '100%', height: '100%' },
  artFallback: { backgroundColor: colors.glassStrong },
  artFallbackMark: { fontFamily: fonts.display, fontSize: 34, fontWeight: '600', color: colors.faint, letterSpacing: 1 },
  cardBody: { padding: 15, gap: 10 },
  cardName: { fontFamily: fonts.body, fontSize: 15, fontWeight: '700', color: colors.text, lineHeight: 21 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  cardEquipment: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(2,4,8,0.88)', justifyContent: 'center', alignItems: 'center' },
  modalFrame: { width: '100%', maxWidth: 900, backgroundColor: colors.backgroundElevated, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.lineStrong, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, borderBottomWidth: 1, borderBottomColor: colors.line, flexShrink: 0 },
  modalEyebrow: { fontFamily: fonts.body, color: colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' },
  closeButton: { flexShrink: 0 },
  modalScroll: { flexShrink: 1 }, modalBody: { padding: 18, gap: 22 }, modalColumns: { gap: 20 },
  modalDetails: { gap: 16, minWidth: 0 },
  equipmentBlock: { gap: 6 },
  instruction: { gap: 8 },
  instructionLabel: { fontFamily: fonts.body, color: colors.accent, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2 },
  instructionLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bulletDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.brand, marginTop: 8 },
  instructionText: { fontFamily: fonts.body, color: colors.text, fontSize: 14, lineHeight: 23 },
  attribution: { fontFamily: fonts.body, color: colors.faint, fontSize: 11, marginTop: 4 },
});
