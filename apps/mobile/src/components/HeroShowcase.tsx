import React from 'react';
import { View } from 'react-native';
import HeroView from './HeroView';
import { useScreenFocus } from '../lib/useScreenFocus';

export default function HeroShowcase(props: React.ComponentProps<typeof HeroView>) {
  const focused = useScreenFocus();
  return focused ? <HeroView {...props} /> : <View style={props.style} />;
}
