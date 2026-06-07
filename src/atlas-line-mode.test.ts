import { describe, expect, it } from "vitest";
import { atlasCompactLineState, type AtlasCompactArea, type AtlasCompactRun } from "./atlas-line-mode";

const area: AtlasCompactArea = {
  name: "Sanctuary",
  area_level: 79,
  area_type: "map",
  entered_at_epoch_ms: 0,
  waystone_mod_count: null,
  waystone_quantity: null,
  waystone_rarity: null,
  waystone_pack_size: null,
  waystone_hazard_count: null,
};

describe("atlasCompactLineState", () => {
  it("summarizes confirmed OCR evidence with indicators and risk reason", () => {
    const run: AtlasCompactRun = {
      confidence: "ocr_confirmed",
      waystone: null,
      ocr_evidence: {
        state: "confirmed",
        normalized_mods: [
          "AREA CONTAINS BREACHES",
          "18% INCREASED RARITY OF ITEMS FOUND IN THIS AREA",
          "MONSTERS HAVE 30% INCREASED ACCURACY RATING",
        ],
        raw_lines: [],
        summary: {
          modifier_count: 3,
          reward_lines: ["18% INCREASED RARITY OF ITEMS FOUND IN THIS AREA"],
          player_danger_lines: [],
          monster_danger_lines: ["MONSTERS HAVE 30% INCREASED ACCURACY RATING"],
          content_flags: ["Breach"],
        },
      },
    };

    const state = atlasCompactLineState(area, run, "1:05");

    expect(state.text).toBe("OCR 3 mods | Breach | 1:05");
    expect(state.indicators).toEqual([
      { label: "R", value: "18%", tone: "reward" },
    ]);
    expect(state.riskReason).toBe("Monster pressure");
    expect(state.riskDetail).toBe("MONSTERS HAVE 30% INCREASED ACCURACY RATING");
    expect(state.severity).toBe("warning");
    expect(state.shouldPulse).toBe(true);
  });

  it("uses critical severity for armed build-breaking waystone warnings", () => {
    const run: AtlasCompactRun = {
      confidence: "armed",
      ocr_evidence: null,
      waystone: {
        profile_hazards: [
          {
            severity: "build_breaking",
            reason: "Energy shield recovery disabled for this profile",
            modifier: "Players cannot recharge energy shield",
          },
          {
            severity: "warning",
            reason: "Rare monster pressure",
            modifier: "Rare monsters have 25% increased chance for modifiers",
          },
        ],
        profile_hazard_summary: {
          info: 0,
          warning: 1,
          danger: 0,
          build_breaking: 1,
        },
      },
    };

    const state = atlasCompactLineState({
      ...area,
      waystone_mod_count: 8,
      waystone_quantity: 75,
      waystone_rarity: 42,
      waystone_pack_size: 11,
      waystone_hazard_count: 2,
    }, run, "0:30");

    expect(state.text).toBe("8 mods | Q:75% | Risk:2 | 0:30");
    expect(state.indicators).toEqual([
      { label: "R", value: "42%", tone: "reward" },
      { label: "Pack", value: "11%", tone: "reward" },
      { label: "Rare", value: "25%", tone: "monster" },
    ]);
    expect(state.riskReason).toBe("Energy shield recovery disabl...");
    expect(state.riskDetail).toBe("Energy shield recovery disabled for this profile (Players cannot recharge energy shield)");
    expect(state.severity).toBe("critical");
    expect(state.shouldPulse).toBe(true);
  });

  it("keeps area-only OCR misses calm", () => {
    const state = atlasCompactLineState(area, {
      confidence: "area_only",
      waystone: null,
      ocr_evidence: {
        state: "none",
        normalized_mods: [],
        raw_lines: ["The Grand Expedition"],
        summary: null,
      },
    }, "2:10");

    expect(state.text).toBe("Area-only | 2:10");
    expect(state.indicators).toEqual([]);
    expect(state.riskReason).toBe("");
    expect(state.severity).toBe("none");
    expect(state.shouldPulse).toBe(false);
  });
});
