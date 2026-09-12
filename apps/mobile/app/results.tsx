import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { COSMETICS, STAGES } from '@vyra/core';
import HeroView from '../src/components/HeroShowcase';
import { Button, Copy, Heading, Notice, Pill, Screen, Stat, layout } from '../src/components/ui';
import { useApp } from '../src/state/AppProvider';
import { colors, fonts, radii, stageLabel } from '../src/theme';

export default function ResultsScreen() {
  const { profile, session, snapshot, refreshProfile, resetMatch, rewardStatus, rewardError, retryRewardReceipt } = useApp();
  const { width } = useWindowDimensions();
  const receipt = profile ? snapshot?.rewards?.[profile.id] : undefined;
  const finished = snapshot?.phase === 'finished';
  const me = snapshot?.players.find(player => player.id === profile?.id);
  const won = finished && snapshot.winnerId === profile?.id;
  const draw = finished && !snapshot.winnerId;
  const stage = receipt?.stageAfter || profile?.stage || 'starter';
  const evolved = !!receipt && receipt.stageAfter !== receipt.stageBefore;
  const waitingForReceipt = finished && !receipt && rewardStatus === 'pending';
  const title = !finished ? 'You showed up.' : evolved ? 'Meet your next evolution.' : won ? 'That’s a victory.' : draw ? 'A worthy match.' : 'Every rep moves you forward.';
  const home = () => { resetMatch(); router.replace('/'); };
  if (!snapshot) return <Screen noNav><Notice title="No workout result yet" action={home} actionLabel="Back to my hero">Start and complete a workout to see your real results here.</Notice></Screen>;
  return <Screen noNav back={home}>
    <View style={[styles.columns, width >= 850 && { flexDirection: 'row', alignItems: 'center' }]}>
      <View style={{ flex: 1, gap: 21 }}>
        <Pill color={finished ? colors.teal : colors.coral}>{finished ? won ? 'Victory' : draw ? 'Draw' : 'Workout complete' : 'Workout stopped'}</Pill>
        <Heading size={width >= 850 ? 46 : 37}>{title}</Heading>
        <Copy>{!finished ? 'This session ended early. Your hero keeps the progress from your previously completed workouts.' : evolved ? 'Your consistent effort unlocked ' + stageLabel(stage) + '. This is what showing up looks like.' : 'You brought the effort. Your hero carries it forward.'}</Copy>
        <View style={styles.stats}><Stat value={me?.totalReps ?? 0} label="valid reps this workout" /><Stat value={receipt ? '+' + receipt.xp : '—'} label={receipt ? 'XP earned' : waitingForReceipt ? 'XP finalizing' : finished ? 'Receipt unavailable' : 'XP not awarded'} color={colors.teal} /></View>
        {finished && !receipt && <View style={{ gap: 10 }}>
          <Notice title={waitingForReceipt ? 'Retrieving your reward receipt' : 'Reward receipt unavailable'} tone={waitingForReceipt ? 'info' : 'warning'}>
            {waitingForReceipt ? 'Your workout is complete. This only retrieves the saved result; gameplay will not restart.' : rewardError || 'The reward receipt could not be retrieved. Retry the saved result when your connection is ready.'}
          </Notice>
          <Button variant="secondary" onPress={retryRewardReceipt} loading={waitingForReceipt}>Retry reward receipt</Button>
          <Button variant="quiet" onPress={() => refreshProfile().catch(() => undefined)}>Refresh saved profile</Button>
        </View>}
        {receipt && !receipt.qualified && <Notice title="A little more movement next time" tone="info">This workout did not meet the reward requirements. Your valid reps are shown above; no XP has been added.</Notice>}
        {receipt?.dailyLimitReached && <Notice title="Today’s XP limit is reached" tone="info">You can keep training, and your next daily reward window brings more XP to earn.</Notice>}
        {receipt && receipt.xp > 0 && <View style={styles.rewardRows}>
          <RewardLine name="Workout XP" value={receipt.matchXp} /><RewardLine name="Streak bonus" value={receipt.streakXp} /><RewardLine name="Weekly goal bonus" value={receipt.goalXp} />
        </View>}
        {!!receipt?.unlocked.length && <View style={styles.unlock}><Text style={styles.unlockTitle}>Added to your collection</Text>{receipt.unlocked.map(id => <Text style={styles.unlockName} key={id}>◇ {COSMETICS.find(item => item.id === id)?.name || id}</Text>)}</View>}
        <Button onPress={home}>Back to my hero</Button><Button variant="secondary" onPress={() => { resetMatch(); router.replace('/collection'); }}>Visit my collection</Button>
      </View>
      <View style={[styles.heroStage, width >= 850 && { flex: 1, height: 550 }]}>
        <View style={styles.glow} /><HeroView stage={stage} equipment={profile?.equipped} pose={finished ? 'victory' : 'idle'} active={!session.reducedMotion} style={styles.hero} />
        <View style={styles.stageCaption}><Pill color={STAGES.find(item => item.id === stage)?.color}>{stageLabel(stage)}</Pill><Text style={styles.stageCopy}>{evolved ? 'A new chapter, earned.' : 'Your effort lives here.'}</Text></View>
      </View>
    </View>
  </Screen>;
}
function RewardLine({ name, value }: { name: string; value: number }) {
  return <View style={layout.split}><Text style={styles.rewardName}>{name}</Text><Text style={styles.rewardValue}>+{value} XP</Text></View>;
}
const styles = StyleSheet.create({
  columns: { gap: 30 }, stats: { flexDirection: 'row', gap: 42, paddingVertical: 20, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line },
  rewardRows: { gap: 12 }, rewardName: { color: colors.muted, fontFamily: fonts.body, fontSize: 14 }, rewardValue: { color: colors.text, fontFamily: fonts.body, fontSize: 14, fontWeight: '600' },
  unlock: { padding: 20, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.line, borderRadius: radii.lg, gap: 13 }, unlockTitle: { color: colors.teal, fontFamily: fonts.body, fontWeight: '700', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.4 },
  unlockName: { color: colors.text, fontFamily: fonts.body, fontSize: 17, fontWeight: '600' },
  heroStage: { minHeight: 410, height: 430, alignItems: 'center', justifyContent: 'center' },
  glow: { width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(120,226,208,0.08)', position: 'absolute' },
  hero: { width: '100%', height: '100%', position: 'absolute' }, stageCaption: { position: 'absolute', bottom: 30, alignItems: 'center', gap: 12 },
  stageCopy: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
});
