import { PROTOCOL_VERSION, TEMPLATES, TIMING } from './index';
import type { Exercise, GameMasterDecision, MatchMode, MatchSnapshot, Phase, PlayerState, RepEvent, TemplateId } from './contracts';

export const REP_CONFIDENCE = 0.65;
export const REP_LATE_WINDOW = 2000;
export const HEARTBEAT_TIMEOUT = 12000;
export interface ExerciseWindow { id: string; exercise: Exercise; startedAt: number; endsAt: number }
export interface TrackingQuality {
  startedAt: number; endsAt: number; firstAt: number | null; lastAt: number | null;
  samples: number; maxGap: number; lost: boolean;
}
export interface MatchState {
  snapshot: MatchSnapshot;
  phaseCounter: number;
  sequence: Record<string, number>;
  lastRepAt: Record<string, number>;
  heartbeats: Record<string, number>;
  exerciseWindow: ExerciseWindow | null;
  botTargets: { squat: number; pushup: number };
  previousHumanReps: { squat: number; pushup: number } | null;
  nextDecision: GameMasterDecision | null;
  aiRequestedForRound: number;
  finishedAt: number | null;
  tracking: Record<string, Partial<Record<Exercise, TrackingQuality>>>;
}
export const DEFAULT_DECISION: GameMasterDecision = {
  template: 'balanced', source: 'fallback', reason: 'A steady opening round. Find a comfortable rhythm.'
};
export function makePlayer(id: string, name: string, isBot = false): PlayerState {
  return { id, name, isBot, ready: isBot, hp: 100, guard: 0, squats: 0, pushups: 0, totalReps: 0 };
}
export function createMatch(id: string, roomCode: string, mode: MatchMode, host: { id: string; name: string }, now: number): MatchState {
  return {
    snapshot: { protocolVersion: PROTOCOL_VERSION, id, roomCode, mode, phase: 'lobby', round: 0,
      phaseId: `${id}:0`, phaseStartedAt: now, phaseEndsAt: 0, serverNow: now,
      players: [makePlayer(host.id, host.name), ...(mode === 'solo' ? [makePlayer(`bot:${id}`, 'VYRA rival', true)] : [])],
      template: 'balanced', decision: { ...DEFAULT_DECISION }, winnerId: null },
    phaseCounter: 0, sequence: {}, lastRepAt: {}, heartbeats: { [host.id]: now }, exerciseWindow: null,
    botTargets: { squat: 5, pushup: 4 }, previousHumanReps: null, nextDecision: null,
    aiRequestedForRound: 0, finishedAt: null, tracking: {}
  };
}
export function isActive(phase: Phase): boolean { return !['lobby', 'finished', 'interrupted'].includes(phase); }
export function joinMatch(state: MatchState, player: { id: string; name: string }, now: number): void {
  if (state.snapshot.players.some(p => p.id === player.id)) return;
  if (state.snapshot.mode !== 'pvp' || state.snapshot.phase !== 'lobby' || state.snapshot.players.length >= 2) throw new Error('Room is full or already started.');
  state.snapshot.players.push(makePlayer(player.id, player.name));
  state.heartbeats[player.id] = now;
}
function enterPhase(state: MatchState, phase: Phase, at: number, duration: number): void {
  const s = state.snapshot;
  s.phase = phase; s.phaseStartedAt = at; s.phaseEndsAt = duration ? at + duration : 0;
  s.phaseId = `${s.id}:${++state.phaseCounter}`;
  if (phase === 'squat' || phase === 'pushup') {
    state.exerciseWindow = { id: s.phaseId, exercise: phase, startedAt: at, endsAt: at + duration };
    state.tracking ??= {};
    for (const player of s.players.filter(p => !p.isBot)) {
      state.tracking[player.id] ??= {};
      state.tracking[player.id][phase] = { startedAt: at, endsAt: at + duration, firstAt: null, lastAt: null, samples: 0, maxGap: 0, lost: false };
    }
  }
}
function beginRound(state: MatchState, at: number): void {
  const s = state.snapshot;
  s.round += 1;
  if (state.nextDecision) { s.decision = state.nextDecision; s.template = state.nextDecision.template; }
  state.nextDecision = null;
  state.tracking = {};
  for (const p of s.players) { p.squats = 0; p.pushups = 0; p.guard = 0; }
  const template = TEMPLATES[s.template];
  // Commit the entire bot round before either participant exercises. Never react to live opponent totals.
  const previous = state.previousHumanReps;
  state.botTargets = {
    squat: Math.max(2, Math.min(10, previous ? Math.round(previous.squat * 0.9) : Math.round(template.squat / 4000))),
    pushup: Math.max(2, Math.min(10, previous ? Math.round(previous.pushup * 0.9) : Math.round(template.pushup / 6500)))
  };
  enterPhase(state, 'squat', at, template.squat);
}
export function readyPlayer(state: MatchState, playerId: string, now: number): void {
  if (state.snapshot.phase !== 'lobby') throw new Error('Create a new match to play again.');
  const player = state.snapshot.players.find(p => p.id === playerId && !p.isBot);
  if (!player) throw new Error('Player is not in this match.');
  player.ready = true; state.heartbeats[playerId] = now;
  if (state.snapshot.players.length === 2 && state.snapshot.players.every(p => p.ready)) enterPhase(state, 'countdown', now, TIMING.countdown);
}
function updateBot(state: MatchState, now: number): void {
  const s = state.snapshot;
  if (s.phase !== 'squat' && s.phase !== 'pushup') return;
  const bot = s.players.find(p => p.isBot);
  if (!bot) return;
  const target = state.botTargets[s.phase];
  const elapsed = Math.max(0, Math.min(now, s.phaseEndsAt) - s.phaseStartedAt);
  const total = Math.min(target, Math.floor(elapsed / ((s.phaseEndsAt - s.phaseStartedAt) / (target + 1))));
  const key = s.phase === 'squat' ? 'squats' : 'pushups';
  bot.totalReps += Math.max(0, total - bot[key]); bot[key] = total;
  if (s.phase === 'squat') bot.guard = guardFor(total);
}
export function guardFor(squats: number): number { return Math.min(0.4, Math.max(0, squats) * 0.05); }
export function damageFor(pushups: number, opponentGuard: number): number { return Math.round(8 * pushups * (1 - Math.min(0.4, Math.max(0, opponentGuard)))); }
function resolveRound(state: MatchState, at: number): void {
  const s = state.snapshot;
  const [a, b] = s.players;
  const toA = damageFor(b.pushups, a.guard);
  const toB = damageFor(a.pushups, b.guard);
  a.hp = Math.max(0, a.hp - toA); b.hp = Math.max(0, b.hp - toB);
  const human = s.players.find(p => !p.isBot)!;
  state.previousHumanReps = { squat: human.squats, pushup: human.pushups };
  for (const p of s.players) p.guard = 0;
  if (a.hp === 0 || b.hp === 0 || s.round === TIMING.maxRounds) {
    s.winnerId = a.hp === b.hp ? null : a.hp > b.hp ? a.id : b.id;
    s.reason = a.hp === b.hp ? 'draw' : a.hp === 0 || b.hp === 0 ? 'knockout' : 'rounds_complete';
    state.finishedAt = at;
    enterPhase(state, 'finished', at, 0);
  } else {
    state.nextDecision = fallbackDecision(state);
    enterPhase(state, 'recovery', at, TIMING.recovery);
  }
}
/** Advances using scheduled deadlines, not event arrival time. An alarm delay cannot extend a workout. */
export function advanceMatch(state: MatchState, now: number): void {
  const s = state.snapshot;
  updateBot(state, now);
  let transitions = 0;
  while (isActive(s.phase) && now >= s.phaseEndsAt && transitions++ < 32) {
    const at = s.phaseEndsAt;
    switch (s.phase) {
      case 'countdown': beginRound(state, at); break;
      case 'squat': enterPhase(state, 'transition', at, TIMING.transition); break;
      case 'transition': enterPhase(state, 'pushup', at, TEMPLATES[s.template].pushup); break;
      case 'pushup': enterPhase(state, 'resolve', at, TIMING.resolve); break;
      case 'resolve': resolveRound(state, at); break;
      case 'recovery': beginRound(state, at); break;
    }
    updateBot(state, now);
  }
  s.serverNow = now;
}
export function recordRep(state: MatchState, playerId: string, event: RepEvent, receivedAt: number): { accepted: boolean; code?: string } {
  const player = state.snapshot.players.find(p => p.id === playerId && !p.isBot);
  const w = state.exerciseWindow;
  if (!player || !isActive(state.snapshot.phase) || !w || event.phaseId !== w.id || event.exercise !== w.exercise) return { accepted: false, code: 'WRONG_PHASE' };
  if ((w.exercise === 'squat' && !['squat', 'transition'].includes(state.snapshot.phase)) ||
      (w.exercise === 'pushup' && !['pushup', 'resolve'].includes(state.snapshot.phase))) return { accepted: false, code: 'WRONG_PHASE' };
  if (!Number.isInteger(event.seq) || event.seq <= (state.sequence[playerId] ?? -1)) return { accepted: false, code: 'DUPLICATE_REP' };
  if (!Number.isFinite(event.confidence) || event.confidence < REP_CONFIDENCE || event.confidence > 1 || typeof event.modelVersion !== 'string' || event.modelVersion.length < 1 || event.modelVersion.length > 120) return { accepted: false, code: 'UNVERIFIED_REP' };
  if (!Number.isFinite(event.occurredAt) || event.occurredAt < w.startedAt || event.occurredAt >= w.endsAt || receivedAt > w.endsAt + REP_LATE_WINDOW || event.occurredAt > receivedAt + 500 || receivedAt - event.occurredAt > REP_LATE_WINDOW) return { accepted: false, code: 'LATE_REP' };
  const minimumInterval = event.exercise === 'squat' ? 600 : 800;
  if (event.occurredAt - (state.lastRepAt[playerId] ?? -Infinity) < minimumInterval) return { accepted: false, code: 'REP_TOO_FAST' };
  state.sequence[playerId] = event.seq; state.lastRepAt[playerId] = event.occurredAt;
  if (event.exercise === 'squat') { player.squats++; player.guard = guardFor(player.squats); }
  else player.pushups++;
  player.totalReps++;
  return { accepted: true };
}
export function interruptMatch(state: MatchState, reason: string, now: number): void {
  if (state.snapshot.phase === 'finished' || state.snapshot.phase === 'interrupted') return;
  state.snapshot.winnerId = null; state.snapshot.reason = reason;
  delete state.snapshot.rewards;
  for (const p of state.snapshot.players) p.ready = p.isBot;
  enterPhase(state, 'interrupted', now, 0); state.snapshot.serverNow = now;
}
export function recordTracking(state: MatchState, playerId: string, phaseId: string, visible: boolean, confidence: number, now: number): boolean {
  const phase = state.snapshot.phase;
  if ((phase !== 'squat' && phase !== 'pushup') || phaseId !== state.snapshot.phaseId || typeof visible !== 'boolean' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return false;
  const quality = state.tracking?.[playerId]?.[phase];
  if (!quality) return false;
  // Initial calibration is not a loss of established tracking. Coverage still starts only
  // after the first sufficiently confident visible sample, with a bounded startup allowance.
  if (!visible || confidence < REP_CONFIDENCE) {
    if (quality.firstAt !== null) quality.lost = true;
    return true;
  }
  if (quality.lastAt !== null && now - quality.lastAt < 500) return true;
  quality.firstAt ??= now;
  if (quality.lastAt !== null) quality.maxGap = Math.max(quality.maxGap, now - quality.lastAt);
  quality.lastAt = now; quality.samples++;
  return true;
}
export function hasReliableTracking(state: MatchState): boolean {
  return state.snapshot.players.filter(p => !p.isBot).every(player => (['squat', 'pushup'] as const).every(exercise => {
    const q = state.tracking?.[player.id]?.[exercise];
    return !!q && !q.lost && q.samples >= Math.floor((q.endsAt - q.startedAt) / 2000) &&
      q.firstAt !== null && q.firstAt <= q.startedAt + 3000 && q.lastAt !== null && q.lastAt >= q.endsAt - 3000 && q.maxGap <= 3000;
  }));
}
export function missingHeartbeat(state: MatchState, now: number): boolean {
  return isActive(state.snapshot.phase) && state.snapshot.players.some(p => !p.isBot && now - (state.heartbeats[p.id] ?? 0) > HEARTBEAT_TIMEOUT);
}
/** A pvp room with both seats filled can otherwise wait in lobby forever if one side joined
 *  (room-code or matchmaking) but never actually connects. Deliberately excludes a lone host
 *  still waiting for someone to use their room code — that wait is expected to be unbounded. */
export function lobbyAbandoned(state: MatchState, now: number): boolean {
  const s = state.snapshot;
  return s.phase === 'lobby' && s.mode === 'pvp' && s.players.length === 2 &&
    s.players.some(p => !p.isBot && now - (state.heartbeats[p.id] ?? 0) > HEARTBEAT_TIMEOUT);
}
export function fallbackDecision(_state?: MatchState): GameMasterDecision {
  return { template: 'balanced', source: 'fallback', reason: 'A balanced pair keeps the pace steady while the Game Master is unavailable.' };
}
export function validateDecision(value: unknown): GameMasterDecision | null {
  if (!value || typeof value !== 'object') return null;
  const decision = value as Record<string, unknown>;
  if (!['recovery', 'balanced', 'push'].includes(String(decision.template)) || typeof decision.reason !== 'string') return null;
  const reason = decision.reason.trim();
  if (!reason || reason.length > 180) return null;
  return { template: decision.template as TemplateId, reason, source: 'ai' };
}
