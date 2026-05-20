# Reliquary Project Plan 2.2

This is the merged senior plan after Codex reviewed the original opencode research and opencode responded. The final direction keeps opencode's urgency and useful competitive research, but keeps Codex's architecture boundary as the non-negotiable rule.

## Executive Verdict

Reliquary should be a lightweight PoE2 evaluation overlay: fast local item judgment first, official trade proof second.

The original research was useful because it identified the real gap: item intelligence. Reliquary already has a strong native shell, exchange tab, league discovery, rate-limit visibility, and a distinct visual identity. What still feels weaker than PoE Overlay II and Exiled Exchange 2 is the evaluator brain: mod tiers, prefix/suffix grouping, DPS/defense calculations, pseudo stats, smarter filter defaults, tier-band marketplace search, and better item-type handling.

The original implementation plan was not safe because it put too much evaluation ownership in Rust. We just debugged the failure mode: backend-confirmed filters overwrote TypeScript click intent, causing delayed or disappearing modifier selections. That cannot happen again.

## Final Architecture Contract

```text
Rust/Tauri = native shell and trusted IO
TypeScript = scan/evaluate brain and immediate UI state
```

Rust owns:

- PoE2 foreground/window detection.
- Global hotkeys gated to PoE2 only.
- Clipboard reads.
- Client.txt tailing.
- Tauri window management.
- Official trade API calls.
- poe.ninja fetches and 30-minute cache.
- PoE2DB data fetching and local cache files.
- Rate-limit tracking.
- Stable cache key generation.
- Stale response identity tags.
- Existing macro execution.
- File IO for local data such as banned mods and cached source-truth data.

TypeScript owns:

- Modifier selection state.
- Selected, pending, and confirmed UI states.
- Search profile engine.
- Auto-preselect logic.
- Mod tier display rules.
- Tier-band marketplace filter rules.
- DPS, APS, and defense display calculations.
- Pseudo stat grouping.
- Local listing filtering.
- Roll quality display logic.
- Price estimate display.
- Stash note formatting.
- Bulk pricing render decisions.
- Display-currency conversion.
- All immediate click feedback.

The contract:

```text
TypeScript state updates before Rust responses return.
Rust enriches or confirms state, but never overwrites user intent.
If the user clicked something, that click survives any backend response.
```

## Decisions Resolved

### Existing Macros Stay

The existing `/invite`, `/tradewith`, and `/kick` macros stay. They already exist in `src-tauri/src/macros.rs`, are isolated from scan evaluation, and should not be removed. New macro automation is still not launch-critical.

### Bulk Pricing Inline Is Accepted

Bulk pricing inline for exchange-mode scans is accepted if it reuses existing `exchange.rs` state and cache. It must not add a second poe.ninja request path or duplicate exchange logic.

### Stash Note Copy Moves Earlier

Stash note copy is small and useful enough to include before launch. It still needs verification because it touches user-facing pricing output.

### Auto-Preselect Is Cuttable

Auto-preselect is valuable, but if launch time gets tight, it moves after May 29. Manual multi-select and stable filtering are more important than clever defaults.

### One-Hotkey Capture Is Post-Launch Unless We Finish Early

Ctrl+C scanning already works. A PoE2-only capture hotkey is useful, but not worth destabilizing scan behavior before launch.

### Roll Quality And Open Affixes Wait For Trustworthy Data

Roll quality and open affix count should not be guessed. They come after the PoE2DB adapter is reliable enough to provide affix/range data.

### Tier-Band Search Is Launch-Critical

Marketplace searches should not use exact copied roll values for wide-range mods. PoE2DB is the source of truth for mod tier bands, such as "Adds (26-39) to (44-66) Physical Damage" for a T1 physical damage prefix. Reliquary should resolve the copied roll into its PoE2DB tier, then search by that tier band or a profile-selected neighboring tier band.

Exact Match means "same mod identity inside the same trusted tier band," not "same exact numeric roll." Roll quality can still be displayed later, but tier-aware search filtering is required for accurate pricing.

### Webhook Notifications Are Post-Launch Quick Wins

Telegram/Discord notifications are not the same risk class as deep macro automation, but they are not core item evaluation. They stay post-launch.

## Launch Cutline

Launch-critical for the May 29 league:

- Reliable modifier multi-select.
- Stable trade result filtering.
- Correct league wiring for official trade and poe.ninja.
- Exchange-mode items avoid normal gear search.
- PoE2DB/source-truth adapter foundation.
- Basic mod intelligence v1 for common gear categories.
- Tier-band marketplace filters for wide-range mods.
- Stash note copy.
- No UI-blocking API behavior.
- Visible rate-limit and cooldown behavior.
- Existing macros preserved.

Launch-cuttable:

- Auto-preselect profiles.
- Roll quality.
- Open affix count.
- One-hotkey capture.
- Telegram/Discord notifications.
- Map regex generator.
- Live search.
- Stash tracking.
- Replay/campaign/platform features.

## Timeboxed Phase Plan

| # | Phase | Timebox | Owner Split | Launch Status |
|---|---|---:|---|---|
| P1 | Stabilize Scan Interactions | 1 day | Codex leads; opencode validates edge cases | Required |
| P2 | TypeScript Evaluate Module | 1 day | Codex extracts helpers; opencode adds tests/fixtures | Required |
| P3 | PoE2DB Data Adapter Foundation | 2 days | Codex extends fetch/cache; opencode defines normalized schema | Required |
| P4 | Mod Intelligence v1 + Tier-Band Search | 3 days | Codex handles DPS/defense/item presentation; opencode handles prefix/suffix, tiers, and tier-band filter rules where data exists | Required |
| P4b | Stash Note Copy | 0.5 day inside P4 | Codex | Required |
| P5 | Bulk Pricing Inline | 0.5 day inside P4/P5 | Either agent; render-only over existing exchange state | Required if no backend churn |
| P6 | Auto-Preselect Profiles | 2 days | Both agents | Cuttable |
| P7 | Launch Hardening | 1 day | Both agents | Required |
| P8 | May 29 League Buffer | 1 day | Both agents | Required |

Post-launch:

| # | Phase | Timebox | Notes |
|---|---|---:|---|
| PL1 | Roll Quality + Open Affixes | 2 days | Requires reliable range/affix data |
| PL2 | One-Hotkey Capture | 1 day | Useful, but Ctrl+C works now |
| PL3 | Telegram/Discord Notifications | 1 day | Small webhook feature, not evaluation-critical |
| PL4 | Map Regex Generator | 1 day | Useful niche QoL |
| PL5 | Live Search Exploration | Research first | Must respect official trade limits |

## Phase Acceptance Criteria

### P1: Stabilize Scan Interactions

- Modifier clicks highlight immediately.
- Multiple modifiers can be selected.
- Clearing filters is immediate.
- Stale trade responses cannot erase selected modifiers.
- Repeated identical item/filter checks use cooldown/cache.
- Result list can locally narrow while a backend refresh is pending.

### P2: TypeScript Evaluate Module

- Evaluation helpers move out of `src/main.ts`.
- Filter signatures are test-covered.
- Listing matching is test-covered.
- Profile default selection is test-covered.
- `main.ts` becomes orchestration/render wiring, not the evaluation brain.

### P3: PoE2DB Data Adapter Foundation

- Existing `source_truth.rs` league/family work is preserved.
- Adapter writes versioned cached data.
- Internal schema remains stable even if PoE2DB markup changes.
- Adapter captures mod identity, tier name, required level, min/max roll band, tags, and prefix/suffix classification where PoE2DB exposes them.
- Missing source data degrades to "unknown" instead of inventing values.
- Data freshness is visible in the Data tab or debug state.

### P4: Mod Intelligence v1 + Tier-Band Search

- Common weapons display DPS-related values cleanly.
- Armour displays defense values cleanly.
- Belts separate charm slots from normal modifiers.
- Flasks and charms separate properties from real modifiers.
- Currency-like items route to exchange mode.
- Prefix/suffix/tier labels show only when data is trustworthy.
- Wide-range mods resolve copied values to PoE2DB tier bands before building official trade filters.
- Exact Match searches the same tier band, not the exact copied numeric roll.
- Broad searches can include neighboring or lower acceptable tier bands based on profile rules.
- If tier data is missing, Reliquary falls back to a safe broad numeric band and clearly marks the filter as unverified.

### P4b: Stash Note Copy

- Copy button appears near estimated value.
- Output respects selected display currency.
- Output uses a sane estimate, not a random first listing.
- Toast/status confirms the copied value.

### P5: Bulk Pricing Inline

- Exchange-mode item scans show poe.ninja pricing without forcing a mental context switch.
- It reuses existing exchange state and cache.
- It does not add new API calls beyond the existing exchange flow.

### P6: Auto-Preselect Profiles

- Quick Price chooses price-impacting mods.
- Exact Match chooses all searchable specs.
- Broad relaxes numeric values.
- Crafting Base prioritizes base, item level, sockets, quality, and defenses.
- Manual clicks switch to Custom and are never overridden.

### P7: Launch Hardening

- `npm run build` passes.
- `cargo test` passes.
- `npm run tauri:build` passes.
- In-game test covers rare weapon, rare armour, rare accessory, unique, currency, essence, waystone/tablet, flask/charm, and gem.
- No one-letter shortcuts interfere with search/input.
- Overlay remains PoE2-gated.

## Competitive Research Summary

Exiled Exchange 2 remains the strongest reference for focused price checking. PoE Overlay II remains the strongest reference for evaluator behavior and item presentation. Exile-UI remains parked until the evaluator and market flow are stable.

We can copy behavior, flow, and interaction patterns from other tools, but we do not copy proprietary code or depend on private backends.

## Implementation Rules

- TypeScript state should update before network responses return.
- Rust responses should enrich or confirm state, not control click intent.
- Every official trade query needs a stable cache key.
- Identical item plus identical filters should hit cache during cooldown.
- Wide-range modifier filters should use PoE2DB tier bands, not exact copied roll values.
- Exact copied values are allowed only for fixed-value or near-fixed-value specs.
- Data-source adapters should degrade gracefully when markup changes.
- Any new parser rule needs at least one fixture-style test.
- Any new item category needs a screenshot/manual test case.
- Do not block the UI on API calls.
- Do not silently hide rate-limit failures.
- Keep existing working features unless they directly conflict with scan stability.

## Working Agreement Between Agents

- Codex is senior integrator and final arbiter for architecture conflicts.
- opencode can propose and implement parallel work, but each parallel slice needs a disjoint file/module ownership boundary.
- No agent should rewrite another agent's active files without checking current diffs first.
- Shared contracts are documented before implementation.
- Every phase ends with build/test verification.
- If a phase starts destabilizing the scan pipeline, stop and stabilize before adding features.

## Immediate Next Work

### Checkpoint: Phase 1 Locked Before Phase 2

Logged on May 21, 2026 before starting P2.

- Reliquary rename, unofficial disclaimer, app icon, hidden CLI launch, and packaged executable naming are in place.
- PoE2-gated overlay visibility and shortcut handling remain active.
- Scan interaction state now lives in TypeScript first: modifier clicks are immediate, multi-select survives backend responses, and selected/pending/applied visual states are separated.
- Marketplace checks have cache/cooldown and rate-limit visibility so repeated identical checks do not spam official trade calls.
- League discovery and selector wiring are present for future-proof league switching.
- Trade/Data UI has the OLED black/red-accent theme, local currency icons, local item-frame assets, and PoE-style item-card fonts.
- Build verification completed with `npm run build`, `cargo check`, and `npm run tauri:build`.

Phase 2 begins from this checkpoint with the goal of extracting the TypeScript evaluate brain out of `src/main.ts` and adding focused tests.

1. Validate the recent instant-click filter fix in-game.
2. Split scan evaluation helpers out of `src/main.ts` into a TypeScript module.
3. Add TypeScript tests for filter signatures, listing matching, and profile defaults.
4. Add selected/pending/confirmed modifier visual states.
5. Start the PoE2DB adapter foundation after the scan interaction layer is stable.
6. Add tier-band matching as the first required PoE2DB-backed marketplace behavior.

## Success Criteria

Reliquary is on-track when:

- Clicking a modifier highlights instantly.
- Multiple modifier filters can be selected without waiting for trade API.
- Stale trade responses cannot undo user selection.
- Rechecking the same exact item and filter set uses cache/cooldown.
- League selection controls every data source.
- Wide-roll mods are priced by PoE2DB tier bands instead of exact copied values.
- Exchange-mode items do not waste official trade API calls.
- Item banners keep rarity colors consistently:
  - Common: white.
  - Magic: light blue.
  - Rare: gold.
  - Unique: reddish brown.
- The app remains lightweight and attached to PoE2 only.
