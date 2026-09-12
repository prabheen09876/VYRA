// Native measurement of the display face. iOS and Android pin a known condensed face
// ('Avenir Next Condensed' / 'sans-serif-condensed'), so the calibrated fallback in the caller is
// accurate there and there is nothing to probe — unlike the web, where the stack starts on a system
// fallback and swaps to a downloaded Oswald. See displayMetrics.web.ts for that path.
export function displayEms(_text: string, fallback: number): number {
  return fallback;
}

/** Always `true` here: native has no webfont to wait on (expo-font is not a dependency, so there
 *  is nothing to register), and the face it uses is present from the first frame. Exists so callers
 *  can be written once against the web contract. */
export function useDisplayFontReady(): boolean {
  return true;
}
