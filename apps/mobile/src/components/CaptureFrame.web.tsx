import React, { useEffect, useRef } from 'react';
import type { CaptureControl, CaptureMessage } from '@vyra/core';

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
  const configure = () => frame.current?.contentWindow?.postMessage(latestControl.current, origin);
  useEffect(() => { configure(); }, [control.exercise, control.enabled, resetKey, origin]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== origin) return;
      try {
        const message = (typeof event.data === 'string' ? JSON.parse(event.data) : event.data) as CaptureMessage;
        if (message?.protocolVersion !== 1 || !message.type?.startsWith('capture.')) return;
        if (message.type === 'capture.ready') configure();
        latestHandler.current(message);
      } catch { /* Ignore messages outside the capture protocol. */ }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [origin]);
  return <iframe
    ref={frame}
    title="VYRA on-device movement camera"
    src={url}
    allow="camera; autoplay"
    onLoad={configure}
    style={{ width: '100%', height: '100%', minHeight: 320, flex: 1, border: 0, background: '#080F19', display: 'block' }}
  />;
}
