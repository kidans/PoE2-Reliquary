# Reliquary Runic Experiment App

This folder is an isolated copy of the actual Reliquary application with the Nordic/runic theme layered on top.

It is not a presentation mockup. It contains the real Reliquary frontend modules, public assets, Supabase shared market logic, scripts, and Tauri/Rust backend copied from the repository root. The visual experiment enters through `src/runic-theme.css` and the isolated app identity/port changes.

## Run

```powershell
cd C:\Projects\Kalandra\NordicRunicExperimental\app
npm run tauri:dev
```

## Build The Test EXE

Use the no-bundle build while this is experimental. It produces the desktop executable without spending extra time on installers.

```powershell
cd C:\Projects\Kalandra\NordicRunicExperimental\app
npm run tauri -- build --no-bundle
```

The executable lands at:

```text
C:\Projects\Kalandra\NordicRunicExperimental\app\src-tauri\target\release\reliquary-runic-experiment.exe
```

You can also launch the latest built executable from the parent folder:

```powershell
C:\Projects\Kalandra\NordicRunicExperimental\launch-runic-app-release.ps1
```

## What Is Isolated

- Tauri identifier: `com.reliquary.runic-experiment`
- Dev server port: `5177`
- Package name: `reliquary-runic-experiment`
- Visual settings storage key: `reliquary.runic.ui.settings`
- Build output stays under `NordicRunicExperimental\app\src-tauri\target`

## What Is Still Real Reliquary

- Scan/evaluate logic
- Trade tab and market board logic
- Atlas/OCR/map tracking logic
- Campaign guide
- Profile import path
- Temple planner
- Settings/hotkey UI
- Rust/Tauri backend modules

The goal is to judge the runic identity on the real application instead of approving a pretty fake.

## Game Asset Safeguard

The runic experiment must not replace, recolor, filter, or mask game-established assets. Currency icons, item icons, class/profile portraits, temple room icons, PoE.ninja/PoE2DB art, and faithful local mirrors stay visually original. The active theme layer in `src/runic-theme.css` protects those selectors and should only style Reliquary UI chrome: panels, tabs, borders, buttons, typography, motion, and decorative surfaces.
