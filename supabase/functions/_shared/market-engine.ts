export type MarketItem = {
  id: string;
  category_id: string;
  category_label: string;
  name: string;
  icon_url: string | null;
  price: number;
  liquidity: number;
};

export type MarketSnapshot = {
  captured_at_epoch_ms: number;
  items: MarketItem[];
};

export type MarketPeriod = "30m" | "1d" | "7d";

export type PeriodConfig = {
  targetMs: number;
  toleranceMs: number;
  required: number;
  maxFallbackAgeMs?: number;
};

export const MARKET_PERIODS: Record<MarketPeriod, PeriodConfig> = {
  "30m": {
    targetMs: 30 * 60 * 1000,
    toleranceMs: 20 * 60 * 1000,
    maxFallbackAgeMs: 4 * 60 * 60 * 1000,
    required: 2,
  },
  "1d": { targetMs: 24 * 60 * 60 * 1000, toleranceMs: 4 * 60 * 60 * 1000, required: 48 },
  "7d": { targetMs: 7 * 24 * 60 * 60 * 1000, toleranceMs: 12 * 60 * 60 * 1000, required: 336 },
};

export function selectComparisonBaseline(
  snapshots: MarketSnapshot[],
  current: MarketSnapshot | null,
  config: PeriodConfig,
) {
  if (!current) return null;
  const prior = snapshots.filter((snapshot) => snapshot.captured_at_epoch_ms < current.captured_at_epoch_ms);
  const target = current.captured_at_epoch_ms - config.targetMs;
  const nearest = prior.reduce<{ snapshot: MarketSnapshot; distance: number } | null>((best, snapshot) => {
    const distance = Math.abs(snapshot.captured_at_epoch_ms - target);
    if (distance > config.toleranceMs || (best && best.distance <= distance)) return best;
    return { snapshot, distance };
  }, null);
  if (nearest) return nearest.snapshot;
  if (!config.maxFallbackAgeMs) return null;
  return [...prior].reverse().find(
    (snapshot) => current.captured_at_epoch_ms - snapshot.captured_at_epoch_ms <= config.maxFallbackAgeMs!,
  ) ?? null;
}

export function calculateMovers(current: MarketItem[], baseline: MarketItem[]) {
  const previousByKey = new Map(baseline.map((item) => [`${item.category_id}::${item.id}`, item]));
  const candidates = current.flatMap((item) => {
    const previous = previousByKey.get(`${item.category_id}::${item.id}`);
    if (!previous || previous.price <= 0 || item.price <= 0 || item.liquidity <= 0) return [];
    const change = ((item.price - previous.price) / previous.price) * 100;
    return Number.isFinite(change) && Math.abs(change) >= 0.0001 ? [{ item, previous, change }] : [];
  });
  const byCategory = Map.groupBy(candidates, (candidate) => candidate.item.category_id);
  const movers: Array<Record<string, unknown>> = [];

  for (const categoryCandidates of byCategory.values()) {
    const magnitudes = categoryCandidates.map(({ change }) => Math.abs(change));
    const medianMagnitude = median(magnitudes);
    const mad = median(magnitudes.map((value) => Math.abs(value - medianMagnitude)));
    const scale = Math.max(0.01, medianMagnitude + mad);
    const liquidities = categoryCandidates.map(({ item }) => item.liquidity);

    for (const { item, previous, change } of categoryCandidates) {
      const percentile = percentileRank(liquidities, item.liquidity);
      const confidence = percentile >= 0.65 ? "high" : percentile >= 0.25 ? "medium" : "low";
      if (confidence === "low") continue;
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
        score: (Math.abs(change) / scale) * (0.65 + 0.35 * percentile),
      });
    }
  }

  return {
    winners: movers.filter((mover) => Number(mover.change_percent) > 0).sort(byScore),
    losers: movers.filter((mover) => Number(mover.change_percent) < 0).sort(byScore),
  };
}

export function buildMarketDataset(
  league: string,
  period: MarketPeriod,
  snapshots: MarketSnapshot[],
  now = Date.now(),
) {
  const config = MARKET_PERIODS[period];
  const current = snapshots.at(-1) ?? null;
  const baseline = selectComparisonBaseline(snapshots, current, config);
  const ready = Boolean(current && baseline);
  const movers = ready && current && baseline
    ? calculateMovers(current.items, baseline.items)
    : { winners: [], losers: [] };

  return {
    schema_version: 1,
    league,
    period,
    status: ready ? "ready" : "building",
    generated_at_epoch_ms: current?.captured_at_epoch_ms ?? now,
    baseline_at_epoch_ms: baseline?.captured_at_epoch_ms ?? null,
    comparison_window_ms: ready && current && baseline
      ? current.captured_at_epoch_ms - baseline.captured_at_epoch_ms
      : null,
    source: "Supabase shared market collector",
    quote_currency_id: "divine",
    quote_currency_label: "Divine Orb",
    snapshots_collected: snapshots.length,
    snapshots_required: config.required,
    winners: movers.winners,
    losers: movers.losers,
  };
}

function byScore(left: Record<string, unknown>, right: Record<string, unknown>) {
  return Number(right.score) - Number(left.score);
}

function percentileRank(values: number[], target: number) {
  if (values.length <= 1) return 1;
  const below = values.filter((value) => value < target).length;
  const equal = values.filter((value) => value === target).length;
  return (below + Math.max(0, equal - 1) / 2) / (values.length - 1);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
