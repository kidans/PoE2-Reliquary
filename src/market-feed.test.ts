import { describe, expect, it } from "vitest";
import { loadMarketBoardDataset, marketLeagueSlug } from "./market-feed";

const payload = {
  schema_version: 1,
  league: "Fate of the Vaal",
  period: "1d",
  status: "ready",
  generated_at_epoch_ms: 2000,
  baseline_at_epoch_ms: 1000,
  source: "test feed",
  snapshots_collected: 48,
  snapshots_required: 48,
  winners: [],
  losers: [],
};

function memoryStorage(seed: Record<string, string> = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

describe("market feed", () => {
  it("uses stable league slugs", () => {
    expect(marketLeagueSlug("Fate of the Vaal")).toBe("fate-of-the-vaal");
  });

  it("caches a valid network dataset", async () => {
    const storage = memoryStorage();
    const result = await loadMarketBoardDataset("Fate of the Vaal", "1d", {
      storage,
      fetcher: async () => new Response(JSON.stringify(payload), { status: 200 }),
      baseUrl: "https://example.test/feed",
    });

    expect(result.source).toBe("network");
    expect(result.dataset?.generated_at_epoch_ms).toBe(2000);
  });

  it("falls back to the last valid cached dataset", async () => {
    const storage = memoryStorage({
      "reliquary.market-feed.v1.fate-of-the-vaal.1d": JSON.stringify(payload),
    });
    const result = await loadMarketBoardDataset("Fate of the Vaal", "1d", {
      storage,
      fetcher: async () => new Response("offline", { status: 503 }),
    });

    expect(result.source).toBe("cache");
    expect(result.error).toContain("HTTP 503");
  });
});
