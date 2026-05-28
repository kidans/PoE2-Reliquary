# Reliquary

Reliquary is a lightweight desktop overlay for Path of Exile 2, built to help with item evaluation, trade awareness, currency rates, map tracking, campaign routing, and Incursion Temple planning without needing to tab out of the game.

It runs as a transparent, always-on-top overlay using Tauri v2, with a Rust backend and a TypeScript/HTML/CSS frontend. The goal is simple: keep useful information close, stay out of the way, and avoid adding unnecessary overhead while you play.

Reliquary is built to stay small, private, and local-first. The app has a 16.5 MB executable and typically uses around 50–67 MB of RAM. It does not use OAuth, does not track personal data, and keeps user-specific settings and progress on your own machine. Reliquary only fetches current game data from trusted Path of Exile sources.

---

## Features

### Quick Price Check

Copy an item in Path of Exile 2 with `Ctrl+C`, and Reliquary will parse it automatically. It identifies the item family, rarity, and modifiers, then checks live marketplace listings through the official `trade2` API.

The price check system separates stronger roll-band matches from broader template-based results, so estimates are easier to understand. It also tracks rate-limit pressure to help avoid unnecessary API spam.

### Currency Rates

The Trade tab gives you a real-time view of currency and exchange-item values using cached PoE.ninja economy snapshots.

You can browse categories like currency, essences, fragments, runes, soul cores, catalysts, omens, and more. Reliquary also includes sparkline trends, searchable exchange data, league-aware pricing, and value comparisons across multiple quote currencies.

### Map Tracker

Reliquary reads your `Client.txt` log to detect when you enter a map. From there, it shows key map details in a compact HUD strip, including waystone mod count, item quantity, rarity, pack size, and possible hazard indicators.

If a map contains mods that match your banned-mod catalog, Reliquary surfaces them as warnings before you commit to the run.

### Campaign Guide

Reliquary includes a step-by-step campaign guide covering all five acts and the Interlude, updated for Path of Exile 2 version 0.5.

The overlay detects your current zone and highlights the next incomplete task, making it easier to stay on route while leveling. You can check off steps as you go, and progress is saved locally between sessions.

Reward chips also show important campaign rewards such as skill points, spirit, life, mana, and resistances.

### Act Timer

The campaign guide includes a built-in timer for each act. It starts when you enter the first zone of an act and pauses while you are in hideouts.

You can track your act pace and total campaign time from both compact and full guide views.

### Temple Planner

Reliquary includes a full Incursion Temple planner for the Temple of Atzoatl mechanic.

You can place rooms on a 9×9 grid, manage room types and tiers, track adjacency requirements, and plan Generator power routing. It supports all 21 room types, including special mechanics such as Spymaster medallions, Sacrificial Chamber upgrades, and Architect placement.

Temple layouts are saved locally.

---

## Ready for 0.5

Reliquary is tested for Path of Exile 2 version 0.5. It includes updated league data, campaign guide steps aligned with the 0.5 patch, and Incursion Temple support based on the 0.4/0.5 mechanic.

---

## Tech Stack

- **Tauri v2** — Desktop shell with native webview support
- **Rust** — Parsing, workers, hotkeys, window management, caching, and API calls
- **Vite + TypeScript** — Overlay UI with custom CSS and no frontend framework

---

## Data Sources

Reliquary uses data from several official and community Path of Exile sources:

- [Official Path of Exile Trade API](https://www.pathofexile.com/trade2/search/poe2) — Live marketplace listings
- [PoE.ninja](https://poe.ninja/poe2/economy/) — Cached economy snapshots and exchange rates
- [PoE2DB](https://poe2db.tw/us/) — Item families, league discovery, and modifier tier data
- [RePoE](https://repoe-fork.github.io/poe2/) — World area metadata, mod data, and base item tags

---

## Development

### Prerequisites

- Node.js + npm
- Rust + Cargo
- Windows 10+ as the primary target
- Linux support through Wine/Proton

### Commands

```bash
npm install
npm run dev           # Vite dev server
npm run build         # TypeScript + Vite production build
npm run tauri:dev     # Full Tauri dev mode
npm run tauri:build   # Production release build
npm test              # Run all tests, including Vitest and Cargo tests
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
| `POE2_CLIENT_LOG` | Override the `Client.txt` path for development |
| `RELIQUARY_BANNED_MODS` | Use a custom hazard catalog JSON file |
| `RELIQUARY_POE2_LEAGUE` | Override the startup league |
| `RELIQUARY_DEBUG_LOG` | Override the debug log path |

---

## Credits & Inspiration

Reliquary builds on ideas, tools, data, and references from the Path of Exile community:

- **[Exiled Exchange 2](https://github.com/Kvan7/Exiled-Exchange-2)** — MIT License · Copyright (c) 2020 Alexander Drozdov
- **[Exile-UI](https://github.com/Lailloken/Exile-UI)** — MIT License · Copyright (c) Lailloken
- **[Sulozor](https://sulozor.github.io)** — Atziri Temple planner reference
- **[PoE2DB](https://poe2db.tw/us/)** — Wiki content licensed under [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/) · Copyright (c) 2014–2026 PoE2DB
- **[PoE.ninja](https://poe.ninja)** — Economy data and exchange rates

---

## License

MIT License — see [LICENSE](LICENSE) for full terms.

**Additional Terms — Machine Learning Prohibition:**  
Permission is not granted for this software to be used for machine learning training, text and data mining, or artificial intelligence model generation. Automated harvesting of this codebase for the purpose of training or feeding large language models is not permitted under this license agreement.

**Path of Exile Assets Disclaimer:**  
Reliquary is an unofficial fan-made tool. It is not affiliated with, endorsed by, sponsored by, or approved by Grinding Gear Games. Path of Exile, Path of Exile 2, and related game content, trademarks, and assets are property of Grinding Gear Games.
