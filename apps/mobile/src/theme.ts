import { Platform } from 'react-native';

export const colors = {
  background: '#101B2C', surface: '#192A40', raised: '#22364F', line: '#344861',
  text: '#EDF5FD', muted: '#A7B9CE', teal: '#78E2D0', coral: '#FF987E',
  gold: '#FFD17B', blue: '#85BBED', purple: '#BE9AFF', ink: '#10232C', danger: '#FFAD9D',
};
export const fonts = {
  display: Platform.select({ ios: 'Avenir Next', android: 'sans-serif-condensed', default: 'Trebuchet MS' }),
  body: Platform.select({ ios: 'Avenir Next', android: 'sans-serif', default: 'Arial' }),
};

export const stageLabel = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
