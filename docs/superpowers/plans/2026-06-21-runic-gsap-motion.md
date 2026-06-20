# Reliquary Runic GSAP Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lightweight GSAP motion runtime, cards-and-tabs cursor aura, cancellable tab choreography, and bounded feature reveals to the isolated Nordic Runic Reliquary app.

**Architecture:** `motion-runtime.ts` is the only module that imports GSAP and owns active tweens, pointer tracking, reduced-motion behavior, and cleanup. Existing render code calls named adapter methods after DOM updates; CSS owns the aura material and retains ambient, warning, and compact-line animations.

**Tech Stack:** TypeScript, GSAP core, CSS compositor layers, Vite, Vitest, Tauri 2.

---

### Task 1: Motion policy and dependency

**Files:**
- Modify: `NordicRunicExperimental/app/package.json`
- Modify: `NordicRunicExperimental/app/package-lock.json`
- Create: `NordicRunicExperimental/app/src/motion-runtime.ts`
- Create: `NordicRunicExperimental/app/src/motion-runtime.test.ts`

- [ ] **Step 1: Write policy tests**

Test that `motionPolicy()` disables all GSAP behavior for reduced motion and listing-preview windows, disables pointer tracking in compact mode, and returns distinct card/tab aura profiles.

```ts
expect(motionPolicy({ reducedMotion: true, compactMode: false, previewWindow: false }).panel).toBe(false);
expect(motionPolicy({ reducedMotion: false, compactMode: true, previewWindow: false }).aura).toBe(false);
expect(cursorAuraProfile("tab").scale).toBeLessThan(cursorAuraProfile("card").scale);
```

- [ ] **Step 2: Verify the tests fail**

Run `npm run test -- motion-runtime.test.ts` and expect a missing-module failure.

- [ ] **Step 3: Install GSAP core and implement the pure policy exports**

Run `npm install gsap@3.15.0 --save`. Export `motionPolicy`, `cursorAuraProfile`, and the `CursorAuraKind` type before adding DOM behavior.

- [ ] **Step 4: Verify the policy tests pass**

Run `npm run test -- motion-runtime.test.ts` and expect all policy tests to pass.

### Task 2: Cards-and-tabs cursor aura

**Files:**
- Modify: `NordicRunicExperimental/app/src/motion-runtime.ts`
- Modify: `NordicRunicExperimental/app/src/main.ts`
- Modify: `NordicRunicExperimental/app/src/styles.css`
- Test: `NordicRunicExperimental/app/src/motion-runtime.test.ts`

- [ ] **Step 1: Add one aura layer to the full overlay shell**

Render `<div class="cursor-aura" data-cursor-aura aria-hidden="true"></div>` inside `.hud-card`, outside the dynamic `.panel` so panel replacement cannot destroy it.

- [ ] **Step 2: Implement scoped pointer tracking**

Create `createReliquaryMotionRuntime(root, aura)` with cached `gsap.quickTo` setters for `x`, `y`, `scale`, and `opacity`. Use delegated `pointermove`, `pointerleave`, and window `blur` listeners. Resolve targets through one exported `CURSOR_AURA_TARGET_SELECTOR`; never call application `render()` from these listeners.

- [ ] **Step 3: Style the compositor layer**

Use a fixed `150px` radial-gradient element with `pointer-events: none`, `will-change: transform, opacity`, and the current accent hue. Card mode remains subtle; tab mode uses the smaller/brighter runtime profile. Suppress the aura over warning and destructive surfaces.

- [ ] **Step 4: Verify reduced motion and compact mode**

Expose `setContext({ compactMode })` on the runtime. Confirm the aura immediately hides when compact mode starts and never initializes in listing-preview windows.

### Task 3: Replace CSS-only tab choreography

**Files:**
- Modify: `NordicRunicExperimental/app/src/motion-runtime.ts`
- Modify: `NordicRunicExperimental/app/src/main.ts`
- Modify: `NordicRunicExperimental/app/src/styles.css`
- Modify: `NordicRunicExperimental/app/src/ui-motion.test.ts`

- [ ] **Step 1: Add a cancellable panel transition**

Implement `animatePanelEntry(panel, direction, activeTabButton)` using one named GSAP timeline. Kill the prior panel timeline and clear animated properties before starting the next. Use `opacity`, `x`, `y`, and `scale`; cap the sequence at `220ms`.

- [ ] **Step 2: Add the rune-to-panel sweep**

Reuse `.panel::before` as the visual sweep surface, toggled through a short-lived class while GSAP coordinates panel and active-rune timing. Do not animate the tab hitbox.

- [ ] **Step 3: Remove timer-based transition ownership**

Replace `panelTransitionTimer`, `commitPanelTransition()`, and `clearPanelTransition()` with runtime calls. Preserve `shouldAnimateTabTransition()` and `tabMotionDirection()` as pure navigation policy.

- [ ] **Step 4: Verify rapid navigation**

Add a testable timeline-key policy and manually switch tabs rapidly. The final tab must remain visible with no stale class or transform.

### Task 4: Bounded feature arrival sequences

**Files:**
- Modify: `NordicRunicExperimental/app/src/motion-runtime.ts`
- Modify: `NordicRunicExperimental/app/src/main.ts`
- Test: `NordicRunicExperimental/app/src/motion-runtime.test.ts`

- [ ] **Step 1: Define per-tab reveal selectors**

Export a fixed selector map for Profile, Scan, Trade, Campaign, Atlas, Data, Temple, and Settings. Each map targets at most six first-level sections and never Path of Exile item art.

- [ ] **Step 2: Animate only on primary tab changes**

After the panel HTML is committed, call `animateFeatureArrival(activeTab, panel)`. Use a `20-28ms` stagger and skip same-tab data rerenders so timers and market polling do not repeatedly animate.

- [ ] **Step 3: Preserve existing state feedback**

Keep timestamp-gated CSS feedback for scan results, OCR, market rows, warnings, and line mode. GSAP does not replace those hot-path acknowledgements in this pass.

### Task 5: Verification and isolated build

**Files:**
- Modify: `NordicRunicExperimental/README.md`

- [ ] **Step 1: Document the motion runtime boundary**

Document that GSAP is isolated to full-overlay presentation, while line mode, hotkeys, OCR, clipboard listeners, and PoE assets remain unaffected.

- [ ] **Step 2: Run verification**

Run `npm run test` and `npm run build`. Expect every Vitest file and TypeScript/Vite build to pass.

- [ ] **Step 3: Build the experimental executable**

Stop only the isolated `reliquary-runic-experiment.exe` if Windows locks it, then run `npm run tauri -- build --no-bundle`.

- [ ] **Step 4: Refresh Graphify**

Run `graphify update .` from `C:\Projects\Kalandra` and verify the new motion module is indexed.
