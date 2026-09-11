import type { MatchSnapshot, ServerEvent } from '@vyra/core';

type ReceiptSocket = Pick<WebSocket, 'onmessage' | 'onerror' | 'onclose' | 'close'>;

/** A terminal-only connection: it never sends readiness, movement, or gameplay commands. */
export function waitForTerminalReceipt(options: {
  url: string;
  matchId: string;
  playerId: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  createSocket?: (url: string) => ReceiptSocket;
}): Promise<MatchSnapshot> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) { reject(new Error('Reward retrieval cancelled.')); return; }
    let socket: ReceiptSocket;
    try { socket = (options.createSocket ?? (url => new WebSocket(url)))(options.url); }
    catch { reject(new Error('Could not open the reward connection. Check your connection and retry.')); return; }
    let settled = false;
    const finish = (snapshot?: MatchSnapshot, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      try { socket.close(1000, 'Reward receipt lookup complete'); } catch { /* Already-closed native sockets must still settle the lookup. */ }
      if (snapshot) resolve(snapshot); else reject(error);
    };
    const abort = () => finish(undefined, new Error('Reward retrieval cancelled.'));
    const timer = setTimeout(() => finish(undefined, new Error('The reward receipt is not available yet. Your completed match is saved; retry in a moment.')), options.timeoutMs ?? 15000);
    options.signal?.addEventListener('abort', abort, { once: true });
    socket.onmessage = message => {
      let event: ServerEvent;
      try { event = JSON.parse(String(message.data)) as ServerEvent; } catch { return; }
      if (event.type === 'error') { finish(undefined, new Error(event.message)); return; }
      if (event.type !== 'snapshot' || event.snapshot.protocolVersion !== 1 || event.snapshot.id !== options.matchId) return;
      if (event.snapshot.phase !== 'finished') {
        finish(undefined, new Error('This connection did not return a completed workout. Gameplay was not resumed.'));
        return;
      }
      if (event.snapshot.rewards?.[options.playerId]) finish(event.snapshot);
    };
    socket.onerror = () => finish(undefined, new Error('The reward connection failed. Check your connection and retry the receipt.'));
    socket.onclose = () => finish(undefined, new Error('The connection closed before the reward receipt arrived. Retry to retrieve the saved result.'));
  });
}
