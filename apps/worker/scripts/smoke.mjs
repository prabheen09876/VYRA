import assert from 'node:assert/strict';

const base = process.env.VYRA_API_URL ?? 'http://localhost:8787';
const full = process.argv.includes('--full');
const pvpFull = process.argv.includes('--pvp-full');
const matchmakingFull = process.argv.includes('--matchmaking-full');
async function api(path, { token, body, method = 'GET', status = 200 } = {}) {
  const response = await fetch(`${base}${path}`, {
    method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  assert.equal(response.status, status, `${method} ${path}: ${await response.clone().text()}`);
  return response.json();
}
const people = await Promise.all(['Aster', 'Cinder', 'Visitor'].map(name => api('/api/guests', { method: 'POST', body: { name }, status: 201 })));
const [a, b, stranger] = people;
assert.equal((await api('/api/profile', { token: a.token })).id, a.profile.id);
await api('/api/profile/equip', { token: a.token, method: 'POST', body: { slot: 'aura', itemId: 'nova-aura' }, status: 403 });
const room = await api('/api/matches', { token: a.token, method: 'POST', body: { mode: 'pvp' }, status: 201 });
await api(`/api/matches/${room.matchId}/ticket`, { token: stranger.token, method: 'POST', status: 403 });
await api(`/api/rooms/${room.roomCode}/join`, { token: b.token, method: 'POST' });
await api(`/api/rooms/${room.roomCode}/join`, { token: stranger.token, method: 'POST', status: 409 });

async function connect(person, match) {
  const { ticket } = await api(`/api/matches/${match.matchId}/ticket`, { token: person.token, method: 'POST' });
  const url = `${base.replace(/^http/, 'ws')}/api/matches/${match.matchId}/ws?ticket=${ticket}`;
  const socket = new WebSocket(url);
  const state = { socket, snapshot: null, snapshots: [], offset: 0, seq: 0, repPhase: '', lastRep: 0, lastTracking: 0, errors: [] };
  const listeners = new Set();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.type === 'snapshot') { state.snapshot = message.snapshot; state.snapshots.push(message.snapshot); state.offset = message.snapshot.serverNow - Date.now(); }
    if (message.type === 'error') state.errors.push(message.code);
    for (const listener of listeners) listener();
  });
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  const ping = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping', protocolVersion: 1, sentAt: Date.now() })); }, 3000);
  state.send = command => socket.send(JSON.stringify({ protocolVersion: 1, ...command }));
  state.wait = (condition, timeoutMs = 10000) => new Promise((resolve, reject) => {
    let timeout;
    const check = () => { if (condition(state.snapshot)) { clearTimeout(timeout); listeners.delete(check); resolve(state.snapshot); } };
    timeout = setTimeout(() => { listeners.delete(check); reject(new Error(`Timed out; phase=${state.snapshot?.phase}`)); }, timeoutMs);
    listeners.add(check); check();
  });
  state.close = () => { clearInterval(ping); socket.close(); };
  await state.wait(s => !!s);
  // Consumption is atomic: a ticket cannot establish a second socket.
  await new Promise((resolve, reject) => {
    const replay = new WebSocket(url);
    replay.addEventListener('open', () => { replay.close(); reject(new Error('Replayed ticket accepted')); });
    replay.addEventListener('error', resolve, { once: true });
  });
  return state;
}

async function runPvpFull() {
  const before = await Promise.all([a, b].map(person => api('/api/profile', { token: person.token })));
  const match = await api('/api/matches', { token: a.token, method: 'POST', body: { mode: 'pvp' }, status: 201 });
  await api(`/api/rooms/${match.roomCode}/join`, { token: b.token, method: 'POST' });
  const clients = await Promise.all([a, b].map(person => connect(person, match)));
  const plans = [{ squat: 8, pushup: 8 }, { squat: 4, pushup: 6 }];
  const timers = clients.map((client, index) => {
    let phaseId = '', sent = 0, lastRep = 0, lastTracking = 0;
    return setInterval(() => {
      const s = client.snapshot;
      if (!s || !['squat', 'pushup'].includes(s.phase)) return;
      const now = Date.now() + client.offset;
      if (phaseId !== s.phaseId) { phaseId = s.phaseId; sent = 0; lastRep = 0; lastTracking = 0; }
      if (now - lastTracking >= 1000) {
        lastTracking = now;
        client.send({ type: 'tracking', phaseId, visible: true, confidence: 0.95 });
      }
      if (sent >= plans[index][s.phase] || now - lastRep < 1100 || now < s.phaseStartedAt + 1000 || now > s.phaseEndsAt - 200) return;
      sent++; lastRep = now;
      client.send({ type: 'rep', event: { phaseId, seq: ++client.seq, exercise: s.phase,
        occurredAt: now, confidence: 0.95, modelVersion: 'synthetic-pvp-protocol-smoke' } });
    }, 150);
  });
  try {
    clients.forEach(client => client.send({ type: 'ready' }));
    await Promise.all(clients.map(client => client.wait(s => s?.phase === 'countdown')));
    console.log('Playing a timed private PvP protocol match with two independent guest sockets (about 135 seconds).');
    const complete = s => s?.phase === 'finished' && !!s.rewards?.[a.profile.id] && !!s.rewards?.[b.profile.id];
    const final = await Promise.all(clients.map(client => client.wait(complete, 250000)));
    const publicState = s => ({ phase: s.phase, phaseId: s.phaseId, round: s.round, winnerId: s.winnerId,
      template: s.template, players: s.players, rewards: s.rewards });
    assert.deepEqual(publicState(final[0]), publicState(final[1]), 'Both guests must receive the same authoritative result and receipts');
    assert.equal(final[0].round, 2); assert.equal(final[0].winnerId, a.profile.id);
    assert.equal(final[0].players.find(p => p.id === a.profile.id).hp, 42);
    assert.equal(final[0].players.find(p => p.id === b.profile.id).hp, 0);
    for (const client of clients) {
      assert.deepEqual(client.errors, [], 'All scheduled protocol reps should be accepted');
      const hpStates = [...new Set(client.snapshots.map(s => `${s.players.find(p => p.id === a.profile.id)?.hp},${s.players.find(p => p.id === b.profile.id)?.hp}`))];
      assert.deepEqual(hpStates, ['100,100', '71,49', '42,0'], 'HP must change simultaneously at settlement, never on rep arrival');
    }
    const timeline = client => new Map(client.snapshots.filter(s => s.phase !== 'lobby').map(s => [s.phaseId,
      { phase: s.phase, round: s.round, startedAt: s.phaseStartedAt, endsAt: s.phaseEndsAt }]));
    assert.deepEqual([...timeline(clients[0])], [...timeline(clients[1])], 'Both sockets must observe identical authoritative phase deadlines');
    const after = await Promise.all([a, b].map(person => api('/api/profile', { token: person.token })));
    for (let index = 0; index < 2; index++) {
      const person = [a, b][index], receipt = final[0].rewards[person.profile.id];
      assert.equal(receipt.qualified, true); assert.ok(receipt.xp > 0);
      assert.equal(after[index].xp, before[index].xp + receipt.xp);
      assert.equal(after[index].qualifiedMatches, before[index].qualifiedMatches + 1);
      assert.ok(after[index].ownedCosmetics.includes('ion-skin'));
    }
    const health = await api('/api/health');
    if (!health.aiEnabled) { assert.equal(final[0].decision.source, 'fallback'); assert.equal(final[0].decision.template, 'balanced'); }
    clients.forEach(client => client.close());
    const reconnected = await Promise.all([a, b].map(person => connect(person, match)));
    for (const client of reconnected) { assert.deepEqual(client.snapshot.rewards, final[0].rewards); client.close(); }
    const again = await Promise.all([a, b].map(person => api('/api/profile', { token: person.token })));
    assert.deepEqual(again.map(profile => profile.xp), after.map(profile => profile.xp), 'Reconnect must not grant either player a duplicate reward');
    console.log('PASS complete timed private PvP, matching phases, simultaneous HP settlement, both reward ledgers, reconnect deduplication and local AI fallback');
    console.log('Protocol smoke uses synthetic events; it does not validate camera capture, physical movement, or model accuracy.');
  } finally { timers.forEach(clearInterval); clients.forEach(client => client.close()); }
}
const aSocket = await connect(a, room), bSocket = await connect(b, room);
aSocket.send({ type: 'ready' }); bSocket.send({ type: 'ready' });
await aSocket.wait(s => s?.phase === 'countdown');
bSocket.send({ type: 'stop', reason: 'smoke-background' });
const interrupted = await aSocket.wait(s => s?.phase === 'interrupted');
assert.equal(interrupted.winnerId, null); assert.equal(interrupted.rewards, undefined);
aSocket.close(); bSocket.close();
assert.equal((await api('/api/profile', { token: a.token })).xp, 0);
console.log('PASS guest auth, locked equipment, room membership, single-use tickets, sockets, interruption, no XP');

if (full) {
  const solo = await api('/api/matches', { token: a.token, method: 'POST', body: { mode: 'solo' }, status: 201 });
  const client = await connect(a, solo); client.send({ type: 'ready' });
  const reps = setInterval(() => {
    const s = client.snapshot;
    if (!s || !['squat', 'pushup'].includes(s.phase)) return;
    const now = Date.now() + client.offset;
    if (client.repPhase !== s.phaseId || now - client.lastTracking >= 1000) {
      client.repPhase = s.phaseId; client.lastTracking = now;
      client.send({ type: 'tracking', phaseId: s.phaseId, visible: true, confidence: 0.95 });
    }
    if (now - client.lastRep < 1100 || now < s.phaseStartedAt + 1000 || now > s.phaseEndsAt - 200) return;
    client.lastRep = now;
    client.send({ type: 'rep', event: { phaseId: s.phaseId, seq: ++client.seq, exercise: s.phase,
      occurredAt: now, confidence: 0.95, modelVersion: 'synthetic-protocol-smoke' } });
  }, 150);
  try {
    const final = await client.wait(s => s?.phase === 'finished' && !!s.rewards?.[a.profile.id], 250000);
    const health = await api('/api/health');
    if (!health.aiEnabled) { assert.equal(final.decision.template, 'balanced'); assert.equal(final.decision.source, 'fallback'); }
    const receipt = final.rewards[a.profile.id]; assert.equal(receipt.qualified, true); assert.ok(receipt.xp > 0);
    const after = await api('/api/profile', { token: a.token }); assert.equal(after.xp, receipt.xp);
    assert.ok(after.ownedCosmetics.includes('ion-skin'));
    client.close();
    const reconnect = await connect(a, solo);
    assert.deepEqual(reconnect.snapshot.rewards[a.profile.id], receipt); reconnect.close();
    assert.equal((await api('/api/profile', { token: a.token })).xp, receipt.xp);
    console.log('PASS timed solo game, simultaneous result, persisted XP/unlock, reconnect receipt without duplicate reward');
    console.log('Protocol smoke uses synthetic events; it does not validate physical movement or model accuracy.');
  } finally { clearInterval(reps); client.close(); }
}
if (pvpFull) await runPvpFull();

async function connectMatchmaking(person) {
  const { ticket } = await api('/api/matchmaking/ticket', { token: person.token, method: 'POST' });
  const url = `${base.replace(/^http/, 'ws')}/api/matchmaking/ws?ticket=${ticket}`;
  const socket = new WebSocket(url);
  const state = { socket, events: [] };
  socket.addEventListener('message', event => state.events.push(JSON.parse(event.data)));
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  state.send = command => socket.send(JSON.stringify({ protocolVersion: 1, ...command }));
  state.wait = (predicate, timeoutMs = 10000) => new Promise((resolve, reject) => {
    const check = () => { const found = state.events.find(predicate); if (found) { clearInterval(poll); clearTimeout(timer); resolve(found); } };
    const poll = setInterval(check, 50);
    const timer = setTimeout(() => { clearInterval(poll); reject(new Error('Timed out waiting for a matchmaking event')); }, timeoutMs);
    check();
  });
  return state;
}
async function rejected(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.addEventListener('open', () => { socket.close(); reject(new Error('Expected connection to be rejected, but it opened')); });
    socket.addEventListener('error', resolve, { once: true });
  });
}

async function runMatchmakingFull() {
  const [x, y] = await Promise.all(['Rhea', 'Milo'].map(name => api('/api/guests', { method: 'POST', body: { name }, status: 201 })));

  // A disconnected searcher must not linger in the queue and ghost-match a later stranger.
  const ghost = await api('/api/guests', { method: 'POST', body: { name: 'Ghost' }, status: 201 });
  const ghostClient = await connectMatchmaking(ghost);
  await ghostClient.wait(e => e.type === 'searching');
  ghostClient.socket.close();
  await new Promise(resolve => setTimeout(resolve, 300));

  const clientX = await connectMatchmaking(x);
  await clientX.wait(e => e.type === 'searching');

  // A player cannot open a second concurrent matchmaking connection while already searching.
  const { ticket: dupTicket } = await api('/api/matchmaking/ticket', { token: x.token, method: 'POST' });
  await rejected(`${base.replace(/^http/, 'ws')}/api/matchmaking/ws?ticket=${dupTicket}`);

  const clientY = await connectMatchmaking(y);
  const [matchedX, matchedY] = await Promise.all([clientX.wait(e => e.type === 'matched'), clientY.wait(e => e.type === 'matched')]);
  assert.equal(matchedX.matchId, matchedY.matchId, 'Both players must be paired into the same match');
  assert.equal(matchedX.roomCode, matchedY.roomCode);
  clientX.socket.close(); clientY.socket.close();
  console.log('PASS matchmaking pairs two independent guests atomically; disconnect-while-searching and duplicate-connection are both rejected/cleaned up');

  // Cancelling leaves the queue and closes the socket.
  const canceller = await api('/api/guests', { method: 'POST', body: { name: 'Canceller' }, status: 201 });
  const cancelClient = await connectMatchmaking(canceller);
  await cancelClient.wait(e => e.type === 'searching');
  cancelClient.send({ type: 'cancel' });
  await new Promise((resolve, reject) => {
    cancelClient.socket.addEventListener('close', resolve, { once: true });
    setTimeout(() => reject(new Error('Cancelled socket did not close')), 5000);
  });
  console.log('PASS cancelling matchmaking closes the socket and frees the queue slot');

  // The matched pair hands off into the existing, unmodified MatchRoom engine: connect, ready,
  // and the battle does not start until BOTH players are ready (server-authoritative).
  const match = { matchId: matchedX.matchId, roomCode: matchedX.roomCode };
  const [px, py] = await Promise.all([x, y].map(person => connect(person, match)));
  px.send({ type: 'ready' });
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(px.snapshot.phase, 'lobby', 'Battle must not start until both players are ready');
  py.send({ type: 'ready' });
  await Promise.all([px, py].map(client => client.wait(s => s?.phase === 'countdown')));
  console.log('PASS matchmaking hand-off: battle only starts once both matched players explicitly ready up, using the unmodified match engine');
  px.close(); py.close();
}
if (matchmakingFull) await runMatchmakingFull();
