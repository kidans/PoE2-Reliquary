# Reliquary Runic Line Mode Design

## Status

Approved direction for the isolated Nordic Runic experiment on `codex/runic-identity-experiment`. This design completes the runic identity before the branch is merged and pushed.

## Goal

Reskin compact line mode as a forged Nordic runic instrument while preserving its exact `560x40px` collapsed footprint, immediate updates, existing map intelligence, and transparent-overlay behavior.

## Boundaries

This pass changes presentation only. It does not change:

- compact map calculations;
- OCR interpretation;
- map severity or warning rules;
- campaign timing and checklist state;
- window snapping;
- Path of Exile icons or other game-owned assets;
- the compact window's `560px` width or `40px` collapsed height.

Line mode remains CSS-driven. GSAP stays disabled in compact mode so map, OCR, and timer updates remain immediate.

## Frame Architecture

The line owns one visual frame. Do not place a framed card inside it.

- The center is a dark forged-metal surface whose opacity follows the existing panel-transparency setting.
- Thin aged-bronze rails run along the top and bottom edges.
- Rails use repeating or center-revealed vector geometry; they must not stretch a complete raster ornament.
- Small Reliquary bindrune end caps sit inside the left and right frame edges without changing layout width.
- The outer silhouette stays square. Do not restore rounded corners on the main line.
- User hue appears only as accent energy, focus, and severity-adjacent light. Structural rails remain neutral bronze and iron.

The existing severity color controls a restrained gradient from the right edge. It does not recolor the full frame.

## Map Detail Layout

The existing two-row map layout remains inside `40px`:

- Column 1: map name on the first row; OCR mod count and elapsed runtime on the second.
- Column 2: `R`, `PACK`, `RARE`, and `EXP` indicator pills on the first row.
- Columns 2-3: risk reason on the second row.
- Column 4: `OPEN` action spanning both rows.

Indicator pills keep rounded silhouettes and their established semantic colors:

- rarity: green;
- pack size: blue;
- rare monsters: gold;
- experience: violet.

The risk rail is an inset etched channel rather than a nested card. It truncates safely and preserves the full explanation in its existing title attribute.

## Waiting And Area-Only States

Hideout, town, campaign, and map-without-OCR states use one vertically centered content lane within the same frame.

- The title and context text stay left aligned.
- The Open button stays anchored to the right.
- No empty second row is reserved when no map details exist.
- A map awaiting OCR keeps the existing prompt and status language.
- Campaign timing remains live without animating each timer tick.

## Campaign Expansion

Collapsed campaign mode remains exactly `40px` tall. Clicking its title may expand the existing checklist below it.

- The checklist is attached visually to the bottom rail as one forged drop-panel.
- The expanded panel may change window height through the existing measured-height command.
- Checklist rows remain unframed; hover, completion, and reward chips provide hierarchy.
- Collapsing returns the window to `40px` without leftover transparent height.

## Motion And Feedback

Compact mode does not use GSAP.

Retain the existing bounded CSS feedback:

- one-time indicator arrival after new OCR data;
- one-time severity sweep when warning level changes;
- warning pulse only when the severity model requests it;
- campaign timer glow while the timer is active.

The right-side severity glow may breathe during active warnings. Bronze rails and bindrune end caps remain still so the line does not shimmer continuously while safe.

`prefers-reduced-motion: reduce` disables arrival, sweep, pulse, and marquee motion while keeping final colors and text visible.

## Assets

Create line-specific vector chrome under `NordicRunicExperimental/app/public/runic/line/`:

- `rail.svg`: a short tileable etched rail segment;
- `endcap-left.svg` and `endcap-right.svg`: mirrored Reliquary bindrune end caps.

These are original UI assets. They must not replace or modify any game-owned icon.

## Testing

Add or extend focused tests to verify:

- compact mode remains disabled in the GSAP motion policy;
- the Tauri compact width remains `560` and collapsed height remains `40`;
- map-detail, waiting, hideout, and campaign state classes remain available;
- reduced-motion CSS has compact-specific fallbacks;
- line assets exist and are referenced only by compact-mode selectors.

Run the full isolated TypeScript test suite, production build, Rust tests, security audit, Graphify update, and Tauri release build.

## Acceptance Criteria

- Collapsed line mode remains exactly `560x40px` in every non-expanded state.
- Map name, OCR/runtime, four indicators, risk reason, and Open action remain legible and aligned.
- Hideout, campaign, waiting, and OCR-prompt states do not reserve an empty second row.
- The frame reads as iron and etched bronze rather than a plain tinted rectangle.
- The main line has square corners; indicator and Open controls may remain rounded.
- Severity appears as a right-edge gradient and risk-channel emphasis, not a full-frame recolor.
- Expanded campaign checklist returns cleanly to `40px` when collapsed.
- No Path of Exile asset is recolored, replaced, filtered, or masked.
- No GSAP timeline runs in compact mode.
