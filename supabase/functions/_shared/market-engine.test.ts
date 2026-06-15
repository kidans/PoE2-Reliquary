import { describe, expect, it } from "vitest";

import { buildMarketDataset, calculateMovers, selectComparisonBaseline } from "./market-engine";

const minute = 60_000;

describe("Supabase market engine", () => {
  it("uses a delayed previous checkpoint for the 30-minute board", () => {
    const previous = { captured_at_epoch_ms: 0, items: [] };
    const current = { captured_at_epoch_ms: 95 * minute, items: [] };
    const selected = selectComparisonBaseline([previous, current], current, {
      targetMs: 30 * minute,
      toleranceMs: 20 * minute,
      maxFallbackAgeMs: 4 * 60 * minute,
      required: 2,
    });
    expect(selected).toBe(previous);
  });

  it("calculates ranked winners using normalized item identity", () => {
    const baseline = [
      item("currency", "Divine Orb", 1, 100),
      item("currency", "Exalted Orb", 0.01, 80),
      item("currency", "Chaos Orb", 0.05, 60),
    ];
    const current = [
      item("currency", "Divine Orb", 1, 100),
      item("currency", "Exalted Orb", 0.012, 80),
      item("currency", "Chaos Orb", 0.051, 60),
    ];
    expect(calculateMovers(current, baseline).winners[0].name).toBe("Exalted Orb");
  });

  it("publishes Divine Orb metadata in every board", () => {
    const dataset = buildMarketDataset("Runes of Aldur", "30m", [
      { captured_at_epoch_ms: 0, items: [item("currency", "Exalted Orb", 0.01, 80)] },
      { captured_at_epoch_ms: 30 * minute, items: [item("currency", "Exalted Orb", 0.012, 80)] },
    ], 30 * minute);
    expect(dataset.status).toBe("ready");
    expect(dataset.quote_currency_label).toBe("Divine Orb");
  });
});

function item(category: string, name: string, price: number, liquidity: number) {
  return {
    id: name.toLowerCase().replaceAll(" ", "-"),
    category_id: category,
    category_label: category,
    name,
    icon_url: null,
    price,
    liquidity,
  };
}
