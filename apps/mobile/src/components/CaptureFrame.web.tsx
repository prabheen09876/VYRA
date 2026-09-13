import React, { useEffect, useRef } from 'react';
import { parseCaptureMessage, type CaptureControl, type CaptureMessage } from '@vyra/core';
import { colors } from '../theme';

interface CaptureFrameProps {
  url: string;
  control: CaptureControl;
  resetKey: string;
  onMessage: (message: CaptureMessage) => void;
}

export default function CaptureFrame({ url, control, resetKey, onMessage }: CaptureFrameProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const origin = new URL(url).origin;
  const latestControl = useRef(control);
  const latestHandler = useRef(onMessage);
  latestControl.current = control;
  latestHandler.current = onMessage;
  const configure = (reset = latestControl.current.reset) => frame.current?.contentWindow?.postMessage({ ...latestControl.current, reset }, origin);
  useEffect(() => { configure(); }, [control.exercise, control.enabled, resetKey, origin]);
  // Presentation changes must not discard a partly completed rep or restart calibration.
  useEffect(() => { configure(false); }, [control.poseStream, control.debugOverlay, origin]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== origin) return;
      try {
        const message = parseCaptureMessage(event.data);
        if (!message) return;
        if (message.type === 'capture.ready') configure();
        latestHandler.current(message);
      } catch { /* Ignore messages outside the capture protocol. */ }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [origin]);
  // `background` here is the same camera backing the native frame paints on its container and
  // WebView, read from the shared theme rather than duplicated as a literal so the two platforms
  // cannot drift apart — an iframe with no backing flashes white before the capture page loads.
  return <iframe
    ref={frame}
    title="VYRA on-device movement camera"
    src={url}
    allow="camera; autoplay"
    onLoad={() => configure()}
    style={{ width: '100%', height: '100%', minHeight: 320, flex: 1, border: 0, background: colors.surface, display: 'block' }}
  />;
}
