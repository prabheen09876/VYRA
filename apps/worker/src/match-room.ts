import { DurableObject } from 'cloudflare:workers';
import type { ClientCommand, MatchMode, MatchSnapshot, ServerEvent } from '@vyra/core';
import {
  advanceMatch, createMatch, HEARTBEAT_TIMEOUT, LOBBY_HEARTBEAT_TIMEOUT, interruptMatch, isActive, joinMatch,
  lobbyAbandoned, missingHeartbeat, readyPlayer, recordRep, recordTracking, type MatchState
} from '@vyra/core/match';
import { chooseNextRound } from './game-master';
import { hashToken, randomToken } from './http';

interface SocketIdentity { playerId: string }
export class MatchRoom extends DurableObject<Env> {
  private settling = false;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS match_state (singleton INTEGER PRIMARY KEY CHECK(singleton=1), json TEXT NOT NULL)');
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS tickets (hash TEXT PRIMARY KEY, player_id TEXT NOT NULL, expires_at INTEGER NOT NULL)');
  }
  private load(): MatchState | null {
    const row = this.ctx.storage.sql.exec<{ json: string }>('SELECT json FROM match_state WHERE singleton=1').toArray()[0];
    return row ? JSON.parse(row.json) as MatchState : null;
  }
  private save(state: MatchState): void {
    this.ctx.storage.sql.exec('INSERT INTO match_state (singleton, json) VALUES (1, ?) ON CONFLICT(singleton) DO UPDATE SET json=excluded.json', JSON.stringify(state));
  }
  private send(socket: WebSocket, event: ServerEvent): void { try { socket.send(JSON.stringify(event)); } catch { /* close handler/heartbeat handles a vanished peer */ } }
  private broadcast(snapshot: MatchSnapshot): void { for (const socket of this.ctx.getWebSockets()) this.send(socket, { type: 'snapshot', snapshot }); }
  private tick(state: MatchState, now: number): void {
    const disconnected = isActive(state.snapshot.phase) && state.snapshot.players.some(p =>
      !p.isBot && !this.ctx.getWebSockets(p.id).some(socket => socket.readyState === WebSocket.OPEN));
    if (disconnected || missingHeartbeat(state, now)) interruptMatch(state, 'Connection lost. Start a new friendly match when both players are ready.', now);
    else if (lobbyAbandoned(state, now)) interruptMatch(state, 'The other player never connected. Start a new match when ready.', now);
    else advanceMatch(state, now);
  }
  private async publish(): Promise<void> {
    await this.ctx.storage.sync();
    const state = this.load(); if (!state) return;
    state.snapshot.serverNow = Date.now();
    this.broadcast(state.snapshot);
    await this.schedule();
    const current = this.load();
    if (current?.snapshot.phase === 'recovery' && current.aiRequestedForRound < current.snapshot.round + 1) {
      current.aiRequestedForRound = current.snapshot.round + 1;
      this.save(current);
      this.ctx.waitUntil(this.requestDecision(structuredClone(current)));
    }
    if (state.snapshot.phase === 'finished') this.ctx.waitUntil(this.settleRewards());
  }
  private async schedule(): Promise<void> {
    const state = this.load(); if (!state) return;
    const s = state.snapshot;
    if (isActive(s.phase)) {
      const heartbeatDeadline = Math.min(...s.players.filter(p => !p.isBot).map(p => (state.heartbeats[p.id] ?? 0) + HEARTBEAT_TIMEOUT + 1));
      await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, Math.min(Date.now() + 1000, s.phaseEndsAt, heartbeatDeadline)));
    } else if (s.phase === 'lobby' && s.mode === 'pvp' && s.players.length === 2) {
      // Both seats are filled (room-code join or matchmaking pairing); make sure an absent
      // second player eventually times the room out instead of waiting in lobby forever.
      const heartbeatDeadline = Math.min(...s.players.filter(p => !p.isBot).map(p => (state.heartbeats[p.id] ?? 0) + LOBBY_HEARTBEAT_TIMEOUT + 1));
      await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, heartbeatDeadline));
    } else if (s.phase === 'finished' && s.players.some(p => !p.isBot && !s.rewards?.[p.id])) {
      await this.ctx.storage.setAlarm(Date.now() + 3000);
    } else await this.ctx.storage.deleteAlarm();
  }
  private async requestDecision(requestState: MatchState): Promise<void> {
    const decision = await chooseNextRound(this.env.AI, String(this.env.AI_ENABLED) === 'true', requestState);
    const state = this.load();
    if (!state || state.snapshot.phase !== 'recovery' || Date.now() >= state.snapshot.phaseEndsAt || state.snapshot.round !== requestState.snapshot.round) return;
    state.nextDecision = decision;
    // The current snapshot explains the upcoming pair during recovery.
    state.snapshot.decision = decision;
    this.save(state); await this.ctx.storage.sync();
    const latest = this.load(); if (latest) this.broadcast(latest.snapshot);
  }
  private async settleRewards(): Promise<void> {
    if (this.settling) return;
    this.settling = true;
    try {
      const state = this.load();
      if (!state || state.snapshot.phase !== 'finished' || state.finishedAt === null) return;
      for (const player of state.snapshot.players.filter(p => !p.isBot)) {
        if (this.load()?.snapshot.rewards?.[player.id]) continue;
        const receipt = await this.env.PROFILES.getByName(player.id).settle(player.id, {
          matchId: state.snapshot.id, totalReps: player.totalReps,
          won: state.snapshot.winnerId === player.id, finishedAt: state.finishedAt
        });
        const current = this.load(); if (!current || current.snapshot.phase !== 'finished') return;
        current.snapshot.rewards = { ...current.snapshot.rewards, [player.id]: receipt };
        this.save(current); await this.ctx.storage.sync();
        const latest = this.load(); if (latest) this.broadcast(latest.snapshot);
      }
    } catch {
      console.error(JSON.stringify({ event: 'reward_settlement_retry', matchId: this.load()?.snapshot.id }));
    } finally { this.settling = false; await this.schedule(); }
  }
  async initialize(input: { id: string; roomCode: string; mode: MatchMode; host: { id: string; name: string } }): Promise<MatchSnapshot> {
    const existing = this.load();
    if (existing) return existing.snapshot;
    const state = createMatch(input.id, input.roomCode, input.mode, input.host, Date.now());
    this.save(state); await this.ctx.storage.sync(); return state.snapshot;
  }
  async join(player: { id: string; name: string }): Promise<{ snapshot?: MatchSnapshot; error?: string }> {
    const state = this.load(); if (!state) return { error: 'Room not found.' };
    try { joinMatch(state, player, Date.now()); } catch { return { error: 'This room is full or already started.' }; }
    this.save(state); await this.publish(); return { snapshot: this.load()!.snapshot };
  }
  async mintTicket(playerId: string): Promise<string | null> {
    const state = this.load();
    if (!state?.snapshot.players.some(p => p.id === playerId && !p.isBot)) return null;
    const token = randomToken(); const hashed = await hashToken(token);
    this.ctx.storage.sql.exec('DELETE FROM tickets WHERE expires_at < ? OR player_id = ?', Date.now(), playerId);
    this.ctx.storage.sql.exec('INSERT INTO tickets (hash, player_id, expires_at) VALUES (?, ?, ?)', hashed, playerId, Date.now() + 30000);
    await this.ctx.storage.sync(); return token;
  }
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return Response.json({ error: 'WEBSOCKET_REQUIRED' }, { status: 426 });
    const token = new URL(request.url).searchParams.get('ticket');
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return Response.json({ error: 'INVALID_TICKET' }, { status: 401 });
    const hashed = await hashToken(token);
    const row = this.ctx.storage.sql.exec<{ player_id: string }>('DELETE FROM tickets WHERE hash = ? AND expires_at > ? RETURNING player_id', hashed, Date.now()).toArray()[0];
    if (!row) return Response.json({ error: 'INVALID_TICKET' }, { status: 401 });
    const state = this.load(); if (!state) return Response.json({ error: 'MATCH_NOT_FOUND' }, { status: 404 });
    if (this.ctx.getWebSockets(row.player_id).length) return Response.json({ error: 'ALREADY_CONNECTED' }, { status: 409 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ playerId: row.player_id } satisfies SocketIdentity);
    this.ctx.acceptWebSocket(server, [row.player_id]);
    this.tick(state, Date.now()); state.heartbeats[row.player_id] = Date.now();
    this.save(state); await this.publish();
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const identity = socket.deserializeAttachment() as SocketIdentity | null;
    if (!identity) { socket.close(1008, 'Missing player identity'); return; }
    let command: ClientCommand;
    try {
      if (typeof raw !== 'string' || raw.length > 4096) throw new Error('Invalid message');
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !('protocolVersion' in parsed) || parsed.protocolVersion !== 1 || !('type' in parsed)) throw new Error('Invalid protocol');
      command = parsed as ClientCommand;
    } catch { this.send(socket, { type: 'error', code: 'INVALID_COMMAND', message: 'Invalid protocol message.' }); return; }
    const state = this.load(); if (!state) return;
    const now = Date.now(); this.tick(state, now);
    let error: { code: string; message: string } | undefined;
    switch (command.type) {
      case 'ping':
        if (!Number.isFinite(command.sentAt)) { error = { code: 'INVALID_PING', message: 'Ping timestamp must be finite.' }; break; }
        state.heartbeats[identity.playerId] = now;
        this.send(socket, { type: 'pong', sentAt: command.sentAt, serverNow: now });
        break;
      case 'ready':
        try { readyPlayer(state, identity.playerId, now); } catch (e) { error = { code: 'NOT_READY', message: e instanceof Error ? e.message : 'Cannot start this match.' }; }
        break;
      case 'rep': {
        if (!command.event || typeof command.event !== 'object') { error = { code: 'INVALID_REP', message: 'Missing rep event.' }; break; }
        const result = recordRep(state, identity.playerId, command.event, now);
        if (result.accepted) state.heartbeats[identity.playerId] = now;
        else if (result.code !== 'DUPLICATE_REP') error = { code: result.code ?? 'INVALID_REP', message: 'This rep was not counted. Keep your full body visible and follow the current phase.' };
        break;
      }
      case 'tracking':
        if (recordTracking(state, identity.playerId, command.phaseId, command.visible, command.confidence, now)) state.heartbeats[identity.playerId] = now;
        break;
      case 'stop': interruptMatch(state, 'A player stopped or left the app. No win or XP was awarded.', now); break;
      default: error = { code: 'UNKNOWN_COMMAND', message: 'Unsupported command.' };
    }
    this.save(state); await this.publish();
    if (error) this.send(socket, { type: 'error', ...error });
  }
  async webSocketClose(socket: WebSocket, code: number): Promise<void> {
    const identity = socket.deserializeAttachment() as SocketIdentity | null;
    const state = this.load();
    if (state && identity) {
      if (isActive(state.snapshot.phase)) interruptMatch(state, 'A player disconnected. Start a new match when ready.', Date.now());
      else if (state.snapshot.phase === 'lobby') {
        const player = state.snapshot.players.find(p => p.id === identity.playerId); if (player) player.ready = false;
      }
      this.save(state); await this.publish();
    }
    try { socket.close(code === 1005 ? 1000 : code, 'Connection closed'); } catch { /* already closed */ }
  }
  async webSocketError(socket: WebSocket): Promise<void> { await this.webSocketClose(socket, 1011); }
  async alarm(): Promise<void> {
    const state = this.load(); if (!state) return;
    this.tick(state, Date.now()); this.save(state); await this.publish();
  }
}
