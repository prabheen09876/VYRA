import type { MatchCreated, MatchMode } from '@vyra/core';
import { HttpError } from './http';

export function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), n => alphabet[n % alphabet.length]).join('');
}

/** Shared by the room-code creation route and the matchmaking queue so both paths create
 *  identical match rows and hand off to the exact same MatchRoom Durable Object. */
export async function createPvpMatchRecord(env: Env, mode: MatchMode, host: { id: string; name: string }): Promise<MatchCreated> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const matchId = crypto.randomUUID(), code = generateRoomCode();
    const insertion = await env.DB.prepare('INSERT OR IGNORE INTO matches (id, room_code, mode, created_at) VALUES (?, ?, ?, ?)').bind(matchId, code, mode, Date.now()).run();
    if (!insertion.meta.changes) continue;
    await env.MATCHES.getByName(matchId).initialize({ id: matchId, roomCode: code, mode, host });
    return { matchId, roomCode: code };
  }
  throw new HttpError(503, 'ROOM_UNAVAILABLE', 'Please try creating a room again.');
}
