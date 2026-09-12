import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { DEFAULT_CHARACTER_ID, FITNESS_GOALS, STARTING_BUILDS, characterFor, validateFitnessSetup, type CharacterId, type FitnessGoal, type FitnessSetupInput, type StartingBuild } from '@vyra/core';
import HeroShowcase from '../src/components/HeroShowcase';
import { CharacterPicker, Choice, MeasurementField, fitnessStyles } from '../src/components/FitnessUI';
import { Button, Copy, Eyebrow, Heading, Loading, Notice, Pill, Screen, layout } from '../src/components/ui';
import { errorMessage } from '../src/lib/api';
import { useApp } from '../src/state/AppProvider';
import { colors, radii } from '../src/theme';

export default function OnboardingScreen() {
  const { profile, session, booting, setupFitness, connectionError, refreshProfile } = useApp();
  const { width } = useWindowDimensions();
  const [goal, setGoal] = useState<FitnessGoal | null>(null);
  const [startingBuild, setStartingBuild] = useState<StartingBuild | null>(null);
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [targetWeight, setTargetWeight] = useState('');
  const [characterId, setCharacterId] = useState<CharacterId>(profile?.characterId ?? DEFAULT_CHARACTER_ID);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (profile) setCharacterId(characterFor(profile.characterId).id); }, [profile?.id, profile?.characterId]);
  const save = async () => {
    if (saving) return;
    setError(null);
    try {
      if (!goal) throw new Error('Choose a fitness goal.');
      if (!startingBuild) throw new Error('Choose your starting build, or prefer not to say.');
      const input: FitnessSetupInput = {
        goal, startingBuild, characterId,
        heightCm: Number(height.trim().replace(',', '.')),
        weightKg: Number(weight.trim().replace(',', '.')),
        targetWeightKg: Number((goal === 'maintain_weight' ? weight : targetWeight).trim().replace(',', '.')),
      };
      validateFitnessSetup(input);
      setSaving(true);
      await setupFitness(input);
      router.replace('/');
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setSaving(false); }
  };
  if (booting) return <Screen noNav><Loading /></Screen>;
  if (!profile) return <Screen noNav><Notice title="Create your player first" action={() => router.replace('/profile')} actionLabel="Create player">Connect a player to save your goal, measurements, and character.</Notice></Screen>;
  if (profile.fitness) return <Screen><View style={layout.section}><Heading>Your journey is set.</Heading><Copy>Your starting plan is saved. Record a check-in to update measurements, or choose another character with the same earned progress.</Copy></View><View style={{ gap: 14 }}><Button onPress={() => router.replace('/check-in')}>Open check-in</Button><Button variant="secondary" onPress={() => router.replace('/collection')}>Choose a character</Button><Button variant="quiet" onPress={() => router.replace('/')}>Back to my hero</Button></View></Screen>;
  return <Screen noNav>
    <View style={layout.section}><Eyebrow>Your starting point</Eyebrow><Heading size={width >= 850 ? 46 : 36}>Your goal. Your character.</Heading><Copy>Choose where you want to go. Workouts and progress toward your target unlock four stages, from Starter to Elite.</Copy></View>
    {connectionError && <Notice title="Your profile is offline" action={() => refreshProfile().catch(() => undefined)}>{connectionError}</Notice>}
    <View style={[styles.columns, width >= 850 && { flexDirection: 'row', alignItems: 'flex-start' }]}>
      <View style={{ flex: 1.15, gap: 28 }}>
        <View style={fitnessStyles.section}><Heading size={26}>1. Choose your goal</Heading>{FITNESS_GOALS.map(item => <Choice key={item.id} title={item.id === 'maintain_weight' ? 'Build strength / maintain weight' : item.name} description={item.description} selected={goal === item.id} onPress={() => setGoal(item.id)} disabled={saving} />)}</View>
        <View style={fitnessStyles.section}><Heading size={26}>2. Describe your starting build</Heading><Text style={fitnessStyles.small}>Your own description. It does not change your starting stage or judge your body.</Text>{STARTING_BUILDS.map(item => <Choice key={item.id} title={item.name} selected={startingBuild === item.id} onPress={() => setStartingBuild(item.id)} disabled={saving} />)}</View>
        <View style={fitnessStyles.section}><Heading size={26}>3. Save your starting measurements</Heading><View style={fitnessStyles.fields}><MeasurementField label="Current weight" unit="kg" value={weight} onChangeText={setWeight} editable={!saving} /><MeasurementField label="Height" unit="cm" value={height} onChangeText={setHeight} editable={!saving} /></View>
          <MeasurementField label={goal === 'maintain_weight' ? 'Weight to maintain' : 'Target weight'} unit="kg" value={goal === 'maintain_weight' ? weight : targetWeight} onChangeText={setTargetWeight} editable={!saving && goal !== 'maintain_weight'} hint={goal === 'maintain_weight' ? 'Your current weight becomes your target. Staying within 2% meets the weight requirement.' : 'Choose your own target. VYRA does not infer a target from your height or starting build.'} />
        </View>
      </View>
      <View style={{ flex: 1, gap: 20 }}>
        <View style={fitnessStyles.section}><Heading size={26}>4. Choose your character</Heading><Copy>All six characters share your progress. You can switch anytime.</Copy></View>
        <View style={styles.preview}><HeroShowcase characterId={characterId} stage="starter" active={!session.reducedMotion} style={StyleSheet.absoluteFill} /><View style={styles.previewLabel}><Pill>Starter · {characterFor(characterId).name}</Pill></View></View>
        <CharacterPicker value={characterId} onChange={setCharacterId} disabled={saving} />
        <View style={layout.panel}><Heading size={24}>Start with what you have.</Heading><Copy>{profile.xp > 0 ? `Your ${profile.xp.toLocaleString()} saved XP and earned progress stay with you. ` : 'Your new character begins at Starter. '}These measurements are your baseline. A follow-up from a later day, workout XP, active days, and your target milestones earn each next stage.</Copy><Text style={fitnessStyles.small}>A weekly check-in is enough. Earned stages stay unlocked if your weight changes. Your character is a game reward, not a prediction of your body.</Text></View>
      </View>
    </View>
    <View style={styles.submit}>
      {error && <View accessibilityLiveRegion="polite"><Notice title="Could not save your starting plan">{error}</Notice></View>}
      <Text style={fitnessStyles.small}>This saves your starting plan once. You can update measurements through check-ins and change your character later.</Text>
      <Button onPress={save} loading={saving}>Save my goal & start</Button>
      <Button variant="quiet" onPress={() => router.push('/profile')} disabled={saving}>Connection settings</Button>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  columns: { gap: 36 }, preview: { height: 345, backgroundColor: colors.glass, borderColor: colors.line, borderWidth: 1, borderRadius: radii.xl, overflow: 'hidden' },
  previewLabel: { position: 'absolute', top: 16, left: 16 }, submit: { gap: 15, marginTop: 32, maxWidth: 600 },
});
