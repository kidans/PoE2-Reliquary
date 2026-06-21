import { describe, expect, it } from "vitest";
import {
  FEATURE_REVEAL_SELECTORS,
  buttonTraceEligible,
  cursorAuraProfile,
  motionPolicy,
  panelEntryOffset,
  panelEntryProfile,
  toggleMotionProfile,
} from "./motion-runtime";

describe("motion runtime policy", () => {
  it("disables presentation motion for reduced motion and preview windows", () => {
    expect(motionPolicy({ reducedMotion: true, compactMode: false, previewWindow: false })).toEqual({
      aura: false,
      panel: false,
      features: false,
    });
    expect(motionPolicy({ reducedMotion: false, compactMode: false, previewWindow: true })).toEqual({
      aura: false,
      panel: false,
      features: false,
    });
  });

  it("keeps full-panel motion while disabling the aura in compact mode", () => {
    expect(motionPolicy({ reducedMotion: false, compactMode: true, previewWindow: false })).toEqual({
      aura: false,
      panel: false,
      features: false,
    });
    expect(motionPolicy({ reducedMotion: false, compactMode: false, previewWindow: false })).toEqual({
      aura: true,
      panel: true,
      features: true,
    });
  });

  it("uses a smaller, brighter aura profile for tabs", () => {
    const card = cursorAuraProfile("card");
    const tab = cursorAuraProfile("tab");
    expect(tab.scale).toBeLessThan(card.scale);
    expect(tab.opacity).toBeGreaterThan(card.opacity);
  });

  it("derives bounded entry offsets for navigation direction", () => {
    expect(panelEntryOffset("forward")).toBeGreaterThan(0);
    expect(panelEntryOffset("backward")).toBeLessThan(0);
    expect(panelEntryOffset("neutral")).toBe(0);
  });

  it("keeps Scan entry clear of the floating spine", () => {
    expect(panelEntryProfile("scan", "forward")).toMatchObject({ x: 0, y: 4, scale: 1 });
    expect(panelEntryProfile("trade", "forward").x).toBeGreaterThan(0);
  });

  it("provides deterministic toggle endpoints", () => {
    expect(toggleMotionProfile(false, 54)).toEqual({
      fromX: 54,
      toX: 0,
      fromRotation: 120,
      toRotation: 0,
    });
    expect(toggleMotionProfile(true, 54)).toEqual({
      fromX: 0,
      toX: 54,
      fromRotation: 0,
      toRotation: 120,
    });
  });

  it("limits runic traces to major non-destructive text buttons", () => {
    expect(buttonTraceEligible("action-button", false)).toBe(true);
    expect(buttonTraceEligible("action-button danger", false)).toBe(false);
    expect(buttonTraceEligible("chrome-button", true)).toBe(false);
  });

  it("caps every feature reveal group at six first-level selectors", () => {
    expect(Object.keys(FEATURE_REVEAL_SELECTORS)).toEqual([
      "profile",
      "scan",
      "trade",
      "campaign",
      "atlas",
      "data",
      "temple",
      "settings",
    ]);
    Object.values(FEATURE_REVEAL_SELECTORS).forEach((selectors) => {
      expect(selectors.length).toBeGreaterThan(0);
      expect(selectors.length).toBeLessThanOrEqual(6);
    });
  });
});
