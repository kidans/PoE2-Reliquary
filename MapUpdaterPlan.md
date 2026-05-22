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
