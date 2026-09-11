import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { COSMETICS, RARITY_COLORS, STAGES, type Cosmetic, type Equipment, type EvolutionStage } from '@vyra/core';
import HeroView from '../src/components/HeroShowcase';
import { Button, Copy, Heading, Notice, Pill, Screen, layout } from '../src/components/ui';
import { useApp } from '../src/state/AppProvider';
import { errorMessage } from '../src/lib/api';
import { colors, fonts, stageLabel } from '../src/theme';

export default function CollectionScreen() {
  const { profile, session, equip } = useApp();
  const [previewStage, setPreviewStage] = useState<EvolutionStage>(profile?.stage || 'starter');
  const [selected, setSelected] = useState<Cosmetic | null>(null);
  const [equipping, setEquipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  useEffect(() => { if (profile) setPreviewStage(profile.stage); }, [profile?.stage]);
  const stage = STAGES.find(item => item.id === previewStage)!;
  const earnedIndex = STAGES.findIndex(item => item.id === (profile?.stage || 'starter'));
  const previewIndex = STAGES.findIndex(item => item.id === previewStage);
  const previewEquipment: Equipment = { ...profile?.equipped, ...(selected ? { [selected.slot]: selected.id } : {}) };
  const owned = !!selected && !!profile?.ownedCosmetics.includes(selected.id);
  const equipped = !!selected && profile?.equipped[selected.slot] === selected.id;
  const apply = async () => {
    if (!selected || !owned) return;
    setEquipping(true); setError(null);
    try { await equip(selected.slot, selected.id); } catch (failure) { setError(errorMessage(failure)); } finally { setEquipping(false); }
  };
  return <Screen>
    <View style={layout.section}><Heading size={41}>A hero with your story.</Heading><Copy>Explore every evolution. Collect your favorites through real workouts, and make Vanguard your own.</Copy></View>
    <View style={[styles.showcase, width >= 850 && { flexDirection: 'row' }]}>
      <View style={[styles.viewer, width >= 850 && { flex: 1.2 }]}>
        <View style={styles.viewerGlow} />
        <HeroView stage={previewStage} equipment={previewEquipment} pose={selected?.slot === 'pose' ? 'flex' : 'idle'} active={!session.reducedMotion} style={styles.hero} />
        <View style={styles.previewTag}><Pill color={previewIndex > earnedIndex ? colors.gold : stage.color}>{previewIndex > earnedIndex ? 'Locked stage preview' : previewStage === profile?.stage ? 'Your current evolution' : 'Evolution preview'}</Pill></View>
        <View style={styles.viewerBottom}><Text style={styles.stageName}>{stage.name}</Text><Text style={styles.stageDescription}>{stage.description}</Text></View>
      </View>
      <View style={[styles.stageDetails, width >= 850 && { flex: 1 }]}>
        <Heading size={29}>Five stages. Your pace.</Heading>
        <Copy>Your earned evolution grows with XP and active days. A preview never changes your saved progress.</Copy>
        <View style={styles.stages}>{STAGES.map((item, index) => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: item.id === previewStage }} onPress={() => setPreviewStage(item.id)} style={[styles.stageRow, item.id === previewStage && { backgroundColor: '#294055', borderColor: item.color }]}>
          <View style={[styles.stageGem, { backgroundColor: item.color }]} /><View style={{ flex: 1, gap: 3 }}><Text style={styles.stageTitle}>{item.name}</Text><Text style={styles.stageRequirement}>{item.xp.toLocaleString()} XP{item.days ? ' + ' + item.days + ' active days' : ' to begin'}</Text></View><Text style={[styles.stageState, { color: item.color }]}>{index > earnedIndex ? 'Preview' : index === earnedIndex ? 'Current' : 'Earned'}</Text>
        </Pressable>)}</View>
      </View>
    </View>
    <View style={[layout.split, { marginTop: 35, marginBottom: 20 }]}><Heading size={29}>The collection</Heading><Text style={styles.collectionCount}>{profile?.ownedCosmetics.length || 0} / {COSMETICS.length} owned</Text></View>
    <View style={styles.cosmetics}>{COSMETICS.map(item => {
      const isOwned = !!profile?.ownedCosmetics.includes(item.id);
      const isEquipped = profile?.equipped[item.slot] === item.id;
      const color = RARITY_COLORS[item.rarity];
      return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.name + ', ' + item.rarity + ', ' + (isOwned ? 'owned' : 'locked') + '. Preview collectible.'} onPress={() => { setSelected(item); setError(null); }} style={[styles.cosmetic, width >= 850 ? { width: '18.7%' } : width >= 500 ? { width: '31.5%' } : { width: '47.7%' }, selected?.id === item.id && { borderColor: color, backgroundColor: '#253C50' }]}>
        <View style={[styles.itemArt, { backgroundColor: color + '15' }]}><CosmeticArt item={item} /><View style={[styles.rarityDot, { backgroundColor: color }]} /></View>
        <Text style={[styles.rarity, { color }]}>{stageLabel(item.rarity)}</Text><Text style={styles.itemName}>{item.name}</Text><Text style={styles.itemStatus}>{isEquipped ? 'Equipped' : isOwned ? 'Owned' : 'Locked'}</Text>
      </Pressable>;
    })}</View>
    {selected && <View style={styles.detail}>
      <View style={layout.split}><View style={{ gap: 6, flex: 1 }}><Pill color={RARITY_COLORS[selected.rarity]}>{stageLabel(selected.rarity)} {selected.slot}</Pill><Heading size={27}>{selected.name}</Heading></View><Button variant="quiet" onPress={() => setSelected(null)}>Close preview</Button></View>
      <Copy>{selected.description}</Copy><Text style={styles.requirement}>{selected.requirement}</Text>
      {error && <Notice title="Could not save your look">{error}</Notice>}
      <Button onPress={profile ? apply : () => router.push('/profile')} loading={equipping} disabled={!!profile && (!owned || equipped)}>{!profile ? 'Create a player to collect' : equipped ? 'Equipped' : owned ? 'Equip ' + selected.name : 'Keep training to unlock'}</Button>
      <Text style={styles.cosmeticNote}>Looks only. Collectibles never increase battle power.</Text>
    </View>}
  </Screen>;
}

function CosmeticArt({ item }: { item: Cosmetic }) {
  if (item.slot === 'outfit') return <View style={{ alignItems: 'center' }}><View style={[styles.suitShoulder, { backgroundColor: '#709CB5' }]} /><View style={[styles.suitBody, { backgroundColor: '#426C89' }]} /><View style={styles.suitCore} /></View>;
  if (item.slot === 'accessory') return <View style={{ flexDirection: 'row', gap: 12, transform: [{ rotate: '-15deg' }] }}><View style={[styles.bracer, { backgroundColor: item.color }]} /><View style={[styles.bracer, { backgroundColor: item.color }]} /></View>;
  if (item.slot === 'aura') return <View style={[styles.aura, { borderColor: item.color }]}><View style={[styles.auraInner, { borderColor: item.color }]} /></View>;
  if (item.slot === 'pose') return <View style={{ alignItems: 'center' }}><Text style={{ color: item.color, fontSize: 63, fontWeight: '800' }}>Ѱ</Text></View>;
  return <View style={[styles.skin, { backgroundColor: item.color }]}><View style={styles.skinHighlight} /></View>;
}
const styles = StyleSheet.create({
  showcase: { gap: 28 }, viewer: { height: 430, borderRadius: 28, backgroundColor: '#20354A', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  viewerGlow: { position: 'absolute', width: 285, height: 285, borderRadius: 150, backgroundColor: '#304A5D' },
  hero: { position: 'absolute', width: '100%', height: '100%' }, previewTag: { position: 'absolute', top: 20, left: 20 },
  viewerBottom: { position: 'absolute', bottom: 25, alignItems: 'center', gap: 7 },
  stageName: { fontFamily: fonts.display, color: colors.text, fontSize: 27, fontWeight: '700' }, stageDescription: { fontFamily: fonts.body, color: colors.muted, fontSize: 12 },
  stageDetails: { gap: 16 }, stages: { gap: 9 }, stageRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.line, gap: 13 },
  stageGem: { width: 17, height: 23, borderRadius: 5, transform: [{ rotate: '15deg' }] },
  stageTitle: { fontFamily: fonts.body, color: colors.text, fontWeight: '700', fontSize: 15 }, stageRequirement: { fontFamily: fonts.body, color: colors.muted, fontSize: 11 },
  stageState: { fontFamily: fonts.body, fontSize: 11, fontWeight: '600' }, collectionCount: { fontFamily: fonts.body, color: colors.muted, fontSize: 13 },
  cosmetics: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 }, cosmetic: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 18, padding: 13, gap: 8 },
  itemArt: { height: 112, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }, rarityDot: { width: 5, height: 5, borderRadius: 3, position: 'absolute', bottom: 10, right: 10 },
  rarity: { fontFamily: fonts.body, fontSize: 11, fontWeight: '600' }, itemName: { fontFamily: fonts.body, color: colors.text, fontSize: 15, fontWeight: '700' }, itemStatus: { fontFamily: fonts.body, color: colors.muted, fontSize: 11 },
  detail: { marginTop: 24, padding: 24, borderRadius: 22, backgroundColor: colors.surface, gap: 16 }, requirement: { fontFamily: fonts.body, color: colors.gold, fontSize: 14 },
  cosmeticNote: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, lineHeight: 20, textAlign: 'center' },
  suitShoulder: { width: 64, height: 20, borderRadius: 7 }, suitBody: { width: 38, height: 48, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, marginTop: -6 },
  suitCore: { position: 'absolute', top: 18, width: 12, height: 20, backgroundColor: colors.teal, borderRadius: 4 }, bracer: { width: 20, height: 43, borderRadius: 7, borderWidth: 3, borderColor: '#FFD2A7' },
  aura: { width: 70, height: 70, borderWidth: 3, borderRadius: 35, alignItems: 'center', justifyContent: 'center' }, auraInner: { width: 47, height: 47, borderWidth: 1, borderRadius: 24 },
  skin: { width: 51, height: 66, borderRadius: 19, transform: [{ rotate: '17deg' }] }, skinHighlight: { width: 15, height: 42, borderRadius: 8, backgroundColor: '#FFFFFF55', margin: 8 },
});
