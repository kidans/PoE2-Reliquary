import { describe, expect, it } from "vitest";

import { normalizePoeNinjaAssetUrl } from "./market-feed-normalize.mjs";

describe("normalizePoeNinjaAssetUrl", () => {
  it("publishes poe.ninja image paths as absolute asset URLs", () => {
    expect(normalizePoeNinjaAssetUrl("/gen/image/item.png")).toBe(
      "https://web.poecdn.com/gen/image/item.png",
    );
  });

  it("keeps absolute image URLs unchanged", () => {
    expect(normalizePoeNinjaAssetUrl("https://web.poecdn.com/gen/image/item.png")).toBe(
      "https://web.poecdn.com/gen/image/item.png",
    );
    expect(normalizePoeNinjaAssetUrl("https://assets.poe.ninja/gen/image/item.png")).toBe(
      "https://web.poecdn.com/gen/image/item.png",
    );
  });

  it("returns null for missing images", () => {
    expect(normalizePoeNinjaAssetUrl(null)).toBeNull();
  });
});
