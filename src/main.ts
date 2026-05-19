import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./styles.css";

type TabId = "scan" | "trade" | "data";

type AppState = {
  scanned_item: ScannedItem | null;
  trade_queue: TradeWhisper[];
  current_zone: string;
  trade_league: string;
  league_catalog: LeagueCatalogEntry[];
  trade_leagues: TradeLeague[];
  data_leagues: DataLeague[];
  price_check: PriceCheck | null;
  exchange_tab: ExchangeTabState;
  price_currency: string;
  debug_log_path: string | null;
};

type ScannedItem = {
  name: string;
  rarity: string;
  family: string;
  item_class: string | null;
  base_type: string | null;
  item_level: number | null;
  property_lines: string[];
  explicit_mods: string[];
  sockets: number | null;
  spirit: number | null;
  hazards: string[];
  trade_url: string | null;
  raw_text: string;
};

type PriceCheck = {
  status: string;
  matched: number;
  source_url: string | null;
  selected_currency: string;
  rate_source: string | null;
  rate_limit: TradeRateLimit | null;
  currencies: CurrencyMeta[];
  filters: PriceFilter[];
  listings: PriceListing[];
  error: string | null;
};

type TradeRateLimit = {
  policy: string | null;
  scope: string;
  current_hits: number | null;
  limit: number | null;
  interval_seconds: number | null;
  usage_ratio: number;
  active_timeout_seconds: number | null;
  retry_after_seconds: number | null;
};

type CurrencyMeta = {
  id: string;
  name: string;
  icon_url: string | null;
};

type PriceFilter = {
  label: string;
  source: string;
  enabled: boolean;
  value: number | null;
  min: number | null;
  max: number | null;
  tier: string | null;
};

type PriceListing = {
  price: string;
  amount: number | null;
  currency: string | null;
  currency_icon_url: string | null;
  normalized_price: string | null;
  normalized_amount: number | null;
  normalized_currency: string | null;
  normalized_currency_icon_url: string | null;
  item_level: number | null;
  listed: string;
  source_url: string;
  seller: string | null;
  online: boolean;
  required_level: number | null;
  quality: number | null;
  armour: number | null;
  evasion: number | null;
  energy_shield: number | null;
  explicit_mods: string[];
};

type ItemProfile = {
  requiredLevel: number | null;
  quality: number | null;
  evasion: number | null;
  energyShield: number | null;
  armour: number | null;
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

type ItemSpec = {
  key: string;
  label: string;
  kind: "item_level" | "required_level" | "quality" | "armour" | "evasion" | "energy_shield" | "sockets" | "spirit" | "explicit";
  value: number | null;
  template: string;
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

if (!root) {
  throw new Error("Lumen-Scan root element was not found.");
}

const state: AppState = {
  scanned_item: null,
  trade_queue: [],
  current_zone: "Unknown",
  trade_league: "Fate of the Vaal",
  league_catalog: [],
  trade_leagues: [],
  data_leagues: [],
  price_check: null,
  exchange_tab: fallbackExchangeTab(),
  price_currency: "exalted",
  debug_log_path: null,
};

let activeTab: TabId = "scan";
let workerMessages: WorkerStatus[] = [];
let compactMode = false;
let selectedSpecKeys = new Set<string>();
let appliedWindowLayout: "scan" | "trade" | "idle" | "default" | "compact" | null = null;
let evaluateLayoutFrame = 0;
let tradeSearchQuery = "";
let loadingMoreMarketplaceResults = false;

const LOCAL_CURRENCY_ICONS: Record<string, string> = {
  exalted: "/currency/exalted.webp",
  divine: "/currency/divine.webp",
  regal: "/currency/regal.webp",
  transmute: "/currency/transmute.webp",
  chaos: "/currency/chaos.webp",
  vaal: "/currency/vaal.webp",
  alchemy: "/currency/alchemy.webp",
  annul: "/currency/annul.webp",
  chance: "/currency/chance.webp",
  augment: "/currency/augment.webp",
};

root.innerHTML = `
  <main class="overlay-root">
    <section class="hud-card interactive" data-interactive>
      <header class="hud-header" data-drag-handle>
        <div class="brand-lockup">
          <h1 class="brand-title">kalandra</h1>
        </div>
        <div class="window-controls">
          <div class="zone-pill" data-zone>Zone: Unknown</div>
          <select class="league-select" data-league aria-label="Trade league">
            <option>Fate of the Vaal</option>
            <option>HC Fate of the Vaal</option>
            <option>Standard</option>
            <option>Hardcore</option>
          </select>
          <button class="chrome-button" data-toggle-compact type="button" title="Toggle compact mode">Line</button>
          <button class="chrome-button chrome-button-minimize" data-minimize type="button" title="Minimize" aria-label="Minimize">-</button>
        </div>
      </header>

      <div class="compact-strip" data-drag-handle>
        <div>
          <span data-compact-title>Kalandra ready</span>
          <strong data-compact-meta>Ctrl+C scan | Alt+D trade</strong>
        </div>
        <button class="chrome-button" data-toggle-compact type="button">Open</button>
      </div>

      <nav class="tab-row" aria-label="Overlay panels">
        <button class="tab-button" data-tab="scan" type="button" title="Scan">
          <span class="tab-label">Scan</span>
        </button>
        <button class="tab-button" data-tab="trade" type="button" title="Trade">
          <span class="tab-label">Trade</span>
        </button>
        <button class="tab-button" data-tab="data" type="button" title="Data">
          <span class="tab-label">Data</span>
        </button>
      </nav>

      <div class="panel" data-panel></div>
    </section>
  </main>
`;

const panel = root.querySelector<HTMLElement>("[data-panel]");
const zone = root.querySelector<HTMLElement>("[data-zone]");
const leagueSelect = root.querySelector<HTMLSelectElement>("[data-league]");
const hudCard = root.querySelector<HTMLElement>(".hud-card");
const compactTitle = root.querySelector<HTMLElement>("[data-compact-title]");
const compactMeta = root.querySelector<HTMLElement>("[data-compact-meta]");
const tabButtons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-tab]"));

if (!panel || !zone || !leagueSelect || !hudCard || !compactTitle || !compactMeta) {
  throw new Error("Lumen-Scan UI shell failed to initialize.");
}

const panelElement = panel;
const zoneElement = zone;
const leagueElement = leagueSelect;
const hudElement = hudCard;
const compactTitleElement = compactTitle;
const compactMetaElement = compactMeta;

function render() {
  zoneElement.textContent = `Zone: ${state.current_zone || "Unknown"}`;
  renderLeagueOptions();
  hudElement.classList.toggle("is-compact", compactMode);
  hudElement.dataset.tab = activeTab;
  panelElement.dataset.tab = activeTab;

  tabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === activeTab);
  });

  const lastStatus =
    workerMessages.slice(-1)[0]?.message ??
    "Ctrl+C scans items. Alt+D opens the latest trade search.";

  compactTitleElement.textContent = compactTitleText(state.scanned_item);
  compactMetaElement.textContent = compactMetaText(lastStatus);

  if (activeTab === "scan") {
    panelElement.innerHTML = renderScanPanel(state.scanned_item, state.price_check);
    queueEvaluateLayoutSync();
  }

  if (activeTab === "trade") {
    panelElement.innerHTML = renderTradePanel(state.exchange_tab);
  }

  if (activeTab === "data") {
    panelElement.innerHTML = renderDataPanel();
  }

  syncWindowLayout();
}

function renderLeagueOptions() {
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

function compactTitleText(item: ScannedItem | null) {
  if (!item) {
    return "Kalandra | waiting for item";
  }

  const hazardPrefix = item.hazards.length ? "WARNING | " : "";
  return `${hazardPrefix}${item.name}`;
}

function compactMetaText(status: string) {
  if (state.scanned_item?.base_type) {
    return `${state.scanned_item.base_type} | Alt+D trade`;
  }

  return status;
}

function renderScanPanel(item: ScannedItem | null, priceCheck: PriceCheck | null) {
  if (!item) {
    return `
      <div class="empty-state">
        <p class="section-label">Waiting for clipboard scan</p>
        <p>Hover an item in PoE2 and press <kbd>Ctrl</kbd> + <kbd>C</kbd>. The parsed item and hazard profile will land here.</p>
      </div>
    `;
  }

  const profile = itemProfile(item);
  const specs = itemSpecs(item, profile);
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
            ${renderModifierSections(modifierGroups)}
          </div>
          <div class="item-tags">
            <span>${escapeHtml(item.rarity)} ${escapeHtml(itemClass)}</span>
            <span>${item.family === "currency" ? "Exchange Mode" : item.hazards.length ? "Hazards detected" : "Modifiable"}</span>
          </div>
          <div class="match-toggle-row" aria-label="Search profile">
            <label><input type="radio" name="match-profile" checked /> Exact Match</label>
            <label><input type="radio" name="match-profile" /> Broad (-10%)</label>
          </div>
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

function renderValueLine(spec: ItemSpec) {
  const active = selectedSpecKeys.has(spec.key);
  const [label, value] = splitSpecLabel(spec.label);

  return `
    <button
      class="defense-spec value-line ${active ? "is-active" : ""}"
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

function renderItemSpec(spec: ItemSpec, tone = "explicit") {
  return renderSpecButton(spec, `mod-chip is-${tone}`);
}

function renderModifierSections(groups: ModifierGroups) {
  const sections = [
    renderModifierGroup("Rune Mods", groups.rune, "rune"),
    renderModifierGroup("Item Mods", groups.explicit, "explicit"),
    renderModifierGroup("Implicit", groups.implicit, "implicit"),
    renderModifierGroup("Special", groups.special, "special"),
  ].filter(Boolean);

  return sections.length
    ? sections.join("")
    : `<div class="mod-chip muted">No explicit modifiers parsed yet.</div>`;
}

function renderModifierGroup(
  label: string,
  specs: ItemSpec[],
  tone: "rune" | "explicit" | "implicit" | "special",
) {
  if (!specs.length) {
    return "";
  }

  return `
    <section class="modifier-group modifier-group-${tone}">
      <p class="modifier-group-label">${escapeHtml(label)}</p>
      <div class="modifier-group-body">
        ${specs.map((spec) => renderItemSpec(spec, tone)).join("")}
      </div>
    </section>
  `;
}

function renderSpecButton(spec: ItemSpec, className: string) {
  const active = selectedSpecKeys.has(spec.key);
  return `
    <button
      class="${className} spec-chip ${active ? "is-active" : ""}"
      data-spec-key="${escapeAttribute(spec.key)}"
      type="button"
      title="Rebuild trade search with this specification"
    >
      ${escapeHtml(spec.label)}
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

function isItemValueModifier(label: string) {
  return /^(quality|armour|evasion rating|energy shield|physical damage|critical hit chance|attacks per second|dps):/i.test(
    cleanTradeMarkup(label),
  );
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

  const visibleListings = filteredListings(priceCheck, item);
  const estimate = estimatePriceFromListings(priceCheck, visibleListings);
  const selectedCurrency = currencyById(priceCheck, priceCheck.selected_currency);
  const filters = priceCheck.filters.length
    ? priceCheck.filters
        .map((filter) => renderPriceFilter(filter))
        .join("")
    : `<div class="price-filter muted">No editable filters parsed yet.</div>`;
  const listings = visibleListings.length
    ? visibleListings.map((listing) => renderListingRow(listing, item)).join("")
    : `<button class="listing-row empty-listing" type="button">${escapeHtml(emptyListingMessage(priceCheck, selectedCurrency))}</button>`;

  return `
    <section class="price-check">
      <div class="price-check-meta">
        <div class="estimate-card">
          <div>
            <p class="section-label">Estimated Value</p>
            <div class="estimate-value">
              <span>~</span>
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
          <span>${visibleListings.length}/${priceCheck.matched}</span>
          <button class="source-link" data-source-url="${escapeAttribute(priceCheck.source_url ?? "")}" type="button" ${priceCheck.source_url ? "" : "disabled"}>
            Results from pathofexile.com/trade
          </button>
          <button class="refresh-mark" data-open-trade type="button" title="Open latest search">Refresh</button>
        </div>

        <div class="trade-control-row">
          <label>
            <span>Currency</span>
            <select data-price-currency aria-label="Show listings priced in currency">
              ${renderCurrencyOptions(priceCheck)}
            </select>
          </label>
          <label>
            <span>Buy Type</span>
            <select aria-label="Buy type">
              <option>Instant Buy...</option>
              <option>Any Listing</option>
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
    ? priceCheck.listings.map((listing) => renderListingRow(listing, item)).join("")
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
          <span>Currency</span>
          <select data-price-currency aria-label="Normalize listing prices into currency">
            ${renderCurrencyOptions(priceCheck)}
          </select>
        </label>
        <label>
          <span>Buy Type</span>
          <select aria-label="Buy type">
            <option>Instant Buy...</option>
            <option>Any Listing</option>
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

function renderListingRow(listing: PriceListing, item?: ScannedItem) {
  const priceIconUrl = resolveCurrencyIcon(listing.currency, listing.currency_icon_url);
  const priceIcon = priceIconUrl
    ? `<img class="currency-icon" src="${escapeAttribute(priceIconUrl)}" alt="" />`
    : "";
  const seller = listing.seller ?? "Unknown";
  const quality = listing.quality ?? (item ? itemProfile(item).quality ?? 0 : 0);
  const itemLevel = listing.item_level ?? item?.item_level ?? 0;

  return `
    <button class="listing-row" data-source-url="${escapeAttribute(listing.source_url)}" type="button">
      <span class="inspect-eye">View</span>
      <span class="listing-price">${priceIcon}${escapeHtml(listing.price)}${listing.online ? '<i class="online-dot"></i>' : ""}</span>
      <span>${itemLevel}</span>
      <span>${quality}%</span>
      <span class="seller-name">${escapeHtml(shortSeller(seller))}</span>
      <span>${escapeHtml(formatListed(listing.listed))}</span>
    </button>
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
      <div><span>Item Source</span><strong>PoE2DB</strong><small>Planned CLI feed for item descriptions and metadata.</small></div>
      <div><span>Debug Log</span><strong>Trade diagnostics</strong><small>${escapeHtml(state.debug_log_path ?? "Log path loading...")}</small></div>
      <div><span>League Catalog</span><strong>${escapeHtml(state.trade_league)}</strong><ul class="feed-list">${catalogRows}</ul></div>
      <div><span>PoE2DB Data Feed</span><strong>Early league/item signal</strong><ul class="feed-list">${dataLeagueRows}</ul></div>
    </div>
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

function itemProfile(item: ScannedItem): ItemProfile {
  return {
    requiredLevel: parseRawNumber(item.raw_text, /(?:^|\n)Requires:.*?\bLevel\s+(\d+)/i),
    quality: parseRawNumber(item.raw_text, /(?:^|\n)Quality:\s*\+?(\d+)%/i),
    evasion: parseRawNumber(item.raw_text, /(?:^|\n)Evasion Rating:\s*(\d+)/i),
    energyShield: parseRawNumber(item.raw_text, /(?:^|\n)Energy Shield:\s*(\d+)/i),
    armour: parseRawNumber(item.raw_text, /(?:^|\n)Armour:\s*(\d+)/i),
  };
}

function itemSpecs(item: ScannedItem, profile = itemProfile(item)): ItemSpec[] {
  const specs: ItemSpec[] = [];

  addNumericSpec(specs, "item_level", "Item Level", item.item_level);
  addNumericSpec(specs, "required_level", "Requires Level", profile.requiredLevel);
  addNumericSpec(specs, "armour", "Armour", profile.armour);
  addNumericSpec(specs, "evasion", "Evasion Rating", profile.evasion);
  addNumericSpec(specs, "energy_shield", "Energy Shield", profile.energyShield);
  addNumericSpec(specs, "quality", "Quality", profile.quality, "%");
  addNumericSpec(specs, "sockets", "Sockets", item.sockets);
  addNumericSpec(specs, "spirit", "Spirit", item.spirit);

  item.explicit_mods.forEach((modifier, index) => {
    const label = cleanTradeMarkup(modifier);
    specs.push({
      key: `explicit:${index}:${specTemplate(label)}`,
      label,
      kind: "explicit",
      value: firstNumber(label),
      template: specTemplate(label),
    });
  });

  return specs;
}

function addNumericSpec(
  specs: ItemSpec[],
  kind: ItemSpec["kind"],
  label: string,
  value: number | null,
  suffix = "",
) {
  if (value === null) {
    return;
  }

  specs.push({
    key: `${kind}:${value}`,
    label: `${label}: ${value}${suffix}`,
    kind,
    value,
    template: kind,
  });
}

function filteredListings(priceCheck: PriceCheck, item?: ScannedItem) {
  const specs = item ? itemSpecs(item) : [];
  const selectedSpecs = specs.filter((spec) => selectedSpecKeys.has(spec.key));

  return priceCheck.listings.filter((listing) => {
    if (listing.currency !== priceCheck.selected_currency) {
      return false;
    }

    return selectedSpecs.every((spec) => listingMatchesSpec(listing, spec));
  });
}

function listingMatchesSpec(listing: PriceListing, spec: ItemSpec) {
  switch (spec.kind) {
    case "item_level":
      return numericAtLeast(listing.item_level, spec.value);
    case "required_level":
      return numericEquals(listing.required_level, spec.value);
    case "quality":
      return numericEquals(listing.quality, spec.value);
    case "armour":
      return numericAtLeast(listing.armour, spec.value);
    case "evasion":
      return numericAtLeast(listing.evasion, spec.value);
    case "energy_shield":
      return numericAtLeast(listing.energy_shield, spec.value);
    case "sockets":
    case "spirit":
      return true;
    case "explicit":
      return listing.explicit_mods.some((modifier) => specTemplate(cleanTradeMarkup(modifier)) === spec.template);
  }
}

function numericAtLeast(actual: number | null, expected: number | null) {
  return actual !== null && expected !== null && actual >= expected;
}

function numericEquals(actual: number | null, expected: number | null) {
  return actual !== null && expected !== null && Math.round(actual) === Math.round(expected);
}

function cleanTradeMarkup(value: string) {
  return value.replace(/\[([^|\]]+\|)?([^\]]+)\]/g, "$2").replace(/\s+/g, " ").trim();
}

function specTemplate(value: string) {
  return cleanTradeMarkup(value)
    .toLowerCase()
    .replace(/\d+(?:\.\d+)?/g, "#")
    .replace(/[^a-z#%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstNumber(value: string) {
  const match = value.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function estimatePriceFromListings(priceCheck: PriceCheck, listings: PriceListing[]): PriceEstimate {
  const currency = currencyById(priceCheck, priceCheck.selected_currency);
  const values = listings
    .map((listing) => listing.amount)
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

function emptyListingMessage(priceCheck: PriceCheck, currency: CurrencyMeta) {
  if (priceCheck.error) {
    return priceCheck.error;
  }

  if (!priceCheck.listings.some((listing) => listing.currency === priceCheck.selected_currency)) {
    return `No fetched listings are priced in ${currency.name}.`;
  }

  if (selectedSpecKeys.size) {
    return "No fetched listings match the selected item specifications.";
  }

  return priceCheck.status;
}

async function pushActivePriceFilters() {
  if (!state.scanned_item) {
    return;
  }

  const specs = itemSpecs(state.scanned_item).filter((spec) => selectedSpecKeys.has(spec.key));
  await invoke("set_active_price_filters", {
    filters: specs.map((spec) => ({
      kind: spec.kind,
      label: spec.label,
      value: spec.value,
      template: spec.template,
    })),
  }).catch((error) => pushStatus("price", String(error)));
}

function parseRawNumber(rawText: string, regex: RegExp) {
  const match = rawText.match(regex);
  if (!match?.[1]) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
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

function fallbackCurrencies(): CurrencyMeta[] {
  return [
    { id: "exalted", name: "Exalted Orb", icon_url: resolveCurrencyIcon("exalted", null) },
    { id: "divine", name: "Divine Orb", icon_url: resolveCurrencyIcon("divine", null) },
    { id: "regal", name: "Regal Orb", icon_url: resolveCurrencyIcon("regal", null) },
    { id: "transmute", name: "Orb of Transmutation", icon_url: resolveCurrencyIcon("transmute", null) },
    { id: "chaos", name: "Chaos Orb", icon_url: resolveCurrencyIcon("chaos", null) },
    { id: "alchemy", name: "Orb of Alchemy", icon_url: resolveCurrencyIcon("alchemy", null) },
    { id: "chance", name: "Orb of Chance", icon_url: resolveCurrencyIcon("chance", null) },
    { id: "augment", name: "Orb of Augmentation", icon_url: resolveCurrencyIcon("augment", null) },
    { id: "annul", name: "Orb of Annulment", icon_url: resolveCurrencyIcon("annul", null) },
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

  return LOCAL_CURRENCY_ICONS[currencyId.toLowerCase()] ?? null;
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

  const haystack = [
    item.family,
    item.item_class ?? "",
    item.base_type ?? "",
    item.name,
  ]
    .join(" ")
    .toLowerCase();

  return [
    "currency",
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
    "charm",
  ].some((needle) => haystack.includes(needle));
}

function desiredWindowLayout(): "scan" | "trade" | "idle" | "default" | "compact" {
  if (compactMode) {
    return "compact";
  }

  if (activeTab === "trade") {
    return "trade";
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

  const evaluate = panelElement.querySelector<HTMLElement>(".evaluate-card");
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

  const panelHeight = panelElement.clientHeight;
  if (!panelHeight) {
    return;
  }

  const sectionGap = 6;
  const metaHeight = priceCheckMeta?.offsetHeight ?? 0;
  const listingHeaderHeight = listingHeader?.offsetHeight ?? 0;
  const listingRowHeight = Math.max(28, listingRow?.offsetHeight ?? 28);
  const desiredVisibleRows = 5;
  const listingChrome = 18;
  const minimumResultsHeight =
    metaHeight + listingHeaderHeight + desiredVisibleRows * listingRowHeight + listingChrome;
  const minimumItemHeight = 240;
  const maximumResultsHeight = Math.max(260, panelHeight - minimumItemHeight - sectionGap);
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

  const availableItemHeight = Math.max(
    minimumItemHeight,
    itemSection.clientHeight || panelHeight - resultsHeight - sectionGap,
  );
  const modsMaxHeight = Math.max(
    92,
    availableItemHeight - nonProfileHeight - staticProfileHeight - 14,
  );

  evaluate.style.setProperty("--mods-max-height", `${modsMaxHeight}px`);
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
  const minimizeButton = target.closest<HTMLButtonElement>("[data-minimize]");
  const sourceButton = target.closest<HTMLButtonElement>("[data-source-url]");
  const specButton = target.closest<HTMLButtonElement>("[data-spec-key]");
  const clearSpecsButton = target.closest<HTMLButtonElement>("[data-clear-specs]");
  const exchangeCategoryButton = target.closest<HTMLButtonElement>("[data-exchange-category]");
  const exchangeRefreshButton = target.closest<HTMLButtonElement>("[data-refresh-exchange]");
  const exchangeCopyButton = target.closest<HTMLButtonElement>("[data-copy-exchange]");
  const exchangeQuoteButton = target.closest<HTMLButtonElement>("[data-exchange-quote]");

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

  if (specButton?.dataset.specKey) {
    const specKey = specButton.dataset.specKey;
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
    void pushActivePriceFilters();
    return;
  }

  if (clearSpecsButton) {
    selectedSpecKeys.clear();
    if (state.price_check) {
      state.price_check.status = "Clearing selected spec filters...";
    }
    loadingMoreMarketplaceResults = false;
    render();
    void pushActivePriceFilters();
    return;
  }

  if (compactButton) {
    compactMode = !compactMode;
    render();
    return;
  }

  if (minimizeButton) {
    await invoke("minimize_window").catch((error) =>
      pushStatus("window", String(error)),
    );
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
});

root.addEventListener("change", async (event) => {
  const target = event.target as HTMLElement;
  const currencySelect = target.closest<HTMLSelectElement>("[data-price-currency]");

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

  if (!tradeSearch) {
    return;
  }

  tradeSearchQuery = tradeSearch.value;
  render();
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
  state.scanned_item = event.payload;
  selectedSpecKeys.clear();
  state.price_check = {
    status: "Checking matched listings...",
    matched: 0,
    source_url: event.payload.trade_url,
    selected_currency: state.price_currency,
    rate_source: null,
    rate_limit: null,
    currencies: fallbackCurrencies(),
    filters: [],
    listings: [],
    error: null,
  };
  if (isExchangeClipboardItem(event.payload)) {
    state.exchange_tab.status = `Loading cached exchange overview for ${event.payload.base_type ?? event.payload.name}...`;
    activeTab = "trade";
  } else {
    activeTab = "scan";
  }
  render();
});

void listen<PriceCheck>("scan://price-check-updated", (event) => {
  loadingMoreMarketplaceResults = false;
  state.price_check = normalizePriceCheck(event.payload);
  state.price_currency = event.payload.selected_currency;
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
    state.trade_league = initialState.trade_league || state.trade_league;
    state.league_catalog = initialState.league_catalog || [];
    state.trade_leagues = initialState.trade_leagues || [];
    state.data_leagues = initialState.data_leagues || [];
    state.price_check = normalizePriceCheck(initialState.price_check);
    state.exchange_tab = normalizeExchangeTab(initialState.exchange_tab);
    state.price_currency = initialState.price_currency || state.price_currency;
    render();
  })
  .catch((error) => pushStatus("state", String(error)));

invoke<string>("debug_log_path")
  .then((path) => {
    state.debug_log_path = path;
    render();
  })
  .catch((error) => pushStatus("debug", String(error)));

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
