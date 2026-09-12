# Self-hosted web fonts (capture studio)

Byte-for-byte copies of `apps/mobile/public/fonts/`. Keep them identical — refresh both together.

| File | Family | Axis |
| --- | --- | --- |
| `oswald-latin.woff2`, `oswald-latin-ext.woff2` | Oswald | `wght` 200–700 |
| `inter-latin.woff2`, `inter-latin-ext.woff2` | Inter | `wght` 100–900 |

## Why a second copy rather than a shared one

The capture studio is a separate Vite build (`base: '/capture/'`) that ships to the Cloudflare
Worker at `/capture/`, while the Expo app serves its own `/fonts` from a different origin. A
cross-origin `@font-face` between them would need CORS on the Expo host and would still miss
whenever the studio is opened standalone. 186 KB of static, cacheable, immutable bytes is the
cheaper answer — and `unicode-range` means only `inter-latin.woff2` (48 KB) is fetched for English
copy embedded, since `body.embedded` hides every element that uses Oswald.

Vite copies `public/` to the build root, so `url('/fonts/…')` in `src/styles.css` and the preload in
`index.html` are rewritten to `/capture/fonts/…` at build time by `base`. Do not hardcode
`/capture/` in either place — it would break `npm run dev:capture`, which mounts the same base on
the dev server.

## Licence

Both faces are licensed under the SIL Open Font License, Version 1.1.

- Oswald — Copyright (c) The Oswald Project Authors. Reserved Font Name "Oswald".
- Inter — Copyright (c) The Inter Project Authors. Reserved Font Name "Inter".

Full licence text: <https://openfontlicense.org/open-font-license-official-text/>

## Refreshing

`apps/mobile/public/fonts/README.md` is the source of truth for provenance and subsetting. The
`unicode-range` values in `src/styles.css` must match the subset each file was cut with, and must
stay equal to the ones in `apps/mobile/public/index.html`.
