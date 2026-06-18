# Reliquary Nordic Relic UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans if this plan is implemented outside this session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a presentation-ready Nordic relic UI direction for Reliquary inside `NordicRunicExperimental` without touching production app behavior.

**Architecture:** The experiment is a static, dependency-free HTML/CSS/JS presentation kit. It models the future production design as reusable tokens and components first, then shows those components in realistic Reliquary views: scan, trade board, atlas, campaign, temple, profile, settings, tooltip, and line mode.

**Tech Stack:** Static HTML, CSS custom properties, tiny local JavaScript controller, local candidate PNG crops, no external dependencies, no production Tauri code changes.

---

## Design Target

The target references are not simply "Nordic." They are a forged relic interface system:

- blackened iron and carved slate surfaces
- bronze/gold worn edges, used as material rather than flat UI color
- blue rune light as controlled magical accent
- angular corner brackets and modular frame pieces
- iconography as physical relic objects
- red reserved for danger, warning, destructive actions, and severe map risk
- Reliquary usability preserved: compact overlay, readable item text, fast recognition, user hue customization

## Files

- Create: `NordicRunicExperimental/mockups/runic-presentation.html`
  - Full presentation mockup with component samples and realistic Reliquary views.
- Create: `NordicRunicExperimental/mockups/runic-presentation.css`
  - All tokens, frame treatments, line mode, and component states.
- Modify: `NordicRunicExperimental/mockups/README.md`
  - Document the new primary presentation mockup and how to inspect it.
- Modify: `NordicRunicExperimental/notes/DesignDirection.md`
  - Record the updated target direction based on the reference images.

## Non-Negotiable Reliquary Rules

- [ ] Keep item rarity banner colors exact: Common white, Magic light blue, Rare gold, Unique reddish brown.
- [ ] Keep red sacred for warnings and destructive/error states.
- [ ] Keep user hue as an accent layer, not a full theme repaint.
- [ ] Preserve low-glare dark surfaces over PoE2 gameplay.
- [ ] Avoid fake functional runic text. Runes are ornament and structure, not labels.
- [ ] Avoid excessive protruding transparent assets until native transparency limitations are solved.

## Asset Candidate Pipeline

Generated art must be treated as candidate material, not production truth. The workflow is:

1. Generate a small test pack first:
   - ornate corner piece
   - horizontal border strip
   - tab/socket plate
   - active tab state
   - warning button state
   - six navigation icons
2. Save raw outputs under `NordicRunicExperimental/assets/generated-candidates/`.
3. Review candidates at realistic UI sizes: 32px, 48px, 72px, and full panel scale.
4. Reject assets that collapse at small size, drift from the forged relic style, have muddy silhouettes, or overuse red.
5. Promote only cleaned winners into a later production asset folder.
6. Never reference raw generated candidates from production UI.

Recommended asset categories:

- `frames/`: corner pieces, caps, horizontal strips, vertical strips, dividers.
- `buttons/`: default, hover, active, warning, disabled.
- `spine/`: tab plates, socket frames, selected glow overlays.
- `icons/`: scan, trade, atlas, temple, profile, settings, warning, database.
- `textures/`: black iron, carved slate, worn bronze, faint rune etching.

Current candidate source:

- GPT Image 2 atlas sheets live in `NordicRunicExperimental/gptimage/`.
- `tools/extract_gptimage_assets.py` extracts section and micro-icon candidates into `assets/generated-candidates/gptimage-crops/`.
- `assets/generated-candidates/gptimage-crops/contact-sheet.png` is the visual review surface for the extracted candidates.

Transparency policy:

- Default generation should use a flat removable chroma-key background, then local alpha removal.
- Native transparent PNG generation should only be used if chroma-key cleanup fails or the asset has complex edges.
- Every final candidate with transparency must be inspected for fringe, matte halos, and dirty corners.

Review criteria:

- Silhouette works at 32px.
- Detail survives at 48px without becoming noise.
- Accent hue can be layered separately or recolored without destroying the material.
- Red appears only for danger/warning assets.
- Asset looks like part of Reliquary, not a generic fantasy store pack.

## Task 1: Static Presentation Shell

**Files:**
- Create: `NordicRunicExperimental/mockups/runic-presentation.html`
- Create: `NordicRunicExperimental/mockups/runic-presentation.css`

- [x] **Step 1: Create the HTML scaffold**

Use a single page with these sections:

```html
<main class="runic-stage">
  <section class="hero-board">...</section>
  <section class="component-grid">...</section>
  <section class="overlay-demo">...</section>
  <section class="line-mode-demo">...</section>
</main>
```

- [x] **Step 2: Add CSS tokens**

Define the experiment tokens:

```css
:root {
  --accent-hue: 196;
  --danger-hue: 3;
  --relic-bg: oklch(6% 0.012 var(--accent-hue));
  --relic-panel: oklch(9% 0.018 var(--accent-hue) / 0.92);
  --rune: oklch(72% 0.16 var(--accent-hue));
  --danger: oklch(65% 0.22 var(--danger-hue));
  --bronze: oklch(58% 0.07 72);
  --bone: oklch(84% 0.025 75);
}
```

- [x] **Step 3: Implement the frame vocabulary**

Create reusable classes:

```css
.relic-panel
.relic-panel::before
.relic-panel::after
.relic-button
.relic-button.is-active
.rune-socket
.rune-divider
.forged-corner
```

- [x] **Step 4: Verify the page is self-contained**

Run:

```powershell
Select-String -Path NordicRunicExperimental\mockups\runic-presentation.html -Pattern "http://|https://|cdn"
```

Expected: no matches.

## Task 2: Reliquary View Samples

**Files:**
- Modify: `NordicRunicExperimental/mockups/runic-presentation.html`
- Modify: `NordicRunicExperimental/mockups/runic-presentation.css`

- [x] **Step 1: Build the floating spine sample**

Use five forged plates:

```html
<nav class="floating-spine">
  <button class="spine-rune is-active">...</button>
  <button class="spine-rune">...</button>
  <button class="spine-rune">...</button>
  <button class="spine-rune">...</button>
  <button class="spine-rune">...</button>
</nav>
```

- [x] **Step 2: Build the scan overlay sample**

Include title banner, mod rows, tier labels, selected/unselected state, estimated value, and marketplace results.

- [x] **Step 3: Build the trade/settings samples**

Show how the frame system behaves on dense data and controls. Include:

- market board rows with icons
- settings sliders
- toggles
- warning state button

- [x] **Step 4: Build line mode sample**

Use the compact Reliquary line mode information shape:

- map name
- OCR mod count and timer
- rarity, pack size, rare monsters, experience chips
- risk reason
- open button

## Task 3: Documentation Update

**Files:**
- Modify: `NordicRunicExperimental/mockups/README.md`
- Modify: `NordicRunicExperimental/notes/DesignDirection.md`

- [x] **Step 1: Mark `runic-presentation.html` as the primary mockup**

Document that the previous SVG remains a rough visual branch, while this HTML page is the first inspectable implementation direction.

- [x] **Step 2: Record production migration notes**

Call out which parts can move safely to production:

- CSS token layer
- panel frames
- spine visual treatment
- line mode layout
- button states

Call out which parts should wait:

- high-detail raster/icon pack generation
- heavy ornament on scan item text
- protruding alpha assets
- GSAP timelines

## Task 4: Verification

**Files:**
- Test: `NordicRunicExperimental/mockups/runic-presentation.html`
- Test: `NordicRunicExperimental/mockups/runic-presentation.css`

- [x] **Step 1: File existence check**

Run:

```powershell
Test-Path NordicRunicExperimental\mockups\runic-presentation.html
Test-Path NordicRunicExperimental\mockups\runic-presentation.css
```

Expected: both commands return `True`.

- [x] **Step 2: Static dependency check**

Run:

```powershell
Select-String -Path NordicRunicExperimental\mockups\runic-presentation.* -Pattern "http://|https://|cdn"
```

Expected: no matches.

- [x] **Step 3: Design requirement check**

Run:

```powershell
Select-String -Path NordicRunicExperimental\mockups\runic-presentation.css -Pattern "--danger|--rune|--bronze|relic-panel|line-mode|spine-rune"
```

Expected: all token/component names are present.

- [x] **Step 4: Git checkpoint**

Run:

```powershell
git add NordicRunicExperimental
git commit -m "Add Nordic relic presentation mockup"
git push origin codex/runic-identity-experiment
```

Expected: commit succeeds and branch pushes to the private Reliquary repo.

## Presentation Readiness Checklist

- [ ] The page reads as forged relic UI, not generic blue-dark fantasy UI.
- [ ] The UI still looks like Reliquary, not a different product.
- [ ] The user accent hue has a clear role.
- [ ] Warning red is not diluted by decorative red usage.
- [ ] Scan content remains readable at a glance.
- [ ] Line mode remains compact and practical.
- [ ] The mockup is isolated from production code.
