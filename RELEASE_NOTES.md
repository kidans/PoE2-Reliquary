# Release Notes

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
