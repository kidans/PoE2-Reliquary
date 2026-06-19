import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildMarketDataset,
  MARKET_PERIODS,
  selectPublishedMarketDataset,
  type MarketDataset,
  type MarketItem,
  type MarketPeriod,
  type MarketSnapshot,
} from "../_shared/market-engine.ts";
import { normalizePoeNinjaCategory } from "../_shared/poe-ninja-normalize.ts";

const INDEX_URL = "https://poe.ninja/poe2/api/data/index-state";
const EXCHANGE_URL = "https://poe.ninja/poe2/api/economy/exchange/current/overview";
const STASH_URL = "https://poe.ninja/poe2/api/economy/stash/current/item/overview";
const USER_AGENT = "Reliquary-Supabase-Market-Collector/1.0";
const RETENTION_DAYS = 8;

const CATEGORIES = [
  ["currency", "Currency", "exchange", "Currency"],
  ["fragments", "Fragments", "exchange", "Fragments"],
  ["abyss", "Abyssal Bones", "exchange", "Abyss"],
  ["uncut-gems", "Uncut Gems", "exchange", "UncutGems"],
  ["gems", "Lineage Gems", "exchange", "LineageSupportGems"],
  ["essences", "Essences", "exchange", "Essences"],
  ["soul-cores", "Soul Cores", "exchange", "SoulCores"],
  ["idols", "Idols", "exchange", "Idols"],
  ["runes", "Runes", "exchange", "Runes"],
  ["ritual", "Omens", "exchange", "Ritual"],
  ["expedition", "Expedition", "exchange", "Expedition"],
  ["delirium", "Liquid Emotions", "exchange", "Delirium"],
  ["breach", "Catalysts", "exchange", "Breach"],
  ["verisium", "Verisium", "exchange", "Verisium"],
  ["unique-weapons", "Unique Weapons", "stash", "UniqueWeapons"],
  ["unique-armours", "Unique Armours", "stash", "UniqueArmours"],
  ["unique-accessories", "Unique Accessories", "stash", "UniqueAccessories"],
  ["unique-flasks", "Unique Flasks", "stash", "UniqueFlasks"],
  ["unique-charms", "Unique Charms", "stash", "UniqueCharms"],
  ["unique-jewels", "Unique Jewels", "stash", "UniqueJewels"],
  ["unique-maps", "Unique Maps", "stash", "UniqueMaps"],
  ["unique-relics", "Unique Relics", "stash", "UniqueSanctumRelics"],
].map(([id, label, feed, type]) => ({ id, label, feed, type }));

Deno.serve(async (request) => {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authorized, error: authorizationError } = await supabase.rpc("authorize_market_collector", {
    candidate: request.headers.get("x-collector-secret"),
  });
  if (authorizationError || !authorized) return json({ error: "unauthorized" }, 401);

  const { data: canStart, error: startError } = await supabase.rpc("try_start_market_collection", {
    minimum_interval: "25 minutes",
  });
  if (startError) return json({ error: startError.message }, 500);
  if (!canStart) return json({ status: "skipped", reason: "collector recently ran or is already running" });

  try {
    const now = Date.now();
    const leagues = await discoverLeagues();
    const result = [];
    for (const league of leagues) {
      const items = await collectLeague(league);
      if (!items.length) continue;
      const capturedAt = new Date(now).toISOString();
      const fingerprint = await snapshotFingerprint(items);
      const { error: insertError } = await supabase.from("market_snapshots").insert({
        league,
        captured_at: capturedAt,
        fingerprint,
        items,
        item_count: items.length,
      });
      if (insertError) throw insertError;

      const { count: snapshotCount, error: countError } = await supabase
        .from("market_snapshots")
        .select("id", { count: "exact", head: true })
        .eq("league", league);
      if (countError) throw countError;

      const current: MarketSnapshot = { captured_at_epoch_ms: now, items };
      for (const period of Object.keys(MARKET_PERIODS) as MarketPeriod[]) {
        const baseline = await findBaseline(supabase, league, current, period);
        const dataset = buildMarketDataset(
          league,
          period,
          baseline ? [baseline, current] : [current],
          now,
        );
        dataset.snapshots_collected = snapshotCount ?? 1;
        const previousDataset = await findPreviousMarketBoard(supabase, league, period);
        const publishedDataset = selectPublishedMarketDataset(dataset, previousDataset);
        const { error: boardError } = await supabase.from("market_boards").upsert({
          league,
          period,
          payload: publishedDataset,
          generated_at: capturedAt,
          updated_at: capturedAt,
        }, { onConflict: "league,period" });
        if (boardError) throw boardError;
      }
      result.push({ league, items: items.length });
    }

    const { error: pruneError } = await supabase.rpc("prune_market_snapshots", {
      retention: `${RETENTION_DAYS} days`,
    });
    if (pruneError) throw pruneError;
    await supabase.rpc("finish_market_collection", {
      result_status: "success",
      result_detail: JSON.stringify(result),
    });
    return json({ status: "success", leagues: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.rpc("finish_market_collection", { result_status: "error", result_detail: message });
    return json({ error: message }, 500);
  }
});

async function discoverLeagues() {
  const explicit = (Deno.env.get("MARKET_LEAGUES") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (explicit.length) return explicit;
  const index = await fetchJson(INDEX_URL);
  const leagues = Array.isArray(index.economyLeagues) ? index.economyLeagues : [];
  return [...new Set(leagues
    .map((league: Record<string, unknown>) => String(league.name ?? "").trim())
    .filter((name: string) => name && !/\bssf\b|private/i.test(name)))]
    .slice(0, Number(Deno.env.get("MARKET_MAX_LEAGUES") ?? 6));
}

async function collectLeague(league: string) {
  const results: MarketItem[] = [];
  for (const category of CATEGORIES) {
    try {
      const endpoint = category.feed === "exchange" ? EXCHANGE_URL : STASH_URL;
      const url = `${endpoint}?league=${encodeURIComponent(league)}&type=${encodeURIComponent(category.type)}`;
      results.push(...normalizePoeNinjaCategory(await fetchJson(url), category));
    } catch (error) {
      console.warn(`[${league}] ${category.label}: ${error instanceof Error ? error.message : error}`);
    }
  }
  return results.sort((left, right) => `${left.category_id}:${left.id}`.localeCompare(`${right.category_id}:${right.id}`));
}

async function findBaseline(
  supabase: ReturnType<typeof createClient>,
  league: string,
  current: MarketSnapshot,
  period: MarketPeriod,
) {
  const config = MARKET_PERIODS[period];
  const target = current.captured_at_epoch_ms - config.targetMs;
  const lower = new Date(target - config.toleranceMs).toISOString();
  const upper = new Date(target + config.toleranceMs).toISOString();
  const { data, error } = await supabase
    .from("market_snapshots")
    .select("captured_at,items")
    .eq("league", league)
    .gte("captured_at", lower)
    .lte("captured_at", upper)
    .lt("captured_at", new Date(current.captured_at_epoch_ms).toISOString())
    .order("captured_at", { ascending: false })
    .limit(8);
  if (error) throw error;

  const candidates = (data ?? []).map(databaseSnapshot);
  let baseline = candidates.sort((left, right) =>
    Math.abs(left.captured_at_epoch_ms - target) - Math.abs(right.captured_at_epoch_ms - target)
  )[0] ?? null;
  if (!baseline && config.maxFallbackAgeMs) {
    const fallbackFloor = new Date(current.captured_at_epoch_ms - config.maxFallbackAgeMs).toISOString();
    const { data: fallback, error: fallbackError } = await supabase
      .from("market_snapshots")
      .select("captured_at,items")
      .eq("league", league)
      .gte("captured_at", fallbackFloor)
      .lt("captured_at", new Date(current.captured_at_epoch_ms).toISOString())
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fallbackError) throw fallbackError;
    baseline = fallback ? databaseSnapshot(fallback) : null;
  }
  return baseline;
}

async function findPreviousMarketBoard(
  supabase: ReturnType<typeof createClient>,
  league: string,
  period: MarketPeriod,
): Promise<MarketDataset | null> {
  const { data, error } = await supabase
    .from("market_boards")
    .select("payload")
    .eq("league", league)
    .eq("period", period)
    .maybeSingle();
  if (error) throw error;
  return (data?.payload as MarketDataset | undefined) ?? null;
}

function databaseSnapshot(row: { captured_at: string; items: MarketItem[] }): MarketSnapshot {
  return { captured_at_epoch_ms: Date.parse(row.captured_at), items: row.items };
}

async function fetchJson(url: string) {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/json" } });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

async function snapshotFingerprint(items: MarketItem[]) {
  const bytes = new TextEncoder().encode(JSON.stringify(items.map((item) => [item.id, item.price, item.liquidity])));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
