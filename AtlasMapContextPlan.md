# Reliquary Atlas / Map Context WIP Plan

This plan is the working handoff for the next Reliquary development cycle. It exists to keep Codex, opencode, and any other agent aligned while we continue in the private WIP repository (`kidans/Reliquary`) and only publish to `kidans/PoE2-Reliquary` when a release is intentionally cut.

## Branch Hygiene Rules

### Source Of Truth

- `release/main` / `public-release-main` is the current known-good baseline.
- New WIP branches should be created from the current release-safe baseline unless the user explicitly says otherwise.
- Push WIP work to `origin` (`kidans/Reliquary`) only.
- Push to `release` (`kidans/PoE2-Reliquary`) only for release commits and published hotfixes.

### Branches To Avoid

- Do not merge `origin/main` wholesale into the current release baseline. It is divergent and may remove features/assets that now matter.
- Do not resurrect `project/map-run-context-plan`; it was a stale handoff branch and has been deleted.
- If another agent creates a branch, compare it against `public-release-main` before accepting it as a newer truth.

### Required Pre-Work

Before starting any implementation slice:

1. Run `git fetch --all --prune`.
2. Confirm current branch and upstream with `git status --short --branch`.
3. Confirm whether the target branch is WIP (`origin`) or release (`release`).
4. Run `graphify query "<work area>"` before code exploration when `graphify-out/graph.json` exists.

### Required Post-Work

After modifying code:

1. Run relevant tests.
2. Run `graphify update .`.
3. Commit atomic changes.
4. Push to `origin` unless the user explicitly asks for a public release.

## Product Direction

Reliquary is moving toward a lightweight, local-first PoE2 endgame companion:

- Reliable map/run context.
- Build-aware waystone safety.
- Atlas progression support.
- Economy awareness through cached PoE.ninja data.
- Scan/evaluate remains supported, but it is not the only product pillar.

The strongest positioning is:

> Reliquary helps players understand, prepare, and survive their next PoE2 map without OAuth, tracking, or heavyweight overlays.

## Current Baseline

The current baseline already includes:

- PoE2-gated global hotkeys.
- Clipboard item scanning.
- Official trade price checking.
- PoE.ninja exchange tabs, including unique categories.
- League selector wiring.
- Client.txt area detection.
- Campaign timer and map run logging.
- Restored campaign/map death tracking.
- Incursion Temple planner.
- Initial Atlas tab shell.
- `pending_waystone` and `active_map_run` backend state.
- Basic build-aware hazard profiles.

Important files:

- `src-tauri/src/lib.rs`: native app state, hotkeys, Client.txt tailing, event emission.
- `src-tauri/src/map_context.rs`: waystone snapshots and map-run binding.
- `src-tauri/src/hazards.rs`: default hazard profiles and hazard matching.
- `src/main.ts`: HUD, Atlas UI, campaign/map run UI, frontend state.
- `src/styles.css`: Atlas, HUD, scan, trade, and theme styling.
- `src/evaluate.ts`: scan/evaluate helpers.
- `src-tauri/src/exchange.rs`: PoE.ninja exchange and unique category feeds.
- `src-tauri/src/source_truth.rs`: PoE2DB/RePoE source-truth adapter.

## Non-Negotiable Architecture Contract

```text
Rust/Tauri = native shell and trusted IO
TypeScript = immediate UI state and evaluation presentation
```

Rust owns:

- PoE2 foreground/window detection.
- Global hotkeys gated to PoE2 only.
- Clipboard reads.
- Client.txt tailing.
- Tauri window management.
- Official trade API calls.
- PoE.ninja fetches and caches.
- PoE2DB/RePoE source-truth fetches and caches.
- Rate-limit tracking.
- Stable backend events.
- File IO.

TypeScript owns:

- Immediate user interaction state.
- Atlas panel presentation.
- HUD display decisions.
- Modifier click state.
- Local filtering and user-visible selection state.
- UI confidence labels and warnings.
- Display currency rendering.

Contract:

```text
Backend events may enrich state, but must not erase explicit user intent.
```

## Primary WIP Goal

Make the map loop feel complete and trustworthy:

```text
Copy waystone -> waystone armed -> enter map -> active run bound -> hazards shown -> run/deaths tracked -> history visible
```

If this loop is not boringly reliable, do not expand into more Atlas systems.

## Phase 1: Reliable Atlas Map Loop

### Objective

Turn the existing map context foundation into a complete in-game flow.

### Tasks

- Add explicit UI states for `not armed`, `armed`, `active`, `stale`, and `area-only`.
- Show a clear "armed waystone" card in Atlas and compact HUD.
- Add an explicit clear/disarm action for pending waystones.
- Show stale pending waystone state instead of silently ignoring it.
- Ensure entering a generated map consumes `pending_waystone` exactly once.
- Ensure random gear scans never overwrite `pending_waystone`.
- Ensure scanning a new waystone replaces the pending snapshot.
- Ensure changing hazard profile recalculates the pending/current waystone hazards.

### Acceptance Criteria

- Entering a map without arming a waystone shows `Area-only`.
- Copying a waystone shows `Armed`.
- Entering a map after arming shows `Armed` or equivalent active-run confidence.
- Stale pending waystones are marked `Stale`.
- Pending waystone is cleared after binding.
- Compact HUD and Atlas agree on current map context.
- No stale item scan can corrupt map context.

### Tests

- Unit test `bind_area_to_waystone` for armed, stale, and area-only.
- Unit test `snapshot_from_item` for waystones/tablets/non-waystones.
- UI smoke test through `npm run build`.
- Rust test through `cargo test`.

## Phase 1B: Tab Overlay OCR Fallback

### Objective

Add an optional fallback path for players who enter a map without explicitly arming a waystone. When the player presses `Tab`, Reliquary may read the right-side area/waystone modifier overlay and enrich the current area-only run.

This is a fallback, not the source of truth. The explicit clipboard flow remains primary:

```text
Copy waystone -> armed -> enter map -> active run
```

OCR can only upgrade an area-only run into a labelled partial/confirmed overlay match. It must not overwrite an explicitly armed waystone unless the user manually requests a rescan.

### Failure Modes To Design Around

- OCR may misread separators, punctuation, braces, slashes, or percent symbols. Raw OCR text must never be treated as code or direct query syntax.
- The in-game `Tab` overlay expands vertically and can bleed unrelated labels, NPC names, chest text, or quest text into the capture region.
- `Tab` can be pressed many times during a map. Repeated reads must not thrash map context, spam fetches, or override confirmed state.

### Rules

- OCR output is evidence, not truth.
- Normalize OCR lines into canonical candidate strings before matching.
- Match against known waystone/map modifier templates instead of trusting raw OCR lines.
- Reject lines that do not match known map-mod vocabulary or expected visual clusters.
- Use confidence states: `none`, `pending`, `partial`, `confirmed`, `locked`.
- Lock one OCR result per map run after confirmation.
- Reset the OCR lock only when Client.txt reports a new generated map, the user manually rescans, or the run ends.
- Keep OCR opt-in from Settings until it proves reliable in live maps.
- Display OCR confidence clearly in Atlas and compact HUD.

### Implementation Shape

- Rust owns screenshot capture, PoE2 foreground validation, OCR invocation, and rate/cooldown gates.
- TypeScript owns confidence copy, visual markers, and manual rescan controls.
- The OCR adapter should return normalized candidates plus confidence, not a final fake waystone.
- The map-context binder decides whether OCR can enrich the current `area-only` run.

### Acceptance Criteria

- Armed waystone runs are never overwritten by OCR.
- Area-only runs can show `OCR partial` or `OCR confirmed` without pretending they were clipboard-armed.
- Pressing `Tab` repeatedly in one map does not create duplicate state transitions.
- Bad OCR text degrades to `Area-only` with a clear reason.
- Manual rescan exists once the feature is enabled.

### Tests

- OCR candidate normalization rejects unrelated UI text.
- OCR lock allows only one confirmed result per active map run.
- OCR reset occurs when a new generated map is detected.
- Explicit armed waystone state wins over OCR fallback.

## Phase 2: Persisted Run History

### Objective

Make Atlas Run History real, not placeholder text.

### Tasks

- Persist active/completed map runs locally.
- Include area name, level, boss, entered time, elapsed time, confidence, waystone snapshot summary, hazard summary, and deaths.
- Move or mirror campaign map-run history into Atlas where appropriate.
- Add a compact run-history list/table in Atlas.
- Add clear history confirmation.
- Keep the Campaign tab's map-run view intact unless intentionally redesigned.

### Acceptance Criteria

- Atlas Run History shows recent runs after app restart.
- Runs with armed waystones show waystone stats.
- Area-only runs remain honest and do not display fake waystone stats.
- Death counts are visible per run.
- Clearing run history does not reset campaign act timers unless explicitly requested.

### Tests

- Add localStorage migration/normalization tests if logic is extracted.
- Verify old saved map runs without `deaths` or `confidence` still load safely.

## Phase 3: Build-Aware Hazard Profiles V2

### Objective

Make hazard profiles useful enough for actual builds while keeping defaults safe.

### Tasks

- Expand built-in profiles beyond current minimal set:
  - General Safe Mapping
  - Energy Shield / Recovery
  - Minion
  - Armour
  - Evasion
  - Flask Sustain
  - Bossing
  - XP-safe
- Add severity counts to Atlas and compact HUD:
  - info
  - warning
  - danger
  - build-breaking
- Add clearer warning copy and matched-pattern display.
- Add support for `RELIQUARY_BANNED_MODS` compatibility without confusing it with profile rules.
- Consider JSON profile import/export after defaults are stable.

### Acceptance Criteria

- Profile switching updates pending/current waystone warnings.
- Hazard warnings include modifier text, severity, profile, matched rule, and reason.
- Compact HUD prioritizes build-breaking and danger counts.
- Atlas Safety explains why a mod is dangerous.

### Tests

- Existing hazard tests must continue passing.
- Add profile-specific tests for each built-in profile once rules are expanded.
- Add fuzzy-match false-positive tests for common safe mods.

## Phase 4: Atlas UX Completion

### Objective

Make the Atlas tab feel like a finished feature, not a shell.

### Tasks

- Tighten Overview layout around:
  - Current Run
  - Armed Waystone
  - Safety Summary
  - Next Action
- Replace placeholder Endgame Focus with a simple manual tracker:
  - selected focus
  - notes
  - optional checklist
- Add Boss/Fortress placeholders only if they are useful and low-risk.
- Add clear empty states for no map, no waystone, no profile hazards.
- Keep visual language aligned with Trade/Data tabs.

### Acceptance Criteria

- Atlas is useful even before advanced progression features land.
- The user can understand what to do next from the Overview.
- The tab does not imply automation that does not exist.
- No panel feels like dead placeholder text.

## Phase 5: Economy Watchlists

### Objective

Add market awareness without new request paths.

### Tasks

- Add pinned exchange entries.
- Store pins locally.
- Reuse existing exchange cache and quote currency conversion.
- Add optional presets tied to Atlas focus.
- Do not add separate PoE.ninja fetch logic.

### Acceptance Criteria

- User can pin/unpin exchange items.
- Watchlist survives restart.
- Watchlist uses existing Trade tab cached data.
- Missing or stale exchange data degrades gracefully.

## Phase 6: Release Hardening

### Objective

Prepare a public release only after the map loop and Atlas are stable.

### Required Checks

- `npm test`
- `cargo test`
- `npm run build`
- `npm run tauri:build`
- In-game check:
  - copy normal gear
  - copy unique
  - copy exchange item
  - copy waystone
  - enter map with armed waystone
  - enter map without armed waystone
  - change hazard profile
  - die once in campaign/map
  - verify Atlas + compact HUD agree

### Release Rules

- Push WIP to `origin`.
- Push public releases to `release`.
- Update README only when a feature is actually release-ready.
- Tag public releases in `kidans/PoE2-Reliquary`.

## Known Risks

### Branch Divergence

`origin/main` and `release/main` are not equivalent. Treat `release/main` as the safe app baseline and `origin` as the WIP remote.

### False Hazard Positives

Fuzzy hazard matching can become too broad. Profile rules should prefer normalized substring matches and tested patterns before relying on fuzzy matches.

### Waystone Parsing Gaps

Waystone quantity/rarity/pack size parsing depends on item text shape. Keep fallback behavior honest and never invent values.

### UI Scope Creep

Atlas can easily become a second app. The first finished loop should stay narrow: run context, waystone safety, history.

### Scan/Evaluate Debt

Scan pricing still has known tier/filter limitations. Do not patch it opportunistically while working on Atlas unless a change directly affects routing, exchange mode, or map context.

## Agent Handoff Rules

When another agent picks this up:

1. Start from this document.
2. Confirm branch/remotes before coding.
3. Do not merge divergent `origin/main` blindly.
4. Implement one phase slice at a time.
5. Add or update tests with each backend logic change.
6. Keep UI changes visually aligned with the current Reliquary shell.
7. Push WIP to `origin`, not `release`.
8. Record unresolved assumptions in this document rather than burying them in chat.

## Immediate Next Slice

Recommended next implementation:

```text
Phase 1A: explicit Atlas armed/stale/area-only states + clear/disarm pending waystone
```

Why:

- It closes the trust gap in the current map loop.
- It is small enough to test thoroughly.
- It improves both Atlas and compact HUD without touching risky scan pricing logic.
- It creates the stable state machine that Phase 1B OCR fallback must attach to.
