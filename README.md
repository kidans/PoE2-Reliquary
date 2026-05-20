# Kalandra

Kalandra is a Path of Exile 2 desktop overlay built with Rust and Tauri v2 for maximum efficiency all in the aim of making things extremely light while maintaining a core functionality of all things helpful without needing to alt-tab out of the game. 

## What Kalandra Does Today

### Scan

Copy an item from PoE 2 with `Ctrl+C` and Kalandra opens an in-game style evaluation panel. It parses the clipboard, classifies the item, separates properties from modifiers, applies rarity-aware presentation, and shows comparable marketplace results.

### Marketplace Results

For normal item checks, Kalandra uses official Path of Exile `trade2` searches and listing fetches.

It also does a few things to keep that experience practical:

- identical marketplace checks are cached for `10` seconds
- the first result batch loads quickly, then more rows load as you scroll
- rate-limit pressure is tracked and shown as a subtle usage bar
- league selection is respected end-to-end

### Trade Tab

The Trade tab is a broader market view for exchange-style items such as currency, essences, fragments, runes, soul cores, and similar categories.

It is backed by cached PoE.ninja snapshots, then shaped into a league-aware dashboard with category browsing, value normalization, search, and quick actions.

### Data Tab

The Data tab is where Kalandra keeps its “source of truth” thinking visible. It is used for league discovery, catalog wiring, and the groundwork that helps the overlay stay resilient when a new league or new item family shows up.

## Why It Is Built This Way

Path of Exile 2 tooling has an annoying tension:

- the official trade APIs are the most honest source for live listings, but they are easy to overuse
- PoE.ninja is great for broader market snapshots, but it is not truly real-time
- PoE2DB often exposes item structure and league changes early, but it is not a live pricing source

Kalandra leans into that reality instead of pretending one source can do everything.

- `trade2` is used where live marketplace accuracy matters
- `PoE.ninja` is used where cached market overviews make more sense
- `PoE2DB` is used as a classification and source-of-truth input for item families, league discovery, and parser groundwork

## Controls

- `Ctrl+C` scans the currently copied PoE 2 item
- `Alt+D` opens the latest marketplace handoff for the current item
- `Line` collapses the overlay into a compact one-line mode
- Drag the header to reposition the overlay
- Use the top-right league selector to switch the active league context

Single-key shortcuts that were easy to hit by accident while typing were intentionally removed.

## Current Direction

Kalandra is moving toward a few clear goals:

- item parsing that is family-aware and easier to update when PoE 2 changes
- a trade workflow that stays fast without abusing official APIs
- league handling that does not break every time a new league launches
- a UI that feels like it belongs next to PoE 2 rather than like a generic desktop panel

## Tech Stack

- `Tauri v2` for the desktop shell
- `Rust` for parsing, workers, hotkeys, window behavior, caching, and API calls
- `Vite + TypeScript` for the overlay UI

## Data Sources

- [Official Path of Exile Trade](https://www.pathofexile.com/trade2/search/poe2)
- [PoE.ninja PoE2 Economy](https://poe.ninja/poe2/economy/)
- [PoE2DB](https://poe2db.tw/us/)

If you want the implementation notes and marketplace research trail, see [MARKETPLACE_RESEARCH.md](MARKETPLACE_RESEARCH.md).

## Development

### Prerequisites

- `Node.js + npm`
- `Rust + Cargo`

### Useful Commands

```bash
npm install
npm run dev
npm run build
npm run tauri:dev
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
src-tauri/target/release/kalandra-lumen-scan.exe sources --json
src-tauri/target/release/kalandra-lumen-scan.exe leagues --json
src-tauri/target/release/kalandra-lumen-scan.exe debug-log --tail 40
```

### Environment Notes

- `POE2_CLIENT_LOG` points the backend at a specific PoE 2 `Client.txt` while testing log watching
- `LUMEN_BANNED_MODS` points to a custom hazard catalog JSON file
- `LUMEN_POE2_LEAGUE` overrides the startup marketplace league
- `LUMEN_DEBUG_LOG` overrides the default debug log path

By default, debug logs are written to:

`%LOCALAPPDATA%\Kalandra\lumen-scan-debug.log`

## Release Outputs

After `npm run tauri:build`, the Windows outputs are:

- `src-tauri/target/release/kalandra-lumen-scan.exe`
- `src-tauri/target/release/bundle/nsis/Lumen-Scan_0.1.0_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/Lumen-Scan_0.1.0_x64_en-US.msi`
