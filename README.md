# Kalandra

Extremely lightweight tool for POE 2 built on Rust and Tauri.

## Phase 1: Lumen-Scan Overlay Shell

The current scaffold contains a Tauri v2 desktop shell, a minimal Vite/TypeScript frontend, and Rust backend workers for the first Lumen-Scan implementation phase.

## Prerequisites

- **Node.js/npm** install and run the Vite frontend dependencies declared in `package.json`.
- **Rust + Cargo** build and run the Tauri backend under `src-tauri`.

Cargo is Rust's package manager and build tool. It is the Rust equivalent of npm: it downloads Rust crates from crates.io, compiles the backend, runs checks/tests, and produces the native executable that Tauri wraps around the webview frontend.

## Useful Commands

```bash
npm install
npm run dev
npm run build
npm run tauri:dev
cargo check --manifest-path src-tauri/Cargo.toml
```

`POE2_CLIENT_LOG` can be set to point the backend at a specific Path of Exile 2 `Client.txt` file while testing the log streamer.
