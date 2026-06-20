# Runic Scan And Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the initial Scan state fill its window and introduce one accessible runic medallion language for the Discord switch, Settings sliders, and major button hover traces.

**Architecture:** Extend the existing `motion-runtime.ts` adapter with pure motion-profile helpers and delegated control animation. Keep semantic checkbox/range inputs in `main.ts`; CSS owns final layout and forged surfaces while GSAP only presents state transitions. Scan receives a tab-specific entry profile so it fades and settles vertically without crossing the floating spine.

**Tech Stack:** TypeScript, Vitest, GSAP core, CSS, Tauri 2, Vite.

---

## File Structure

- Modify `NordicRunicExperimental/app/src/motion-runtime.ts`: add Scan entry profiles, toggle animation, and delegated button-trace interaction.
- Modify `NordicRunicExperimental/app/src/motion-runtime.test.ts`: verify profiles, eligibility, and reduced-motion behavior.
- Modify `NordicRunicExperimental/app/src/main.ts`: supply the active tab to panel motion and render accessible medallion control markup.
- Modify `NordicRunicExperimental/app/src/styles.css`: establish full-height Scan geometry and semantic control layout.
- Modify `NordicRunicExperimental/app/src/runic-theme.css`: apply forged medallion, slider, and button-trace visuals.
- Create `NordicRunicExperimental/app/public/runic/decor/button-trace.svg`: scalable center-reveal trace used without raster stretching.

### Task 1: Define Testable Motion Policies

**Files:**
- Modify: `NordicRunicExperimental/app/src/motion-runtime.test.ts`
- Modify: `NordicRunicExperimental/app/src/motion-runtime.ts`

- [ ] **Step 1: Add failing tests for Scan entry and button eligibility**

Add imports and tests equivalent to:

```ts
import {
  buttonTraceEligible,
  panelEntryProfile,
  toggleMotionProfile,
} from "./motion-runtime";

it("keeps Scan entry clear of the floating spine", () => {
  expect(panelEntryProfile("scan", "forward")).toMatchObject({ x: 0, y: 4, scale: 1 });
  expect(panelEntryProfile("trade", "forward").x).toBeGreaterThan(0);
});

it("provides deterministic toggle endpoints", () => {
  expect(toggleMotionProfile(false, 54)).toEqual({ fromX: 54, toX: 0, fromRotation: 120, toRotation: 0 });
  expect(toggleMotionProfile(true, 54)).toEqual({ fromX: 0, toX: 54, fromRotation: 0, toRotation: 120 });
});

it("limits runic traces to major non-destructive text buttons", () => {
  expect(buttonTraceEligible("action-button", false)).toBe(true);
  expect(buttonTraceEligible("action-button danger", false)).toBe(false);
  expect(buttonTraceEligible("chrome-button", true)).toBe(false);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```powershell
Set-Location NordicRunicExperimental/app
npm test -- motion-runtime.test.ts
```

Expected: FAIL because the new helpers are not exported.

- [ ] **Step 3: Implement pure profiles**

Add:

```ts
export type PanelEntryProfile = {
  autoAlpha: number;
  x: number;
  y: number;
  scale: number;
};

export function panelEntryProfile(tab: MotionTabId, direction: TabMotionDirection): PanelEntryProfile {
  return tab === "scan"
    ? { autoAlpha: 0.82, x: 0, y: 4, scale: 1 }
    : { autoAlpha: 0.82, x: panelEntryOffset(direction), y: 4, scale: 0.995 };
}

export function toggleMotionProfile(checked: boolean, travel: number) {
  return checked
    ? { fromX: 0, toX: travel, fromRotation: 0, toRotation: 120 }
    : { fromX: travel, toX: 0, fromRotation: 120, toRotation: 0 };
}

export function buttonTraceEligible(className: string, iconOnly: boolean) {
  const blocked = /(?:danger|destructive|tab-button|row-action|market-period)/.test(className);
  return !iconOnly && !blocked && /(?:action-button|chrome-button|atlas-secondary-action|profile-import-button)/.test(className);
}
```

- [ ] **Step 4: Run focused tests**

Run `npm test -- motion-runtime.test.ts`.

Expected: PASS.

### Task 2: Correct Scan Geometry And Entry Motion

**Files:**
- Modify: `NordicRunicExperimental/app/src/main.ts:1520-1532`
- Modify: `NordicRunicExperimental/app/src/main.ts:2134-2141`
- Modify: `NordicRunicExperimental/app/src/motion-runtime.ts`
- Modify: `NordicRunicExperimental/app/src/styles.css:2704-2752`
- Modify: `NordicRunicExperimental/app/src/runic-theme.css`

- [ ] **Step 1: Pass the active tab into panel animation**

Change the runtime signature and call to:

```ts
animatePanelEntry: (
  tab: MotionTabId,
  panel: HTMLElement,
  direction: TabMotionDirection,
  activeTabButton: HTMLElement | null,
) => void;

motionRuntime?.animatePanelEntry(activeTab as MotionTabId, panelElement, direction, activeTabButton);
```

Use `panelEntryProfile(tab, direction)` as the `fromTo` starting state.

- [ ] **Step 2: Give the waiting copy a stable content wrapper**

Render:

```html
<div class="empty-state scan-waiting-state">
  <div class="scan-waiting-copy">
    <p class="section-label">Waiting for clipboard scan</p>
    <p>Hover an item in PoE2 and press ...</p>
  </div>
</div>
```

- [ ] **Step 3: Make the waiting surface own the full usable panel**

Apply layout rules equivalent to:

```css
.panel[data-tab="scan"] {
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  min-height: calc(100vh - 70px);
}

.panel[data-tab="scan"] .scan-waiting-state {
  align-self: stretch;
  width: 100%;
  min-height: 100%;
  box-sizing: border-box;
  padding: clamp(52px, 16vh, 96px) 40px 40px 58px;
  align-content: start;
}

.scan-waiting-copy {
  max-width: 470px;
}
```

The left padding reserves the spine intrusion. Remove any nested frame pseudo-elements from the copy wrapper; the waiting surface remains the sole border owner.

- [ ] **Step 4: Run the focused motion test and production build**

Run:

```powershell
npm test -- motion-runtime.test.ts
npm run build
```

Expected: PASS and successful Vite build.

### Task 3: Build The Accessible Sliding Medallion

**Files:**
- Modify: `NordicRunicExperimental/app/src/main.ts:4725-4737`
- Modify: `NordicRunicExperimental/app/src/motion-runtime.ts`
- Modify: `NordicRunicExperimental/app/src/styles.css:1820-1870`
- Modify: `NordicRunicExperimental/app/src/runic-theme.css`
- Test: `NordicRunicExperimental/app/src/motion-runtime.test.ts`

- [ ] **Step 1: Replace the bare checkbox presentation with semantic wrapper markup**

Keep the native input and data-setting contract:

```html
<span class="runic-toggle" data-runic-toggle>
  <input
    class="runic-toggle-input"
    data-runic-toggle-input
    data-setting="discordPresenceEnabled"
    type="checkbox"
    aria-label="Enable Discord Rich Presence"
  />
  <span class="runic-toggle-track" aria-hidden="true">
    <span class="runic-toggle-label runic-toggle-off">Off</span>
    <span class="runic-toggle-label runic-toggle-on">On</span>
    <span class="runic-toggle-medallion"><span class="runic-toggle-rune"></span></span>
  </span>
</span>
```

- [ ] **Step 2: Add final-state CSS and native focus behavior**

Use a fixed forged track and one medallion:

```css
.runic-toggle-track {
  --runic-toggle-travel: 54px;
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: 92px;
  height: 32px;
}

.runic-toggle-input:checked + .runic-toggle-track .runic-toggle-medallion {
  transform: translateX(var(--runic-toggle-travel));
}

.runic-toggle-input:focus-visible + .runic-toggle-track {
  outline: 2px solid var(--runic-accent);
  outline-offset: 3px;
}
```

Use `/runic/runes/elder-futhark/sowilo.svg` as the medallion's masked center rune. Do not alter any game-owned icon.

- [ ] **Step 3: Add delegated GSAP toggle animation**

Inside the motion runtime, listen for `change` from `[data-runic-toggle-input]`. Resolve the track and medallion, read the CSS travel value, kill the prior tween, then run:

```ts
const profile = toggleMotionProfile(input.checked, travel);
gsap.fromTo(
  medallion,
  { x: profile.fromX, rotation: profile.fromRotation },
  {
    x: profile.toX,
    rotation: profile.toRotation,
    duration: 0.18,
    ease: "power3.out",
    clearProps: "transform",
  },
);
```

Animate label opacity and one short box-shadow pulse in the same timeline. Under reduced motion, skip the timeline and let checked-state CSS present the final state.

- [ ] **Step 4: Verify persistence and motion tests**

Run `npm test -- motion-runtime.test.ts` and `npm run build`.

Expected: PASS; existing `data-setting="discordPresenceEnabled"` change handling remains intact.

### Task 4: Reuse The Medallion On Native Sliders

**Files:**
- Modify: `NordicRunicExperimental/app/src/styles.css:1810-1818`
- Modify: `NordicRunicExperimental/app/src/runic-theme.css`

- [ ] **Step 1: Style native tracks without replacing input behavior**

Define explicit WebView2 range tracks using accent-aware gradients and retain `width: 100%`.

- [ ] **Step 2: Style native thumbs as smaller medallions**

Apply equivalent WebKit and Firefox rules:

```css
.settings-field input[type="range"]::-webkit-slider-thumb {
  appearance: none;
  width: 22px;
  height: 22px;
  border: 1px solid var(--runic-bronze-bright);
  border-radius: 50%;
  background:
    url("/runic/runes/elder-futhark/sowilo.svg") center / 56% no-repeat,
    radial-gradient(circle, var(--runic-accent-soft), #080a0a 68%);
  box-shadow: 0 0 0 2px #050606, 0 0 10px var(--runic-accent-soft);
}
```

Add a restrained active/focus rotation or scale transition. Do not add a JS value proxy.

- [ ] **Step 3: Run the full TypeScript test and build suite**

Run `npm test` and `npm run build`.

Expected: all existing tests pass and no TypeScript errors appear.

### Task 5: Add Delegated Button Traces

**Files:**
- Create: `NordicRunicExperimental/app/public/runic/decor/button-trace.svg`
- Modify: `NordicRunicExperimental/app/src/motion-runtime.ts`
- Modify: `NordicRunicExperimental/app/src/runic-theme.css`
- Test: `NordicRunicExperimental/app/src/motion-runtime.test.ts`

- [ ] **Step 1: Create a transparent vector trace**

Create a `96x8` SVG containing one centered, shallow angular wave with a subtle central rune diamond. Use `currentColor`-compatible white geometry so CSS masking can apply the user accent.

- [ ] **Step 2: Add the non-layout button pseudo-element**

Eligible buttons receive:

```css
[data-runic-trace]::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: 3px;
  width: min(72%, 96px);
  height: 8px;
  transform: translateX(-50%);
  clip-path: inset(0 var(--runic-trace-cut, 50%) 0 var(--runic-trace-cut, 50%));
  background: hsl(var(--accent-hue) var(--accent-sat) 68% / 0.82);
  mask: url("/runic/decor/button-trace.svg") center / contain no-repeat;
  pointer-events: none;
}
```

This reveals rather than stretches the vector.

- [ ] **Step 3: Delegate hover and focus motion**

On pointer/focus entry, mark eligible controls with `data-runic-trace` and animate:

```ts
gsap.to(button, {
  "--runic-trace-cut": "0%",
  duration: 0.16,
  ease: "power2.out",
  overwrite: true,
});
```

On leave/blur, animate back to `50%` over `0.11s`. Skip icon-only and blocked semantic controls. Remove listeners and kill button tweens in `destroy()`.

- [ ] **Step 4: Run focused and full tests**

Run:

```powershell
npm test -- motion-runtime.test.ts
npm test
npm run build
```

Expected: all tests and build pass.

### Task 6: Verify, Update Graph, And Rebuild The Executable

**Files:**
- Modify: `graphify-out/*` through the graph update command.

- [ ] **Step 1: Inspect the isolated diff**

Run `git diff --check` and confirm no production `src/` or `src-tauri/` files changed.

- [ ] **Step 2: Run complete verification**

Run:

```powershell
Set-Location NordicRunicExperimental/app
npm test
npm run build
npm audit --omit=dev
```

Expected: all tests pass, build succeeds, and audit reports zero known production vulnerabilities.

- [ ] **Step 3: Refresh the knowledge graph**

Run from the repository root:

```powershell
graphify update .
```

Expected: graph update completes successfully.

- [ ] **Step 4: Build the isolated Tauri executable**

Run:

```powershell
Set-Location NordicRunicExperimental/app
npm run tauri:build
```

Expected executable:

`NordicRunicExperimental/app/src-tauri/target/release/reliquary-runic-experiment.exe`

- [ ] **Step 5: Report visual review points**

Confirm the Scan waiting surface, Discord toggle, three sliders, and representative Reset/Refresh/Import buttons are ready for in-game inspection. Do not merge or push this experimental branch without explicit user direction.
