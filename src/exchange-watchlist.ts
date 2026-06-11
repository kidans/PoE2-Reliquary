export type ExchangeWatchlistFocusId =
  | "expedition"
  | "breach"
  | "ritual"
  | "delirium"
  | "bossing"
  | "fortress"
  | "waystones";

export type ExchangeWatchlistCurrency = {
  id: string;
  name: string;
  icon_url: string | null;
};

export type ExchangeWatchlistQuote = {
  currency: ExchangeWatchlistCurrency;
  per_primary: number;
};

export type ExchangeWatchlistPin = {
  id: string;
  category_id: string;
  category_label: string;
  league: string;
  source: string;
  source_url: string | null;
  fetched_at_epoch_ms: number | null;
  pinned_at_epoch_ms: number;
  name: string;
  icon_url: string | null;
  details_id: string | null;
  item_category: string | null;
  price_in_primary: number | null;
  quantity: number | null;
  history_change_percent: number | null;
  sparkline: number[];
  primary_currency: ExchangeWatchlistCurrency | null;
  quote_currencies: ExchangeWatchlistQuote[];
};

export type ExchangeWatchlistState = {
  pins: ExchangeWatchlistPin[];
};

export type ExchangeWatchlistEntrySource = {
  category_id: string;
  category_label: string;
  league: string;
  source: string;
  source_url: string | null;
  fetched_at_epoch_ms: number | null;
  primary_currency: ExchangeWatchlistCurrency | null;
  quote_currencies: ExchangeWatchlistQuote[];
  entry: {
    id: string;
    name: string;
    icon_url: string | null;
    details_id: string | null;
    item_category: string | null;
    price_in_primary: number | null;
    quantity: number | null;
    history_change_percent: number | null;
    sparkline: number[];
  };
};

export const EXCHANGE_WATCHLIST_LIMIT = 48;

const ATLAS_FOCUS_WATCHLIST_CATEGORIES: Record<ExchangeWatchlistFocusId, string[]> = {
  expedition: ["expedition", "fragments", "currency"],
  breach: ["breach", "fragments", "currency"],
  ritual: ["ritual", "currency"],
  delirium: ["delirium", "currency"],
  bossing: ["fragments", "unique-maps", "currency"],
  fortress: ["fragments", "unique-maps", "currency"],
  waystones: ["unique-maps", "currency", "fragments"],
};

export function exchangeWatchlistKey(categoryId: string, entryId: string) {
  return `${categoryId}::${entryId}`;
}

export function exchangeWatchlistFocusCategoryIds(focusId: ExchangeWatchlistFocusId) {
  return ATLAS_FOCUS_WATCHLIST_CATEGORIES[focusId] ?? [];
}

export function isExchangeWatchlistPinned(
  state: ExchangeWatchlistState,
  categoryId: string,
  entryId: string,
) {
  const key = exchangeWatchlistKey(categoryId, entryId);
  return state.pins.some((pin) => exchangeWatchlistKey(pin.category_id, pin.id) === key);
}

export function pinExchangeWatchlistEntry(
  state: ExchangeWatchlistState,
  source: ExchangeWatchlistEntrySource,
  now = Date.now(),
): ExchangeWatchlistState {
  const nextPin: ExchangeWatchlistPin = {
    id: source.entry.id,
    category_id: source.category_id,
    category_label: source.category_label,
    league: source.league,
    source: source.source,
    source_url: source.source_url,
    fetched_at_epoch_ms: finiteNumberOrNull(source.fetched_at_epoch_ms),
    pinned_at_epoch_ms: now,
    name: source.entry.name,
    icon_url: source.entry.icon_url,
    details_id: source.entry.details_id,
    item_category: source.entry.item_category,
    price_in_primary: finiteNumberOrNull(source.entry.price_in_primary),
    quantity: finiteNumberOrNull(source.entry.quantity),
    history_change_percent: finiteNumberOrNull(source.entry.history_change_percent),
    sparkline: normalizeSparkline(source.entry.sparkline),
    primary_currency: normalizeCurrency(source.primary_currency),
    quote_currencies: normalizeQuotes(source.quote_currencies),
  };
  const key = exchangeWatchlistKey(nextPin.category_id, nextPin.id);
  const withoutExisting = state.pins.filter((pin) => exchangeWatchlistKey(pin.category_id, pin.id) !== key);
  return {
    pins: [nextPin, ...withoutExisting].slice(0, EXCHANGE_WATCHLIST_LIMIT),
  };
}

export function unpinExchangeWatchlistEntry(
  state: ExchangeWatchlistState,
  categoryId: string,
  entryId: string,
): ExchangeWatchlistState {
  const key = exchangeWatchlistKey(categoryId, entryId);
  return {
    pins: state.pins.filter((pin) => exchangeWatchlistKey(pin.category_id, pin.id) !== key),
  };
}

export function normalizeExchangeWatchlistState(value: unknown): ExchangeWatchlistState {
  if (!value || typeof value !== "object" || !Array.isArray((value as { pins?: unknown }).pins)) {
    return { pins: [] };
  }

  const pins = (value as { pins: unknown[] }).pins
    .map(normalizePin)
    .filter((pin): pin is ExchangeWatchlistPin => Boolean(pin));

  const deduped = new Map<string, ExchangeWatchlistPin>();
  pins.forEach((pin) => {
    const key = exchangeWatchlistKey(pin.category_id, pin.id);
    const existing = deduped.get(key);
    if (!existing || existing.pinned_at_epoch_ms < pin.pinned_at_epoch_ms) {
      deduped.set(key, pin);
    }
  });

  return {
    pins: [...deduped.values()]
      .sort((left, right) => right.pinned_at_epoch_ms - left.pinned_at_epoch_ms)
      .slice(0, EXCHANGE_WATCHLIST_LIMIT),
  };
}

function normalizePin(value: unknown): ExchangeWatchlistPin | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const id = stringOrNull(raw.id);
  const categoryId = stringOrNull(raw.category_id);
  const name = stringOrNull(raw.name);

  if (!id || !categoryId || !name) {
    return null;
  }

  return {
    id,
    category_id: categoryId,
    category_label: stringOrNull(raw.category_label) ?? categoryId,
    league: stringOrNull(raw.league) ?? "Unknown",
    source: stringOrNull(raw.source) ?? "cached exchange",
    source_url: stringOrNull(raw.source_url),
    fetched_at_epoch_ms: finiteNumberOrNull(raw.fetched_at_epoch_ms),
    pinned_at_epoch_ms: finiteNumberOrNull(raw.pinned_at_epoch_ms) ?? 0,
    name,
    icon_url: stringOrNull(raw.icon_url),
    details_id: stringOrNull(raw.details_id),
    item_category: stringOrNull(raw.item_category),
    price_in_primary: finiteNumberOrNull(raw.price_in_primary),
    quantity: finiteNumberOrNull(raw.quantity),
    history_change_percent: finiteNumberOrNull(raw.history_change_percent),
    sparkline: normalizeSparkline(raw.sparkline),
    primary_currency: normalizeCurrency(raw.primary_currency),
    quote_currencies: normalizeQuotes(raw.quote_currencies),
  };
}

function normalizeCurrency(value: unknown): ExchangeWatchlistCurrency | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const id = stringOrNull(raw.id);
  const name = stringOrNull(raw.name);
  if (!id || !name) {
    return null;
  }
  return {
    id,
    name,
    icon_url: stringOrNull(raw.icon_url),
  };
}

function normalizeQuotes(value: unknown): ExchangeWatchlistQuote[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((quote) => {
      if (!quote || typeof quote !== "object") {
        return null;
      }
      const raw = quote as Record<string, unknown>;
      const currency = normalizeCurrency(raw.currency);
      const perPrimary = finiteNumberOrNull(raw.per_primary);
      if (!currency || perPrimary === null) {
        return null;
      }
      return { currency, per_primary: perPrimary };
    })
    .filter((quote): quote is ExchangeWatchlistQuote => Boolean(quote));
}

function normalizeSparkline(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((point) => finiteNumberOrNull(point))
    .filter((point): point is number => point !== null);
}

function finiteNumberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}
