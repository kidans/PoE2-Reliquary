# Kalandra — Map-Aware Line Mode Plan

## Goal

When Kalandra is in compact/line mode, show context-aware information:
- **While in a map:** tier, name, mod count, quantity/rarity/pack size, hazard warnings, run timer
- **While in hideout:** trade mode (Ctrl+C scan, Alt+D trade)
- **While in town:** zone name, scan ready

## Data Sources & Approach

| Data | Source | Method |
|------|--------|--------|
| Area name | `You have entered` line in Client.txt | Already parsed (`zone_from_log_line`) |
| Area level | `Generating level NN` line | **Option A** — new regex, zero external data |
| Area classification | Internal ID from `Generating level` | **Option A** — heuristic (`MapWorlds` = map, `Hideout` = hideout, `_town` = town) |
| Waystone mod count/stats | Last scanned waystone clipboard data | Already parsed by `item_parser.rs` |
| Hazard count + severity | `banned_mods.json` fuzzy match | Already working (`hazards.rs`) |
| Biome/boss names (cosmetic) | PO2's 699.bundle.js area database | **Light B — deferred post-launch** |

## Client.txt Event Sequence

```
Connecting to instance server at 12.34.56.78
Generating level 79 area "MapWorldsVolcano" with seed 4294967295  ← NEW: parse this
You have entered Abyssal Volcano.                                    ← already parsed
```

## New Rust Structures

```rust
// In AppState
current_area: Option<CurrentArea>,
pending_area: Option<PendingArea>,
last_waystone: Option<WaystoneSummary>,

struct PendingArea {
    internal_id: String,  // "MapWorldsVolcano"
    level: u32,           // 79
}

struct CurrentArea {
    name: String,          // "Abyssal Volcano"
    level: u32,            // 79
    area_type: AreaType,   // Map | Hideout | Town | Other
    entered_at: Instant,
    waystone: Option<WaystoneSummary>,
}

enum AreaType { Map, Hideout, Town, Other }

struct WaystoneSummary {
    mod_count: usize,
    quantity: Option<u32>,
    rarity: Option<u32>,
    pack_size: Option<u32>,
    hazard_count: usize,
    hazards: Vec<String>,
    difficulty_pct: f32,
}
```

## Classification Heuristic

```rust
fn classify_area(internal_id: &str) -> AreaType {
    if internal_id.starts_with("MapWorlds")  { AreaType::Map }
    else if internal_id.starts_with("Hideout") { AreaType::Hideout }
    else if internal_id.ends_with("_town")   { AreaType::Town }
    else { AreaType::Other }
}
```

Zero data files. Survives any league. Internal IDs are GGG-authored and stable.

## Waystone Correlation

Natural user workflow:
1. User Ctrl+C on waystone → Kalandra parses, stores `last_waystone`
2. User puts waystone in map device, enters map
3. `CurrentArea` created with `waystone: Some(last_waystone)`
4. Line mode displays full map info

If no waystone was scanned before entering (e.g., user scanned an amulet), line mode shows map name + level only. Graceful fallback.

## Line Mode UX

**Mapping:**
```
┌──────────────────────────────────────────────────────────────────────┐
│ L79 Abyssal Volcano · mods:6 Q:87% R:42% Pack:28% · ▲2 hazards · 4:32 │
│ ████████░░░░░░░░░░░░░░░░░░░░░░  · Alt+D trade              [Open] │
└──────────────────────────────────────────────────────────────────────┘
```

**Hideout:**
```
┌──────────────────────────────────────────────────────────────────────┐
│ Trade Mode · Ctrl+C scan · Alt+D trade                       [Open] │
└──────────────────────────────────────────────────────────────────────┘
```

**Town:**
```
┌──────────────────────────────────────────────────────────────────────┐
│ Clearfell Encampment · Ctrl+C scan items                     [Open] │
└──────────────────────────────────────────────────────────────────────┘
```

## Difficulty Bar

Red segments = hazards (from `banned_mods.json` match)
Yellow = unranked dangerous mods
Dim = benign mods

2px-tall CSS bar under the compact strip, matching Kalandra's `neutral-800` border color. Red glow for hazard segments.

## Implementation Scope

| Component | File | Lines | Est. |
|-----------|------|------:|:---:|
| `PendingArea` + `classify_area` | `lib.rs` | ~40 | 1h |
| `Generating level` regex | `lib.rs` | ~15 | 30m |
| `WaystoneSummary` extraction | `lib.rs` | ~30 | 1h |
| Wire into AppState + IPC types | `lib.rs` + `main.ts` | ~40 | 1h |
| `renderCompactStrip` rewrite | `main.ts` | ~60 | 2h |
| Difficulty bar CSS | `styles.css` | ~20 | 30m |
| **Total** | | **~200** | **~6h / 1 day** |

## Deferred (Post-Launch)

| Feature | Reason |
|---------|--------|
| Biome/boss names from PO2 area DB | Cosmetic, needs data extraction pipeline |
| Per-build mod difficulty ranking | Complex UX, user profiles needed |
| Run timer persistence | In-memory timer sufficient for v1 |
| Expedition logbook support | Niche, complex parsing |
| Kill tracking via /kill | Very niche |
| Auto-refresh on currency reroll | Requires screen reading |
