import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MatchSnapshot, RewardReceipt } from '@vyra/core';
import { waitForTerminalReceipt } from './reward-receipt';

class FakeSocket {
  onmessage: WebSocket['onmessage'] = null;
  onerror: WebSocket['onerror'] = null;
  onclose: WebSocket['onclose'] = null;
  close = vi.fn();
  send = vi.fn();
  snapshot(snapshot: MatchSnapshot) {
    this.onmessage?.call(this as unknown as WebSocket, { data: JSON.stringify({ type: 'snapshot', snapshot }) } as MessageEvent);
  }
  disconnect() { this.onclose?.call(this as unknown as WebSocket, {} as CloseEvent); }
}
const receipt = { id: 'receipt-1' } as RewardReceipt;
const snapshot = (phase: MatchSnapshot['phase'], reward = false) => ({
  protocolVersion: 1, id: 'match-1', phase, rewards: reward ? { 'player-1': receipt } : undefined,
}) as MatchSnapshot;
afterEach(() => vi.useRealTimers());

describe('terminal reward receipt recovery', () => {
  it('waits for this player receipt and closes without sending gameplay commands', async () => {
    const socket = new FakeSocket();
    const result = waitForTerminalReceipt({ url: 'wss://example.test/receipt', matchId: 'match-1', playerId: 'player-1', createSocket: () => socket });
    socket.snapshot(snapshot('finished'));
    expect(socket.close).not.toHaveBeenCalled();
    socket.snapshot(snapshot('finished', true));
    expect((await result).rewards?.['player-1']).toEqual(receipt);
    expect(socket.close).toHaveBeenCalledOnce();
    expect(socket.send).not.toHaveBeenCalled();
  });

  it('rejects active gameplay snapshots instead of resuming the workout', async () => {
    const socket = new FakeSocket();
    const result = waitForTerminalReceipt({ url: 'wss://example.test/receipt', matchId: 'match-1', playerId: 'player-1', createSocket: () => socket });
    const rejected = expect(result).rejects.toThrow('Gameplay was not resumed');
    socket.snapshot(snapshot('squat'));
    await rejected;
    expect(socket.send).not.toHaveBeenCalled();
    expect(socket.close).toHaveBeenCalledOnce();
  });

  it('ends a missing receipt wait at a bounded timeout', async () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    const result = waitForTerminalReceipt({ url: 'wss://example.test/receipt', matchId: 'match-1', playerId: 'player-1', timeoutMs: 100, createSocket: () => socket });
    const rejected = expect(result).rejects.toThrow('not available yet');
    socket.snapshot(snapshot('finished'));
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(socket.close).toHaveBeenCalledOnce();
  });

  it('reports a disconnection before receipt delivery', async () => {
    const socket = new FakeSocket();
    const result = waitForTerminalReceipt({ url: 'wss://example.test/receipt', matchId: 'match-1', playerId: 'player-1', createSocket: () => socket });
    const rejected = expect(result).rejects.toThrow('closed before the reward receipt');
    socket.disconnect();
    await rejected;
  });
});
