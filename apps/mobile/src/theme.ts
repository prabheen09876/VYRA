import { Platform } from 'react-native';

// Near-black cinematic base with a controlled accent palette. Content colors
// (stage/rarity colors from @vyra/core) stay separate and are used as-is —
// this is the chrome/UI palette only.
export const colors = {
  background: '#07080A', backgroundElevated: '#0B0D11', surface: '#111318', surfaceRaised: '#191C22',
  glass: 'rgba(255,255,255,0.045)', glassStrong: 'rgba(255,255,255,0.08)',
  line: 'rgba(255,255,255,0.10)', lineStrong: 'rgba(255,255,255,0.20)',
  text: '#F6F8FB', muted: '#8D96A5', faint: '#565F6C',
  teal: '#78E2D0', coral: '#FF987E', gold: '#FFD17B', blue: '#85BBED', purple: '#BE9AFF',
  danger: '#FF9C8C', ink: '#08090B',
};

export const fonts = {
  display: Platform.select({ ios: 'Avenir Next', android: 'sans-serif-condensed', default: "'Arial Black', 'Helvetica Neue', Arial, sans-serif" }),
  body: Platform.select({ ios: 'Avenir Next', android: 'sans-serif', default: "'Helvetica Neue', Arial, sans-serif" }),
};

// Shared numeric scales so new work stays consistent without hard-coding
// one-off numbers. Existing screens may still use their own values —
// prefer these for anything touched during the redesign.
export const spacing = { xs: 6, sm: 12, md: 18, lg: 28, xl: 40, xxl: 64, xxxl: 96 };
export const radii = { sm: 10, md: 16, lg: 22, xl: 30, pill: 999 };
export const type = { eyebrow: 12, label: 13, body: 16, subhead: 20, h3: 26, h2: 36, h1: 56, display: 84 };

// Soft directional glow used behind glass cards / hero surfaces instead of
// hard drop shadows — reads as ambient light, not elevation.
export const glow = (color: string, radius = 48, opacity = 0.35) => ({
  shadowColor: color, shadowOffset: { width: 0, height: 0 }, shadowOpacity: opacity, shadowRadius: radius, elevation: 12,
});

export const stageLabel = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
