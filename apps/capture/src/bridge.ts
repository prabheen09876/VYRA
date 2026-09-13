import type { CaptureControl, CaptureMessage } from '@vyra/core';

declare global { interface Window { ReactNativeWebView?: { postMessage(message: string): void } } }
export function parseCaptureControl(value: unknown): CaptureControl | null {
  try {
    if (typeof value === 'string' && value.length > 2000) return null;
    const input = typeof value === 'string' ? JSON.parse(value) as unknown : value;
    if (!input || typeof input !== 'object') return null;
    const control = input as Record<string, unknown>;
    if (control.type !== 'capture.configure' || ![null, 'squat', 'pushup'].includes(control.exercise as string | null) || typeof control.enabled !== 'boolean' || typeof control.reset !== 'boolean') return null;
    if (control.poseStream !== undefined && typeof control.poseStream !== 'boolean') return null;
    if (control.debugOverlay !== undefined && typeof control.debugOverlay !== 'boolean') return null;
    return {
      type: 'capture.configure', exercise: control.exercise as CaptureControl['exercise'], enabled: control.enabled, reset: control.reset,
      ...(control.poseStream !== undefined ? { poseStream: control.poseStream as boolean } : {}),
      ...(control.debugOverlay !== undefined ? { debugOverlay: control.debugOverlay as boolean } : {}),
    };
  } catch { return null; }
}

/** The actual embedding referrer's origin is the authority, never a wildcard or arbitrary query URL. */
export function resolveParentOrigin(selfOrigin: string, referrer: string, requested: string | null, allowedOrigins: string[] = []): string | null {
  try {
    const actual = referrer ? new URL(referrer).origin : selfOrigin;
    const url = new URL(actual);
    const local = (value: URL) => ['http:', 'https:'].includes(value.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(value.hostname);
    const localDevelopment = local(url) && local(new URL(selfOrigin));
    if (actual !== selfOrigin && !localDevelopment && !allowedOrigins.includes(actual)) return null;
    if (url.protocol !== 'https:' && !localDevelopment) return null;
    if (requested && new URL(requested).origin !== actual) return null;
    return actual;
  } catch { return null; }
}

export function createCaptureBridge(onControl: (control: CaptureControl) => void) {
  const native = !!window.ReactNativeWebView;
  const embedded = native || window.parent !== window;
  const allowedOrigins = (import.meta.env.VITE_PARENT_ORIGINS ?? '').split(',').map((value: string) => value.trim()).filter(Boolean);
  const parentOrigin = resolveParentOrigin(location.origin, document.referrer, new URLSearchParams(location.search).get('parentOrigin'), allowedOrigins);
  const receive = (event: MessageEvent) => {
    if (native) {
      // RN injectJavaScript creates a MessageEvent without an origin/source. Only the app owns this document.
      if (event.source !== null || (event.origin !== '' && event.origin !== location.origin)) return;
    } else if (!embedded || !parentOrigin || event.source !== window.parent || event.origin !== parentOrigin) return;
    const control = parseCaptureControl(event.data);
    if (control) onControl(control);
  };
  window.addEventListener('message', receive);
  document.addEventListener('message', receive as EventListener);
  return {
    embedded,
    send(message: CaptureMessage) {
      if (native) window.ReactNativeWebView!.postMessage(JSON.stringify(message));
      else if (window.parent !== window && parentOrigin) window.parent.postMessage(message, parentOrigin);
    },
    dispose() { window.removeEventListener('message', receive); document.removeEventListener('message', receive as EventListener); },
  };
}
