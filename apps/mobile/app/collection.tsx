import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { COSMETICS, FITNESS_STAGES, RARITY_COLORS, characterFor, type CharacterId, type Cosmetic, type Equipment, type EvolutionStage, type Profile } from '@vyra/core';
import HeroView from '../src/components/HeroShowcase';
import { CharacterPicker, displayFitnessStage, fitnessStyles } from '../src/components/FitnessUI';
import { Button, Copy, Heading, Meter, Notice, Pill, Screen, layout } from '../src/components/ui';
import { useApp } from '../src/state/AppProvider';
import { errorMessage } from '../src/lib/api';
import { alpha, colors, displayWeight, fonts, radii, stageLabel } from '../src/theme';

const collectibleName = (item: Cosmetic) => item.id === 'origin-suit' ? 'Original character look' : item.name;
const collectibleDescription = (item: Cosmetic) => item.id === 'origin-suit'
  ? 'Restore your character’s original colors and outfit, with no skin effect, bracers, flex pose, or aura. Your earned evolution stays the same.'
  : item.description;

function unlockProgress(item: Cosmetic, profile: Profile | null) {
  if (item.id === 'ion-skin') return { value: profile?.qualifiedMatches ?? 0, max: 1, label: `${profile?.qualifiedMatches ?? 0} / 1 qualified workout` };
  if (item.id === 'pulse-bracers') return { value: profile?.totalReps ?? 0, max: 100, label: `${profile?.totalReps ?? 0} / 100 valid reps` };
  if (item.id === 'champion-pose') return { value: profile?.wins ?? 0, max: 5, label: `${profile?.wins ?? 0} / 5 battle wins` };
  if (item.id === 'nova-aura') {
    const current = displayFitnessStage(profile?.stage);
    return { value: current.id === 'elite' ? 1 : 0, max: 1, label: `Reach Elite · Current stage: ${current.name}` };
  }
  return { value: 1, max: 1, label: 'Available from the start' };
}

export default function CollectionScreen() {
  const { profile, session, equip, unequip, resetEquipment, selectCharacter } = useApp();
  const earnedStage = displayFitnessStage(profile?.stage);
  const [previewStage, setPreviewStage] = useState<EvolutionStage>(earnedStage.id);
  const [characterId, setCharacterId] = useState<CharacterId>(characterFor(profile?.characterId).id);
  const [selecting, setSelecting] = useState(false);
  const [characterError, setCharacterError] = useState<string | null>(null);
  const characterPending = useRef(false);
  const [selected, setSelected] = useState<Cosmetic | null>(null);
  const [equipping, setEquipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [previewWithoutItem, setPreviewWithoutItem] = useState(false);
  const savePending = useRef(false);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const dialogWide = width >= 760;
  const dialogHeight = Math.max(260, height - insets.top - insets.bottom - 32);
  const previewHeight = dialogWide ? Math.min(430, Math.max(260, height - 260)) : Math.min(340, Math.max(210, height * 0.4));
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
  const previewEquipment: Equipment = selected?.id === 'origin-suit' ? {} : { ...profile?.equipped };
  if (selected && selected.id !== 'origin-suit') {
    if (previewWithoutItem) delete previewEquipment[selected.slot];
    else previewEquipment[selected.slot] = selected.id;
  }
  const owned = !!selected && !!profile?.ownedCosmetics.includes(selected.id);
  const equipped = !!selected && profile?.equipped[selected.slot] === selected.id;
  const originalActive = !Object.entries(profile?.equipped ?? {}).some(([slot, item]) => slot !== 'outfit' && !!item);
  const selectedProgress = selected ? unlockProgress(selected, profile) : null;
  const closePreview = () => { setSelected(null); setPreviewWithoutItem(false); };
  const openPreview = (item: Cosmetic) => {
    if (savePending.current) return;
    setSelected(item); setPreviewWithoutItem(false); setError(null); setSavedMessage(null);
  };
  const apply = async () => {
    if (!selected || !profile || savePending.current || (selected.id !== 'origin-suit' && !owned)) return;
    savePending.current = true; setEquipping(true); setError(null); setSavedMessage(null);
    try {
      if (selected.id === 'origin-suit') {
        await resetEquipment();
        setSavedMessage('Original look restored. Your earned stage is unchanged.');
      } else if (equipped) {
        await unequip(selected.slot);
        setPreviewWithoutItem(true);
        setSavedMessage(`${selected.name} removed from your saved look.`);
      } else {
        await equip(selected.slot, selected.id);
        setPreviewWithoutItem(false);
        setSavedMessage(`${selected.name} equipped and saved.`);
      }
    } catch (failure) { setError(errorMessage(failure)); }
    finally { savePending.current = false; setEquipping(false); }
  };
  return <Screen>
    <View style={layout.section}><Heading size={41}>A hero with your story.</Heading><Copy>Choose your character and explore four evolutions. Every character carries the same earned progress.</Copy></View>
    <View style={[styles.showcase, width >= 850 && { flexDirection: 'row' }]}>
      <View style={[styles.viewer, width >= 850 && { flex: 1.2 }]}>
        <View style={styles.modelStage}>
          <View style={styles.viewerGlow} />
          {!selected && <HeroView characterId={characterId} stage={previewStage} equipment={profile?.equipped} pose={profile?.equipped.pose === 'champion-pose' ? 'flex' : 'idle'} active={!session.reducedMotion} style={styles.hero} />}
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
    <Copy style={{ marginBottom: 20 }}>Try each look on your character. Locked items can be previewed, and earned items can be equipped or removed.</Copy>
    {!selected && error && <View accessibilityLiveRegion="polite"><Notice title="Could not save your look">{error}</Notice></View>}
    {!selected && savedMessage && <Text accessibilityLiveRegion="polite" style={[fitnessStyles.success, { marginBottom: 16 }]}>{savedMessage}</Text>}
    <View style={styles.cosmetics}>{COSMETICS.map(item => {
      const isOwned = !!profile?.ownedCosmetics.includes(item.id);
      const isEquipped = item.id === 'origin-suit' ? originalActive : profile?.equipped[item.slot] === item.id;
      const color = RARITY_COLORS[item.rarity];
      return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={collectibleName(item) + ', ' + item.rarity + ', ' + (isOwned ? 'owned' : item.id === 'origin-suit' ? 'available' : 'locked') + '. Preview on your character.'} disabled={equipping} onPress={() => openPreview(item)} style={[styles.cosmetic, width >= 850 ? { width: '18.7%' } : width >= 500 ? { width: '31.5%' } : { width: '47.7%' }, selected?.id === item.id && { borderColor: color, backgroundColor: colors.glassStrong }]}>
        <View style={[styles.itemArt, { backgroundColor: alpha(color, 0.08) }]}><CosmeticArt item={item} /><View style={[styles.rarityDot, { backgroundColor: color }]} /></View>
        <Text style={[styles.rarity, { color }]}>{stageLabel(item.rarity)}</Text><Text style={styles.itemName}>{collectibleName(item)}</Text><Text style={styles.itemStatus}>{isEquipped ? item.id === 'origin-suit' ? 'Original look active' : 'Equipped' : item.id === 'origin-suit' ? 'Restore original look' : isOwned ? 'Owned · try it on' : 'Locked · preview available'}</Text>
        <Text style={styles.cardProgress}>{unlockProgress(item, profile).label}</Text>
      </Pressable>;
    })}</View>
    <Modal visible={!!selected} transparent animationType={session.reducedMotion ? 'none' : 'fade'} onRequestClose={closePreview} presentationStyle="overFullScreen" accessibilityLabel={selected ? `${collectibleName(selected)} preview` : 'Cosmetic preview'}>
      <View style={[styles.modalBackdrop, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16, paddingHorizontal: width < 500 ? 12 : 24 }]}>
        {selected && <View accessibilityViewIsModal style={[styles.modalFrame, { maxHeight: dialogHeight }]}>
          <View style={styles.modalHeader}><View style={{ flex: 1, minWidth: 0, gap: 5 }}><Text style={styles.modalEyebrow}>Character preview</Text><Heading size={dialogWide ? 30 : 25}>{collectibleName(selected)}</Heading></View><Button variant="quiet" onPress={closePreview} accessibilityLabel="Close cosmetic preview" style={styles.closeButton}>Close</Button></View>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <View style={[styles.modalColumns, dialogWide && { flexDirection: 'row', alignItems: 'center' }]}>
              <View style={[styles.viewer, { height: previewHeight }, dialogWide && { flex: 1.1 }]}>
                <View style={styles.modelStage}><View style={styles.viewerGlow} /><HeroView characterId={characterId} stage={previewStage} equipment={previewEquipment} pose={previewEquipment.pose === 'champion-pose' ? 'flex' : 'idle'} active={!session.reducedMotion} style={styles.hero} /></View>
                <View style={[styles.viewerBottom, { paddingBottom: 14, paddingTop: 6 }]}><Text style={[styles.stageName, { fontSize: 21, lineHeight: 27 }]}>{characterFor(characterId).name} · {stage.name}</Text><Text style={styles.stageDescription}>{selected.id === 'origin-suit' ? 'Original look preview' : previewWithoutItem ? `Without ${selected.name}` : `${selected.name} preview`}</Text></View>
              </View>
              <View style={[styles.modalDetails, dialogWide && { flex: 1 }]}>
                <Pill color={owned || selected.id === 'origin-suit' ? RARITY_COLORS[selected.rarity] : colors.muted}>{selected.id === 'origin-suit' ? 'Always available' : equipped ? 'Equipped' : owned ? 'Owned' : 'Locked · preview only'}</Pill>
                <Copy>{collectibleDescription(selected)}</Copy>
                {selectedProgress && <View style={styles.unlockProgress}><Text style={styles.requirement}>{selected.requirement}</Text><Text style={styles.progressValue}>{selectedProgress.label}</Text><Meter value={selectedProgress.value} max={selectedProgress.max} color={owned || selected.id === 'origin-suit' ? colors.accent : colors.muted} label={`${collectibleName(selected)} unlock progress`} /></View>}
                <Text style={fitnessStyles.small}>{selected.id === 'origin-suit' ? 'Restoring this look clears every cosmetic effect. Your chosen character and evolution stay the same.' : owned ? 'Equip to save this item, or remove it when you want to change your look.' : 'This is a visual preview. Meet the requirement to save this item to your character.'}</Text>
                {previewIndex > earnedIndex && <Text style={fitnessStyles.small}>You are viewing a locked evolution. Saving a cosmetic keeps your earned {earnedStage.name} stage.</Text>}
                {selected.id !== 'origin-suit' && <Button variant="secondary" onPress={() => setPreviewWithoutItem(value => !value)} disabled={equipping}>{previewWithoutItem ? 'Show item preview' : 'Compare without item'}</Button>}
              </View>
            </View>
          </ScrollView>
          <View style={styles.modalFooter}>
            {error && <Text accessibilityLiveRegion="polite" style={layout.error}>Could not save your look. {error}</Text>}
            {savedMessage && <Text accessibilityLiveRegion="polite" style={fitnessStyles.success}>{savedMessage}</Text>}
            <Button onPress={profile ? apply : () => { closePreview(); router.push('/profile'); }} loading={equipping} disabled={!!profile && selected.id !== 'origin-suit' && !owned}>{!profile ? 'Create player to save' : selected.id === 'origin-suit' ? 'Restore original look' : equipped ? `Remove ${selected.name}` : owned ? `Equip ${selected.name}` : 'Locked · preview only'}</Button>
            <Text style={styles.cosmeticNote}>Cosmetics change your look. They never increase battle power.</Text>
          </View>
        </View>}
      </View>
    </Modal>
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
  requirement: { fontFamily: fonts.body, color: colors.faint, fontSize: 14, lineHeight: 21 },
  cardProgress: { fontFamily: fonts.body, color: colors.muted, fontSize: 11, lineHeight: 18 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(2,4,8,0.88)', justifyContent: 'center', alignItems: 'center' },
  modalFrame: { width: '100%', maxWidth: 980, backgroundColor: colors.backgroundElevated, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.lineStrong, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, borderBottomWidth: 1, borderBottomColor: colors.line, flexShrink: 0 },
  modalEyebrow: { fontFamily: fonts.body, color: colors.muted, fontSize: 11, fontWeight: '600', letterSpacing: 1.4, textTransform: 'uppercase' },
  closeButton: { flexShrink: 0 }, modalScroll: { flexShrink: 1 }, modalBody: { padding: 18 }, modalColumns: { gap: 22 },
  modalDetails: { gap: 18, minWidth: 0 }, unlockProgress: { gap: 9 }, progressValue: { fontFamily: fonts.body, color: colors.text, fontSize: 15, fontWeight: '600', lineHeight: 23 },
  modalFooter: { gap: 12, padding: 18, borderTopWidth: 1, borderTopColor: colors.line, flexShrink: 0 },
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
