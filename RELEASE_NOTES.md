# Release Notes

## v0.1.5 - Nordic Runic Interface And Motion

This release promotes Reliquary's experimental Nordic runic direction into the production overlay. It focuses on visual identity and interaction quality without moving parsing, OCR, hotkeys, compact mode, or marketplace work into the animation layer.

### Added

- Added a complete Nordic runic interface theme across Profile, Scan, Trade, Campaign, Atlas, Data, Temple, and Settings.
- Added eight distinct Elder Futhark-inspired bindrunes for the floating navigation spine, with normal labels and tooltips retained for clarity.
- Added deterministic SVG generation for the canonical rune set, modern letter aliases, navigation bindrunes, and a machine-readable manifest.
- Added GSAP-powered cursor aura, cancellable tab transitions, first-level card reveals, sliding toggle medallions, and restrained button traces.
- Added a dedicated etched-vector treatment for the 40px compact line mode using seamless rails and mirrored end caps.
- Added source-contract tests for rune assets, motion policy, compact sizing, and map-only truncation behavior.

### Improved

- Expanded the empty Scan state to use the full available panel instead of leaving a visually dead lower region.
- Kept campaign, hideout, and other non-map compact text centered and allowed it to use the full lane before truncating.
- Restricted constrained compact truncation to detailed endgame map data, where indicators and risk context share the line.
- Kept campaign checklist expansion visually attached to compact mode while restoring exactly 40px when collapsed.
- Preserved the last populated 30-minute Market Board when a flat comparison produces no movers.
- Updated Discord Rich Presence badge handling to use the published Reliquary asset.
- Preserved all Path of Exile item, currency, rarity, class, map, and Temple artwork outside the theme system.
- Added reduced-motion fallbacks for panel choreography, cursor aura, compact pulses, sweeps, chips, timers, and marquee text.

### Verification

Release gates for this build include:

- `npm test`
- `npm run build`
- `npm audit --omit=dev`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
- `npm run tauri:build`

### Known Beta Areas

- **Quick Price Check** remains beta while official-trade modifier coverage continues to improve.
- **Atlas OCR** remains beta and depends on game UI scale, overlay placement, and Windows OCR behavior.
- Linux/Wine support remains experimental.

## v0.1.4 - Atlas Context, Profile Import, And Release Hardening

Compared with `v0.1.3`, this release adds the Atlas map-context system, profile-aware warning foundations, expanded compact line mode, stronger release hardening, and a larger test suite.

### Added

- Added the **Profile** tab with PoE.ninja character URL import and PoB-code fallback parsing.
- Added profile persistence so imported build snapshots survive app restarts.
- Added Atlas map-context state that combines `Client.txt`, armed waystones, OCR evidence, map timers, deaths, and hazard summaries.
- Added Windows Tab-overlay OCR for area-only map enrichment when a waystone was not armed before entering a map.
- Added OCR evidence/debug capture plumbing for diagnosing bad reads.
- Added compact line-mode indicators for rarity, pack size, rare monster chance, experience gain, map mechanics, timer, and risk reasons.
- Added profile-aware line-mode severity glow for map risk.
- Added persisted Atlas run history and map-run summary data.
- Added exchange watchlist state and frontend tests.
- Added local Boska font assets so the UI no longer depends on Fontshare at runtime.
- Added stricter release gates and documented release-readiness checks.

### Improved

- Hardened official trade, PoE.ninja, PoE2DB, RePoE, and exchange fetches with bounded request timeouts.
- Hardened external URL opening with an allowlist for trusted Path of Exile data/source hosts.
- Added a Tauri CSP instead of shipping with CSP disabled.
- Tightened custom scan hotkey behavior so simulated copy scans do not reuse stale clipboard text.
- Kept Scan marketplace repeat checks cache-aware to reduce duplicate official trade calls.
- Updated README wording around beta features, local-first behavior, data sources, and current release scope.
- Updated internal design guidance to match the current OLED/accent-hue UI direction.

### Fixed

- Fixed the release hygiene blocker where `rust-version = "1.77"` conflicted with `std::sync::LazyLock`.
- Fixed clippy release gate failures across Rust modules.
- Fixed stale README encoding artifacts from earlier docs.
- Fixed local font/CSP conflict risk by vendoring Boska.
- Fixed display precision for small normalized currency values.

### Verification

Release gates run for this build:

- `npm test`
- `npm run build`
- `cargo test --manifest-path src-tauri\Cargo.toml`
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`
- `cargo clippy --manifest-path src-tauri\Cargo.toml --all-targets -- -D warnings`
- `npm audit --omit=dev`
- `cargo audit`
- `npm run tauri:build`

`cargo audit` completed with exit code 0. It reports allowed warnings from transitive upstream crates, primarily GTK/unic maintenance advisories inherited through the desktop dependency tree. No blocking vulnerability exit was reported for this build.

### Known Beta Areas

- **Quick Price Check** remains beta. Modifier tiering and official trade deep-link behavior are improving, but real-item coverage is still being expanded.
- **Atlas OCR** remains beta. It is useful for area-only map context, but OCR depends on game UI scale, overlay placement, and local Windows OCR behavior.
- Linux/Wine support is experimental.
