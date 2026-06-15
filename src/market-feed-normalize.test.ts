import { describe, expect, it } from "vitest";
import { normalizePoeNinjaCategory } from "../supabase/functions/_shared/poe-ninja-normalize";

const exchangeCategory = {
  id: "currency",
  label: "Currency",
  feed: "exchange" as const,
  type: "Currency",
};

const stashCategory = {
  id: "unique-weapons",
  label: "Unique Weapons",
  feed: "stash" as const,
  type: "UniqueWeapons",
};

describe("poe.ninja market feed normalization", () => {
  it("uses volumePrimaryValue as exchange liquidity", () => {
    const items = normalizePoeNinjaCategory({
      lines: [{ id: "alch", primaryValue: 0.00338, volumePrimaryValue: 250.2 }],
      items: [{ id: "alch", name: "Orb of Alchemy", image: "/gen/image/alch.png" }],
    }, exchangeCategory);

    expect(items).toEqual([expect.objectContaining({
      name: "Orb of Alchemy",
      price: 0.00338,
      liquidity: 250.2,
    })]);
  });

  it("uses listingCount as stash liquidity", () => {
    const items = normalizePoeNinjaCategory({
      lines: [{ id: "unique-sword", name: "Unique Sword", primaryValue: 2, listingCount: 17 }],
    }, stashCategory);

    expect(items).toEqual([expect.objectContaining({
      name: "Unique Sword",
      price: 2,
      liquidity: 17,
    })]);
  });

  it("drops rows without positive price or liquidity", () => {
    expect(normalizePoeNinjaCategory({
      lines: [{ id: "empty", name: "Empty", primaryValue: 1, volumePrimaryValue: 0 }],
    }, exchangeCategory)).toEqual([]);
  });
});
