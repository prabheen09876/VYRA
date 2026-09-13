import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { parseCaptureMessage, type CaptureControl, type CaptureMessage } from '@vyra/core';
import { colors, displayWeight, fonts } from '../theme';

export interface CaptureFrameProps {
  url: string;
  control: CaptureControl;
  resetKey: string;
  onMessage: (message: CaptureMessage) => void;
}

export default function CaptureFrame({ url, control, resetKey, onMessage }: CaptureFrameProps) {
  const webView = useRef<WebView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controlRef = useRef(control);
  controlRef.current = control;
  const allowedOrigin = new URL(url).origin;
  const configure = (reset = controlRef.current.reset) => webView.current?.postMessage(JSON.stringify({ ...controlRef.current, reset }));
  useEffect(() => { if (loaded) configure(); }, [control.exercise, control.enabled, resetKey, loaded]);
  useEffect(() => { if (loaded) configure(false); }, [control.poseStream, control.debugOverlay, loaded]);

  const receive = (event: WebViewMessageEvent) => {
    if (event.nativeEvent.url && !event.nativeEvent.url.startsWith(allowedOrigin + '/')) return;
    try {
      const message = parseCaptureMessage(event.nativeEvent.data);
      if (!message) return;
      if (message.type === 'capture.ready') configure();
      onMessage(message);
    } catch { /* Ignore messages outside the capture protocol. */ }
  };

  if (!permission) return <View style={styles.message}><ActivityIndicator color={colors.brand} /></View>;
  if (!permission.granted) return <View style={styles.message}>
    <Text style={styles.title}>Let VYRA see your movement</Text>
    <Text style={styles.copy}>Camera access lets your device count reps. Video stays on your device.</Text>
    <Pressable accessibilityRole="button" style={styles.button} onPress={() => permission.canAskAgain ? void requestPermission() : void Linking.openSettings()}>
      <Text style={styles.buttonText}>{permission.canAskAgain ? 'Allow camera' : 'Open device settings'}</Text>
    </Pressable>
  </View>;
  if (error) return <View style={styles.message}>
    <Text style={styles.title}>Camera page unavailable</Text>
    <Text style={styles.copy}>{error}</Text>
    <Pressable accessibilityRole="button" style={styles.button} onPress={() => { setError(null); setLoaded(false); }}>
      <Text style={styles.buttonText}>Try again</Text>
    </Pressable>
  </View>;
  return <View style={styles.container}>
    <WebView
      ref={webView}
      source={{ uri: url }}
      style={styles.webview}
      onMessage={receive}
      onLoadEnd={() => { setLoaded(true); configure(); }}
      onError={event => setError(event.nativeEvent.description || 'Check the server address and your connection.')}
      onHttpError={event => setError('The camera page returned status ' + event.nativeEvent.statusCode + '. Check that the capture app is served at /capture/.')}
      onShouldStartLoadWithRequest={request => request.url === 'about:blank' || request.url.startsWith(allowedOrigin + '/')}
      originWhitelist={[allowedOrigin]}
      javaScriptEnabled
      domStorageEnabled
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
      setSupportMultipleWindows={false}
    />
    {!loaded && <View style={styles.loading}><ActivityIndicator color={colors.brand} /><Text style={styles.copy}>Opening your camera…</Text></View>}
  </View>;
}

const styles = StyleSheet.create({
  // Opaque backing behind the camera page so a slow first frame shows the app's own surface
  // rather than white. Must stay in step with CaptureFrame.web.tsx, which paints the same
  // value on the <iframe>.
  container: { flex: 1, minHeight: 320, backgroundColor: colors.surface },
  webview: { flex: 1, backgroundColor: colors.surface },
  loading: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: colors.surface },
  message: { flex: 1, minHeight: 320, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 16 },
  title: { fontFamily: fonts.display, fontSize: 24, fontWeight: displayWeight.heavy, color: colors.text, textAlign: 'center' },
  copy: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: colors.muted, textAlign: 'center', maxWidth: 380 },
  // The app's primary-button treatment, identical to ui.tsx `primary`: white fill with an `ink`
  // label (20.5:1 — the highest-contrast option available, and this control carries the only CTA
  // in a permission/error dead end). A `brand` or `accent` fill under the same label would also
  // clear 4.5:1 (5.19:1 and 5.56:1 respectively), so this is a system-consistency choice, not a
  // contrast rescue — re-tint it only together with ui.tsx, never on its own.
  button: { minHeight: 48, backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 22, justifyContent: 'center' },
  buttonText: { fontFamily: fonts.body, color: colors.ink, fontWeight: '700', fontSize: 16 },
});
