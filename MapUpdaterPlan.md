# Map-Aware Line Mode — Handoff to Codex

## What Works

- **Zone detection**: `scan://zone-updated` fires, header `Zone: Bloodwood` updates correctly
- **Client.txt found**: searches G/D/E/F/C drives for `{drive}:\Steam\` and `{drive}:\SteamLibrary\` paths
- **Area classification**: `Generating level NN area "MapBloodwood"` → `classify_area_kind` returns `"map"`/`"hideout"`/`"town"`/`"other"`
- **Waystone data**: last-scanned waystone stats (mod count, Q/R/Pack size, hazard count) attached to `CurrentAreaInfo`
- **Events**: `scan://area-updated` emits full `CurrentAreaInfo` payload to frontend
- **TypeScript listener**: `state.current_area` is set and `render()` is called on area update

## What Doesn't Work

- **Compact line mode strip** doesn't update despite all Rust events firing and TypeScript integration being complete. Zone header pill updates but compact strip shows stale "Reliquary | waiting for item" or waystone name.

## Key Discoveries

1. **PoE2 Client.txt format changed**. No `You have entered` lines. No zone name in `[SCENE] Set Source` (always `(null)`). Zone names are ONLY in `Generating level NN area "MapBloodwood"` lines.

2. **`state.blocking_lock()` deadlocks tokio**. Must use `state.lock().await` in async context. This was the root cause of ALL previous failures — the client log worker froze silently at the blocking mutex acquisition.

3. **Steam install path varies**. PoE2 can be at `{drive}:\Steam\steamapps\common\...` (direct install) OR `{drive}:\SteamLibrary\steamapps\common\...` (library folder). Current search covers both.

4. **Display names need transformation**. Internal IDs like `MapBloodwood` → display `Bloodwood`, `HideoutShoreline` → `Shoreline`. Done via `internal_id_to_display()`.

## Files Changed

| File | What |
|------|------|
| `src-tauri/src/lib.rs` | `CurrentAreaInfo`, `PendingArea` structs, `classify_area_kind()`, `client_log_path()` (multi-drive search), `stream_client_log()` (polling-based), `process_log_line()` (Generating level handler), `zone_from_log_line()` ([SCENE] Set Source parser), `internal_id_to_display()`, `now_epoch_ms()`, `parse_waystone_number()`, `parse_waystone_number_from_text()` |
| `src/main.ts` | `CurrentAreaInfo` type, `current_area` in AppState, `scan://area-updated` listener, `compactTitleText()` (map-aware), `compactMetaText()` (map stats + runtime timer), `render()` difficulty bar, compact strip CSS classes |
| `src/styles.css` | `.compact-difficulty-bar` (hidden by default, shown when `.is-mapping`) |

## Last-Mile Debugging Clue

The issue is in TypeScript rendering, not Rust. All Rust events fire correctly. The `scan://area-updated` listener sets `state.current_area` and calls `render()`. The `compactTitleText()` function checks `state.current_area?.area_type === "map"` first. But the compact strip doesn't update.

Possible causes to investigate:
- `compactTitleElement` / `compactMetaElement` might be null/detached DOM references
- `render()` might be called but the compact strip is outside the panel update path (it's in the HUD chrome, not the panel content)
- Maybe `compactMode` is false and the strip is `display: none`
- Race condition: `scan://item-updated` event fires after area update and overwrites `state.scanned_item`, causing `render()` to show scan mode instead of compact mode

## What I Would Try Next

1. Add `console.log("area", state.current_area)` at the top of `compactTitleText()` to verify the function runs with correct data
2. Check if `hudElement.classList.contains("is-compact")` is true
3. Check if `compactTitleElement` is still a valid DOM element (not replaced by innerHTML)
4. Verify `state.current_area` is not being overwritten by another event between `scan://area-updated` and `render()`

---

# Campaign Checklist Integration Plan

## Data Source

**Site:** `https://domistae.github.io/poe2-leveling/` — MIT-licensed, actively maintained, updated for Patch 0.5 (May 29, 2026)

**Pages to scrape:** `poe2_act1_guide.html` through `poe2_act4_guide.html` + `poe2_interludes_guide.html`

**Scraping strategy:** CSS-class-based extraction (stable, DOM not JS-rendered):
- Zone headers: `.zone-header` → zone name, `.wp` (waypoint), `.town` (town), level range
- Steps: `.step-content` → text, `.npc`, `.boss`, `.item`, `.loc`, `.skip` (optional), reward strings
- Notes: `.note` blocks

**Output format** (`src/campaign-guide.json`):
```json
{
  "version": "0.5",
  "acts": [{
    "act": 1,
    "name": "Clearfell to Ogham",
    "level_range": "1-14",
    "rewards": ["+4 Skill Points", "+10% Cold Res", "+30 Spirit", "+20 Max Life", "Salvage Bench"],
    "zones": [{
      "name": "Clearfell",
      "level": "2-3",
      "waypoint": false,
      "town": false,
      "steps": [
        { "text": "Kill Beira of the Rotten Pack", "loc": "north", "reward": "+10% Cold Res", "tags": ["boss"] },
        { "text": "Talk to Una", "tags": ["npc"] }
      ]
    }]
  }]
}
```

**Scraping tool:** Node.js script using `cheerio` (Vite devDependency). Run once, commit JSON. Re-run on patch days.

---

## Phase 1: Data Loading

**TypeScript types:**
```typescript
type GuideStep = { text: string; loc?: string; reward?: string; tags: string[] };
type GuideZone = { name: string; level: string; waypoint: boolean; town: boolean; steps: GuideStep[] };
type GuideAct = { act: number; name: string; level_range: string; rewards: string[]; zones: GuideZone[] };
type GuideData = { version: string; acts: GuideAct[] };
```

**Import:** `import guideData from "./campaign-guide.json"` (Vite JSON import, tree-shakeable).

**State additions:**
```typescript
let campaignCompletedSteps = new Set<string>();  // "1:Clearfell:0", "1:Clearfell:1"
let campaignCurrentZone = "";                    // matched zone name from area-updated
```

**Persistence:**
```typescript
const CAMPAIGN_STORAGE_KEY = "reliquary.campaign.progress";
// Save: completedSteps (array), currentZone, guidePage
// Load: on app init, restore Set + state
// Save on: step toggle, zone change
```

---

## Phase 2: Option A — Line 2 Step Display

**Goal:** Compact strip line 2 shows first unchecked step in current zone.

**Logic:**
1. Match `state.current_area.name` against guide zones (fuzzy: lowercase trim)
2. Find first step whose key is NOT in `campaignCompletedSteps`
3. Display on line 2: `[tag] text · reward`

**Rendering:**
```typescript
function compactMetaText(status: string): string {
  if (campaignGuideAct > 0) {
    const step = findNextIncompleteStep();
    if (step) {
      const tagPrefix = step.tags.length ? step.tags.map(t => `[${t}]`).join(" ") + " " : "";
      const reward = step.reward ? ` · ${step.reward}` : "";
      return `${tagPrefix}${step.text}${reward}`;
    }
    return "All tasks complete — enter next zone";
  }
  // ...existing map/hideout/town logic...
}
```

**Line 2 click:** Clicking line 2 text toggles the displayed step as complete/incomplete. No expand needed. Handler in root click listener checks `[data-compact-meta]` and toggles.

**Scrolling:** `overflow-x: auto; white-space: nowrap` on `.compact-strip strong` for steps with long text + rewards.

**No auto-complete on zone change:** Unchecked steps stay unchecked. User must manually track. Persistence survives restarts via localStorage.

---

## Phase 3: Option B — Expandable Checklist Overlay

**Trigger:** Click badge on line 2 (e.g. `[2/6]`) or a dedicated expand button.

**Expanded state:**
```html
<div class="compact-checklist-overlay" data-checklist-zone="Clearfell">
  <div class="checklist-header">
    <span>Clearfell · Lvl 2-3</span>
    <span class="checklist-progress">2/6</span>
  </div>
  <div class="checklist-steps">
    <div class="checklist-step completed" data-step-key="1:Clearfell:0">
      ☑ Talk to Renly · <span class="tag-npc">NPC</span>
    </div>
    <div class="checklist-step" data-step-key="1:Clearfell:2">
      ☐ Find Una · <span class="tag-boss">BOSS</span>
    </div>
    ...
  </div>
</div>
```

**Styling:**
- Uses existing `--surface-alpha` and `--accent-hue` CSS variables — inherits user's OLED/red theme
- Step colors follow domistae's palette: NPC=tan, boss=red, item=steel, WP=gold
- Completed steps: strikethrough + `opacity: 0.5`
- Max-height ~300px with `overflow-y: auto`
- Max-width: matches compact strip width

**Window resize:** When expanded, Tauri window grows vertically to fit checklist (via existing `set_window_layout`). Collapses back on zone change or manual toggle.

**Edge cases:** No zone match → "No guide data for this zone." Hideout → campaign summary (total steps, time per act). No data loaded → "Guide data loading..."

---

## Phase 4: Architecture Decisions

- **UI system**: Uses existing CSS variables. No separate background/theme system needed.
- **Persistence**: localStorage with `Set<string>` serialized as array. Step keys = `"{act}:{zone}:{index}"`.
- **Auto-advance**: Only activates on zone change detected by `scan://area-updated`. Old zone's unchecked steps remain unchecked.
- **Scrolling text**: CSS-only. No JS animation or marquee. Ellipsis + overflow-x auto handles long lines.
- **Static data**: Scrape once, commit JSON. Manual refresh on patch days (user asks on May 29).

---

## Phase 5: Milestones & Estimates

| # | Task | Est. |
|---|------|:---:|
| P1 | Scrape script + generate `campaign-guide.json` | 2h |
| P2 | TypeScript types + state + localStorage persistence | 1.5h |
| P3 | Option A — line 2 step display + click-to-complete | 2h |
| P4 | Option B — expandable checklist overlay + window resize | 3h |
| P5 | Integration testing (all 6 acts, persistence, UI) | 1.5h |
| **Total** | | **10h** |

