import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, usePathname } from 'expo-router';
import { MAX_COACH_QUESTION_CHARS, type CoachSource } from '@vyra/core';
import { useApp } from '../state/AppProvider';
import { useCoach } from '../state/CoachProvider';
import { colors, displayWeight, fonts, radii } from '../theme';

const PROMPTS = [
  { topic: 'Squat form', question: 'What should I focus on for good squat form?' },
  { topic: 'Recovery', question: 'How should I plan rest days between workouts?' },
  { topic: 'Nutrition', question: 'What should I eat after a workout?' },
  { topic: 'My evolution', question: 'How do workouts and check-ins unlock my next evolution?' },
];

export default function FloatingCoach() {
  const { booting, profile } = useApp();
  const coach = useCoach();
  const pathname = usePathname();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 600;
  const input = useRef<TextInput>(null);
  const launcher = useRef<View>(null);
  const messages = useRef<ScrollView>(null);
  const nearBottom = useRef(true);
  const latest = coach.exchanges[coach.exchanges.length - 1];

  // Competitive rounds take the full screen; a chat opened while matchmaking must not cover one.
  useEffect(() => { if (pathname === '/battle') coach.closeCoach(); }, [pathname, coach.closeCoach]);

  const choosePrompt = (question: string) => { coach.setDraft(question); input.current?.focus(); };
  const ask = () => { nearBottom.current = true; coach.ask(); };
  const openTraining = () => { coach.closeCoach(); router.push('/train'); };
  const panelHeight = Math.max(200, Math.min(680, height - insets.top - insets.bottom - (compact ? 24 : 48)));

  if (booting || pathname === '/battle') return null;
  return <>
    {!coach.isOpen && <View pointerEvents="box-none" style={[styles.launcherPosition, { right: Math.max(16, insets.right + 16), bottom: (width < 850 ? 92 : 24) + insets.bottom }]}>
      <Pressable ref={launcher} accessibilityRole="button" accessibilityLabel="Open VYRA Coach chat" accessibilityState={{ expanded: false }}
        onPress={coach.openCoach} style={({ pressed }) => [styles.launcher, pressed && styles.pressed]}>
        <ChatMark />
        <Text style={styles.launcherText}>Ask Coach</Text>
        {coach.sendingId && <ActivityIndicator size="small" color={colors.brand} />}
      </Pressable>
    </View>}
    <Modal visible={coach.isOpen} transparent animationType="none" onRequestClose={coach.closeCoach} statusBarTranslucent
      onDismiss={() => { if (Platform.OS === 'web') requestAnimationFrame(() => launcher.current?.focus()); }}
      onShow={() => { nearBottom.current = true; messages.current?.scrollToEnd({ animated: false }); }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}>
        <View style={[styles.overlay, { paddingTop: insets.top + 12, paddingBottom: Math.max(12, insets.bottom), paddingHorizontal: compact ? 12 : 24 }]}>
          <Pressable accessible={false} importantForAccessibility="no" style={styles.backdrop} onPress={coach.closeCoach} />
          <View accessibilityViewIsModal accessibilityLabel="VYRA Coach chat" role="dialog"
            style={[styles.panel, { width: compact ? '100%' : 420, height: panelHeight }]}>
            <View style={styles.header}>
              <ChatMark />
              <View style={styles.titleGroup}><Text style={styles.title}>VYRA Coach</Text><Text style={styles.subtitle}>Your next rep starts with a question.</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel="Minimize Coach chat" onPress={coach.closeCoach} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
                <Text style={styles.closeMark}>−</Text>
              </Pressable>
            </View>
            <View style={styles.toolbar}>
              <Pressable accessibilityRole="button" onPress={openTraining} style={styles.textButton}><Text style={styles.link}>Open live training</Text></Pressable>
              {!!coach.exchanges.length && <Pressable accessibilityRole="button" disabled={!!coach.sendingId} accessibilityState={{ disabled: !!coach.sendingId }}
                onPress={() => { coach.startOver(); input.current?.focus(); }} style={[styles.textButton, !!coach.sendingId && styles.disabled]}><Text style={styles.secondaryLink}>New chat</Text></Pressable>}
            </View>
            <ScrollView ref={messages} style={styles.messages} contentContainerStyle={styles.messageContent} keyboardShouldPersistTaps="handled"
              onScroll={event => { const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent; nearBottom.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 70; }} scrollEventThrottle={100}
              onContentSizeChange={() => { if (nearBottom.current) messages.current?.scrollToEnd({ animated: false }); }}>
              {!coach.exchanges.length && <View style={styles.welcome}>
                <Text style={styles.welcomeTitle}>What are we working on?</Text>
                <Text style={styles.copy}>Ask about form, recovery, nutrition, or how to evolve your hero.</Text>
                <View style={styles.prompts}>{PROMPTS.map(prompt => <Pressable key={prompt.topic} accessibilityRole="button" accessibilityLabel={`${prompt.topic}: ${prompt.question}`}
                  onPress={() => choosePrompt(prompt.question)} style={({ pressed }) => [styles.prompt, pressed && styles.pressed]}><Text style={styles.promptText}>{prompt.topic}</Text></Pressable>)}</View>
              </View>}
              {coach.historyTrimmed && <Text style={styles.meta}>Showing your latest 8 exchanges.</Text>}
              {coach.exchanges.map(exchange => <View key={exchange.key} style={styles.exchange}>
                <View style={styles.questionBubble}><Text selectable style={styles.question}>{exchange.question}</Text></View>
                {exchange.status === 'pending' ? <View accessibilityLiveRegion="polite" style={styles.pending}><ActivityIndicator size="small" color={colors.brand} /><Text style={styles.copy}>Finding your guidance…</Text></View>
                  : exchange.status === 'failed' ? <View accessibilityLiveRegion="polite" style={styles.failure}>
                    <Text style={styles.failureTitle}>Let’s try that again.</Text><Text style={styles.copy}>{exchange.error}</Text>
                    <Pressable accessibilityRole="button" disabled={!!coach.sendingId} accessibilityState={{ disabled: !!coach.sendingId }} onPress={() => coach.retry(exchange)} style={[styles.retry, !!coach.sendingId && styles.disabled]}>
                      <Text style={styles.link}>{exchange.reconnect ? 'Reconnect in Profile' : 'Retry question'}</Text>
                    </Pressable>
                  </View> : exchange.reply && <View style={styles.answer}>
                    <Text style={styles.answerLabel}>{exchange.reply.mode === 'knowledge' ? 'From the VYRA guide' : 'VYRA Coach'}</Text>
                    <Text selectable accessibilityLiveRegion="polite" style={styles.answerText}>{exchange.reply.answer.split(/(\*\*[^*\n]+\*\*)/g).map((part, index) =>
                      part.startsWith('**') && part.endsWith('**') ? <Text key={index} style={styles.bold}>{part.slice(2, -2)}</Text> : part)}</Text>
                    {!!exchange.reply.sources.length && <View style={styles.sources}><Text style={styles.meta}>Sources</Text>{exchange.reply.sources.map((source, index) => <SourceExcerpt key={`${source.id}-${index}`} source={source} />)}</View>}
                  </View>}
              </View>)}
            </ScrollView>
            <View style={styles.composer}>
              {!coach.canAsk && <Text style={styles.guestHint}>{profile ? 'Reconnect your player' : 'Create a player'} to send. You can draft your question here.</Text>}
              <View style={styles.inputRow}>
                <TextInput ref={input} accessibilityLabel="Your question for VYRA Coach" value={coach.draft} onChangeText={coach.setDraft} multiline
                  maxLength={MAX_COACH_QUESTION_CHARS} textAlignVertical="top" placeholder={latest ? 'Ask a follow-up…' : 'Ask about your next workout…'} placeholderTextColor={colors.faint} style={styles.input} />
                <Pressable accessibilityRole="button" accessibilityLabel={coach.canAsk ? 'Send question to Coach' : profile ? 'Reconnect to ask Coach' : 'Create player to ask Coach'}
                  accessibilityState={{ disabled: !!coach.sendingId || (coach.canAsk && !coach.draft.trim()), busy: !!coach.sendingId }}
                  disabled={!!coach.sendingId || (coach.canAsk && !coach.draft.trim())} onPress={ask}
                  style={({ pressed }) => [styles.send, (!!coach.sendingId || (coach.canAsk && !coach.draft.trim())) && styles.disabled, pressed && styles.pressed]}>
                  {coach.sendingId ? <ActivityIndicator size="small" color={colors.ink} /> : <Text style={styles.sendLabel}>{coach.canAsk ? 'Send' : 'Connect'}</Text>}
                </Pressable>
              </View>
              {coach.formError && <Text accessibilityLiveRegion="polite" style={styles.error}>{coach.formError}</Text>}
              <View style={styles.composerFoot}><Text style={[styles.meta, { flex: 1 }]}>Saved measurements stay out of this chat.</Text><Text style={styles.meta}>{coach.draft.length}/{MAX_COACH_QUESTION_CHARS}</Text></View>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </>;
}

function ChatMark() {
  return <View accessible={false} style={styles.chatMark}><View style={styles.chatLine} /><View style={[styles.chatLine, { width: 9 }]} /></View>;
}

function SourceExcerpt({ source }: { source: CoachSource }) {
  const [expanded, setExpanded] = useState(false);
  return <View style={styles.source}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Read source: ${source.title}${source.section ? `, ${source.section}` : ''}`} accessibilityState={{ expanded }}
      onPress={() => setExpanded(value => !value)} style={styles.sourceToggle}>
      <Text style={styles.sourceTitle}>{source.title}{source.section ? ` · ${source.section}` : ''}</Text><Text style={styles.sourceMark}>{expanded ? '−' : '+'}</Text>
    </Pressable>
    {expanded && <Text selectable style={styles.sourceText}>{source.excerpt}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  launcherPosition: { position: 'absolute', zIndex: 50 },
  launcher: { minHeight: 54, paddingHorizontal: 18, borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.brand, shadowColor: '#000000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 12 },
  launcherText: { fontFamily: fonts.body, fontSize: 14, fontWeight: '700', color: colors.text },
  chatMark: { width: 25, height: 24, borderRadius: 8, borderBottomLeftRadius: 2, borderWidth: 1.5, borderColor: colors.brand, alignItems: 'center', justifyContent: 'center', gap: 4 },
  chatLine: { width: 12, height: 2, borderRadius: 1, backgroundColor: colors.brand },
  modalRoot: { flex: 1 }, overlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'flex-end' }, backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(5,7,10,0.40)' },
  panel: { flexShrink: 1, maxHeight: '100%', borderWidth: 1, borderColor: colors.lineControl, borderRadius: 22, overflow: 'hidden', backgroundColor: colors.backgroundElevated, shadowColor: '#000000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 30, elevation: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 18, paddingRight: 8, paddingVertical: 13, backgroundColor: colors.surface }, titleGroup: { flex: 1, gap: 4 }, title: { fontFamily: fonts.display, fontSize: 25, fontWeight: displayWeight.heavy, color: colors.text }, subtitle: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, lineHeight: 16 },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 }, closeMark: { fontFamily: fonts.body, fontSize: 27, color: colors.text },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: colors.line }, textButton: { minHeight: 44, justifyContent: 'center' }, link: { fontFamily: fonts.body, fontSize: 12, fontWeight: '600', color: colors.accent }, secondaryLink: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  messages: { flex: 1 }, messageContent: { padding: 18, gap: 22 }, welcome: { gap: 12, paddingTop: 8 }, welcomeTitle: { fontFamily: fonts.display, fontSize: 27, fontWeight: displayWeight.heavy, color: colors.text }, copy: { fontFamily: fonts.body, fontSize: 14, lineHeight: 22, color: colors.muted, flexShrink: 1 },
  prompts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }, prompt: { minHeight: 44, paddingHorizontal: 13, justifyContent: 'center', borderRadius: radii.pill, borderWidth: 1, borderColor: colors.lineControl, backgroundColor: colors.glass }, promptText: { fontFamily: fonts.body, fontSize: 12, color: colors.text },
  exchange: { gap: 18 }, questionBubble: { alignSelf: 'flex-end', maxWidth: '92%', backgroundColor: colors.surfaceRaised, padding: 13, borderRadius: 16, borderBottomRightRadius: 3 }, question: { fontFamily: fonts.body, fontSize: 14, lineHeight: 22, color: colors.text },
  answer: { gap: 10 }, answerLabel: { fontFamily: fonts.body, fontSize: 12, fontWeight: '700', color: colors.accent }, answerText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 23, color: colors.text }, bold: { fontWeight: '700' }, pending: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 10 },
  failure: { borderLeftWidth: 2, borderLeftColor: colors.danger, paddingLeft: 12, gap: 9 }, failureTitle: { fontFamily: fonts.body, fontSize: 14, color: colors.text, fontWeight: '600' }, retry: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' },
  sources: { gap: 4, marginTop: 5 }, source: { borderBottomWidth: 1, borderBottomColor: colors.line }, sourceToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 }, sourceTitle: { flex: 1, fontFamily: fonts.body, fontSize: 12, lineHeight: 19, color: colors.muted }, sourceMark: { fontFamily: fonts.body, fontSize: 21, color: colors.brand }, sourceText: { fontFamily: fonts.body, fontSize: 12, lineHeight: 20, color: colors.muted, paddingBottom: 12 },
  composer: { padding: 14, gap: 9, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface }, inputRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' }, input: { flex: 1, minHeight: 76, maxHeight: 110, padding: 11, borderRadius: 12, borderWidth: 1, borderColor: colors.lineControl, backgroundColor: colors.backgroundElevated, fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.text },
  send: { minWidth: 64, minHeight: 46, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, borderRadius: radii.pill }, sendLabel: { fontFamily: fonts.body, fontSize: 12, fontWeight: '700', color: colors.ink }, composerFoot: { flexDirection: 'row', gap: 10, justifyContent: 'space-between' }, meta: { fontFamily: fonts.body, fontSize: 10, lineHeight: 16, color: colors.muted }, guestHint: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.muted }, error: { fontFamily: fonts.body, fontSize: 12, lineHeight: 19, color: colors.danger },
  disabled: { opacity: 0.45 }, pressed: { opacity: 0.8 },
});
