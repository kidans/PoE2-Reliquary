import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRADE_VIEW,
  MARKET_INITIAL_ROWS,
  calculateMarketMovers,
  marketBaselineMessage,
  normalizeMarketIconUrl,
  normalizeMarketBoardDataset,
  normalizeTradeViewPreference,
  visibleMarketMovers,
  type MarketMover,
  type MarketSnapshotItem,
} from "./market-board";

const snapshot = (
  id: string,
  category: string,
  price: number,
  liquidity: number,
): MarketSnapshotItem => ({
  id,
  category_id: category,
  category_label: category,
  name: id,
  icon_url: null,
  price,
  liquidity,
});

const mover = (id: number, score: number): MarketMover => ({
  id: String(id),
  category_id: "currency",
  category_label: "Currency",
  name: `Mover ${id}`,
  icon_url: null,
  current_price: 2,
  baseline_price: 1,
  change_percent: 10,
  liquidity: 100,
  confidence: "high",
  score,
});

describe("market board", () => {
  it("defaults Trade to the 1-day market board", () => {
    expect(normalizeTradeViewPreference(null)).toEqual(DEFAULT_TRADE_VIEW);
    expect(normalizeTradeViewPreference({ view: "category", period: "7d" })).toEqual({
      view: "category",
      period: "7d",
    });
  });

  it("describes an incomplete baseline honestly", () => {
    const dataset = normalizeMarketBoardDataset({
      league: "Standard",
      period: "1d",
      status: "building",
      generated_at_epoch_ms: 1000,
      baseline_at_epoch_ms: null,
      source: "test",
      snapshots_collected: 11,
      snapshots_required: 48,
      winners: [],
      losers: [],
    });

    expect(dataset).not.toBeNull();
    expect(dataset?.quote_currency_id).toBe("divine");
    expect(dataset?.quote_currency_label).toBe("Divine Orb");
    expect(dataset?.comparison_window_ms).toBeNull();
    expect(marketBaselineMessage(dataset!)).toBe("Building 1-day baseline - 11/48 snapshots collected");
  });

  it("normalizes relative poe.ninja item images to the asset host", () => {
    expect(normalizeMarketIconUrl("/gen/image/example.png")).toBe(
      "https://web.poecdn.com/gen/image/example.png",
    );
    expect(normalizeMarketIconUrl("https://web.poecdn.com/gen/image/example.png")).toBe(
      "https://web.poecdn.com/gen/image/example.png",
    );
    expect(normalizeMarketIconUrl("https://assets.poe.ninja/gen/image/example.png")).toBe(
      "https://web.poecdn.com/gen/image/example.png",
    );
  });

  it("normalizes movement per category before ranking", () => {
    const baseline = [
      snapshot("currency-a", "currency", 100, 1000),
      snapshot("currency-b", "currency", 100, 500),
      snapshot("currency-c", "currency", 100, 100),
      snapshot("unique-a", "uniques", 10, 100),
      snapshot("unique-b", "uniques", 10, 50),
      snapshot("unique-c", "uniques", 10, 10),
    ];
    const current = [
      snapshot("currency-a", "currency", 104, 1000),
      snapshot("currency-b", "currency", 102, 500),
      snapshot("currency-c", "currency", 101, 100),
      snapshot("unique-a", "uniques", 15, 100),
      snapshot("unique-b", "uniques", 14, 50),
      snapshot("unique-c", "uniques", 13, 10),
    ];

    const result = calculateMarketMovers(current, baseline);

    expect(result.winners.some((entry) => entry.id === "currency-a")).toBe(true);
    expect(result.winners.some((entry) => entry.id === "unique-a")).toBe(true);
    expect(result.winners.every((entry) => entry.confidence !== "low")).toBe(true);
  });

  it("returns every requested ranked row after the initial ten", () => {
    const movers = Array.from({ length: 15 }, (_, index) => mover(index, index < 10 ? 2 - index * 0.05 : index === 10 ? 1.2 : 0.5));
    const visible = visibleMarketMovers(movers, 20);

    expect(visible.slice(0, MARKET_INITIAL_ROWS)).toHaveLength(10);
    expect(visible.some((entry) => entry.score === 1.2)).toBe(true);
    expect(visible.filter((entry) => entry.score === 0.5)).toHaveLength(4);
    expect(visible).toHaveLength(15);
  });
});
