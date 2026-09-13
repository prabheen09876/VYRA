import { DurableObject } from 'cloudflare:workers';
import type { MatchmakingCommand, MatchmakingEvent } from '@vyra/core';
import { createQueue, enterQueue, leaveQueue, type QueueEntry, type QueueState } from '@vyra/core/matchmaking';
import { createPvpMatchRecord } from './matches';
import { hashToken, randomToken } from './http';
import { SocketBudgets } from './rate-limit';

interface SocketIdentity { playerId: string }
const TICKET_TTL_MS = 30000;

/** A single global queue: one instance handles all "Battle with Randoms" traffic, so pairing is
 *  naturally atomic (a Durable Object processes one request/message to completion before the
 *  next). This intentionally does not shard across regions/instances — reasonable for the
 *  current scale, called out in docs as a known limitation rather than solved speculatively. */
export class Matchmaking extends DurableObject<Env> {
  /**
   * 4 messages a second sustained, 20 in a burst, per socket. A searching client sends a ping every
   * three seconds and one `cancel`, so this is far above any honest use. It matters more here than
   * in a match room because this object is a single global instance: every player queueing shares
   * it, so one socket's flood is contention for everyone searching, not just for its own room.
   */
  private budgets = new SocketBudgets(20, 4);
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS queue (player_id TEXT PRIMARY KEY, name TEXT NOT NULL, queued_at INTEGER NOT NULL)');
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS tickets (hash TEXT PRIMARY KEY, player_id TEXT NOT NULL, name TEXT NOT NULL, expires_at INTEGER NOT NULL)');
  }
  private loadQueue(): QueueState {
    const rows = this.ctx.storage.sql.exec<{ player_id: string; name: string; queued_at: number }>('SELECT player_id, name, queued_at FROM queue ORDER BY queued_at ASC').toArray();
    return { waiting: rows.map(row => ({ playerId: row.player_id, name: row.name, queuedAt: row.queued_at })) };
  }
  private saveQueue(state: QueueState): void {
    this.ctx.storage.sql.exec('DELETE FROM queue');
    for (const entry of state.waiting) this.ctx.storage.sql.exec('INSERT INTO queue (player_id, name, queued_at) VALUES (?, ?, ?)', entry.playerId, entry.name, entry.queuedAt);
  }
  private send(socket: WebSocket, event: MatchmakingEvent): void { try { socket.send(JSON.stringify(event)); } catch { /* peer vanished; close handler cleans up */ } }
  private removeFromQueue(playerId: string): void {
    const state = this.loadQueue();
    if (leaveQueue(state, playerId)) this.saveQueue(state);
  }
  async mintTicket(playerId: string, name: string): Promise<string> {
    const token = randomToken(); const hashed = await hashToken(token);
    this.ctx.storage.sql.exec('DELETE FROM tickets WHERE expires_at < ? OR player_id = ?', Date.now(), playerId);
    this.ctx.storage.sql.exec('INSERT INTO tickets (hash, player_id, name, expires_at) VALUES (?, ?, ?, ?)', hashed, playerId, name, Date.now() + TICKET_TTL_MS);
    return token;
  }
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return Response.json({ error: 'WEBSOCKET_REQUIRED' }, { status: 426 });
    const token = new URL(request.url).searchParams.get('ticket');
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return Response.json({ error: 'INVALID_TICKET' }, { status: 401 });
    const hashed = await hashToken(token);
    const row = this.ctx.storage.sql.exec<{ player_id: string; name: string }>('DELETE FROM tickets WHERE hash = ? AND expires_at > ? RETURNING player_id, name', hashed, Date.now()).toArray()[0];
    if (!row) return Response.json({ error: 'INVALID_TICKET' }, { status: 401 });
    if (this.ctx.getWebSockets(row.player_id).length) return Response.json({ error: 'ALREADY_CONNECTED' }, { status: 409 });

    // Drop entries whose socket is gone, before accepting the new one so that this player's own
    // leftover row is dropped too. Queue rows are persisted but `webSocketClose` is not guaranteed:
    // a `wrangler dev` reload, a slept laptop or a half-open Wi-Fi link ends the socket without it,
    // and the row survives in SQLite. Liveness beats a TTL guess here — `getWebSockets` sees through
    // hibernation, so an empty result means that player really is not connected to this queue. A
    // stale row would otherwise be handed out as an opponent nobody is behind.
    const state = this.loadQueue();
    state.waiting = state.waiting.filter(entry => this.ctx.getWebSockets(entry.playerId).length > 0);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ playerId: row.player_id } satisfies SocketIdentity);
    this.ctx.acceptWebSocket(server, [row.player_id]);

    const self: QueueEntry = { playerId: row.player_id, name: row.name, queuedAt: Date.now() };
    const result = enterQueue(state, self);
    this.saveQueue(state); // Synchronous up to here: pairing is decided before any await below.
    if (result.outcome === 'searching') {
      this.send(server, { type: 'searching', protocolVersion: 1 });
    } else {
      // Both players are already removed from the queue at this point (committed above, before
      // any await). If match creation itself fails, the opponent's already-open socket must
      // still hear about it — otherwise they'd be silently stranded, believing they're still
      // searching when they are not queued anywhere anymore.
      try {
        const created = await createPvpMatchRecord(this.env, 'pvp', { id: result.opponent.playerId, name: result.opponent.name });
        await this.env.MATCHES.getByName(created.matchId).join({ id: self.playerId, name: self.name });
        const matched = { type: 'matched', protocolVersion: 1, matchId: created.matchId, roomCode: created.roomCode } as const;
        this.send(server, matched);
        for (const opponentSocket of this.ctx.getWebSockets(result.opponent.playerId)) this.send(opponentSocket, matched);
      } catch (error) {
        console.error(JSON.stringify({ event: 'matchmaking_pair_failed', error: error instanceof Error ? error.name : 'unknown' }));
        const failure = { type: 'error', code: 'MATCH_CREATE_FAILED', message: 'Could not start a match. Please try again.' } as const;
        this.send(server, failure);
        for (const opponentSocket of this.ctx.getWebSockets(result.opponent.playerId)) this.send(opponentSocket, failure);
      }
    }
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const now = Date.now();
    const budget = this.budgets.for(socket, now);
    if (!budget.take(now)) {
      if (budget.shouldDisconnect()) try { socket.close(1008, 'Too many messages'); } catch { /* already closed */ }
      return;
    }
    const identity = socket.deserializeAttachment() as SocketIdentity | null;
    if (!identity) { socket.close(1008, 'Missing player identity'); return; }
    let command: MatchmakingCommand;
    try {
      if (typeof raw !== 'string' || raw.length > 1024) throw new Error('Invalid message');
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !('protocolVersion' in parsed) || parsed.protocolVersion !== 1 || !('type' in parsed)) throw new Error('Invalid protocol');
      command = parsed as MatchmakingCommand;
    } catch { this.send(socket, { type: 'error', code: 'INVALID_COMMAND', message: 'Invalid protocol message.' }); return; }
    switch (command.type) {
      case 'ping':
        if (!Number.isFinite(command.sentAt)) { this.send(socket, { type: 'error', code: 'INVALID_PING', message: 'Ping timestamp must be finite.' }); break; }
        this.send(socket, { type: 'pong', sentAt: command.sentAt, serverNow: now });
        break;
      case 'cancel':
        this.removeFromQueue(identity.playerId);
        try { socket.close(1000, 'Matchmaking cancelled'); } catch { /* already closed */ }
        break;
      default: this.send(socket, { type: 'error', code: 'UNKNOWN_COMMAND', message: 'Unsupported command.' });
    }
  }
  async webSocketClose(socket: WebSocket): Promise<void> {
    const identity = socket.deserializeAttachment() as SocketIdentity | null;
    if (identity) this.removeFromQueue(identity.playerId);
    try { socket.close(1000, 'Connection closed'); } catch { /* already closed */ }
  }
  async webSocketError(socket: WebSocket): Promise<void> { await this.webSocketClose(socket); }
}
