# Reliquary Motion Overhaul Plan

## Goal

Make Reliquary feel less static without making it slower, louder, or less usable during Path of Exile 2 gameplay. Motion should clarify state changes, acknowledge user input, and add a ceremonial instrument-panel feel while preserving the overlay's compact, low-glare identity.

## Design Direction

Reliquary motion should feel like a compact occult instrument waking up. It should not feel like a web dashboard, mobile app, or generic SaaS UI.

- Keep motion fast, restrained, and purposeful.
- Use accent-hue motion for navigation and normal UI feedback.
- Keep red reserved for warnings, danger, destructive actions, errors, and build-breaking states.
- Never delay hotkeys, scan updates, OCR reads, trade rows, or line-mode safety output.
- Avoid looping animation unless it communicates active danger or ongoing work.

## Performance Guardrails

- Prefer CSS transitions and keyframes.
- Animate `opacity`, `transform`, and small `clip-path` masks only.
- Do not animate `width`, `height`, `top`, `left`, `padding`, or `margin`.
- Avoid heavy blur/filter on large panels.
- Do not add Framer Motion, GSAP, or another animation runtime unless a later feature truly needs it.
- Respect `prefers-reduced-motion`.
- Keep tab transition duration around `160-220ms`.

## Phase 1: Motion Tokens

Create shared motion variables in `src/styles.css`:

- `--motion-instant`
- `--motion-fast`
- `--motion-panel`
- `--motion-shell`
- `--ease-reliquary`
- `--ease-strike`

Add a global reduced-motion override so motion can collapse to near-instant without breaking layout.

## Phase 2: Tab Morphing

Add a lightweight panel transition when switching primary tabs.

Expected behavior:

- The shell, header, and floating spine stay anchored.
- Only the main panel surface transitions.
- Forward navigation enters from a slight right/down offset.
- Backward navigation enters from a slight left/down offset.
- Same-tab re-renders do not animate.
- The first render does not animate.
- Compact/line mode does not animate panel content.

Visual treatment:

- Short fade and settle: `opacity` + `translate` + tiny `scale`.
- A subtle accent sweep across the panel border/content plane.
- No bounce, elastic motion, or long cinematic delay.

## Phase 3: Floating Spine Polish

Polish the existing tab spine after Phase 2 is verified in-game.

- Active tab should feel locked into place.
- Hover/focus can add a small glow and optical lift.
- Click should give a short pressed response.
- Labels should stay secondary and never crowd the game view.
- Use custom CSS/SVG glyphs instead of rendered icon assets so the spine stays lightweight, hue-aware, and easy to recolor.
- Treat each tab as a small relic socket: subtle connector line, inner socket glow, active jewel/notch, and no permanent looping animation.
- Keep rendered art/icons out of the spine for now; revisit only if the app later gains an icon atlas that is already loaded elsewhere.

## Phase 4: Stateful Feedback

Add micro-feedback to high-value states.

- Scan waiting: subtle breathing border.
- OCR read: thin progress shimmer.
- Trade refresh: rows fade in without layout jump.
- Market board update: changed numbers pulse once.
- Discord/profile import: compact success flash.
- Errors/rate limits: one red pulse, then settle.

## Phase 5: Line Mode Motion

Line mode should remain brutally fast and readable.

- Smoothly shift the right-side risk glow when severity changes.
- Slide chips in by a few pixels on new OCR/map data.
- Pulse once for danger/breaking warnings.
- Avoid permanent motion unless severity is high.

## Verification Checklist

- Tab switch feels faster, not slower.
- Hotkeys stay responsive.
- OCR and trade refresh do not visually stall.
- Reduced-motion mode disables most motion.
- No new scroll clipping in Scan, Trade, Atlas, Temple, Settings, or Data.
- No permanent animation runs in idle line mode.
