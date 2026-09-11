import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { RewardReceipt } from '@vyra/core';
import { createProgression, type ProgressionState, type RewardInput } from '@vyra/core/progression';
import { SerialExecutor, settleRewardOnce, type RewardStore } from './rewards';

// Exercises actual SQLite constraints and transactions from the D1 migration through the production settlement logic.
class SqliteStore implements RewardStore {
  readonly db = new DatabaseSync(':memory:');
  failCommit = false;
  constructor() {
    this.db.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
    this.db.prepare('INSERT INTO profiles (id, token_hash, state_json, created_at, updated_at) VALUES (?, ?, ?, 0, 0)')
      .run('a', 'hash', JSON.stringify(createProgression('a', 'A')));
  }
  async receipt(profileId: string, matchId: string): Promise<RewardReceipt | null> {
    const row = this.db.prepare('SELECT receipt_json FROM reward_ledger WHERE profile_id=? AND match_id=?').get(profileId, matchId);
    return row ? JSON.parse(String(row.receipt_json)) as RewardReceipt : null;
  }
  async profile(id: string): Promise<ProgressionState | null> {
    const row = this.db.prepare('SELECT state_json FROM profiles WHERE id=?').get(id);
    return row ? JSON.parse(String(row.state_json)) as ProgressionState : null;
  }
  async commit(id: string, input: RewardInput, state: ProgressionState, receipt: RewardReceipt): Promise<void> {
    this.db.exec('BEGIN');
    try {
      this.db.prepare('INSERT INTO reward_ledger (match_id, profile_id, receipt_json, settled_at) VALUES (?, ?, ?, ?)')
        .run(input.matchId, id, JSON.stringify(receipt), input.finishedAt);
      if (this.failCommit) throw new Error('Injected write failure');
      this.db.prepare('UPDATE profiles SET state_json=? WHERE id=?').run(JSON.stringify(state), id);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
const stores: SqliteStore[] = [];
function setup() { const store = new SqliteStore(); stores.push(store); return { store, serial: new SerialExecutor() }; }
afterEach(() => { for (const store of stores.splice(0)) store.db.close(); });
const input = (matchId: string): RewardInput => ({ matchId, totalReps: 10, won: false, finishedAt: Date.parse('2026-09-07T12:00:00+05:30') });
describe('durable reward settlement', () => {
  it('returns the original receipt across concurrent duplicate delivery', async () => {
    const { store, serial } = setup();
    const receipts = await Promise.all(Array.from({ length: 6 }, () => serial.run(() => settleRewardOnce(store, 'a', input('one')))));
    expect(receipts.every(receipt => JSON.stringify(receipt) === JSON.stringify(receipts[0]))).toBe(true);
    expect((await store.profile('a'))?.profile.xp).toBe(110);
    expect(store.db.prepare('SELECT count(*) AS count FROM reward_ledger').get()?.count).toBe(1);
  });
  it('serializes different matches so daily and streak bonuses cannot race', async () => {
    const { store, serial } = setup();
    const receipts = await Promise.all(['one', 'two', 'three', 'four'].map(id => serial.run(() => settleRewardOnce(store, 'a', input(id)))));
    expect(receipts.map(r => r.xp)).toEqual([110, 100, 100, 0]);
    expect((await store.profile('a'))?.profile.activeDays).toBe(1);
  });
  it('rolls back a partial settlement and safely retries without blocking the queue', async () => {
    const { store, serial } = setup(); store.failCommit = true;
    await expect(serial.run(() => settleRewardOnce(store, 'a', input('one')))).rejects.toThrow('Injected');
    expect(await store.receipt('a', 'one')).toBeNull(); expect((await store.profile('a'))?.profile.xp).toBe(0);
    store.failCommit = false;
    expect((await serial.run(() => settleRewardOnce(store, 'a', input('one')))).xp).toBe(110);
    expect((await store.profile('a'))?.profile.xp).toBe(110);
  });
});
