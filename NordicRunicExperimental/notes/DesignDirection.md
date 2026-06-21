# Nordic Runic Identity Direction

## Goal

Explore a Nordic/runic Reliquary identity without losing the app's current strengths: low-glare overlay behavior, fast parsing, compact controls, strong warning hierarchy, and user customization.

## Working Hypothesis

The strongest direction is probably not pure Viking styling. It should be a darker "runic instrument panel" language:

- black iron surfaces
- etched rune cuts
- low-glare frost or blood accents
- angular frame notches
- restrained ceremonial motion

## Directions To Explore

### A. Black Iron Blood-Runes

Sharper, more dangerous, more occult. Best for a warning-heavy overlay identity. Risk: can become too aggressive or too red if not controlled.

### B. Frosted Stone Runes

Colder, quieter, and likely easiest on the eyes. Best for long mapping sessions. Risk: can drift too blue/cyan and fight user hue customization.

### C. Bone-Gold Relic Runes

Closest to current Reliquary DNA. Best if we want an evolutionary change rather than a full identity pivot. Risk: may remain too close to the current gold relic styling and not feel truly runic.

## Next Mockup Standard

The previous SVG board is kept only as a rejected rough reference. The next pass should show:

- actual line-mode treatment
- actual floating spine treatment
- actual scan card border treatment
- one item rarity banner example
- one data/trade card example
- no fake runic labels pretending to be identity

## Mockup Pass 01

Created `mockups/full-nordic-runic-scan.svg` as the first serious isolated direction.

This version intentionally goes farther into the Nordic/runic surface language:

- the app shell becomes an angular runestone/iron frame
- the floating spine becomes carved diamond runestones
- item/banner rarity colors remain intact
- user accent hue is represented as cyan/frost marks
- red remains danger-only
- text remains readable normal UI typography instead of decorative runic copy

This is still a mockup, not an implementation contract. The next decision is whether to keep this full runic direction, pull it back, or split it into separate variants.

## Mockup Pass 02: Forged Reliquary UI Kit

Created `mockups/runic-presentation.html` and `mockups/runic-presentation.css` after reviewing the newer reference boards.

This pass replaces the broad "runic overlay" idea with a more precise art direction:

- forged black iron and carved slate are the base materials
- worn bronze/gold edges define physical panel construction
- blue rune light is sparse and tied to the user accent hue
- icons should eventually be physical relic objects, not flat UI symbols
- the floating spine should become forged socket plates
- line mode should feel like a compact status instrument, not a rounded web card

This direction is stronger than Pass 01 because it gives Reliquary a production-grade component language rather than a surface theme. It also avoids the biggest risk of a "Nordic" pivot: generic Viking cosplay.

### Production Migration Notes

Safe to migrate first:

- token layer for iron, bronze, bone, danger, and user rune hue
- panel and button frame treatments
- tab/spine selected and hover states
- line-mode information hierarchy
- market/settings card material treatment

Hold until later:

- high-detail icon pack generation
- raster corner pieces and protruding ornaments
- GSAP timelines
- any scan-card ornament that competes with item/mod readability

## GSAP Consideration

GSAP is viable as a selective motion layer, but not as a blanket replacement for CSS motion. Use it only where timelines materially improve the feel:

- tab morphing
- spine socket activation
- line-mode severity transitions
- ceremonial scan/ready state

Avoid permanent loops, large blur animations, and scroll plugins unless a future feature genuinely needs them.

## Implementation Pass 01: Interactive Runic Prototype

Updated `mockups/runic-presentation.html`, `mockups/runic-presentation.css`, and added `mockups/runic-presentation.js`.

This pass turns the direction into an inspectable prototype instead of a static style board:

- seven real tabs: Scan, Trade, Atlas, Campaign, Temple, Profile, Settings
- selectable scan modifiers with live active-filter count
- settings controls for hue, transparency, and saturation
- candidate GPT Image 2 crops used for spine/status/market imagery
- line-mode, market board, atlas safety, temple grid, and profile samples represented in one shell

What this proves:

- The forged runic language can support Reliquary's actual information density.
- The user hue setting still works as the primary rune-light accent.
- The crop atlas can provide useful direction for icon silhouette, but several micro-crops are not production-clean yet.
- The strongest production path is still CSS-first material and layout, then carefully promoted image assets.

Risks found:

- Generated atlas micro-icons sometimes include labels or surrounding separators, so they need manual cleanup before production.
- The style can become too ornate quickly; scan text needs to stay almost plain.
- Some decorative material should remain prototype-only until the Tauri transparency/protrusion problem is solved.

## Production Frame Contract

- One ornamented frame belongs to one top-level visual region.
- Nested cards are plain forged material; they never receive the same raster frame again.
- Full-frame PNGs are not resized with `background-size: 100% 100%`.
- Approved frame artwork is rendered as a nine-sliced border so the center stays clear and corners retain their proportions.
- When a source cannot survive the target aspect ratio without distortion, implementation stops and requests a correctly sized source asset.
