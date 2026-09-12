import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { CHECK_IN_INTERVAL_DAYS, fitnessProgress, validateBodyCheckIn } from '@vyra/core';
import { dayKey } from '@vyra/core/progression';
import { FitnessProgressPanel, MeasurementField, displayFitnessStage, fitnessStyles } from '../src/components/FitnessUI';
import { Button, Copy, Eyebrow, Heading, Loading, Notice, Pill, Screen, layout } from '../src/components/ui';
import { errorMessage } from '../src/lib/api';
import { useApp } from '../src/state/AppProvider';
import { colors, fonts } from '../src/theme';

const formatDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export default function CheckInScreen() {
  const { profile, booting, recordCheckIn, connectionError, refreshProfile } = useApp();
  const { width } = useWindowDimensions();
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [stageBeforeSave, setStageBeforeSave] = useState(displayFitnessStage(profile?.stage).id);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const plan = profile?.fitness;
  const latest = plan?.checkIns.at(-1);
  useEffect(() => { setWeight(String(latest?.weightKg ?? plan?.startWeightKg ?? '')); setHeight(String(latest?.heightCm ?? plan?.startHeightCm ?? '')); }, [profile?.id, latest?.at, plan?.startedAt]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const baselineDay = !!plan && dayKey(now) <= dayKey(plan.startedAt);
  const hasToday = latest?.day === dayKey(now);
  const save = async () => {
    if (saving || baselineDay) return;
    setError(null); setSaved(false);
    try {
      const input = { weightKg: Number(weight.trim().replace(',', '.')), heightCm: Number(height.trim().replace(',', '.')) };
      validateBodyCheckIn(input);
      setStageBeforeSave(displayFitnessStage(profile?.stage).id);
      setSaving(true);
      await recordCheckIn(input);
      setSaved(true); setNow(Date.now());
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setSaving(false); }
  };
  if (booting) return <Screen><Loading /></Screen>;
  if (!profile || !plan) return <Screen><Notice title="Save your starting plan first" action={() => router.replace(profile ? '/onboarding' : '/profile')} actionLabel={profile ? 'Set my goal' : 'Create player'}>A starting goal and measurements give your check-ins a baseline.</Notice></Screen>;
  const progress = fitnessProgress(profile, now);
  const savedStage = displayFitnessStage(profile.stage);
  const evolved = saved && savedStage.id !== stageBeforeSave;
  const suggestedDay = dayKey((latest?.at ?? plan.startedAt) + CHECK_IN_INTERVAL_DAYS * 86400000);
  return <Screen back={() => router.replace('/profile')}>
    <View style={layout.section}><Eyebrow>Check in with yourself</Eyebrow><Heading size={41}>Small updates. A longer story.</Heading><Copy>Record your latest measurements about once a week. Workouts and progress toward your chosen target unlock each evolution together.</Copy></View>
    {connectionError && <Notice title="Your profile is offline" action={() => refreshProfile().catch(() => undefined)}>{connectionError}</Notice>}
    <View style={[styles.columns, width >= 850 && { flexDirection: 'row', alignItems: 'flex-start' }]}>
      <View style={{ flex: 1, gap: 22 }}>
        <View style={layout.panel}>
          <View style={[layout.split, { gap: 12, flexWrap: 'wrap' }]}><Heading size={27}>{hasToday ? 'Update today’s check-in' : 'Your latest measurements'}</Heading><Pill color={progress.checkInDue ? colors.accent : colors.muted}>{progress.checkInDue ? 'Weekly check-in due' : 'At your pace'}</Pill></View>
          <Text style={fitnessStyles.small}>{baselineDay ? 'Your starting measurements are saved. Add your first follow-up from tomorrow; a weekly check-in is enough.' : hasToday ? 'Saving again updates today’s entry. It does not add another check-in or active day.' : `Next weekly check-in suggested ${formatDay(suggestedDay)}. You can also update your measurements today.`}</Text>
          <View style={fitnessStyles.fields}><MeasurementField label="Weight" unit="kg" value={weight} onChangeText={value => { setWeight(value); setSaved(false); }} editable={!saving && !baselineDay} /><MeasurementField label="Height" unit="cm" value={height} onChangeText={value => { setHeight(value); setSaved(false); }} editable={!saving && !baselineDay} /></View>
          {error && <View accessibilityLiveRegion="polite"><Notice title="Could not save your check-in">{error}</Notice></View>}
          {saved && <Text accessibilityLiveRegion="polite" style={fitnessStyles.success}>{evolved ? `Check-in saved. Evolved to ${savedStage.name}! Your new stage is unlocked for every character.` : 'Check-in saved. Your measurements and stage progress are up to date.'}</Text>}
          {evolved && <Button variant="secondary" onPress={() => router.push('/collection')}>See my {savedStage.name} character</Button>}
          <Button onPress={save} loading={saving} disabled={baselineDay}>{hasToday ? 'Update today’s check-in' : 'Save check-in'}</Button>
          <Text style={fitnessStyles.small}>One entry per day, with your most recent 90 kept here. Check-ins do not award workout XP.</Text>
        </View>
        <View style={layout.panel}><Heading size={26}>Your measurement history</Heading>
          <View style={styles.historyRow}><Text style={[styles.historyDate, styles.columnLabel]}>Date</Text><Text style={[styles.historyNumber, styles.columnLabel]}>Weight</Text><Text style={[styles.historyNumber, styles.columnLabel]}>Height</Text></View>
          {[...plan.checkIns].reverse().map(entry => <View key={entry.day} style={styles.historyRow}><Text style={styles.historyDate}>{formatDay(entry.day)}</Text><Text style={styles.historyNumber}>{entry.weightKg} kg</Text><Text style={styles.historyNumber}>{entry.heightCm} cm</Text></View>)}
          {!plan.checkIns.length && <Text style={fitnessStyles.small}>No follow-up check-ins yet. Your baseline is saved below.</Text>}
          <View style={[styles.historyRow, styles.baseline]}><View style={{ flex: 1 }}><Text style={styles.historyDate}>{formatDay(dayKey(plan.startedAt))}</Text><Text style={fitnessStyles.small}>Starting baseline</Text></View><Text style={styles.historyNumber}>{plan.startWeightKg} kg</Text><Text style={styles.historyNumber}>{plan.startHeightCm} cm</Text></View>
        </View>
      </View>
      <View style={{ flex: 1, gap: 18 }}><FitnessProgressPanel profile={profile} /><Button variant="secondary" onPress={() => router.push('/arena')}>Continue training</Button><Button variant="quiet" onPress={() => router.push('/collection')}>View my evolution</Button></View>
    </View>
  </Screen>;
}
const styles = StyleSheet.create({
  columns: { gap: 28 }, historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  historyDate: { flex: 1, fontFamily: fonts.body, color: colors.text, fontSize: 13, lineHeight: 20 },
  historyNumber: { width: 70, textAlign: 'right', fontFamily: fonts.body, color: colors.text, fontSize: 13 },
  columnLabel: { color: colors.muted, fontSize: 12 }, baseline: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 16 },
});
