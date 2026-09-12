export interface QueueEntry { playerId: string; name: string; queuedAt: number }
export interface QueueState { waiting: QueueEntry[] }

export function createQueue(): QueueState { return { waiting: [] }; }

export type EnterResult =
  | { outcome: 'searching' }
  | { outcome: 'matched'; opponent: QueueEntry };

/**
 * Pairs a player with the longest-waiting different player, if any. Mutates state in place so a
 * single synchronous call (before any await) is enough to make pairing atomic under the caller's
 * single-threaded execution model (a Durable Object instance).
 */
export function enterQueue(state: QueueState, player: QueueEntry): EnterResult {
  // Replace any earlier entry for this player rather than returning early on it. Returning
  // `searching` the moment the player was already listed skipped the opponent scan entirely, so a
  // row that had outlived its socket — nothing delivers `webSocketClose` when a dev server reloads
  // or a laptop sleeps — made that player unpairable for good. Two such rows deadlocked the queue:
  // both players present, both told "searching", neither ever matched. Entering twice is still one
  // entry, which is all the idempotence this ever promised.
  leaveQueue(state, player.playerId);
  const opponentIndex = state.waiting.findIndex(entry => entry.playerId !== player.playerId);
  if (opponentIndex === -1) { state.waiting.push(player); return { outcome: 'searching' }; }
  const [opponent] = state.waiting.splice(opponentIndex, 1);
  return { outcome: 'matched', opponent };
}

export function leaveQueue(state: QueueState, playerId: string): boolean {
  const index = state.waiting.findIndex(entry => entry.playerId === playerId);
  if (index === -1) return false;
  state.waiting.splice(index, 1);
  return true;
}
