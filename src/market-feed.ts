import {
  normalizeMarketBoardDataset,
  type MarketBoardDataset,
  type MarketPeriod,
} from "./market-board";

export const DEFAULT_MARKET_FEED_BASE_URL =
  (import.meta.env.VITE_MARKET_FEED_BASE_URL as string | undefined)?.trim() ||
  "https://kidans.github.io/PoE2-Reliquary/market-feed";

export type MarketFeedResult = {
  dataset: MarketBoardDataset | null;
  source: "network" | "cache" | "none";
  error: string | null;
};

type CacheStorage = Pick<Storage, "getItem" | "setItem">;

export async function loadMarketBoardDataset(
  league: string,
  period: MarketPeriod,
  options: {
    fetcher?: typeof fetch;
    storage?: CacheStorage;
    baseUrl?: string;
  } = {},
): Promise<MarketFeedResult> {
  const fetcher = options.fetcher ?? fetch;
  const storage = options.storage ?? localStorage;
  const baseUrl = (options.baseUrl ?? DEFAULT_MARKET_FEED_BASE_URL).replace(/\/$/, "");
  const cacheKey = marketFeedCacheKey(league, period);
  const url = `${baseUrl}/leagues/${marketLeagueSlug(league)}/market-${period}.json`;

  try {
    const response = await fetcher(url, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`shared feed returned HTTP ${response.status}`);
    }
    const dataset = normalizeMarketBoardDataset(await response.json());
    if (!dataset || dataset.league.toLowerCase() !== league.toLowerCase() || dataset.period !== period) {
      throw new Error("shared feed payload did not match the selected league and period");
    }
    storage.setItem(cacheKey, JSON.stringify(dataset));
    return { dataset, source: "network", error: null };
  } catch (error) {
    const cached = readCachedDataset(storage, cacheKey, league, period);
    return {
      dataset: cached,
      source: cached ? "cache" : "none",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function marketLeagueSlug(league: string) {
  return league
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function marketFeedCacheKey(league: string, period: MarketPeriod) {
  return `reliquary.market-feed.v1.${marketLeagueSlug(league)}.${period}`;
}

function readCachedDataset(
  storage: Pick<Storage, "getItem">,
  key: string,
  league: string,
  period: MarketPeriod,
) {
  try {
    const dataset = normalizeMarketBoardDataset(JSON.parse(storage.getItem(key) ?? "null"));
    if (!dataset || dataset.league.toLowerCase() !== league.toLowerCase() || dataset.period !== period) {
      return null;
    }
    return dataset;
  } catch {
    return null;
  }
}
