import type { RewardReceipt } from '@vyra/core';
import { applyReward, type ProgressionState, type RewardInput } from '@vyra/core/progression';

export class SerialExecutor {
  private tail: Promise<void> = Promise.resolve();
  async run<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try { return await work(); } finally { release(); }
  }
}
export interface RewardStore {
  receipt(profileId: string, matchId: string): Promise<RewardReceipt | null>;
  profile(profileId: string): Promise<ProgressionState | null>;
  commit(profileId: string, input: RewardInput, state: ProgressionState, receipt: RewardReceipt): Promise<void>;
}
/** Caller holds its per-profile SerialExecutor for the complete operation. */
export async function settleRewardOnce(store: RewardStore, profileId: string, input: RewardInput): Promise<RewardReceipt> {
  const previous = await store.receipt(profileId, input.matchId);
  if (previous) return previous;
  const state = await store.profile(profileId);
  if (!state) throw new Error('Cannot settle a missing profile.');
  const result = applyReward(state, input);
  await store.commit(profileId, input, result.state, result.receipt);
  return result.receipt;
}
export class D1RewardStore implements RewardStore {
  constructor(private db: D1Database) {}
  async receipt(profileId: string, matchId: string): Promise<RewardReceipt | null> {
    const row = await this.db.prepare('SELECT receipt_json FROM reward_ledger WHERE match_id = ? AND profile_id = ?')
      .bind(matchId, profileId).first<{ receipt_json: string }>();
    return row ? JSON.parse(row.receipt_json) as RewardReceipt : null;
  }
  async profile(profileId: string): Promise<ProgressionState | null> {
    const row = await this.db.prepare('SELECT state_json FROM profiles WHERE id = ?').bind(profileId).first<{ state_json: string }>();
    return row ? JSON.parse(row.state_json) as ProgressionState : null;
  }
  async commit(profileId: string, input: RewardInput, state: ProgressionState, receipt: RewardReceipt): Promise<void> {
    // D1 executes the batch in a single transaction, rolling everything back on any failure.
    await this.db.batch([
      this.db.prepare('INSERT INTO reward_ledger (match_id, profile_id, receipt_json, settled_at) VALUES (?, ?, ?, ?)')
        .bind(input.matchId, profileId, JSON.stringify(receipt), input.finishedAt),
      this.db.prepare('UPDATE profiles SET state_json = ?, updated_at = ? WHERE id = ?')
        .bind(JSON.stringify(state), Date.now(), profileId)
    ]);
  }
}
