import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';

export function useScreenFocus(): boolean {
  const [focused, setFocused] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    const changed = () => setForeground(!document.hidden);
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', changed);
    return () => {
      subscription.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', changed);
    };
  }, []);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  return focused && foreground;
}
