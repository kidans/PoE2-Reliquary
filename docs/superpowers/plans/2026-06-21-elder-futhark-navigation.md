# Elder Futhark Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a documented Elder Futhark SVG library and replace Reliquary's eight live floating-spine icons with unique phonetic bindrunes.

**Architecture:** A deterministic Node generator owns canonical rune geometry and emits canonical, A-Z alias, and tab-bindrune SVG files plus a manifest. The frontend imports a small typed tab asset map and renders each monochrome SVG as a CSS mask, preserving current hue and interaction behavior without embedding a rune font.

**Tech Stack:** TypeScript, Vite, Vitest, Node.js generator, SVG, CSS masks, Tauri 2.

---

### Task 1: Add the typed tab asset contract

**Files:**
- Create: `NordicRunicExperimental/app/src/rune-assets.ts`
- Test: `NordicRunicExperimental/app/src/rune-assets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { TAB_RUNE_ASSETS } from "./rune-assets";

describe("TAB_RUNE_ASSETS", () => {
  it("maps every tab to a unique phonetic bindrune", () => {
    expect(Object.keys(TAB_RUNE_ASSETS)).toEqual([
      "profile", "scan", "trade", "campaign", "atlas", "data", "temple", "settings",
    ]);
    expect(new Set(Object.values(TAB_RUNE_ASSETS).map((entry) => entry.pair)).size).toBe(8);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm run test -- rune-assets.test.ts`

Expected: FAIL because `rune-assets.ts` does not exist.

- [ ] **Step 3: Add the typed map**

```ts
export const TAB_RUNE_ASSETS = {
  profile: { pair: "PR", url: "/runic/runes/tabs/profile-pr.svg" },
  scan: { pair: "SK", url: "/runic/runes/tabs/scan-sk.svg" },
  trade: { pair: "TR", url: "/runic/runes/tabs/trade-tr.svg" },
  campaign: { pair: "KM", url: "/runic/runes/tabs/campaign-km.svg" },
  atlas: { pair: "AT", url: "/runic/runes/tabs/atlas-at.svg" },
  data: { pair: "DT", url: "/runic/runes/tabs/data-dt.svg" },
  temple: { pair: "TM", url: "/runic/runes/tabs/temple-tm.svg" },
  settings: { pair: "ST", url: "/runic/runes/tabs/settings-st.svg" },
} as const;
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npm run test -- rune-assets.test.ts`

Expected: PASS.

### Task 2: Generate canonical, A-Z, and bindrune SVG assets

**Files:**
- Create: `NordicRunicExperimental/tools/generate-rune-assets.mjs`
- Create: `NordicRunicExperimental/app/public/runic/runes/manifest.json`
- Generate: `NordicRunicExperimental/app/public/runic/runes/elder-futhark/*.svg`
- Generate: `NordicRunicExperimental/app/public/runic/runes/letters/*.svg`
- Generate: `NordicRunicExperimental/app/public/runic/runes/tabs/*.svg`

- [ ] **Step 1: Define canonical geometry as reusable line segments**

Use a `24 24` viewBox and emit paths with `stroke="black"`, `stroke-width="2"`, `stroke-linecap="square"`, and `stroke-linejoin="miter"`. Keep the SVG free of scripts, fonts, filters, and embedded raster data so it remains safe for CSS masking.

- [ ] **Step 2: Add generator validation**

The generator must throw unless it emits 24 canonical files, 26 letter aliases, and 8 unique tab files. It must also reject SVG output containing `<script`, `<image`, `data:`, or `<text`.

- [ ] **Step 3: Run the generator**

Run: `node ../tools/generate-rune-assets.mjs` from `NordicRunicExperimental/app`.

Expected: summary reports `24 canonical, 26 letters, 8 tabs`.

### Task 3: Wire bindrunes into the live spine

**Files:**
- Modify: `NordicRunicExperimental/app/src/main.ts:1198-1251`
- Modify: `NordicRunicExperimental/app/src/styles.css:1023-1050`
- Modify: `NordicRunicExperimental/app/src/runic-theme.css:254-258`

- [ ] **Step 1: Import `TAB_RUNE_ASSETS` and replace inline glyph paths**

```ts
function renderTabGlyph(tab: TabId) {
  const asset = TAB_RUNE_ASSETS[tab];
  return `<span class="tab-icon tab-rune tab-rune-${tab}" style="--tab-rune: url('${asset.url}')" data-rune-pair="${asset.pair}" aria-hidden="true"></span>`;
}
```

- [ ] **Step 2: Add mask rendering**

```css
.tab-rune {
  background: currentColor;
  -webkit-mask: var(--tab-rune) center / contain no-repeat;
  mask: var(--tab-rune) center / contain no-repeat;
}
```

Remove SVG-only selectors that no longer have live consumers. Keep existing hover glow and reduced-motion animation on `.tab-icon`.

- [ ] **Step 3: Run focused and full tests**

Run: `npm run test -- rune-assets.test.ts`

Run: `npm run test`

Expected: 14 test files pass and the existing suite remains green.

### Task 4: Build and verify the isolated application

**Files:**
- Modify: `NordicRunicExperimental/README.md`

- [ ] **Step 1: Document the generated rune directories and regeneration command**

- [ ] **Step 2: Build the frontend**

Run: `npm run build`

Expected: TypeScript and Vite complete without errors.

- [ ] **Step 3: Build the isolated executable**

Run: `npm run tauri -- build --no-bundle`

Expected executable: `NordicRunicExperimental/app/src-tauri/target/release/reliquary-runic-experiment.exe`.

- [ ] **Step 4: Update Graphify**

Run: `graphify update .`

Expected: graph update completes or reports no topology changes.
