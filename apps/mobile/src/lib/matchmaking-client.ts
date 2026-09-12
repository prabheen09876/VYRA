import { PROTOCOL_VERSION, type MatchCreated, type MatchmakingEvent } from '@vyra/core';

export type MatchmakingSocket = Pick<WebSocket, 'readyState' | 'onmessage' | 'onerror' | 'onclose' | 'send' | 'close'>;
export interface MatchmakingSearch {
  result: Promise<MatchCreated>;
  cancel: () => void;
}

export const isMatchmakingCancelled = (error: unknown): boolean => error instanceof Error && error.name === 'AbortError';

/** Owns one queue connection; the caller connects the returned match to the live arena. */
export function createMatchmakingSearch(options: {
  requestTicket: () => Promise<string>;
  createSocket: (ticket: string) => MatchmakingSocket;
}): MatchmakingSearch {
  let socket: MatchmakingSocket | null = null;
  let settled = false;
  let resolveResult!: (match: MatchCreated) => void;
  let rejectResult!: (error: Error) => void;
  const result = new Promise<MatchCreated>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const finish = (match: MatchCreated | null, error?: Error) => {
    if (settled) return;
    settled = true;
    const current = socket;
    socket = null;
    if (current) {
      current.onmessage = null;
      current.onerror = null;
      current.onclose = null;
      if (isMatchmakingCancelled(error) && current.readyState === 1) {
        try { current.send(JSON.stringify({ type: 'cancel', protocolVersion: PROTOCOL_VERSION })); } catch { /* Closing also removes the queue entry. */ }
      }
      try { current.close(1000, match ? 'Matched' : 'Search ended'); } catch { /* A closing native socket must still settle the search. */ }
    }
    if (match) resolveResult(match);
    else rejectResult(error ?? new Error('Could not start matchmaking. Try again.'));
  };

  const cancel = () => {
    const error = new Error('Opponent search cancelled.');
    error.name = 'AbortError';
    finish(null, error);
  };

  void (async () => {
    try {
      const ticket = await options.requestTicket();
      // Cancellation can happen while the ticket request is still in flight.
      if (settled) return;
      const current = options.createSocket(ticket);
      socket = current;
      current.onmessage = message => {
        if (settled || socket !== current) return;
        let event: MatchmakingEvent;
        try { event = JSON.parse(String(message.data)) as MatchmakingEvent; } catch { return; }
        if (!event || typeof event !== 'object') return;
        if (event.type === 'matched') {
          if (event.protocolVersion !== PROTOCOL_VERSION || typeof event.matchId !== 'string' || !event.matchId || typeof event.roomCode !== 'string' || !event.roomCode) return;
          finish({ matchId: event.matchId, roomCode: event.roomCode });
        } else if (event.type === 'error') {
          finish(null, new Error(typeof event.message === 'string' && event.message ? event.message : 'Could not find an opponent. Try again.'));
        }
      };
      current.onerror = () => {
        if (socket === current) finish(null, new Error('The matchmaking connection failed. Try again.'));
      };
      current.onclose = () => {
        if (socket === current) finish(null, new Error('The opponent search connection closed. Try again.'));
      };
    } catch (error) {
      finish(null, error instanceof Error ? error : new Error('Could not start matchmaking. Try again.'));
    }
  })();

  return { result, cancel };
}
