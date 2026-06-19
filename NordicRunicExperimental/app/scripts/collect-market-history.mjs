import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { gunzip, gzip } from "node:zlib";
import { promisify } from "node:util";

import { mergeRetainedSnapshots, selectComparisonBaseline } from "./market-history-policy.mjs";
import { normalizePoeNinjaAssetUrl } from "./market-feed-normalize.mjs";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const ROOT = process.cwd();
const OUTPUT_DIR = join(ROOT, process.env.MARKET_FEED_OUTPUT ?? "market-feed");
const HISTORY_PATH = join(ROOT, process.env.MARKET_HISTORY_PATH ?? ".market-history/history.json.gz");
const INDEX_URL = "https://poe.ninja/poe2/api/data/index-state";
const EXCHANGE_URL = "https://poe.ninja/poe2/api/economy/exchange/current/overview";
const STASH_URL = "https://poe.ninja/poe2/api/economy/stash/current/item/overview";
const RETENTION_MS = 8 * 24 * 60 * 60 * 1000;
const USER_AGENT = "Reliquary-Market-Collector/1.0";
const QUOTE_CURRENCY_ID = "divine";
const QUOTE_CURRENCY_LABEL = "Divine Orb";

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

const PERIODS = {
  "30m": {
    targetMs: 30 * 60 * 1000,
    toleranceMs: 20 * 60 * 1000,
    maxFallbackAgeMs: 4 * 60 * 60 * 1000,
    required: 2,
  },
  "1d": { targetMs: 24 * 60 * 60 * 1000, toleranceMs: 4 * 60 * 60 * 1000, required: 48 },
  "7d": { targetMs: 7 * 24 * 60 * 60 * 1000, toleranceMs: 12 * 60 * 60 * 1000, required: 336 },
};

await main();

async function main() {
  const now = Date.now();
  const history = await readHistory();
  const leagues = await discoverLeagues();
  const snapshots = [];

  for (const league of leagues) {
    const items = await collectLeague(league);
    if (!items.length) continue;
    const fingerprint = snapshotFingerprint(items);
    const previous = [...history.snapshots].reverse().find((snapshot) => snapshot.league === league);
    if (previous?.fingerprint === fingerprint) {
      console.log(`[${league}] upstream snapshot is unchanged; recording a zero-movement cadence checkpoint.`);
    }
    snapshots.push({ league, captured_at_epoch_ms: now, fingerprint, items });
  }

  history.snapshots = mergeRetainedSnapshots(history.snapshots, snapshots, now, RETENTION_MS);

  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  const manifest = {
    schema_version: 1,
    generated_at_epoch_ms: now,
    source: "poe.ninja shared snapshot collector",
    refresh_policy: "daily GitHub backup; primary live feed is served by Supabase",
    leagues: [],
  };

  for (const league of leagues) {
    const leagueSnapshots = history.snapshots.filter((snapshot) => snapshot.league === league);
    const leagueDir = join(OUTPUT_DIR, "leagues", leagueSlug(league));
    await mkdir(leagueDir, { recursive: true });
    for (const [period, config] of Object.entries(PERIODS)) {
      const dataset = buildDataset(league, period, config, leagueSnapshots, now);
      await writeJson(join(leagueDir, `market-${period}.json`), dataset);
    }
    manifest.leagues.push({ name: league, slug: leagueSlug(league), snapshots: leagueSnapshots.length });
  }

  await writeJson(join(OUTPUT_DIR, "manifest.json"), manifest);
  await writeHistory(history);
  console.log(`Published ${manifest.leagues.length} leagues from ${history.snapshots.length} retained snapshots.`);
}

async function discoverLeagues() {
  const explicit = (process.env.MARKET_LEAGUES ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (explicit.length) return explicit;
  const index = await fetchJson(INDEX_URL);
  const leagues = Array.isArray(index.economyLeagues) ? index.economyLeagues : [];
  const names = leagues
    .map((league) => String(league.name ?? "").trim())
    .filter((name) => name && !/\bssf\b|private/i.test(name));
  return [...new Set(names)].slice(0, Number(process.env.MARKET_MAX_LEAGUES ?? 6));
}

async function collectLeague(league) {
  const results = [];
  for (const category of CATEGORIES) {
    try {
      const params = new URLSearchParams({ league, type: category.type });
      if (category.feed === "stash") params.set("version", "current");
      const response = await fetchJson(`${category.feed === "stash" ? STASH_URL : EXCHANGE_URL}?${params}`);
      results.push(...normalizeCategory(response, category));
    } catch (error) {
      console.warn(`[${league}] ${category.label}: ${error instanceof Error ? error.message : error}`);
    }
  }
  return results;
}

function normalizeCategory(response, category) {
  if (!Array.isArray(response.lines)) return [];
  const itemById = new Map((response.items ?? []).map((item) => [String(item.id), item]));
  return response.lines.flatMap((line) => {
    const item = itemById.get(String(line.id));
    const id = String(line.detailsId ?? line.itemId ?? line.id ?? "").replace(/^"|"$/g, "");
    const name = String(line.name ?? item?.name ?? "").trim();
    const price = finiteNumber(line.primaryValue);
    const liquidity = finiteNumber(category.feed === "stash" ? line.listingCount : line.volumePrimaryValue);
    if (!id || !name || price === null || price <= 0 || liquidity === null || liquidity <= 0) return [];
    return [{
      id,
      category_id: category.id,
      category_label: category.label,
      name,
      icon_url: normalizePoeNinjaAssetUrl(line.icon ?? item?.image ?? item?.icon),
      price,
      liquidity,
    }];
  });
}

function buildDataset(league, period, config, snapshots, now) {
  const current = snapshots.at(-1) ?? null;
  const baseline = selectComparisonBaseline(
    snapshots,
    current,
    config.targetMs,
    config.toleranceMs,
    config.maxFallbackAgeMs,
  );
  const ready = Boolean(current && baseline && baseline !== current);
  const movers = ready ? calculateMovers(current.items, baseline.items) : { winners: [], losers: [] };
  return {
    schema_version: 1,
    league,
    period,
    status: ready ? "ready" : "building",
    generated_at_epoch_ms: current?.captured_at_epoch_ms ?? now,
    baseline_at_epoch_ms: ready ? baseline.captured_at_epoch_ms : null,
    comparison_window_ms: ready ? current.captured_at_epoch_ms - baseline.captured_at_epoch_ms : null,
    source: "poe.ninja shared snapshot collector",
    quote_currency_id: QUOTE_CURRENCY_ID,
    quote_currency_label: QUOTE_CURRENCY_LABEL,
    snapshots_collected: snapshots.length,
    snapshots_required: config.required,
    winners: movers.winners,
    losers: movers.losers,
  };
}

function calculateMovers(current, baseline) {
  const previousByKey = new Map(baseline.map((item) => [`${item.category_id}::${item.id}`, item]));
  const candidates = current.flatMap((item) => {
    const previous = previousByKey.get(`${item.category_id}::${item.id}`);
    if (!previous || previous.price <= 0 || item.price <= 0 || item.liquidity <= 0) return [];
    const change = ((item.price - previous.price) / previous.price) * 100;
    return Number.isFinite(change) && Math.abs(change) >= 0.0001 ? [{ item, previous, change }] : [];
  });
  const byCategory = Map.groupBy(candidates, (candidate) => candidate.item.category_id);
  const movers = [];
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
    winners: movers.filter((mover) => mover.change_percent > 0).sort((a, b) => b.score - a.score),
    losers: movers.filter((mover) => mover.change_percent < 0).sort((a, b) => b.score - a.score),
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/json" } });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

async function readHistory() {
  try {
    const compressed = await readFile(HISTORY_PATH);
    const parsed = JSON.parse((await gunzipAsync(compressed)).toString("utf8"));
    return { schema_version: 1, snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [] };
  } catch {
    return { schema_version: 1, snapshots: [] };
  }
}

async function writeHistory(history) {
  await mkdir(dirname(HISTORY_PATH), { recursive: true });
  await writeFile(HISTORY_PATH, await gzipAsync(JSON.stringify(history), { level: 9 }));
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value)}\n`, "utf8");
}

function leagueSlug(value) {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function snapshotFingerprint(items) {
  const stable = [...items]
    .sort((left, right) => `${left.category_id}:${left.id}`.localeCompare(`${right.category_id}:${right.id}`))
    .map((item) => [item.category_id, item.id, item.price, item.liquidity]);
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

function percentileRank(values, value) {
  if (values.length <= 1) return 1;
  return Math.max(0, Math.min(1, (values.filter((candidate) => candidate <= value).length - 1) / (values.length - 1)));
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
