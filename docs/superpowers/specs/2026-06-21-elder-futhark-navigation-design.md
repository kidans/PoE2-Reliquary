# Elder Futhark Navigation Design

## Scope

Create a reusable Elder Futhark-inspired SVG library for Reliquary's isolated Nordic runic application and replace the live floating-spine tab glyphs with phonetic bindrunes. This work changes Reliquary UI chrome only. It must not alter Path of Exile item, currency, class, room, map, rarity, or other established game artwork.

## Historical Honesty

Elder Futhark contains 24 runes rather than a literal modern 26-letter alphabet. Reliquary will therefore ship:

- a canonical 24-rune geometry set;
- 26 modern A-Z alias SVGs for practical UI use;
- explicit metadata documenting aliases and approximations;
- bindrunes only as modern navigation marks, not claims of historical meaning.

The A-Z aliases use phonetic approximations. C and Q reuse Kenaz, while X combines Kenaz and Sowilo. Letters without an exact Elder Futhark equivalent remain documented approximations rather than being presented as authoritative historical spellings.

References:

- Unicode Runic chart: <https://www.unicode.org/charts/PDF/U16A0.pdf>
- Valhyr custom bindrune implementation: <https://valhyr.com/blogs/fun/custom-bindrune>

## Navigation Mapping

All eight tabs use two-rune phonetic marks so the spine has one consistent visual language:

| Tab | Bindrune |
| --- | --- |
| Profile | PR |
| Scan | SK |
| Trade | TR |
| Campaign | KM |
| Atlas | AT |
| Data | DT |
| Temple | TM |
| Settings | ST |

The pairs use the first useful phonetic sounds rather than symbolic rune meanings. Campaign uses K because its initial C is pronounced /k/.

## Asset Architecture

- Add a deterministic generator under `NordicRunicExperimental/tools/`.
- Generate canonical SVGs under `NordicRunicExperimental/app/public/runic/runes/elder-futhark/`.
- Generate A-Z aliases under `NordicRunicExperimental/app/public/runic/runes/letters/`.
- Generate tab bindrunes under `NordicRunicExperimental/app/public/runic/runes/tabs/`.
- Emit a JSON manifest containing canonical rune names, phonetic values, aliases, and tab pairs.
- Use a consistent `24 24` viewBox, angular strokes, square caps, and miter joins.
- Keep every SVG monochrome so the application can color it through CSS masking.

## Live Application Integration

- Replace the inline decorative path table in `renderTabGlyph` with a tab-to-SVG asset map.
- Render SVGs as CSS masks so existing user hue, hover glow, selected glow, reduced-motion behavior, and contrast states continue to work.
- Preserve the existing tab labels, titles, ARIA labels, button dimensions, and click targets.
- Do not add circular backplates or raster ornament behind the runes.
- Do not modify the compact line-mode iconography in this pass.

## Bindrune Construction

- Compose runes from reusable line segments rather than overlapping text glyphs or depending on a font.
- Share a central stave when both component runes support it.
- Preserve enough negative space for the mark to remain readable at the current 21-pixel rendered size.
- Prefer recognizable component geometry over perfect symmetry.
- Reject a bindrune if either component becomes unrecognizable at 21 pixels.

## Validation

- Test that all 24 canonical rune files, all 26 letter aliases, and all 8 tab bindrunes exist.
- Test that every tab maps to a unique asset.
- Test that generated SVGs use the expected viewBox and contain no raster data, scripts, embedded fonts, or fixed display colors.
- Run `npm run test`, `npm run build`, and the isolated Tauri release build.
- Visually inspect all eight live spine states at rest, hover, selected, and reduced motion.

## Non-Goals

- No mockup or presentation-board changes.
- No semantic or magical interpretation of rune meanings.
- No replacement of game-established icons.
- No broad typography, card, border, or layout redesign in this pass.
