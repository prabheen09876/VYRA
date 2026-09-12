import { DurableObject } from 'cloudflare:workers';
import type { BodyCheckInInput, CharacterId, CosmeticSlot, FitnessSetupInput, Profile, RewardReceipt } from '@vyra/core';
import { displayProfile, equipCosmetic, recordBodyCheckIn, selectCharacter, setupFitness, type ProgressionState, type RewardInput } from '@vyra/core/progression';
import { D1RewardStore, SerialExecutor, settleRewardOnce } from './rewards';

type ProfileMutationResult =
  | { profile: Profile; status?: never; code?: never; error?: never }
  | { profile?: never; status: 400 | 404 | 409; code: string; error: string };

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
  private async updateProfile(
    id: string,
    invalidCode: string,
    change: (state: ProgressionState, now: number) => ProgressionState,
    condition?: (state: ProgressionState) => ProfileMutationResult | undefined,
  ): Promise<ProfileMutationResult> {
    this.identity(id);
    return this.serial.run(async () => {
      const state = await this.load(id);
      if (!state) return { status: 404, code: 'PROFILE_NOT_FOUND', error: 'Profile not found.' };
      const rejected = condition?.(state);
      if (rejected) return rejected;
      const now = Date.now();
      let next: ProgressionState;
      try { next = change(state, now); }
      catch (error) {
        return { status: 400, code: invalidCode, error: error instanceof Error ? error.message : 'Check the values and try again.' };
      }
      await this.env.DB.prepare('UPDATE profiles SET state_json = ?, updated_at = ? WHERE id = ?')
        .bind(JSON.stringify(next), now, id).run();
      return { profile: displayProfile(next, now) };
    });
  }
  async setupFitness(id: string, input: FitnessSetupInput): Promise<ProfileMutationResult> {
    return this.updateProfile(id, 'INVALID_FITNESS', (state, now) => setupFitness(state, input, now), state =>
      state.profile.fitness ? { status: 409, code: 'FITNESS_ALREADY_CONFIGURED', error: 'Your goal is already set. Record a check-in to update your measurements.' } : undefined);
  }
  async recordCheckIn(id: string, input: BodyCheckInInput): Promise<ProfileMutationResult> {
    return this.updateProfile(id, 'INVALID_CHECK_IN', (state, now) => recordBodyCheckIn(state, input, now), state =>
      !state.profile.fitness ? { status: 409, code: 'FITNESS_REQUIRED', error: 'Set your goal before recording a check-in.' } : undefined);
  }
  async selectCharacter(id: string, characterId: CharacterId): Promise<ProfileMutationResult> {
    return this.updateProfile(id, 'INVALID_CHARACTER', state => selectCharacter(state, characterId));
  }
  async settle(id: string, input: RewardInput): Promise<RewardReceipt> {
    this.identity(id);
    return this.serial.run(() => settleRewardOnce(new D1RewardStore(this.env.DB), id, input));
  }
}
