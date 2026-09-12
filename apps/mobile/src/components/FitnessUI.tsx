import React from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CHARACTERS, FITNESS_GOALS, FITNESS_STAGES, fitnessProgress, type CharacterId, type EvolutionStage, type Profile } from '@vyra/core';
import { CHARACTER_ART } from '../lib/characterAssets';
import { Copy, Heading, Meter, Pill, Stat, layout } from './ui';
import { colors, fonts, radii } from '../theme';

/** Old saved Legendary profiles display the final stage of the current ladder. */
export function displayFitnessStage(stage?: EvolutionStage) {
  return FITNESS_STAGES.find(item => item.id === (stage === 'legendary' ? 'elite' : stage)) ?? FITNESS_STAGES[0];
}

export function CharacterPicker({ value, onChange, disabled = false }: {
  value: CharacterId; onChange: (id: CharacterId) => void; disabled?: boolean;
}) {
  return <View style={styles.characterGrid}>{CHARACTERS.map(character => <Pressable
    key={character.id}
    accessibilityRole="radio"
    accessibilityLabel={character.name}
    accessibilityState={{ checked: value === character.id, disabled }}
    disabled={disabled}
    onPress={() => onChange(character.id)}
    style={[styles.character, value === character.id && styles.selected]}
  >
    <Image source={CHARACTER_ART[character.id]} resizeMode="contain" style={styles.portrait} accessibilityIgnoresInvertColors />
    <Text style={styles.choiceTitle}>{character.name}</Text>
    <Text style={[styles.small, value === character.id && { color: colors.accent }]}>{value === character.id ? 'Selected' : 'Choose'}</Text>
  </Pressable>)}</View>;
}

export function Choice({ title, description, selected, onPress, disabled }: {
  title: string; description?: string; selected: boolean; onPress: () => void; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress} style={[styles.choice, selected && styles.selected]}>
    <View style={[styles.radio, selected && { borderColor: colors.accent }]}>{selected && <View style={styles.radioFill} />}</View>
    <View style={{ flex: 1, gap: 5 }}><Text style={styles.choiceTitle}>{title}</Text>{description && <Text style={styles.description}>{description}</Text>}</View>
  </Pressable>;
}

export function MeasurementField({ label, value, onChangeText, unit, editable = true, hint }: {
  label: string; value: string; onChangeText: (value: string) => void; unit: 'kg' | 'cm'; editable?: boolean; hint?: string;
}) {
  return <View style={{ flex: 1, minWidth: 140, gap: 7 }}>
    <Text style={styles.fieldLabel}>{label} ({unit})</Text>
    <TextInput accessibilityLabel={`${label} in ${unit === 'kg' ? 'kilograms' : 'centimeters'}`} value={value} onChangeText={onChangeText} keyboardType="decimal-pad" inputMode="decimal" editable={editable} maxLength={7} placeholder={unit === 'kg' ? 'e.g. 70' : 'e.g. 170'} placeholderTextColor={colors.faint} style={[layout.input, { borderColor: colors.lineControl }, !editable && { backgroundColor: colors.surface }]} />
    {hint && <Text style={styles.small}>{hint}</Text>}
  </View>;
}

export function FitnessProgressPanel({ profile, compact = false }: { profile: Profile; compact?: boolean }) {
  const plan = profile.fitness;
  if (!plan) return null;
  const progress = fitnessProgress(profile);
  const stage = displayFitnessStage(profile.stage);
  const next = progress.nextStage;
  const maintenance = plan.goal === 'maintain_weight';
  const percent = Math.round(progress.weightProgress * 100);
  return <View style={[layout.panel, { gap: 18 }]}>
    <View style={[layout.split, { flexWrap: 'wrap', gap: 12 }]}><Heading size={compact ? 24 : 28}>{next ? `Your path to ${next.name}` : 'Elite, earned.'}</Heading><Pill color={stage.color}>{stage.name}</Pill></View>
    <Text style={styles.description}>{FITNESS_GOALS.find(goal => goal.id === plan.goal)?.name}{maintenance ? ' · Maintain weight' : ''}</Text>
    {!compact && <View style={styles.metrics}>
      <Stat value={`${progress.latestWeightKg} kg`} label="latest weight" />
      <Stat value={`${progress.latestHeightCm} cm`} label="latest height" />
      <Stat value={`${plan.targetWeightKg} kg`} label={maintenance ? 'weight to maintain' : 'chosen target'} />
    </View>}
    <View style={{ gap: 8 }}>
      <View style={[layout.split, { gap: 12 }]}><Text style={styles.fieldLabel}>{maintenance ? 'Weight maintenance' : 'Progress toward your target'}</Text><Text style={styles.value}>{maintenance ? percent === 100 ? 'In range' : 'Outside range' : `${percent}%`}</Text></View>
      <Meter value={percent} max={100} label={maintenance ? 'Weight maintenance range' : 'Progress toward target weight'} color={colors.brand} />
      <Text style={styles.small}>{maintenance ? `Keep within 2% of ${plan.targetWeightKg} kg. Workout and follow-up requirements still apply.` : `${plan.startWeightKg} kg starting weight → ${plan.targetWeightKg} kg target. Your latest check-in sets this progress.`}</Text>
    </View>
    {next ? <View style={styles.gates}>
      <Gate label="Workout XP" value={`${profile.xp.toLocaleString()} / ${next.xp.toLocaleString()} XP`} done={profile.xp >= next.xp} />
      <Gate label="Active days" value={`${profile.activeDays} / ${next.days}`} done={profile.activeDays >= next.days} />
      <Gate label={maintenance ? 'Weight range' : 'Target milestone'} value={maintenance ? 'Within 2% of target' : `${Math.round(next.weightProgress * 100)}% of your target journey`} done={progress.weightProgress + 1e-8 >= next.weightProgress} />
      <Gate label="Follow-up check-in" value={progress.hasFollowUp ? 'Recorded after setup day' : 'Needed after setup day'} done={progress.hasFollowUp} />
    </View> : <Copy>Your final evolution is unlocked. Keep building your workout habit at your own pace.</Copy>}
    <Text style={styles.small}>{next ? 'Meet all requirements to evolve. ' : ''}Earned stages stay yours when measurements fluctuate. Weight is a goal metric, not a measure of muscle or fitness.</Text>
  </View>;
}

function Gate({ label, value, done }: { label: string; value: string; done: boolean }) {
  return <View style={styles.gate}>
    <Text accessibilityLabel={done ? 'Requirement met' : 'Requirement remaining'} style={[styles.gateMark, { color: done ? colors.accent : colors.muted }]}>{done ? '✓' : '○'}</Text>
    <View style={{ flex: 1, gap: 4 }}><Text style={styles.fieldLabel}>{label}</Text><Text style={styles.small}>{value}</Text></View>
  </View>;
}

export const fitnessStyles = StyleSheet.create({
  section: { gap: 18 }, fields: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  small: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, lineHeight: 20 },
  success: { fontFamily: fonts.body, fontSize: 14, color: colors.success, lineHeight: 22 },
});
const styles = StyleSheet.create({
  characterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  character: { flexGrow: 1, flexBasis: '29%', minWidth: 94, borderWidth: 1, borderColor: colors.lineControl, backgroundColor: colors.surface, borderRadius: radii.md, padding: 10, gap: 4, alignItems: 'center' },
  portrait: { height: 110, width: '100%' },
  selected: { borderColor: colors.accent, backgroundColor: colors.glassStrong },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 13, borderWidth: 1, borderColor: colors.lineControl, borderRadius: radii.md, padding: 16, minHeight: 54 },
  choiceTitle: { fontFamily: fonts.body, fontSize: 14, fontWeight: '600', color: colors.text },
  description: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, lineHeight: 22 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: colors.lineControl, alignItems: 'center', justifyContent: 'center' },
  radioFill: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  fieldLabel: { fontFamily: fonts.body, fontSize: 14, color: colors.text, lineHeight: 21 },
  small: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, lineHeight: 20 },
  value: { fontFamily: fonts.body, fontSize: 14, fontWeight: '600', color: colors.text },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 25 },
  gates: { gap: 13 }, gate: { flexDirection: 'row', gap: 11, alignItems: 'center' }, gateMark: { fontSize: 18, width: 20 },
});
