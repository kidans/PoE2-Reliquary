# Nordic Runic Experimental

This folder is the sandbox for Reliquary's possible Nordic/runic identity shift. Work here is intentionally experimental and should not be treated as release direction until we approve it together.

## Current Branch

`codex/runic-identity-experiment`

## Current Isolated App

The active experiment is now a runnable isolated Tauri app:

```powershell
cd C:\Projects\Kalandra\NordicRunicExperimental\app
npm run tauri:dev
```

Use [launch-runic-app-dev.ps1](./launch-runic-app-dev.ps1) to start it from this folder.

The production app at `C:\Projects\Kalandra\src` and `C:\Projects\Kalandra\src-tauri` is not imported by this experiment.

## Current Experimental EXE

After running `npm run tauri:build` in the app folder, the experimental executable is:

```text
C:\Projects\Kalandra\NordicRunicExperimental\app\src-tauri\target\release\reliquary-runic-experiment.exe
```

Use [launch-runic-app-release.ps1](./launch-runic-app-release.ps1) to launch that build.

## Reference Mockups

The older dependency-free presentation is still available as a visual reference:

```text
C:\Projects\Kalandra\NordicRunicExperimental\mockups\runic-presentation.html
```

It is no longer the active implementation target.

## Folder Map

- `app/`: runnable isolated Vite + Tauri application for the runic direction.
- `assets/`: reusable image/vector/source assets that may become production assets.
- `mockups/`: visual directions, screenshots, and proposed UI treatments.
- `references/`: rough references, rejected drafts, and inspiration boards.
- `notes/`: planning notes, design rationale, and implementation risks.

## Identity Guardrails

- Keep Reliquary compact and readable during Path of Exile 2 gameplay.
- Keep OLED black and user-controlled hue customization.
- Keep red reserved for warnings, errors, destructive actions, and critical risk.
- Preserve item rarity banner colors exactly.
- Avoid Viking cosplay, horned helmets, generic fantasy knots, and unreadable runic text.
- Use runic details as structure and ornament, not as functional UI copy.
