/**
 * Room codes, as the worker actually defines them.
 *
 * The join route matches `/^\/api\/rooms\/([A-Za-z0-9]{6})\/join$/` (apps/worker/src/index.ts:51),
 * and codes are generated from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (apps/worker/src/matches.ts:5).
 * Anything outside that shape never reaches the room lookup at all: it falls off the end of the
 * route table and comes back as the generic `NOT_FOUND` / "API route not found.", which reads as a
 * broken server rather than as a mistyped code. Normalising and checking client-side keeps that
 * response off the screen — it does not replace the server's own check, which still runs.
 */
export const ROOM_CODE_LENGTH = 6;

/**
 * Uppercases, drops every character the route cannot carry, and clamps to the code length.
 *
 * Used both by the input (so typing is cleaned as it happens) and by the join call (so a code put
 * into state some other way is cleaned too). The share text a host sends ends in a full stop —
 * lobby.tsx builds "…enter room code ABC123." — so a friend who copies the tail of that sentence,
 * or types the code with a space or a dash, would otherwise be told the API is missing.
 */
export function normalizeRoomCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH);
}

/** Why this code cannot be submitted yet, or null once it can. Phrased for the player, not the log. */
export function roomCodeError(value: string): string | null {
  const code = normalizeRoomCode(value);
  if (!code) return 'Enter the room code your friend shared.';
  if (code.length < ROOM_CODE_LENGTH) return 'Room codes are six characters — check the code your friend shared.';
  return null;
}
