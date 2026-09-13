import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FitnessSetupInput, Profile } from '@vyra/core';
import { createProgression, dayKey, type ProgressionState } from '@vyra/core/progression';
import { hashToken } from './http';

// Keep the production coordinator, router, and SQL. Only the Workers constructor and
// platform database transport are replaced so the race tests run in the Node suite.
vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    constructor(protected ctx: DurableObjectState, protected env: Env) {}
  },
}));
import worker from './index';
import { ProfileCoordinator } from './profile';

const NOW = Date.parse('2026-09-12T12:00:00+05:30');
const DAY = 86_400_000;
const TOKEN = 'a'.repeat(64);
const PLAYER = 'fitness-player';
const setupInput: FitnessSetupInput = {
  goal: 'gain_weight', startingBuild: 'thin', heightCm: 175,
  weightKg: 55, targetWeightKg: 65, characterId: 'goku',
};

class SqliteStatement {
  constructor(private db: DatabaseSync, readonly sql: string, readonly values: SQLInputValue[] = []) {}
  bind(...values: SQLInputValue[]): SqliteStatement { return new SqliteStatement(this.db, this.sql, values); }
  async first<T>(): Promise<T | null> {
    await Promise.resolve();
    return (this.db.prepare(this.sql).get(...this.values) as T | undefined) ?? null;
  }
  async run(): Promise<void> {
    await Promise.resolve();
    this.execute();
  }
  execute(): void { this.db.prepare(this.sql).run(...this.values); }
}

const databases: DatabaseSync[] = [];
async function fixture() {
  const db = new DatabaseSync(':memory:');
  databases.push(db);
  db.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
  db.prepare('INSERT INTO profiles (id, token_hash, state_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(PLAYER, await hashToken(TOKEN), JSON.stringify(createProgression(PLAYER, 'Fitness QA')), NOW, NOW);
  const coordinators = new Map<string, ProfileCoordinator>();
  const identities = new Map<string, DatabaseSync>();
  function coordinator(id = PLAYER): ProfileCoordinator {
    const existing = coordinators.get(id);
    if (existing) return existing;
    let identity = identities.get(id);
    if (!identity) {
      identity = new DatabaseSync(':memory:');
      databases.push(identity); identities.set(id, identity);
    }
    const sql = identity;
    const context = { storage: { sql: { exec(query: string, ...values: SQLInputValue[]) {
      const statement = sql.prepare(query);
      if (statement.columns().length) {
        const rows = statement.all(...values);
        return { one: () => rows[0], toArray: () => rows };
      }
      statement.run(...values);
      return { one: () => undefined, toArray: () => [] };
    } } } } as unknown as DurableObjectState;
    const value = new ProfileCoordinator(context, env);
    coordinators.set(id, value);
    return value;
  }
  const env = {
    CORS_ORIGINS: 'http://localhost:8081',
    DB: {
      prepare: (sql: string) => new SqliteStatement(db, sql),
      async batch(statements: SqliteStatement[]) {
        await Promise.resolve();
        db.exec('BEGIN');
        try { statements.forEach(statement => statement.execute()); db.exec('COMMIT'); }
        catch (error) { db.exec('ROLLBACK'); throw error; }
      },
    },
    PROFILES: { getByName: coordinator },
  } as unknown as Env;
  async function api(path: string, body?: unknown, token: string | null = TOKEN): Promise<Response> {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (token) headers.set('authorization', `Bearer ${token}`);
    return worker.fetch(new Request(`https://worker.test${path}`, {
      method: body === undefined ? 'GET' : 'POST', headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }), env);
  }
  function stored(): ProgressionState {
    const row = db.prepare('SELECT state_json FROM profiles WHERE id = ?').get(PLAYER);
    return JSON.parse(String(row?.state_json)) as ProgressionState;
  }
  return { db, api, coordinator, stored, recreate: () => coordinators.delete(PLAYER) };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const db of databases.splice(0)) db.close();
});

describe('fitness profile API', () => {
  it('authenticates all new profile writes', async () => {
    const { api, stored } = await fixture();
    for (const path of ['fitness', 'check-ins', 'character', 'equip', 'equipment/reset']) {
      expect((await api(`/api/profile/${path}`, {}, null)).status).toBe(401);
    }
    expect(stored().profile.fitness).toBeUndefined();
  });

  it('rejects invalid shape, character identity, and goal direction without storing a plan', async () => {
    const { api, stored } = await fixture();
    for (const input of [
      { ...setupInput, weightKg: '55' },
      { ...setupInput, characterId: 'unknown' },
      { ...setupInput, goal: 'elite' },
      { ...setupInput, targetWeightKg: 50 },
    ]) {
      expect((await api('/api/profile/fitness', input)).status).toBe(400);
    }
    expect((await api('/api/profile/character', { characterId: '../../secret' })).status).toBe(400);
    expect(stored().profile.fitness).toBeUndefined();
  });

  it('persists only allowed setup fields with a server timestamp and survives coordinator recreation', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const { api, stored, recreate } = await fixture();
    const response = await api('/api/profile/fitness', {
      ...setupInput, id: 'other-player', xp: 999999, activeDays: 999, stage: 'elite',
      startedAt: 0, checkIns: [{ weightKg: 65, at: 0 }],
    });
    expect(response.status).toBe(200);
    expect(stored().profile).toMatchObject({
      id: PLAYER, xp: 0, activeDays: 0, stage: 'starter', characterId: 'goku',
      fitness: { startedAt: NOW, startWeightKg: 55, startHeightCm: 175, targetWeightKg: 65, checkIns: [] },
    });
    recreate();
    expect(await (await api('/api/profile')).json()).toEqual(await response.json());
  });

  it('serializes concurrent setup requests so an established baseline cannot be replaced', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const { api, stored } = await fixture();
    const responses = await Promise.all([
      api('/api/profile/fitness', setupInput),
      api('/api/profile/fitness', { ...setupInput, weightKg: 50, characterId: 'nami' }),
    ]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    const accepted = await responses.find(response => response.status === 200)!.json() as Profile;
    expect(stored().profile).toEqual(accepted);
    expect(await responses.find(response => response.status === 409)!.json()).toMatchObject({ error: 'FITNESS_ALREADY_CONFIGURED' });
  });

  it('requires setup for check-ins, rejects invalid measurements, and prevents a same-day follow-up', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const { api, stored } = await fixture();
    expect((await api('/api/profile/check-ins', { weightKg: 56, heightCm: 175 })).status).toBe(409);
    await api('/api/profile/fitness', setupInput);
    expect((await api('/api/profile/check-ins', { weightKg: '56', heightCm: 175 })).status).toBe(400);
    expect((await api('/api/profile/check-ins', { weightKg: -1, heightCm: 175 })).status).toBe(400);
    expect((await api('/api/profile/check-ins', { weightKg: 56, heightCm: 175 })).status).toBe(400);
    expect(stored().profile.fitness?.checkIns).toEqual([]);
  });

  it('uses the server day and replaces a same-day report without accepting forged progress', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const { api, stored } = await fixture();
    await api('/api/profile/fitness', setupInput);
    clock.mockReturnValue(NOW + DAY);
    expect((await api('/api/profile/check-ins', { weightKg: 56, heightCm: 175, at: NOW + DAY * 90, day: '2099-01-01', xp: 9000 })).status).toBe(200);
    expect((await api('/api/profile/check-ins', { weightKg: 56.5, heightCm: 176 })).status).toBe(200);
    expect(stored().profile).toMatchObject({ xp: 0, stage: 'starter', fitness: {
      startWeightKg: 55, startHeightCm: 175,
      checkIns: [{ weightKg: 56.5, heightCm: 176, at: NOW + DAY, day: dayKey(NOW + DAY) }],
    } });
  });

  it('preserves character, check-in, and actual workout rewards when writes arrive together', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const { api, coordinator, stored } = await fixture();
    await api('/api/profile/fitness', setupInput);
    clock.mockReturnValue(NOW + DAY);
    const [character, checkIn, reward] = await Promise.all([
      api('/api/profile/character', { characterId: 'sakura', stage: 'elite', xp: 9999 }),
      api('/api/profile/check-ins', { weightKg: 58, heightCm: 175 }),
      coordinator().settle(PLAYER, { matchId: 'verified-workout', totalReps: 10, won: false, finishedAt: NOW + DAY }),
    ]);
    expect(character.status).toBe(200); expect(checkIn.status).toBe(200); expect(reward.qualified).toBe(true);
    expect(stored().profile).toMatchObject({
      characterId: 'sakura', xp: 110, activeDays: 1, stage: 'developing', totalReps: 10,
      fitness: { startWeightKg: 55, checkIns: [{ weightKg: 58, heightCm: 175 }] },
    });
  });
});

describe('cosmetic equipment API', () => {
  it('rejects malformed slots, mismatched cosmetics, and unearned effects without changing the profile', async () => {
    const { api, stored } = await fixture();
    const before = stored();
    for (const body of [
      { slot: '__proto__', itemId: null }, { slot: 'xp', itemId: null },
      { slot: 'skin' }, { slot: 'skin', itemId: false },
      { slot: 'outfit', itemId: 'ion-skin' },
    ]) expect((await api('/api/profile/equip', body)).status).toBe(400);
    const locked = await api('/api/profile/equip', { slot: 'aura', itemId: 'nova-aura', ownedCosmetics: ['nova-aura'], stage: 'elite' });
    expect(locked.status).toBe(403);
    expect(await locked.json()).toMatchObject({ error: 'COSMETIC_LOCKED' });
    expect(stored()).toEqual(before);
  });

  it('persists per-slot removal and original-look reset without clearing ownership, character, or fitness', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const { api, coordinator, stored, recreate } = await fixture();
    await api('/api/profile/fitness', { ...setupInput, characterId: 'nami' });
    await coordinator().settle(PLAYER, { matchId: 'cosmetics', totalReps: 100, won: true, finishedAt: NOW });
    expect((await api('/api/profile/equip', { slot: 'skin', itemId: 'ion-skin' })).status).toBe(200);
    expect((await api('/api/profile/equip', { slot: 'accessory', itemId: 'pulse-bracers' })).status).toBe(200);
    const before = stored();
    const removed = await api('/api/profile/equip', { slot: 'skin', itemId: null, xp: 9000, characterId: 'sakura' });
    expect(removed.status).toBe(200);
    expect(stored()).toEqual({ ...before, profile: { ...before.profile, equipped: { outfit: 'origin-suit', accessory: 'pulse-bracers' } } });
    recreate();
    expect(await (await api('/api/profile')).json()).toEqual(await removed.json());
    const reset = await api('/api/profile/equipment/reset', { ownedCosmetics: ['nova-aura'], fitness: null, stage: 'elite' });
    expect(reset.status).toBe(200);
    expect(stored()).toEqual({ ...before, profile: { ...before.profile, equipped: { outfit: 'origin-suit' } } });
    recreate();
    expect(await (await api('/api/profile')).json()).toEqual(await reset.json());
    expect((await api('/api/profile/equip', { slot: 'aura', itemId: 'nova-aura' })).status).toBe(403);
  });

  it('allows removing an empty slot or the original outfit without affecting other fields', async () => {
    const { api, stored } = await fixture();
    const before = stored();
    expect((await api('/api/profile/equip', { slot: 'skin', itemId: null })).status).toBe(200);
    expect(stored()).toEqual(before);
    expect((await api('/api/profile/equip', { slot: 'outfit', itemId: null })).status).toBe(200);
    expect(stored()).toEqual({ ...before, profile: { ...before.profile, equipped: {} } });
    expect((await api('/api/profile/equipment/reset', {})).status).toBe(200);
    expect(stored()).toEqual(before);
  });

  it('serializes resets and removals with completed workouts without losing earned rewards', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const { api, coordinator, stored } = await fixture();
    await api('/api/profile/fitness', { ...setupInput, characterId: 'mikasa' });
    await coordinator().settle(PLAYER, { matchId: 'first', totalReps: 10, won: false, finishedAt: NOW });
    await api('/api/profile/equip', { slot: 'skin', itemId: 'ion-skin' });
    const before = stored();
    clock.mockReturnValue(NOW + DAY);
    const [reset, removed, receipt] = await Promise.all([
      api('/api/profile/equipment/reset', {}),
      api('/api/profile/equip', { slot: 'skin', itemId: null }),
      coordinator().settle(PLAYER, { matchId: 'second', totalReps: 100, won: true, finishedAt: NOW + DAY }),
    ]);
    expect(reset.status).toBe(200); expect(removed.status).toBe(200);
    expect(receipt.unlocked).toContain('pulse-bracers');
    expect(stored().profile).toMatchObject({
      equipped: { outfit: 'origin-suit' }, characterId: 'mikasa', fitness: before.profile.fitness,
      xp: before.profile.xp + receipt.xp, totalReps: 110, activeDays: 2, wins: 1,
    });
    expect(stored().profile.equipped.skin).toBeUndefined();
    expect(stored().profile.ownedCosmetics).toEqual(expect.arrayContaining(['origin-suit', 'ion-skin', 'pulse-bracers']));
  });
});

describe('persistent Coach generation quota', () => {
  it('atomically allows only six concurrent requests per minute, persists across recreation, and leaves profiles untouched', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const { coordinator, recreate, stored } = await fixture();
    const before = stored();
    const attempts = await Promise.all(Array.from({ length: 12 }, () => coordinator().consumeCoachRequest(PLAYER)));
    expect(attempts.filter(attempt => attempt.allowed)).toHaveLength(6);
    expect(attempts.filter(attempt => !attempt.allowed).every(attempt => attempt.retryAfterSeconds > 0 && attempt.retryAfterSeconds <= 60)).toBe(true);
    recreate();
    expect(coordinator().consumeCoachRequest(PLAYER).allowed).toBe(false);
    clock.mockReturnValue(NOW + 60_000);
    expect(coordinator().consumeCoachRequest(PLAYER)).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(stored()).toEqual(before);
  });

  it('limits a player to sixty generation attempts per UTC day, independently of another player', async () => {
    const start = Date.parse('2026-09-13T12:00:00Z');
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
    const { coordinator, recreate } = await fixture();
    for (let minute = 0; minute < 10; minute++) {
      clock.mockReturnValue(start + minute * 60_000);
      for (let call = 0; call < 6; call++) expect(coordinator().consumeCoachRequest(PLAYER).allowed).toBe(true);
    }
    clock.mockReturnValue(start + 10 * 60_000);
    recreate();
    expect(coordinator().consumeCoachRequest(PLAYER)).toEqual({ allowed: false, retryAfterSeconds: 42_600 });
    expect(coordinator('other-player').consumeCoachRequest('other-player').allowed).toBe(true);
    expect(() => coordinator().consumeCoachRequest('other-player')).toThrow('identity mismatch');
    clock.mockReturnValue(Date.parse('2026-09-14T00:00:00Z'));
    expect(coordinator().consumeCoachRequest(PLAYER).allowed).toBe(true);
  });
});
