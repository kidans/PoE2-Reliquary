# Reliquary

A lightweight Path of Exile 2 desktop overlay for item evaluation, trade awareness, currency rates, map tracking, campaign guidance, and Incursion Temple planning — all without tabbing out of the game.

Built with Tauri v2 (Rust backend + TypeScript/HTML/CSS frontend), Reliquary runs as a transparent, always-on-top overlay that stays out of your way until you need it.

---

## Features

### Quick Price Check
Copy any item in Path of Exile 2 with `Ctrl+C` and Reliquary parses it instantly. Items are classified by family, rarity, and modifiers, then checked against live marketplace listings via the official `trade2` API. Tier-based filtering separates validated roll-band matches from template-only guesses, and rate-limit pressure is tracked so you never accidentally spam the API.

### Currency Rates
The Trade tab provides a real-time currency and exchange-item dashboard backed by cached PoE.ninja snapshots. Browse categories (currency, essences, fragments, runes, soul cores, catalysts, omens, and more), view sparkline trends, compare values against multiple quote currencies, and search across the entire exchange economy — all league-aware and refreshable on demand.

### Map Tracker
When you enter a map, Reliquary automatically detects the area from your `Client.txt` log. It shows waystone mod counts, quantity, rarity, pack size, and hazard indicators directly in the compact HUD strip. Hazard mods that match the banned-mods catalog are surfaced as warnings so you know what you're walking into before the first pack.

### Campaign Guide (Updated for 0.5)
A full step-by-step leveling guide covering all five acts plus the Interlude. The overlay automatically detects which zone you're in and highlights the next incomplete task. Check off steps as you go — progress persists across sessions via local storage. Reward chips show skill points, spirit, life, mana, and resistance rewards with color-coded labels.

### Automatic Timer per Act
The campaign guide includes a per-act timer that starts when you enter the first zone of an act and pauses in hideouts. Track your pace through each act and your total campaign time at a glance in both compact and full modes.

### Temple
A full Incursion Temple planner for the Temple of Atzoatl mechanic. Place rooms on a 9×9 grid, manage room types and tiers, track adjacency requirements for upgrades, and plan Generator power routing. Supports all 21 room types including special mechanics like Spymaster medallions, Sacrificial Chamber upgrades, and Architect placement. Layouts persist via local storage.

---

## Comparison with Exiled Exchange 2

Exiled Exchange 2 is a well-established Path of Exile 2 price-checking tool with a broad feature set. Reliquary is built with a different philosophy: it is laser-focused on being a lightweight overlay that feels native next to the game rather than a separate window.

| | Reliquary | Exiled Exchange 2 |
|---|---|---|
| Overlay style | Transparent, always-on-top, frameless | Separate window with decorations |
| Backend | Rust (Tauri v2) | Electron / JavaScript |
| Memory footprint | ~40 MB idle | ~200+ MB typical for Electron |
| Item scanning | Clipboard (Ctrl+C) | Clipboard + alternative methods |
| Price checking | trade2 API (official) | trade2 API (official) |
| Currency exchange | PoE.ninja snapshots with category browser | Currency overview |
| Map tracking | Client.txt log parsing, waystone hazards | Map mod display |
| Campaign guide | Zone-aware step tracking with timers | — |
| Incursion Temple | Full 9×9 grid planner | — |
| Global hotkeys | Ctrl+C scan, Alt+D trade (configurable) | Various hotkeys |
| Data caching | Local smart caching with TTL-based refresh | Various |

Reliquary does not aim to replace Exiled Exchange 2 — it offers a different experience for players who want minimal distraction, native performance, and an overlay that feels like part of the game.

---

## Ready for 0.5

Reliquary is tested and ready for Path of Exile 2 version 0.5. The overlay includes up-to-date league data, campaign guide steps aligned with the 0.5 patch, and Incursion Temple support matching the 0.4/0.5 mechanic.

---

## Tech Stack

- **Tauri v2** — Desktop shell with native webview (WebView2 on Windows, WebKit on Linux)
- **Rust** — Parsing, workers, hotkeys, window management, caching, and API calls
- **Vite + TypeScript** — Overlay UI with custom CSS (no framework)

---

## Data Sources

- [Official Path of Exile Trade API](https://www.pathofexile.com/trade2/search/poe2) — Live marketplace listings
- [PoE.ninja](https://poe.ninja/poe2/economy/) — Cached economy snapshots and exchange rates
- [PoE2DB](https://poe2db.tw/us/) — Item family classification, league discovery, modifier tier data
- [RePoE](https://repoe-fork.github.io/poe2/) — World area metadata, mod data, base item tags

---

## Development

### Prerequisites

- Node.js + npm
- Rust + Cargo
- Windows 10+ (primary target), Linux via Wine/Proton

### Commands

```bash
npm install
npm run dev           # Vite dev server
npm run build         # TypeScript + Vite production build
npm run tauri:dev     # Full Tauri dev mode
npm run tauri:build   # Production release build
npm test              # Run all tests (Vitest + Cargo test)
```

### CLI Modes

```bash
reliquary.exe sources --json     # Print data source status
reliquary.exe leagues --json     # Print detected leagues
reliquary.exe tiers --json       # Print modifier tier summary
reliquary.exe debug-log --tail 40 # Tail the debug log
```

### Environment Variables

| Variable | Purpose |
|---|---|
| `POE2_CLIENT_LOG` | Override `Client.txt` path for development |
| `RELIQUARY_BANNED_MODS` | Custom hazard catalog JSON path |
| `RELIQUARY_POE2_LEAGUE` | Override startup league |
| `RELIQUARY_DEBUG_LOG` | Override debug log path |

---

## Credits & Inspiration

Reliquary builds on ideas, data, and inspiration from the Path of Exile community:

- **[Exiled Exchange 2](https://github.com/Kvan7/Exiled-Exchange-2)** — MIT License · Copyright (c) 2020 Alexander Drozdov
- **[Exile-UI](https://github.com/Lailloken/Exile-UI)** — MIT License · Copyright (c) Lailloken
- **[Sulozor](https://sulozor.github.io)** — Atziri Temple planner reference
- **[PoE2DB](https://poe2db.tw/us/)** — Wiki content licensed under [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/) · Copyright (c) 2014-2026 PoE2DB
- **[PoE.ninja](https://poe.ninja)** — Economy data and exchange rates

---

## License

MIT License — see [LICENSE](LICENSE) for full terms.

**Additional Terms — Machine Learning Prohibition:** Permission is NOT granted for this Software to be utilized for machine learning training, text and data mining, or artificial intelligence model generation. Any automated harvesting of this codebase for the purpose of feeding LLMs constitutes a violation of this license agreement.

**Path of Exile Assets Disclaimer:** Reliquary is an unofficial fan-made tool. It is not affiliated with, endorsed by, sponsored by, or approved by Grinding Gear Games. Path of Exile, Path of Exile 2, and related game content, trademarks, and assets are property of Grinding Gear Games.
