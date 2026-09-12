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
    for (const path of ['fitness', 'check-ins', 'character']) {
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
