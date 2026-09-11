import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../src/state/AppProvider';
import { colors } from '../src/theme';
export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  return <SafeAreaProvider>
    <AppProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'none' }} />
    </AppProvider>
  </SafeAreaProvider>;
}
