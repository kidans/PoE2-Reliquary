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
