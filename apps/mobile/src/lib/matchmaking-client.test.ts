import { describe, expect, it, vi } from 'vitest';
import { createMatchmakingSearch, isMatchmakingCancelled } from './matchmaking-client';

class FakeSocket {
  readyState: WebSocket['readyState'] = 1;
  onmessage: WebSocket['onmessage'] = null;
  onerror: WebSocket['onerror'] = null;
  onclose: WebSocket['onclose'] = null;
  send = vi.fn();
  close = vi.fn(() => { this.readyState = 3; });
  message(value: unknown) {
    this.onmessage?.call(this as unknown as WebSocket, { data: JSON.stringify(value) } as MessageEvent);
  }
  fail() { this.onerror?.call(this as unknown as WebSocket, {} as Event); }
  disconnect() { this.onclose?.call(this as unknown as WebSocket, {} as CloseEvent); }
}

const matched = { type: 'matched', protocolVersion: 1, matchId: 'match-1', roomCode: 'ABC123' } as const;
const match = { matchId: matched.matchId, roomCode: matched.roomCode };
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
async function connectedSearch() {
  const socket = new FakeSocket();
  const search = createMatchmakingSearch({ requestTicket: async () => 'ticket', createSocket: () => socket });
  await Promise.resolve();
  return { socket, search };
}

describe('matchmaking client lifecycle', () => {
  it('cancels an in-flight ticket request without later entering the queue', async () => {
    const ticket = deferred<string>();
    const createSocket = vi.fn(() => new FakeSocket());
    const search = createMatchmakingSearch({ requestTicket: () => ticket.promise, createSocket });
    const rejected = expect(search.result).rejects.toMatchObject({ name: 'AbortError' });
    search.cancel();
    await rejected;
    ticket.resolve('late-ticket');
    await Promise.resolve();
    expect(createSocket).not.toHaveBeenCalled();
  });

  it('cancels an open queue connection once and ignores late matched messages', async () => {
    const { socket, search } = await connectedSearch();
    const staleMessageHandler = socket.onmessage;
    const rejected = expect(search.result).rejects.toSatisfy(isMatchmakingCancelled);
    search.cancel();
    search.cancel();
    staleMessageHandler?.call(socket as unknown as WebSocket, { data: JSON.stringify(matched) } as MessageEvent);
    await rejected;
    expect(socket.send).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ type: 'cancel', protocolVersion: 1 }));
    expect(socket.close).toHaveBeenCalledOnce();
    expect(socket.onmessage).toBeNull();
  });

  it('closes a connecting socket without sending a cancellation on it', async () => {
    const { socket, search } = await connectedSearch();
    socket.readyState = 0;
    const rejected = expect(search.result).rejects.toMatchObject({ name: 'AbortError' });
    search.cancel();
    await rejected;
    expect(socket.send).not.toHaveBeenCalled();
    expect(socket.close).toHaveBeenCalledOnce();
  });

  it('settles an unexpected queue disconnect so the caller can retry', async () => {
    const { socket, search } = await connectedSearch();
    const rejected = expect(search.result).rejects.toThrow('search connection closed');
    socket.disconnect();
    await rejected;
    expect(socket.close).toHaveBeenCalledOnce();
    const retry = await connectedSearch();
    retry.socket.message(matched);
    await expect(retry.search.result).resolves.toEqual(match);
  });

  it('settles socket errors and closes the queue connection', async () => {
    const { socket, search } = await connectedSearch();
    const rejected = expect(search.result).rejects.toThrow('matchmaking connection failed');
    socket.fail();
    await rejected;
    expect(socket.close).toHaveBeenCalledOnce();
  });

  it('closes the queue on server errors so a retry is not already connected', async () => {
    const { socket, search } = await connectedSearch();
    const rejected = expect(search.result).rejects.toThrow('Could not start a match');
    socket.message({ type: 'error', code: 'MATCH_CREATE_FAILED', message: 'Could not start a match.' });
    await rejected;
    expect(socket.close).toHaveBeenCalledOnce();
  });

  it('returns the matched room once and ignores duplicate or trailing terminal events', async () => {
    const { socket, search } = await connectedSearch();
    const staleMessageHandler = socket.onmessage;
    const staleCloseHandler = socket.onclose;
    socket.message({ type: 'searching', protocolVersion: 1 });
    expect(socket.close).not.toHaveBeenCalled();
    socket.message(matched);
    staleMessageHandler?.call(socket as unknown as WebSocket, { data: JSON.stringify({ ...matched, matchId: 'wrong-match' }) } as MessageEvent);
    staleCloseHandler?.call(socket as unknown as WebSocket, {} as CloseEvent);
    search.cancel();
    await expect(search.result).resolves.toEqual(match);
    expect(socket.close).toHaveBeenCalledExactlyOnceWith(1000, 'Matched');
    expect(socket.send).not.toHaveBeenCalled();
  });

  it('ignores malformed or incompatible match messages until a valid match arrives', async () => {
    const { socket, search } = await connectedSearch();
    socket.message(null);
    socket.message({ ...matched, protocolVersion: 2 });
    socket.message({ ...matched, roomCode: null });
    socket.onmessage?.call(socket as unknown as WebSocket, { data: '{invalid' } as MessageEvent);
    expect(socket.close).not.toHaveBeenCalled();
    socket.message(matched);
    await expect(search.result).resolves.toEqual(match);
  });

  it('reports ticket and socket creation failures to the caller', async () => {
    const createSocket = vi.fn(() => { throw new Error('Socket creation failed.'); });
    const noTicket = createMatchmakingSearch({ requestTicket: async () => { throw new Error('Ticket unavailable.'); }, createSocket });
    await expect(noTicket.result).rejects.toThrow('Ticket unavailable');
    expect(createSocket).not.toHaveBeenCalled();
    const noSocket = createMatchmakingSearch({ requestTicket: async () => 'ticket', createSocket });
    await expect(noSocket.result).rejects.toThrow('Socket creation failed');
  });

  it('preserves cancellation when the abandoned ticket request rejects later', async () => {
    const ticket = deferred<string>();
    const search = createMatchmakingSearch({ requestTicket: () => ticket.promise, createSocket: () => new FakeSocket() });
    const rejected = expect(search.result).rejects.toMatchObject({ name: 'AbortError' });
    search.cancel();
    ticket.reject(new Error('Old ticket failed.'));
    await rejected;
  });

  it('still settles cancellation if a native socket throws while closing', async () => {
    const { socket, search } = await connectedSearch();
    socket.close.mockImplementation(() => { throw new Error('Already closing.'); });
    const rejected = expect(search.result).rejects.toMatchObject({ name: 'AbortError' });
    search.cancel();
    await rejected;
  });
});
