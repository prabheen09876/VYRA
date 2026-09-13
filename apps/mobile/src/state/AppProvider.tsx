import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Platform } from 'react-native';
import { usePathname } from 'expo-router';
import * as Speech from 'expo-speech';
import {
  PROTOCOL_VERSION, type CaptureMessage, type ClientCommand, type CosmeticSlot,
  type GuestSession, type MatchCreated, type MatchMode,
  type MatchSnapshot, type Profile, type ServerEvent,
  type CharacterId, type FitnessSetupInput, type BodyCheckInInput,
  validateFitnessSetup, validateBodyCheckIn, isCharacterId,
} from '@vyra/core';
import { ApiError, adoptConfiguredApiUrl, defaultApiUrl, errorMessage, normalizeApiUrl, request } from '../lib/api';
import { normalizeRoomCode, roomCodeError } from '../lib/room-code';
import { readSession, saveSession, type SavedSession } from '../lib/storage';
import { rememberExerciseWindow, routeCapturedRep } from '../lib/rep-window';
import { MatchmakingCancelled, openMatchmakingSession, type MatchmakingSession } from '../lib/matchmaking-session';
import { waitForTerminalReceipt } from '../lib/reward-receipt';
import { ARENA_TEST_MODE } from '../lib/testMode';
import { HEARTBEAT_TIMEOUT, LOBBY_HEARTBEAT_TIMEOUT, type ExerciseWindow } from '@vyra/core/match';

type Connection = 'disconnected' | 'connecting' | 'connected' | 'error';
type CaptureRep = Extract<CaptureMessage, { type: 'capture.rep' }>;
type CaptureTracking = Extract<CaptureMessage, { type: 'capture.tracking' }>;
type RewardStatus = 'idle' | 'pending' | 'received' | 'unavailable';
// An explicit EXPO_PUBLIC_API_URL still wins. Without one, a web build follows the host that served
// it rather than assuming `localhost` — see defaultApiUrl for why that distinction decides whether
// two devices share a matchmaking queue. Native has no page to follow, so it asks in Profile.
const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || '';
const defaultUrl = configuredUrl
  || (Platform.OS === 'web' && typeof window !== 'undefined' ? defaultApiUrl(window.location) : '');
const initialSession: SavedSession = { apiUrl: defaultUrl, token: null, name: '', muted: false, reducedMotion: false, identities: {} };
const terminal = (snapshot: MatchSnapshot | null) => !snapshot || snapshot.phase === 'finished' || snapshot.phase === 'interrupted';
const cancelledSearch = () => Object.assign(new Error('Opponent search cancelled.'), { name: 'AbortError' });

interface AppContextValue {
  profile: Profile | null;
  session: SavedSession;
  booting: boolean;
  busy: boolean;
  connectionError: string | null;
  connect: (name: string, apiUrl: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  setPreferences: (patch: Partial<Pick<SavedSession, 'muted' | 'reducedMotion'>>) => void;
  equip: (slot: CosmeticSlot, itemId: string) => Promise<void>;
  unequip: (slot: CosmeticSlot) => Promise<void>;
  resetEquipment: () => Promise<void>;
  setupFitness: (input: FitnessSetupInput) => Promise<void>;
  recordCheckIn: (input: BodyCheckInInput) => Promise<void>;
  selectCharacter: (characterId: CharacterId) => Promise<void>;
  snapshot: MatchSnapshot | null;
  match: MatchCreated | null;
  socketStatus: Connection;
  matchError: string | null;
  localStopped: boolean;
  serverOffset: number;
  createMatch: (mode: MatchMode) => Promise<MatchCreated>;
  joinMatch: (roomCode: string) => Promise<MatchCreated>;
  matchmakingStatus: 'idle' | 'searching';
  enterMatchmaking: () => Promise<MatchCreated>;
  cancelMatchmaking: () => void;
  ready: () => void;
  sendRep: (rep: CaptureRep) => void;
  sendTracking: (tracking: CaptureTracking) => void;
  stopMatch: (reason?: string) => void;
  resetMatch: () => void;
  rewardStatus: RewardStatus;
  rewardError: string | null;
  retryRewardReceipt: () => Promise<void>;
  calibration: { squat: number; pushup: number };
  setCalibration: (exercise: 'squat' | 'pushup', count: number) => void;
  calibrated: boolean;
  announce: (text: string) => void;
}
const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: React.PropsWithChildren) {
  const pathname = usePathname();
  const [session, setSession] = useState<SavedSession>(initialSession);
  const sessionRef = useRef(initialSession);
  const [profile, setProfile] = useState<Profile | null>(null);
  const profileRef = useRef<Profile | null>(null);
  const profileRequests = useRef<Promise<unknown>>(Promise.resolve());
  profileRef.current = profile;
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const snapshotRef = useRef<MatchSnapshot | null>(null);
  const exerciseWindows = useRef<ExerciseWindow[]>([]);
  const [match, setMatch] = useState<MatchCreated | null>(null);
  const [socketStatus, setSocketStatus] = useState<Connection>('disconnected');
  const [matchError, setMatchError] = useState<string | null>(null);
  const [localStopped, setLocalStopped] = useState(false);
  const stoppedRef = useRef(false);
  const [serverOffset, setServerOffset] = useState(0);
  const [rewardStatus, setRewardStatus] = useState<RewardStatus>('idle');
  const [rewardError, setRewardError] = useState<string | null>(null);
  const rewardStatusRef = useRef<RewardStatus>('idle');
  const rewardWaitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rewardRecovery = useRef<AbortController | null>(null);
  const rewardAttempt = useRef(0);
  const serverOffsetRef = useRef(0);
  const socketRef = useRef<WebSocket | null>(null);
  const socketSetup = useRef(0);
  const lastServerMessage = useRef(Date.now());
  const seqRef = useRef(0);
  const trackingRef = useRef({ phaseId: '', sentAt: 0, visible: false });
  const wasMatchRoute = useRef(false);
  const [calibration, setCalibrationState] = useState({ squat: 0, pushup: 0 });
  // At most one live queue connection, plus a counter that says which search attempt owns the UI.
  // Every `await` in enterMatchmaking re-checks the counter, so a search that has been cancelled or
  // superseded can never write state back over the one that replaced it.
  const matchmakingSession = useRef<MatchmakingSession | null>(null);
  /** The last queue socket's close, kept after the session itself is dropped: the next search has to
   *  wait for it even though nothing is "searching" any more. */
  const matchmakingClosed = useRef<Promise<void> | null>(null);
  /** Aborts the current attempt's ticket mint, which happens before any socket exists. */
  const matchmakingAbort = useRef<AbortController | null>(null);
  const matchmakingAttempt = useRef(0);
  const [matchmakingStatus, setMatchmakingStatus] = useState<'idle' | 'searching'>('idle');

  const setRewardState = useCallback((status: RewardStatus, error: string | null = null) => {
    rewardStatusRef.current = status;
    setRewardStatus(status);
    setRewardError(error);
  }, []);

  const cancelRewardWait = useCallback(() => {
    if (rewardWaitTimer.current) clearTimeout(rewardWaitTimer.current);
    rewardWaitTimer.current = null;
    rewardRecovery.current?.abort();
    rewardRecovery.current = null;
    rewardAttempt.current += 1;
  }, []);

  const persist = useCallback((next: SavedSession) => {
    sessionRef.current = next;
    setSession(next);
    void saveSession(next).catch(() => setConnectionError('Your device could not save this session. Keep the app open to retain access, then check device storage.'));
  }, []);

  // Keep profile reads/writes in order so a late refresh cannot undo a saved check-in
  // or character choice in the UI. The server also serializes these with rewards.
  const requestProfile = useCallback((path: string, body?: unknown): Promise<Profile> => {
    const current = sessionRef.current;
    const task = profileRequests.current.catch(() => undefined).then(async () => {
      if (!current.token) throw new Error('Connect your player profile before saving your journey.');
      if (sessionRef.current.token !== current.token || sessionRef.current.apiUrl !== current.apiUrl) throw new Error('Your player profile changed. Please try again.');
      const updated = await request<Profile>(current.apiUrl, path, { token: current.token, body });
      if (sessionRef.current.token !== current.token || sessionRef.current.apiUrl !== current.apiUrl) throw new Error('Your player profile changed. Please try again.');
      profileRef.current = updated;
      setProfile(updated);
      return updated;
    });
    profileRequests.current = task.catch(() => undefined);
    return task;
  }, []);

  const refreshProfile = useCallback(async () => {
    const current = sessionRef.current;
    if (!current.token || !current.apiUrl) return;
    try {
      await requestProfile('/api/profile');
      if (sessionRef.current.apiUrl !== current.apiUrl || sessionRef.current.token !== current.token) return;
      setConnectionError(null);
    } catch (error) {
      if (sessionRef.current.apiUrl !== current.apiUrl || sessionRef.current.token !== current.token) return;
      if (error instanceof ApiError && error.status === 401) {
        const identities = { ...current.identities };
        delete identities[current.apiUrl];
        persist({ ...current, token: null, identities });
        setProfile(null);
      }
      setConnectionError(errorMessage(error));
      throw error;
    }
  }, [persist, requestProfile]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [saved, reducedMotion] = await Promise.all([
          readSession(),
          AccessibilityInfo.isReduceMotionEnabled().catch(() => false),
        ]);
        if (!alive) return;
        const next = { ...initialSession, ...saved, reducedMotion: !!saved?.reducedMotion || reducedMotion };
        // The saved address is spread in last, so on its own it would outrank a configured
        // EXPO_PUBLIC_API_URL on every launch. Adopt the pin instead, and write the corrected
        // session straight back so the superseded address cannot return on the next launch either.
        const adopted = adoptConfiguredApiUrl(next, configuredUrl);
        if (adopted) Object.assign(next, adopted);
        sessionRef.current = next;
        setSession(next);
        if (adopted) void saveSession(next).catch(() => undefined);
        if (next.token && next.apiUrl) await refreshProfile().catch(() => undefined);
      } catch {
        if (alive) setConnectionError('Device settings could not be loaded. Reconnect in Profile to continue.');
      } finally {
        if (alive) setBooting(false);
      }
    })();
    return () => { alive = false; };
  }, [refreshProfile]);

  const connect = useCallback(async (name: string, apiUrl: string) => {
    const normalized = normalizeApiUrl(apiUrl);
    const cleanName = name.trim();
    if (cleanName.length < 2 || cleanName.length > 24) throw new Error('Choose a player name with 2–24 characters.');
    setBusy(true);
    setConnectionError(null);
    try {
      if (sessionRef.current.token && sessionRef.current.apiUrl === normalized) {
        await refreshProfile();
      } else {
        const known = sessionRef.current.identities[normalized];
        if (known) {
          const restored = await request<Profile>(normalized, '/api/profile', { token: known.token });
          persist({ ...sessionRef.current, apiUrl: normalized, name: restored.name, token: known.token });
          setProfile(restored);
        } else {
          const guest = await request<GuestSession>(normalized, '/api/guests', { body: { name: cleanName } });
          persist({
            ...sessionRef.current, apiUrl: normalized, name: guest.profile.name, token: guest.token,
            identities: { ...sessionRef.current.identities, [normalized]: { token: guest.token, name: guest.profile.name } },
          });
          setProfile(guest.profile);
        }
      }
    } catch (error) {
      setConnectionError(errorMessage(error));
      throw error;
    } finally { setBusy(false); }
  }, [persist, refreshProfile]);

  const setPreferences = useCallback((patch: Partial<Pick<SavedSession, 'muted' | 'reducedMotion'>>) => {
    persist({ ...sessionRef.current, ...patch });
    if (patch.muted) void Speech.stop();
  }, [persist]);

  const announce = useCallback((text: string) => {
    if (sessionRef.current.muted || !text) return;
    void Speech.stop();
    Speech.speak(text, { rate: 0.96, pitch: 1.02 });
  }, []);

  const equip = useCallback(async (slot: CosmeticSlot, itemId: string) => {
    await requestProfile('/api/profile/equip', { slot, itemId });
  }, [requestProfile]);
  const unequip = useCallback(async (slot: CosmeticSlot) => {
    await requestProfile('/api/profile/equip', { slot, itemId: null });
  }, [requestProfile]);
  const resetEquipment = useCallback(async () => {
    await requestProfile('/api/profile/equipment/reset', {});
  }, [requestProfile]);

  const setupFitness = useCallback(async (input: FitnessSetupInput) => {
    validateFitnessSetup(input);
    const current = sessionRef.current;
    try { await requestProfile('/api/profile/fitness', input); }
    catch (error) {
      if (sessionRef.current.token !== current.token || sessionRef.current.apiUrl !== current.apiUrl) throw error;
      if (error instanceof ApiError && error.status !== 409) throw error;
      // The server may have committed setup before its response was lost. Recover
      // the saved plan instead of leaving the player trapped in a one-time form.
      const recovered = await requestProfile('/api/profile').catch(() => null);
      const saved = recovered?.fitness;
      if (saved && saved.goal === input.goal && saved.startingBuild === input.startingBuild &&
          saved.startWeightKg === input.weightKg && saved.startHeightCm === input.heightCm &&
          saved.targetWeightKg === input.targetWeightKg) return;
      throw error;
    }
  }, [requestProfile]);
  const recordCheckIn = useCallback(async (input: BodyCheckInInput) => {
    validateBodyCheckIn(input);
    await requestProfile('/api/profile/check-ins', input);
  }, [requestProfile]);
  const selectCharacter = useCallback(async (characterId: CharacterId) => {
    if (!isCharacterId(characterId)) throw new Error('Choose one of the available characters.');
    await requestProfile('/api/profile/character', { characterId });
  }, [requestProfile]);

  const send = useCallback((command: ClientCommand): boolean => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return false;
    socketRef.current.send(JSON.stringify(command));
    return true;
  }, []);

  const stopMatch = useCallback((reason = 'Player stopped the workout') => {
    stoppedRef.current = true;
    setLocalStopped(true);
    send({ type: 'stop', protocolVersion: PROTOCOL_VERSION, reason });
    const socket = socketRef.current;
    setTimeout(() => {
      if (socketRef.current === socket) socket?.close(1000, 'Workout stopped');
    }, 700);
    void Speech.stop();
  }, [send]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      // Native camera permission dialogs briefly make the app inactive. No workout
      // has started while the matched player is completing this camera check.
      if (state === 'inactive' && pathname === '/calibrate' && snapshotRef.current?.phase === 'lobby') return;
      if (state !== 'active' && (socketStatus === 'connecting' || !terminal(snapshotRef.current))) stopMatch('App moved to the background');
    });
    return () => subscription.remove();
  }, [pathname, stopMatch, socketStatus]);

  useEffect(() => {
    // Match setup includes camera preparation. Use the current phase so partial
    // router state cannot close the room before its query params arrive.
    const isMatchRoute = pathname === '/lobby' || pathname === '/battle' || (pathname === '/calibrate' && snapshot?.phase === 'lobby');
    if (isMatchRoute) wasMatchRoute.current = true;
    else if (wasMatchRoute.current || (socketStatus === 'connecting' && pathname !== '/arena')) {
      wasMatchRoute.current = false;
      if (socketStatus === 'connecting' || !terminal(snapshotRef.current)) stopMatch('Player left the arena');
    }
  }, [pathname, snapshot?.phase, stopMatch, socketStatus]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onVisibility = () => {
      if (document.hidden && !terminal(snapshotRef.current)) stopMatch('App moved to the background');
    };
    const onUnload = () => {
      if (!terminal(snapshotRef.current)) stopMatch('Player left the arena');
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onUnload);
    };
  }, [stopMatch]);

  const openSocket = useCallback(async (created: MatchCreated, canConnect: () => boolean = () => true) => {
    if (!canConnect()) throw cancelledSearch();
    const setup = ++socketSetup.current;
    const current = sessionRef.current;
    cancelRewardWait();
    setRewardState('idle');
    socketRef.current?.close();
    socketRef.current = null;
    snapshotRef.current = null;
    exerciseWindows.current = [];
    setSnapshot(null);
    setMatch(created);
    setMatchError(null);
    setLocalStopped(false);
    stoppedRef.current = false;
    seqRef.current = 0;
    lastServerMessage.current = Date.now();
    setSocketStatus('connecting');
    try {
      const result = await request<{ ticket: string }>(current.apiUrl, '/api/matches/' + encodeURIComponent(created.matchId) + '/ticket', {
        token: current.token, method: 'POST', body: {},
      });
      if (setup !== socketSetup.current || !canConnect()) throw cancelledSearch();
      if (stoppedRef.current || AppState.currentState === 'background' || AppState.currentState === 'inactive' ||
          (Platform.OS === 'web' && typeof document !== 'undefined' && document.hidden)) {
        throw new Error('Workout setup stopped because the app left the arena. Return to the app and start again.');
      }
      const url = current.apiUrl.replace(/^http/, 'ws') + '/api/matches/' + encodeURIComponent(created.matchId) + '/ws?ticket=' + encodeURIComponent(result.ticket);
      const socket = new WebSocket(url);
      socketRef.current = socket;
      socket.onopen = () => {
        if (socketRef.current !== socket) return;
        setSocketStatus('connected');
        socket.send(JSON.stringify({ type: 'ping', protocolVersion: PROTOCOL_VERSION, sentAt: Date.now() }));
      };
      socket.onmessage = (message) => {
        if (socketRef.current !== socket) return;
        let event: ServerEvent;
        try { event = JSON.parse(String(message.data)) as ServerEvent; } catch { return; }
        if (event.type === 'snapshot') {
          if (event.snapshot.protocolVersion !== PROTOCOL_VERSION || event.snapshot.id !== created.matchId) return;
          lastServerMessage.current = Date.now();
          const previous = snapshotRef.current;
          exerciseWindows.current = rememberExerciseWindow(exerciseWindows.current, event.snapshot);
          snapshotRef.current = event.snapshot;
          setSnapshot(event.snapshot);
          if (!previous) {
            const offset = event.snapshot.serverNow - Date.now();
            serverOffsetRef.current = offset;
            setServerOffset(offset);
          }
          if (previous?.phaseId !== event.snapshot.phaseId) {
            const cues: Partial<Record<MatchSnapshot['phase'], string>> = {
              countdown: 'Get ready. Your workout starts in five seconds.',
              squat: 'Squats. Move at your own pace.',
              transition: 'Change position. Get ready for push-ups.',
              pushup: 'Push-ups. Keep your body in frame.',
              recovery: 'Recovery. Take a breath.',
              finished: 'Workout complete. Your results are ready.',
              interrupted: 'Workout stopped.',
            };
            if (cues[event.snapshot.phase]) announce(cues[event.snapshot.phase]!);
          }
          if (event.snapshot.phase === 'finished' && (
            previous?.phase !== 'finished' ||
            Object.keys(event.snapshot.rewards || {}).length > Object.keys(previous.rewards || {}).length
          )) void refreshProfile().catch(() => undefined);
          const playerId = profileRef.current?.id;
          if (event.snapshot.phase === 'finished') {
            if (playerId && event.snapshot.rewards?.[playerId]) {
              if (rewardWaitTimer.current) clearTimeout(rewardWaitTimer.current);
              rewardWaitTimer.current = null;
              setRewardState('received');
              socket.close(1000, 'Workout complete');
            } else if (rewardStatusRef.current === 'idle') {
              setRewardState('pending');
              rewardWaitTimer.current = setTimeout(() => {
                rewardWaitTimer.current = null;
                if (socketRef.current !== socket || rewardStatusRef.current !== 'pending') return;
                setRewardState('unavailable', 'The reward receipt is taking longer than expected. Your completed match is saved; retry to retrieve it.');
                socket.close(1000, 'Reward receipt wait timed out');
              }, 15000);
            }
          } else if (event.snapshot.phase === 'interrupted') socket.close(1000, 'Workout complete');
        } else if (event.type === 'error') {
          lastServerMessage.current = Date.now();
          setMatchError(event.message);
        } else if (event.type === 'pong') {
          if (!Number.isFinite(event.serverNow) || !Number.isFinite(event.sentAt)) return;
          lastServerMessage.current = Date.now();
          const offset = event.serverNow - (event.sentAt + Date.now()) / 2;
          serverOffsetRef.current = offset;
          setServerOffset(offset);
        }
      };
      socket.onerror = () => {
        if (socketRef.current !== socket) return;
        setSocketStatus('error');
        setMatchError('The arena connection failed. Return home and start a fresh workout when your connection is stable.');
      };
      socket.onclose = () => {
        if (socketRef.current !== socket) return;
        setSocketStatus('disconnected');
        if (snapshotRef.current?.phase === 'finished' && rewardStatusRef.current !== 'received') {
          if (rewardWaitTimer.current) clearTimeout(rewardWaitTimer.current);
          rewardWaitTimer.current = null;
          if (rewardStatusRef.current !== 'unavailable') setRewardState('unavailable', 'The connection closed before your reward receipt arrived. Retry to retrieve the saved result.');
        }
        if ((!snapshotRef.current || !terminal(snapshotRef.current)) && !stoppedRef.current) {
          setMatchError('The connection was lost and this workout cannot continue. No local result will be awarded.');
          setLocalStopped(true);
          stoppedRef.current = true;
        }
      };
    } catch (error) {
      if (setup === socketSetup.current) {
        setSocketStatus(canConnect() ? 'error' : 'disconnected');
        if (canConnect()) setMatchError(errorMessage(error));
      }
      throw error;
    }
  }, [announce, refreshProfile, cancelRewardWait, setRewardState]);

  useEffect(() => {
    if (socketStatus !== 'connected' && socketStatus !== 'connecting') return;
    const timer = setInterval(() => {
      const timeout = snapshotRef.current?.phase === 'lobby' ? LOBBY_HEARTBEAT_TIMEOUT : HEARTBEAT_TIMEOUT;
      if (Date.now() - lastServerMessage.current > timeout) {
        stoppedRef.current = true;
        setLocalStopped(true);
        setSocketStatus('error');
        setMatchError('The arena stopped responding. This workout has stopped; reconnect before starting another.');
        socketRef.current?.close(1000, 'Server heartbeat lost');
      } else if (socketStatus === 'connected') {
        send({ type: 'ping', protocolVersion: PROTOCOL_VERSION, sentAt: Date.now() });
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [send, socketStatus]);

  useEffect(() => () => {
    socketSetup.current += 1;
    socketRef.current?.close();
    matchmakingAttempt.current += 1;
    void matchmakingSession.current?.cancel();
    matchmakingSession.current = null;
    if (rewardWaitTimer.current) clearTimeout(rewardWaitTimer.current);
    rewardRecovery.current?.abort();
    rewardAttempt.current += 1;
    void Speech.stop();
  }, []);

  const retryRewardReceipt = useCallback(async () => {
    const completed = snapshotRef.current;
    const current = sessionRef.current;
    const playerId = profileRef.current?.id;
    if (!completed || completed.phase !== 'finished' || !current.token || !playerId) {
      setRewardState('unavailable', 'Reconnect your player profile before retrieving this completed workout’s receipt.');
      return;
    }
    if (completed.rewards?.[playerId]) { setRewardState('received'); return; }
    if (rewardStatusRef.current === 'pending') return;
    cancelRewardWait();
    const attempt = rewardAttempt.current;
    const controller = new AbortController();
    rewardRecovery.current = controller;
    const previousSocket = socketRef.current;
    socketRef.current = null;
    previousSocket?.close(1000, 'Switching to receipt lookup');
    setSocketStatus('disconnected');
    setRewardState('pending');
    try {
      const { ticket } = await request<{ ticket: string }>(current.apiUrl, '/api/matches/' + encodeURIComponent(completed.id) + '/ticket', {
        token: current.token, method: 'POST', body: {},
      });
      if (controller.signal.aborted || attempt !== rewardAttempt.current) return;
      const recovered = await waitForTerminalReceipt({
        url: current.apiUrl.replace(/^http/, 'ws') + '/api/matches/' + encodeURIComponent(completed.id) + '/ws?ticket=' + encodeURIComponent(ticket),
        matchId: completed.id, playerId, signal: controller.signal,
      });
      if (controller.signal.aborted || attempt !== rewardAttempt.current) return;
      if (sessionRef.current.token !== current.token) {
        setRewardState('unavailable', 'Your player profile changed during retrieval. Reconnect the original player before retrying this receipt.');
        return;
      }
      snapshotRef.current = recovered;
      setSnapshot(recovered);
      setRewardState('received');
      void refreshProfile().catch(() => undefined);
    } catch (error) {
      if (!controller.signal.aborted && attempt === rewardAttempt.current) setRewardState('unavailable', errorMessage(error));
    } finally {
      if (rewardRecovery.current === controller) rewardRecovery.current = null;
    }
  }, [cancelRewardWait, refreshProfile, setRewardState]);

  const createMatch = useCallback(async (mode: MatchMode) => {
    if (!sessionRef.current.token) throw new Error('Connect your player profile before entering the arena.');
    const created = await request<MatchCreated>(sessionRef.current.apiUrl, '/api/matches', { token: sessionRef.current.token, body: { mode } });
    await openSocket(created);
    return created;
  }, [openSocket]);

  const joinMatch = useCallback(async (roomCode: string) => {
    // Check the shape the join route accepts before spending a request on it. A code of the wrong
    // length, or one pasted with the full stop the share text ends in, matches no route and returns
    // "API route not found." — which blames the server for what is really a mistyped code. The
    // worker still does its own check; this only decides which message the player reads.
    const problem = roomCodeError(roomCode);
    if (problem) throw new Error(problem);
    const code = normalizeRoomCode(roomCode);
    if (!sessionRef.current.token) throw new Error('Connect your player profile before joining a room.');
    const created = await request<MatchCreated>(sessionRef.current.apiUrl, '/api/rooms/' + encodeURIComponent(code) + '/join', {
      token: sessionRef.current.token, method: 'POST', body: {},
    });
    await openSocket(created);
    return created;
  }, [openSocket]);

  /** Ends any live search and waits for its socket to be gone. Safe to call at any time: with no
   *  search running it does nothing, so leaving the arena or finishing a room-code match never
   *  disturbs the battle socket, which lives in socketRef and is untouched here.
   *
   *  Deliberately refs-only — no state reads — so its identity, and cancelMatchmaking's, stay stable
   *  for the lifetime of the provider. Screens hang unmount cleanups off cancelMatchmaking; an
   *  identity that changed with matchmakingStatus would re-run those cleanups on every transition
   *  and cancel the search that caused them. */
  const releaseMatchmaking = useCallback(async () => {
    matchmakingAbort.current?.abort();
    matchmakingAbort.current = null;
    const session = matchmakingSession.current;
    matchmakingSession.current = null;
    void session?.cancel();
    // Await the socket, not the session: a cancel already in flight has cleared the ref above while
    // its socket is still closing, and starting the next search then would hit ALREADY_CONNECTED.
    await matchmakingClosed.current;
  }, []);

  const cancelMatchmaking = useCallback(() => {
    matchmakingAttempt.current += 1;
    setMatchmakingStatus('idle');
    void releaseMatchmaking();
  }, [releaseMatchmaking]);

  // A search belongs to the arena and nowhere else. The screen's own unmount cleanup cannot be the
  // only guard: app/_layout.tsx renders a <Stack>, which keeps /arena mounted underneath anything
  // pushed on top of it — including the always-visible profile avatar in ui.tsx — so its cleanup
  // does not run for every way out of the screen. This catches the rest. Unconditional on purpose:
  // it only ends a live search, and a pairing that has reached openSocket has already released its
  // session, so arriving at /lobby cannot cancel the battle it just created.
  useEffect(() => { if (pathname !== '/arena') cancelMatchmaking(); }, [pathname, cancelMatchmaking]);

  // "Battle with Randoms": pairs with another waiting player, then hands off into the exact same
  // openSocket()/MatchRoom path room-code matches already use — no separate battle logic here.
  const enterMatchmaking = useCallback(async (): Promise<MatchCreated> => {
    const current = sessionRef.current;
    if (!current.token) throw new Error('Connect your player profile before entering the arena.');
    const attempt = ++matchmakingAttempt.current;
    const superseded = () => matchmakingAttempt.current !== attempt;
    // Synchronously, before any await. The arena's Cancel affordance is gated on this status, and
    // the prelude below — closing a previous socket, then minting a ticket — can take seconds on a
    // cold server. A search the player cannot call off is the bug, not the waiting.
    setMatchmakingStatus('searching');
    try {
      // Wait out any previous search before claiming the queue slot. The Matchmaking Durable Object
      // answers a second socket for the same player with 409 ALREADY_CONNECTED, so searching again
      // straight after a cancel used to fail until the old socket happened to finish closing.
      await releaseMatchmaking();
      if (superseded()) throw new MatchmakingCancelled();
      const abort = new AbortController();
      matchmakingAbort.current = abort;
      const { ticket } = await request<{ ticket: string }>(current.apiUrl, '/api/matchmaking/ticket', { token: current.token, method: 'POST', body: {}, signal: abort.signal });
      if (superseded()) throw new MatchmakingCancelled();
      const session = openMatchmakingSession({
        url: current.apiUrl.replace(/^http/, 'ws') + '/api/matchmaking/ws?ticket=' + encodeURIComponent(ticket),
      });
      matchmakingSession.current = session;
      matchmakingClosed.current = session.closed;
      let created: MatchCreated;
      // The session owns its own outcome, so a `matched` event is never dropped for belonging to the
      // "wrong" socket — there is only ever one, and it is released the moment it settles.
      try { created = await session.matched; }
      finally { if (matchmakingSession.current === session) matchmakingSession.current = null; }
      if (superseded()) { await session.cancel(); throw new MatchmakingCancelled(); }
      setMatchmakingStatus('idle');
      // Guarded, not bare: openSocket awaits a ticket mint of its own, and a cancel that lands in
      // that window has to stop the battle socket from ever opening. It reports a refusal by
      // throwing, which the catch below re-labels as the cancellation it actually is.
      await openSocket(created, () => !superseded());
      return created;
    } catch (error) {
      // Anything that fails after this attempt lost ownership is reported as a cancellation, not as
      // an error: the abort above surfaces as a failed fetch, and whoever superseded us — a cancel,
      // or the next search — already owns the status. Touching it here would clear theirs.
      if (superseded()) throw new MatchmakingCancelled();
      setMatchmakingStatus('idle');
      throw error instanceof Error ? error : new Error('Could not start matchmaking.');
    }
  }, [openSocket, releaseMatchmaking]);

  const ready = useCallback(() => {
    if (!ARENA_TEST_MODE && (calibration.squat < 2 || calibration.pushup < 2)) {
      setMatchError('Complete two practice squats and two practice push-ups before getting ready.');
      return;
    }
    setMatchError(null);
    if (!send({ type: 'ready', protocolVersion: PROTOCOL_VERSION })) setMatchError('Wait for the arena connection, then try again.');
  }, [calibration, send]);

  const sendRep = useCallback((rep: CaptureRep) => {
    const current = snapshotRef.current;
    if (!current || socketRef.current?.readyState !== WebSocket.OPEN) return;
    const event = routeCapturedRep({
      rep, windows: exerciseWindows.current, phase: current.phase,
      serverOffset: serverOffsetRef.current, clientNow: Date.now(), stopped: stoppedRef.current,
    });
    if (!event) return;
    seqRef.current += 1;
    send({
      type: 'rep', protocolVersion: PROTOCOL_VERSION,
      event: { ...event, seq: seqRef.current },
    });
  }, [send]);

  const sendTracking = useCallback((tracking: CaptureTracking) => {
    const current = snapshotRef.current;
    if (stoppedRef.current || !current || !['squat', 'pushup'].includes(current.phase) || socketRef.current?.readyState !== WebSocket.OPEN) return;
    if (!Number.isFinite(tracking.confidence)) return;
    const previous = trackingRef.current;
    const now = Date.now();
    const newPhase = previous.phaseId !== current.phaseId;
    const visibilityLost = !tracking.visible && previous.visible;
    if (!newPhase && !visibilityLost && now - previous.sentAt < 1000) return;
    trackingRef.current = { phaseId: current.phaseId, sentAt: now, visible: tracking.visible };
    send({
      type: 'tracking', protocolVersion: PROTOCOL_VERSION, phaseId: current.phaseId,
      visible: tracking.visible, confidence: Math.min(1, Math.max(0, tracking.confidence)),
    });
  }, [send]);

  const resetMatch = useCallback(() => {
    socketSetup.current += 1;
    cancelRewardWait();
    setRewardState('idle');
    if (!terminal(snapshotRef.current)) stopMatch();
    socketRef.current?.close();
    socketRef.current = null;
    snapshotRef.current = null;
    exerciseWindows.current = [];
    setSnapshot(null);
    setMatch(null);
    setSocketStatus('disconnected');
    setMatchError(null);
    setLocalStopped(false);
    wasMatchRoute.current = false;
  }, [stopMatch, cancelRewardWait, setRewardState]);

  const setCalibration = useCallback((exercise: 'squat' | 'pushup', count: number) => {
    setCalibrationState(current => ({ ...current, [exercise]: Math.min(2, Math.max(0, count)) }));
  }, []);

  return <AppContext.Provider value={{
    profile, session, booting, busy, connectionError, connect, refreshProfile, setPreferences, equip, unequip, resetEquipment,
    setupFitness, recordCheckIn, selectCharacter,
    snapshot, match, socketStatus, matchError, localStopped, serverOffset,
    createMatch, joinMatch, matchmakingStatus, enterMatchmaking, cancelMatchmaking, ready, sendRep, sendTracking, stopMatch, resetMatch,
    rewardStatus, rewardError, retryRewardReceipt,
    calibration, setCalibration, calibrated: ARENA_TEST_MODE || (calibration.squat >= 2 && calibration.pushup >= 2), announce,
  }}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('VYRA screens must be inside AppProvider.');
  return context;
}
