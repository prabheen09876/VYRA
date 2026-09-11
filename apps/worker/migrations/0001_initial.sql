PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  state_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL CHECK (mode IN ('solo', 'pvp')),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reward_ledger (
  match_id TEXT NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  receipt_json TEXT NOT NULL,
  settled_at INTEGER NOT NULL,
  PRIMARY KEY (match_id, profile_id)
);
CREATE INDEX IF NOT EXISTS rewards_by_profile ON reward_ledger(profile_id, settled_at);
