import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { COSMETICS, FITNESS_STAGES, RARITY_COLORS, characterFor, type CharacterId, type Cosmetic, type Equipment, type EvolutionStage } from '@vyra/core';
import HeroView from '../src/components/HeroShowcase';
import { CharacterPicker, displayFitnessStage, fitnessStyles } from '../src/components/FitnessUI';
import { Button, Copy, Heading, Notice, Pill, Screen, layout } from '../src/components/ui';
import { useApp } from '../src/state/AppProvider';
import { errorMessage } from '../src/lib/api';
import { alpha, colors, displayWeight, fonts, radii, stageLabel } from '../src/theme';

const collectibleName = (item: Cosmetic) => item.id === 'origin-suit' ? 'Original character look' : item.slot === 'aura' ? item.name : `${item.name} badge`;
const collectibleDescription = (item: Cosmetic) => item.id === 'origin-suit'
  ? 'Your selected character keeps its original outfit and appearance.'
  : item.slot === 'aura' ? item.description : 'An earned badge in your collection. This celebrates your milestone and does not change your character’s appearance.';

export default function CollectionScreen() {
  const { profile, session, equip, selectCharacter } = useApp();
  const earnedStage = displayFitnessStage(profile?.stage);
  const [previewStage, setPreviewStage] = useState<EvolutionStage>(earnedStage.id);
  const [characterId, setCharacterId] = useState<CharacterId>(characterFor(profile?.characterId).id);
  const [selecting, setSelecting] = useState(false);
  const [characterError, setCharacterError] = useState<string | null>(null);
  const characterPending = useRef(false);
  const [selected, setSelected] = useState<Cosmetic | null>(null);
  const [equipping, setEquipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  useEffect(() => { setPreviewStage(displayFitnessStage(profile?.stage).id); }, [profile?.id, profile?.stage]);
  useEffect(() => { if (profile) setCharacterId(characterFor(profile.characterId).id); }, [profile?.id, profile?.characterId]);
  const stage = displayFitnessStage(previewStage);
  const earnedIndex = FITNESS_STAGES.findIndex(item => item.id === earnedStage.id);
  const previewIndex = FITNESS_STAGES.findIndex(item => item.id === previewStage);
  const chooseCharacter = async (id: CharacterId) => {
    if (characterPending.current || id === characterId) return;
    setCharacterError(null);
    if (!profile) { setCharacterId(id); return; }
    characterPending.current = true; setSelecting(true);
    try { await selectCharacter(id); setCharacterId(id); }
    catch (failure) { setCharacterError(errorMessage(failure)); }
    finally { characterPending.current = false; setSelecting(false); }
  };
  const previewEquipment: Equipment = { ...profile?.equipped, ...(selected?.slot === 'aura' ? { aura: selected.id } : {}) };
  const owned = !!selected && !!profile?.ownedCosmetics.includes(selected.id);
  const equipped = !!selected && profile?.equipped[selected.slot] === selected.id;
  const apply = async () => {
    if (!selected || !owned || selected.slot !== 'aura') return;
    setEquipping(true); setError(null);
    try { await equip(selected.slot, selected.id); } catch (failure) { setError(errorMessage(failure)); } finally { setEquipping(false); }
  };
  return <Screen>
    <View style={layout.section}><Heading size={41}>A hero with your story.</Heading><Copy>Choose your character and explore four evolutions. Every character carries the same earned progress.</Copy></View>
    <View style={[styles.showcase, width >= 850 && { flexDirection: 'row' }]}>
      <View style={[styles.viewer, width >= 850 && { flex: 1.2 }]}>
        <View style={styles.modelStage}>
          <View style={styles.viewerGlow} />
          <HeroView characterId={characterId} stage={previewStage} equipment={previewEquipment} pose="idle" active={!session.reducedMotion} style={styles.hero} />
          {/* The caption below takes its natural height; this canvas receives the remaining space. */}
          <View style={styles.previewTag}><Pill color={previewIndex > earnedIndex ? colors.muted : stage.color}>{previewIndex > earnedIndex ? 'Locked stage preview' : previewStage === earnedStage.id ? 'Your current evolution' : 'Earned stage preview'}</Pill></View>
        </View>
        <View style={styles.viewerBottom}><Text style={styles.stageName}>{characterFor(characterId).name} · {stage.name}</Text><Text style={styles.stageDescription}>{stage.description}</Text></View>
      </View>
      <View style={[styles.stageDetails, width >= 850 && { flex: 1 }]}>
        <Heading size={29}>Four stages. Your pace.</Heading>
        <Copy>Workout XP, active days, and target progress earn your next stage. Previewing a stage never changes your saved evolution.</Copy>
        <View style={styles.stages}>{FITNESS_STAGES.map((item, index) => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: item.id === previewStage }} onPress={() => setPreviewStage(item.id)} style={[styles.stageRow, item.id === previewStage && { backgroundColor: colors.glassStrong, borderColor: item.color }]}>
          <View style={[styles.stageGem, { backgroundColor: item.color }]} /><View style={{ flex: 1, gap: 3 }}><Text style={styles.stageTitle}>{item.name}</Text><Text style={styles.stageRequirement}>{item.xp.toLocaleString()} XP{item.days ? ' + ' + item.days + (item.days === 1 ? ' active day' : ' active days') : ' to begin'}</Text>{item.id !== 'starter' && <Text style={styles.stageRequirement}>{profile?.fitness?.goal === 'maintain_weight' ? 'Within 2% of target weight' : `${Math.round(item.weightProgress * 100)}% toward target weight`} + a later-day check-in</Text>}</View><Text style={[styles.stageState, { color: item.color }]}>{index > earnedIndex ? 'Preview' : index === earnedIndex ? 'Current' : 'Earned'}</Text>
        </Pressable>)}</View>
        {previewStage !== earnedStage.id && <Button variant="quiet" onPress={() => setPreviewStage(earnedStage.id)}>Show my earned stage</Button>}
      </View>
    </View>
    <View style={{ gap: 18, marginTop: 32 }}><Heading size={29}>Choose your character</Heading><Copy>{profile ? 'Selecting a character saves it across your profile, home, and workout results. Your earned stage stays the same.' : 'Explore the six characters, then create a player to save your choice.'}</Copy><CharacterPicker value={characterId} onChange={id => void chooseCharacter(id)} disabled={selecting} />
      {selecting && <Text accessibilityLiveRegion="polite" style={fitnessStyles.small}>Saving your character…</Text>}
      {characterError && <View accessibilityLiveRegion="polite"><Notice title="Could not save your character">{characterError} Your previous character is still selected. Choose a character to try again.</Notice></View>}
      {!profile && <Button onPress={() => router.push('/profile')}>Create a player</Button>}
    </View>
    <View style={[layout.split, { marginTop: 35, marginBottom: 20 }]}><Heading size={29}>The collection</Heading><Text style={styles.collectionCount}>{profile?.ownedCosmetics.length || 0} / {COSMETICS.length} owned</Text></View>
    <Copy style={{ marginBottom: 20 }}>Collectible badges celebrate your milestones. Nova aura also adds a visible glow to your character.</Copy>
    <View style={styles.cosmetics}>{COSMETICS.map(item => {
      const isOwned = !!profile?.ownedCosmetics.includes(item.id);
      const isEquipped = item.slot === 'aura' && profile?.equipped[item.slot] === item.id;
      const color = RARITY_COLORS[item.rarity];
      return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={collectibleName(item) + ', ' + item.rarity + ', ' + (isOwned ? 'owned' : 'locked') + (item.slot === 'aura' ? '. Preview aura.' : '. View collectible details.')} onPress={() => { setSelected(item); setError(null); }} style={[styles.cosmetic, width >= 850 ? { width: '18.7%' } : width >= 500 ? { width: '31.5%' } : { width: '47.7%' }, selected?.id === item.id && { borderColor: color, backgroundColor: colors.glassStrong }]}>
        <View style={[styles.itemArt, { backgroundColor: alpha(color, 0.08) }]}><CosmeticArt item={item} /><View style={[styles.rarityDot, { backgroundColor: color }]} /></View>
        <Text style={[styles.rarity, { color }]}>{stageLabel(item.rarity)}</Text><Text style={styles.itemName}>{collectibleName(item)}</Text><Text style={styles.itemStatus}>{isEquipped ? 'Equipped' : item.id === 'origin-suit' ? 'Original look' : isOwned ? 'Earned' : 'Locked'}</Text>
      </Pressable>;
    })}</View>
    {selected && <View style={styles.detail}>
      <View style={[layout.split, { flexWrap: 'wrap', gap: 12 }]}><View style={{ gap: 6, flex: 1, minWidth: 190 }}><Pill color={RARITY_COLORS[selected.rarity]}>{stageLabel(selected.rarity)} {selected.slot === 'aura' ? 'aura' : selected.id === 'origin-suit' ? 'look' : 'badge'}</Pill><Heading size={27}>{collectibleName(selected)}</Heading></View><Button variant="quiet" onPress={() => setSelected(null)}>{selected.slot === 'aura' ? 'Close preview' : 'Close details'}</Button></View>
      <Copy>{collectibleDescription(selected)}</Copy><Text style={styles.requirement}>{selected.requirement}</Text>
      {error && <Notice title="Could not save your look">{error}</Notice>}
      {selected.slot === 'aura' ? <Button onPress={profile ? apply : () => router.push('/profile')} loading={equipping} disabled={!!profile && (!owned || equipped)}>{!profile ? 'Create a player to collect' : equipped ? 'Equipped' : owned ? 'Equip ' + selected.name : 'Keep training to unlock'}</Button> : !profile ? <Button onPress={() => router.push('/profile')}>Create a player to collect</Button> : selected.id !== 'origin-suit' && <Pill color={owned ? colors.accent : colors.muted}>{owned ? 'Badge earned' : 'Keep training to earn this badge'}</Pill>}
      <Text style={styles.cosmeticNote}>Looks only. Collectibles never increase battle power.</Text>
    </View>}
  </Screen>;
}

function CosmeticArt({ item }: { item: Cosmetic }) {
  // Both suit planes are derived from item.color so the card tracks the catalog swatch instead of
  // a hard-coded pair that stayed put no matter what COSMETICS said. The torso is the same hue
  // held back to 62% over the dark art panel, which reproduces the lit-shoulder / shadowed-body
  // relationship from one catalog value rather than two hand-picked ones.
  if (item.slot === 'outfit') return <View style={{ alignItems: 'center' }}><View style={[styles.suitShoulder, { backgroundColor: item.color }]} /><View style={[styles.suitBody, { backgroundColor: alpha(item.color, 0.62) }]} /><View style={styles.suitCore} /></View>;
  if (item.slot === 'accessory') return <View style={{ flexDirection: 'row', gap: 12, transform: [{ rotate: '-15deg' }] }}><View style={[styles.bracer, { backgroundColor: item.color }]} /><View style={[styles.bracer, { backgroundColor: item.color }]} /></View>;
  if (item.slot === 'aura') return <View style={[styles.aura, { borderColor: item.color }]}><View style={[styles.auraInner, { borderColor: item.color }]} /></View>;
  if (item.slot === 'pose') return <View style={{ alignItems: 'center' }}><Text style={{ color: item.color, fontSize: 63, fontWeight: '800' }}>Ѱ</Text></View>;
  return <View style={[styles.skin, { backgroundColor: item.color }]}><View style={styles.skinHighlight} /></View>;
}
const styles = StyleSheet.create({
  showcase: { gap: 28 }, viewer: { height: 430, borderRadius: radii.xl, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  modelStage: { flex: 1, minHeight: 0, width: '100%', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  // Orchid halo behind the 3D preview, matching the Nocturne atmosphere haze and the key light in
  // HeroView.shared.tsx, so the wash under the hero belongs to the same sky as the page.
  viewerGlow: { position: 'absolute', width: 285, height: 285, borderRadius: 150, backgroundColor: alpha(colors.brand, 0.12) },
  hero: { position: 'absolute', width: '100%', height: '100%' }, previewTag: { position: 'absolute', top: 20, left: 20 },
  viewerBottom: { alignSelf: 'stretch', flexShrink: 0, alignItems: 'center', gap: 7, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 25 },
  stageName: { width: '100%', textAlign: 'center', fontFamily: fonts.display, color: colors.text, fontSize: 27, lineHeight: 34, fontWeight: displayWeight.heavy }, stageDescription: { width: '100%', textAlign: 'center', fontFamily: fonts.body, color: colors.muted, fontSize: 12, lineHeight: 18 },
  // These rows are accessibilityRole="radio": when unchecked the border is the only thing marking
  // the control, so it uses `lineControl` (3.26:1 over background) rather than the decorative
  // `line` (1.4:1). A checked row overrides it with the stage color inline.
  stageDetails: { gap: 16 }, stages: { gap: 9 }, stageRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: radii.md, borderWidth: 1, borderColor: colors.lineControl, gap: 13 },
  stageGem: { width: 17, height: 23, borderRadius: 5, transform: [{ rotate: '15deg' }] },
  stageTitle: { fontFamily: fonts.body, color: colors.text, fontWeight: '700', fontSize: 15 }, stageRequirement: { fontFamily: fonts.body, color: colors.muted, fontSize: 11 },
  stageState: { fontFamily: fonts.body, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }, collectionCount: { fontFamily: fonts.body, color: colors.muted, fontSize: 13 },
  cosmetics: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 }, cosmetic: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.glass, borderRadius: radii.lg, padding: 13, gap: 8 },
  itemArt: { height: 112, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }, rarityDot: { width: 5, height: 5, borderRadius: 3, position: 'absolute', bottom: 10, right: 10 },
  rarity: { fontFamily: fonts.body, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }, itemName: { fontFamily: fonts.body, color: colors.text, fontSize: 15, fontWeight: '700' }, itemStatus: { fontFamily: fonts.body, color: colors.muted, fontSize: 11 },
  // The unlock condition is a locked-state hint, so it is desaturated (4.94:1 on the glass panel)
  // and sits a step below the muted description — never a warm "warning" hue. Matches role.locked.
  detail: { marginTop: 24, padding: 26, borderRadius: radii.xl, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.line, gap: 16 }, requirement: { fontFamily: fonts.body, color: colors.faint, fontSize: 14 },
  cosmeticNote: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, lineHeight: 20, textAlign: 'center' },
  suitShoulder: { width: 64, height: 20, borderRadius: 7 }, suitBody: { width: 38, height: 48, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, marginTop: -6 },
  // Chest core reads as the suit's power source, so it takes the brand orchid against the muted
  // violet of the suit itself. The bracer rim is a neutral lavender-white highlight rather than a
  // tinted one, because it has to sit over whatever item.color the accessory carries from the
  // catalog (today pulse-bracers' ember) instead of one specific fill.
  suitCore: { position: 'absolute', top: 18, width: 12, height: 20, backgroundColor: colors.brand, borderRadius: 4 }, bracer: { width: 20, height: 43, borderRadius: 7, borderWidth: 3, borderColor: colors.text },
  aura: { width: 70, height: 70, borderWidth: 3, borderRadius: 35, alignItems: 'center', justifyContent: 'center' }, auraInner: { width: 47, height: 47, borderWidth: 1, borderRadius: 24 },
  // Specular streak on the skin swatch — the lavender-white of `text` at a third opacity rather
  // than an 8-digit hex, so it picks up the same cast as the rest of the palette.
  skin: { width: 51, height: 66, borderRadius: 19, transform: [{ rotate: '17deg' }] }, skinHighlight: { width: 15, height: 42, borderRadius: 8, backgroundColor: alpha(colors.text, 0.33), margin: 8 },
});
