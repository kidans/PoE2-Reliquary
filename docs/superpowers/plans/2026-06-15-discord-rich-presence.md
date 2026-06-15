# Discord Rich Presence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional, lightweight Discord Rich Presence that displays the persisted character profile, current mapping/campaign/hideout activity, OCR-confirmed map mechanics, and an elapsed area timer.

**Architecture:** A focused Rust module converts existing `BuildSnapshot`, `CurrentAreaInfo`, and `MapRunContext` values into a testable Discord-neutral payload. A single blocking IPC worker owns the Discord connection and receives coalesced updates over a standard channel; Discord being absent or disconnected never blocks Tauri or the frontend. The existing local settings object persists an opt-in toggle and invokes a small Rust command to enable or disable the worker.

**Tech Stack:** Rust, Tauri 2, `discord-rich-presence`, TypeScript, Vitest/Cargo tests.

---

### Task 1: Presence payload rules

**Files:**
- Create: `src-tauri/src/discord_presence.rs`
- Test: `src-tauri/src/discord_presence.rs`

- [ ] Write failing Rust tests for mapping, campaign, hideout, OCR mechanic truncation, profile fallback, class image selection, and timestamp conversion.
- [ ] Run `cargo test discord_presence --lib` and confirm the tests fail because the formatter does not exist.
- [ ] Implement pure payload generation with Discord-safe text limits.
- [ ] Run `cargo test discord_presence --lib` and confirm the formatter tests pass.

### Task 2: Discord IPC worker

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/discord_presence.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] Add `discord-rich-presence = "1.1"`.
- [ ] Add a single worker thread with coalesced update, enable/disable, reconnect, clear, and shutdown commands.
- [ ] Resolve the Discord Application ID from `RELIQUARY_DISCORD_APP_ID` at runtime or build time; report an unavailable status instead of failing startup when missing.
- [ ] Start the worker during Tauri setup and notify it after profile, area, map-run, and OCR state changes.
- [ ] Add `set_discord_presence_enabled` and `get_discord_presence_status` Tauri commands.
- [ ] Run `cargo test --lib`.

### Task 3: Settings UI and persistence

**Files:**
- Modify: `src/main.ts`
- Modify: `src/styles.css` only if the existing settings control styles are insufficient.
- Test: existing TypeScript suite plus Rust formatter tests.

- [ ] Add `discordPresenceEnabled` to `AppSettings`, defaulting to `false`.
- [ ] Add an accessible checkbox to Settings explaining that Discord publicly shows the character and current area.
- [ ] Invoke the backend whenever settings are applied or the checkbox changes.
- [ ] Display backend availability/status without blocking the rest of Settings.
- [ ] Run `npm test` and `npm run build`.

### Task 4: Verification and packaging

**Files:**
- Modify: `README.md` only if user-facing configuration is required before release.

- [ ] Run `cargo fmt --check`.
- [ ] Run `cargo test --lib`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm run tauri build` and verify the executable is produced.
- [ ] Run `graphify update .`.

### Required Discord Application Setup

- Create one Discord Developer Application named `Reliquary`.
- Reliquary embeds the public Application ID `1516117492932804748`; `RELIQUARY_DISCORD_APP_ID` remains available as a runtime or build-time override.
- Presence uses the PoE.ninja class-image URL directly for the large image and a public Reliquary image URL for the optional small badge.
- No OAuth, Discord account token, or user login is required.
