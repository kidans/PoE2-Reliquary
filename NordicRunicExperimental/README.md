# Nordic Runic Experimental

This folder is the sandbox for Reliquary's possible Nordic/runic identity shift. Work here is intentionally experimental and should not be treated as release direction until we approve it together.

## Current Branch

`codex/runic-identity-experiment`

## Current Isolated App

The active experiment is now an isolated copy of the real Reliquary Tauri app with the Nordic/runic theme layered on top:

```powershell
cd C:\Projects\Kalandra\NordicRunicExperimental\app
npm run tauri:dev
```

Use [launch-runic-app-dev.ps1](./launch-runic-app-dev.ps1) to start it from this folder.

The production app at `C:\Projects\Kalandra\src` and `C:\Projects\Kalandra\src-tauri` is not modified by this experiment. The isolated app carries its own copied `src`, `public`, `src-tauri`, `scripts`, and `supabase` folders.

## Current Experimental EXE

After running `npm run tauri -- build --no-bundle` in the app folder, the experimental executable is:

```text
C:\Projects\Kalandra\NordicRunicExperimental\app\src-tauri\target\release\reliquary-runic-experiment.exe
```

Use [launch-runic-app-release.ps1](./launch-runic-app-release.ps1) to launch that build.

## Reference Mockups

The older dependency-free presentation is still available as a visual reference only:

```text
C:\Projects\Kalandra\NordicRunicExperimental\mockups\runic-presentation.html
```

It is not the active implementation target.

## Folder Map

- `app/`: isolated copy of the real Reliquary Vite + Tauri application for the runic direction.
- `assets/`: reusable image/vector/source assets that may become production assets.
- `mockups/`: visual directions, screenshots, and proposed UI treatments.
- `references/`: rough references, rejected drafts, and inspiration boards.
- `notes/`: planning notes, design rationale, and implementation risks.

## Identity Guardrails

- Keep Reliquary compact and readable during Path of Exile 2 gameplay.
- Keep OLED black and user-controlled hue customization.
- Keep red reserved for warnings, errors, destructive actions, and critical risk.
- Preserve item rarity banner colors exactly.
- Never theme over game-established assets: currency icons, item icons, class/profile portraits, temple room icons, PoE.ninja/PoE2DB item art, or any faithful local mirror of those assets.
- Only the UI/UX shell is experimental: panels, borders, tabs, typography, motion, surfaces, separators, buttons, and decorative chrome.
- Keep the outer app frame neutral. User hue/saturation can color accents and active states, but not the structural border that sits against the game world.
- Avoid Viking cosplay, horned helmets, generic fantasy knots, and unreadable runic text.
- Use runic details as structure and ornament, not as functional UI copy.

## Frame Rules

1. Never stretch a complete generated asset to fit a different aspect ratio. Use a proportion-preserving border slice only when the source supports it; otherwise stop and request an asset at the rendered dimensions.
2. Never apply an ornamented frame to a card nested inside another ornamented region. A major region owns one frame; its child cards use quiet material, spacing, and simple hairline dividers.
3. Generated frame art must render as a border, not as a background image inside the card. Transparent center pixels may not cover content, and corners must retain their original proportions.
4. Path of Exile game assets remain outside the theme system, including currency, item, class, room, map, and rarity artwork.

## Elder Futhark Navigation

The floating spine uses eight UI-only bindrunes: `PR`, `SK`, `TR`, `KM`, `AT`, `DT`, `TM`, and `ST`. Their labels and tooltips remain plain language so the rune treatment adds identity without making navigation cryptic.

The deterministic asset generator emits the canonical 24-rune Elder Futhark set, documented A-Z phonetic aliases, the eight tab bindrunes, and a machine-readable manifest:

```powershell
cd C:\Projects\Kalandra\NordicRunicExperimental\app
npm run runes:generate
```

Generated files live in `app/public/runic/runes/`. They are monochrome SVG masks used only for Reliquary chrome; they never replace or recolor Path of Exile item, currency, class, map, temple, or rarity art.

## Motion Runtime

The isolated app uses GSAP core as a selective presentation layer. It owns the cards-and-tabs cursor aura, cancellable primary-tab choreography, and bounded first-level content reveals.

GSAP does not participate in compact line mode, hotkeys, clipboard scanning, OCR capture, marketplace requests, or Path of Exile asset rendering. Ambient glows, warnings, and hot-path feedback remain CSS-driven, and `prefers-reduced-motion` disables the GSAP presentation layer.
