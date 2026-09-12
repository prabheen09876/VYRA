import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import {
  MAX_COACH_HISTORY_CHARS, MAX_COACH_HISTORY_MESSAGES, MAX_COACH_MESSAGE_CHARS, MAX_COACH_QUESTION_CHARS,
  type CoachMessage, type CoachQuestion, type CoachReply, type CoachSource,
} from '@vyra/core';
import { Button, Copy, Heading, Loading, Screen, Triangle, layout } from '../src/components/ui';
import { ApiError, errorMessage, request } from '../src/lib/api';
import { useApp } from '../src/state/AppProvider';
import { colors, displayWeight, fonts, radii } from '../src/theme';

const MAX_VISIBLE_EXCHANGES = 8;
const PROMPTS = [
  { topic: 'Form', question: 'What should I focus on for good squat form?' },
  { topic: 'Recovery', question: 'How should I plan rest days between workouts?' },
  { topic: 'Nutrition', question: 'What should I eat after a workout?' },
  { topic: 'Progression', question: 'How do workouts and check-ins unlock my next evolution?' },
] as const;

type Exchange = {
  key: string;
  question: string;
  payload: CoachQuestion;
  status: 'pending' | 'answered' | 'failed';
  reply?: CoachReply;
  error?: string;
  reconnect?: boolean;
};

function conversationFor(exchanges: Exchange[]): CoachMessage[] {
  const history = exchanges.flatMap<CoachMessage>(exchange => exchange.status === 'answered' && exchange.reply ? [
    { role: 'user', content: exchange.question.slice(0, MAX_COACH_MESSAGE_CHARS) },
    { role: 'assistant', content: exchange.reply.answer.slice(0, MAX_COACH_MESSAGE_CHARS) },
  ] : []).slice(-MAX_COACH_HISTORY_MESSAGES);
  let length = history.reduce((total, message) => total + message.content.length, 0);
  while (length > MAX_COACH_HISTORY_CHARS && history.length) length -= history.shift()!.content.length;
  return history;
}

function isCoachReply(value: unknown): value is CoachReply {
  if (!value || typeof value !== 'object') return false;
  const reply = value as Partial<CoachReply>;
  return typeof reply.answer === 'string' && !!reply.answer.trim()
    && (reply.mode === 'generated' || reply.mode === 'knowledge')
    && typeof reply.messageId === 'string' && !!reply.messageId
    && Array.isArray(reply.sources) && reply.sources.every(source => !!source && typeof source.id === 'string'
      && typeof source.title === 'string' && typeof source.section === 'string'
      && typeof source.excerpt === 'string' && typeof source.score === 'number' && Number.isFinite(source.score));
}

export default function CoachScreen() {
  const { profile, session, booting } = useApp();
  const { width } = useWindowDimensions();
  const wide = width >= 980;
  const [draft, setDraft] = useState('');
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [historyTrimmed, setHistoryTrimmed] = useState(false);
  const input = useRef<TextInput>(null);
  const sending = useRef(false);
  const generation = useRef(0);
  const owner = useRef({ id: profile?.id, apiUrl: session.apiUrl });
  const canAsk = !!profile && !!session.token;

  useEffect(() => {
    const next = { id: profile?.id, apiUrl: session.apiUrl };
    if (owner.current.id === next.id && owner.current.apiUrl === next.apiUrl) return;
    const previous = owner.current;
    owner.current = next;
    generation.current += 1; sending.current = false;
    setExchanges([]); setSendingId(null); setFormError(null); setHistoryTrimmed(false);
    // A guest may keep their unsent draft when connecting. Conversations never cross accounts.
    if (previous.id || previous.apiUrl !== next.apiUrl) setDraft('');
  }, [profile?.id, session.apiUrl]);
  useEffect(() => () => { generation.current += 1; sending.current = false; }, []);

  const send = async (payload: CoachQuestion, retryKey?: string) => {
    if (sending.current) return;
    if (!profile || !session.token) { router.push('/profile'); return; }
    sending.current = true;
    const currentGeneration = ++generation.current;
    const key = retryKey ?? `${Date.now()}-${currentGeneration}`;
    setSendingId(key); setFormError(null);
    setExchanges(current => {
      if (retryKey) return current.map(exchange => exchange.key === key ? { ...exchange, status: 'pending', error: undefined, reconnect: false } : exchange);
      return [...current, { key, question: payload.question, payload, status: 'pending' as const }].slice(-MAX_VISIBLE_EXCHANGES);
    });
    try {
      const reply = await request<unknown>(session.apiUrl, '/api/coach/chat', { token: session.token, body: payload });
      if (generation.current !== currentGeneration) return;
      if (!isCoachReply(reply)) throw new Error('The coach did not return a complete answer. Try your question again.');
      setExchanges(current => current.map(exchange => exchange.key === key ? { ...exchange, reply, status: 'answered' } : exchange));
    } catch (failure) {
      if (generation.current !== currentGeneration) return;
      const reconnect = failure instanceof ApiError && failure.status === 401;
      setExchanges(current => current.map(exchange => exchange.key === key ? {
        ...exchange, status: 'failed', reconnect,
        error: reconnect ? 'Your session needs to reconnect. Open Profile, then return to your question.' : errorMessage(failure),
      } : exchange));
    } finally {
      if (generation.current === currentGeneration) { sending.current = false; setSendingId(null); }
    }
  };

  const ask = () => {
    if (!canAsk) { router.push('/profile'); return; }
    const question = draft.trim();
    if (!question) { setFormError('Write a question or choose one below.'); return; }
    if (question.length > MAX_COACH_QUESTION_CHARS) { setFormError(`Keep your question within ${MAX_COACH_QUESTION_CHARS} characters.`); return; }
    if (sending.current) return;
    if (exchanges.length >= MAX_VISIBLE_EXCHANGES) setHistoryTrimmed(true);
    const payload: CoachQuestion = { question, conversation: conversationFor(exchanges) };
    setDraft(''); Keyboard.dismiss();
    void send(payload);
  };
  const startOver = () => {
    if (sending.current) return;
    setExchanges([]); setDraft(''); setFormError(null); setHistoryTrimmed(false);
    input.current?.focus();
  };
  const choosePrompt = (question: string) => { setDraft(question); setFormError(null); input.current?.focus(); };

  if (booting) return <Screen><Loading text="Opening your coach…" /></Screen>;
  return <Screen>
    <View style={styles.header}><Heading size={wide ? 54 : 40}>Find your cue.</Heading><Copy>Ask VYRA Coach about form, recovery, nutrition, or your next evolution. Put that guidance to work in live training.</Copy></View>
    {!wide && <LiveTraining compact />}
    <View style={[styles.columns, wide && { flexDirection: 'row', alignItems: 'flex-start' }]}>
      <View style={styles.conversationColumn}>
        {!!exchanges.length && <View style={styles.conversationHeading}><Heading size={27}>Your conversation</Heading><Button variant="quiet" onPress={startOver} disabled={!!sendingId} style={styles.newConversation}>New conversation</Button></View>}
        {historyTrimmed && <Text style={styles.meta}>Showing the latest {MAX_VISIBLE_EXCHANGES} exchanges on this page.</Text>}
        {exchanges.map(exchange => <View key={exchange.key} style={styles.exchange}>
          <Text style={styles.questionLabel}>You asked</Text><Text selectable style={styles.question}>{exchange.question}</Text>
          {exchange.status === 'pending' ? <View accessibilityLiveRegion="polite" style={styles.pending}><ActivityIndicator size="small" color={colors.brand} /><Text style={styles.pendingText}>Finding guidance for your question…</Text></View>
            : exchange.status === 'failed' ? <View accessibilityLiveRegion="polite" style={styles.failure}>
              <Text style={styles.failureTitle}>Your question wasn’t answered</Text><Text style={styles.failureCopy}>{exchange.error}</Text>
              <Button variant="secondary" disabled={!!sendingId} onPress={exchange.reconnect ? () => router.push('/profile') : () => send(exchange.payload, exchange.key)} style={{ alignSelf: 'flex-start' }}>{exchange.reconnect ? 'Reconnect in Profile' : 'Retry this question'}</Button>
            </View> : exchange.reply && <View style={styles.answer}>
              <Text style={styles.answerLabel}>{exchange.reply.mode === 'knowledge' ? 'From the VYRA guide' : 'VYRA Coach'}</Text>
              <Text selectable accessibilityLiveRegion="polite" style={styles.answerText}>{exchange.reply.answer.split(/(\*\*[^*\n]+\*\*)/g).map((part, index) =>
                part.startsWith('**') && part.endsWith('**') ? <Text key={index} style={{ fontWeight: '700' }}>{part.slice(2, -2)}</Text> : part)}</Text>
              {!!exchange.reply.sources.length && <View style={styles.sources}><Text style={styles.sourcesHeading}>Sources</Text>{exchange.reply.sources.map((source, index) => <SourceExcerpt key={`${source.id}-${index}`} source={source} />)}</View>}
            </View>}
        </View>)}

        <View style={[styles.composer, !!exchanges.length && styles.composerAfterConversation]}>
          <Heading size={27}>{exchanges.length ? 'Ask a follow-up' : 'What would you like to work on?'}</Heading>
          {!canAsk && <Text style={styles.guestHint}>You can draft a question here. {profile ? 'Reconnect your player' : 'Create a player'} to get an answer from VYRA Coach.</Text>}
          <View style={{ gap: 9 }}>
            <Text style={styles.inputLabel}>Your question</Text>
            <TextInput ref={input} accessibilityLabel="Your question for VYRA Coach" value={draft} onChangeText={value => { setDraft(value); setFormError(null); }} multiline maxLength={MAX_COACH_QUESTION_CHARS} textAlignVertical="top" placeholder={exchanges.length ? 'Ask about the answer, or start a new topic…' : 'For example, how can I improve my squat form?'} placeholderTextColor={colors.faint} style={[layout.input, styles.questionInput]} />
            <Text style={styles.characterCount}>{draft.length} / {MAX_COACH_QUESTION_CHARS}</Text>
          </View>
          {formError && <Text accessibilityLiveRegion="polite" style={layout.error}>{formError}</Text>}
          <View style={[styles.composeActions, width >= 600 && { flexDirection: 'row', alignItems: 'center' }]}><Button onPress={ask} loading={!!sendingId} disabled={canAsk && !draft.trim()} style={width >= 600 ? { alignSelf: 'flex-start' } : undefined}>{canAsk ? 'Ask Coach' : profile ? 'Reconnect to ask' : 'Create player to ask'}</Button><Text style={[styles.meta, { flex: 1 }]}>Your saved measurements aren’t added to questions.</Text></View>
        </View>
        <View style={styles.promptSection}><Text style={styles.promptHeading}>{exchanges.length ? 'Or explore another topic' : 'Try a starting question'}</Text><View style={styles.prompts}>{PROMPTS.map(prompt => <Pressable key={prompt.topic} accessibilityRole="button" accessibilityLabel={`${prompt.topic}: ${prompt.question}`} onPress={() => choosePrompt(prompt.question)} style={({ pressed }) => [styles.prompt, pressed && { backgroundColor: colors.glassStrong }]}><Text style={styles.promptTopic}>{prompt.topic}</Text><Text style={styles.promptQuestion}>{prompt.question}</Text></Pressable>)}</View></View>
        {!!exchanges.length && <Text style={styles.historyNote}>Recent messages provide context for follow-ups. Use New conversation to start fresh.</Text>}
      </View>
      {wide && <View style={styles.trainingRail}><LiveTraining /><View style={styles.readingNote}><Text style={styles.readingNoteTitle}>A cue you can check.</Text><Text style={styles.readingNoteCopy}>Open an answer’s sources to read the relevant passage from the guide. Ask a follow-up when you need more detail.</Text></View></View>}
    </View>
  </Screen>;
}

function SourceExcerpt({ source }: { source: CoachSource }) {
  const [expanded, setExpanded] = useState(false);
  return <View style={styles.source}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Read source: ${source.title}${source.section ? `, ${source.section}` : ''}`} accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={({ pressed }) => [styles.sourceToggle, pressed && { backgroundColor: colors.glass }]}>
      <View style={{ flex: 1, gap: 4 }}><Text style={styles.sourceTitle}>{source.title}</Text>{!!source.section && <Text style={styles.sourceSection}>{source.section}</Text>}</View><Text style={styles.sourceMark}>{expanded ? '−' : '+'}</Text>
    </Pressable>
    {expanded && <View style={styles.sourceExcerpt}><Text selectable style={styles.sourceText}>{source.excerpt}</Text></View>}
  </View>;
}

function LiveTraining({ compact = false }: { compact?: boolean }) {
  if (compact) return <Pressable accessibilityRole="button" accessibilityLabel="Open live training with your camera and moving avatar" onPress={() => router.push('/train')} style={({ pressed }) => [styles.trainingCompact, pressed && { backgroundColor: colors.glass }]}><View style={{ flex: 1, gap: 7 }}><Heading size={26}>Live training</Heading><Text style={styles.trainingCopy}>On-device camera feedback and an avatar that moves with you.</Text></View><Triangle color={colors.brand} size={7} /></Pressable>;
  return <View style={styles.training}>
    <Heading size={34}>Live training</Heading><Text style={styles.trainingHeadline}>Put your next cue in motion.</Text><Text style={styles.trainingCopy}>Use your camera to practice with a moving avatar and live movement feedback. Pose tracking runs on your device.</Text>
    <Button variant="secondary" onPress={() => router.push('/train')}>Open live training</Button>
  </View>;
}

const styles = StyleSheet.create({
  header: { gap: 18, marginBottom: 36, maxWidth: 710 }, columns: { gap: 54 }, conversationColumn: { flex: 1, minWidth: 0, maxWidth: 760 },
  conversationHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 },
  newConversation: { alignSelf: 'flex-start' },
  exchange: { paddingTop: 23, paddingBottom: 27, borderTopWidth: 1, borderTopColor: colors.line, gap: 10 },
  questionLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.muted }, question: { fontFamily: fonts.body, fontSize: 17, lineHeight: 26, color: colors.text, fontWeight: '600' },
  answer: { marginTop: 13, gap: 13 }, answerLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.accent, fontWeight: '600' }, answerText: { fontFamily: fonts.body, fontSize: 16, lineHeight: 27, color: colors.text, maxWidth: 690 },
  pending: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 66 }, pendingText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 22, color: colors.muted },
  failure: { marginTop: 10, gap: 13, borderLeftWidth: 2, borderLeftColor: colors.danger, paddingLeft: 18 }, failureTitle: { fontFamily: fonts.body, fontSize: 15, color: colors.text, fontWeight: '600' }, failureCopy: { fontFamily: fonts.body, fontSize: 14, lineHeight: 23, color: colors.muted },
  composer: { gap: 20 }, composerAfterConversation: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 28 },
  guestHint: { fontFamily: fonts.body, fontSize: 14, lineHeight: 23, color: colors.muted }, inputLabel: { fontFamily: fonts.body, fontSize: 14, color: colors.text },
  questionInput: { minHeight: 132, maxHeight: 230, lineHeight: 25, borderColor: colors.lineControl, paddingTop: 15 }, characterCount: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, textAlign: 'right' },
  composeActions: { gap: 18 }, meta: { fontFamily: fonts.body, fontSize: 12, lineHeight: 19, color: colors.muted },
  promptSection: { marginTop: 31, gap: 11 }, promptHeading: { fontFamily: fonts.body, fontSize: 13, color: colors.muted }, prompts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 2 },
  prompt: { flexBasis: '44%', flexGrow: 1, minWidth: 125, borderBottomWidth: 1, borderBottomColor: colors.lineControl, paddingVertical: 15, paddingHorizontal: 2, gap: 7 }, promptTopic: { fontFamily: fonts.body, fontSize: 13, color: colors.accent, fontWeight: '600' }, promptQuestion: { fontFamily: fonts.body, fontSize: 14, lineHeight: 22, color: colors.text },
  historyNote: { fontFamily: fonts.body, fontSize: 12, lineHeight: 20, color: colors.muted, marginTop: 25 },
  sources: { marginTop: 8, gap: 6 }, sourcesHeading: { fontFamily: fonts.body, fontSize: 12, color: colors.muted }, source: { borderBottomWidth: 1, borderBottomColor: colors.line },
  sourceToggle: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 55, paddingVertical: 12, paddingHorizontal: 2 }, sourceTitle: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: colors.text, fontWeight: '600' }, sourceSection: { fontFamily: fonts.body, fontSize: 12, lineHeight: 19, color: colors.muted }, sourceMark: { fontFamily: fonts.body, fontSize: 23, color: colors.brand, width: 20, textAlign: 'center' },
  sourceExcerpt: { borderLeftWidth: 2, borderLeftColor: colors.lineStrong, marginBottom: 17, marginTop: 2, paddingLeft: 15, paddingRight: 8 }, sourceText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 23, color: colors.muted },
  trainingRail: { width: 310, gap: 34, borderLeftWidth: 1, borderLeftColor: colors.line, paddingLeft: 32 }, training: { gap: 21 }, trainingHeadline: { fontFamily: fonts.display, fontWeight: displayWeight.regular, fontSize: 25, lineHeight: 31, color: colors.text }, trainingCopy: { fontFamily: fonts.body, fontSize: 14, lineHeight: 23, color: colors.muted },
  trainingCompact: { marginBottom: 34, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 20, flexDirection: 'row', alignItems: 'center', gap: 24 },
  readingNote: { gap: 10, paddingTop: 25, borderTopWidth: 1, borderTopColor: colors.line }, readingNoteTitle: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: colors.text, fontWeight: '600' }, readingNoteCopy: { fontFamily: fonts.body, fontSize: 13, lineHeight: 22, color: colors.muted },
});
