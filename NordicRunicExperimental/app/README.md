# Reliquary Runic Experiment App

This is the isolated runnable desktop app for the Nordic/runic identity exploration. It is intentionally separate from the production Reliquary app at the repository root.

## Run

```powershell
cd C:\Projects\Kalandra\NordicRunicExperimental\app
npm run tauri:dev
```

## Build

```powershell
cd C:\Projects\Kalandra\NordicRunicExperimental\app
npm run build
npm run tauri:build
```

The built executable lands at:

```text
C:\Projects\Kalandra\NordicRunicExperimental\app\src-tauri\target\release\reliquary-runic-experiment.exe
```

## Scope

- The frontend is a standalone Vite app in `src/`.
- The desktop shell is a standalone Tauri 2 app in `src-tauri/`.
- Production source files under `C:\Projects\Kalandra\src` and `C:\Projects\Kalandra\src-tauri` are not imported or modified.
- Current data is intentionally mocked so we can refine identity, motion, and layout before integrating live Reliquary services.
