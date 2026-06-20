# Reliquary Runic Scan And Controls Design

## Status

Approved direction for the isolated Nordic Runic experiment on `codex/runic-identity-experiment`. This design extends `2026-06-21-runic-gsap-motion-design.md` and does not modify the production Reliquary application.

## Goal

Correct the cramped initial Scan experience and establish one reusable runic interaction language for switches, sliders, and major text buttons. The result should feel forged and responsive without adding idle animation, delaying input, or replacing Path of Exile artwork.

## Scope

This pass includes:

- the empty initial Scan panel;
- the Discord Rich Presence switch in Settings;
- the Accent Hue, Panel Transparency, and Saturation sliders;
- hover feedback on major text buttons;
- reduced-motion and keyboard behavior for those controls.

This pass excludes:

- compact line mode;
- listing-preview windows;
- primary spine tabs and their bindrune assets;
- tiny icon controls, table-row controls, chips, destructive buttons, and Path of Exile assets.

## Initial Scan State

The empty Scan state becomes one full-height runic surface rather than a short message card above unused space.

- The waiting surface fills the usable Scan panel in both normal startup and post-clear states.
- The instruction block sits in the upper-middle of that surface so it remains close to the header and the future item card's reading path.
- The content has a protected left inset matching the floating spine's maximum intrusion. The active Scan tab must never cover the heading or shortcut copy.
- The full surface owns one border treatment. Do not place a second framed card inside it.
- The empty surface may retain a restrained ambient border breath and shimmer, but it must not run a GSAP loop.

The Scan panel uses a specialized entrance:

- no horizontal translation;
- a short opacity reveal with a small vertical settle;
- no scale that makes the border appear detached from the window;
- the latest tab selection still supersedes any active transition.

This exception prevents the floating spine and incoming Scan content from visually colliding while preserving the signature transition on other tabs.

## Runic Medallion Control

Use one scalable vector medallion as the shared control thumb. It must be constructed from local SVG/CSS assets rather than cropped from the reference sheet.

### Toggle

The existing native Discord checkbox remains the semantic input. A styled control surface presents:

- a dark forged-metal track;
- `OFF` and `ON` labels inside the track;
- one circular runic medallion that slides between endpoints;
- accent glow only around the active medallion;
- a visible keyboard focus treatment around the full control.

On state change, GSAP performs one `160-200ms` timeline:

1. slide the medallion to the selected endpoint;
2. rotate it approximately `120deg` in the direction of travel;
3. crossfade the active label emphasis;
4. emit one restrained accent pulse, then settle.

State changes remain immediate in application logic. Animation only presents the already-applied state and cannot block persistence or Discord updates.

### Sliders

Accent Hue, Panel Transparency, and Saturation reuse the same medallion silhouette at a smaller size.

- Keep the native range input as the interactive and accessible control.
- Use a local SVG thumb treatment that remains crisp across scale factors.
- The track fill continues to reflect the current accent and value.
- Pointer and keyboard input update continuously as they do now.
- The thumb may receive a short press/focus rotation, but its position follows the native range control rather than a competing GSAP layout calculation.

This avoids custom-slider synchronization bugs while keeping the switch and sliders visually related.

## Button Trace

Major text buttons receive one thin engraved squiggle beneath their label.

- The trace is a reusable local SVG mask or CSS path, not a stretched raster image.
- It is initially collapsed and low-opacity.
- On pointer hover or keyboard focus, delegated GSAP motion expands the trace outward and brightens it over `140-180ms`.
- On leave or blur, it retracts faster than it entered.
- The trace uses the user accent hue. Warning and destructive buttons retain red semantics and do not receive the normal accent trace.
- The animation must not change button dimensions or move its label.

Eligible controls are major text actions such as Reset, Refresh, Import, Change, Save, and primary Atlas actions. Excluded controls are tiny row actions, icon-only chrome, period selectors, chips, radio-style filters, spine tabs, and marketplace listing rows.

## Motion Architecture

Extend the existing motion adapter rather than constructing timelines inside rendering code.

The adapter owns:

- Scan-specific entrance behavior;
- toggle-state timelines;
- delegated button trace hover/focus timelines;
- reduced-motion final-state application;
- cancellation and cleanup before panel replacement.

The Settings renderer supplies stable data attributes and control structure. It does not call GSAP directly.

## Performance And Accessibility

- No permanent GSAP timeline or ticker runs while Reliquary is idle.
- Motion changes only transforms, opacity, and narrowly scoped CSS custom properties.
- No width, height, padding, margin, or scroll animation is allowed.
- `prefers-reduced-motion: reduce` applies final positions and visible states immediately.
- The native checkbox and range inputs remain keyboard-operable and screen-reader accessible.
- Focus visibility does not depend on glow alone.
- Compact line mode and listing preview remain untouched.

## Testing

Add focused tests for:

- Scan selecting the non-horizontal entrance variant;
- rapid Scan navigation cancelling stale timelines;
- toggle timelines ending at the correct checked and unchecked positions;
- reduced motion applying toggle and Scan final states without a timeline;
- button trace eligibility excluding destructive, icon-only, and row-level controls;
- required native input attributes remaining present after the visual wrapper is added.

Run the existing isolated application test suite, production build, and Tauri release build after implementation.

## Acceptance Criteria

- The initial Scan surface visually fills the available window instead of appearing as a small card.
- The active Scan spine tab never obscures waiting-state text during or after navigation.
- Scan enters without horizontal collision or clipping.
- Discord Rich Presence uses one sliding, rotating runic medallion with clear `OFF` and `ON` states.
- All three Settings sliders use the same medallion visual language without losing native behavior.
- Major text buttons gain a restrained expanding runic trace without changing layout.
- No new motion appears in line mode or preview windows.
- Reduced-motion users receive the same information and final visual states without animation.
