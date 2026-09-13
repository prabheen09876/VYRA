import { DurableObject } from 'cloudflare:workers';
import type { BodyCheckInInput, CharacterId, CosmeticSlot, FitnessSetupInput, Profile, RewardReceipt } from '@vyra/core';
import { displayProfile, equipCosmetic, recordBodyCheckIn, resetEquipment, selectCharacter, setupFitness, unequipCosmetic, type ProgressionState, type RewardInput } from '@vyra/core/progression';
import { D1RewardStore, SerialExecutor, settleRewardOnce } from './rewards';

type ProfileMutationResult =
  | { profile: Profile; status?: never; code?: never; error?: never }
  | { profile?: never; status: 400 | 403 | 404 | 409; code: string; error: string };

/** One coordinator per profile serializes external D1 read/modify/write operations across match rooms. */
export class ProfileCoordinator extends DurableObject<Env> {
  private serial = new SerialExecutor();
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS identity (singleton INTEGER PRIMARY KEY CHECK(singleton=1), profile_id TEXT NOT NULL)');
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS coach_quota (singleton INTEGER PRIMARY KEY CHECK(singleton=1), minute_bucket INTEGER NOT NULL, minute_count INTEGER NOT NULL, day_bucket INTEGER NOT NULL, day_count INTEGER NOT NULL)');
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
  /** Atomic, persistent provider quota; guide retrieval does not consume paid generation. */
  consumeCoachRequest(id: string): { allowed: boolean; retryAfterSeconds: number } {
    this.identity(id);
    const now = Date.now();
    const minute = Math.floor(now / 60_000);
    const day = Math.floor(now / 86_400_000);
    // The conditional UPSERT is a single SQLite write, including both quota checks.
    const accepted = this.ctx.storage.sql.exec(`
      INSERT INTO coach_quota (singleton, minute_bucket, minute_count, day_bucket, day_count) VALUES (1, ?, 1, ?, 1)
      ON CONFLICT(singleton) DO UPDATE SET
        minute_bucket = excluded.minute_bucket,
        minute_count = CASE WHEN minute_bucket = excluded.minute_bucket THEN minute_count + 1 ELSE 1 END,
        day_bucket = excluded.day_bucket,
        day_count = CASE WHEN day_bucket = excluded.day_bucket THEN day_count + 1 ELSE 1 END
      WHERE (minute_bucket != excluded.minute_bucket OR minute_count < 6)
        AND (day_bucket != excluded.day_bucket OR day_count < 60)
      RETURNING singleton`, minute, day).toArray().length > 0;
    if (accepted) return { allowed: true, retryAfterSeconds: 0 };
    const quota = this.ctx.storage.sql.exec<{ minute_bucket: number; minute_count: number; day_bucket: number; day_count: number }>('SELECT * FROM coach_quota WHERE singleton = 1').one();
    const retryAt = quota.day_bucket === day && quota.day_count >= 60 ? (day + 1) * 86_400_000 : (minute + 1) * 60_000;
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((retryAt - now) / 1000)) };
  }
  async getProfile(id: string): Promise<Profile | null> {
    this.identity(id);
    return this.serial.run(async () => { const state = await this.load(id); return state ? displayProfile(state, Date.now()) : null; });
  }
  async equip(id: string, slot: CosmeticSlot, itemId: string | null): Promise<ProfileMutationResult> {
    return this.updateProfile(id, 'INVALID_COSMETIC', state =>
      itemId === null ? unequipCosmetic(state, slot) : equipCosmetic(state, slot, itemId), state =>
      itemId !== null && !state.profile.ownedCosmetics.includes(itemId)
        ? { status: 403, code: 'COSMETIC_LOCKED', error: 'Unlock this cosmetic before equipping it.' } : undefined);
  }
  async resetEquipment(id: string): Promise<ProfileMutationResult> {
    return this.updateProfile(id, 'INVALID_EQUIPMENT', state => resetEquipment(state));
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
