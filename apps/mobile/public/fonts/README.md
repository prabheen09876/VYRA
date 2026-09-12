# Self-hosted web fonts

Two variable faces, subset to latin + latin-ext, served from `public/` so the web build has real
typography instead of whatever the host OS happens to ship.

| File | Family | Axis | Source |
| --- | --- | --- | --- |
| `oswald-latin.woff2`, `oswald-latin-ext.woff2` | Oswald | `wght` 200–700 | Google Fonts, Oswald v57 |
| `inter-latin.woff2`, `inter-latin-ext.woff2` | Inter | `wght` 100–900 | Google Fonts, Inter v20 |

## Why these are committed rather than linked

Linking `fonts.googleapis.com` would put a third-party request on the critical path of every first
paint and leak the viewer's IP to it. These are static, versioned, ~77 KB for the latin pair that
English copy actually pulls — `unicode-range` keeps the `-ext` files from downloading at all until a
character outside the basic latin block appears (a player name, most likely).

## Why variable

`fonts.display` is set at `wght 600`, not the `900` the old system stack was pinned to — the whole
point of the change was that the headline read as too heavy. A static face would lock that in; the
variable axis means the weight is a number in `theme.ts` that can be retuned without refetching a
font. Same for Inter across body copy, buttons and labels.

## Licence

Both are licensed under the SIL Open Font License, Version 1.1, which permits bundling and
redistribution — including in a commercial product — provided the fonts are not sold on their own
and the notice below travels with them.

- Oswald — Copyright (c) The Oswald Project Authors. Reserved Font Name "Oswald".
- Inter — Copyright (c) The Inter Project Authors. Reserved Font Name "Inter".

Full licence text: <https://openfontlicense.org/open-font-license-official-text/>

## Refreshing

The `@font-face` blocks live in `apps/mobile/public/index.html`, and the `unicode-range` values there
must match the subset each file was cut with — copy both the URL and its range from the Google Fonts
CSS response rather than editing one in isolation, or characters silently fall back to a system face.
