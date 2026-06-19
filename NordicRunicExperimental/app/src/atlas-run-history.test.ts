import { describe, expect, it } from "vitest";
import {
  ATLAS_RUN_HISTORY_STORAGE_KEY,
  clearAtlasRunHistory,
  completeAtlasRun,
  incrementAtlasRunDeaths,
  loadAtlasRunHistory,
  saveAtlasRunHistory,
  upsertAtlasRun,
  type AtlasHistoryRunContext,
  type AtlasRunRecord,
} from "./atlas-run-history";

function storageWith(value: unknown = null) {
  const data = new Map<string, string>();
  if (value !== null) {
    data.set(ATLAS_RUN_HISTORY_STORAGE_KEY, JSON.stringify(value));
  }
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, next: string) => data.set(key, next),
    removeItem: (key: string) => data.delete(key),
  };
}

function runContext(overrides: Partial<AtlasHistoryRunContext> = {}): AtlasHistoryRunContext {
  return {
    area: {
      name: "Burial Bog",
      area_level: 79,
      area_type: "map",
      entered_at_epoch_ms: 1000,
      boss: "Twig Monsters",
      waystone_mod_count: 8,
      waystone_quantity: 50,
      waystone_rarity: 22,
      waystone_pack_size: 9,
      waystone_hazard_count: 1,
    },
    waystone: {
      name: "Warped Carving Waystone",
      base_type: "Waystone",
      tier: 15,
      item_level: 79,
      explicit_mods: ["Monsters have 30% increased accuracy rating"],
      quantity: 50,
      rarity: 22,
      pack_size: 9,
      hazard_count: 1,
      profile_hazard_summary: {
        info: 0,
        warning: 1,
        danger: 0,
        build_breaking: 0,
      },
    },
    confidence: "armed",
    ocr_evidence: null,
    started_at_epoch_ms: 1000,
    ...overrides,
  };
}

describe("Atlas run history", () => {
  it("loads old saved map runs without deaths or confidence safely", () => {
    const store = storageWith([
      {
        area: {
          name: "Sanctuary",
          area_level: 79,
          area_type: "map",
          entered_at_epoch_ms: 500,
          boss: null,
        },
        started_at_epoch_ms: 500,
        elapsed_ms: 120000,
      },
    ]);

    const history = loadAtlasRunHistory(store);

    expect(history).toHaveLength(1);
    expect(history[0].confidence).toBe("area_only");
    expect(history[0].deaths).toBe(0);
    expect(history[0].waystone).toBeNull();
  });

  it("upserts active runs while preserving deaths and completion state", () => {
    const first = upsertAtlasRun([], runContext());
    const withDeath = incrementAtlasRunDeaths(first, runContext());
    const completed = completeAtlasRun(withDeath, runContext(), 61_000);
    const refreshed = upsertAtlasRun(completed, runContext({ confidence: "ocr_confirmed" }));

    expect(refreshed).toHaveLength(1);
    expect(refreshed[0].deaths).toBe(1);
    expect(refreshed[0].completed_at_epoch_ms).toBe(61_000);
    expect(refreshed[0].elapsed_ms).toBe(60_000);
    expect(refreshed[0].confidence).toBe("ocr_confirmed");
  });

  it("persists OCR evidence distinctly from armed waystones", () => {
    const ocrRun = runContext({
      waystone: null,
      confidence: "ocr_confirmed",
      ocr_evidence: {
        state: "confirmed",
        normalized_mods: ["AREA CONTAINS BREACHES"],
        raw_lines: ["Area contains Breaches"],
        summary: {
          modifier_count: 1,
          reward_lines: [],
          player_danger_lines: [],
          monster_danger_lines: [],
          content_flags: ["Breach"],
        },
        confidence_score: 0.85,
        reason: null,
        captured_at_epoch_ms: 2000,
      },
    });

    const history = upsertAtlasRun([], ocrRun);

    expect(history[0].confidence).toBe("ocr_confirmed");
    expect(history[0].waystone).toBeNull();
    expect(history[0].ocr_evidence?.summary?.content_flags).toEqual(["Breach"]);
  });

  it("saves, loads, and clears run history", () => {
    const store = storageWith();
    const history = upsertAtlasRun([], runContext());

    saveAtlasRunHistory(store, history);
    expect(loadAtlasRunHistory(store)).toHaveLength(1);

    const cleared = clearAtlasRunHistory(store);
    expect(cleared).toEqual([]);
    expect(loadAtlasRunHistory(store)).toEqual([]);
  });

  it("caps persisted history to the newest records", () => {
    const records: AtlasRunRecord[] = Array.from({ length: 60 }, (_, index) => ({
      ...upsertAtlasRun([], runContext({
        area: {
          ...runContext().area,
          name: `Map ${index}`,
          entered_at_epoch_ms: index,
        },
        started_at_epoch_ms: index,
      }))[0],
    }));
    const store = storageWith();

    saveAtlasRunHistory(store, records);
    const loaded = loadAtlasRunHistory(store);

    expect(loaded).toHaveLength(50);
    expect(loaded[0].area.name).toBe("Map 0");
  });
});
