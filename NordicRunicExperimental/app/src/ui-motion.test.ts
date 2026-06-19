import { describe, expect, it } from "vitest";
import { shouldAnimateTabTransition, tabMotionDirection } from "./ui-motion";

describe("tab motion", () => {
  it("does not animate first render or same-tab rerenders", () => {
    expect(shouldAnimateTabTransition(null, "profile", false)).toBe(false);
    expect(shouldAnimateTabTransition("scan", "scan", false)).toBe(false);
    expect(shouldAnimateTabTransition("scan", "trade", true)).toBe(false);
  });

  it("derives forward and backward directions from the primary tab order", () => {
    expect(shouldAnimateTabTransition("scan", "trade", false)).toBe(true);
    expect(tabMotionDirection("scan", "trade")).toBe("forward");
    expect(tabMotionDirection("settings", "atlas")).toBe("backward");
    expect(tabMotionDirection(null, "scan")).toBe("neutral");
  });
});
