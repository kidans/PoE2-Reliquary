# Atziri's Temple Planner - Revised Implementation Plan

## Decision

Approved as a Reliquary feature, with one important scope boundary:

Build this first as a deterministic manual planner, not as an automated Incursion assistant. The feature should help a player plan, inspect, and save an Atziri's Temple layout inside Reliquary. It should not read `Client.txt`, scrape live state, or try to infer temple events automatically in v1.

This is a healthier feature than the current scan-price work because most of the complexity is local, testable, and visual. The main risks are data correctness, layout size, and special temple rules.

## Corrected Framing

- Use "Atziri's Temple Planner" in Reliquary UI and docs.
- Avoid calling the feature "Temple of Atzoatl" in user-facing copy unless we are explicitly referencing the old/reference planner. PoE2 currently presents the mechanic as Atziri's Temple.
- Use the Sulozor planner as a behavioral reference, not as code to copy wholesale unless its license is confirmed.
- Keep the implementation independent and typed so we can adjust to PoE2 rule changes without dragging another app's assumptions forward.

## MVP Goal

Add a new Temple tab that lets the user:

- View a 9x9 temple grid.
- Place room types manually.
- Select a room and inspect its current state, tier, reachability, and upgrade hints.
- See valid/invalid adjacency states.
- See connections between rooms.
- Persist the layout locally.
- Use compact/line mode without losing the saved temple state.

The first release does not need automatic event tracking, URL sharing, room icons, or full sacrifice/destabilisation automation.

## Architecture

The feature should be mostly frontend TypeScript:

- `src/temple-data.ts` owns static room definitions and rules.
- `src/temple-engine.ts` owns grid state, validation, reachability, tier calculation, and persistence-safe pure functions.
- `src/temple-view.ts` owns HTML rendering helpers for the Temple tab.
- `src/temple-engine.test.ts` validates the rules without requiring the Tauri shell.
- `src/main.ts` wires the tab into Reliquary and delegates rendering to `temple-view`.
- `src/styles.css` adds temple-specific visual styling using existing Reliquary variables.

Rust backend work should be minimal, but "no Rust changes" is not guaranteed. If the Temple tab needs a wider layout than Scan, add a dedicated `temple` layout in `src-tauri/src/lib.rs`. If the current Trade-sized layout is acceptable, reuse it and avoid Rust changes.

## Window And Layout Requirements

The default 546px-ish frame is too narrow for a readable temple grid plus an inspector. The Temple tab should use a wide layout similar to Trade.

Recommended layout:

- Left: existing floating spine navigation.
- Center: temple grid with connection lines.
- Right: selected room inspector and room palette.
- Header: keep current Reliquary header, league selector, and window controls.
- Footer: compact helper/status row only if it adds value.

The visual direction should stay inside the current Reliquary language:

- OLED black base.
- User accent hue for borders and active states.
- Cards remain readable and should not inherit full overlay transparency.
- No heavy parchment/gold treatment except where room rarity or PoE item-card language demands it.

## Data Model

### Core Types

```ts
export type TempleRoomId =
  | "empty"
  | "path"
  | "foyer"
  | "atziri_chamber"
  | "garrison"
  | "commanders_chamber"
  | "armoury"
  | "smithy"
  | "generator"
  | "spymasters_study"
  | "synthflesh_lab"
  | "flesh_surgeon"
  | "golem_works"
  | "alchemy_lab"
  | "thaumaturges_laboratory"
  | "corruption_chamber"
  | "sacrificial_chamber"
  | "reward_room"
  | "sealed_vault"
  | "transcendent_barrack"
  | "legion_barrack"
  | "sacrificed_room";

export type TempleTier = 0 | 1 | 2 | 3;

export interface TempleRoomDefinition {
  id: TempleRoomId;
  name: string;
  shortName: string;
  category: "fixed" | "path" | "combat" | "crafting" | "reward" | "special";
  color: string;
  placeable: boolean;
  description: string;
  tierEffects: Partial<Record<TempleTier, string[]>>;
}

export interface TempleCell {
  x: number;
  y: number;
  roomId: TempleRoomId;
  tier: TempleTier;
  manualTier: TempleTier | null;
  reachable: boolean;
  inGeneratorRange: boolean;
  hasMedallion: boolean;
  locked: boolean;
}

export interface TempleLayoutState {
  version: 1;
  cells: TempleCell[];
  selectedCellKey: string | null;
  updatedAt: number;
}
```

### Grid

- Use a fixed 9x9 grid for v1.
- Coordinates are `x: 0-8`, `y: 0-8`.
- Start with a locked path/foyer entry near the bottom center.
- Treat Atziri's chamber as a fixed destination concept, but do not overfit it until the exact PoE2 layout is verified in live data/screenshots.
- Store cells as a flat array for serialization, and expose helpers that read/write by `x,y`.

### Storage

Use a versioned localStorage key:

```ts
export const TEMPLE_STORAGE_KEY = "reliquary.temple.layout.v1";
```

The loader must tolerate missing fields and reset invalid layouts instead of throwing.

## Engine Responsibilities

The engine must be pure and testable. Do not make DOM calls inside it.

Required functions:

```ts
export function createTempleLayout(): TempleLayoutState;
export function getTempleCell(layout: TempleLayoutState, x: number, y: number): TempleCell | null;
export function setTempleRoom(layout: TempleLayoutState, x: number, y: number, roomId: TempleRoomId): TempleLayoutState;
export function setTempleManualTier(layout: TempleLayoutState, x: number, y: number, tier: TempleTier | null): TempleLayoutState;
export function calculateTempleReachability(layout: TempleLayoutState): TempleLayoutState;
export function calculateTempleGeneratorRanges(layout: TempleLayoutState): TempleLayoutState;
export function resolveTempleTiers(layout: TempleLayoutState): TempleLayoutState;
export function validateTemplePlacement(layout: TempleLayoutState, x: number, y: number, roomId: TempleRoomId): TemplePlacementResult;
export function getTempleUpgradeHint(layout: TempleLayoutState, x: number, y: number): TempleUpgradeHint;
export function serializeTempleLayout(layout: TempleLayoutState): string;
export function parseTempleLayout(raw: string): TempleLayoutState | null;
```

## MVP Rule Set

Implement these in v1:

- Empty/path/fixed room handling.
- Basic room placement and replacement.
- Adjacency validation.
- Reachability from the starting path.
- Tier display, including manual tier override.
- Upgrade hints based on adjacent room requirements.
- Generator range marking if the rule is clear enough from reference data.
- Save/load local layout.

Defer these unless they are trivial once the engine exists:

- Sacrifice/destabilisation automation.
- Medallion event simulation.
- Full garrison transformation automation.
- URL import/export.
- Room icons.
- Live map/temple event detection.

## Implementation Tasks

### Task 1: Create Temple Data

Files:

- Create `src/temple-data.ts`
- Create `src/temple-engine.test.ts`

Steps:

- Define `TempleRoomId`, `TempleTier`, `TempleRoomDefinition`, and the v1 room registry.
- Include a conservative set of PoE2-facing room names and descriptions.
- Add tests that assert the registry contains all placeable rooms, fixed rooms are not placeable, and every room has a readable name/short name.

Verification:

- Run `npm run test`.
- Expected: existing tests pass plus new temple-data tests.

### Task 2: Build Pure Grid Engine

Files:

- Create `src/temple-engine.ts`
- Modify `src/temple-engine.test.ts`

Steps:

- Implement `createTempleLayout`.
- Implement `getTempleCell`.
- Implement immutable room placement with locked-cell protection.
- Implement serialization and tolerant parsing.
- Add tests for initial grid size, locked start cell, placement, invalid placement, save/load, and corrupted save recovery.

Verification:

- Run `npm run test`.
- Expected: all tests pass without needing Tauri.

### Task 3: Add Reachability And Adjacency

Files:

- Modify `src/temple-data.ts`
- Modify `src/temple-engine.ts`
- Modify `src/temple-engine.test.ts`

Steps:

- Add an adjacency map.
- Implement `validateTemplePlacement`.
- Implement `calculateTempleReachability` using BFS.
- Add tests for connected rooms, disconnected rooms, invalid room pairings, and fixed-room behavior.

Verification:

- Run `npm run test`.

### Task 4: Add Tier And Upgrade Hints

Files:

- Modify `src/temple-data.ts`
- Modify `src/temple-engine.ts`
- Modify `src/temple-engine.test.ts`

Steps:

- Add upgrade rules for room types we can verify.
- Implement `resolveTempleTiers`.
- Implement `getTempleUpgradeHint`.
- Keep unknown or unverifiable mechanics as explicit "manual" hints instead of fake automation.
- Add tests for adjacent-upgrade rooms, manual-tier overrides, and unknown/special mechanics.

Verification:

- Run `npm run test`.

### Task 5: Render Temple Tab

Files:

- Create `src/temple-view.ts`
- Modify `src/main.ts`
- Modify `src/styles.css`

Steps:

- Add `temple` to `TabId`.
- Add a floating-spine tab icon for Temple.
- Add `renderTemplePanel`.
- Render the 9x9 grid, room palette, selected room inspector, and save status.
- Use event delegation for cell selection, room placement, tier change, and reset.

Verification:

- Run `npm run build`.
- Open the app and verify that switching tabs does not affect Scan/Trade/Data/Settings.

### Task 6: Add Layout Support

Files:

- Modify `src/main.ts`
- Modify `src-tauri/src/lib.rs` only if reusing an existing layout is not enough.

Steps:

- Make `desiredWindowLayout()` return a wide layout while the Temple tab is active.
- Prefer reusing Trade dimensions first.
- If Trade dimensions feel cramped, add a dedicated `temple` layout in Rust.

Verification:

- Run `npm run build`.
- If Rust changes were made, run `cargo test` from `src-tauri`.
- Rebuild with `npm run tauri:build` before handing to the user.

### Task 7: Persistence And Polish

Files:

- Modify `src/temple-engine.ts`
- Modify `src/temple-view.ts`
- Modify `src/main.ts`
- Modify `src/styles.css`

Steps:

- Load saved temple layout on startup.
- Save after every valid edit.
- Add reset confirmation copy.
- Add compact/line-mode summary text.
- Add small visual states for selected, reachable, unreachable, locked, powered, and invalid.

Verification:

- Run `npm run test`.
- Run `npm run build`.
- Manually verify that reload preserves the layout.

## Data Source And License Notes

The reference planner is useful for mechanics, but we should not blindly paste its data or assets unless the license allows it. For v1, write our own typed dataset based on verified public behavior and keep unclear mechanics marked as manual/unknown.

If icons are added later, prefer assets from a source with clear usage rights or generate Reliquary-native symbols.

## Known Risks

- PoE2 temple mechanics may differ from older Incursion assumptions.
- The current plan depends on verifying exact room names and upgrade rules.
- A 9x9 grid plus inspector needs a wide layout; squeezing it into Scan dimensions will produce bad UX.
- Special rooms such as sacrifice, destabilisation, medallions, and garrison variants can become scan-feature-level hydras if implemented too early.

## Release Gate

Do not call the feature release-ready until:

- Room placement is stable.
- Save/load is stable.
- The Temple tab cannot corrupt Scan/Trade state.
- The wide layout behaves correctly in full and line mode.
- Unknown mechanics are clearly labeled as manual instead of silently producing wrong hints.
- `npm run test`, `npm run build`, and any affected Rust tests pass.

## Deferred Enhancements

- Room icons.
- URL sharing/import/export.
- Full sacrifice and destabilisation simulation.
- Medallion planning.
- PoE2DB/repoe-backed room metadata refresh.
- Recommended path solver.
- "Best next incursion" scoring.

## Senior Dev Recommendation

Proceed with the MVP, but keep it boring under the hood. The planner should be a clean, typed, local state machine with a nice Reliquary skin. If we build the engine pure and tested first, the UI can become fancy without turning into another marketplace-filter debugging cave.

## Post-MVP Mechanics: Destabilization Simulation

Planned after Effect Modifiers and Diminishing Returns, before the final Temple refinement pass.

### Goal

Add a deterministic Destabilization simulator to the Temple tab so players can safely simulate post-temple room decay repeatedly.

### Engine Rules

- Use pure engine functions in `src/temple-engine.ts` so the mechanic is testable without the Tauri shell.
- Calculate the attempt budget as `max(1, floor(roomCount * 0.10)) + architectDefeated + atziriDefeated`.
- `roomCount` means total non-empty, non-path, non-Architect rooms. Fixed start, Atziri endpoint, empty tiles, paths, and Architect are excluded.
- Use seeded randomness for each Destabilize button press, and store the seed in the result so the exact break sequence is reproducible.
- Recalculate valid targets after every removal because each break can change connectivity.
- Only target rooms that can be removed without disconnecting the temple.
- Locked rooms can be targeted and consume an attempt, but are not removed.
- If no valid targets remain, record skipped attempts and leave layout state stable.

### UI Rules

- Add `Destabilize` and `Undo` buttons to the Temple mechanics panel.
- Add small `Architect defeated` and `Atziri defeated` toggles because the formula cannot infer those from the grid alone.
- Add a room lock tool so players can test locked-room protection.
- `Destabilize` pushes a full pre-run layout snapshot, runs the seeded result, and animates break attempts consecutively.
- Disable Destabilize and Undo while the breaking animation is running; after animation finishes, Undo restores the full previous layout.
- Locked-target animation should be a short shield/pulse. Removed-room animation should be a short crack/fade/collapse. Animation classes must be transient and cleared after completion.
- Respect `prefers-reduced-motion` by applying results instantly with a brief highlight.

### Tests

- Budget formula, including minimum one attempt and Architect/Atziri bonuses.
- Seed determinism.
- Locked rooms consume attempts without removal.
- Connectivity-preserving target selection.
- Recalculation after every removal.
- Undo restores the exact pre-run layout.
- Repeated Destabilize/Undo does not corrupt layout state.
