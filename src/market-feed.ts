import {
  normalizeMarketBoardDataset,
  type MarketBoardDataset,
  type MarketPeriod,
} from "./market-board";

export const DEFAULT_MARKET_FEED_BASE_URL =
  (import.meta.env.VITE_MARKET_FEED_BASE_URL as string | undefined)?.trim() ||
  "https://kidans.github.io/PoE2-Reliquary/market-feed";
export const DEFAULT_MARKET_FEED_FUNCTION_URL =
  (import.meta.env.VITE_MARKET_FEED_FUNCTION_URL as string | undefined)?.trim() ||
  "https://tzxclvrmmptvqhzobgse.supabase.co/functions/v1/market-feed";

export type MarketFeedResult = {
  dataset: MarketBoardDataset | null;
  source: "supabase" | "github" | "cache" | "none";
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
    primaryUrl?: string;
    fallbackBaseUrl?: string;
  } = {},
): Promise<MarketFeedResult> {
  const fetcher = options.fetcher ?? fetch;
  const storage = options.storage ?? localStorage;
  const fallbackBaseUrl = (options.fallbackBaseUrl ?? options.baseUrl ?? DEFAULT_MARKET_FEED_BASE_URL).replace(/\/$/, "");
  const primaryUrl = options.baseUrl
    ? null
    : (options.primaryUrl ?? DEFAULT_MARKET_FEED_FUNCTION_URL).replace(/\/$/, "");
  const cacheKey = marketFeedCacheKey(league, period);
  const candidates = [
    primaryUrl ? {
      source: "supabase" as const,
      url: `${primaryUrl}?league=${encodeURIComponent(league)}&period=${encodeURIComponent(period)}`,
    } : null,
    {
      source: "github" as const,
      url: `${fallbackBaseUrl}/leagues/${marketLeagueSlug(league)}/market-${period}.json`,
    },
  ].filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

  const failures: string[] = [];
  let warmingDataset: MarketBoardDataset | null = null;
  for (const candidate of candidates) {
    try {
      const response = await fetcher(candidate.url, { cache: "no-cache" });
      if (!response.ok) {
        throw new Error(`${candidate.source} feed returned HTTP ${response.status}`);
      }
      const dataset = normalizeMarketBoardDataset(await response.json());
      if (!dataset || dataset.league.toLowerCase() !== league.toLowerCase() || dataset.period !== period) {
        throw new Error(`${candidate.source} feed payload did not match the selected league and period`);
      }
      if (candidate.source === "supabase" && dataset.status === "building") {
        warmingDataset = dataset;
        continue;
      }
      storage.setItem(cacheKey, JSON.stringify(dataset));
      return { dataset, source: candidate.source, error: failures.length ? failures.join("; ") : null };
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (warmingDataset) {
    storage.setItem(cacheKey, JSON.stringify(warmingDataset));
    return { dataset: warmingDataset, source: "supabase", error: failures.length ? failures.join("; ") : null };
  }

  const cached = readCachedDataset(storage, cacheKey, league, period);
  return {
    dataset: cached,
    source: cached ? "cache" : "none",
    error: failures.join("; ") || "shared market feeds were unavailable",
  };
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
