import { COSMETICS, isCharacterId } from '@vyra/core';
import type { BodyCheckInInput, CosmeticSlot, FitnessSetupInput, GuestSession, MatchCreated } from '@vyra/core';
import { createProgression } from '@vyra/core/progression';
import { authenticate, corsHeaders, hashToken, HttpError, randomToken, readJson } from './http';
import { createPvpMatchRecord } from './matches';
export { MatchRoom } from './match-room';
export { ProfileCoordinator } from './profile';
export { Matchmaking } from './matchmaking';

const MATCHMAKING_QUEUE_NAME = 'global';
async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url), path = url.pathname;
  if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (path === '/api/health' && request.method === 'GET') return Response.json({ ok: true, protocolVersion: 1, aiEnabled: String(env.AI_ENABLED) === 'true' });
  if (path === '/api/guests' && request.method === 'POST') {
    const body = await readJson(request);
    if (typeof body.name !== 'string' || body.name.trim().length < 1 || body.name.trim().length > 24) throw new HttpError(400, 'INVALID_NAME', 'Choose a name between 1 and 24 characters.');
    const name = body.name.trim().replace(/[\u0000-\u001f\u007f]/g, '');
    if (!name) throw new HttpError(400, 'INVALID_NAME', 'Choose a visible name.');
    const id = crypto.randomUUID(), token = randomToken(), state = createProgression(id, name), now = Date.now();
    await env.DB.prepare('INSERT INTO profiles (id, token_hash, state_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, await hashToken(token), JSON.stringify(state), now, now).run();
    return Response.json({ token, profile: state.profile } satisfies GuestSession, { status: 201 });
  }
  const ws = /^\/api\/matches\/([a-f0-9-]{36})\/ws$/.exec(path);
  if (ws && request.method === 'GET') return env.MATCHES.getByName(ws[1]).fetch(request);
  if (path === '/api/matchmaking/ws' && request.method === 'GET') return env.MATCHMAKING.getByName(MATCHMAKING_QUEUE_NAME).fetch(request);
  const playerId = await authenticate(request, env);
  const profiles = env.PROFILES.getByName(playerId);
  if (path === '/api/profile' && request.method === 'GET') {
    const profile = await profiles.getProfile(playerId);
    if (!profile) throw new HttpError(404, 'PROFILE_NOT_FOUND', 'Profile not found.');
    return Response.json(profile);
  }
  if (path === '/api/profile/equip' && request.method === 'POST') {
    const body = await readJson(request);
    if (typeof body.slot !== 'string' || typeof body.itemId !== 'string' || !COSMETICS.some(c => c.id === body.itemId && c.slot === body.slot)) throw new HttpError(400, 'INVALID_COSMETIC', 'Select an existing cosmetic and its matching slot.');
    const result = await profiles.equip(playerId, body.slot as CosmeticSlot, body.itemId);
    if (!result.profile) throw new HttpError(403, 'COSMETIC_LOCKED', result.error ?? 'Cosmetic locked.');
    return Response.json(result.profile);
  }
  if (path === '/api/profile/fitness' && request.method === 'POST') {
    const body = await readJson(request);
    if ((body.goal !== 'gain_weight' && body.goal !== 'lose_weight' && body.goal !== 'maintain_weight')
      || (body.startingBuild !== 'thin' && body.startingBuild !== 'average' && body.startingBuild !== 'broad' && body.startingBuild !== 'prefer_not_to_say')
      || typeof body.heightCm !== 'number' || !Number.isFinite(body.heightCm)
      || typeof body.weightKg !== 'number' || !Number.isFinite(body.weightKg)
      || typeof body.targetWeightKg !== 'number' || !Number.isFinite(body.targetWeightKg)
      || !isCharacterId(body.characterId)) {
      throw new HttpError(400, 'INVALID_FITNESS', 'Choose a goal, starting build, and character, and enter your height, weight, and target weight as numbers.');
    }
    const input: FitnessSetupInput = {
      goal: body.goal, startingBuild: body.startingBuild, heightCm: body.heightCm,
      weightKg: body.weightKg, targetWeightKg: body.targetWeightKg, characterId: body.characterId,
    };
    const result = await profiles.setupFitness(playerId, input);
    if (!result.profile) throw new HttpError(result.status, result.code, result.error);
    return Response.json(result.profile);
  }
  if (path === '/api/profile/check-ins' && request.method === 'POST') {
    const body = await readJson(request);
    if (typeof body.weightKg !== 'number' || !Number.isFinite(body.weightKg)
      || typeof body.heightCm !== 'number' || !Number.isFinite(body.heightCm)) {
      throw new HttpError(400, 'INVALID_CHECK_IN', 'Enter your current weight and height as numbers.');
    }
    const input: BodyCheckInInput = { weightKg: body.weightKg, heightCm: body.heightCm };
    const result = await profiles.recordCheckIn(playerId, input);
    if (!result.profile) throw new HttpError(result.status, result.code, result.error);
    return Response.json(result.profile);
  }
  if (path === '/api/profile/character' && request.method === 'POST') {
    const body = await readJson(request);
    if (!isCharacterId(body.characterId)) throw new HttpError(400, 'INVALID_CHARACTER', 'Choose an available character.');
    const result = await profiles.selectCharacter(playerId, body.characterId);
    if (!result.profile) throw new HttpError(result.status, result.code, result.error);
    return Response.json(result.profile);
  }
  if (path === '/api/matches' && request.method === 'POST') {
    const body = await readJson(request);
    if (body.mode !== 'solo' && body.mode !== 'pvp') throw new HttpError(400, 'INVALID_MODE', 'Choose solo or pvp.');
    const profile = await profiles.getProfile(playerId);
    if (!profile) throw new HttpError(404, 'PROFILE_NOT_FOUND', 'Profile not found.');
    const created = await createPvpMatchRecord(env, body.mode, { id: playerId, name: profile.name });
    return Response.json(created satisfies MatchCreated, { status: 201 });
  }
  const join = /^\/api\/rooms\/([A-Za-z0-9]{6})\/join$/.exec(path);
  if (join && request.method === 'POST') {
    const code = join[1].toUpperCase();
    const room = await env.DB.prepare('SELECT id FROM matches WHERE room_code = ? AND mode = ?').bind(code, 'pvp').first<{ id: string }>();
    if (!room) throw new HttpError(404, 'ROOM_NOT_FOUND', 'Check the six-character room code.');
    const profile = await profiles.getProfile(playerId);
    if (!profile) throw new HttpError(404, 'PROFILE_NOT_FOUND', 'Profile not found.');
    const result = await env.MATCHES.getByName(room.id).join({ id: playerId, name: profile.name });
    if (result.error) throw new HttpError(409, 'ROOM_UNAVAILABLE', result.error);
    return Response.json({ matchId: room.id, roomCode: code } satisfies MatchCreated);
  }
  const ticket = /^\/api\/matches\/([a-f0-9-]{36})\/ticket$/.exec(path);
  if (ticket && request.method === 'POST') {
    const value = await env.MATCHES.getByName(ticket[1]).mintTicket(playerId);
    if (!value) throw new HttpError(403, 'MATCH_MEMBERSHIP_REQUIRED', 'Join this match before connecting.');
    return Response.json({ ticket: value });
  }
  if (path === '/api/matchmaking/ticket' && request.method === 'POST') {
    const profile = await profiles.getProfile(playerId);
    if (!profile) throw new HttpError(404, 'PROFILE_NOT_FOUND', 'Profile not found.');
    const value = await env.MATCHMAKING.getByName(MATCHMAKING_QUEUE_NAME).mintTicket(playerId, profile.name);
    return Response.json({ ticket: value });
  }
  throw new HttpError(404, 'NOT_FOUND', 'API route not found.');
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const response = await route(request, env);
      if (response.status === 101 || !new URL(request.url).pathname.startsWith('/api/')) return response;
      const headers = new Headers(response.headers);
      corsHeaders(request, env).forEach((value, key) => headers.set(key, value));
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      if (error instanceof HttpError) return Response.json({ error: error.code, message: error.message }, { status: error.status, headers: corsHeaders(request, env) });
      console.error(JSON.stringify({ event: 'request_failed', path: new URL(request.url).pathname, error: error instanceof Error ? error.name : 'unknown' }));
      return Response.json({ error: 'INTERNAL_ERROR', message: 'The service could not complete this request. Please try again.' }, { status: 500, headers: corsHeaders(request, env) });
    }
  }
} satisfies ExportedHandler<Env>;
