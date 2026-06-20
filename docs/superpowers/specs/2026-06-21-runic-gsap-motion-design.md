# Reliquary Runic GSAP Motion Design

## Status

Approved direction for the isolated Nordic Runic experiment on `codex/runic-identity-experiment`. This document supersedes only the earlier decision in `NordicRunicExperimental/app/MotionOverhaulPlan.md` to avoid an animation runtime. Its performance, accessibility, and responsiveness constraints remain mandatory.

## Goal

Make Reliquary feel like a compact runic instrument responding to the player, without delaying hotkeys, scans, OCR, marketplace updates, or line-mode warnings.

## Motion Character

- Fast, precise, and ceremonial rather than playful.
- Angular reveals and restrained rune-light sweeps rather than bounce or elastic movement.
- User hue controls normal rune energy; red remains exclusive to warnings, errors, destructive actions, and critical risk.
- Motion confirms hierarchy and state changes. It does not decorate every render.

## Hybrid Architecture

CSS continues to own:

- hover, focus, and pressed states;
- ambient rune glow and danger pulses;
- simple one-property transitions;
- reduced-motion fallbacks;
- persistent line-mode severity styling.

GSAP owns:

- multi-stage tab transitions;
- staggered content arrival after meaningful state changes;
- interrupted or superseded animation sequences;
- element-to-element motion where a timeline communicates causality;
- Temple placement and destabilization sequencing after the existing state update is complete.

The first integration uses GSAP core only. Do not add ScrollTrigger, MorphSVG, or a perpetual ticker. Add another plugin only when a reviewed feature cannot be expressed cleanly with core timelines.

## Signature Navigation Motion

When a primary spine tab changes:

1. The outgoing panel settles and fades over `90-120ms`.
2. The selected bindrune brightens without changing its hitbox.
3. A narrow accent sweep travels from the spine edge across the incoming panel frame.
4. The incoming panel reveals with `opacity`, `translateX`, and at most `scale(0.995)` over `160-220ms`.
5. Important first-level sections arrive in a restrained `20-28ms` stagger capped at six elements.

Rapid tab changes supersede the active timeline immediately. The latest requested tab always wins, and interaction is never blocked while motion completes.

## Feature Motion

### Scan

- Clipboard acceptance gives the item banner one short edge-light pass.
- Parsed modifiers arrive as one grouped reveal, not one animation per modifier.
- Marketplace rows animate only when the fetched result identity changes.

### Trade And Market Board

- Refreshed rows fade and settle without re-running on timers that did not change row data.
- Price movement flashes once in green or red, then returns to the normal theme.
- Future reordering may use FLIP-style transforms, but the first GSAP pass does not introduce sorting animation.

### Atlas And OCR

- Confirmed OCR evidence reveals as one compact sequence.
- Risk severity transitions can sweep the relevant edge once.
- Line mode stays CSS-driven so its hot path remains dependency-free and immediate.

### Campaign

- Act selection updates the active row and zone list with a short directional settle.
- The campaign timer itself never animates every tick.
- Completed or current zones may receive a one-time confirmation trace when their state changes.

### Temple

- Room placement uses a short lift-and-seat transform.
- Connection traces reveal after placement, never before validation.
- Destabilization uses a single timeline driven by the existing deterministic result. Animation never determines simulation state.

### Profile And Settings

- Profile import reveals the identity block, fingerprint, and stats in three restrained stages.
- Settings inputs retain CSS feedback. Reset and successful persistence may use one confirmation pulse.

## Runtime Boundary

Create one focused motion adapter that owns GSAP imports, active timelines, reduced-motion detection, and cleanup. Rendering code calls named motion functions; it does not construct timelines inline.

Every motion function must:

- accept a scoped root or explicit elements;
- kill or overwrite its prior timeline before starting;
- tolerate missing elements;
- return immediately under reduced motion after applying the final state;
- animate only `transform`, `opacity`, and narrowly scoped `clip-path` effects;
- avoid animating `width`, `height`, `top`, `left`, padding, margins, or scroll position.

## Performance Budget

- Keep animation work off the clipboard, OCR, market-fetch, and hotkey listeners.
- Do not run permanent GSAP timelines while Reliquary is idle.
- Cap normal feedback at `260ms`; ceremonial Temple sequences may be longer because they represent an explicit simulation action.
- Restrict large-area filters and blur. Existing CSS glow remains preferable to animated blur.
- Kill timelines before replacing panel DOM so detached elements cannot retain animation references.

## Accessibility

`prefers-reduced-motion: reduce` applies the final visual state without a timeline. No information may be conveyed only by motion, and warnings retain their text and color treatment.

## Rollout

1. Add the motion adapter and test its reduced-motion and cancellation contracts.
2. Replace only the primary tab transition with the signature navigation timeline.
3. Add Scan, Trade, Atlas, and Campaign state feedback one feature at a time.
4. Integrate Temple placement and destabilization last.
5. Profile the Tauri WebView after each slice and remove motion that does not improve comprehension.

## Acceptance Criteria

- Tab switching feels faster and more connected than the current CSS-only reveal.
- Rapid navigation never flashes stale panels.
- Hotkeys, clipboard scans, OCR, and market refreshes remain responsive.
- No idle GSAP timeline remains active.
- Reduced-motion mode is effectively instant.
- Compact line mode retains its existing behavior and performance.
