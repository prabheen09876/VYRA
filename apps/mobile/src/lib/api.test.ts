import { describe, expect, it } from 'vitest';
import { adoptConfiguredApiUrl, defaultApiUrl, isLocalHostname, normalizeApiUrl } from './api';

const at = (href: string) => {
  const url = new URL(href);
  return { protocol: url.protocol, hostname: url.hostname, origin: url.origin };
};

describe('isLocalHostname', () => {
  it('recognises loopback by every name it goes by', () => {
    for (const host of ['localhost', 'LOCALHOST', '127.0.0.1', '::1', '[::1]']) expect(isLocalHostname(host)).toBe(true);
  });
  it('recognises the private ranges a laptop gets from a router', () => {
    for (const host of ['192.168.1.20', '10.0.0.5', '172.16.3.4', '172.31.255.254', '169.254.1.1', 'vyra.local']) {
      expect(isLocalHostname(host)).toBe(true);
    }
  });
  it('does not mistake a public address for a local one', () => {
    for (const host of ['vyra.workers.dev', 'localhost.evil.com', '172.32.0.1', '11.0.0.1', '193.168.1.20', '8.8.8.8']) {
      expect(isLocalHostname(host)).toBe(false);
    }
  });
  it('rejects octets that are not real addresses', () => {
    expect(isLocalHostname('999.1.1.1')).toBe(false);
    expect(isLocalHostname('192.168.1.999')).toBe(false);
  });
});

describe('defaultApiUrl', () => {
  it('follows the host that served the page, so a second device reaches the same worker', () => {
    // The bug this exists to prevent: pinned to localhost, laptop B resolves the API to itself and
    // the two players queue on two different workers — both "searching", never paired.
    expect(defaultApiUrl(at('http://192.168.1.20:8082/arena'))).toBe('http://192.168.1.20:8787');
  });
  it('keeps loopback development working exactly as before', () => {
    expect(defaultApiUrl(at('http://localhost:8082/'))).toBe('http://localhost:8787');
    expect(defaultApiUrl(at('http://127.0.0.1:19006/'))).toBe('http://127.0.0.1:8787');
  });
  it('uses the page origin unchanged once deployed, where the worker serves the bundle too', () => {
    expect(defaultApiUrl(at('https://vyra.example.workers.dev/arena'))).toBe('https://vyra.example.workers.dev');
  });
  it('keeps the page protocol, so an https page never falls back to a blocked http call', () => {
    expect(defaultApiUrl(at('https://192.168.1.20:8082/'))).toBe('https://192.168.1.20:8787');
  });
  it('returns nothing to connect to when there is no page, leaving Profile to ask', () => {
    expect(defaultApiUrl(null)).toBe('');
    expect(defaultApiUrl({ protocol: 'file:', hostname: '', origin: 'null' })).toBe('');
  });
  it('produces a URL normalizeApiUrl accepts, so it can be stored as a session address', () => {
    for (const href of ['http://192.168.1.20:8082/', 'http://localhost:8082/', 'https://vyra.example.workers.dev/x']) {
      const derived = defaultApiUrl(at(href));
      expect(normalizeApiUrl(derived)).toBe(derived);
    }
  });
});

describe('adoptConfiguredApiUrl', () => {
  const LAN = 'http://172.32.2.227:8787';
  const saved = (over: Partial<Parameters<typeof adoptConfiguredApiUrl>[0]> = {}) =>
    ({ apiUrl: 'http://localhost:8787', token: 'old-token', name: 'PlayerOne', identities: {}, ...over });

  it('overrides an address saved before the build was repointed', () => {
    // Without this the device keeps talking to the worker it used last time while the build says
    // otherwise — for matchmaking, a queue the other player is not in, and nothing reports a fault.
    expect(adoptConfiguredApiUrl(saved(), LAN)).toEqual({ apiUrl: LAN, token: null, name: 'PlayerOne' });
  });
  it('drops a token issued by the previous server rather than sending it to the new one', () => {
    expect(adoptConfiguredApiUrl(saved(), LAN)?.token).toBeNull();
  });
  it('restores the identity already held for the configured address', () => {
    const session = saved({ identities: { [LAN]: { token: 'lan-token', name: 'LanPlayer' } } });
    expect(adoptConfiguredApiUrl(session, LAN)).toEqual({ apiUrl: LAN, token: 'lan-token', name: 'LanPlayer' });
  });
  it('changes nothing when the saved address already matches the pin', () => {
    expect(adoptConfiguredApiUrl(saved({ apiUrl: LAN }), LAN)).toBeNull();
  });
  it('changes nothing when no address is configured, leaving the device free to choose in Profile', () => {
    expect(adoptConfiguredApiUrl(saved(), '')).toBeNull();
  });
  it('adopts a deployed address the same way, so production is not a special case', () => {
    const deployed = 'https://vyra.example.workers.dev';
    expect(adoptConfiguredApiUrl(saved(), deployed)).toEqual({ apiUrl: deployed, token: null, name: 'PlayerOne' });
  });
  it('takes over an unconfigured device with no saved session at all', () => {
    const blank = { apiUrl: '', token: null, name: '', identities: {} };
    expect(adoptConfiguredApiUrl(blank, LAN)).toEqual({ apiUrl: LAN, token: null, name: '' });
  });
});
