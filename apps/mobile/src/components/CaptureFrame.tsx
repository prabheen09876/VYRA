import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { CaptureControl, CaptureMessage } from '@vyra/core';
import { colors, fonts } from '../theme';

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
  const configure = () => webView.current?.postMessage(JSON.stringify(controlRef.current));
  useEffect(() => { if (loaded) configure(); }, [control.exercise, control.enabled, resetKey, loaded]);

  const receive = (event: WebViewMessageEvent) => {
    if (event.nativeEvent.url && !event.nativeEvent.url.startsWith(allowedOrigin + '/')) return;
    try {
      const message = JSON.parse(event.nativeEvent.data) as CaptureMessage;
      if (message.protocolVersion !== 1 || !message.type?.startsWith('capture.')) return;
      if (message.type === 'capture.ready') configure();
      onMessage(message);
    } catch { /* Ignore messages outside the capture protocol. */ }
  };

  if (!permission) return <View style={styles.message}><ActivityIndicator color={colors.teal} /></View>;
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
    {!loaded && <View style={styles.loading}><ActivityIndicator color={colors.teal} /><Text style={styles.copy}>Opening your camera…</Text></View>}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 320, backgroundColor: '#080F19' },
  webview: { flex: 1, backgroundColor: '#080F19' },
  loading: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: '#080F19' },
  message: { flex: 1, minHeight: 320, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 16 },
  title: { fontFamily: fonts.display, fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center' },
  copy: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: colors.muted, textAlign: 'center', maxWidth: 380 },
  button: { minHeight: 48, backgroundColor: colors.teal, borderRadius: 14, paddingHorizontal: 22, justifyContent: 'center' },
  buttonText: { fontFamily: fonts.body, color: colors.ink, fontWeight: '700', fontSize: 16 },
});
