import { useEffect } from 'react';
import { router, useRootNavigationState } from 'expo-router';
import { useCoach } from '../src/state/CoachProvider';

// Keep old links useful while Coach now lives in the floating chat.
export default function CoachRedirect() {
  const navigation = useRootNavigationState();
  const { openCoach } = useCoach();
  useEffect(() => {
    if (!navigation?.key) return;
    router.replace('/');
    openCoach();
  }, [navigation?.key, openCoach]);
  return null;
}
