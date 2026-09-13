import { PROTOCOL_VERSION, type MatchCreated, type MatchmakingCommand, type MatchmakingEvent } from '@vyra/core';

type QueueSocket = Pick<WebSocket, 'onmessage' | 'onerror' | 'onclose' | 'close' | 'send'>;

/** Thrown when the caller ends its own search — a deliberate act, not a failure.
 *
 *  Distinguishable on purpose: cancelling still has to reject the `matched` promise (leaving it
 *  pending is exactly the leak this module exists to prevent), but the UI must not show an error
 *  banner for something the player just asked for. Callers branch on `isMatchmakingCancellation`. */
export class MatchmakingCancelled extends Error {
  constructor(message = 'Matchmaking was cancelled.') {
    super(message);
    this.name = 'MatchmakingCancelled';
  }
}

/** Matched by `name`, not `instanceof`: a bundler that loads this module twice would give the two
 *  copies different class identities, and a mis-detected cancel surfaces as a spurious error. */
export const isMatchmakingCancellation = (error: unknown): boolean =>
  error instanceof Error && error.name === 'MatchmakingCancelled';

export interface MatchmakingSession {
  /** Settles exactly once: resolves with the pairing, or rejects — with `MatchmakingCancelled` on
   *  `cancel()`, and with a plain `Error` on a server error event, a transport failure, or a close
   *  that arrives before any opponent does. It never stays pending. */
  readonly matched: Promise<MatchCreated>;
  /** Resolves once the socket is genuinely gone, so the caller can open the next one without
   *  tripping the server's one-socket-per-player rule. Bounded — see `closeTimeoutMs`. */
  readonly closed: Promise<void>;
  /** Idempotent. Returns `closed`, so `await session.cancel()` means "the queue slot is free". */
  cancel: () => Promise<void>;
}

/** One connection to the matchmaking queue, owning its whole lifecycle.
 *
 *  Extracted from AppProvider so the socket has a single owner with a single `settled` flag, rather
 *  than a mutable ref that every handler had to re-compare itself against — the comparison that used
 *  to drop a `matched` event whenever a second search had already replaced the ref. Kept React-free
 *  and given an injectable `createSocket`, matching lib/reward-receipt.ts, so the races below are
 *  unit-testable without a DOM.
 *
 *  Protocol is unchanged: `cancel` on the way out, `matched` / `error` on the way in. */
export function openMatchmakingSession(options: {
  url: string;
  /** Fired when the server confirms the player is queued. Never fired after the session settles. */
  onSearching?: () => void;
  createSocket?: (url: string) => QueueSocket;
  /** How long to wait for a close to be acknowledged before declaring the slot free anyway. A socket
   *  that never reports its close should delay the next search, not block it forever. */
  closeTimeoutMs?: number;
}): MatchmakingSession {
  let resolveMatched!: (created: MatchCreated) => void;
  let rejectMatched!: (error: Error) => void;
  const matched = new Promise<MatchCreated>((resolve, reject) => { resolveMatched = resolve; rejectMatched = reject; });
  // Every path here rejects, including the routine cancel — and a caller may cancel before it ever
  // awaits. Park a no-op handler so that never registers as an unhandled rejection; `matched` itself
  // still rejects normally for whoever does await it.
  void matched.catch(() => undefined);

  let resolveClosed!: () => void;
  const closed = new Promise<void>(resolve => { resolveClosed = resolve; });

  let settled = false;
  let released = false;
  let cancelling = false;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  const finish = (created?: MatchCreated, error?: Error) => {
    if (settled) return;
    settled = true;
    if (created) resolveMatched(created);
    else rejectMatched(error ?? new Error('Matchmaking ended unexpectedly. Try again.'));
  };

  const release = () => {
    if (released) return;
    released = true;
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    resolveClosed();
  };

  const shut = (reason: string) => {
    try { socket.close(1000, reason); } catch { /* Already closed; the close handler still settles us. */ }
    // Arm the fallback on every exit, not only on cancel. A transport that reports `onerror` and then
    // never `onclose` — React Native does this, which is why reward-receipt.ts:25 guards close() at
    // all — would otherwise leave `closed` pending for good, and the next search waits on it.
    if (!released && !closeTimer) closeTimer = setTimeout(release, options.closeTimeoutMs ?? 2000);
  };

  let socket: QueueSocket;
  try { socket = (options.createSocket ?? (url => new WebSocket(url)))(options.url); }
  catch {
    finish(undefined, new Error('Could not open the matchmaking connection. Check your connection and try again.'));
    release();
    return { matched, closed, cancel: () => closed };
  }

  socket.onmessage = message => {
    let event: MatchmakingEvent;
    try { event = JSON.parse(String(message.data)) as MatchmakingEvent; } catch { return; }
    if (event.type === 'searching') { if (!settled) options.onSearching?.(); return; }
    if (event.type === 'matched') {
      // Settle before closing. The server has already created the match and told the opponent, so a
      // `matched` event dropped on this side strands them in a lobby for a battle nobody joins.
      finish({ matchId: event.matchId, roomCode: event.roomCode });
      shut('Matched');
      return;
    }
    if (event.type === 'error') {
      finish(undefined, new Error(event.message));
      shut('Matchmaking failed');
    }
    // 'pong' needs no handling — this session sends no pings.
  };

  socket.onerror = () => {
    finish(undefined, new Error('The matchmaking connection failed. Try again.'));
    shut('Matchmaking connection failed');
  };

  // The close is authoritative for both promises: whatever ended the socket, the queue slot is free
  // and the search is over. Reaching here before `finish` means the connection dropped mid-search,
  // which used to leave `enterMatchmaking` pending forever.
  socket.onclose = () => {
    finish(undefined, new Error('The matchmaking connection closed before an opponent was found. Try again.'));
    release();
  };

  const cancel = (): Promise<void> => {
    if (cancelling) return closed;
    cancelling = true;
    // Ahead of the close, so a deliberate cancel wins over the generic close error above.
    finish(undefined, new MatchmakingCancelled());
    // Best-effort: the server drops us from the queue on close anyway, but the explicit command gets
    // us out immediately instead of after the close round-trip. Throws if still CONNECTING.
    try { socket.send(JSON.stringify({ type: 'cancel', protocolVersion: PROTOCOL_VERSION } satisfies MatchmakingCommand)); }
    catch { /* Not open yet, or already gone — the close below is the real cleanup. */ }
    shut('Matchmaking cancelled');
    return closed;
  };

  return { matched, closed, cancel };
}
