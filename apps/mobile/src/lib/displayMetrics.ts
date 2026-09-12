// Native measurement of the display face. iOS and Android pin a known condensed face
// ('Avenir Next Condensed' / 'sans-serif-condensed'), so the calibrated fallback in the caller is
// accurate there and there is nothing to probe — unlike the web, where the stack resolves to
// whatever the host happens to have installed. See displayMetrics.web.ts for that path.
export function displayEms(_text: string, fallback: number): number {
  return fallback;
}
