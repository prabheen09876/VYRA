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
  if (state.waiting.some(entry => entry.playerId === player.playerId)) return { outcome: 'searching' };
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
