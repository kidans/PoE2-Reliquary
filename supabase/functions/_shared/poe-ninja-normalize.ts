export type PoeNinjaCategory = {
  id: string;
  label: string;
  feed: "exchange" | "stash";
  type: string;
};

export type NormalizedMarketItem = {
  id: string;
  category_id: string;
  category_label: string;
  name: string;
  icon_url: string | null;
  price: number;
  liquidity: number;
};

export function normalizePoeNinjaCategory(
  response: Record<string, unknown>,
  category: PoeNinjaCategory,
): NormalizedMarketItem[] {
  const lines = Array.isArray(response.lines) ? response.lines : [];
  const items = Array.isArray(response.items) ? response.items : [];
  const itemById = new Map(items.map((item: Record<string, unknown>) => [String(item.id ?? item.name ?? ""), item]));

  return lines.flatMap((line: Record<string, unknown>) => {
    const item = itemById.get(String(line.id ?? ""));
    const rawId = String(line.detailsId ?? line.itemId ?? line.id ?? "").replace(/^"|"$/g, "");
    const name = stringValue(line.name ?? item?.name);
    const price = finiteNumber(line.primaryValue ?? line.divineValue ?? line.value);
    const liquidity = finiteNumber(
      category.feed === "stash" ? line.listingCount : line.volumePrimaryValue,
    );
    if (!rawId || !name || price === null || price <= 0 || liquidity === null || liquidity <= 0) return [];

    return [{
      id: stableId(category.id, rawId),
      category_id: category.id,
      category_label: category.label,
      name,
      icon_url: normalizeAssetUrl(line.icon ?? item?.image ?? item?.icon),
      price,
      liquidity,
    }];
  });
}

function normalizeAssetUrl(value: unknown) {
  const url = stringValue(value);
  if (!url) return null;
  if (url.startsWith("/gen/image/")) return `https://web.poecdn.com${url}`;
  if (url.startsWith("https://assets.poe.ninja/gen/image/")) {
    return url.replace("https://assets.poe.ninja", "https://web.poecdn.com");
  }
  return url;
}

function stableId(categoryId: string, value: string) {
  return `${categoryId}-${value}`.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
