export type MarketPeriod = "30m" | "1d" | "7d";
export type TradeSubView = "market" | "category" | "favorites";
export type MarketDirection = "winner" | "loser";
export type MarketConfidence = "high" | "medium" | "low";
export type MarketDatasetStatus = "ready" | "building";

export type TradeViewPreference = {
  view: TradeSubView;
  period: MarketPeriod;
};

export type MarketSnapshotItem = {
  id: string;
  category_id: string;
  category_label: string;
  name: string;
  icon_url: string | null;
  price: number;
  liquidity: number;
};

export type MarketMover = {
  id: string;
  category_id: string;
  category_label: string;
  name: string;
  icon_url: string | null;
  current_price: number;
  baseline_price: number;
  change_percent: number;
  liquidity: number;
  confidence: MarketConfidence;
  score: number;
};

export type MarketBoardDataset = {
  schema_version: 1;
  league: string;
  period: MarketPeriod;
  status: MarketDatasetStatus;
  generated_at_epoch_ms: number;
  baseline_at_epoch_ms: number | null;
  source: string;
  quote_currency_id: string;
  quote_currency_label: string;
  snapshots_collected: number;
  snapshots_required: number;
  winners: MarketMover[];
  losers: MarketMover[];
};

export const DEFAULT_TRADE_VIEW: TradeViewPreference = {
  view: "market",
  period: "1d",
};

export const MARKET_INITIAL_ROWS = 10;
export const MARKET_ROW_INCREMENT = 10;
export const MARKET_QUOTE_CURRENCY_ID = "divine";
export const MARKET_QUOTE_CURRENCY_LABEL = "Divine Orb";

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

export function readTradeViewPreference(
  storage: StorageReader,
  key: string,
): TradeViewPreference {
  try {
    return normalizeTradeViewPreference(JSON.parse(storage.getItem(key) ?? "null"));
  } catch {
    return { ...DEFAULT_TRADE_VIEW };
  }
}

export function writeTradeViewPreference(
  storage: StorageWriter,
  key: string,
  preference: TradeViewPreference,
) {
  try {
    storage.setItem(key, JSON.stringify(normalizeTradeViewPreference(preference)));
  } catch {
    // View persistence is best effort and must never block Trade navigation.
  }
}

export function normalizeTradeViewPreference(value: unknown): TradeViewPreference {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_TRADE_VIEW };
  }
  const raw = value as Record<string, unknown>;
  const view: TradeSubView =
    raw.view === "category" || raw.view === "favorites" || raw.view === "market"
      ? raw.view
      : DEFAULT_TRADE_VIEW.view;
  const period: MarketPeriod =
    raw.period === "30m" || raw.period === "7d" || raw.period === "1d"
      ? raw.period
      : DEFAULT_TRADE_VIEW.period;
  return { view, period };
}

export function normalizeMarketBoardDataset(value: unknown): MarketBoardDataset | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const league = stringValue(raw.league);
  const period = periodValue(raw.period);
  const status = raw.status === "ready" || raw.status === "building" ? raw.status : null;
  const generatedAt = finiteNumber(raw.generated_at_epoch_ms);
  if (!league || !period || !status || generatedAt === null) return null;

  return {
    schema_version: 1,
    league,
    period,
    status,
    generated_at_epoch_ms: generatedAt,
    baseline_at_epoch_ms: finiteNumber(raw.baseline_at_epoch_ms),
    source: stringValue(raw.source) ?? "shared market feed",
    quote_currency_id: stringValue(raw.quote_currency_id) ?? MARKET_QUOTE_CURRENCY_ID,
    quote_currency_label: stringValue(raw.quote_currency_label) ?? MARKET_QUOTE_CURRENCY_LABEL,
    snapshots_collected: Math.max(0, Math.trunc(finiteNumber(raw.snapshots_collected) ?? 0)),
    snapshots_required: Math.max(1, Math.trunc(finiteNumber(raw.snapshots_required) ?? 1)),
    winners: normalizeMovers(raw.winners, "winner"),
    losers: normalizeMovers(raw.losers, "loser"),
  };
}

export function marketBaselineMessage(dataset: MarketBoardDataset) {
  if (dataset.status === "ready") return null;
  const label = dataset.period === "30m" ? "30-minute" : dataset.period === "1d" ? "1-day" : "7-day";
  return `Building ${label} baseline - ${dataset.snapshots_collected}/${dataset.snapshots_required} snapshots collected`;
}

export function visibleMarketMovers(movers: MarketMover[], requestedRows: number) {
  const sorted = [...movers].sort((left, right) => right.score - left.score);
  return sorted.slice(0, Math.max(MARKET_INITIAL_ROWS, requestedRows));
}

export function normalizeMarketIconUrl(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/gen/image/")) {
    return `https://web.poecdn.com${trimmed}`;
  }
  if (trimmed.startsWith("https://assets.poe.ninja/gen/image/")) {
    return trimmed.replace("https://assets.poe.ninja", "https://web.poecdn.com");
  }
  return trimmed;
}

export function calculateMarketMovers(
  current: MarketSnapshotItem[],
  baseline: MarketSnapshotItem[],
): { winners: MarketMover[]; losers: MarketMover[] } {
  const baselineByKey = new Map(baseline.map((item) => [marketItemKey(item), item]));
  const candidates = current.flatMap((item) => {
    const previous = baselineByKey.get(marketItemKey(item));
    if (!previous || item.price <= 0 || previous.price <= 0 || item.liquidity <= 0) return [];
    const change = ((item.price - previous.price) / previous.price) * 100;
    if (!Number.isFinite(change) || Math.abs(change) < 0.0001) return [];
    return [{ item, previous, change }];
  });

  const categories = new Map<string, typeof candidates>();
  candidates.forEach((candidate) => {
    categories.set(candidate.item.category_id, [
      ...(categories.get(candidate.item.category_id) ?? []),
      candidate,
    ]);
  });

  const movers: MarketMover[] = [];
  categories.forEach((categoryCandidates) => {
    const magnitudes = categoryCandidates.map((candidate) => Math.abs(candidate.change));
    const medianMagnitude = median(magnitudes);
    const mad = median(magnitudes.map((value) => Math.abs(value - medianMagnitude)));
    const scale = Math.max(0.01, medianMagnitude + mad);
    const liquidities = categoryCandidates.map((candidate) => candidate.item.liquidity);

    categoryCandidates.forEach(({ item, previous, change }) => {
      const liquidityPercentile = percentileRank(liquidities, item.liquidity);
      const confidence: MarketConfidence =
        liquidityPercentile >= 0.65 ? "high" : liquidityPercentile >= 0.25 ? "medium" : "low";
      if (confidence === "low") return;
      const normalizedMovement = Math.abs(change) / scale;
      movers.push({
        id: item.id,
        category_id: item.category_id,
        category_label: item.category_label,
        name: item.name,
        icon_url: item.icon_url,
        current_price: item.price,
        baseline_price: previous.price,
        change_percent: change,
        liquidity: item.liquidity,
        confidence,
        score: normalizedMovement * (0.65 + 0.35 * liquidityPercentile),
      });
    });
  });

  return {
    winners: movers.filter((mover) => mover.change_percent > 0).sort((a, b) => b.score - a.score),
    losers: movers.filter((mover) => mover.change_percent < 0).sort((a, b) => b.score - a.score),
  };
}

function normalizeMovers(value: unknown, direction: MarketDirection) {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeMover)
    .filter((mover): mover is MarketMover => Boolean(mover))
    .filter((mover) => direction === "winner" ? mover.change_percent > 0 : mover.change_percent < 0)
    .sort((left, right) => right.score - left.score);
}

function normalizeMover(value: unknown): MarketMover | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = stringValue(raw.id);
  const categoryId = stringValue(raw.category_id);
  const categoryLabel = stringValue(raw.category_label);
  const name = stringValue(raw.name);
  const currentPrice = finiteNumber(raw.current_price);
  const baselinePrice = finiteNumber(raw.baseline_price);
  const change = finiteNumber(raw.change_percent);
  const liquidity = finiteNumber(raw.liquidity);
  const score = finiteNumber(raw.score);
  const confidence = raw.confidence === "high" || raw.confidence === "medium" || raw.confidence === "low"
    ? raw.confidence
    : null;
  if (!id || !categoryId || !categoryLabel || !name || currentPrice === null || baselinePrice === null || change === null || liquidity === null || score === null || !confidence) {
    return null;
  }
  return {
    id,
    category_id: categoryId,
    category_label: categoryLabel,
    name,
    icon_url: normalizeMarketIconUrl(stringValue(raw.icon_url)),
    current_price: currentPrice,
    baseline_price: baselinePrice,
    change_percent: change,
    liquidity,
    confidence,
    score,
  };
}

function marketItemKey(item: Pick<MarketSnapshotItem, "category_id" | "id">) {
  return `${item.category_id}::${item.id}`;
}

function percentileRank(values: number[], value: number) {
  if (values.length <= 1) return 1;
  const belowOrEqual = values.filter((candidate) => candidate <= value).length - 1;
  return Math.max(0, Math.min(1, belowOrEqual / (values.length - 1)));
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[midpoint - 1] ?? 0) + (sorted[midpoint] ?? 0)) / 2
    : sorted[midpoint] ?? 0;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function periodValue(value: unknown): MarketPeriod | null {
  return value === "30m" || value === "1d" || value === "7d" ? value : null;
}
