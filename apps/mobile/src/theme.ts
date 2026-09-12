import { Platform, type TextStyle } from 'react-native';

// Deep-space cinematic chrome: near-black with a midnight-navy cast, silver type and a
// cyan/mint accent. Content colors (stage/rarity colors from @vyra/core) stay separate
// and are used as-is — this is the chrome/UI palette only.
export const colors = {
  background: '#04060C', backgroundElevated: '#070B15', surface: '#0A1020', surfaceRaised: '#101A2E',
  glass: 'rgba(140,180,255,0.055)', glassStrong: 'rgba(150,195,255,0.105)',
  line: 'rgba(150,190,255,0.14)', lineStrong: 'rgba(160,200,255,0.28)',
  text: '#EEF4FF', muted: '#93A4C2', faint: '#5A6B87',
  teal: '#6FE9DA', coral: '#FF9E86', gold: '#FFD17B', blue: '#6EA8FF', purple: '#B99CFF',
  danger: '#FF9C8C', ink: '#050810',
};

// Atmosphere stops shared by SpaceBackdrop (full-bleed starfield) and the hero orb, so the
// page and the character stage read as one continuous sky rather than two separate washes.
export const atmosphere = {
  void: '#04060C', deep: '#050A16', mid: '#061128', horizon: '#07173A',
  haze: 'rgba(46,134,255,0.52)', hazeSoft: 'rgba(58,118,214,0.22)',
};

export const fonts = {
  // Heavy condensed display face for the hero wordmark/headings. The web stack prefers the
  // blackest grotesque actually installed on the host (no webfont download, so nothing to
  // block first paint); body stays on the neutral UI face.
  display: Platform.select({
    ios: 'Avenir Next Condensed',
    android: 'sans-serif-condensed',
    // Ordered blackest-and-most-condensed first. The macOS face has to be named by its
    // PostScript name — Chrome will not resolve "Helvetica Neue Condensed Black" as a family.
    default: "'HelveticaNeue-CondensedBlack', 'Avenir Next Condensed', Haettenschweiler, Impact, 'Arial Black', Helvetica, Arial, sans-serif",
  }),
  body: Platform.select({ ios: 'Avenir Next', android: 'sans-serif', default: "'Helvetica Neue', Arial, sans-serif" }),
};

// Brushed silver-to-steel fill for the hero display type. Web-only (clipping a gradient to
// glyphs has no RN equivalent); everywhere else the solid `colors.text` underneath shows
// through, so this is purely additive.
export const displayGradient = (Platform.OS === 'web' ? {
  backgroundImage: 'linear-gradient(177deg, #FFFFFF 0%, #EAF2FF 34%, #B7CAE6 68%, #8AA0C2 100%)',
  backgroundClip: 'text',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
} : null) as unknown as TextStyle | null;

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
