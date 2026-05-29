# Reliquary Project Plan

This document captures the current product direction and implementation plan for Reliquary after the 0.5 research pass. It is intentionally focused on practical, low-risk improvements that fit Reliquary's identity as a lightweight, local-first Path of Exile 2 overlay.

OCR-based map reading is deliberately excluded from this plan for now. The near-term goal is to make the map HUD reliable through explicit, deterministic data flow before adding more HUD intelligence.

---

## Product Direction

Reliquary should position itself as a lightweight, local-first PoE2 overlay for:

1. Reliable map/run context.
2. Build-aware map safety.
3. 0.5 endgame progression support.
4. 0.5 economy awareness.

The strongest community-facing pitch is not that Reliquary is another price checker. It is that Reliquary helps players understand and survive the new 0.5 endgame loop while staying private, fast, and unobtrusive.

Suggested positioning:

> Reliquary is the lightweight, local-first PoE2 overlay for 0.5 endgame progression, map safety, and market awareness — without OAuth, tracking, or bloat.

---

## UI Direction: Atlas Tab

The Atlas UI should reuse Reliquary's existing visual language rather than introducing a new style or a Temple-sized planner.

Decision:

```text
Atlas tab = Currency tab shell + Data tab cards
```

The Currency tab provides the right full-window shell: left category sidebar, dense main panel, red active states, and action-oriented layout. The Data tab provides the right card language for status panels, health blocks, and diagnostic summaries.

### Atlas Tab Sections

- Current Run
- Waystone Safety
- Danger Profile
- Endgame Focus
- Run History
- Boss / Fortress later

### HUD vs Atlas Responsibility

The compact HUD should remain a fast glance summary:

```text
Mesa T15 · 92% quant · 24% pack · 1 breaking / 2 danger · ES Profile
```

If no waystone was armed:

```text
Mesa · Area Lv 80 · Waystone not armed
```

The Atlas tab should hold the detailed explanation, profile selector, current run context, and future endgame progression panels.

Settings may mirror advanced/default danger-profile controls later, but active map safety and profile switching should be available inside Atlas.

---

## Current Problem: Map HUD Reliability

The current HUD depends on the last copied/scanned item when a map is entered. This means the HUD only shows waystone data if the player remembered to Ctrl+C the map before entering, and it can be wrong if the last scanned item is stale or unrelated.

Before adding more HUD data, the HUD needs a stronger state model.

### Goal

Decouple map HUD data from the generic `scanned_item` flow.

The HUD should know the difference between:

- The current generated area from `Client.txt`.
- A waystone intentionally prepared for the next map.
- The active map run currently being tracked.
- Missing, stale, or uncertain waystone data.

---

## Priority 0: Reliable Map Run Context

This is the required foundation before build-aware hazards, Atlas goals, or economy hints are added to the HUD.

### Core Concept

Introduce a dedicated map-run state pipeline:

```text
Explicit waystone arm -> pendingWaystone -> activeMapRun -> HUD
Client.txt area event -------------^
```

Instead of using the last scanned item directly, Reliquary should store a dedicated pending waystone snapshot. When `Client.txt` reports a generated map area, the app consumes the pending waystone and binds it to the active map run.

### New States

#### `pendingWaystone`

A waystone the user intentionally prepared for the next map.

Suggested fields:

```rust
pub struct WaystoneSnapshot {
    pub name: String,
    pub base_type: Option<String>,
    pub tier: Option<u8>,
    pub item_level: Option<u16>,
    pub explicit_mods: Vec<String>,
    pub quantity: Option<u32>,
    pub rarity: Option<u32>,
    pub pack_size: Option<u32>,
    pub hazard_count: usize,
    pub raw_hash: String,
    pub captured_at_epoch_ms: u64,
}
```

#### `activeMapRun`

The current map run, created when an area is generated.

Suggested fields:

```rust
pub struct MapRunContext {
    pub area: CurrentAreaInfo,
    pub waystone: Option<WaystoneSnapshot>,
    pub confidence: MapRunConfidence,
    pub started_at_epoch_ms: u64,
}

pub enum MapRunConfidence {
    Armed,
    AreaOnly,
    Stale,
    Unknown,
}
```

### UX States

#### 1. Armed

The user copied or armed a waystone before entering.

```text
Waystone armed: T15 · 92% quant · 24% pack · 2 hazards
```

After map entry:

```text
Mesa T15 · 92% quant · 24% pack · 2 hazards
```

#### 2. Area-only

The user entered a map without arming a waystone.

```text
Mesa · Area Lv 80 · Waystone not armed
```

This is acceptable and honest. It is better than showing stale or incorrect waystone details.

#### 3. Stale or uncertain

A pending waystone exists but is too old, or another condition makes the association questionable.

```text
Mesa · Area Lv 80 · Waystone data unverified
```

### Acceptance Criteria

- Entering a map without an armed waystone shows area name and area level only.
- Copying or arming a waystone shows a clear “Waystone armed” state.
- Entering the next map binds the armed waystone to the active run.
- Once bound, `pendingWaystone` is cleared.
- If the pending waystone is older than a defined timeout, it is ignored or marked stale.
- Scanning random gear does not overwrite the pending waystone.
- Scanning a new waystone can replace the pending waystone.
- HUD displays confidence: `armed`, `area-only`, `stale`, or `unknown`.

---

## Priority 1: Build-Aware Waystone Hazard Profiles

Once map run context is reliable, upgrade the current generic waystone hazard system into build-aware profiles.

### Problem

A generic banned-mod list is useful, but it does not reflect build differences. A mod that is harmless for one build can be build-breaking for another.

### Goal

Let users choose a build safety profile that changes how Reliquary ranks map modifiers.

### Example Profiles

- General Safe Mapping
- Energy Shield / Recovery
- Minion
- Armour
- Evasion
- Flask Sustain
- Projectile
- Bossing
- XP-safe
- Custom profile

### Suggested Rule Shape

```json
{
  "id": "energy_shield",
  "label": "Energy Shield / Recovery",
  "rules": [
    {
      "match": "reduced Recovery Rate",
      "severity": "danger",
      "reason": "Bad for ES and recovery-based builds."
    },
    {
      "match": "Monsters penetrate Elemental Resistances",
      "severity": "warning",
      "reason": "Can cause unexpected damage spikes."
    }
  ]
}
```

### HUD Output

Examples:

```text
2 ES danger mods
```

```text
Build-breaking: reduced Recovery Rate
```

### Acceptance Criteria

- Users can select a build safety profile in Atlas and later in Settings.
- Hazard results are structured, not just a list of strings.
- Each hazard can include modifier text, severity, source profile, and reason.
- HUD shows severity counts.
- Expanded Atlas panel shows exact dangerous modifiers and explanations.
- Custom user profiles can be added later without changing the core engine.

---

## Priority 2: 0.5 Endgame / Atlas Companion

The 0.5 patch direction makes endgame progression more structured through Atlas goals, mechanic questlines, bosses, Fortresses, and related systems. Reliquary should support this as a lightweight companion rather than attempting to fully simulate or read the Atlas.

### Goal

Create a manual or semi-automatic endgame progression tab modeled after the existing Campaign tab.

### Initial MVP

Add an `Atlas` tab with:

- Mechanic sections.
- Manual checkboxes.
- Current focus selector.
- Boss / Fortress checklist.
- Atlas point checklist.
- Notes for mechanic danger and reward themes.

### Design Principle

Do not over-automate the Atlas companion in v1.

Manual tracking is acceptable if it is:

- Fast.
- Clear.
- Local-only.
- Useful during play.
- Honest about what is and is not detected automatically.

---

## Priority 3: 0.5 Economy Watchlists

Reliquary already has a PoE.ninja-backed exchange layer with categories such as currency, essences, delirium, breach, ritual, expedition, abyss, fragments, runes, soul cores, idols, and gems. This can become a high-value 0.5 economy feature without introducing risky integrations.

### Goal

Let users pin and monitor economy items relevant to their chosen endgame focus.

### MVP

Add a Watchlist sub-tab inside Trade or Atlas later.

Features:

- Pin exchange entries.
- Built-in presets.
- Current price.
- Percentage change.
- Sparkline.
- Quote currency conversion.

---

## Explicitly Excluded for Now: OCR

OCR is not part of the near-term plan.

Reasoning:

- OCR reads pixels, not game state.
- Tooltip location varies across inventory, stash, map device, monitor layout, UI scale, and cursor position.
- PoE item tooltips have small fonts, colored text, textured backgrounds, separators, and wrapped modifier lines.
- Small OCR mistakes can change map safety meaning.
- OCR can increase performance cost and maintenance burden.
- OCR may create user trust concerns because the app is reading the screen.

This does not mean OCR is permanently rejected. It should only be reconsidered later as an optional, explicit, user-triggered experiment after the deterministic map-run context is stable.

---

## Suggested Implementation Order

### Milestone 1: Reliable Map HUD Foundation

- Add `WaystoneSnapshot`.
- Add `MapRunContext`.
- Add `pendingWaystone` to app state.
- Add `activeMapRun` to app state.
- Add explicit waystone arming flow.
- Bind pending waystone to next generated map.
- Clear stale pending waystones.
- Show HUD confidence states.

### Milestone 2: Dedicated Arm Waystone UX

- Add a dedicated hotkey such as `Alt+W`.
- Treat arming separately from price check.
- Avoid triggering full price-check flow when the user only wants map HUD preparation.
- Add status messages for armed, replaced, stale, and consumed waystones.

### Milestone 3: Build-Aware Hazards

- Add hazard profile data.
- Add Settings/Atlas UI for profile selection.
- Return structured hazard results.
- Show severity counts in compact HUD.
- Show details in Atlas.

### Milestone 4: Atlas Tab MVP

- Add Atlas tab using the Currency tab shell and Data tab cards.
- Add Current Run panel.
- Add Waystone Safety panel.
- Add Danger Profile panel.
- Add Endgame Focus placeholder.

### Milestone 5: Economy Watchlists

- Add watchlist state.
- Add pin/unpin UI.
- Add preset watchlists.
- Reuse exchange cache and sparkline data.
- Add focus-aware market hints after HUD foundation is stable.
