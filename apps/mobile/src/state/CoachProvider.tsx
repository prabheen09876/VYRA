import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import { router } from 'expo-router';
import {
  MAX_COACH_HISTORY_CHARS, MAX_COACH_HISTORY_MESSAGES, MAX_COACH_MESSAGE_CHARS, MAX_COACH_QUESTION_CHARS,
  type CoachMessage, type CoachQuestion, type CoachReply,
} from '@vyra/core';
import { ApiError, errorMessage, request } from '../lib/api';
import { useApp } from './AppProvider';

const MAX_VISIBLE_EXCHANGES = 8;

export type CoachExchange = {
  key: string;
  question: string;
  payload: CoachQuestion;
  status: 'pending' | 'answered' | 'failed';
  reply?: CoachReply;
  error?: string;
  reconnect?: boolean;
};

interface CoachContextValue {
  isOpen: boolean;
  openCoach(): void;
  closeCoach(): void;
  draft: string;
  setDraft(value: string): void;
  exchanges: CoachExchange[];
  sendingId: string | null;
  formError: string | null;
  historyTrimmed: boolean;
  canAsk: boolean;
  ask(): void;
  retry(exchange: CoachExchange): void;
  startOver(): void;
}

const CoachContext = createContext<CoachContextValue | null>(null);

function conversationFor(exchanges: CoachExchange[]): CoachMessage[] {
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

/** Mount once inside AppProvider, above the router, so minimizing never discards a conversation. */
export function CoachProvider({ children }: React.PropsWithChildren) {
  const { profile, session } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraftState] = useState('');
  const draftRef = useRef('');
  const [exchanges, setExchanges] = useState<CoachExchange[]>([]);
  const exchangesRef = useRef<CoachExchange[]>([]);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [historyTrimmed, setHistoryTrimmed] = useState(false);
  const sending = useRef(false);
  const generation = useRef(0);
  const owner = useRef({ id: profile?.id, apiUrl: session.apiUrl });
  const auth = useRef({ id: profile?.id, apiUrl: session.apiUrl, token: session.token });
  auth.current = { id: profile?.id, apiUrl: session.apiUrl, token: session.token };
  const canAsk = !!profile && !!session.token;

  const updateExchanges = useCallback((change: (current: CoachExchange[]) => CoachExchange[]) => {
    const next = change(exchangesRef.current);
    exchangesRef.current = next;
    setExchanges(next);
  }, []);
  const setDraft = useCallback((value: string) => {
    draftRef.current = value;
    setDraftState(value);
    setFormError(null);
  }, []);
  const openCoach = useCallback(() => setIsOpen(true), []);
  const closeCoach = useCallback(() => { setIsOpen(false); Keyboard.dismiss(); }, []);
  const openProfile = useCallback(() => { closeCoach(); router.push('/profile'); }, [closeCoach]);

  useEffect(() => {
    const next = { id: profile?.id, apiUrl: session.apiUrl };
    if (owner.current.id === next.id && owner.current.apiUrl === next.apiUrl) return;
    const previous = owner.current;
    owner.current = next;
    generation.current += 1; sending.current = false;
    updateExchanges(() => []); setSendingId(null); setFormError(null); setHistoryTrimmed(false);
    // Preserve an unsent guest question on connection, never another player's conversation.
    if (previous.id || previous.apiUrl !== next.apiUrl) setDraft('');
  }, [profile?.id, session.apiUrl, setDraft, updateExchanges]);
  useEffect(() => () => { generation.current += 1; sending.current = false; }, []);

  const send = useCallback(async (payload: CoachQuestion, retryKey?: string) => {
    if (sending.current) return;
    const identity = auth.current;
    if (!identity.id || !identity.token) { openProfile(); return; }
    // An account change may render before its reset effect; don't submit old history in that gap.
    if (owner.current.id !== identity.id || owner.current.apiUrl !== identity.apiUrl) return;
    sending.current = true;
    const currentGeneration = ++generation.current;
    const key = retryKey ?? `${Date.now()}-${currentGeneration}`;
    setSendingId(key); setFormError(null);
    updateExchanges(current => retryKey
      ? current.map(exchange => exchange.key === key ? { ...exchange, status: 'pending', error: undefined, reconnect: false } : exchange)
      : [...current, { key, question: payload.question, payload, status: 'pending' as const }].slice(-MAX_VISIBLE_EXCHANGES));
    const stillCurrent = () => generation.current === currentGeneration
      && auth.current.id === identity.id && auth.current.apiUrl === identity.apiUrl;
    try {
      const reply = await request<unknown>(identity.apiUrl, '/api/coach/chat', { token: identity.token, body: payload });
      if (!stillCurrent()) return;
      if (!isCoachReply(reply)) throw new Error('The coach did not return a complete answer. Try your question again.');
      updateExchanges(current => current.map(exchange => exchange.key === key ? { ...exchange, reply, status: 'answered' } : exchange));
    } catch (failure) {
      if (!stillCurrent()) return;
      const reconnect = failure instanceof ApiError && failure.status === 401;
      updateExchanges(current => current.map(exchange => exchange.key === key ? {
        ...exchange, status: 'failed', reconnect,
        error: reconnect ? 'Your session needs to reconnect. Open Profile, then return to your question.' : errorMessage(failure),
      } : exchange));
    } finally {
      if (generation.current === currentGeneration) { sending.current = false; setSendingId(null); }
    }
  }, [openProfile, updateExchanges]);

  const ask = useCallback(() => {
    if (!auth.current.id || !auth.current.token) { openProfile(); return; }
    if (owner.current.id !== auth.current.id || owner.current.apiUrl !== auth.current.apiUrl) return;
    if (sending.current) return;
    const question = draftRef.current.trim();
    if (!question) { setFormError('Write a question or choose one below.'); return; }
    if (question.length > MAX_COACH_QUESTION_CHARS) { setFormError(`Keep your question within ${MAX_COACH_QUESTION_CHARS} characters.`); return; }
    if (exchangesRef.current.length >= MAX_VISIBLE_EXCHANGES) setHistoryTrimmed(true);
    const payload: CoachQuestion = { question, conversation: conversationFor(exchangesRef.current) };
    setDraft(''); Keyboard.dismiss();
    void send(payload);
  }, [openProfile, send, setDraft]);

  const retry = useCallback((exchange: CoachExchange) => {
    if (!auth.current.id || !auth.current.token) { openProfile(); return; }
    if (sending.current) return;
    const saved = exchangesRef.current.find(current => current.key === exchange.key);
    if (!saved || saved.status !== 'failed') return;
    if (saved.reconnect) { openProfile(); return; }
    void send(saved.payload, saved.key);
  }, [openProfile, send]);

  const startOver = useCallback(() => {
    if (sending.current) return;
    generation.current += 1;
    updateExchanges(() => []); setDraft(''); setSendingId(null); setFormError(null); setHistoryTrimmed(false);
  }, [setDraft, updateExchanges]);

  // Hide old account data immediately, including the render before the reset effect runs.
  const sameOwner = owner.current.id === profile?.id && owner.current.apiUrl === session.apiUrl;
  const visibleDraft = sameOwner || (!owner.current.id && owner.current.apiUrl === session.apiUrl) ? draft : '';
  const value = useMemo<CoachContextValue>(() => ({
    isOpen, openCoach, closeCoach, draft: visibleDraft, setDraft,
    exchanges: sameOwner ? exchanges : [], sendingId: sameOwner ? sendingId : null,
    formError: sameOwner ? formError : null, historyTrimmed: sameOwner && historyTrimmed,
    canAsk, ask, retry, startOver,
  }), [isOpen, openCoach, closeCoach, visibleDraft, setDraft, sameOwner, exchanges, sendingId, formError, historyTrimmed, canAsk, ask, retry, startOver]);
  return <CoachContext.Provider value={value}>{children}</CoachContext.Provider>;
}

export function useCoach(): CoachContextValue {
  const context = useContext(CoachContext);
  if (!context) throw new Error('useCoach must be used within CoachProvider.');
  return context;
}
