import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  PRICE_PROFILES,
  activeFilterSignature,
  activePriceFiltersForSelection,
  appliedSpecKeySet,
  cleanTradeMarkup,
  filteredListingRanks,
  hardPriceFiltersForSelection,
  isItemValueModifier,
  itemProfile,
  itemSpecs,
  listingMatchesSelectedPriceOption,
  priceProfileLabel,
  profileSpecKeySet,
  specTemplate,
  type CurrencyMeta,
  type ItemSpec,
  type ListingRank,
  type Poe2DbDataSnapshot,
  type PriceCheck,
  type PriceFilter,
  type PriceListing,
  type PriceProfileId,
  type ScannedItem,
  type TradeRateLimit,
} from "./evaluate";
import guideData from "./campaign-guide.json";
import "./styles.css";

type GuideStep = {
  text: string;
  loc?: string | null;
  reward?: string | null;
  tags: string[];
};

type GuideZone = {
  name: string;
  level: string;
  waypoint: boolean;
  town: boolean;
  steps: GuideStep[];
};

type GuideAct = {
  act: number;
  name: string;
  level_range: string;
  rewards: string[];
  zones: GuideZone[];
};

type TabId = "scan" | "trade" | "data" | "settings";

type CurrentAreaInfo = {
  name: string;
  area_level: number | null;
  area_type: string;
  entered_at_epoch_ms: number;
  act: number | null;
  waystone_mod_count: number | null;
  waystone_quantity: number | null;
  waystone_rarity: number | null;
  waystone_pack_size: number | null;
  waystone_hazard_count: number | null;
  boss: string | null;
};

type WorldAreaStatus = {
  state: string;
  source: string;
  count: number;
  cache_path: string;
  error: string | null;
};

type AppState = {
  scanned_item: ScannedItem | null;
  trade_queue: TradeWhisper[];
  current_zone: string;
  current_area: CurrentAreaInfo | null;
  world_area_status: WorldAreaStatus;
  trade_league: string;
  league_catalog: LeagueCatalogEntry[];
  trade_leagues: TradeLeague[];
  data_leagues: DataLeague[];
  source_truth_snapshot: Poe2DbDataSnapshot | null;
  price_check: PriceCheck | null;
  exchange_tab: ExchangeTabState;
  price_currency: string;
  price_option: string;
  debug_log_path: string | null;
};


type ListingPreviewRequest = {
  listing: PriceListing;
  family: string | null;
};

type ValueLineEntry = {
  label: string;
  value: string;
  spec: ItemSpec | null;
};

type PriceEstimate = {
  amount: number | null;
  low: number | null;
  high: number | null;
  reliability: string;
  reliabilityClass: string;
  currencyId: string;
  currencyName: string;
  iconUrl: string | null;
};

type TradeWhisper = {
  buyer_name: string;
  item: string;
  price: string;
  league: string;
  tab_coordinates: TabCoordinates | null;
};

type TabCoordinates = {
  tab_name: string;
  left: number;
  top: number;
};

type WorkerStatus = {
  worker: string;
  message: string;
};

type AppSettings = {
  accentHue: number;
  panelAlpha: number;
  saturation: number;
  scanMod: "Ctrl" | "Alt";
  scanKey: string;
  tradeMod: "Ctrl" | "Alt";
  tradeKey: string;
};

type TradeLeague = {
  id: string;
  text: string;
};

type LeagueCatalogEntry = {
  id: string;
  display_name: string;
  official_trade_id: string | null;
  poe_ninja_name: string | null;
  poe_ninja_slug: string | null;
  hardcore: boolean;
  indexed: boolean;
  trade_enabled: boolean;
  exchange_enabled: boolean;
  discovered_at: string | null;
  expansion: string | null;
  source_tags: string[];
  note: string | null;
};

type DataLeague = {
  id: string;
  name: string;
  version: string | null;
  expansion: string | null;
  starts_at: string | null;
  source: string;
  trade_enabled: boolean;
  note: string | null;
};

type NormalizedItemFamily = {
  family: string;
  poe2db_section: string;
  item_classes: string[];
  notes: string;
};

type Poe2DbAdapterStatus = {
  state: string;
  message: string;
  fresh: boolean;
  cache_age_seconds: number | null;
  pages_cached: number;
  pages_failed: number;
  failed_pages: string[];
  quality?: {
    total_tiers: number;
    empty_roll_band_tiers: number;
    normal_affix_tiers: number;
    normal_unknown_affix_tiers: number;
    non_affix_tiers: number;
    unknown_affix_tiers: number;
    source_kind_counts: Record<string, number>;
  };
};

type ExchangeCategory = {
  id: string;
  label: string;
  poe_ninja_type: string | null;
  poe_ninja_slug: string | null;
  available: boolean;
};

type ExchangeEntry = {
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

type ExchangeOverview = {
  category_id: string;
  category_label: string;
  league: string;
  source: string;
  source_url: string;
  fetched_at_epoch_ms: number;
  primary_currency: CurrencyMeta | null;
  secondary_currency: CurrencyMeta | null;
  quote_currencies: ExchangeQuoteCurrency[];
  entries: ExchangeEntry[];
};

type ExchangeQuoteCurrency = {
  currency: CurrencyMeta;
  per_primary: number;
};

type ExchangeTabState = {
  categories: ExchangeCategory[];
  selected_category_id: string;
  selected_item_id: string | null;
  overview: ExchangeOverview | null;
  selected_quote_currency_id?: string | null;
  status: string;
  error: string | null;
};

const root = document.querySelector<HTMLDivElement>("#root");
const previewMode = new URLSearchParams(window.location.search).get("preview");
const isListingPreviewWindow = previewMode === "listing";

if (!root) {
  throw new Error("Lumen-Scan root element was not found.");
}

const state: AppState = {
  scanned_item: null,
  trade_queue: [],
  current_zone: "Unknown",
  current_area: null,
  world_area_status: {
    state: "warming",
    source: "unknown",
    count: 0,
    cache_path: "",
    error: null,
  },
  trade_league: "Fate of the Vaal",
  league_catalog: [],
  trade_leagues: [],
  data_leagues: [],
  source_truth_snapshot: null,
  price_check: null,
  exchange_tab: fallbackExchangeTab(),
  price_currency: "exalted",
  price_option: "equivalent",
  debug_log_path: null,
};

let activeTab: TabId = "scan";
let workerMessages: WorkerStatus[] = [];
let compactMode = false;
let selectedSpecKeys = new Set<string>();
let selectedPriceProfile: PriceProfileId = "quick";
let appliedWindowLayout: "scan" | "trade" | "settings" | "idle" | "default" | "compact" | null = null;
let evaluateLayoutFrame = 0;
let tradeSearchQuery = "";
let loadingMoreMarketplaceResults = false;
let hoveredListingPreview: ListingPreviewRequest | null = null;
let pinnedListingPreviewIndex: number | null = null;
let previewPollHandle = 0;
let latestRequestedFilterSignature: string | null = null;
let activeFilterPushTimer = 0;

const campaignGuideActs = guideData.acts;
let campaignTimerRunning = false;
let campaignGuidePage = 0;
let campaignGuideAct = 0;
let campaignActTimes: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
let campaignTotalMs = 0;
let campaignExpanded = false;
let campaignTimerHandle = 0;
let campaignCompletedSteps = new Set<string>();
let campaignCurrentZone = "";
const CAMPAIGN_STORAGE_KEY = "reliquary.campaign.progress";

const INTERLUDE_ZONE_MAP: Record<string, string> = {
  "scorched farmlands": "Interlude 5.1 — Ogham, The Refuge",
  "stones of serle": "Interlude 5.1 — Ogham, The Refuge",
  "the blackwood": "Interlude 5.1 — Ogham, The Refuge",
  "holten": "Interlude 5.1 — Ogham, The Refuge",
  "wolvenhold": "Interlude 5.1 — Ogham, The Refuge",
  "holten estate": "Interlude 5.1 — Ogham, The Refuge",
  "the refuge": "Interlude 5.1 — Ogham, The Refuge",
  "the khari crossing": "Interlude 5.2 — Khari Bazaar",
  "pools of khatal": "Interlude 5.2 — Khari Bazaar",
  "sel khari sanctuary": "Interlude 5.2 — Khari Bazaar",
  "river barrens": "Interlude 5.2 — Khari Bazaar",
  "the galai gates": "Interlude 5.2 — Khari Bazaar",
  "qimah": "Interlude 5.2 — Khari Bazaar",
  "qimah reservoir": "Interlude 5.2 — Khari Bazaar",
  "the khari bazaar": "Interlude 5.2 — Khari Bazaar",
  "ashen forest": "Interlude 5.3 — Mount Kriar, The Glade",
  "kriar village": "Interlude 5.3 — Mount Kriar, The Glade",
  "glacial tarn": "Interlude 5.3 — Mount Kriar, The Glade",
  "howling caves": "Interlude 5.3 — Mount Kriar, The Glade",
  "kriar peaks": "Interlude 5.3 — Mount Kriar, The Glade",
  "etched ravine": "Interlude 5.3 — Mount Kriar, The Glade",
  "the cuachic vault": "Interlude 5.3 — Mount Kriar, The Glade",
  "the glade": "Interlude 5.3 — Mount Kriar, The Glade",
  "interlude": "Maps / Endgame",
};

function saveCampaignProgress() {
  try {
    localStorage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify({
      completedSteps: [...campaignCompletedSteps],
      currentZone: campaignCurrentZone,
      guidePage: campaignGuidePage,
      actTimes: campaignActTimes,
      totalMs: campaignTotalMs,
    }));
  } catch { /* ignore */ }
}

function loadCampaignProgress() {
  try {
    const raw = localStorage.getItem(CAMPAIGN_STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      campaignCompletedSteps = new Set(data.completedSteps ?? []);
      campaignCurrentZone = data.currentZone ?? "";
      campaignGuidePage = data.guidePage ?? 0;
      if (Array.isArray(data.actTimes) && data.actTimes.length >= 5) {
        campaignActTimes = data.actTimes;
      }
      if (typeof data.totalMs === "number") {
        campaignTotalMs = data.totalMs;
      }
    }
  } catch { /* ignore */ }
}

function stepKey(act: number, zoneName: string, stepIndex: number) {
  return `${act}:${zoneName}:${stepIndex}`;
}

function findCurrentZoneInGuide() {
  const areaName = state.current_area?.name ?? "";
  if (!areaName) return null;
  const act = campaignGuideActs.find(a => a.act === campaignGuideAct);
  if (!act) return null;
  const name = areaName.toLowerCase().trim();

  if (campaignGuideAct === 5) {
    const mapped = INTERLUDE_ZONE_MAP[name];
    if (mapped) return act.zones.find(z => z.name === mapped) ?? null;
  }

  return act.zones.find(z => z.name.toLowerCase().trim() === name)
    ?? act.zones.find(z => name.includes(z.name.toLowerCase().trim()))
    ?? act.zones.find(z => z.name.toLowerCase().trim().includes(name))
    ?? null;
}

function findNextIncompleteStep() {
  const zone = findCurrentZoneInGuide();
  if (!zone || !zone.steps.length) return null;
  for (let i = 0; i < zone.steps.length; i++) {
    const key = stepKey(campaignGuideAct, zone.name, i);
    if (!campaignCompletedSteps.has(key)) {
      return { step: zone.steps[i], index: i, zone };
    }
  }
  return null;
}

function toggleCampaignStep() {
  const next = findNextIncompleteStep();
  if (!next) return;
  const key = stepKey(campaignGuideAct, next.zone.name, next.index);
  if (campaignCompletedSteps.has(key)) {
    campaignCompletedSteps.delete(key);
  } else {
    campaignCompletedSteps.add(key);
  }
  saveCampaignProgress();
}

function startCampaignTimer() {
  if (campaignTimerHandle) return;
  campaignTimerRunning = true;
  let tick = 0;
  campaignTimerHandle = window.setInterval(() => {
    if (!campaignTimerRunning) return;
    const actIdx = Math.max(0, campaignGuideAct - 1);
    campaignActTimes[actIdx] += 1000;
    campaignTotalMs += 1000;
    tick++;
    const compact = root?.querySelector<HTMLElement>("[data-compact-meta]");
    if (compact && campaignGuideAct > 0) {
      compact.textContent = compactMetaText("");
    }
    if (tick % 30 === 0) saveCampaignProgress();
  }, 1000);
}

function stopCampaignTimer() {
  campaignTimerRunning = false;
  window.clearInterval(campaignTimerHandle);
  campaignTimerHandle = 0;
}
let requestedScanWindowHeight = 0;
const PRICE_REQUEST_COOLDOWN_MS = 10_000;
const recentPriceRequestSignatures = new Map<string, number>();

const SETTINGS_STORAGE_KEY = "reliquary.ui.settings";
const DEFAULT_APP_SETTINGS: AppSettings = {
  accentHue: 355,
  panelAlpha: 0.98,
  saturation: 100,
  scanMod: "Ctrl",
  scanKey: "C",
  tradeMod: "Alt",
  tradeKey: "D",
};
let appSettings = readAppSettings();
applyAppSettings(appSettings);
loadCampaignProgress();

const LOCAL_CURRENCY_ICONS: Record<string, string> = {
  exalted: "/currency/exalted.webp",
  divine: "/currency/divine.webp",
  regal: "/currency/regal.webp",
  transmute: "/currency/transmute.webp",
  chaos: "/currency/chaos.webp",
  vaal: "/currency/vaal.webp",
  alch: "/currency/alchemy.webp",
  annul: "/currency/annul.webp",
  chance: "/currency/chance.webp",
  aug: "/currency/augment.webp",
  mirror: "/currency/mirror.png",
};

const CURRENCY_ICON_ALIASES: Record<string, string> = {
  alchemy: "alch",
  augment: "aug",
};

root.innerHTML = isListingPreviewWindow
  ? `
    <main class="preview-overlay-root">
      <section class="listing-preview-shell" data-preview-panel></section>
    </main>
  `
  : `
    <main class="overlay-root">
      <section class="hud-card interactive" data-interactive>
        <header class="hud-header" data-drag-handle>
          <div class="brand-lockup">
            <h1 class="brand-title">reliquary</h1>
          </div>
          <div class="zone-label" data-zone>Unknown</div>
          <div class="window-controls">
            <select class="league-select" data-league aria-label="Trade league">
              <option>Fate of the Vaal</option>
              <option>HC Fate of the Vaal</option>
              <option>Standard</option>
              <option>Hardcore</option>
            </select>
            <button class="chrome-button chrome-button-line" data-toggle-compact type="button" title="Line mode" aria-label="Line mode">_</button>
            <button class="chrome-button chrome-button-close" data-close-app type="button" title="Exit" aria-label="Exit">x</button>
          </div>
        </header>

        <div class="compact-strip" data-drag-handle>
          <div>
            <span data-compact-title>Reliquary ready</span>
            <strong data-compact-meta>Ctrl+C scan | Alt+D trade</strong>
          </div>
          <div class="compact-checklist" data-compat-checklist></div>
          <div class="compact-difficulty-bar" aria-hidden="true"></div>
          <button class="chrome-button" data-toggle-compact type="button">Open</button>
        </div>

        <nav class="tab-row" aria-label="Overlay panels">
          <button class="tab-button" data-tab="scan" type="button" title="Scan">
            <span class="tab-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M8 4H5a1 1 0 0 0-1 1v3M16 4h3a1 1 0 0 1 1 1v3M8 20H5a1 1 0 0 1-1-1v-3M16 20h3a1 1 0 0 0 1-1v-3"/><path d="M7 12h10M12 7v10"/></svg>
            </span>
            <span class="tab-label">Scan</span>
          </button>
          <button class="tab-button" data-tab="trade" type="button" title="Trade">
            <span class="tab-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M5 7h14M7 5l-2 2 2 2M19 17H5M17 15l2 2-2 2"/><path d="M8 12h8"/></svg>
            </span>
            <span class="tab-label">Trade</span>
          </button>
          <button class="tab-button" data-tab="data" type="button" title="Data">
            <span class="tab-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3Z"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>
            </span>
            <span class="tab-label">Data</span>
          </button>
          <button class="tab-button tab-button-icon" data-tab="settings" type="button" title="Settings" aria-label="Settings">
            <span class="tab-icon" aria-hidden="true">
            <svg class="tab-cog" viewBox="0 0 24 24">
              <path d="M12 8.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6Z" />
              <path d="M18.6 13.4c.1-.5.1-.9.1-1.4s0-.9-.1-1.4l2-1.5-1.9-3.3-2.4 1a8.2 8.2 0 0 0-2.3-1.3L13.7 3h-3.8l-.4 2.5a8.2 8.2 0 0 0-2.3 1.3l-2.3-1L3 9.1l2 1.5c-.1.5-.1.9-.1 1.4s0 .9.1 1.4l-2 1.5 1.9 3.3 2.3-1a8.2 8.2 0 0 0 2.3 1.3l.4 2.5h3.8l.4-2.5a8.2 8.2 0 0 0 2.3-1.3l2.4 1 1.9-3.3-2.1-1.5Z" />
            </svg>
            </span>
            <span class="tab-label">Settings</span>
          </button>
        </nav>

        <div class="panel" data-panel></div>
      </section>
    </main>
  `;

const panelElement = root.querySelector<HTMLElement>(isListingPreviewWindow ? "[data-preview-panel]" : "[data-panel]");
const zoneElement = isListingPreviewWindow ? null : root.querySelector<HTMLElement>("[data-zone]");
const leagueElement = isListingPreviewWindow ? null : root.querySelector<HTMLSelectElement>("[data-league]");
const hudElement = isListingPreviewWindow ? null : root.querySelector<HTMLElement>(".hud-card");
const compactTitleElement = isListingPreviewWindow ? null : root.querySelector<HTMLElement>("[data-compact-title]");
const compactMetaElement = isListingPreviewWindow ? null : root.querySelector<HTMLElement>("[data-compact-meta]");
const checklistElement = isListingPreviewWindow ? null : root.querySelector<HTMLElement>("[data-compat-checklist]");
const tabButtons = isListingPreviewWindow
  ? []
  : Array.from(root.querySelectorAll<HTMLButtonElement>("[data-tab]"));

if (!panelElement || (!isListingPreviewWindow && (!zoneElement || !leagueElement || !hudElement || !compactTitleElement || !compactMetaElement))) {
  throw new Error("Reliquary UI shell failed to initialize.");
}

function render() {
  if (isListingPreviewWindow) {
    panelElement!.innerHTML = renderListingPreviewWindow(hoveredListingPreview);
    return;
  }

  zoneElement!.textContent = state.current_zone || "Unknown";
  renderLeagueOptions();
  hudElement!.classList.toggle("is-compact", compactMode);
  hudElement!.dataset.tab = activeTab;
  panelElement!.dataset.tab = activeTab;

  tabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === activeTab);
  });

  const lastStatus =
    workerMessages.slice(-1)[0]?.message ??
    "Ctrl+C scans items. Alt+D opens the latest trade search.";

  compactTitleElement!.textContent = compactTitleText(state.scanned_item);
  compactMetaElement!.textContent = compactMetaText(lastStatus);
  compactMetaElement!.classList.toggle("timer-running", campaignTimerRunning && campaignGuideAct > 0);
  renderCampaignChecklist();

  if (campaignGuideAct > 0 && compactTitleElement) {
    const text = compactTitleElement.textContent ?? "";
    if (text.length > 68) {
      const overflow = text.length - 68;
      compactTitleElement.style.setProperty("--scroll-distance", `${-overflow * 7}px`);
      compactTitleElement.style.setProperty("--scroll-duration", `${Math.max(10, overflow / 4)}s`);
      compactTitleElement.classList.add("scroll-text");
    } else {
      compactTitleElement.classList.remove("scroll-text");
    }
  }

  const compactStrip = root?.querySelector<HTMLElement>(".compact-strip");
  if (compactStrip) {
    compactStrip.classList.toggle("is-mapping", state.current_area?.area_type === "map");
    compactStrip.classList.toggle("is-hideout", state.current_area?.area_type === "hideout");
    compactStrip.classList.toggle("is-campaign", campaignGuideAct > 0);
    hudElement!.classList.toggle("compact-checklist-expanded", campaignExpanded && campaignGuideAct > 0);
  }

  const difficultyBar = root?.querySelector<HTMLElement>(".compact-difficulty-bar");
  if (difficultyBar) {
    const hazardCount = state.current_area?.waystone_hazard_count ?? 0;
    const modCount = state.current_area?.waystone_mod_count ?? 0;
    const pct = modCount > 0 ? Math.round((hazardCount / modCount) * 100) : 0;
    difficultyBar.style.setProperty("--difficulty-pct", `${pct}%`);
    difficultyBar.classList.toggle("has-hazards", hazardCount > 0);
  }

  if (!compactMode) {
    if (activeTab === "scan") {
      panelElement!.innerHTML = renderScanPanel(state.scanned_item, state.price_check);
      queueEvaluateLayoutSync();
    }

    if (activeTab === "trade") {
      panelElement!.innerHTML = renderTradePanel(state.exchange_tab);
      hoveredListingPreview = null;
      void invoke("hide_listing_preview").catch((error) => pushStatus("preview", String(error)));

      if (!state.exchange_tab.overview && !state.exchange_tab.status.includes("Loading")) {
        const cat = state.exchange_tab.selected_category_id || "currency";
        state.exchange_tab.status = `Loading ${exchangeCategoryLabel(cat)} overview...`;
        void invoke("set_exchange_category", { categoryId: cat }).catch((err) =>
          pushStatus("exchange", String(err)),
        );
      }
    }

    if (activeTab === "data") {
      panelElement!.innerHTML = renderDataPanel();
      hoveredListingPreview = null;
      void invoke("hide_listing_preview").catch((error) => pushStatus("preview", String(error)));
    }

    if (activeTab === "settings") {
      panelElement!.innerHTML = renderSettingsPanel();
      hoveredListingPreview = null;
      void invoke("hide_listing_preview").catch((error) => pushStatus("preview", String(error)));
    }
  }

  syncWindowLayout();
}

function renderLeagueOptions() {
  if (isListingPreviewWindow || !leagueElement) {
    return;
  }

  const leagues = state.league_catalog.length
    ? state.league_catalog
        .filter((league) => league.trade_enabled || league.exchange_enabled)
        .map((league) => ({
          id: league.official_trade_id ?? league.display_name,
          text:
            league.trade_enabled && league.exchange_enabled
              ? league.display_name
              : `${league.display_name} (${league.trade_enabled ? "trade only" : "exchange/data"})`,
        }))
    : state.trade_leagues.length
      ? state.trade_leagues
    : [
        { id: "Fate of the Vaal", text: "Fate of the Vaal" },
        { id: "HC Fate of the Vaal", text: "HC Fate of the Vaal" },
        { id: "Standard", text: "Standard" },
        { id: "Hardcore", text: "Hardcore" },
      ];

  const leagueSignature = leagues.map((league) => league.id).join("|");
  if (leagueElement.dataset.signature !== leagueSignature) {
    leagueElement.innerHTML = leagues
      .map(
        (league) =>
          `<option value="${escapeAttribute(league.id)}">${escapeHtml(league.text)}</option>`,
      )
      .join("");
    leagueElement.dataset.signature = leagueSignature;
  }

  leagueElement.value = state.trade_league;
}

function renderListingPreviewWindow(preview: ListingPreviewRequest | null) {
  if (!preview) {
    return `
      <section class="listing-preview-card empty-preview">
        <p class="section-label">Listing Preview</p>
        <p>Click the <strong>View</strong> button on a marketplace row to inspect that fetched listing.</p>
      </section>
    `;
  }

  const { listing, family } = preview;
  const rarity = listing.preview_rarity ?? "Rare";
  const rarityClass = rarityClassName(rarity);
  const itemClass = listing.preview_item_class ?? family ?? "Listing";
  const baseType = listing.preview_base_type ?? listing.preview_name ?? "Unknown item";
  const bannerTitle = rarity.toLowerCase() === "unique" ? listing.preview_name ?? baseType : baseType;
  const valueEntries = previewValueEntries(listing, family);
  const modifierGroups = previewModifierGroups(listing.explicit_mods);
  const previewDescription = listing.preview_description
    ? `<p class="preview-description">${escapeHtml(listing.preview_description)}</p>`
    : "";
  const iconMarkup = listing.preview_icon_url
    ? `<div class="preview-icon-wrap"><img class="preview-item-icon" src="${escapeAttribute(listing.preview_icon_url)}" alt="" /></div>`
    : "";

  return `
    <section class="listing-preview-card ${rarityClass}">
      <div class="poe-item-banner">
        <div class="banner-corner banner-corner-left" aria-hidden="true"></div>
        <div class="banner-center">
          <p class="banner-subtitle">${escapeHtml(rarity)} ${escapeHtml(itemClass)}</p>
          <h2 class="banner-title">${escapeHtml(bannerTitle)}</h2>
        </div>
        <div class="banner-corner banner-corner-right" aria-hidden="true"></div>
      </div>
      <div class="listing-preview-body">
        ${iconMarkup}
        <div class="profile-pills">
          ${renderPreviewPills(listing)}
        </div>
        ${renderPreviewValueLines(valueEntries)}
        <div class="mod-chip-stack">
          ${renderPreviewModifierSections(modifierGroups)}
        </div>
        ${previewDescription}
        <div class="preview-listing-meta">
          <span><strong>Seller</strong>${escapeHtml(listing.seller ?? "Unknown")}</span>
          <span><strong>Price</strong>${escapeHtml(listing.price)}</span>
          <span><strong>Listed</strong>${escapeHtml(formatListed(listing.listed))}</span>
        </div>
      </div>
    </section>
  `;
}

let compactRuntimeHandle = 0;

function rewardColor(tags: string[], reward: string | null): string {
  if (tags.includes("choice")) return "#6ee07a";
  if (tags.includes("skill") || tags.includes("spirit")) return "var(--gold-bright)";
  if (tags.includes("life")) return "#e0705a";
  if (tags.includes("mana")) return "#6cb4ee";
  if (tags.includes("res")) {
    if (reward?.includes("Cold")) return "#6cb4ee";
    if (reward?.includes("Fire")) return "#e0705a";
    return "var(--gold-bright)";
  }
  return "var(--vellum-dim)";
}

function actDisplayName(act: number) {
  const numerals = ["", "I", "II", "III", "IV", "V"];
  return act > 0 ? `ACT ${numerals[act] ?? act}` : "INTERLUDE";
}

function remapCampaignAct(raw: number): number {
  if (raw >= 1 && raw <= 4) return raw;
  if (raw === 6) return 5;
  return 0;
}

function compactTitleText(item: ScannedItem | null) {
  if (campaignGuideAct > 0) {
    const next = findNextIncompleteStep();
    if (next) {
      const zone = next.zone;
      const reward = next.step.reward ? ` \u00B7 ${next.step.reward}` : "";
      const done = zone.steps.filter((_, i) =>
        campaignCompletedSteps.has(stepKey(campaignGuideAct, zone.name, i))
      ).length;
      return `${next.step.text}${reward} \u00B7 ${done}/${zone.steps.length} \u25B8`;
    }
    return "All tasks complete \u00B7 enter next zone";
  }

  if (state.current_area?.area_type === "map") {
    const area = state.current_area;
    const tier = area.area_level ? `L${area.area_level}` : "";
    const boss = area.boss ? ` \u00B7 ${area.boss}` : "";
    return `${tier} ${area.name}${boss}`.trim();
  }

  if (state.current_area?.area_type === "hideout") {
    return "Trade Mode";
  }

  if (state.current_area?.area_type === "town") {
    return state.current_area.name;
  }

  if (!item) {
    return "Reliquary | waiting for item";
  }

  const hazardPrefix = item.hazards.length ? "WARNING | " : "";
  return `${hazardPrefix}${item.name}`;
}

function compactMetaText(status: string) {
  if (campaignGuideAct > 0) {
    const actTime = formatCampaignTime(campaignActTimes[Math.max(0, campaignGuideAct - 1)] ?? 0);
    const total = formatCampaignTime(campaignTotalMs);
    const area = state.current_area;
    const zoneName = area?.name ?? "";
    const glow = campaignTimerRunning ? " \u25CF" : " \u25CB";
    return `${actDisplayName(campaignGuideAct)} \u00B7 ${zoneName} \u00B7 ${actTime} / ${total}${glow}`;
  }

  if (state.current_area?.area_type === "map") {
    const area = state.current_area;
    const parts: string[] = [];

    if (area.waystone_mod_count) {
      parts.push(`${area.waystone_mod_count} mods`);
    }
    if (area.waystone_quantity != null) {
      parts.push(`Q:${area.waystone_quantity}%`);
    }
    if (area.waystone_rarity != null) {
      parts.push(`R:${area.waystone_rarity}%`);
    }
    if (area.waystone_pack_size != null) {
      parts.push(`Pack:${area.waystone_pack_size}%`);
    }
    if (area.waystone_hazard_count && area.waystone_hazard_count > 0) {
      parts.push(`\u25B2${area.waystone_hazard_count}`);
    }

    const stats = parts.join(" \u00B7 ");
    const runtimeLabel = formatCompactRuntime(area.entered_at_epoch_ms);

    window.clearInterval(compactRuntimeHandle);
    compactRuntimeHandle = window.setInterval(() => {
      const meta = root?.querySelector<HTMLElement>("[data-compact-meta]");
      if (meta && state.current_area?.area_type === "map") {
        meta.textContent = compactMapMetaText(state.current_area);
      }
    }, 1000);

    return stats ? `${stats} \u00B7 ${runtimeLabel}` : runtimeLabel;
  }

  if (state.current_area?.area_type === "hideout") {
    return "Ctrl+C scan \u00B7 Alt+D trade";
  }

  if (state.current_area?.area_type === "town") {
    return "Ctrl+C scan items";
  }

  if (state.scanned_item?.base_type) {
    return `${state.scanned_item.base_type} | Alt+D trade`;
  }

  return status;
}

function renderCampaignChecklist(): void {
  const zone = findCurrentZoneInGuide();
  if (!checklistElement) return;

  if (campaignGuideAct <= 0) {
    checklistElement.innerHTML = "";
    checklistElement.classList.remove("is-expanded");
    return;
  }

  if (!zone) {
    checklistElement.classList.toggle("is-expanded", campaignExpanded);
    return;
  }

  const stepsHtml = zone.steps.map((step, i) => {
    const key = stepKey(campaignGuideAct, zone.name, i);
    const done = campaignCompletedSteps.has(key);
    const tagLabels = step.tags.join(" · ");
    const loc = step.loc ? ` (${escapeHtml(step.loc)})` : "";
    const rewardHtml = step.reward
      ? ` <span class="reward-chip" style="color:${rewardColor(step.tags, step.reward)};border-color:${rewardColor(step.tags, step.reward)}">${escapeHtml(step.reward)}</span>`
      : "";
    return `<div class="checklist-step${done ? " completed" : ""}" data-campaign-step-key="${key}">${done ? "☑" : "☐"} ${escapeHtml(step.text)}${loc}${rewardHtml}</div>`;
  }).join("");

  checklistElement.innerHTML = stepsHtml;
  checklistElement.classList.toggle("is-expanded", campaignExpanded);
}

function compactMapMetaText(area: CurrentAreaInfo) {
  const parts: string[] = [];

  if (area.waystone_mod_count) {
    parts.push(`${area.waystone_mod_count} mods`);
  }
  if (area.waystone_quantity != null) {
    parts.push(`Q:${area.waystone_quantity}%`);
  }
  if (area.waystone_rarity != null) {
    parts.push(`R:${area.waystone_rarity}%`);
  }
  if (area.waystone_pack_size != null) {
    parts.push(`Pack:${area.waystone_pack_size}%`);
  }
  if (area.waystone_hazard_count && area.waystone_hazard_count > 0) {
    parts.push(`\u25B2${area.waystone_hazard_count}`);
  }

  const stats = parts.join(" \u00B7 ");
  const runtimeLabel = formatCompactRuntime(area.entered_at_epoch_ms);
  return stats ? `${stats} \u00B7 ${runtimeLabel}` : runtimeLabel;
}

function formatCompactRuntime(enteredAtEpochMs: number) {
  const elapsed = Math.max(0, Math.floor((Date.now() - enteredAtEpochMs) / 1000));
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function clearListingPreviewHideTimer() {
  return;
}

function startListingPreviewPolling() {
  if (!isListingPreviewWindow || previewPollHandle) {
    return;
  }

  const poll = () => {
    void invoke<ListingPreviewRequest | null>("get_listing_preview")
      .then((preview) => {
        const nextSerialized = JSON.stringify(preview);
        const currentSerialized = JSON.stringify(hoveredListingPreview);
        if (nextSerialized !== currentSerialized) {
          hoveredListingPreview = preview;
          render();
        }
      })
      .catch((error) => {
        console.error("failed to poll listing preview", error);
      });
  };

  poll();
  previewPollHandle = window.setInterval(poll, 250);
}

function stopListingPreviewPolling() {
  if (!previewPollHandle) {
    return;
  }

  window.clearInterval(previewPollHandle);
  previewPollHandle = 0;
}

async function hideListingPreview() {
  hoveredListingPreview = null;
  pinnedListingPreviewIndex = null;
  if (!isListingPreviewWindow) {
    await invoke("hide_listing_preview").catch((error) => pushStatus("preview", String(error)));
  }
  render();
}

async function showListingPreviewForIndex(index: number, anchorTop: number) {
  const listing = state.price_check?.listings[index];
  if (!listing) {
    return;
  }

  pinnedListingPreviewIndex = index;
  hoveredListingPreview = {
    listing,
    family: state.scanned_item?.family ?? null,
  };

  await invoke("show_listing_preview", {
    preview: hoveredListingPreview,
    anchorTop,
  }).catch((error) => pushStatus("preview", String(error)));
}

function renderScanShortcut() {
  const mod = appSettings.scanMod || DEFAULT_APP_SETTINGS.scanMod;
  const key = normalizeShortcutKey(appSettings.scanKey, DEFAULT_APP_SETTINGS.scanKey);
  return `<kbd>${escapeHtml(mod)}</kbd> + <kbd>${escapeHtml(key)}</kbd>`;
}

function renderScanPanel(item: ScannedItem | null, priceCheck: PriceCheck | null) {
  if (!item) {
    return `
      <div class="empty-state">
        <p class="section-label">Waiting for clipboard scan</p>
        <p>Hover an item in PoE2 and press ${renderScanShortcut()}. The parsed item and hazard profile will land here.</p>
      </div>
    `;
  }

  const profile = itemProfile(item);
  const specs = itemSpecs(item, profile, state.source_truth_snapshot);
  const activeSpecCount = specs.filter((spec) => selectedSpecKeys.has(spec.key)).length;
  const hazardMarkup = item.hazards.length
    ? `
      <div class="hazard-box">
        <p class="section-label">Important Notice</p>
        ${item.hazards.map((hazard) => `<div class="hazard-line">${escapeHtml(hazard)}</div>`).join("")}
      </div>
    `
    : "";
  const itemClass = item.item_class ?? "Item";
  const baseType = item.base_type ?? "Unknown base";
  const rarityClass = rarityClassName(item.rarity);
  const bannerTitle = item.rarity.toLowerCase() === "unique" ? item.name : baseType;
  const valueEntries = itemValueEntries(item, specs);
  const modifierGroups = splitModifierSpecs(specs);
  const modifierCount =
    modifierGroups.rune.length +
    modifierGroups.explicit.length +
    modifierGroups.implicit.length +
    modifierGroups.special.length;
  const densityClass =
    modifierCount >= 8 ? "density-tight" : modifierCount >= 6 ? "density-compact" : "density-normal";

  return `
    <section class="evaluate-card ${rarityClass} ${densityClass}">
      <div class="evaluate-sidebar" data-item-section>
        <div class="poe-item-banner">
          <div class="banner-corner banner-corner-left" aria-hidden="true"></div>
          <div class="banner-center">
            <p class="banner-subtitle">${escapeHtml(item.rarity)} ${escapeHtml(itemClass)}</p>
            <h2 class="banner-title">${escapeHtml(bannerTitle)}</h2>
          </div>
          <div class="banner-corner banner-corner-right" aria-hidden="true"></div>
        </div>
        <div class="item-profile" data-item-profile>
          <div class="profile-pills">
            ${["item_level", "required_level", "sockets", "spirit"]
              .map((kind) => specs.find((spec) => spec.kind === kind))
              .filter((spec): spec is ItemSpec => Boolean(spec))
              .map((spec) => renderSpecButton(spec, "profile-pill"))
              .join("")}
          </div>
          ${renderValueLines(valueEntries)}
          <div class="spec-toolbar">
            <span>${activeSpecCount ? `${activeSpecCount} trade filter${activeSpecCount === 1 ? "" : "s"} active` : "Click any stat or mod to rebuild search"}</span>
            ${activeSpecCount ? `<button class="clear-specs" data-clear-specs type="button">Clear</button>` : ""}
          </div>
          <div class="mod-chip-stack" data-mod-stack aria-label="Clickable item specifications">
            ${renderModifierSections(modifierGroups, item.rarity)}
          </div>
          <div class="item-tags">
            <span>${escapeHtml(item.rarity)} ${escapeHtml(itemClass)}</span>
            <span>${item.family === "currency" ? "Exchange Mode" : item.hazards.length ? "Hazards detected" : "Modifiable"}</span>
          </div>
          ${renderPriceProfileControls()}
        </div>
        ${hazardMarkup}
      </div>
      <div class="evaluate-results" data-results-section>
        ${renderFilteredPriceCheck(priceCheck, item)}
      </div>
    </section>
  `;
}

function renderValueLines(entries: ValueLineEntry[]) {
  if (!entries.length) {
    return "";
  }

  return `
    <div class="defense-lines">
      ${entries.map((entry) => renderValueEntry(entry)).join("")}
    </div>
  `;
}

function renderPriceProfileControls() {
  return `
    <div class="match-toggle-row" aria-label="Search profile">
      ${PRICE_PROFILES.map(
        (profile) => `
          <label title="${escapeAttribute(profile.title)}">
            <input
              type="radio"
              name="match-profile"
              value="${escapeAttribute(profile.id)}"
              data-price-profile="${escapeAttribute(profile.id)}"
              ${selectedPriceProfile === profile.id ? "checked" : ""}
            />
            ${escapeHtml(profile.label)}
          </label>
        `,
      ).join("")}
    </div>
  `;
}

function renderValueLine(spec: ItemSpec) {
  const selected = isSpecSelected(spec);
  const applied = selected && isSpecApplied(spec);
  const [label, value] = splitSpecLabel(spec.label);

  return `
    <button
      class="defense-spec value-line ${selected ? "is-active" : ""} ${applied ? "is-applied" : selected ? "is-pending" : ""}"
      data-spec-key="${escapeAttribute(spec.key)}"
      type="button"
      title="Rebuild trade search with this item value"
    >
      <span class="value-label">${escapeHtml(label)}</span>
      <span class="value-number">${escapeHtml(value)}</span>
    </button>
  `;
}

function renderStaticValueLine(label: string, value: string) {
  return `
    <div class="defense-spec value-line is-static">
      <span class="value-label">${escapeHtml(label)}</span>
      <span class="value-number">${escapeHtml(value)}</span>
    </div>
  `;
}

function renderValueEntry(entry: ValueLineEntry) {
  return entry.spec ? renderValueLine(entry.spec) : renderStaticValueLine(entry.label, entry.value);
}

function renderPreviewPills(listing: PriceListing) {
  const pills = [
    listing.item_level ? `Item Level: ${listing.item_level}` : null,
    listing.required_level ? `Requires Level: ${listing.required_level}` : null,
  ].filter((value): value is string => Boolean(value));

  return pills.map((value) => `<div class="profile-pill preview-pill">${escapeHtml(value)}</div>`).join("");
}

function renderPreviewValueLines(entries: Array<{ label: string; value: string }>) {
  if (!entries.length) {
    return "";
  }

  return `
    <div class="defense-lines preview-value-lines">
      ${entries.map((entry) => renderStaticValueLine(entry.label, entry.value)).join("")}
    </div>
  `;
}

function previewValueEntries(listing: PriceListing, family: string | null) {
  const entries: Array<{ label: string; value: string }> = [];
  const seen = new Set<string>();

  const addEntry = (label: string, value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed) {
      return;
    }

    const normalized = normalizeDisplayLabel(label);
    if (seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    entries.push({ label, value: trimmed });
  };

  if (listing.quality !== null) {
    addEntry("Quality", `${listing.quality}%`);
  }
  if (listing.armour !== null) {
    addEntry("Armour", `${listing.armour}`);
  }
  if (listing.evasion !== null) {
    addEntry("Evasion Rating", `${listing.evasion}`);
  }
  if (listing.energy_shield !== null) {
    addEntry("Energy Shield", `${listing.energy_shield}`);
  }

  (listing.preview_property_lines ?? []).forEach((line) => {
    const property = parseDisplayPropertyLine(cleanTradeMarkup(line));
    if (!property) {
      return;
    }
    if (family && !shouldRenderPropertyValue(family, property.label)) {
      return;
    }
    addEntry(property.label, property.value);
  });

  return entries;
}

type PreviewModifierGroups = {
  rune: string[];
  explicit: string[];
  implicit: string[];
  special: string[];
};

function previewModifierGroups(modifiers: string[]): PreviewModifierGroups {
  const groups: PreviewModifierGroups = {
    rune: [],
    explicit: [],
    implicit: [],
    special: [],
  };

  modifiers.forEach((modifier) => {
    const normalized = modifier.toLowerCase();

    if (normalized.includes("(rune)")) {
      groups.rune.push(modifier);
      return;
    }

    if (normalized.includes("(implicit)")) {
      groups.implicit.push(modifier);
      return;
    }

    if (
      normalized.includes("(desec") ||
      normalized.includes("(corrupt") ||
      normalized.includes("(enchant") ||
      normalized.includes("(fractured)")
    ) {
      groups.special.push(modifier);
      return;
    }

    groups.explicit.push(modifier);
  });

  return groups;
}

function renderPreviewModifierSections(groups: PreviewModifierGroups) {
  const sections = [
    renderPreviewModifierGroup("Rune Mods", groups.rune, "rune"),
    renderPreviewModifierGroup("Item Mods", groups.explicit, "explicit"),
    renderPreviewModifierGroup("Implicit", groups.implicit, "implicit"),
    renderPreviewModifierGroup("Special", groups.special, "special"),
  ].filter(Boolean);

  return sections.length
    ? sections.join("")
    : `<div class="mod-chip muted">No explicit modifiers fetched for this listing.</div>`;
}

function renderPreviewModifierGroup(
  label: string,
  modifiers: string[],
  tone: "rune" | "explicit" | "implicit" | "special",
) {
  if (!modifiers.length) {
    return "";
  }

  return `
    <section class="modifier-group modifier-group-${tone}">
      <p class="modifier-group-label">${escapeHtml(label)}</p>
      <div class="modifier-group-body">
        ${modifiers.map((modifier) => `<span class="mod-chip is-${tone} preview-mod-chip">${escapeHtml(modifier)}</span>`).join("")}
      </div>
    </section>
  `;
}

function renderItemSpec(spec: ItemSpec, tone = "explicit", meta?: ModifierChipMeta) {
  return renderSpecButton(spec, `mod-chip is-${tone}`, meta);
}

function renderModifierSections(groups: ModifierGroups, rarity: string) {
  const sections = [
    renderModifierGroup("Rune Mods", groups.rune, "rune", rarity),
    renderModifierGroup("Item Mods", groups.explicit, "explicit", rarity),
    renderModifierGroup("Implicit", groups.implicit, "implicit", rarity),
    renderModifierGroup("Special", groups.special, "special", rarity),
  ].filter(Boolean);

  return sections.length
    ? sections.join("")
    : `<div class="mod-chip muted">No explicit modifiers parsed yet.</div>`;
}

function renderModifierGroup(
  label: string,
  specs: ItemSpec[],
  tone: "rune" | "explicit" | "implicit" | "special",
  rarity: string,
) {
  if (!specs.length) {
    return "";
  }

  const metas = modifierChipMetas(specs, rarity);
  return `
    <section class="modifier-group modifier-group-${tone}">
      <p class="modifier-group-label">${escapeHtml(label)}</p>
      <div class="modifier-group-body">
        ${specs.map((spec, index) => renderItemSpec(spec, tone, metas[index])).join("")}
      </div>
    </section>
  `;
}

type ModifierChipMeta = {
  tierLabel: string;
  tierTitle: string;
  affixLabel: string;
  affixTone: "prefix" | "suffix" | "unique" | "special" | "unknown";
  tierConfidence: "validated" | "template" | "unknown";
};

function modifierChipMetas(specs: ItemSpec[], rarity: string): ModifierChipMeta[] {
  let prefixCount = 0;
  let suffixCount = 0;

  return specs.map((spec) => {
    const affix = spec.tier_match?.affix ?? null;
    const sourceKind = spec.tier_match?.source_kind ?? null;
    const isUnique = rarity.toLowerCase() === "unique";
    const tierConfidence = spec.tier_match?.confidence ?? "unknown";
    const tierLabel = spec.tier_match
      ? `${spec.tier_match.tier}${tierConfidence === "template" ? "?" : ""}`
      : sourceKindLabel(sourceKind);
    const tierTitle = spec.tier_match
      ? `${spec.tier_match.tier} ${spec.tier_match.tier_name} (${sourceKindLabel(sourceKind)}) - ${
          tierConfidence === "validated" ? "validated roll band" : "template-only tier hint"
        }`
      : "Tier unknown until PoE2DB data matches this modifier";

    if (isUnique) {
      return { tierLabel, tierTitle, affixLabel: "U", affixTone: "unique", tierConfidence };
    }

    if (affix === "prefix") {
      prefixCount += 1;
      return { tierLabel, tierTitle, affixLabel: `P${prefixCount}`, affixTone: "prefix", tierConfidence };
    }

    if (affix === "suffix") {
      suffixCount += 1;
      return { tierLabel, tierTitle, affixLabel: `S${suffixCount}`, affixTone: "suffix", tierConfidence };
    }

    if (sourceKind && sourceKind !== "normal" && sourceKind !== "table") {
      return { tierLabel, tierTitle, affixLabel: sourceKindLabel(sourceKind), affixTone: "special", tierConfidence };
    }

    return { tierLabel, tierTitle, affixLabel: "", affixTone: "unknown", tierConfidence };
  });
}

function sourceKindLabel(sourceKind: string | null) {
  switch (sourceKind) {
    case "socketable":
    case "rune":
      return "R";
    case "bonded":
      return "B";
    case "item_card":
      return "I";
    case "essence":
    case "perfect_essence":
      return "E";
    case "desecrated":
      return "D";
    case "implicit":
      return "I";
    case "corrupted":
      return "C";
    case "enchant":
      return "EN";
    case "normal":
    case "table":
      return "T?";
    case "repoe":
      return "R?";
    default:
      return sourceKind ? sourceKind.slice(0, 2).toUpperCase() : "T?";
  }
}

function renderSpecButton(spec: ItemSpec, className: string, meta?: ModifierChipMeta) {
  const selected = isSpecSelected(spec);
  const applied = selected && isSpecApplied(spec);
  const sideMeta = meta
    ? `
      <small class="mod-side-label" title="${escapeAttribute(meta.tierTitle)}">
        <span class="mod-tier-label is-${escapeAttribute(meta.tierConfidence)}">${escapeHtml(meta.tierLabel)}</span>
        <span class="mod-affix-label is-${escapeAttribute(meta.affixTone)}">${escapeHtml(meta.affixLabel)}</span>
      </small>
    `
    : "";
  return `
    <button
      class="${className} spec-chip ${selected ? "is-active" : ""} ${applied ? "is-applied" : selected ? "is-pending" : ""}"
      data-spec-key="${escapeAttribute(spec.key)}"
      type="button"
      title="Rebuild trade search with this specification"
    >
      ${sideMeta}<span class="mod-chip-text">${escapeHtml(spec.label)}</span>
    </button>
  `;
}

type ModifierGroups = {
  explicit: ItemSpec[];
  implicit: ItemSpec[];
  rune: ItemSpec[];
  special: ItemSpec[];
};

function splitModifierSpecs(specs: ItemSpec[]): ModifierGroups {
  const explicitSpecs = specs.filter((spec) => spec.kind === "explicit");
  const groups: ModifierGroups = {
    explicit: [],
    implicit: [],
    rune: [],
    special: [],
  };

  explicitSpecs.forEach((spec) => {
    const normalized = spec.label.toLowerCase();

    if (isItemValueModifier(spec.label)) {
      return;
    }

    if (normalized.includes("(rune)")) {
      groups.rune.push(spec);
      return;
    }

    if (normalized.includes("(implicit)")) {
      groups.implicit.push(spec);
      return;
    }

    if (
      normalized.includes("(desec") ||
      normalized.includes("(corrupt") ||
      normalized.includes("(enchant") ||
      normalized.includes("(fractured)")
    ) {
      groups.special.push(spec);
      return;
    }

    groups.explicit.push(spec);
  });

  return groups;
}

function splitSpecLabel(label: string) {
  const [left, ...rest] = label.split(":");
  if (!rest.length) {
    return [label, ""];
  }

  return [left.trim(), rest.join(":").trim()];
}

function itemValueEntries(item: ScannedItem, specs: ItemSpec[]) {
  const entries: ValueLineEntry[] = [];
  const usedLabels = new Set<string>();
  const specByKind = new Map(
    specs
      .filter((spec) => spec.kind !== "explicit")
      .map((spec) => [spec.kind, spec] as const),
  );

  const addSpecKind = (kind: ItemSpec["kind"]) => {
    const spec = specByKind.get(kind);
    if (!spec) {
      return;
    }

    const normalizedLabel = normalizeDisplayLabel(splitSpecLabel(spec.label)[0]);
    if (usedLabels.has(normalizedLabel)) {
      return;
    }

    usedLabels.add(normalizedLabel);
    const [label, value] = splitSpecLabel(spec.label);
    entries.push({ label, value, spec });
  };

  const addStaticEntry = (label: string, value: string) => {
    const normalizedLabel = normalizeDisplayLabel(label);
    if (!value || usedLabels.has(normalizedLabel)) {
      return;
    }

    usedLabels.add(normalizedLabel);
    entries.push({ label, value, spec: null });
  };

  familyValueKinds(item.family).forEach(addSpecKind);

  displayPropertyLines(item).forEach((property) => {
    if (!shouldRenderPropertyValue(item.family, property.label)) {
      return;
    }

    addStaticEntry(property.label, property.value);
  });

  return entries;
}

function familyValueKinds(family: string): ItemSpec["kind"][] {
  switch (family) {
    case "currency":
      return [];
    case "armour":
    case "offhand":
      return ["quality", "armour", "evasion", "energy_shield"];
    case "weapon":
      return ["quality"];
    case "accessory":
    case "belt":
    case "relic":
      return ["quality"];
    case "gem":
    case "flask":
    case "charm":
    case "tablet":
    case "waystone":
      return [];
    default:
      return ["quality", "armour", "evasion", "energy_shield"];
  }
}

function shouldRenderPropertyValue(family: string, label: string) {
  const normalized = normalizeDisplayLabel(label);

  switch (family) {
    case "currency":
      return false;
    case "weapon":
      return [
        "physical damage",
        "critical hit chance",
        "attacks per second",
        "weapon range",
        "dps",
        "block chance",
      ].includes(normalized);
    case "gem":
      return ["level", "mana cost", "cast time", "attack time", "cooldown time", "duration"].includes(
        normalized,
      );
    case "armour":
    case "offhand":
      return ["block chance"].includes(normalized);
    case "belt":
      return ["charm slots", "block chance"].includes(normalized);
    case "accessory":
    case "relic":
      return ["block chance", "limit", "radius", "duration"].includes(normalized);
    case "charm":
      return ["lasts", "consumes", "currently has", "used when"].includes(normalized);
    case "flask":
      return false;
    case "tablet":
    case "waystone":
      return true;
    default:
      return ["physical damage", "critical hit chance", "attacks per second", "weapon range", "dps"].includes(
        normalized,
      );
  }
}

function displayPropertyLines(item: ScannedItem) {
  return item.property_lines
    .map((line) => parseDisplayPropertyLine(cleanTradeMarkup(line)))
    .filter((property): property is { label: string; value: string } => Boolean(property));
}

function parseDisplayPropertyLine(line: string) {
  if (!line || /^(flask|charm|relic)$/i.test(line)) {
    return null;
  }

  const match = line.match(/^([^:]+):\s*(.+)$/);
  if (match) {
    return {
      label: match[1].trim(),
      value: match[2].trim(),
    };
  }

  if (/^recovers /i.test(line)) {
    return { label: "Recovers", value: line.replace(/^recovers\s+/i, "").trim() };
  }

  if (/^consumes /i.test(line)) {
    return { label: "Consumes", value: line.replace(/^consumes\s+/i, "").trim() };
  }

  if (/^currently has /i.test(line)) {
    return { label: "Currently Has", value: line.replace(/^currently has\s+/i, "").trim() };
  }

  if (/^lasts /i.test(line)) {
    return { label: "Lasts", value: line.replace(/^lasts\s+/i, "").trim() };
  }

  if (/^used when /i.test(line)) {
    return { label: "Used When", value: line.replace(/^used when\s+/i, "").trim() };
  }

  if (/^has \d+ charm slots?/i.test(line)) {
    return {
      label: "Charm Slots",
      value: line.replace(/^has\s+/i, "").replace(/\s+charm slots?/i, "").trim(),
    };
  }

  return {
    label: "Property",
    value: line,
  };
}

function normalizeDisplayLabel(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function renderFilteredPriceCheck(priceCheck: PriceCheck | null, item: ScannedItem) {
  if (!priceCheck) {
    return `
      <section class="price-check">
        <div class="price-head">
          <p class="section-label">Price Check</p>
          <strong>Waiting for Ctrl+C scan</strong>
        </div>
      </section>
    `;
  }

  if (item.family === "currency") {
    return renderExchangeModePanel(priceCheck, item);
  }

  const visibleListingRanks = filteredListingRanks(priceCheck, item, selectedSpecKeys, state.source_truth_snapshot);
  const visibleListings = visibleListingRanks.map((entry) => entry.listing);
  const estimate = estimatePriceFromListings(priceCheck, visibleListings);
  const selectedCurrency = currencyById(priceCheck, priceCheck.selected_currency);
  const filters = priceCheck.filters.length
    ? priceCheck.filters
        .map((filter) => renderPriceFilter(filter))
        .join("")
    : `<div class="price-filter muted">No editable filters parsed yet.</div>`;
  const listings = visibleListings.length
    ? visibleListingRanks.map((entry, index) => renderListingRow(entry.listing, item, index, entry)).join("")
    : `<button class="listing-row empty-listing" type="button">${escapeHtml(emptyListingMessage(priceCheck, selectedCurrency))}</button>`;

  return `
    <section class="price-check">
        <div class="price-check-meta">
        <div class="estimate-card">
          <div class="estimate-main">
            <p class="section-label">Estimated Value</p>
            <div class="estimate-value">
              <span>~</span>
              <strong>${estimate.amount === null ? "-" : formatCompactNumber(estimate.amount)}</strong>
              ${estimate.iconUrl ? `<img class="currency-icon large" src="${escapeAttribute(estimate.iconUrl)}" alt="" />` : `<small>${escapeHtml(estimate.currencyId)}</small>`}
            </div>
            <p class="estimate-range">
              Range: ${estimate.low === null || estimate.high === null ? "-" : `${formatCompactNumber(estimate.low)}-${formatCompactNumber(estimate.high)} ${escapeHtml(estimate.currencyId)}`}
              <span class="reliability ${estimate.reliabilityClass}">Reliability: ${escapeHtml(estimate.reliability)}</span>
            </p>
          </div>
          <button
            class="stash-note-button"
            data-copy-stash-note="${escapeAttribute(stashNoteFromEstimate(estimate))}"
            type="button"
            ${estimate.amount === null ? "disabled" : ""}
            title="Copy a stash pricing note from the median estimate"
          >
            Copy note
          </button>
        </div>

        <div class="result-source-row">
          <span>${visibleListings.length}/${priceCheck.matched}</span>
          <button class="source-link" data-source-url="${escapeAttribute(priceCheck.source_url ?? "")}" type="button" ${priceCheck.source_url ? "" : "disabled"}>
            Results from pathofexile.com/trade
          </button>
          <button class="refresh-mark" data-open-trade type="button" title="Open latest search" aria-label="Open latest search">
            <svg class="redirect-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 7H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-2" />
              <path d="M13 4h7v7" />
              <path d="m11 13 9-9" />
            </svg>
          </button>
        </div>

        <div class="trade-control-row">
          <label>
            <span>Buyout Price</span>
            <select data-price-option aria-label="Filter listings by buyout price mode">
              ${renderPriceOptions(priceCheck)}
            </select>
          </label>
          <label>
            <span>Display In</span>
            <select data-price-currency aria-label="Normalize listing prices into currency">
              ${renderCurrencyOptions(priceCheck)}
            </select>
          </label>
          <label>
            <span>Listed</span>
            <select aria-label="Listed time">
              <option>Any Time</option>
              <option>1 Day</option>
              <option>3 Days</option>
              <option>1 Week</option>
            </select>
          </label>
        </div>

        <details class="filter-drawer">
          <summary>Editable Search Values</summary>
          <div class="price-filters">${filters}</div>
        </details>
      </div>

      <div class="listing-table">
        <div class="listing-header"><span></span><span>Price</span><span>iLvl</span><span>Q%</span><span>Account</span><span>Listed</span></div>
        <div class="listing-scroll" data-load-more-marketplace="true">
          ${listings}
        </div>
      </div>
      ${renderTradeRateLimit(priceCheck.rate_limit)}
    </section>
  `;
}

function renderExchangeModePanel(priceCheck: PriceCheck, item: ScannedItem) {
  const properties = displayPropertyLines(item)
    .map(
      (property) => `
        <div class="price-filter muted">
          <span>
            <strong>${escapeHtml(property.label)}</strong>
            <small>${escapeHtml(property.value)}</small>
          </span>
        </div>
      `,
    )
    .join("");

  return `
    <section class="price-check">
      <div class="price-check-meta">
        <div class="estimate-card">
          <div>
            <p class="section-label">Exchange Mode</p>
            <div class="estimate-value">
              <strong>${escapeHtml(item.base_type ?? item.name)}</strong>
            </div>
            <p>Stackable currency-style items are intentionally kept out of normal gear trade search.</p>
          </div>
        </div>

        <div class="result-source-row">
          <span>0/0</span>
          <button class="source-link" type="button" disabled>
            Exchange conversion pending
          </button>
          <button class="refresh-mark" type="button" disabled title="Exchange pricing is not wired yet">Soon</button>
        </div>

        <details class="filter-drawer" open>
          <summary>Parsed Item Values</summary>
          <div class="price-filters">
            ${properties || `<div class="price-filter muted">No stackable properties parsed yet.</div>`}
          </div>
        </details>
      </div>

      <div class="listing-table">
        <div class="listing-scroll">
          <button class="listing-row empty-listing" type="button">
            ${escapeHtml(priceCheck.status)}
          </button>
        </div>
      </div>
    </section>
  `;
}

function renderPriceCheck(priceCheck: PriceCheck | null, item?: ScannedItem) {
  if (!priceCheck) {
    return `
      <section class="price-check">
        <div class="price-head">
          <p class="section-label">Price Check</p>
          <strong>Waiting for Ctrl+C scan</strong>
        </div>
      </section>
    `;
  }

  const estimate = estimatePrice(priceCheck);
  const filters = priceCheck.filters.length
    ? priceCheck.filters
        .slice(0, 8)
        .map((filter) => renderPriceFilter(filter))
        .join("")
    : `<div class="price-filter muted">No editable filters parsed yet.</div>`;

  const listings = priceCheck.listings.length
    ? priceCheck.listings.map((listing, index) => renderListingRow(listing, item, index)).join("")
    : `<button class="listing-row empty-listing" type="button">${escapeHtml(priceCheck.error ?? priceCheck.status)}</button>`;

  return `
    <section class="price-check">
      <div class="estimate-card">
        <div>
          <p class="section-label">Estimated Value</p>
          <div class="estimate-value">
            <span>≈</span>
            <strong>${estimate.amount === null ? "-" : formatCompactNumber(estimate.amount)}</strong>
            ${estimate.iconUrl ? `<img class="currency-icon large" src="${escapeAttribute(estimate.iconUrl)}" alt="" />` : `<small>${escapeHtml(estimate.currencyId)}</small>`}
          </div>
          <p>
            Range: ${estimate.low === null || estimate.high === null ? "-" : `${formatCompactNumber(estimate.low)}-${formatCompactNumber(estimate.high)} ${escapeHtml(estimate.currencyId)}`}
            <span class="reliability ${estimate.reliabilityClass}">Reliability: ${escapeHtml(estimate.reliability)}</span>
          </p>
        </div>
      </div>

      <div class="result-source-row">
        <span>${priceCheck.listings.length}/${priceCheck.matched}</span>
        <button class="source-link" data-source-url="${escapeAttribute(priceCheck.source_url ?? "")}" type="button" ${priceCheck.source_url ? "" : "disabled"}>
          Results from pathofexile.com/trade
        </button>
        <button class="refresh-mark" data-open-trade type="button" title="Open latest search">↻</button>
      </div>

        <div class="trade-control-row">
          <label>
            <span>Buyout Price</span>
            <select data-price-option aria-label="Filter listings by buyout price mode">
              ${renderPriceOptions(priceCheck)}
            </select>
          </label>
          <label>
            <span>Display In</span>
            <select data-price-currency aria-label="Normalize listing prices into currency">
              ${renderCurrencyOptions(priceCheck)}
            </select>
          </label>
        <label>
          <span>Listed</span>
          <select aria-label="Listed time">
            <option>Any Time</option>
            <option>1 Day</option>
            <option>3 Days</option>
            <option>1 Week</option>
          </select>
        </label>
      </div>

      <details class="filter-drawer">
        <summary>Editable Search Values</summary>
        <div class="price-filters">${filters}</div>
      </details>

      <div class="listing-table">
        <div class="listing-header"><span></span><span>Price</span><span>rLvl</span><span>Q%</span><span>Account</span><span>Listed</span></div>
        <div class="listing-scroll" data-load-more-marketplace="true">
          ${listings}
        </div>
      </div>
      ${renderTradeRateLimit(priceCheck.rate_limit)}
    </section>
  `;
}

function renderCurrencyOptions(priceCheck: PriceCheck) {
  const currencies = priceCheck.currencies.length
    ? priceCheck.currencies
    : fallbackCurrencies();

  return currencies
    .map(
      (currency) =>
        `<option value="${escapeAttribute(currency.id)}" ${currency.id === priceCheck.selected_currency ? "selected" : ""}>${escapeHtml(currency.name)}</option>`,
    )
    .join("");
}

function renderPriceOptions(priceCheck: PriceCheck) {
  const directCurrencies = priceCheck.currencies.length
    ? priceCheck.currencies
    : fallbackCurrencies();
  const options = [
    { value: "equivalent", label: "Exalted Orb Equivalent" },
    { value: "exalted_divine", label: "Exalted or Divine Orbs" },
    ...directCurrencies.map((currency) => ({
      value: currency.id,
      label: currency.name,
    })),
  ];

  return options
    .map(
      (option) =>
        `<option value="${escapeAttribute(option.value)}" ${option.value === priceCheck.selected_price_option ? "selected" : ""}>${escapeHtml(option.label)}</option>`,
    )
    .join("");
}

function renderPriceFilter(filter: PriceFilter) {
  const value = filter.value ?? "";
  const min = filter.min ?? "";
  const max = filter.max ?? "";
  const tier = filter.tier ? `<mark>${escapeHtml(filter.tier)}</mark>` : "";

  return `
    <label class="price-filter">
      <input type="checkbox" ${filter.enabled ? "checked" : ""} />
      <span>
        <strong>${escapeHtml(filter.label)}</strong>
        <small>${escapeHtml(filter.source)} ${tier}</small>
      </span>
      <input value="${escapeAttribute(String(value))}" aria-label="Current value" />
      <input value="${escapeAttribute(String(min))}" aria-label="Minimum value" />
      <input value="${escapeAttribute(String(max))}" aria-label="Maximum value" placeholder="MAX" />
    </label>
  `;
}

function renderTradeRateLimit(rateLimit: TradeRateLimit | null) {
  if (!rateLimit) {
    return `<div class="trade-rate-limit" aria-hidden="true"></div>`;
  }

  const width = Math.max(5, Math.min(100, Math.round(rateLimit.usage_ratio * 100)));
  const cooling = (rateLimit.retry_after_seconds ?? 0) > 0 || (rateLimit.active_timeout_seconds ?? 0) > 0;
  const usageText =
    rateLimit.current_hits !== null && rateLimit.limit !== null && rateLimit.interval_seconds !== null
      ? `${rateLimit.current_hits}/${rateLimit.limit} in ${rateLimit.interval_seconds}s`
      : `${width}% usage`;
  const cooldownText = rateLimit.retry_after_seconds
    ? ` · cooldown ${rateLimit.retry_after_seconds}s`
    : rateLimit.active_timeout_seconds
      ? ` · timeout ${rateLimit.active_timeout_seconds}s`
      : "";
  const title = `${rateLimit.policy ?? "trade2"} ${rateLimit.scope} usage: ${usageText}${cooldownText}`;

  return `
    <div class="trade-rate-limit" title="${escapeAttribute(title)}" aria-label="${escapeAttribute(title)}">
      <div class="trade-rate-limit-track">
        <div class="trade-rate-limit-fill ${cooling ? "is-cooling" : ""}" style="width:${width}%"></div>
      </div>
      <span class="trade-rate-limit-label">${cooling ? `${rateLimit.retry_after_seconds ?? rateLimit.active_timeout_seconds}s` : usageText}</span>
    </div>
  `;
}

function renderListingRow(
  listing: PriceListing,
  item: ScannedItem | undefined,
  index: number,
  rank?: ListingRank,
) {
  const priceCheck = state.price_check;
  const useEquivalentDisplay = !!priceCheck && priceCheck.selected_price_option === "equivalent";
  const showNormalizedDisplay = useEquivalentDisplay && !!listing.normalized_price;
  const priceText = showNormalizedDisplay ? listing.normalized_price! : listing.price;
  const priceCurrencyId = showNormalizedDisplay ? listing.normalized_currency : listing.currency;
  const priceIconUrl = resolveCurrencyIcon(
    priceCurrencyId,
    showNormalizedDisplay ? listing.normalized_currency_icon_url : listing.currency_icon_url,
  );
  const priceIcon = priceIconUrl
    ? `<img class="currency-icon" src="${escapeAttribute(priceIconUrl)}" alt="" />`
    : "";
  const seller = listing.seller ?? "Unknown";
  const quality = listing.quality ?? (item ? itemProfile(item).quality ?? 0 : 0);
  const itemLevel = listing.item_level ?? item?.item_level ?? 0;
  const softMiss = !!rank && rank.score >= 0 && rank.score < rank.maxScore && rank.penalties.length > 0;
  const titleParts = [
    showNormalizedDisplay && listing.price !== priceText ? `Listed as ${listing.price}` : "",
    softMiss ? `Official row, local match ${rank!.score}/${rank!.maxScore}: ${rank!.penalties.join("; ")}` : "",
  ].filter(Boolean);
  const title = titleParts.length ? ` title="${escapeAttribute(titleParts.join(" | "))}"` : "";
  const rowClass = softMiss ? "listing-row is-soft-miss" : "listing-row";
  const matchNote = softMiss
    ? `<small class="listing-match-note">partial ${rank!.score}/${rank!.maxScore}</small>`
    : "";
  const rawPriceNote =
    showNormalizedDisplay && listing.price !== priceText
      ? `<small class="listing-price-raw">listed ${escapeHtml(listing.price)}</small>`
      : "";

  return `
    <div class="${rowClass}"${title}>
      <button class="inspect-eye ${pinnedListingPreviewIndex === index ? "is-active" : ""}" data-preview-listing="${index}" type="button" title="Click to inspect this exact listing">View</button>
      <span class="listing-price">${priceIcon}${escapeHtml(priceText)}${rawPriceNote}${listing.online ? '<i class="online-dot"></i>' : ""}</span>
      <span>${itemLevel}</span>
      <span>${quality}%</span>
      <span class="seller-name">${escapeHtml(shortSeller(seller))}${matchNote}</span>
      <span>${escapeHtml(formatListed(listing.listed))}</span>
    </div>
  `;
}

function renderTradePanel(exchangeTab: ExchangeTabState) {
  const categories = exchangeTab.categories.length
    ? exchangeTab.categories
    : fallbackExchangeTab().categories;
  const selectedCategory =
    categories.find((category) => category.id === exchangeTab.selected_category_id) ?? categories[0];
  const overview = exchangeTab.overview;
  const filteredEntries = filteredExchangeEntries(exchangeTab, tradeSearchQuery);
  const currencyIcons = exchangeHeaderCurrencies(exchangeTab);
  const sourceLabel = overview?.source ?? "poe.ninja cache";
  const statusText = exchangeTab.error ?? exchangeTab.status;
  const updatedAt = overview
    ? `Last updated at ${formatTimestamp(overview.fetched_at_epoch_ms)}`
    : "Waiting for cached exchange snapshot";

  return `
    <section class="trade-market">
      <aside class="trade-sidebar">
        <div class="trade-sidebar-section">
          <p class="section-label">Personal</p>
          <button class="trade-favorite-button" type="button" disabled>Favorites</button>
        </div>
        <div class="trade-sidebar-section trade-sidebar-scroll">
          <p class="section-label">General</p>
          <div class="trade-category-list">
            ${categories.map((category) => renderExchangeCategoryButton(category, exchangeTab.selected_category_id)).join("")}
          </div>
        </div>
      </aside>

      <div class="trade-market-main">
        <header class="trade-market-header">
          <div>
            <h2>${escapeHtml(selectedCategory?.label ?? "Currency")}</h2>
            <p>${escapeHtml(overview?.league ?? state.trade_league)} · ${escapeHtml(updatedAt)}</p>
          </div>
          <div class="trade-currency-strip">
            ${currencyIcons.map((quote) => renderExchangeCurrencyChip(quote, exchangeTab.selected_quote_currency_id ?? null)).join("")}
          </div>
        </header>

        <label class="trade-search-bar" aria-label="Search exchange items">
          <span>Search</span>
          <input data-trade-search type="search" placeholder="Search items..." value="${escapeAttribute(tradeSearchQuery)}" />
        </label>

        <div class="trade-market-meta">
          <span>${escapeHtml(sourceLabel)}</span>
          <strong>${escapeHtml(statusText)}</strong>
          <button class="trade-refresh-button" data-refresh-exchange type="button">Refresh</button>
        </div>

        <div class="trade-table-shell">
          <div class="trade-table-header">
            <span>Item</span>
            <span>Price</span>
            <span>Quantity</span>
            <span>History</span>
            <span>Actions</span>
          </div>
          <div class="trade-table-scroll">
            ${
              filteredEntries.length
                ? filteredEntries.map((entry) => renderExchangeRow(entry, exchangeTab, exchangeTab.selected_item_id)).join("")
                : `<div class="trade-empty-row">${escapeHtml(exchangeEmptyMessage(exchangeTab, selectedCategory))}</div>`
            }
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderExchangeCategoryButton(category: ExchangeCategory, selectedCategoryId: string) {
  const isActive = category.id === selectedCategoryId;
  const classes = [
    "trade-category-button",
    isActive ? "is-active" : "",
    category.available ? "" : "is-disabled",
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <button
      class="${classes}"
      data-exchange-category="${escapeAttribute(category.id)}"
      type="button"
      ${category.available ? "" : "disabled"}
      title="${category.available ? category.label : `${category.label} feed is not available yet`}"
    >
      <span class="trade-category-glyph" aria-hidden="true"></span>
      <span>${escapeHtml(category.label)}</span>
    </button>
  `;
}

function renderExchangeCurrencyChip(
  quote: ExchangeQuoteCurrency,
  selectedQuoteCurrencyId: string | null,
) {
  const currency = quote.currency;
  const icon = resolveCurrencyIcon(currency.id, currency.icon_url);
  const activeClass = currency.id === selectedQuoteCurrencyId ? "is-active" : "";
  return `
    <button class="trade-currency-chip ${activeClass}" data-exchange-quote="${escapeAttribute(currency.id)}" type="button" title="${escapeAttribute(currency.name)}">
      ${icon ? `<img src="${escapeAttribute(icon)}" alt="${escapeAttribute(currency.name)}" />` : `<span>${escapeHtml(currency.name.slice(0, 2))}</span>`}
    </button>
  `;
}

function exchangeCategoryLabel(categoryId: string) {
  const labels: Record<string, string> = {
    currency: "Currency",
    essences: "Essences",
    delirium: "Delirium",
    breach: "Breach",
    ritual: "Ritual",
    expedition: "Expedition",
    abyss: "Abyss",
    incursion: "Incursion",
    fragments: "Fragments",
    runes: "Runes",
    "soul-cores": "Soul Cores",
    idols: "Idols",
    "uncut-gems": "Uncut Gems",
    gems: "Gems",
  };

  return labels[categoryId] ?? categoryId;
}

function renderExchangeRow(
  entry: ExchangeEntry,
  exchangeTab: ExchangeTabState,
  selectedItemId: string | null,
) {
  const overview = exchangeTab.overview;
  const itemUrl = exchangeEntryUrl(entry, overview);
  const selected = selectedItemId === entry.id ? "is-selected" : "";
  const icon = entry.icon_url
    ? `<img class="trade-item-icon" src="${escapeAttribute(entry.icon_url)}" alt="" />`
    : `<span class="trade-item-icon fallback"></span>`;
  const history = renderSparkline(entry.sparkline, entry.history_change_percent);
  const historyClass = exchangeHistoryClass(entry.history_change_percent);
  const activeQuote = activeExchangeQuoteCurrency(exchangeTab);
  const convertedPrice = convertExchangePrice(entry, exchangeTab);
  const priceCurrency = activeQuote?.currency ?? overview?.primary_currency;
  const priceIconUrl = priceCurrency ? resolveCurrencyIcon(priceCurrency.id, priceCurrency.icon_url) : null;
  const priceIcon = priceIconUrl
    ? `<img class="currency-icon" src="${escapeAttribute(priceIconUrl)}" alt="" />`
    : "";

  return `
    <article class="trade-table-row ${selected}">
      <div class="trade-item-cell">
        ${icon}
        <div>
          <strong>${escapeHtml(entry.name)}</strong>
          <small>${escapeHtml(entry.item_category ?? "Exchange item")}</small>
        </div>
      </div>
      <div class="trade-price-cell">
        <strong>${convertedPrice === null ? "-" : formatCompactNumber(convertedPrice)}</strong>
        ${priceIcon}
      </div>
      <div class="trade-quantity-cell">${entry.quantity === null ? "-" : formatCompactNumber(entry.quantity)}</div>
      <div class="trade-history-cell ${historyClass}">
        ${history}
        <strong>${formatHistoryPercent(entry.history_change_percent)}</strong>
      </div>
      <div class="trade-actions-cell">
        <button class="trade-row-action" data-source-url="${escapeAttribute(itemUrl ?? overview?.source_url ?? "")}" type="button" ${itemUrl || overview?.source_url ? "" : "disabled"}>Open</button>
        <button class="trade-row-action" data-copy-exchange="${escapeAttribute(entry.name)}" type="button">Copy</button>
      </div>
    </article>
  `;
}

function filteredExchangeEntries(exchangeTab: ExchangeTabState, query: string) {
  const entries = exchangeTab.overview?.entries ?? [];
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return entries;
  }

  return entries.filter((entry) => {
    const haystack = [entry.name, entry.item_category ?? "", entry.id].join(" ").toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

function exchangeHeaderCurrencies(exchangeTab: ExchangeTabState) {
  return exchangeTab.overview?.quote_currencies?.length
    ? exchangeTab.overview.quote_currencies.slice(0, 4)
    : [
        { currency: fallbackCurrencies()[1], per_primary: 1 },
        { currency: fallbackCurrencies()[0], per_primary: 1 },
        { currency: fallbackCurrencies()[4], per_primary: 1 },
      ];
}

function activeExchangeQuoteCurrency(exchangeTab: ExchangeTabState) {
  const quotes = exchangeTab.overview?.quote_currencies ?? [];
  return (
    quotes.find((quote) => quote.currency.id === exchangeTab.selected_quote_currency_id) ??
    quotes[0] ??
    null
  );
}

function convertExchangePrice(entry: ExchangeEntry, exchangeTab: ExchangeTabState) {
  if (entry.price_in_primary === null) {
    return null;
  }

  const activeQuote = activeExchangeQuoteCurrency(exchangeTab);
  return activeQuote ? entry.price_in_primary * activeQuote.per_primary : entry.price_in_primary;
}

function exchangeEntryUrl(entry: ExchangeEntry, overview: ExchangeOverview | null) {
  if (!overview?.source_url || !entry.details_id) {
    return overview?.source_url ?? null;
  }

  return `${overview.source_url}/${entry.details_id}`;
}

function exchangeHistoryClass(change: number | null) {
  if (change === null) {
    return "is-flat";
  }
  if (change > 0.2) {
    return "is-up";
  }
  if (change < -0.2) {
    return "is-down";
  }
  return "is-flat";
}

function formatHistoryPercent(change: number | null) {
  if (change === null || !Number.isFinite(change)) {
    return "--";
  }
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
}

function renderSparkline(points: number[], change: number | null) {
  if (!points.length) {
    return `<div class="trade-sparkline empty"></div>`;
  }

  const width = 96;
  const height = 28;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const path = points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - ((point - min) / span) * (height - 4) - 2;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const historyClass = exchangeHistoryClass(change);

  return `
    <svg class="trade-sparkline ${historyClass}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <path d="${path}"></path>
    </svg>
  `;
}

function exchangeEmptyMessage(exchangeTab: ExchangeTabState, category: ExchangeCategory | undefined) {
  if (exchangeTab.error) {
    return exchangeTab.error;
  }

  if (tradeSearchQuery.trim()) {
    return `No ${category?.label ?? "exchange"} items match "${tradeSearchQuery.trim()}".`;
  }

  return exchangeTab.status;
}

function formatTimestamp(epochMs: number) {
  if (!Number.isFinite(epochMs) || epochMs <= 0) {
    return "unknown time";
  }

  return new Date(epochMs).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function renderDataPanel() {
  const sourceTruth = state.source_truth_snapshot;
  const worldAreas = state.world_area_status;
  const worldAreaDetail = worldAreas.error
    ? `${worldAreas.error} | ${worldAreas.cache_path || "cache path unavailable"}`
    : `${worldAreas.count} areas from ${worldAreas.source}${worldAreas.cache_path ? ` | ${worldAreas.cache_path}` : ""}`;
  const sourceStatus = sourceTruth?.status.message ?? "Waiting for PoE2DB source-truth cache...";
  const sourceFreshness = sourceTruth
    ? `${sourceTruth.mod_pages.reduce((count, page) => count + page.tiers.length, 0)} tiers · ${sourceTruth.families.length} families · ${formatRelativeAge(sourceTruth.fetched_at_epoch_ms)}`
    : "No cached snapshot loaded yet.";
  const sourceQuality = sourceTruth?.status.quality;
  const sourceQualityText = sourceQuality
    ? `${sourceQuality.total_tiers} tiers · ${sourceQuality.empty_roll_band_tiers} empty bands · ${sourceQuality.normal_unknown_affix_tiers} normal affix gaps`
    : "Quality summary waiting for source-truth refresh.";
  const failedPages = sourceTruth?.status.failed_pages.length
    ? `<small>${escapeHtml(sourceTruth.status.failed_pages.slice(0, 3).join(" | "))}</small>`
    : `<small>${escapeHtml(sourceTruth?.cache_path ?? "Cache path appears once the adapter writes its snapshot.")}</small>`;
  const catalogRows = state.league_catalog.length
    ? state.league_catalog
        .map((league) => renderLeagueCatalogRow(league))
        .join("")
    : "<li>Building merged league catalog...</li>";
  const dataLeagueRows = state.data_leagues.length
    ? state.data_leagues
        .slice(0, 6)
        .map((league) => renderDataLeagueRow(league))
        .join("")
    : "<li>Listening to PoE2DB league data...</li>";

  return `
    <div class="data-grid">
      <div><span>Waystone Hazard</span><strong>Reflect</strong><small>Build-killer for many damage profiles.</small></div>
      <div><span>Waystone Hazard</span><strong>No Regen</strong><small>Unsafe for sustain-dependent builds.</small></div>
      <div><span>Trade Hotkey</span><strong>Alt+D</strong><small>Opens latest generated trade URL.</small></div>
      <div><span>Rates Source</span><strong>poe.ninja</strong><small>Planned CLI feed for exchange-rate normalization.</small></div>
      <div><span>World Areas</span><strong>${escapeHtml(worldAreas.state)}</strong><small>${escapeHtml(worldAreaDetail)}</small></div>
      <div><span>PoE2DB Adapter</span><strong>${escapeHtml(sourceTruth?.status.state ?? "warming")}</strong><small>${escapeHtml(sourceStatus)}</small></div>
      <div><span>Source Freshness</span><strong>${escapeHtml(sourceFreshness)}</strong>${failedPages}</div>
      <div><span>Tier Data Quality</span><strong>${escapeHtml(sourceQualityText)}</strong><small>Prefix/suffix labels only show when source data proves them.</small></div>
      <div><span>Debug Log</span><strong>Trade diagnostics</strong><small>${escapeHtml(state.debug_log_path ?? "Log path loading...")}</small></div>
      <div><span>League Catalog</span><strong>${escapeHtml(state.trade_league)}</strong><ul class="feed-list">${catalogRows}</ul></div>
      <div><span>PoE2DB Data Feed</span><strong>Early league/item signal</strong><ul class="feed-list">${dataLeagueRows}</ul></div>
      ${renderCampaignSection()}
    </div>
  `;
}

function renderCampaignSection() {
  const rows = [1, 2, 3, 4, 5].map(act => {
    const time = formatCampaignTime(campaignActTimes[act - 1] ?? 0);
    const isCurrent = act === campaignGuideAct;
    const cls = isCurrent ? `campaign-act-row${campaignTimerRunning ? " running" : ""}` : "campaign-act-row";
    return `<div class="${cls}"><span>${actDisplayName(act)}</span><strong>${time}</strong></div>`;
  }).join("");

  return `
    <div class="campaign-panel">
      <div class="campaign-act-list">${rows}</div>
      <button class="chrome-button campaign-reset" data-campaign-reset type="button">Reset</button>
    </div>
  `;
}

function formatCampaignTime(totalMs: number) {
  const hours = Math.floor(totalMs / 3600000);
  const mins = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  if (hours > 0) return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function renderSettingsPanel() {
  const transparencyPercent = Math.round((1 - appSettings.panelAlpha) * 100);

  return `
    <section class="settings-panel">
      <div class="settings-hero">
        <p class="section-label">Settings</p>
        <h2>Overlay feel</h2>
        <p>Visual controls apply instantly and stay local to this machine.</p>
      </div>

      <div class="settings-grid">
        <label class="settings-field">
          <span>
            <strong>Accent Hue</strong>
            <small>Defaults to Reliquary red. Warnings stay red even when the accent changes.</small>
          </span>
          <input
            data-setting="accentHue"
            type="range"
            min="0"
            max="359"
            step="1"
            value="${escapeAttribute(String(Math.round(appSettings.accentHue)))}"
          />
          <output data-setting-output="accentHue">${escapeHtml(String(Math.round(appSettings.accentHue)))} deg</output>
        </label>

        <label class="settings-field">
          <span>
            <strong>Panel Transparency</strong>
            <small>Changes only the OLED shell behind the readable cards. At 100%, the shell can disappear completely.</small>
          </span>
          <input
            data-setting="panelAlpha"
            type="range"
            min="0"
            max="100"
            step="1"
            value="${escapeAttribute(String(transparencyPercent))}"
          />
          <output data-setting-output="panelAlpha">${escapeHtml(String(transparencyPercent))}%</output>
        </label>

        <label class="settings-field">
          <span>
            <strong>Saturation</strong>
            <small>Full color at 100%. Slide to 0% for pure grayscale, or push past 100% for vivid colorways.</small>
          </span>
          <input
            data-setting="saturation"
            type="range"
            min="0"
            max="200"
            step="5"
            value="${escapeAttribute(String(appSettings.saturation))}"
          />
          <output data-setting-output="saturation">${escapeHtml(String(appSettings.saturation))}%</output>
        </label>

        <div class="settings-field">
          <span>
            <strong>Scan Hotkey</strong>
            <small>Copies the hovered item into Reliquary for pricing.</small>
          </span>
          <div class="keybind-row">
            <select data-setting="scanMod">
              <option value="Ctrl"${appSettings.scanMod === "Ctrl" ? " selected" : ""}>Ctrl</option>
              <option value="Alt"${appSettings.scanMod === "Alt" ? " selected" : ""}>Alt</option>
            </select>
            <span>+</span>
            <input
              data-setting="scanKey"
              type="text"
              maxlength="1"
              class="keybind-letter"
              value="${escapeAttribute(appSettings.scanKey)}"
            />
          </div>
        </div>

        <div class="settings-field">
          <span>
            <strong>Trade Hotkey</strong>
            <small>Opens the latest generated trade URL in your browser.</small>
          </span>
          <div class="keybind-row">
            <select data-setting="tradeMod">
              <option value="Ctrl"${appSettings.tradeMod === "Ctrl" ? " selected" : ""}>Ctrl</option>
              <option value="Alt"${appSettings.tradeMod === "Alt" ? " selected" : ""}>Alt</option>
            </select>
            <span>+</span>
            <input
              data-setting="tradeKey"
              type="text"
              maxlength="1"
              class="keybind-letter"
              value="${escapeAttribute(appSettings.tradeKey)}"
            />
          </div>
        </div>

        <div class="settings-field settings-field-static">
          <button class="action-button" data-reset-visual-settings type="button">Reset visuals</button>
        </div>
      </div>
    </section>
  `;
}

function renderLeagueCatalogRow(league: LeagueCatalogEntry) {
  const flags = [
    league.trade_enabled ? "trade" : null,
    league.exchange_enabled ? "exchange" : null,
    league.indexed ? "indexed" : null,
  ]
    .filter((flag): flag is string => Boolean(flag))
    .join(" · ");
  const expansion = league.expansion ? ` <${league.expansion}>` : "";
  const startsAt = league.discovered_at ? ` | ${league.discovered_at}` : "";

  return `
    <li>
      ${escapeHtml(`${league.display_name}${expansion}${startsAt}`)}
      <mark class="${league.trade_enabled && league.exchange_enabled ? "feed-live" : "feed-data"}">${escapeHtml(flags || "discovered")}</mark>
    </li>
  `;
}

function renderDataLeagueRow(league: DataLeague) {
  const expansion = league.expansion ? ` <${league.expansion}>` : "";
  const startsAt = league.starts_at ? ` | ${league.starts_at}` : "";
  const version = league.version ? ` ${league.version}` : "";
  const status = league.trade_enabled ? "trade live" : "data only";

  return `
    <li>
      ${escapeHtml(`${league.name}${expansion}${version}${startsAt}`)}
      <mark class="${league.trade_enabled ? "feed-live" : "feed-data"}">${escapeHtml(status)}</mark>
    </li>
  `;
}

function formatCoordinates(coordinates: TabCoordinates | null) {
  if (!coordinates) {
    return "No stash coordinates found";
  }

  return `Tab ${coordinates.tab_name}: left ${coordinates.left}, top ${coordinates.top}`;
}

function applyProfileSelection(item: ScannedItem, profile: PriceProfileId = selectedPriceProfile) {
  selectedSpecKeys = profileSpecKeySet(item, profile, state.source_truth_snapshot);
}

function formatRelativeAge(epochMs: number) {
  if (!Number.isFinite(epochMs) || epochMs <= 0) {
    return "unknown age";
  }

  const ageSeconds = Math.max(0, Math.floor((Date.now() - epochMs) / 1000));
  if (ageSeconds < 60) {
    return `${ageSeconds}s old`;
  }
  const ageMinutes = Math.floor(ageSeconds / 60);
  if (ageMinutes < 60) {
    return `${ageMinutes}m old`;
  }
  return `${Math.floor(ageMinutes / 60)}h old`;
}

function activePriceFiltersForCurrentSelection() {
  return activePriceFiltersForSelection(
    state.scanned_item,
    selectedSpecKeys,
    selectedPriceProfile,
    state.source_truth_snapshot,
  );
}

function currentPriceRequestSignature(filters: ReturnType<typeof activePriceFiltersForCurrentSelection>) {
  return [
    state.scanned_item?.raw_text ?? "",
    state.trade_league,
    state.price_currency,
    state.price_option,
    activeFilterSignature(filters),
  ].join("||");
}

function hardPriceFiltersForCurrentSelection() {
  return hardPriceFiltersForSelection(
    state.scanned_item,
    selectedSpecKeys,
    selectedPriceProfile,
    state.source_truth_snapshot,
  );
}

function recentlyRequestedPriceCheck(signature: string) {
  const now = Date.now();
  for (const [cachedSignature, timestamp] of recentPriceRequestSignatures) {
    if (now - timestamp > PRICE_REQUEST_COOLDOWN_MS) {
      recentPriceRequestSignatures.delete(cachedSignature);
    }
  }

  const lastRequestedAt = recentPriceRequestSignatures.get(signature);
  if (lastRequestedAt && now - lastRequestedAt <= PRICE_REQUEST_COOLDOWN_MS) {
    return true;
  }

  recentPriceRequestSignatures.set(signature, now);
  return false;
}

function currentRequestedFilterSignature() {
  return activeFilterSignature(hardPriceFiltersForCurrentSelection());
}

function isSpecApplied(
  spec: ItemSpec,
  item = state.scanned_item,
  priceCheck = state.price_check,
) {
  if (!item || !priceCheck) {
    return false;
  }

  return appliedSpecKeySet(item, priceCheck, state.source_truth_snapshot).has(spec.key);
}

function isSpecSelected(spec: ItemSpec) {
  return selectedSpecKeys.has(spec.key);
}

function estimatePriceFromListings(priceCheck: PriceCheck, listings: PriceListing[]): PriceEstimate {
  const currency = currencyById(priceCheck, priceCheck.selected_currency);
  const values = listings
    .map((listing) => listing.normalized_amount ?? normalizedFallbackAmount(listing, priceCheck.selected_currency))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);

  if (!values.length) {
    return {
      amount: null,
      low: null,
      high: null,
      reliability: "Very Low",
      reliabilityClass: "very-low",
      currencyId: priceCheck.selected_currency,
      currencyName: currency.name,
      iconUrl: currency.icon_url,
    };
  }

  const median = percentile(values, 0.5);
  const low = percentile(values, values.length >= 5 ? 0.1 : 0);
  const high = percentile(values, values.length >= 5 ? 0.9 : 1);
  const spread = high && low ? high / Math.max(low, 0.0001) : Number.POSITIVE_INFINITY;
  const reliability =
    values.length >= 8 && spread <= 3
      ? "High"
      : values.length >= 5 && spread <= 6
        ? "Moderate"
        : values.length >= 3
          ? "Low"
          : "Very Low";

  return {
    amount: median,
    low,
    high,
    reliability,
    reliabilityClass: reliability.toLowerCase().replace(/\s+/g, "-"),
    currencyId: priceCheck.selected_currency,
    currencyName: currency.name,
    iconUrl: currency.icon_url,
  };
}

function stashNoteFromEstimate(estimate: PriceEstimate) {
  if (estimate.amount === null) {
    return "";
  }

  return `~price ${formatStashPriceAmount(estimate.amount)} ${estimate.currencyId}`;
}

function formatStashPriceAmount(amount: number) {
  if (amount >= 100) {
    return String(Math.round(amount));
  }
  if (amount >= 10) {
    return String(Math.round(amount * 10) / 10);
  }
  return String(Math.round(amount * 100) / 100);
}

function emptyListingMessage(priceCheck: PriceCheck, currency: CurrencyMeta) {
  if (priceCheck.error) {
    return priceCheck.error;
  }

  if (!priceCheck.listings.some((listing) => listingMatchesSelectedPriceOption(priceCheck, listing))) {
    if (priceCheck.selected_price_option === "equivalent") {
      return "No fetched listings have a listed buyout price.";
    }

    if (priceCheck.selected_price_option === "exalted_divine") {
      return "No fetched listings are priced in Exalted or Divine Orbs.";
    }

    return `No fetched listings are priced in ${priceOptionLabel(priceCheck)}.`;
  }

  if (state.scanned_item && selectedSpecKeys.size) {
    return "No fetched listings match the selected item specifications.";
  }

  return priceCheck.status;
}

async function pushActivePriceFilters() {
  if (!state.scanned_item) {
    return;
  }

  const hardFilters = hardPriceFiltersForCurrentSelection();
  const allFilters = activePriceFiltersForCurrentSelection();
  latestRequestedFilterSignature = activeFilterSignature(hardFilters);
  const requestSignature = currentPriceRequestSignature(hardFilters);
  if (recentlyRequestedPriceCheck(requestSignature)) {
    if (state.price_check) {
      state.price_check.status = allFilters.length
        ? `Using locally filtered listings for ${allFilters.length} selected filter${allFilters.length === 1 ? "" : "s"} (${hardFilters.length} hard)...`
        : "Using locally filtered listings without selected filters...";
      render();
    }
    return;
  }

  if (state.price_check) {
    state.price_check.status = allFilters.length
      ? `Refreshing trade search for ${hardFilters.length} hard filter${hardFilters.length === 1 ? "" : "s"} (${allFilters.length} selected)...`
      : "Refreshing trade search without selected filters...";
    render();
  }

  await invoke("set_active_price_filters", {
    filters: hardFilters,
  }).catch((error) => pushStatus("price", String(error)));
}

function scheduleActivePriceFilterPush() {
  window.clearTimeout(activeFilterPushTimer);
  activeFilterPushTimer = window.setTimeout(() => {
    void pushActivePriceFilters();
  }, 100);
}

function estimatePrice(priceCheck: PriceCheck): PriceEstimate {
  const currency = currencyById(priceCheck, priceCheck.selected_currency);
  const values = priceCheck.listings
    .map((listing) => listing.normalized_amount ?? normalizedFallbackAmount(listing, priceCheck.selected_currency))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);

  if (!values.length) {
    return {
      amount: null,
      low: null,
      high: null,
      reliability: "Very Low",
      reliabilityClass: "very-low",
      currencyId: priceCheck.selected_currency,
      currencyName: currency.name,
      iconUrl: currency.icon_url,
    };
  }

  const median = percentile(values, 0.5);
  const low = percentile(values, values.length >= 5 ? 0.1 : 0);
  const high = percentile(values, values.length >= 5 ? 0.9 : 1);
  const spread = high && low ? high / Math.max(low, 0.0001) : Number.POSITIVE_INFINITY;
  const reliability =
    values.length >= 8 && spread <= 3
      ? "High"
      : values.length >= 5 && spread <= 6
        ? "Moderate"
        : values.length >= 3
          ? "Low"
          : "Very Low";

  return {
    amount: median,
    low,
    high,
    reliability,
    reliabilityClass: reliability.toLowerCase().replace(/\s+/g, "-"),
    currencyId: priceCheck.selected_currency,
    currencyName: currency.name,
    iconUrl: currency.icon_url,
  };
}

function priceOptionLabel(priceCheck: PriceCheck) {
  switch (priceCheck.selected_price_option) {
    case "equivalent":
      return "Exalted Orb Equivalent";
    case "exalted_divine":
      return "Exalted or Divine Orbs";
    default:
      return currencyById(priceCheck, priceCheck.selected_price_option).name;
  }
}

function currencyById(priceCheck: PriceCheck, currencyId: string): CurrencyMeta {
  return (
    priceCheck.currencies.find((currency) => currency.id === currencyId) ??
    fallbackCurrencies().find((currency) => currency.id === currencyId) ?? {
      id: currencyId,
      name: currencyId,
      icon_url: resolveCurrencyIcon(currencyId, null),
    }
  );
}

function normalizedFallbackAmount(listing: PriceListing, selectedCurrency: string) {
  if (listing.currency === selectedCurrency) {
    return listing.amount;
  }

  return null;
}

function percentile(values: number[], point: number) {
  if (!values.length) {
    return null;
  }

  const index = Math.min(values.length - 1, Math.max(0, Math.round((values.length - 1) * point)));
  return values[index];
}

function formatCompactNumber(value: number) {
  if (value >= 1000) {
    return Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
  }

  return Intl.NumberFormat(undefined, {
    maximumFractionDigits: value >= 10 ? 0 : 1,
  }).format(value);
}

function shortSeller(seller: string) {
  if (seller.length <= 14) {
    return seller;
  }

  return `${seller.slice(0, 12)}...`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function readAppSettings(): AppSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "{}") as Partial<AppSettings>;

    return {
      accentHue: clampNumber(Number(parsed.accentHue), 0, 359, DEFAULT_APP_SETTINGS.accentHue),
      panelAlpha: clampNumber(Number(parsed.panelAlpha), 0, 1, DEFAULT_APP_SETTINGS.panelAlpha),
      saturation: clampNumber(Number(parsed.saturation), 0, 200, DEFAULT_APP_SETTINGS.saturation),
      scanMod: parsed.scanMod === "Ctrl" || parsed.scanMod === "Alt" ? parsed.scanMod : DEFAULT_APP_SETTINGS.scanMod,
      scanKey: normalizeShortcutKey(parsed.scanKey, DEFAULT_APP_SETTINGS.scanKey),
      tradeMod: parsed.tradeMod === "Ctrl" || parsed.tradeMod === "Alt" ? parsed.tradeMod : DEFAULT_APP_SETTINGS.tradeMod,
      tradeKey: normalizeShortcutKey(parsed.tradeKey, DEFAULT_APP_SETTINGS.tradeKey),
    };
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

function normalizeShortcutKey(value: unknown, fallback: string) {
  if (typeof value !== "string" || value.length !== 1) {
    return fallback;
  }

  const key = value.toUpperCase();
  return isSupportedShortcutKey(key) ? key : fallback;
}

function isSupportedShortcutKey(key: string) {
  return key.length === 1 && ((key >= "A" && key <= "Z") || (key >= "0" && key <= "9"));
}

function saveAppSettings() {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(appSettings));
  } catch {
    pushStatus("settings", "Unable to save local visual settings.");
  }
}

function applyAppSettings(settings: AppSettings) {
  const hue = clampNumber(settings.accentHue, 0, 359, DEFAULT_APP_SETTINGS.accentHue);
  const rootStyle = document.documentElement.style;

  rootStyle.setProperty("--gold", `hsl(${hue} 62% 36%)`);
  rootStyle.setProperty("--gold-bright", `hsl(${hue} 70% 58%)`);
  rootStyle.setProperty("--gold-deep", `hsl(${hue} 61% 16%)`);
  rootStyle.setProperty("--accent-hue", String(hue));
  rootStyle.setProperty("--line", `hsl(${hue} 70% 58% / 0.26)`);
  rootStyle.setProperty("--line-strong", `hsl(${hue} 70% 58% / 0.56)`);
  const sat = settings.saturation / 100;
  rootStyle.setProperty("--saturation", (settings.saturation).toFixed(0) + "%");
  rootStyle.setProperty("--accent-sat", (70 * sat).toFixed(0) + "%");
  rootStyle.setProperty("--accent-sat-bg", (62 * sat).toFixed(0) + "%");
  rootStyle.setProperty("--surface-alpha", settings.panelAlpha.toFixed(2));
  rootStyle.setProperty("--surface-glow-alpha", (settings.panelAlpha * 0.16).toFixed(3));
  void invoke("set_keybinds", {
    scanMod: settings.scanMod,
    scanKey: settings.scanKey,
    tradeMod: settings.tradeMod,
    tradeKey: settings.tradeKey,
  }).catch((err) => pushStatus("keybinds", String(err)));
}

function updateSettingOutput(settingName: keyof AppSettings) {
  const output = document.querySelector<HTMLOutputElement>(`[data-setting-output="${settingName}"]`);
  if (!output) {
    return;
  }

  if (settingName === "panelAlpha") {
    output.textContent = `${Math.round((1 - appSettings.panelAlpha) * 100)}%`;
  } else if (settingName === "saturation") {
    output.textContent = `${appSettings.saturation}%`;
  } else {
    output.textContent = `${Math.round(appSettings.accentHue)} deg`;
  }
}

function fallbackCurrencies(): CurrencyMeta[] {
  return [
    { id: "exalted", name: "Exalted Orb", icon_url: resolveCurrencyIcon("exalted", null) },
    { id: "divine", name: "Divine Orb", icon_url: resolveCurrencyIcon("divine", null) },
    { id: "regal", name: "Regal Orb", icon_url: resolveCurrencyIcon("regal", null) },
    { id: "transmute", name: "Orb of Transmutation", icon_url: resolveCurrencyIcon("transmute", null) },
    { id: "chaos", name: "Chaos Orb", icon_url: resolveCurrencyIcon("chaos", null) },
    { id: "alch", name: "Orb of Alchemy", icon_url: resolveCurrencyIcon("alch", null) },
    { id: "chance", name: "Orb of Chance", icon_url: resolveCurrencyIcon("chance", null) },
    { id: "aug", name: "Orb of Augmentation", icon_url: resolveCurrencyIcon("aug", null) },
    { id: "annul", name: "Orb of Annulment", icon_url: resolveCurrencyIcon("annul", null) },
    { id: "mirror", name: "Mirror of Kalandra", icon_url: resolveCurrencyIcon("mirror", null) },
    { id: "vaal", name: "Vaal Orb", icon_url: resolveCurrencyIcon("vaal", null) },
  ];
}

function fallbackExchangeTab(): ExchangeTabState {
  return {
    categories: [
      "currency",
      "essences",
      "delirium",
      "breach",
      "ritual",
      "expedition",
      "abyss",
      "incursion",
      "fragments",
      "runes",
      "soul-cores",
      "idols",
      "uncut-gems",
      "gems",
    ].map((id) => ({
      id,
      label: exchangeCategoryLabel(id),
      poe_ninja_type: null,
      poe_ninja_slug: null,
      available: id !== "incursion",
    })),
    selected_category_id: "currency",
    selected_item_id: null,
    overview: null,
    selected_quote_currency_id: "divine",
    status: "Exchange cache is idle.",
    error: null,
  };
}

function localCurrencyIconUrl(currencyId: string | null | undefined) {
  if (!currencyId) {
    return null;
  }

  const normalizedCurrencyId = CURRENCY_ICON_ALIASES[currencyId.toLowerCase()] ?? currencyId.toLowerCase();
  return LOCAL_CURRENCY_ICONS[normalizedCurrencyId] ?? null;
}

function resolveCurrencyIcon(currencyId: string | null | undefined, remoteUrl: string | null) {
  return localCurrencyIconUrl(currencyId) ?? remoteUrl;
}

function normalizeExchangeTab(exchangeTab: ExchangeTabState | null | undefined): ExchangeTabState {
  const fallback = fallbackExchangeTab();

  if (!exchangeTab) {
    return fallback;
  }

  return {
    categories: exchangeTab.categories?.length ? exchangeTab.categories : fallback.categories,
    selected_category_id: exchangeTab.selected_category_id || fallback.selected_category_id,
    selected_item_id: exchangeTab.selected_item_id ?? null,
    selected_quote_currency_id:
      exchangeTab.selected_quote_currency_id ??
      exchangeTab.overview?.quote_currencies?.[0]?.currency.id ??
      fallback.selected_quote_currency_id,
    overview: exchangeTab.overview
      ? {
          ...exchangeTab.overview,
          primary_currency: exchangeTab.overview.primary_currency
            ? {
                ...exchangeTab.overview.primary_currency,
                icon_url: resolveCurrencyIcon(
                  exchangeTab.overview.primary_currency.id,
                  exchangeTab.overview.primary_currency.icon_url,
                ),
              }
            : null,
          secondary_currency: exchangeTab.overview.secondary_currency
            ? {
                ...exchangeTab.overview.secondary_currency,
                icon_url: resolveCurrencyIcon(
                  exchangeTab.overview.secondary_currency.id,
                  exchangeTab.overview.secondary_currency.icon_url,
                ),
              }
            : null,
          quote_currencies: (exchangeTab.overview.quote_currencies ?? []).map((quote) => ({
            ...quote,
            currency: {
              ...quote.currency,
              icon_url: resolveCurrencyIcon(quote.currency.id, quote.currency.icon_url),
            },
          })),
          entries: (exchangeTab.overview.entries ?? []).map((entry) => ({
            ...entry,
            icon_url: entry.icon_url ?? null,
          })),
        }
      : null,
    status: exchangeTab.status || fallback.status,
    error: exchangeTab.error ?? null,
  };
}

function normalizePriceCheck(priceCheck: PriceCheck | null): PriceCheck | null {
  if (!priceCheck) {
    return null;
  }

  return {
    ...priceCheck,
    selected_price_option: priceCheck.selected_price_option || "equivalent",
    requested_filters: priceCheck.requested_filters ?? [],
    applied_filters: priceCheck.applied_filters ?? [],
    currencies: priceCheck.currencies.map((currency) => ({
      ...currency,
      icon_url: resolveCurrencyIcon(currency.id, currency.icon_url),
    })),
    listings: priceCheck.listings.map((listing) => ({
      ...listing,
      currency_icon_url: resolveCurrencyIcon(listing.currency, listing.currency_icon_url),
      normalized_currency_icon_url: resolveCurrencyIcon(
        listing.normalized_currency,
        listing.normalized_currency_icon_url,
      ),
    })),
  };
}

function rarityClassName(rarity: string) {
  const normalized = rarity.trim().toLowerCase();

  if (normalized === "normal" || normalized === "common") {
    return "rarity-common";
  }

  if (normalized === "magic") {
    return "rarity-magic";
  }

  if (normalized === "rare") {
    return "rarity-rare";
  }

  if (normalized === "unique") {
    return "rarity-unique";
  }

  return "rarity-rare";
}

function isExchangeClipboardItem(item: ScannedItem | null) {
  if (!item) {
    return false;
  }

  if (item.family === "currency") {
    return true;
  }

  if (
    [
      "accessory",
      "armour",
      "belt",
      "charm",
      "flask",
      "jewel",
      "offhand",
      "relic",
      "tablet",
      "waystone",
      "weapon",
    ].includes(item.family)
  ) {
    return false;
  }

  const haystack = [
    item.item_class ?? "",
    item.base_type ?? "",
    item.name,
  ]
    .join(" ")
    .toLowerCase();

  return [
    "essence",
    "omen",
    "rune",
    "soul core",
    "idol",
    "uncut",
    "liquid ",
    "catalyst",
    "fragment",
    "splinter",
    "abyssal",
    "expedition",
  ].some((needle) => haystack.includes(needle));
}

function desiredWindowLayout(): "scan" | "trade" | "settings" | "idle" | "default" | "compact" {
  if (compactMode) {
    return "compact";
  }

  if (activeTab === "trade") {
    return "trade";
  }

  if (activeTab === "settings") {
    return "settings";
  }

  if (activeTab !== "scan") {
    return "default";
  }

  return state.scanned_item || state.price_check ? "scan" : "idle";
}

function syncWindowLayout() {
  const layout = desiredWindowLayout();
  if (layout === appliedWindowLayout) {
    return;
  }

  appliedWindowLayout = layout;
  void invoke("set_window_layout", { layout }).catch((error) => {
    appliedWindowLayout = null;
    pushStatus("window", String(error));
  });
}

function syncCompactWindowHeight() {
  const strip = root?.querySelector<HTMLElement>(".compact-strip");
  if (!strip) return;
  const height = strip.getBoundingClientRect().height;
  void invoke("set_compact_window_height", { contentHeight: height }).catch((err) =>
    pushStatus("window", String(err)),
  );
}

function queueEvaluateLayoutSync() {
  if (evaluateLayoutFrame) {
    cancelAnimationFrame(evaluateLayoutFrame);
  }

  evaluateLayoutFrame = requestAnimationFrame(() => {
    evaluateLayoutFrame = 0;
    syncEvaluateLayout();
  });
}

function syncEvaluateLayout() {
  if (activeTab !== "scan") {
    return;
  }

  const evaluate = panelElement!.querySelector<HTMLElement>(".evaluate-card");
  const itemSection = evaluate?.querySelector<HTMLElement>("[data-item-section]");
  const itemProfile = evaluate?.querySelector<HTMLElement>("[data-item-profile]");
  const modStack = evaluate?.querySelector<HTMLElement>("[data-mod-stack]");
  const resultsSection = evaluate?.querySelector<HTMLElement>("[data-results-section]");
  const priceCheckMeta = resultsSection?.querySelector<HTMLElement>(".price-check-meta");
  const listingTable = resultsSection?.querySelector<HTMLElement>(".listing-table");
  const listingHeader = listingTable?.querySelector<HTMLElement>(".listing-header");
  const listingRow = listingTable?.querySelector<HTMLElement>(".listing-row");

  if (!evaluate || !itemSection || !itemProfile || !modStack || !resultsSection) {
    return;
  }

  const panelHeight = panelElement!.clientHeight;
  if (!panelHeight) {
    return;
  }

  const sectionGap = 6;
  const metaHeight = priceCheckMeta?.offsetHeight ?? 0;
  const listingHeaderHeight = listingHeader?.offsetHeight ?? 0;
  const listingRowHeight = Math.max(28, listingRow?.offsetHeight ?? 28);
  const desiredVisibleRows = 5;
  const listingChrome = 16;
  const minimumResultsHeight =
    metaHeight + listingHeaderHeight + desiredVisibleRows * listingRowHeight + listingChrome;
  const minimumItemHeight = 430;
  const minimumResultsFloor = 220;
  const maximumResultsHeight = Math.max(minimumResultsFloor, panelHeight - minimumItemHeight - sectionGap);
  const resultsHeight = Math.min(minimumResultsHeight, maximumResultsHeight);
  evaluate.style.setProperty("--results-height", `${resultsHeight}px`);

  const itemChildren = Array.from(itemProfile.children) as HTMLElement[];
  const staticProfileHeight = itemChildren
    .filter((child) => !child.hasAttribute("data-mod-stack"))
    .reduce((sum, child) => sum + child.offsetHeight, 0);

  const itemSectionChildren = Array.from(itemSection.children) as HTMLElement[];
  const nonProfileHeight = itemSectionChildren
    .filter((child) => child !== itemProfile)
    .reduce((sum, child) => sum + child.offsetHeight, 0);

  const desiredItemHeight = Math.max(
    minimumItemHeight,
    nonProfileHeight + staticProfileHeight + modStack.scrollHeight + 18,
  );
  evaluate.style.setProperty("--item-row-height", `${desiredItemHeight}px`);

  const desiredWindowHeight = Math.ceil(
    panelElement!.offsetTop + desiredItemHeight + resultsHeight + sectionGap + 12,
  );
  syncScanWindowHeight(desiredWindowHeight);

  const availableItemHeight = Math.max(minimumItemHeight, desiredItemHeight);
  const modsMaxHeight = Math.max(
    92,
    availableItemHeight - nonProfileHeight - staticProfileHeight - 14,
  );

  evaluate.style.setProperty("--mods-max-height", `${modsMaxHeight}px`);
}

function syncScanWindowHeight(height: number) {
  if (compactMode || activeTab !== "scan") {
    return;
  }

  const currentWindowHeight = hudElement?.clientHeight ?? window.innerHeight;
  if (Math.abs(height - requestedScanWindowHeight) < 10 && currentWindowHeight >= height - 8) {
    return;
  }

  requestedScanWindowHeight = height;
  void invoke("set_scan_window_height", { contentHeight: height }).catch((error) =>
    pushStatus("window", String(error)),
  );
}

async function setPassthrough(passthrough: boolean) {
  try {
    await invoke("set_click_passthrough", { passthrough });
  } catch (error) {
    pushStatus("ui", `click passthrough failed: ${String(error)}`);
  }
}

function pushStatus(worker: string, message: string) {
  workerMessages = [...workerMessages.slice(-4), { worker, message }];
  render();
}

function canLoadMoreMarketplaceResults() {
  if (!state.price_check || !state.scanned_item || state.scanned_item.family === "currency") {
    return false;
  }

  const fetched = state.price_check.listings.length;
  const maximumAvailable = Math.min(state.price_check.matched, 50);
  return fetched > 0 && fetched < maximumAvailable;
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeTab = button.dataset.tab as TabId;
    render();
  });
});

if (!isListingPreviewWindow && leagueElement) {
  leagueElement.addEventListener("change", async () => {
    state.trade_league = leagueElement.value;
    state.price_check = null;
    loadingMoreMarketplaceResults = false;
    await invoke("set_trade_league", { league: state.trade_league }).catch((error) =>
      pushStatus("league", String(error)),
    );
    pushStatus("league", `Trade league set to ${state.trade_league}`);
  });

  root.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    const openTrade = target.closest<HTMLButtonElement>("[data-open-trade]");
    const macroButton = target.closest<HTMLButtonElement>("[data-macro]");
    const compactButton = target.closest<HTMLButtonElement>("[data-toggle-compact]");
    const closeButton = target.closest<HTMLButtonElement>("[data-close-app]");
    const sourceButton = target.closest<HTMLButtonElement>("[data-source-url]");
    const specButton = target.closest<HTMLButtonElement>("[data-spec-key]");
    const clearSpecsButton = target.closest<HTMLButtonElement>("[data-clear-specs]");
    const exchangeCategoryButton = target.closest<HTMLButtonElement>("[data-exchange-category]");
    const exchangeRefreshButton = target.closest<HTMLButtonElement>("[data-refresh-exchange]");
    const exchangeCopyButton = target.closest<HTMLButtonElement>("[data-copy-exchange]");
    const exchangeQuoteButton = target.closest<HTMLButtonElement>("[data-exchange-quote]");
    const stashNoteButton = target.closest<HTMLButtonElement>("[data-copy-stash-note]");
    const resetVisualSettingsButton = target.closest<HTMLButtonElement>("[data-reset-visual-settings]");
    const campaignStepButton = target.closest<HTMLElement>("[data-campaign-step-key]");
    const campaignTimerButton = target.closest<HTMLElement>("[data-campaign-timer]");
    const campaignResetButton = target.closest<HTMLButtonElement>("[data-campaign-reset]");
    const compactMetaClick = target.closest<HTMLElement>("[data-compact-meta]");
    const compactTitleClick = target.closest<HTMLElement>("[data-compact-title]");

    if (resetVisualSettingsButton) {
      appSettings = { ...DEFAULT_APP_SETTINGS };
      applyAppSettings(appSettings);
      saveAppSettings();
      render();
      return;
    }

    if (exchangeQuoteButton?.dataset.exchangeQuote) {
      state.exchange_tab.selected_quote_currency_id = exchangeQuoteButton.dataset.exchangeQuote;
      render();
      return;
    }

    if (exchangeCategoryButton?.dataset.exchangeCategory) {
      state.exchange_tab.selected_category_id = exchangeCategoryButton.dataset.exchangeCategory;
      state.exchange_tab.status = `Loading ${exchangeCategoryButton.textContent?.trim() ?? "exchange"} overview...`;
      activeTab = "trade";
      render();
      await invoke("set_exchange_category", {
        categoryId: exchangeCategoryButton.dataset.exchangeCategory,
      }).catch((error) => pushStatus("exchange", String(error)));
      return;
    }

    if (exchangeRefreshButton) {
      state.exchange_tab.status = "Refreshing exchange snapshot...";
      render();
      await invoke("refresh_exchange_category").catch((error) =>
        pushStatus("exchange", String(error)),
      );
      return;
    }

    if (exchangeCopyButton?.dataset.copyExchange) {
      void navigator.clipboard
        .writeText(exchangeCopyButton.dataset.copyExchange)
        .then(() => pushStatus("exchange", `Copied ${exchangeCopyButton.dataset.copyExchange}`))
        .catch((error) => pushStatus("exchange", String(error)));
      return;
    }

    if (stashNoteButton?.dataset.copyStashNote) {
      void navigator.clipboard
        .writeText(stashNoteButton.dataset.copyStashNote)
        .then(() => pushStatus("stash", `Copied stash note ${stashNoteButton.dataset.copyStashNote}`))
        .catch((error) => pushStatus("stash", String(error)));
      return;
    }

    if (specButton?.dataset.specKey) {
      const specKey = specButton.dataset.specKey;
      activeTab = "scan";
      if (selectedSpecKeys.has(specKey)) {
        selectedSpecKeys.delete(specKey);
      } else {
        selectedSpecKeys.add(specKey);
      }
      if (state.price_check) {
        state.price_check.status = "Rebuilding trade search with selected specs...";
      }
      loadingMoreMarketplaceResults = false;
      render();
      scheduleActivePriceFilterPush();
      return;
    }

    if (clearSpecsButton) {
      selectedSpecKeys.clear();
      if (state.price_check) {
        state.price_check.status = "Clearing selected spec filters...";
      }
      loadingMoreMarketplaceResults = false;
      render();
      scheduleActivePriceFilterPush();
      return;
    }

    if (compactButton) {
      compactMode = !compactMode;
      render();
      return;
    }

    if (closeButton) {
      await invoke("exit_app").catch((error) =>
        pushStatus("window", String(error)),
      );
      return;
    }

    if (openTrade) {
      await invoke("open_last_trade_search").catch((error) =>
        pushStatus("trade", String(error)),
      );
    }

    if (sourceButton?.dataset.sourceUrl) {
      await invoke("open_external_url", { url: sourceButton.dataset.sourceUrl }).catch((error) =>
        pushStatus("trade", String(error)),
      );
    }

    if (macroButton) {
      const command = macroButton.dataset.macro;
      const buyerName = macroButton.dataset.buyer;

      if (command && buyerName) {
        await invoke(command, { buyerName }).catch((error) =>
          pushStatus("macro", String(error)),
        );
      }
    }

    if (campaignStepButton?.dataset.campaignStepKey) {
      const key = campaignStepButton.dataset.campaignStepKey;
      if (campaignCompletedSteps.has(key)) {
        campaignCompletedSteps.delete(key);
      } else {
        campaignCompletedSteps.add(key);
      }
      saveCampaignProgress();
      render();
      return;
    }

    if (campaignResetButton) {
      campaignActTimes = [0, 0, 0, 0, 0, 0, 0, 0];
      campaignTotalMs = 0;
      stopCampaignTimer();
      saveCampaignProgress();
      render();
      return;
    }

    if (compactTitleClick && campaignGuideAct > 0) {
      campaignExpanded = !campaignExpanded;
      render();
      syncCompactWindowHeight();
      return;
    }
  });

  root.addEventListener("change", async (event) => {
    const target = event.target as HTMLElement;
    const settingInput = target.closest<HTMLElement>("[data-setting]");
    const priceProfileInput = target.closest<HTMLInputElement>("[data-price-profile]");
    const priceOptionSelect = target.closest<HTMLSelectElement>("[data-price-option]");
    const currencySelect = target.closest<HTMLSelectElement>("[data-price-currency]");

    if (settingInput?.dataset.setting) {
      const el = settingInput as HTMLInputElement | HTMLSelectElement;
      const name = el.dataset.setting!;
      if (name === "scanMod" || name === "tradeMod") {
        const val = el.value as "Ctrl" | "Alt";
        if (val === "Ctrl" || val === "Alt") {
          appSettings[name] = val;
        }
      }
      applyAppSettings(appSettings);
      saveAppSettings();
      return;
    }

    if (priceProfileInput?.dataset.priceProfile) {
      selectedPriceProfile = priceProfileInput.dataset.priceProfile as PriceProfileId;
      if (state.scanned_item) {
        applyProfileSelection(state.scanned_item);
      }
      if (state.price_check) {
        state.price_check.status = `Applying ${priceProfileLabel(selectedPriceProfile)} profile...`;
      }
      loadingMoreMarketplaceResults = false;
      render();
      scheduleActivePriceFilterPush();
      return;
    }

    if (priceOptionSelect) {
      state.price_option = priceOptionSelect.value;
      if (state.price_check) {
        state.price_check.selected_price_option = priceOptionSelect.value;
        state.price_check.status = "Refreshing buyout price mode...";
        loadingMoreMarketplaceResults = false;
        render();
      }

      await invoke("set_price_option", { priceOption: priceOptionSelect.value }).catch((error) =>
        pushStatus("price", String(error)),
      );
      return;
    }

    if (!currencySelect) {
      return;
    }

    state.price_currency = currencySelect.value;
    if (state.price_check) {
      state.price_check.selected_currency = currencySelect.value;
      state.price_check.status = "Refreshing currency-normalized listings...";
      loadingMoreMarketplaceResults = false;
      render();
    }

    await invoke("set_price_currency", { currency: currencySelect.value }).catch((error) =>
      pushStatus("currency", String(error)),
    );
  });

  root.addEventListener("input", (event) => {
    const target = event.target as HTMLElement;
    const tradeSearch = target.closest<HTMLInputElement>("[data-trade-search]");
    const settingInput = target.closest<HTMLInputElement>("[data-setting]");

    if (settingInput?.dataset.setting) {
      const name = settingInput.dataset.setting;
      if (name === "accentHue") {
        appSettings.accentHue = clampNumber(Number(settingInput.value), 0, 359, DEFAULT_APP_SETTINGS.accentHue);
        updateSettingOutput("accentHue");
      }
      if (name === "panelAlpha") {
        appSettings.panelAlpha = clampNumber(1 - Number(settingInput.value) / 100, 0, 1, DEFAULT_APP_SETTINGS.panelAlpha);
        updateSettingOutput("panelAlpha");
      }
      if (name === "saturation") {
        appSettings.saturation = clampNumber(Number(settingInput.value), 0, 200, DEFAULT_APP_SETTINGS.saturation);
        updateSettingOutput("saturation");
      }
      if (name === "scanMod" || name === "tradeMod") {
        const val = settingInput.value as "Ctrl" | "Alt";
        if (val === "Ctrl" || val === "Alt") {
          appSettings[name] = val;
        }
      }
      if (name === "scanKey" || name === "tradeKey") {
        return; // handled via keydown listener below
      }

      applyAppSettings(appSettings);
      saveAppSettings();
      return;
    }

    if (!tradeSearch) {
      return;
    }

    tradeSearchQuery = tradeSearch.value;
    render();
  });

  root.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement;
    const keyInput = target.closest<HTMLInputElement>(".keybind-letter[data-setting]");
    if (!keyInput?.dataset.setting) return;

    const name = keyInput.dataset.setting;
    if (name !== "scanKey" && name !== "tradeKey") return;

    const key = event.key.toUpperCase();
    if (isSupportedShortcutKey(key)) {
      event.preventDefault();
      appSettings[name] = key;
      keyInput.value = key;
      applyAppSettings(appSettings);
      saveAppSettings();
    } else if (event.key.length === 1) {
      event.preventDefault();
    }
  });

  root.addEventListener(
    "scroll",
    (event) => {
      const target = event.target as HTMLElement;
      const listingScroll = target.closest<HTMLElement>("[data-load-more-marketplace='true']");

      if (!listingScroll || loadingMoreMarketplaceResults || !canLoadMoreMarketplaceResults()) {
        return;
      }

      const remaining = listingScroll.scrollHeight - listingScroll.scrollTop - listingScroll.clientHeight;
      if (remaining > 56) {
        return;
      }

      loadingMoreMarketplaceResults = true;
      void invoke("load_more_price_check_results").catch((error) => {
        loadingMoreMarketplaceResults = false;
        pushStatus("trade", String(error));
      });
    },
    true,
  );

  root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const previewButton = target.closest<HTMLButtonElement>("[data-preview-listing]");

    if (!previewButton?.dataset.previewListing) {
      return;
    }

    event.preventDefault();

    const index = Number(previewButton.dataset.previewListing);
    if (!Number.isFinite(index)) {
      return;
    }

    if (pinnedListingPreviewIndex === index) {
      void hideListingPreview();
      return;
    }

    const itemSection =
      root.querySelector<HTMLElement>("[data-item-section]") ??
      root.querySelector<HTMLElement>("[data-item-profile]") ??
      root.querySelector<HTMLElement>(".poe-item-banner");
    const anchorTop =
      itemSection?.getBoundingClientRect().top ??
      previewButton.closest<HTMLElement>(".listing-row")?.getBoundingClientRect().top ??
      previewButton.getBoundingClientRect().top;
    void showListingPreviewForIndex(index, anchorTop);
  });

  root.querySelectorAll<HTMLElement>("[data-drag-handle]").forEach((element) => {
    element.addEventListener("mousedown", (event) => {
      const target = event.target as HTMLElement;

      if (
        target.closest("button") ||
        target.closest("select") ||
        target.closest("input") ||
        target.closest("textarea") ||
        target.closest("option") ||
        target.closest("[role='listbox']") ||
        target.closest(".compact-strip.is-campaign > div:first-child") ||
        target.closest("[data-campaign-step-key]") ||
        target.isContentEditable
      ) {
        return;
      }

      void invoke("start_drag_window").catch((error) =>
        pushStatus("window", String(error)),
      );
    });
  });

  window.addEventListener("keydown", (event) => {
    if (
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement ||
      (event.target instanceof HTMLElement && event.target.isContentEditable)
    ) {
      return;
    }
  });

  void listen<ScannedItem>("scan://item-updated", (event) => {
    loadingMoreMarketplaceResults = false;
    compactMode = false;
    recentPriceRequestSignatures.clear();
    void hideListingPreview();
    state.scanned_item = event.payload;
    applyProfileSelection(event.payload);
    latestRequestedFilterSignature = isExchangeClipboardItem(event.payload)
      ? null
      : currentRequestedFilterSignature();
    state.price_check = {
      status: `Applying ${priceProfileLabel(selectedPriceProfile)} profile...`,
      matched: 0,
      source_url: event.payload.trade_url,
      selected_currency: state.price_currency,
      selected_price_option: state.price_option,
      rate_source: null,
      rate_limit: null,
      currencies: fallbackCurrencies(),
      filters: [],
      requested_filters: [],
      applied_filters: [],
      listings: [],
      error: null,
    };
    if (isExchangeClipboardItem(event.payload)) {
      state.exchange_tab.status = `Loading cached exchange overview for ${event.payload.base_type ?? event.payload.name}...`;
      activeTab = "trade";
    } else {
      activeTab = "scan";
      void pushActivePriceFilters();
    }
    render();
  });

  void listen<PriceCheck>("scan://price-check-updated", (event) => {
    loadingMoreMarketplaceResults = false;
    const nextPriceCheck = normalizePriceCheck(event.payload);
    if (!nextPriceCheck) {
      return;
    }

    if (
      state.scanned_item &&
      !isExchangeClipboardItem(state.scanned_item) &&
      latestRequestedFilterSignature !== null &&
      activeFilterSignature(nextPriceCheck.requested_filters ?? []) !== latestRequestedFilterSignature
    ) {
      return;
    }

    state.price_check = nextPriceCheck;
    state.price_currency = nextPriceCheck.selected_currency;
    state.price_option = nextPriceCheck.selected_price_option;
    activeTab = isExchangeClipboardItem(state.scanned_item) ? "trade" : "scan";
    render();
  });

  void listen<ExchangeTabState>("scan://exchange-tab-updated", (event) => {
    state.exchange_tab = normalizeExchangeTab(event.payload);
    if (isExchangeClipboardItem(state.scanned_item)) {
      activeTab = "trade";
    }
    render();
  });

  void listen<string>("scan://zone-updated", (event) => {
    state.current_zone = event.payload;
    render();
  });

  void listen<CurrentAreaInfo>("scan://area-updated", (event) => {
    state.current_area = event.payload;
    const rawAct = event.payload.act ?? 0;
    const newAct = remapCampaignAct(rawAct);
    if (newAct !== campaignGuideAct) {
      campaignGuideAct = newAct;
      campaignGuidePage = 0;
    }
    if (event.payload.area_type === "hideout") {
      if (campaignTimerRunning) stopCampaignTimer();
      saveCampaignProgress();
    } else if (newAct > 0 && !campaignTimerRunning) {
      startCampaignTimer();
    }
    render();
  });

  void listen<TradeWhisper>("scan://trade-whisper", (event) => {
    state.trade_queue = [...state.trade_queue, event.payload];
    render();
  });

  void listen<TradeLeague[]>("scan://trade-leagues-updated", (event) => {
    state.trade_leagues = event.payload;
    render();
  });

  void listen<LeagueCatalogEntry[]>("scan://league-catalog-updated", (event) => {
    state.league_catalog = event.payload;
    render();
  });

  void listen<DataLeague[]>("scan://data-leagues-updated", (event) => {
    state.data_leagues = event.payload;
    render();
  });

  void listen<Poe2DbDataSnapshot>("scan://source-truth-updated", (event) => {
    state.source_truth_snapshot = event.payload;
    if (state.scanned_item && !isExchangeClipboardItem(state.scanned_item) && selectedSpecKeys.size) {
      scheduleActivePriceFilterPush();
    }
    render();
  });

  void listen<string>("scan://trade-league-updated", (event) => {
    state.trade_league = event.payload;
    render();
  });

  void listen<WorkerStatus>("scan://worker-status", (event) => {
    pushStatus(event.payload.worker, event.payload.message);
  });

  void listen<WorkerStatus>("scan://worker-error", (event) => {
    pushStatus(event.payload.worker, event.payload.message);
  });

  invoke<AppState>("get_app_state")
    .then((initialState) => {
      state.scanned_item = initialState.scanned_item;
      state.trade_queue = initialState.trade_queue;
      state.current_zone = initialState.current_zone || "Unknown";
      state.current_area = initialState.current_area || null;
      state.world_area_status = initialState.world_area_status || state.world_area_status;
      if (state.current_area) {
        const rawAct = state.current_area.act ?? 0;
        campaignGuideAct = remapCampaignAct(rawAct);
        if (campaignGuideAct > 0 && state.current_area.area_type !== "hideout") {
          startCampaignTimer();
        }
      }
      state.trade_league = initialState.trade_league || state.trade_league;
      state.league_catalog = initialState.league_catalog || [];
      state.trade_leagues = initialState.trade_leagues || [];
      state.data_leagues = initialState.data_leagues || [];
      state.source_truth_snapshot = initialState.source_truth_snapshot || null;
      state.price_check = normalizePriceCheck(initialState.price_check);
      state.exchange_tab = normalizeExchangeTab(initialState.exchange_tab);
      state.price_currency = initialState.price_currency || state.price_currency;
      state.price_option = initialState.price_option || state.price_option;
      if (state.scanned_item && !isExchangeClipboardItem(state.scanned_item)) {
        applyProfileSelection(state.scanned_item);
        latestRequestedFilterSignature = currentRequestedFilterSignature();
      }
      render();
    })
    .catch((error) => pushStatus("state", String(error)));

  invoke<string>("debug_log_path")
    .then((path) => {
      state.debug_log_path = path;
      render();
    })
    .catch((error) => pushStatus("debug", String(error)));
} else {
  startListingPreviewPolling();

  void listen<ListingPreviewRequest>("preview://listing-updated", (event) => {
    hoveredListingPreview = event.payload;
    render();
  });

  void listen("preview://listing-cleared", () => {
    hoveredListingPreview = null;
    render();
  });

  invoke<ListingPreviewRequest | null>("get_listing_preview")
    .then((preview) => {
      hoveredListingPreview = preview;
      render();
    })
    .catch((error) => {
      console.error("failed to load initial listing preview", error);
    });

  window.addEventListener("beforeunload", () => {
    stopListingPreviewPolling();
  });
}

render();

function formatListed(value: string) {
  const indexed = new Date(value);
  if (!Number.isFinite(indexed.getTime())) {
    return value;
  }

  const seconds = Math.max(0, Math.floor((Date.now() - indexed.getTime()) / 1000));
  if (seconds < 3600) {
    return "<1h";
  }

  if (seconds < 86_400) {
    return `${Math.floor(seconds / 3600)}h`;
  }

  if (seconds < 2_592_000) {
    return `${Math.floor(seconds / 86_400)}d`;
  }

  if (seconds < 31_536_000) {
    return `${Math.floor(seconds / 2_592_000)}mo`;
  }

  return `${Math.floor(seconds / 31_536_000)}y`;
}
