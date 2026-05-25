# Reliquary Refinement Queue

This file tracks the issues found during the scan-mode and newly-added-feature review. Work these in order unless a later item becomes a direct blocker for testing.

## Logging Policy

During refinement, keep diagnostics small, scrubbed, and useful. Raw official API bodies, raw clipboard item text, seller data, and full request payloads should not be logged by default.

For release, Reliquary should not pretend the debug log is crash reporting. If crash reporting becomes useful later, build it deliberately as an opt-in feature with scrubbed payloads, size limits, and a clear user-facing toggle. For now, the target is local-only, bounded diagnostics.

## Data Upstream Policy

RePoE PoE2 JSON feeds are the live upstream for game-data JSONs. Reliquary should fetch them on the user's machine during background refresh, validate them, and save last-good raw copies locally. Our repository/release should only act as a safety net, not the primary updater.

Current wiring:
- `world_areas.min.json`: cache-first load, RePoE fallback fetch, Data tab health.
- `mods.min.json`: live RePoE fetch with local last-good fallback.
- `base_items.min.json`: live RePoE fetch with local last-good fallback.
- Larger source-truth snapshot: still cached separately as `poe2db-source-truth-v1.json`.

Next likely expansion:
- Add RePoE `mods_by_base.min.json`, `item_classes.min.json`, and related JSONs when Phase 5/6/7 parser work needs them.

## P1 - Release Blockers

### 1. Bundle or fetch `world_areas.json` for clean installs

Status: implemented in current branch with cache-first, RePoE fallback fetch, and Data tab health reporting. Keep this item open until tested from a machine/profile with no existing `%LOCALAPPDATA%\Reliquary\world_areas.json`.

Current behavior depends on `%LOCALAPPDATA%\Reliquary\world_areas.json`. That works on the development machine but can silently fail for new users. If the file is missing, map/campaign act detection loses area metadata.

Acceptance:
- Clean install has usable world-area metadata without manual cache seeding. Implemented via RePoE fallback fetch.
- If the bundled/fetched data is missing or corrupt, the Data tab reports that clearly. Implemented.
- Map-aware line mode and campaign act detection still work after deleting the local cache.

References:
- `src-tauri/src/lib.rs` `init_world_areas`
- `src-tauri/src/lib.rs` `world_areas_cache_path`

### 2. Replace raw debug logging with scrubbed bounded diagnostics

Status: implemented in current branch. Keep this item open through testing so we can verify the new diagnostics are useful enough in real scans.

Current logging writes full official trade responses and full copied item text. The local log can grow quickly and includes data we do not need for normal refinement.

Acceptance:
- No raw clipboard item text in logs by default. Done.
- No full official API response bodies in logs by default. Done.
- Log entries include compact metadata only: endpoint, status, request/cache hashes, result counts, rate-limit state, duration, and sanitized error summary. Done.
- Log file is size-limited or rotated. Done.
- A temporary verbose mode can exist for development, but must be opt-in.

References:
- `src-tauri/src/price_check.rs` `parse_json_response`
- `src-tauri/src/price_check.rs` `item_debug_payload`

### 3. Cache currency metadata and exchange rates

Status: implemented in current branch with in-memory fresh caches and stale in-session exchange-rate fallback.

Every uncached price check currently fetches currency metadata and exchange rates. That is avoidable overhead and contributes to sluggish scans/rate-limit pressure.

Acceptance:
- Currency metadata is cached with a long TTL or loaded from local assets first. Implemented with a six-hour in-memory cache.
- Exchange rates are cached by `league + selected_currency` with a short TTL. Implemented with a sixty-second in-memory cache.
- Failed exchange-rate refresh keeps the previous good cache when possible. Implemented for the current session.
- UI can show stale-but-usable rates instead of failing the whole price check. Implemented through the rate source label.

References:
- `src-tauri/src/price_check.rs` `fetch_currency_meta`
- `src-tauri/src/price_check.rs` `fetch_exchange_rates`

### 4. Fix exchange-item routing for charms and other non-stackable item types

Status: implemented for charms in current branch. Keep open for broader regression testing against tablets, omens, essences, runes, soul cores, uncut gems, and fragments.

Charms are currently classified as exchange items. They have real item text, modifiers, charges, and should be scan-price-checkable like other modded items.

Acceptance:
- Charms route to Scan/Evaluate, not the Trade exchange tab. Implemented.
- Stackable currency-like items still route to exchange mode.
- Frontend and backend share the same classification rules or are tested against the same cases.
- Add regression tests for charms, tablets, omens, essences, runes, soul cores, uncut gems, and fragments.

References:
- `src/main.ts` `isExchangeClipboardItem`
- `src-tauri/src/exchange.rs` `is_exchange_item`

### 5. Separate true tier confidence from template-only matches

Status: implemented in current branch for the TypeScript scan/evaluate UI. Template-only tier hints now render as uncertain labels such as `T3?` and validated roll-band matches stay as normal tier labels.

The current source-truth cache has many tier rows with empty `roll_bands`. The UI can show a tier label even when the numeric roll was not validated.

Acceptance:
- Tier UI distinguishes validated numeric tiers from template-only tier guesses. Implemented.
- Template-only matches are not used as hard official trade filters. Already enforced by `min === null` scoring classification.
- Marketplace filtering never claims exact tier confidence when `roll_bands` are empty. Implemented visually as uncertain tier labels.
- Data tab reports source-truth health: total tiers, empty roll-band count, unknown affix count.

References:
- `src/evaluate.ts` `resolveTierMatch`
- `src/evaluate.ts` `tierMatchesValues`
- `%LOCALAPPDATA%\Reliquary\source-truth\poe2db-source-truth-v1.json`

### 6. Improve prefix/suffix/source-kind completeness

Status: implemented in current branch for source-truth generation, scan metadata honesty, and Data tab quality visibility. Keep open through real scan testing so we can confirm RePoE/PoE2DB live data stays within the new quality thresholds.

The current cache has a high number of `affix: unknown`, mostly from RePoE/global, implicit, corrupted, and special sources. This blocks the goal of always showing reliable `P1/P2/P3`, `S1/S2/S3`, or special markers.

Acceptance:
- Normal explicit mods stay near complete for prefix/suffix. Implemented with quality counts and threshold warnings.
- Unknown affix entries are expected only for sources where prefix/suffix does not apply. Implemented by normalizing non-affix source kinds to `null`.
- UI does not show prefix/suffix placeholders for unknown data. Implemented by rendering no `?` affix placeholder.
- Source-truth generation emits a quality summary and fails loudly when important categories regress. Implemented through `status.quality` and adapter warnings.

References:
- `src-tauri/src/source_truth.rs`
- `src/evaluate.ts`

## P2 - Correctness and Responsiveness

### 7. Make listing tier extraction robust

Status: implemented in current branch with category/template matching and ambiguity-safe omission. Keep open through live marketplace scans because official payload shape can vary across item families.

Fetched listing tier info is currently mapped by array index against `extended.mods`. This assumes API order matches local `all_searchable_mods()` order and can mislabel prefix/suffix/tier.

Acceptance:
- Listing tier info is matched by stat/hash identity where possible, not flat index. Implemented by matching extended mod category and stat template.
- If matching is uncertain, omit tier display instead of showing wrong metadata. Implemented for ambiguous same-template matches.
- Add tests with explicit, implicit, rune, desecrated, and grouped-stat listing payloads. Implemented for explicit/implicit and ambiguous grouped-stat cases; rune/desecrated live payload variants still need fixture expansion.

References:
- `src-tauri/src/price_check.rs` `listing_from_fetch_result`
- `src-tauri/src/price_check.rs` `resolve_mod_tier_from_index`

### 8. Avoid hiding official results when local scoring is incomplete

Status: implemented in current branch. Soft/local scoring misses stay visible, sort lower, and now expose a small partial-match note on listing rows; hard filter failures still disappear.

`filteredListings()` currently drops rows with score `0`. That is okay when local parsing is complete, but dangerous while some tier/source data remains incomplete.

Acceptance:
- Rows that came back from official trade can still be visible with a clear "not locally matched" state. Implemented with `partial x/y` row disclosure and tooltip details.
- Selected hard filters still exclude true hard failures. Implemented.
- Soft filters affect sorting and highlighting, not total disappearance, unless the user explicitly asks for strict filtering. Implemented.

References:
- `src/evaluate.ts` `filteredListings`
- `src/evaluate.ts` `rankListings`

### 9. Remove unsafe `innerHTML` status rendering

Status: implemented for compact meta status in current branch.

Compact meta text falls back to raw status and is rendered with `innerHTML`. Future API/worker errors could inject markup.

Acceptance:
- Use `textContent` for compact status or escape every branch before rendering. Implemented for compact meta.
- Only deliberate markup uses `innerHTML`.
- Add a regression test or helper boundary for escaped status strings.

References:
- `src/main.ts` `render`
- `src/main.ts` `compactMetaText`

### 10. Reduce global hotkey lock contention

Status: implemented in current branch. The global input callback now reads from a small synchronous hotkey snapshot instead of locking full async app state. The existing 500ms clipboard wait window remains unchanged.

The global input callback uses `state.blocking_lock()`. It is not the same async deadlock that was already fixed, but it can still stall the global hook if another task holds the mutex.

Acceptance:
- Hotkey state is read from an atomic/snapshot structure or a short-lived non-blocking path. Implemented with `HOTKEY_CONFIG`.
- Network/price-check state cannot delay keypress handling. Implemented.
- Ctrl+C scan remains reliable in compact mode and full mode. Clipboard wait behavior preserved.

References:
- `src-tauri/src/lib.rs` `handle_global_input_event`

### 11. Align shortcut UI and backend behavior

Status: implemented in current branch for A-Z and 0-9 shortcut keys with frontend/backend normalization.

Rust supports letter and digit shortcut keys, but the settings UI only accepts A-Z. The backend also relies on frontend localStorage to push keybinds at startup.

Acceptance:
- UI and backend support the same key set. Implemented for A-Z and 0-9.
- Persisted shortcuts are loaded reliably before the global listener handles user input.
- Invalid shortcut settings recover to safe defaults. Implemented.

References:
- `src/main.ts` settings keydown handler
- `src-tauri/src/lib.rs` `set_keybinds`

## P3 - Release Hygiene

### 12. Clean branch artifacts before release

The working tree currently has package-lock churn and an untracked session note. The release executable is stale relative to the current branch.

Acceptance:
- Decide whether `package-lock.json` changes are intentional.
- Either commit, move, or ignore `SESSION_NOTES.txt`.
- Rebuild the release executable after refinement changes.
- Version is bumped from `0.1.0` when we cut the release build.

References:
- `package-lock.json`
- `SESSION_NOTES.txt`
- `src-tauri/target/release/reliquary.exe`

### 13. Add a single-instance guard

Reliquary currently does not have a startup-level single-instance lock. Launching the executable twice can create duplicate overlays, duplicate global listeners, and duplicate trade/data refresh work.

Acceptance:
- Starting Reliquary while another GUI instance is already running should focus/show the existing app instead of launching a second overlay.
- CLI modes such as `source-truth`, `leagues`, `tiers`, and `debug-log` should still run without being blocked by the GUI lock.
- The guard should be cross-platform friendly for the Linux port. Prefer Tauri's single-instance plugin if it behaves cleanly with our tray, preview window, and ornament window; otherwise use a small native lock/mutex wrapper behind platform-specific code.
- Add a smoke test/checklist item before release to verify no duplicate global hotkey listeners are created.

References:
- `src-tauri/src/main.rs`
- `src-tauri/src/lib.rs` `run`
- `src-tauri/Cargo.toml`

## Current Data Snapshot From Review

Source-truth cache:
- Schema: `1`
- Pages: `550`
- Total tiers: `39,808`
- Empty roll bands: `4,753` (`11.9%`)
- Unknown affix entries: `17,460` (`43.9%`)
- Failed pages: none found during review

Campaign guide:
- Acts: `5`
- Zones: `92`
- Steps: `326`
- Structural missing zones: none found during review

World areas cache on development machine:
- Areas: `382`
- Maps: `129`
- Boss metadata entries: `103`
- Act metadata present for all cached entries

## Suggested Work Order

1. Clear local debug log and replace raw logging with scrubbed bounded diagnostics.
2. Bundle or auto-fetch `world_areas.json`.
3. Add currency metadata and exchange-rate caching.
4. Fix item classification routing, starting with charms.
5. Add source-truth confidence states for tier data.
6. Improve prefix/suffix/source-kind completeness.
7. Fix listing tier extraction.
8. Relax local-only marketplace filtering so official results do not disappear.
9. Harden compact/status rendering.
10. Reduce hotkey lock contention.
11. Align shortcut UI/backend behavior.
12. Clean release artifacts and rebuild.
13. Add a single-instance guard.
