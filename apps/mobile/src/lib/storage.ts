import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const key = 'vyra.session.v1';
export interface SavedSession {
  apiUrl: string;
  token: string | null;
  name: string;
  muted: boolean;
  reducedMotion: boolean;
  identities: Record<string, { token: string; name: string }>;
}

export async function readSession(): Promise<Partial<SavedSession> | null> {
  try {
    const raw = Platform.OS === 'web'
      ? (typeof window === 'undefined' ? null : window.localStorage.getItem(key))
      : await SecureStore.getItemAsync(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const value = parsed as Record<string, unknown>;
    const saved: Partial<SavedSession> = {};
    if (typeof value.apiUrl === 'string') saved.apiUrl = value.apiUrl;
    if (typeof value.name === 'string') saved.name = value.name;
    if (value.token === null || typeof value.token === 'string') saved.token = value.token;
    if (typeof value.muted === 'boolean') saved.muted = value.muted;
    if (typeof value.reducedMotion === 'boolean') saved.reducedMotion = value.reducedMotion;
    saved.identities = {};
    if (value.identities && typeof value.identities === 'object' && !Array.isArray(value.identities)) {
      for (const [url, identity] of Object.entries(value.identities)) {
        if (identity && typeof identity === 'object' && typeof identity.token === 'string' && typeof identity.name === 'string') {
          saved.identities[url] = { token: identity.token, name: identity.name };
        }
      }
    }
    if (saved.apiUrl && saved.token) saved.identities[saved.apiUrl] = { token: saved.token, name: saved.name || '' };
    return saved;
  } catch { return null; }
}

let saveQueue = Promise.resolve();
export function saveSession(session: SavedSession): Promise<void> {
  const raw = JSON.stringify(session);
  const save = saveQueue.catch(() => undefined).then(async () => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.localStorage.setItem(key, raw);
    } else await SecureStore.setItemAsync(key, raw);
  });
  saveQueue = save;
  return save;
}
