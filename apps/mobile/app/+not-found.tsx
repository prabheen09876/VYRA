import React from 'react';
import { router } from 'expo-router';
import { Button, Copy, Heading, Screen, layout } from '../src/components/ui';
import { View } from 'react-native';

export default function NotFoundScreen() {
  return <Screen noNav><View style={layout.section}><Heading>That path is outside the arena.</Heading><Copy>Return to your hero to start a workout or explore your collection.</Copy><Button onPress={() => router.replace('/')}>Back to my hero</Button></View></Screen>;
}
