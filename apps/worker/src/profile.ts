import { DurableObject } from 'cloudflare:workers';
import type { CosmeticSlot, Profile, RewardReceipt } from '@vyra/core';
import { displayProfile, equipCosmetic, type ProgressionState, type RewardInput } from '@vyra/core/progression';
import { D1RewardStore, SerialExecutor, settleRewardOnce } from './rewards';

/** One coordinator per profile serializes external D1 read/modify/write operations across match rooms. */
export class ProfileCoordinator extends DurableObject<Env> {
  private serial = new SerialExecutor();
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS identity (singleton INTEGER PRIMARY KEY CHECK(singleton=1), profile_id TEXT NOT NULL)');
  }
  private identity(id: string): void {
    this.ctx.storage.sql.exec('INSERT OR IGNORE INTO identity (singleton, profile_id) VALUES (1, ?)', id);
    const stored = this.ctx.storage.sql.exec<{ profile_id: string }>('SELECT profile_id FROM identity WHERE singleton=1').one();
    if (stored.profile_id !== id) throw new Error('Profile coordinator identity mismatch.');
  }
  private async load(id: string): Promise<ProgressionState | null> {
    const row = await this.env.DB.prepare('SELECT state_json FROM profiles WHERE id = ?').bind(id).first<{ state_json: string }>();
    return row ? JSON.parse(row.state_json) as ProgressionState : null;
  }
  async getProfile(id: string): Promise<Profile | null> {
    this.identity(id);
    return this.serial.run(async () => { const state = await this.load(id); return state ? displayProfile(state, Date.now()) : null; });
  }
  async equip(id: string, slot: CosmeticSlot, itemId: string): Promise<{ profile?: Profile; error?: string }> {
    this.identity(id);
    return this.serial.run(async () => {
      const state = await this.load(id);
      if (!state) return { error: 'Profile not found.' };
      let next: ProgressionState;
      try { next = equipCosmetic(state, slot, itemId); } catch { return { error: 'Unlock this cosmetic before equipping it.' }; }
      await this.env.DB.prepare('UPDATE profiles SET state_json = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(next), Date.now(), id).run();
      return { profile: displayProfile(next, Date.now()) };
    });
  }
  async settle(id: string, input: RewardInput): Promise<RewardReceipt> {
    this.identity(id);
    return this.serial.run(() => settleRewardOnce(new D1RewardStore(this.env.DB), id, input));
  }
}
