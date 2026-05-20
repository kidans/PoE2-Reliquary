# Technical Blueprint & Production Specification: PoE2 "Reliquary" Overlay Engine (Tauri v2 Architecture)

This document defines the production architecture, multi-threaded backend pipeline, and rapid-development implementation schedule for **Reliquary**.

By pivoting from a terminal interface to **Tauri v2**, this utility operates as a lightweight, hardware-accelerated desktop overlay. It pairs a high-performance **Rust engine** with a minimalist, high-contrast **TypeScript/Tailwind HTML frontend**. It runs on native operating system webviews (Webview2 on Windows, WebKit on Linux), staying immune to official GGG Trade API rate limits while keeping idle memory consumption under 40MB.

---

## I. Architectural Topology

Reliquary leverages a decoupled, asynchronous concurrent worker pool managed by the `tokio` runtime, bridged to the user interface layer via Tauri v2's low-latency Inter-Process Communication (IPC) protocol.

```
                             ┌───────────────────────┐
                             │   Path of Exile 2     │
                             └─────┬───────────┬─────┘
              Ctrl+C / Hotkeys     │           │ Client.txt Appends
                                   ▼           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     RELIQUARY RUST BACKEND ENGINE                       │
│                                                                         │
│  ┌────────────────────────┐             ┌────────────────────────────┐  │
│  │  Global OS Input Loop  │             │ Client.txt Log Streamer    │  │
│  │   (rdev / arboard)     │             │    (linemux / notify)      │  │
│  └───────────┬────────────┘             └─────────────┬──────────────┘  │
│              │ Captures Item Text                     │ Captures Incoming Whispers
│              └────────────────────┬───────────────────┘                 │
│                                   ▼                                     │
│                     ┌───────────────────────────┐                       │
│                     │  Thread-Safe AppState     │                       │
│                     │   (Arc<Mutex<AppState>>)  │                       │
│                     └─────────────┬─────────────┘                       │
│                                   │ tauri::Emitter::emit()              │
│                                   ▼                                     │
│                     ┌───────────────────────────┐                       │
│                     │   Tauri v2 Core Bridge    │                       │
│                     └─────────────┬─────────────┘                       │
└───────────────────────────────────┼─────────────────────────────────────┘
                                    │ IPC Event Pipeline (JSON Channel)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     TAURI FRONTEND OVERLAY INTERFACE                    │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │               TypeScript + Tailwind CSS HTML Canvas               │  │
│  │                                                                   │  │
│  │   [Tab 1: Scan HUD]      [Tab 2: Trade Queue]     [Tab 3: Sheets] │  │
│  │   - Overlay Card         - Micro Transaction Card - Data Grids    │  │
│  │   - Bricked Mod Warnings - Macro Quick Buttons                    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘

```

### Dependency Stack

* **Backend Framework:** `tauri` (v2.x) with native transparent/frameless capabilities.
* **Asynchronous Engine:** `tokio` (Multi-threaded system coordination).
* **Clipboard Management:** `arboard` (Direct native clipboard buffer scraping).
* **System Event Tracking:** `rdev` (Global hotkey registration and simulated OS macro execution).
* **Log Evaluation:** `linemux` (Non-blocking, file-system notification stream matching).
* **Frontend Ecosystem:** TypeScript, Vite, React (or Svelte/Vanilla), styled with a strict high-contrast **Tailwind CSS** scheme.

---

## II. Multi-Phase Production Schedule

---

### Phase 1: Transparent Window Architecture & OS Input Hooks

**Objective:** Spin up the Tauri v2 window abstraction layer configured for frameless transparency, and deploy low-level background threads to intercept inputs.

* **Task 1.1: Window Config & Capabilities Manifest**
* Initialize the Tauri app structure. Modify `tauri.conf.json` and the security capabilities definitions (`src-tauri/capabilities/default.json`) to allow frameless window operations, system-top positioning (`alwaysOnTop: true`), and transparent canvas blending.


* **Task 1.2: Global Hotkey Listener Thread**
* Spawn an independent async worker via `tokio::spawn` utilizing `rdev` to trace system keypress states globally.
* Isolate the `Ctrl + C` combination. When caught inside the game instance, initiate an immediate 20ms micro-delay to let the client finalize the clipboard layout, then dump the buffer contents string using `arboard`.


* **Task 1.3: Asynchronous Client.txt Tailing**
* Deploy a dedicated `linemux` monitoring thread targeting the PoE2 game directory log.
* Bind it to file system updates so it sleeps continuously until the game engine appends chat metadata strings to the disk buffer.



---

### Phase 2: Local Parsing Architecture & Browser Traversal

**Objective:** Isolate item structural modifiers inside Rust memory records and generate valid base64-packed web queries.

* **Task 2.1: Regex Property Splitting**
* Incorporate pre-compiled regular expressions targeting item classes, physical socket layouts, spirit pool limits, and explicit modifier modifier affix brackets.


* **Task 2.2: The URL Compilation Factory**
* Transform the parsed properties struct directly into an associative JSON query matching GGG's trade backend filters.
* Instead of emitting a direct HTTP query that triggers network rate limits, serialize this payload with `serde_json`, compress it, pack it into a Base64 string, and attach it to the official trade URL: `[https://www.pathofexile.com/trade2/search/PoE2_League/](https://www.pathofexile.com/trade2/search/PoE2_League/)`.


* **Task 2.3: Browser Open Despatch**
* Bind a companion hotkey pattern (e.g., `Alt + D`) to fire an OS instruction via the `webbrowser` crate, instantly launching the configured default web browser loaded with your fully calibrated, rate-limit-free trade filter.



---

### Phase 3: Monolithic Automation & Game Macro Integration

**Objective:** Implement live chat transaction tracking and hardware-input simulation routines to serve as a complete standalone replacement app.

* **Task 3.1: Waystone Safety Evaluator (Anti-Brick System)**
* Establish an inline local asset (`banned_mods.json`) keeping record of modifier lines capable of breaking specific build models (e.g., *Reflect*, *No Regen*, *Recovery Throttles*).
* When an item of class `Waystones` or `Maps` is scanned, cross-match the arrays. If an active match occurs, mark a critical warning property inside the item record before passing it upstream.


* **Task 3.2: Chat Whisper Queue Parsing**
* Calibrate the log streaming task with specific regex logic designed to strip incoming transaction variables: `@From <Character>: Hi, I would like to buy your <Item> listed for <Price> in <League>...`.
* Bundle this string info down into an array representing the current live trading queue.


* **Task 3.3: Native Macro Automation Engine**
* Map predictable functional inputs directly onto the user overlay (e.g., UI click nodes or shortcuts: `F5` for Invite, `F6` for Trade, `F7` for Kick).
* When processed, the Rust engine targets the active game window, sends a simulated sequence command: `Enter` -> Text Injection (`/invite <Name>`) -> `Enter` via `rdev` keystroke execution.



---

### Phase 4: TypeScript Overlay Construction & Interaction Handling

**Objective:** Craft a pure black, minimalist web canvas HUD using Tailwind CSS, and hook up interactive click-passthrough states.

* **Task 4.1: High-Contrast Tailwind HUD Framework**
* Set the baseline HTML document styling to transparent canvas levels (`bg-transparent overflow-hidden h-screen w-screen`).
* Design a sleek UI dashboard split across tabs:
* **Tab 1 (Scan Summary):** Jet-black floating card (`bg-black border border-neutral-800`), razor-thin framing, white crisp text, displaying the last scanned stats and vibrant red flashing flags for bricked maps.
* **Tab 2 (Trade Controller):** Compact stack panels summarizing pending buyers with inline clickable macro elements.
* **Tab 3 (Reference Data Matrix):** Clean grid arrays mapping out game mechanics data.




* **Task 4.2: Inter-Process Communication Bridge**
* Implement Tauri listeners (`@tauri-apps/api/event`) in the frontend code to capture real-time state updates dispatched from Rust via `app_handle.emit()`.


* **Task 4.3: Smart Mouse Click Passthrough Mechanics**
* **The Paradox:** If the window takes up the full screen to draw overlays, it will block normal game clicks.
* **The Fix:** The window wrapper uses standard CSS `pointer-events: none` on transparent elements. For structured UI cards, use frontend React handlers (`onMouseEnter` / `onMouseLeave`) to invoke custom Tauri commands that dynamically flip the window's mouse behavior:
* On Hover over card: Invoke `window.set_ignore_cursor_events(false)` (Window becomes interactable; buttons work).
* On Mouse Exit: Invoke `window.set_ignore_cursor_events(true)` (Window becomes invisible to mouse; clicks pass straight to PoE2).





---

### Phase 5: Stress Profiling, Synchronization & Patch 0.5 Readiness

**Objective:** Eliminate memory leaking, test multi-threaded state locks, and implement fuzzy-string safety bounds ahead of the patch update.

* **Task 5.1: Memory Allocations Audit**
* Profile the running binary instance during active play loops to guarantee native memory bounds stay pinned under 40MB without incremental bloating over extended play sessions.


* **Task 5.2: String Variance Resiliency**
* Deploy the `fuzzy-matcher` library over rigid text indexing across item string parameters. This ensures the app can elegantly process slight structural or spelling changes introduced during the *Return of the Ancients* league deployment without crashing.



---

## III. Production Gantt Execution Chart

| Engineering Milestone | Day 1 | Day 2 | Day 3 | Day 4 | Day 5-7 (Buffer) |
| --- | --- | --- | --- | --- | --- |
| **Phase 1: Tauri v2 Core Setup & Input Hooks** | █▓▒░ |  |  |  |  |
| **Phase 2: Regex Mod Parsers & URL Factories** |  | █▓▒░ |  |  |  |
| **Phase 3: Map Safety Profiles & Macro Injectors** |  |  | █▓▒░ |  |  |
| **Phase 4: Tailwind Frontend UI & Passthrough Logic** |  |  |  | █▓▒░ |  |
| **Phase 5: Performance Optimization & Testing** |  |  |  |  | █▓▒░ |

---

## IV. GPT-5.5 Prompt Execution Handbook

Provide these granular functional specification prompts to your GPT-5.5 coding pipeline step-by-step to compile the application modules natively.

### Prompt Module 1: The Asynchronous State Engine & Tauri Bridge

```text
Write a pristine, professional-grade Rust setup module using Tauri v2 and Tokio.
Define a thread-safe state container struct named `AppState` wrapped inside `Arc<Mutex<T>>`.
The state must track:
1. `scanned_item`: An Option containing an Item structure (holding name, rarity, explicit_mods vector).
2. `trade_queue`: A Vec array containing TradeWhisper data (buyer_name, item, price, tab_coordinates).
3. `current_zone`: A String variable indicating the active location.

Inside the Tauri `.setup()` workflow hook, extract the main webview window instance and ensure it runs with global overlay characteristics: window.set_always_on_top(true) and window.set_ignore_cursor_events(true).

Spawn two concurrent asynchronous tasks via tokio::spawn:
- Task A: Monitor global hardware inputs using the `rdev` crate to intercept when Ctrl+C is struck.
- Task B: Continually watch a target 'Client.txt' log path using the `linemux` crate.

Establish clean Tauri emitters that push updates down to the frontend layer cleanly when state fields alter. Use safe error management and avoid redundant dependencies.

```

### Prompt Module 2: Regex Item Tokenizer & Base64 Link Manufacturer

```text
Write a robust Rust utility file designed to tokenize raw Path of Exile 2 copy-paste item buffers.
1. Implement optimized, lazy_static Compiled Regular Expressions to cleanly extract: Rarity, Item Class, Spirit limits, Sockets, and lines belonging to Explicit Modifiers.
2. Formulate a mapping method that accepts the collected Explicit Modifiers array and structures it directly into a nested JSON structure that strictly reflects the official GGG Trade Search API parameters.
3. Take this structured search JSON payload, serialize it with `serde_json`, convert it into an encrypted/standard Base64 string blob, and append it onto the baseline trade search domain string: 'https://www.pathofexile.com/trade2/search/PoE2_League/'.
4. Write an execution wrapper that consumes this finished link string and uses the `webbrowser` library to invoke an OS system call to open the target query line in the user's default browser window.

```

### Prompt Module 3: Map Hazard Checker & Macro Command Dispatcher

```text
Write a dedicated Rust feature module to process in-game hazards and trade macros:

1. Create a function named `check_waystone_hazards` that ingests a vector array of scanned modifier strings. Have it read an external JSON file named `banned_mods.json` that stores an array of user-defined hazard strings. Evaluate the modifiers list against the banned data array using the `fuzzy-matcher` crate. Return a clean list of any build-bricking modifiers identified.

2. Create a log parser function named `evaluate_whisper_string` that extracts properties from chat records. Use a structured regex sequence to identify patterns matching: '@From CharacterName: Hi, I would like to buy your ItemName listed for Price in League (stash tab "TabName"; position: left X, top Y)'. Extract all matching elements into a clean, structured object.

3. Implement an automation function that uses the `rdev` crate to send macro keys to the game. When triggered, it must safely programmatically activate the client chat command line, print '/invite <TargetCharacter>', and send a confirmation Enter keystroke cleanly.

```

### Prompt Module 4: Tailwind CSS Canvas & Click-Passthrough Interceptor

```text
Write a highly optimized React/TypeScript frontend component layout designed for a transparent Tauri v2 window overlay dashboard.
The document background must remain fully transparent with overflow settings disabled (`bg-transparent h-screen w-screen overflow-hidden select-none`).

Create a sleek, clean, high-contrast UI design using Tailwind CSS (pure black backgrounds `#000000`, thin `#262626` gray framing borders, sharp monospace white text layouts). Build a multi-tab panel controller accessible using keys (1, 2, 3) or click targets:
- Panel 1 (Scan HUD): Formats and presents the last scanned item details, flashing an assertive, bright red warning if any map hazards are detected.
- Panel 2 (Log Ledger): Lists active incoming buyers in a clean queue stack, featuring fast action execution buttons ("Invite", "Trade", "Kick") that talk back to Rust commands using `@tauri-apps/api/core/invoke`.
- Panel 3 (Data Tables): Shows fixed text grid representations of game mechanical references.

Crucial Input Handling Logic: On the container divs for interactable UI cards, attach `onMouseEnter` and `onMouseLeave` handlers. When the cursor enters a UI card, call a Tauri backend invoke command that triggers `window.set_ignore_cursor_events(false)` so clicks register on the buttons. When the cursor leaves the card, call an invoke command that triggers `window.set_ignore_cursor_events(true)` so the mouse passes through the transparent zones straight back to the game client smoothly.

```

---

## V. Critical Production Edge-Cases (Don't Get Tripped Up)

1. **The Ghost-Click Glitch:** On some operating systems, a transparent window with standard alpha layers (`rgba(0,0,0,0)`) will still intercept and consume clicks instead of passing them straight to the game engine underneath. If your click-passthrough drops frames, apply a microscopic alpha fill to your master layout container style in CSS: `background-color: rgba(0, 0, 0, 0.01);`. This tricks the desktop compositor window server into managing precision cursor targeting flawlessly.
2. **The Linux/Steam Deck Factor:** Unlike Windows, many Linux window managers handle transparency and `alwaysOnTop` differently under Wayland. If you plan to test or use this on a Steam Deck, stick to Tauri v2's native window abstraction APIs instead of calling Windows-specific `winapi` kernel shortcuts inside your Rust loops.

---

### Upcoming Content Integration

As you dial in your parsing engines, keep an eye on the newly announced mechanics dropping with the *Return of the Ancients* 0.5.0 patch on May 29th. You'll want to add its brand new defensive stat pool (**Runic Ward**), the **Runes of Aldur** base components, and the new **Spirit Walker** / **Martial Artist** ascendancies directly into your `data.json` reference files and cheat sheets.

To see exactly what those item structures and encounters will look like ahead of your build sprint, check out the cinematic teaser breakdown: [Path of Exile 2: Return of the Ancients Teaser Trailer](https://www.youtube.com/watch?v=ntlE8ET1wtM). This video tracks the structural shifts coming to the endgame Atlas system, giving you a clear window into how to format your map mod analyzer before the patch notes drop on May 21st.
