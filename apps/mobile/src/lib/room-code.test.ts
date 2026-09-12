import { describe, expect, it } from 'vitest';
import { ROOM_CODE_LENGTH, normalizeRoomCode, roomCodeError } from './room-code';

describe('normalizeRoomCode', () => {
  it('uppercases, so a code typed in lower case still reaches the room', () => {
    expect(normalizeRoomCode('e6mqct')).toBe('E6MQCT');
  });
  it('strips the punctuation and spacing a pasted code arrives with', () => {
    // lobby.tsx shares "…enter room code ABC123." — copying the tail of that sentence brings the
    // full stop along, and the join route matches alphanumerics only.
    expect(normalizeRoomCode('E6MQCT.')).toBe('E6MQCT');
    expect(normalizeRoomCode(' e6 mq-ct ')).toBe('E6MQCT');
    expect(normalizeRoomCode('\tE6MQCT\n')).toBe('E6MQCT');
  });
  it('clamps to the length the join route accepts', () => {
    expect(normalizeRoomCode('ABCDEFGHIJKL')).toHaveLength(ROOM_CODE_LENGTH);
    expect(normalizeRoomCode('ABCDEFGHIJKL')).toBe('ABCDEF');
  });
  it('leaves an already-valid code untouched', () => {
    expect(normalizeRoomCode('G634ZS')).toBe('G634ZS');
  });
  it('is idempotent, so normalising on input and again on submit is safe', () => {
    const once = normalizeRoomCode('  e6-mq ct. ');
    expect(normalizeRoomCode(once)).toBe(once);
  });
  it('returns empty for input with nothing usable in it', () => {
    expect(normalizeRoomCode('   ')).toBe('');
    expect(normalizeRoomCode('...')).toBe('');
  });
});

describe('roomCodeError', () => {
  it('asks for a code when the field is empty or only punctuation', () => {
    expect(roomCodeError('')).toMatch(/room code your friend shared/i);
    expect(roomCodeError('   ')).toMatch(/room code your friend shared/i);
  });
  it('names the length rather than letting the request 404 as a missing API route', () => {
    // Short of six characters the URL matches no route at all, and the worker answers
    // "API route not found." — which reads as a broken server, not a mistyped code.
    expect(roomCodeError('E6MQC')).toMatch(/six characters/i);
  });
  it('accepts a full-length code however it was typed or pasted', () => {
    for (const value of ['E6MQCT', 'e6mqct', ' E6MQCT. ', 'e6-mq-ct']) expect(roomCodeError(value)).toBeNull();
  });
  it('accepts overlong input, because normalising clamps it to a submittable code', () => {
    expect(roomCodeError('ABCDEFGHIJKL')).toBeNull();
  });
});
