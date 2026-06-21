import { describe, expect, it } from "vitest";
import { TAB_RUNE_ASSETS } from "./rune-assets";

describe("TAB_RUNE_ASSETS", () => {
  it("maps every tab to a unique phonetic bindrune", () => {
    expect(Object.keys(TAB_RUNE_ASSETS)).toEqual([
      "profile",
      "scan",
      "trade",
      "campaign",
      "atlas",
      "data",
      "temple",
      "settings",
    ]);
    expect(Object.values(TAB_RUNE_ASSETS).map((entry) => entry.pair)).toEqual([
      "PR",
      "SK",
      "TR",
      "KM",
      "AT",
      "DT",
      "TM",
      "ST",
    ]);
    expect(new Set(Object.values(TAB_RUNE_ASSETS).map((entry) => entry.url)).size).toBe(8);
  });
});
