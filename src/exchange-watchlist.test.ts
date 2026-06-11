import { describe, expect, it } from "vitest";
import {
  exchangeWatchlistFocusCategoryIds,
  isExchangeWatchlistPinned,
  normalizeExchangeWatchlistState,
  pinExchangeWatchlistEntry,
  unpinExchangeWatchlistEntry,
  type ExchangeWatchlistEntrySource,
} from "./exchange-watchlist";

const source = (entryId = "divine"): ExchangeWatchlistEntrySource => ({
  category_id: "currency",
  category_label: "Currency",
  league: "Standard",
  source: "poe.ninja cache",
  source_url: "https://poe.ninja/poe2/economy/Standard/currency",
  fetched_at_epoch_ms: 1000,
  primary_currency: { id: "divine", name: "Divine Orb", icon_url: null },
  quote_currencies: [
    { currency: { id: "divine", name: "Divine Orb", icon_url: null }, per_primary: 1 },
    { currency: { id: "exalted", name: "Exalted Orb", icon_url: null }, per_primary: 120 },
  ],
  entry: {
    id: entryId,
    name: entryId === "divine" ? "Divine Orb" : "Exalted Orb",
    icon_url: null,
    details_id: entryId,
    item_category: "Currency",
    price_in_primary: entryId === "divine" ? 1 : 0.01,
    quantity: 123,
    history_change_percent: 4.2,
    sparkline: [1, 2, 3],
  },
});

describe("exchange watchlist", () => {
  it("pins and unpins exchange entries by category and id", () => {
    const pinned = pinExchangeWatchlistEntry({ pins: [] }, source(), 1234);

    expect(isExchangeWatchlistPinned(pinned, "currency", "divine")).toBe(true);
    expect(pinned.pins[0]?.name).toBe("Divine Orb");

    const unpinned = unpinExchangeWatchlistEntry(pinned, "currency", "divine");

    expect(isExchangeWatchlistPinned(unpinned, "currency", "divine")).toBe(false);
    expect(unpinned.pins).toHaveLength(0);
  });

  it("updates an existing pin snapshot instead of duplicating it", () => {
    const first = pinExchangeWatchlistEntry({ pins: [] }, source(), 1000);
    const second = pinExchangeWatchlistEntry(first, {
      ...source(),
      entry: { ...source().entry, quantity: 999 },
    }, 2000);

    expect(second.pins).toHaveLength(1);
    expect(second.pins[0]?.quantity).toBe(999);
    expect(second.pins[0]?.pinned_at_epoch_ms).toBe(2000);
  });

  it("normalizes persisted pins and drops malformed records", () => {
    const normalized = normalizeExchangeWatchlistState({
      pins: [
        pinExchangeWatchlistEntry({ pins: [] }, source(), 2000).pins[0],
        { id: "", category_id: "currency", name: "Broken" },
        { id: "nameless", category_id: "currency" },
      ],
    });

    expect(normalized.pins).toHaveLength(1);
    expect(normalized.pins[0]?.id).toBe("divine");
  });

  it("deduplicates persisted pins using the newest snapshot", () => {
    const oldPin = pinExchangeWatchlistEntry({ pins: [] }, source("exalted"), 1000).pins[0];
    const newPin = pinExchangeWatchlistEntry({ pins: [] }, {
      ...source("exalted"),
      entry: { ...source("exalted").entry, quantity: 77 },
    }, 3000).pins[0];

    const normalized = normalizeExchangeWatchlistState({ pins: [oldPin, newPin] });

    expect(normalized.pins).toHaveLength(1);
    expect(normalized.pins[0]?.quantity).toBe(77);
  });

  it("maps Atlas focus presets to relevant exchange categories without fetching", () => {
    expect(exchangeWatchlistFocusCategoryIds("breach")).toContain("breach");
    expect(exchangeWatchlistFocusCategoryIds("waystones")).toContain("unique-maps");
  });
});
