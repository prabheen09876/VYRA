import { Platform, type TextStyle } from 'react-native';

// VYRA Halo: a neutral, faintly cool near-black ground with silver-white type and a single mint /
// teal accent family. This replaces the orchid-and-magenta "Nocturne" palette, which put a
// saturated hue on almost every surface; here the hues are rationed — the ground, the panels, the
// borders and the body copy are all neutral greys, and colour appears only where something is
// active, earned, or selected. That is the whole design rule: if a value carries a hue, it is
// saying "look here", and if everything says that, nothing does.
//
// The content colors in @vyra/core are NOT a separate system — the stage ramp, rarity colors and
// cosmetic swatches are cut from these same hues, so `colors.brand` and STAGES.elite are
// deliberately the same value. Keep them in step: a chrome-only or catalog-only edit reintroduces
// the split.
//
// Every value below that carries text or draws a control boundary has been checked against
// WCAG 2.1 (4.5:1 for body, 3:1 for large text and UI boundaries) over its real backdrop, with
// the translucent tokens flattened over `background` first. Ratios are quoted where they are
// close enough to matter.
export const colors = {
  // Four steps of one neutral ramp, each a hair cooler than a true grey so they sit under the
  // teal accent without looking warm beside it. There is no violet cast left anywhere in here.
  background: '#05070A', backgroundElevated: '#0A0D12', surface: '#10141A', surfaceRaised: '#171C24',
  // Washes and rules are neutral light, NOT a tint of the accent. A tinted rule is what made the
  // old palette read as "everything is purple" — at 5-11% alpha the hue does no work but it
  // colours every panel edge on the screen.
  glass: 'rgba(170,192,220,0.05)', glassStrong: 'rgba(180,200,226,0.10)',
  line: 'rgba(180,200,228,0.11)', lineStrong: 'rgba(190,208,232,0.24)',
  // Boundary of a control whose fill is nearly the page colour (button, input, unchecked box) —
  // the only thing separating it from the page, so 1.4.11 wants 3:1 and `lineStrong` only manages
  // 1.62. Kept distinct from lineStrong so raising it does not also brighten every decorative
  // panel edge. Flattened: 3.95:1 over `background`, 3.34:1 over the `surfaceRaised` button fill.
  lineControl: 'rgba(200,214,236,0.50)',
  // `faint` does real text work (nav labels, input placeholders, locked tags) despite the name,
  // so it sits at 5.55:1 on the ground rather than at a decorative ratio.
  text: '#F2F5F8', muted: '#A8B0BC', faint: '#7E8794',
  // The one accent family. `brand` is the mark, the active nav and the focus ring (10.83:1);
  // `accent` is the lighter mint one step up the same hue, for XP, progress and "you did this"
  // (13.63:1). Everything else here is a *state*, not a theme colour: `spark` marks the
  // selected/equipped thing, `violet`/`ember` are character badge accents, and the last two are
  // the outcome rails. `success` is held at hue 142 rather than anywhere nearer the accent,
  // because a teal brand and a teal-green "correct" state are indistinguishable mid-workout.
  brand: '#2DD4BF', accent: '#5EEAD4', violet: '#8B5CF6', spark: '#3D7BFF', ember: '#FF6B3D',
  success: '#4ADE80', danger: '#FF5A5F', ink: '#05070A',
};

// Semantic roles. Prefer these over reaching for a hue directly — it keeps "what this means"
// separate from "what color that currently is", which is what made the last repalette expensive.
export const role = {
  emphasis: colors.brand,      // the primary brand mark, active nav, the thing you look at first
  action: colors.accent,       // XP, progress, calls to action, "you did this"
  info: colors.spark,          // the selected/equipped state, neutral highlights
  locked: colors.faint,        // unavailable — desaturated by intent, never a warm "warning" hue
  positive: colors.success,
  negative: colors.danger,
};

// Atmosphere stops shared by SpaceBackdrop (full-bleed starfield) and the hero orb, so the
// page and the character stage read as one continuous sky rather than two separate washes.
//
// Deliberately much weaker than the palette it replaces: the old horizon was a #2E0F52 violet under
// a 0.46-alpha orchid bloom, which lit the bottom third of every screen. Here the sky stays
// essentially black and only lifts to a deep blue-teal at the very bottom, with the bloom at a
// third of its old strength. The character's own flare is the bright thing on the hero — the sky
// has to stay out of its way.
export const atmosphere = {
  void: '#05070A', deep: '#050A10', mid: '#071520', horizon: '#0C2430',
  haze: 'rgba(45,212,191,0.16)', hazeSoft: 'rgba(61,123,255,0.09)',
};

// Web self-hosts both faces (public/fonts, wired up in public/index.html); native keeps the system
// stacks because expo-font is not a dependency, so there is no way to register a bundled face on
// iOS/Android. The previous web stack named only faces that ship with macOS, so every Windows and
// Linux viewer silently landed on Haettenschweiler — a single-weight 1990s face with no real
// kerning, which is what made the headline read as crude rather than merely large.
export const fonts = {
  display: Platform.select({
    ios: 'Avenir Next Condensed',
    android: 'sans-serif-condensed',
    default: "'Oswald', 'Avenir Next Condensed', 'Roboto Condensed', 'Arial Narrow', Helvetica, Arial, sans-serif",
  }),
  body: Platform.select({
    ios: 'Avenir Next',
    android: 'sans-serif',
    default: "'Inter', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  }),
};

// Weights for the display face, so the hero and the wordmark cannot drift apart. Oswald is variable
// across 200–700, so these are real interpolated instances rather than a browser-synthesised smear —
// but note 700 is the CEILING: asking for 800/900 gets faux-bold, which is exactly the thick,
// smeared look this change set out to remove. Keep every `fontFamily: fonts.display` rule at or
// below `displayWeight.heavy`.
//
// `heavy` is 600, not 900. The face is condensed enough to carry a headline without also being
// black; at 900 on the old stack the counters closed up and the two lines read as one dark slab.
export const displayWeight = { heavy: '600', strong: '500', regular: '400' } as const;

// Brushed chrome-to-lilac fill for the hero display type. Web-only (clipping a gradient to
// glyphs has no RN equivalent); everywhere else the solid `colors.text` underneath shows
// through, so this is purely additive.
//
// It must be applied to ONE Text containing the whole headline. Splitting the headline across
// two <Text> elements gives each its own background box, restarting the ramp on line two and
// visibly breaking the metallic.
export const displayGradient = (Platform.OS === 'web' ? {
  backgroundImage: 'linear-gradient(177deg, #FFFFFF 0%, #F2F5F8 30%, #C2CBD6 66%, #94A0AE 100%)',
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

/**
 * `color` at `alpha`, for the many places that want a tinted wash of an accent. Replaces the
 * `color + '55'` concat pattern, which silently produced garbage for any input that was not a
 * 6-digit hex (a named color, an 8-digit hex, or an rgba() string).
 */
export const alpha = (color: string, value: number) => {
  const hex = color.replace('#', '');
  if (hex.length !== 6 || !/^[0-9a-f]{6}$/i.test(hex)) return color;
  const n = parseInt(hex, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${value})`;
};

export const stageLabel = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
