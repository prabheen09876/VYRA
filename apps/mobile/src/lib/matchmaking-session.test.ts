import { describe, expect, it, vi } from 'vitest';
import { isMatchmakingCancellation, MatchmakingCancelled, openMatchmakingSession } from './matchmaking-session';

class FakeSocket {
  onmessage: WebSocket['onmessage'] = null;
  onerror: WebSocket['onerror'] = null;
  onclose: WebSocket['onclose'] = null;
  close = vi.fn();
  send = vi.fn();

  deliver(payload: unknown) {
    this.onmessage?.call(this as unknown as WebSocket, { data: JSON.stringify(payload) } as MessageEvent);
  }
  /** The close the browser fires back after `close()`, or on a server-side disconnect. */
  disconnect() { this.onclose?.call(this as unknown as WebSocket, {} as CloseEvent); }
  fail() { this.onerror?.call(this as unknown as WebSocket, {} as Event); }
}

const open = (overrides: Partial<Parameters<typeof openMatchmakingSession>[0]> = {}) => {
  const socket = new FakeSocket();
  const session = openMatchmakingSession({ url: 'wss://api.test/api/matchmaking/ws?ticket=t', createSocket: () => socket, ...overrides });
  return { socket, session };
};

const MATCHED = { type: 'matched', protocolVersion: 1, matchId: 'm-1', roomCode: 'ABCD' };

describe('openMatchmakingSession', () => {
  it('resolves with the pairing and closes the queue socket', async () => {
    const { socket, session } = open();
    socket.deliver(MATCHED);
    await expect(session.matched).resolves.toEqual({ matchId: 'm-1', roomCode: 'ABCD' });
    expect(socket.close).toHaveBeenCalledWith(1000, 'Matched');
    socket.disconnect();
    await expect(session.closed).resolves.toBeUndefined();
  });

  it('reports the server error message', async () => {
    const { socket, session } = open();
    socket.deliver({ type: 'error', code: 'BUSY', message: 'Queue is closed.' });
    await expect(session.matched).rejects.toThrow('Queue is closed.');
    expect(socket.close).toHaveBeenCalled();
  });

  it('rejects on a transport error instead of waiting forever', async () => {
    const { socket, session } = open();
    socket.fail();
    await expect(session.matched).rejects.toThrow(/connection failed/i);
  });

  it('rejects when the socket closes before an opponent is found', async () => {
    // The leak this module exists to fix: an unexpected close used to leave the promise pending.
    const { socket, session } = open();
    socket.disconnect();
    await expect(session.matched).rejects.toThrow(/closed before an opponent/i);
    await expect(session.closed).resolves.toBeUndefined();
  });

  it('rejects when the socket cannot be constructed at all', async () => {
    const session = openMatchmakingSession({
      url: 'wss://api.test', createSocket: () => { throw new Error('offline'); },
    });
    await expect(session.matched).rejects.toThrow(/Could not open the matchmaking connection/i);
    await expect(session.closed).resolves.toBeUndefined();
    await expect(session.cancel()).resolves.toBeUndefined();
  });

  it('ignores malformed frames and keeps searching', async () => {
    const { socket, session } = open();
    socket.onmessage?.call(socket as unknown as WebSocket, { data: 'not json' } as MessageEvent);
    let done = false;
    void session.matched.then(() => { done = true; }, () => { done = true; });
    await Promise.resolve();
    expect(done).toBe(false);
    socket.deliver(MATCHED);
    await expect(session.matched).resolves.toEqual({ matchId: 'm-1', roomCode: 'ABCD' });
  });

  it('reports the searching confirmation, but not after settling', async () => {
    const onSearching = vi.fn();
    const { socket, session } = open({ onSearching });
    socket.deliver({ type: 'searching', protocolVersion: 1 });
    expect(onSearching).toHaveBeenCalledTimes(1);
    socket.deliver(MATCHED);
    socket.deliver({ type: 'searching', protocolVersion: 1 });
    expect(onSearching).toHaveBeenCalledTimes(1);
    await expect(session.matched).resolves.toBeTruthy();
  });
});

describe('cancelling a search', () => {
  it('sends the protocol cancel, closes, and rejects distinguishably', async () => {
    const { socket, session } = open();
    const pending = session.cancel();
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'cancel', protocolVersion: 1 }));
    expect(socket.close).toHaveBeenCalledWith(1000, 'Matchmaking cancelled');
    await expect(session.matched).rejects.toBeInstanceOf(MatchmakingCancelled);
    await expect(session.matched).rejects.toSatisfy(isMatchmakingCancellation);
    socket.disconnect();
    await expect(pending).resolves.toBeUndefined();
  });

  it('waits for the socket to actually close before freeing the queue slot', async () => {
    // Why the caller awaits cancel(): the Matchmaking DO refuses a second socket for the same player
    // with 409 ALREADY_CONNECTED, so the next search must not start until this one is really gone.
    const { socket, session } = open();
    let free = false;
    void session.cancel().then(() => { free = true; });
    await Promise.resolve();
    expect(free).toBe(false);
    socket.disconnect();
    await session.closed;
    expect(free).toBe(true);
  });

  it('frees the slot anyway if the close is never acknowledged', async () => {
    vi.useFakeTimers();
    try {
      const { session } = open({ closeTimeoutMs: 50 });
      let free = false;
      void session.cancel().then(() => { free = true; });
      await vi.advanceTimersByTimeAsync(60);
      expect(free).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it('is idempotent', async () => {
    const { socket, session } = open();
    await Promise.all([session.cancel(), session.cancel(), (socket.disconnect(), session.cancel())]);
    expect(socket.send).toHaveBeenCalledTimes(1);
    expect(socket.close).toHaveBeenCalledTimes(1);
    await expect(session.matched).rejects.toBeInstanceOf(MatchmakingCancelled);
  });

  it('keeps a match that arrived first — cancelling afterwards cannot orphan it', async () => {
    const { socket, session } = open();
    socket.deliver(MATCHED);
    await session.cancel();
    await expect(session.matched).resolves.toEqual({ matchId: 'm-1', roomCode: 'ABCD' });
  });

  it('does not overwrite the cancellation with the close that follows it', async () => {
    const { socket, session } = open();
    void session.cancel();
    socket.disconnect();
    await expect(session.matched).rejects.toBeInstanceOf(MatchmakingCancelled);
  });

  it('ignores a late match event once cancelled', async () => {
    const { socket, session } = open();
    void session.cancel();
    socket.deliver(MATCHED);
    await expect(session.matched).rejects.toBeInstanceOf(MatchmakingCancelled);
  });
});

describe('freeing the queue slot', () => {
  // `closed` gates the next search, so every way a session can end has to resolve it. React Native
  // can fire onerror without a following onclose; before the fallback covered every exit and not
  // only cancel, these two left `closed` pending for good and wedged the next search behind it.
  const stranded = async (end: (socket: FakeSocket) => void) => {
    vi.useFakeTimers();
    try {
      const { socket, session } = open({ closeTimeoutMs: 50 });
      void session.matched.catch(() => undefined);
      end(socket);
      let free = false;
      void session.closed.then(() => { free = true; });
      await vi.advanceTimersByTimeAsync(60);
      expect(free).toBe(true);
    } finally { vi.useRealTimers(); }
  };

  it('frees the slot after a transport error that never reports a close', () => stranded(s => s.fail()));
  it('frees the slot after a match whose close is never acknowledged', () => stranded(s => s.deliver(MATCHED)));
  it('frees the slot after a server error whose close is never acknowledged', () =>
    stranded(s => s.deliver({ type: 'error', code: 'X', message: 'nope' })));
});

describe('promise lifecycle', () => {
  it('settles exactly once however many events arrive', async () => {
    const outcomes: string[] = [];
    const { socket, session } = open();
    void session.matched.then(() => outcomes.push('resolved'), () => outcomes.push('rejected'));
    socket.deliver(MATCHED);
    socket.deliver({ type: 'error', code: 'X', message: 'later error' });
    socket.fail();
    socket.disconnect();
    await session.closed;
    await Promise.resolve();
    expect(outcomes).toEqual(['resolved']);
  });

  it('leaves no unhandled rejection when nobody awaits a cancelled search', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const { socket, session } = open();
      void session.cancel();
      socket.disconnect();
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(unhandled).not.toHaveBeenCalled();
    } finally { process.off('unhandledRejection', unhandled); }
  });
});
