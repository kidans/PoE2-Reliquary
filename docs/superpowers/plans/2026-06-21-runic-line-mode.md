# Runic Line Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply an etched Nordic runic frame to compact line mode while preserving its exact `560x40px` collapsed footprint and fixing premature truncation and vertical alignment outside endgame mapping.

**Architecture:** Keep all compact data and state logic unchanged. Add three line-specific vector assets, two inert end-cap elements, and compact-only CSS that tiles rails rather than stretching art. Preserve the existing CSS-only feedback path and measured campaign expansion.

**Tech Stack:** TypeScript, Vitest, CSS, SVG, Rust/Tauri 2, Vite.

---

## File Structure

- Create `NordicRunicExperimental/app/public/runic/line/rail.svg`: tileable etched rail segment.
- Create `NordicRunicExperimental/app/public/runic/line/endcap-left.svg`: compact left bindrune cap.
- Create `NordicRunicExperimental/app/public/runic/line/endcap-right.svg`: mirrored right cap.
- Create `NordicRunicExperimental/app/src/runic-line-mode.test.ts`: source-contract tests for assets, 40px sizing, CSS-only motion, and non-map width behavior.
- Modify `NordicRunicExperimental/app/src/main.ts`: add inert end-cap elements to compact markup.
- Modify `NordicRunicExperimental/app/src/styles.css`: correct non-map sizing, centering, and campaign checklist attachment.
- Modify `NordicRunicExperimental/app/src/runic-theme.css`: own compact runic surface, rails, end caps, severity gradient, and reduced-motion fallback.

### Task 1: Lock Compact Contracts With Tests

**Files:**
- Create: `NordicRunicExperimental/app/src/runic-line-mode.test.ts`

- [ ] **Step 1: Write failing source-contract tests**

Create tests that read the isolated source files and assert:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

describe("runic line mode contracts", () => {
  it("keeps the native compact window at 560 by 40", () => {
    const rust = source("../src-tauri/src/lib.rs");
    expect(rust).toContain("const COMPACT_WINDOW_WIDTH: f64 = 560.0;");
    expect(rust).toContain("const COMPACT_WINDOW_HEIGHT: f64 = 40.0;");
  });

  it("ships line-specific vector chrome", () => {
    expect(source("../public/runic/line/rail.svg")).toContain("<svg");
    expect(source("../public/runic/line/endcap-left.svg")).toContain("<svg");
    expect(source("../public/runic/line/endcap-right.svg")).toContain("<svg");
  });

  it("reserves truncation for detailed mapping", () => {
    const css = source("./styles.css");
    expect(css).toContain('.compact-strip:not(.is-mapping) .compact-primary');
    expect(css).toContain('.compact-strip.is-mapping.has-map-detail .compact-primary');
  });

  it("keeps compact presentation out of the GSAP runtime", () => {
    const runtime = source("./motion-runtime.ts");
    expect(runtime).toContain("const enabled = !context.reducedMotion && !context.previewWindow && !context.compactMode");
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run `npm test -- runic-line-mode.test.ts` from `NordicRunicExperimental/app`.

Expected: FAIL because line assets and selectors do not exist.

### Task 2: Create Non-Stretched Line Chrome

**Files:**
- Create: `NordicRunicExperimental/app/public/runic/line/rail.svg`
- Create: `NordicRunicExperimental/app/public/runic/line/endcap-left.svg`
- Create: `NordicRunicExperimental/app/public/runic/line/endcap-right.svg`

- [ ] **Step 1: Create the tileable rail**

Use a `64x4` SVG with horizontal bronze lines and a centered diamond/rune notch. The left and right edges must join at the same vertical coordinates so `repeat-x` is seamless.

- [ ] **Step 2: Create mirrored compact end caps**

Use `14x32` SVGs with aged-bronze angular outlines and one original Reliquary bindrune. Keep backgrounds transparent and mirror geometry rather than stretching one raster asset.

- [ ] **Step 3: Run the focused test**

Run `npm test -- runic-line-mode.test.ts`.

Expected: asset checks pass; selector checks remain failing until Tasks 3-4.

### Task 3: Add End-Cap Markup Without Changing State

**Files:**
- Modify: `NordicRunicExperimental/app/src/main.ts:1231-1241`

- [ ] **Step 1: Add inert decorative elements**

Inside `.compact-strip`, before `.compact-primary`, add:

```html
<span class="compact-runic-endcap compact-runic-endcap-left" aria-hidden="true"></span>
<span class="compact-runic-endcap compact-runic-endcap-right" aria-hidden="true"></span>
```

Do not add data attributes, handlers, or game icons.

- [ ] **Step 2: Run the TypeScript build**

Run `npm run build`.

Expected: successful TypeScript and Vite build.

### Task 4: Fix Centering And Truncation Ownership

**Files:**
- Modify: `NordicRunicExperimental/app/src/styles.css:400-745`
- Modify: `NordicRunicExperimental/app/src/styles.css:5441-5578`

- [ ] **Step 1: Let non-map content consume the available lane**

Add compact-only rules equivalent to:

```css
.compact-strip:not(.is-mapping) .compact-primary,
.compact-strip.is-mapping:not(.has-map-detail) .compact-primary {
  flex: 1 1 auto;
  display: grid;
  align-content: center;
  min-width: 0;
  max-width: none;
  height: 100%;
  padding-right: 4px;
}

.compact-strip:not(.is-mapping) .compact-primary :is(span, strong),
.compact-strip.is-mapping:not(.has-map-detail) .compact-primary :is(span, strong) {
  text-overflow: clip;
}
```

Detailed map mode retains the existing constrained grid and ellipsis behavior.

- [ ] **Step 2: Correct campaign alignment**

Make the campaign primary block span the available width minus the Open action, vertically center its two lines, and reserve right padding for the action. Keep marquee only for genuinely long campaign titles.

- [ ] **Step 3: Keep campaign expansion attached**

Give `.compact-checklist.is-expanded` a forged continuation background, bronze side/bottom edge, and no second outer frame. Ensure collapse returns the measured strip height to `40px`.

- [ ] **Step 4: Run the focused test and build**

Run:

```powershell
npm test -- runic-line-mode.test.ts
npm run build
```

Expected: selector contracts pass and build succeeds.

### Task 5: Apply The Etched Runic Rail Theme

**Files:**
- Modify: `NordicRunicExperimental/app/src/runic-theme.css`

- [ ] **Step 1: Tile the rail without stretching**

Apply `/runic/line/rail.svg` as separate top and bottom `repeat-x` background layers on `.compact-strip`, followed by the existing severity and forged-metal layers.

- [ ] **Step 2: Position end caps inside the frame**

Use absolute `14x32px` end caps at the left and right edges. Keep them behind text and Open, pointer-inert, and neutral bronze. User hue may add only a restrained drop shadow.

- [ ] **Step 3: Preserve semantic indicators and action shape**

Keep indicator pills and Open rounded. Restyle Open as a compact forged action with bronze structure and severity-adjacent hover/focus glow. Suppress full-app GSAP button traces inside `.hud-card.is-compact`.

- [ ] **Step 4: Keep severity on the right edge**

Retain `.compact-strip::after` as the right-side severity gradient. Do not color the entire line. Risk reason remains the second-row etched channel in map-detail mode.

- [ ] **Step 5: Add reduced-motion compact fallbacks**

Inside `@media (prefers-reduced-motion: reduce)`, disable compact pulse, sweep, chip arrival, risk arrival, timer glow, and marquee while retaining final opacity and color.

- [ ] **Step 6: Run the complete frontend suite**

Run `npm test` and `npm run build`.

Expected: all tests pass and production frontend builds.

### Task 6: Verify Rust, Graph, And Packaging

**Files:**
- Update: `graphify-out/*` through `graphify update .`

- [ ] **Step 1: Verify Rust behavior remains unchanged**

Run `cargo test` from `NordicRunicExperimental/app/src-tauri`.

Expected: all Rust tests pass; `COMPACT_WINDOW_WIDTH` remains `560.0` and `COMPACT_WINDOW_HEIGHT` remains `40.0`.

- [ ] **Step 2: Verify source hygiene**

Run `git diff --check` and confirm no production `src/` or `src-tauri/` paths outside `NordicRunicExperimental` changed.

- [ ] **Step 3: Update the knowledge graph**

Run `graphify update .` from the repository root.

- [ ] **Step 4: Build and restart the isolated executable**

Close only the running `reliquary-runic-experiment.exe`, then run `npm run tauri:build` from `NordicRunicExperimental/app`.

Expected executable:

`NordicRunicExperimental/app/src-tauri/target/release/reliquary-runic-experiment.exe`

- [ ] **Step 5: Hold branch for visual approval**

Restart the isolated executable. Do not merge or push until the user confirms line-mode appearance and behavior.
