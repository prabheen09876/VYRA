import React, { useEffect } from 'react';
import { Stack, router, usePathname, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from '../src/state/AppProvider';
import { CoachProvider } from '../src/state/CoachProvider';
import FloatingCoach from '../src/components/FloatingCoach';
import { colors } from '../src/theme';
export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  return <SafeAreaProvider>
    <AppProvider>
      <CoachProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'none' }} />
        <FitnessSetupGate />
        <FloatingCoach />
      </CoachProvider>
    </AppProvider>
  </SafeAreaProvider>;
}

function FitnessSetupGate() {
  const { profile, booting } = useApp();
  const pathname = usePathname();
  const navigation = useRootNavigationState();
  useEffect(() => {
    if (!navigation?.key || booting || !profile || profile.fitness) return;
    // Existing matches and reward recovery must remain reachable while a player finishes setup.
    if (['/profile', '/onboarding', '/lobby', '/calibrate', '/battle', '/results', '/coach', '/train'].includes(pathname)) return;
    router.replace('/onboarding');
  }, [navigation?.key, booting, profile?.id, profile?.fitness, pathname]);
  return null;
}
