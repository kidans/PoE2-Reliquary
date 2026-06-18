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

## GSAP Consideration

GSAP is viable as a selective motion layer, but not as a blanket replacement for CSS motion. Use it only where timelines materially improve the feel:

- tab morphing
- spine socket activation
- line-mode severity transitions
- ceremonial scan/ready state

Avoid permanent loops, large blur animations, and scroll plugins unless a future feature genuinely needs them.
