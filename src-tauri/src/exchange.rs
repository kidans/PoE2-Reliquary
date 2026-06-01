use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    collections::HashMap,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::sync::Mutex;

use crate::{debug_log, CurrencyMeta, Item, PriceCheck};

const POE_NINJA_BASE: &str = "https://poe.ninja";
const POE_CDN_BASE: &str = "https://web.poecdn.com";
const POE_NINJA_EXCHANGE_OVERVIEW_URL: &str =
    "https://poe.ninja/poe2/api/economy/exchange/current/overview";
const POE_NINJA_STASH_OVERVIEW_URL: &str =
    "https://poe.ninja/poe2/api/economy/stash/current/item/overview";
const POE_NINJA_INDEX_STATE_URL: &str = "https://poe.ninja/poe2/api/data/index-state";
const EXCHANGE_CACHE_TTL: Duration = Duration::from_secs(30 * 60);
const DEFAULT_CATEGORY_ID: &str = "currency";

static EXCHANGE_CATEGORY_MANIFEST: &[ExchangeCategoryManifestEntry] = &[
    ExchangeCategoryManifestEntry {
        id: "currency",
        group: "General",
        label: "Currency",
        feed: "exchange",
        poe_ninja_type: Some("Currency"),
        poe_ninja_slug: Some("currency"),
        icon_url: Some("https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lNb2RWYWx1ZXMiLCJzY2FsZSI6MSwicmVhbG0iOiJwb2UyIn1d/2986e220b3/CurrencyModValues.png"),
        available: true,
    },
    ExchangeCategoryManifestEntry {
        id: "fragments",
        group: "General",
        label: "Fragments",
        feed: "exchange",
        poe_ninja_type: Some("Fragments"),
        poe_ninja_slug: Some("fragments"),
        icon_url: Some("https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQnJlYWNoL0JyZWFjaHN0b25lIiwic2NhbGUiOjEsInJlYWxtIjoicG9lMiJ9XQ/d60587d724/Breachstone.png"),
        available: true,
    },
    ExchangeCategoryManifestEntry {
        id: "abyss",
        group: "General",
        label: "Abyssal Bones",
        feed: "exchange",
        poe_ninja_type: Some("Abyss"),
        poe_ninja_slug: Some("abyssal-bones"),
        icon_url: Some("https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQWJ5c3NhbEV5ZVNvY2tldGFibGVzL1RlY3JvZHNHYXplIiwic2NhbGUiOjEsInJlYWxtIjoicG9lMiJ9XQ/ef2a9355b4/TecrodsGaze.png"),
        available: true,
    },
    ExchangeCategoryManifestEntry {
        id: "uncut-gems",
        group: "General",
        label: "Uncut Gems",
        feed: "exchange",
        poe_ninja_type: Some("UncutGems"),
        poe_ninja_slug: Some("uncut-gems"),
        icon_url: Some("https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvR2Vtcy9VbmN1dFN1cHBvcnRHZW0iLCJzY2FsZSI6MSwicmVhbG0iOiJwb2UyIn1d/d1ffe1c951/UncutSupportGem.png"),
        available: true,
    },
    ExchangeCategoryManifestEntry {
        id: "gems",
        group: "General",
        label: "Lineage Gems",
        feed: "exchange",
        poe_ninja_type: Some("LineageSupportGems"),
        poe_ninja_slug: Some("lineage-support-gems"),
        icon_url: Some("https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvR2Vtcy9OZXcvTmV3U3VwcG9ydC9MaW5lYWdlL1dpbGRzaGFyZHMiLCJzY2FsZSI6MSwicmVhbG0iOiJwb2UyIn1d/6d700adf17/Wildshards.png"),
        available: true,
    },
    ExchangeCategoryManifestEntry {
        id: "essences",
        group: "General",
        label: "Essences",
        feed: "exchange",
        poe_ninja_type: Some("Essences"),
        poe_ninja_slug: Some("essences"),
        icon_url: Some("https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvRXNzZW5jZS9HcmVhdGVyQXR0cmlidXRlRXNzZW5jZSIsInNjYWxlIjoxLCJyZWFsbSI6InBvZTIifV0/8a8cb823af/GreaterAttributeEssence.png"),
        available: true,
    },
    ExchangeCategoryManifestEntry {
        id: "soul-cores",
        group: "General",
        label: "Soul Cores",
        feed: "exchange",
        poe_ninja_type: Some("SoulCores"),
        poe_ninja_slug: Some("soul-cores"),
        icon_url: Some("https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvU291bENvcmVzL0dyZWF0ZXJTb3VsQ29yZU1hbmEiLCJzY2FsZSI6MSwicmVhbG0iOiJwb2UyIn1d/1437190de2/GreaterSoulCoreMana.png"),
        available: true,
    },
    ExchangeCategoryManifestEntry {
        id: "idols",
        group: "General",
        label: "Idols",
        feed: "exchange",
        poe_ninja_type: Some("Idols"),
        poe_ninja_slug: Some("idols"),
        icon_url: Some("https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvVG9ybWVudGVkU3Bpcml0U29ja2V0YWJsZXMvQXptZXJpU29ja2V0YWJsZU1vbmtleVNwZWNpYWwiLCJzY2FsZSI6MSwicmVhbG0iOiJwb2UyIn1d/8ffc9986a0/AzmeriSocketableMonkeySpecial.png"),
        available: true,
    },
    ExchangeCategoryManifestEntry {
        id: "runes",
        group: "General",
        label: "Runes",
        feed: "exchange",
        poe_ninja_type: Some("Runes"),
        poe_ninja_slug: Some("runes"),
        icon_url: Some("https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvUnVuZXMvTGlnaHRuaW5nUnVuZSIsInNjYWxlIjoxLCJyZWFsbSI6InBvZTIifV0/98319b3998/LightningRune.png"),
        available: true,
    },
    ExchangeCategoryManifestEntry {
        id: "ritual",
        group: "General",
        label: "Omens",
        feed: "exchange",
        poe_ninja_type: Some("Ritual"),
        poe_ninja_slug: Some("omens"),
        icon_url: Some("https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvT21lbnMvVm9vZG9vT21lbnMzUmVkIiwic2NhbGUiOjEsInJlYWxtIjoicG9lMiJ9XQ/9cfdcc9e1a/VoodooOmens3Red.png"),
        available: true,
    },
    ExchangeCategoryManifestEntry {
        id: "expedition",
        group: "General",
        label: "Expedition",
        feed: "exchange",
        poe_ninja_type: Some("Expedition"),
        poe_ninja_slug: Some("expedition"),
        icon_url: Some("https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvRXhwZWRpdGlvbi9CYXJ0ZXJSZWZyZXNoQ3VycmVuY3kiLCJzY2FsZSI6MSwicmVhbG0iOiJwb2UyIn1d/8a4fe1f468/BarterRefreshCurrency.png"),
        available: true,
    },
    ExchangeCategoryManifestEntry {
        id: "delirium",
        group: "General",
        label: "Liquid Emotions",
        feed: "exchange",
        poe_ninja_type: Some("Delirium"),
        poe_ninja_slug: Some("liquid-emotions"),
        icon_url: Some("https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvRGlzdGlsbGVkRW1vdGlvbnMvRGlzdGlsbGVkUGFyYW5vaWEiLCJzY2FsZSI6MSwicmVhbG0iOiJwb2UyIn1d/279e807e8f/DistilledParanoia.png"),
        available: true,
    },
    ExchangeCategoryManifestEntry {
        id: "breach",
        group: "General",
        label: "Catalysts",
        feed: "exchange",
        poe_ninja_type: Some("Breach"),
        poe_ninja_slug: Some("breach-catalyst"),
        icon_url: Some("https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQnJlYWNoL0JyZWFjaENhdGFseXN0TWFuYSIsInNjYWxlIjoxLCJyZWFsbSI6InBvZTIifV0/61d3a7a832/BreachCatalystMana.png"),
        available: true,
    },
    ExchangeCategoryManifestEntry {
        id: "verisium",
        group: "General",
        label: "Verisium",
        feed: "exchange",
        poe_ninja_type: Some("Verisium"),
        poe_ninja_slug: Some("verisium"),
        icon_url: Some("https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvRXhwZWRpdGlvbjIvUmVmaW5lZFZlcmlzaXVtIiwic2NhbGUiOjEsInJlYWxtIjoicG9lMiJ9XQ/35616acb9f/RefinedVerisium.png"),
        available: true,
    },
    ExchangeCategoryManifestEntry {
        id: "unique-weapons",
        group: "Equipment",
        label: "Unique Weapons",
        feed: "stash",
        poe_ninja_type: Some("UniqueWeapons"),
        poe_ninja_slug: Some("unique-weapons"),
        icon_url: Some("https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvV2VhcG9ucy9PbmVIYW5kV2VhcG9ucy9PbmVIYW5kTWFjZXMvVW5pcXVlcy9Nam9sbmVyIiwidyI6MiwiaCI6Mywic2NhbGUiOjEsInJlYWxtIjoicG9lMiJ9XQ/9216de28a2/Mjolner.png"),
        available: true,
    },
    ExchangeCategoryManifestEntry {
        id: "unique-armours",
        group: "Equipment",
        label: "Unique Armours",
        feed: "stash",
        poe_ninja_type: Some("UniqueArmours"),
        poe_ninja_slug: Some("unique-armours"),
        icon_url: Some("https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQXJtb3Vycy9HbG92ZXMvVW5pcXVlcy9NYWxpZ2Fyb3NWaXJ0dW9zaXR5IiwidyI6MiwiaCI6Miwic2NhbGUiOjEsInJlYWxtIjoicG9lMiJ9XQ/08f6808733/MaligarosVirtuosity.png"),
        available: true,
    },
    ExchangeCategoryManifestEntry {
        id: "unique-accessories",
        group: "Equipment",
        label: "Unique Accessories",
        feed: "stash",
        poe_ninja_type: Some("UniqueAccessories"),
        poe_ninja_slug: Some("unique-accessories"),
        icon_url: Some("https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQmVsdHMvVW5pcXVlcy9IZWFkaHVudGVyIiwidyI6MiwiaCI6MSwic2NhbGUiOjEsInJlYWxtIjoicG9lMiJ9XQ/24accb4eec/Headhunter.png"),
        available: true,
    },
    ExchangeCategoryManifestEntry {
        id: "unique-flasks",
        group: "Equipment",
        label: "Unique Flasks",
        feed: "stash",
        poe_ninja_type: Some("UniqueFlasks"),
        poe_ninja_slug: Some("unique-flasks"),
        icon_url: Some("https://web.poecdn.com/gen/image/WzksMTQseyJmIjoiMkRJdGVtcy9GbGFza3MvVW5pcXVlcy9MYXZpYW5nYXNTcGlyaXQiLCJ3IjoxLCJoIjoyLCJzY2FsZSI6MSwicmVhbG0iOiJwb2UyIiwibGV2ZWwiOjF9XQ/ef79cd6b0d/LaviangasSpirit.png"),
        available: true,
    },
    ExchangeCategoryManifestEntry {
        id: "unique-charms",
        group: "Equipment",
        label: "Unique Charms",
        feed: "stash",
        poe_ninja_type: Some("UniqueCharms"),
        poe_ninja_slug: Some("unique-charms"),
        icon_url: Some("https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ2hhcm1zL1VuaXF1ZXMvUnVieVVuaXF1ZUNoYXJtIiwidyI6MSwiaCI6MSwic2NhbGUiOjEsInJlYWxtIjoicG9lMiJ9XQ/f88d02b00c/RubyUniqueCharm.png"),
        available: true,
    },
    ExchangeCategoryManifestEntry {
        id: "unique-jewels",
        group: "Equipment",
        label: "Unique Jewels",
        feed: "stash",
        poe_ninja_type: Some("UniqueJewels"),
        poe_ninja_slug: Some("unique-jewels"),
        icon_url: Some("https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvSmV3ZWxzL1VuaXF1ZXMvR3JhbmRTcGVjdHJ1bV9SdWJ5IiwidyI6MSwiaCI6MSwic2NhbGUiOjEsInJlYWxtIjoicG9lMiJ9XQ/8d964b3e88/GrandSpectrum_Ruby.png"),
        available: true,
    },
    ExchangeCategoryManifestEntry {
        id: "unique-maps",
        group: "Equipment",
        label: "Unique Maps",
        feed: "stash",
        poe_ninja_type: Some("UniqueMaps"),
        poe_ninja_slug: Some("unique-maps"),
        icon_url: Some("https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvUHJlY3Vyc29yVGFibGV0cy9QcmVjdXJzb3JUYWJsZXRBYnlzc1VuaXF1ZTEiLCJ3IjoxLCJoIjoxLCJzY2FsZSI6MSwicmVhbG0iOiJwb2UyIn1d/a5c2d8a638/PrecursorTabletAbyssUnique1.png"),
        available: true,
    },
    ExchangeCategoryManifestEntry {
        id: "unique-relics",
        group: "Equipment",
        label: "Unique Relics",
        feed: "stash",
        poe_ninja_type: Some("UniqueSanctumRelics"),
        poe_ninja_slug: Some("unique-relics"),
        icon_url: Some("https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvUmVsaWNzL1JlbGljVW5pcXVlMXgzIiwidyI6MSwiaCI6Mywic2NhbGUiOjEsInJlYWxtIjoicG9lMiJ9XQ/9a0c871b8b/RelicUnique1x3.png"),
        available: true,
    },
];

static EXCHANGE_CACHE: Lazy<Mutex<HashMap<String, CachedExchangeOverview>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static ICON_CACHE: Lazy<Mutex<HashMap<String, String>>> = Lazy::new(|| Mutex::new(HashMap::new()));
static LEAGUE_SLUG_CACHE: Lazy<Mutex<HashMap<String, String>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Debug, Clone, Copy)]
struct ExchangeCategoryManifestEntry {
    id: &'static str,
    group: &'static str,
    label: &'static str,
    feed: &'static str,
    poe_ninja_type: Option<&'static str>,
    poe_ninja_slug: Option<&'static str>,
    icon_url: Option<&'static str>,
    available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExchangeCategory {
    pub id: String,
    pub group: String,
    pub label: String,
    pub feed: String,
    pub poe_ninja_type: Option<String>,
    pub poe_ninja_slug: Option<String>,
    pub icon_url: Option<String>,
    pub available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExchangeOverview {
    pub category_id: String,
    pub category_label: String,
    pub league: String,
    pub source: String,
    pub source_url: String,
    pub fetched_at_epoch_ms: u64,
    pub primary_currency: Option<CurrencyMeta>,
    pub secondary_currency: Option<CurrencyMeta>,
    pub quote_currencies: Vec<ExchangeQuoteCurrency>,
    pub entries: Vec<ExchangeEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExchangeEntry {
    pub id: String,
    pub name: String,
    pub icon_url: Option<String>,
    pub details_id: Option<String>,
    pub item_category: Option<String>,
    pub price_in_primary: Option<f64>,
    pub quantity: Option<f64>,
    pub history_change_percent: Option<f64>,
    pub sparkline: Vec<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExchangeQuoteCurrency {
    pub currency: CurrencyMeta,
    pub per_primary: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExchangeTabState {
    pub categories: Vec<ExchangeCategory>,
    pub selected_category_id: String,
    pub selected_item_id: Option<String>,
    pub overview: Option<ExchangeOverview>,
    pub status: String,
    pub error: Option<String>,
}

impl Default for ExchangeTabState {
    fn default() -> Self {
        Self {
            categories: categories(),
            selected_category_id: DEFAULT_CATEGORY_ID.to_string(),
            selected_item_id: None,
            overview: None,
            status: "Exchange cache is idle.".to_string(),
            error: None,
        }
    }
}

#[derive(Debug, Clone)]
struct CachedExchangeOverview {
    overview: ExchangeOverview,
    fetched_at_epoch_ms: u64,
}

#[derive(Debug, Deserialize)]
struct PoeNinjaExchangeOverviewResponse {
    core: PoeNinjaExchangeCore,
    lines: Vec<PoeNinjaExchangeLine>,
    items: Vec<PoeNinjaExchangeItem>,
}

#[derive(Debug, Deserialize)]
struct PoeNinjaStashOverviewResponse {
    core: PoeNinjaExchangeCore,
    lines: Vec<PoeNinjaStashLine>,
}

#[derive(Debug, Deserialize)]
struct PoeNinjaExchangeCore {
    items: Vec<PoeNinjaExchangeItem>,
    primary: String,
    secondary: String,
    #[serde(default)]
    rates: HashMap<String, f64>,
}

#[derive(Debug, Deserialize)]
struct PoeNinjaExchangeItem {
    id: String,
    name: String,
    #[serde(alias = "image", alias = "icon")]
    image: Option<String>,
    category: Option<String>,
    #[serde(rename = "detailsId")]
    details_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PoeNinjaExchangeLine {
    id: String,
    #[serde(rename = "primaryValue")]
    primary_value: Option<f64>,
    #[serde(rename = "volumePrimaryValue")]
    volume_primary_value: Option<f64>,
    #[serde(alias = "sparkLine")]
    sparkline: Option<PoeNinjaSparkline>,
}

#[derive(Debug, Deserialize)]
struct PoeNinjaStashLine {
    id: serde_json::Value,
    #[serde(rename = "itemId")]
    item_id: Option<String>,
    #[serde(rename = "detailsId")]
    details_id: Option<String>,
    name: String,
    #[serde(rename = "baseType")]
    base_type: Option<String>,
    icon: Option<String>,
    category: Option<String>,
    #[serde(rename = "primaryValue")]
    primary_value: Option<f64>,
    #[serde(rename = "listingCount")]
    listing_count: Option<f64>,
    #[serde(alias = "sparkLine")]
    sparkline: Option<PoeNinjaSparkline>,
}

#[derive(Debug, Deserialize)]
struct PoeNinjaSparkline {
    #[serde(rename = "totalChange")]
    total_change: Option<f64>,
    data: Vec<Option<f64>>,
}

#[derive(Debug, Deserialize)]
struct PoeNinjaIndexStateResponse {
    #[serde(rename = "economyLeagues", default)]
    economy_leagues: Vec<PoeNinjaLeague>,
    #[serde(rename = "oldEconomyLeagues", default)]
    old_economy_leagues: Vec<PoeNinjaLeague>,
}

#[derive(Debug, Deserialize)]
struct PoeNinjaLeague {
    name: String,
    url: String,
    #[serde(rename = "displayName")]
    display_name: Option<String>,
}

pub fn is_exchange_item(item: &Item) -> bool {
    match item.family.as_str() {
        "currency" => true,
        "accessory" | "armour" | "belt" | "charm" | "flask" | "jewel" | "offhand" | "relic"
        | "tablet" | "waystone" | "weapon" => false,
        _ => {
            let haystacks = [
                item.item_class.as_deref().unwrap_or(""),
                item.base_type.as_deref().unwrap_or(""),
                item.name.as_str(),
            ]
            .join(" ")
            .to_ascii_lowercase();

            [
                "essence",
                "omen",
                "rune",
                "soul core",
                "idol",
                "uncut",
                "liquid ",
                "simulacrum splinter",
                "catalyst",
                "breach",
                "expedition",
                "abyssal bone",
            ]
            .iter()
            .any(|needle| haystacks.contains(needle))
        }
    }
}

pub fn categories() -> Vec<ExchangeCategory> {
    EXCHANGE_CATEGORY_MANIFEST
        .iter()
        .map(|entry| ExchangeCategory {
            id: entry.id.to_string(),
            group: entry.group.to_string(),
            label: entry.label.to_string(),
            feed: entry.feed.to_string(),
            poe_ninja_type: entry.poe_ninja_type.map(str::to_string),
            poe_ninja_slug: entry.poe_ninja_slug.map(str::to_string),
            icon_url: entry.icon_url.map(str::to_string),
            available: entry.available,
        })
        .collect()
}

pub fn default_tab_state() -> ExchangeTabState {
    ExchangeTabState::default()
}

pub fn loading_tab_state_for_item(item: &Item) -> ExchangeTabState {
    let selected_category_id = item.exchange_category_id.clone().unwrap_or_else(|| {
        category_id_for_item(item)
            .unwrap_or(DEFAULT_CATEGORY_ID)
            .to_string()
    });

    ExchangeTabState {
        categories: categories(),
        selected_category_id,
        selected_item_id: None,
        overview: None,
        status: format!(
            "Loading cached exchange overview for {}...",
            item.base_type.as_deref().unwrap_or(&item.name)
        ),
        error: None,
    }
}

pub async fn resolve_item_exchange_state(
    item: &Item,
    league: &str,
) -> Result<ExchangeTabState, String> {
    let category_id = item
        .exchange_category_id
        .as_deref()
        .or_else(|| category_id_for_item(item))
        .unwrap_or(DEFAULT_CATEGORY_ID);
    let overview = exchange_overview(league, category_id, false).await?;
    let selected_entry = select_entry_for_item(item, &overview);

    Ok(ExchangeTabState {
        categories: categories(),
        selected_category_id: category_id.to_string(),
        selected_item_id: selected_entry.as_ref().map(|entry| entry.id.clone()),
        overview: Some(overview.clone()),
        status: match selected_entry {
            Some(entry) => format!(
                "Cached {} overview synced for {}.",
                overview.category_label, entry.name
            ),
            None => format!(
                "Cached {} overview loaded. {} was not found in the current snapshot.",
                overview.category_label,
                item.base_type.as_deref().unwrap_or(&item.name)
            ),
        },
        error: None,
    })
}

pub async fn exchange_overview(
    league: &str,
    category_id: &str,
    force_refresh: bool,
) -> Result<ExchangeOverview, String> {
    let category = category_by_id(category_id)
        .ok_or_else(|| format!("unknown exchange category: {category_id}"))?;

    if !category.available {
        return Err(format!(
            "{} does not currently expose a live PoE.ninja PoE2 exchange feed.",
            category.label
        ));
    }

    let cache_key = format!(
        "{}::{}",
        league.to_ascii_lowercase(),
        category.id.to_ascii_lowercase()
    );

    if !force_refresh {
        if let Some(cached) = EXCHANGE_CACHE.lock().await.get(&cache_key).cloned() {
            let age = now_epoch_ms().saturating_sub(cached.fetched_at_epoch_ms);
            if age < EXCHANGE_CACHE_TTL.as_millis() as u64 {
                return Ok(cached.overview);
            }
        }
    }

    let overview = fetch_exchange_overview(league, category).await?;
    EXCHANGE_CACHE.lock().await.insert(
        cache_key,
        CachedExchangeOverview {
            overview: overview.clone(),
            fetched_at_epoch_ms: overview.fetched_at_epoch_ms,
        },
    );

    Ok(overview)
}

pub fn price_check_from_tab_state(tab: &ExchangeTabState) -> PriceCheck {
    let mut status = tab.status.clone();
    if let Some(error) = tab.error.as_deref() {
        status = error.to_string();
    }

    let currencies = tab
        .overview
        .as_ref()
        .into_iter()
        .flat_map(|overview| {
            [
                overview.primary_currency.clone(),
                overview.secondary_currency.clone(),
            ]
        })
        .flatten()
        .collect::<Vec<_>>();

    PriceCheck {
        status,
        matched: tab
            .overview
            .as_ref()
            .map(|overview| overview.entries.len())
            .unwrap_or(0),
        source_url: tab
            .overview
            .as_ref()
            .map(|overview| overview.source_url.clone()),
        selected_currency: tab
            .overview
            .as_ref()
            .and_then(|overview| overview.primary_currency.as_ref())
            .map(|currency| currency.id.clone())
            .unwrap_or_else(|| "divine".to_string()),
        selected_price_option: "equivalent".to_string(),
        rate_source: tab
            .overview
            .as_ref()
            .map(|overview| overview.source.clone()),
        rate_limit: None,
        currencies,
        filters: Vec::new(),
        requested_filters: Vec::new(),
        applied_filters: Vec::new(),
        listings: Vec::new(),
        error: tab.error.clone(),
    }
}

pub fn category_id_for_item(item: &Item) -> Option<&'static str> {
    let haystacks = [
        item.item_class.as_deref().unwrap_or(""),
        item.base_type.as_deref().unwrap_or(""),
        item.name.as_str(),
        item.raw_text.as_str(),
    ]
    .join(" ")
    .to_ascii_lowercase();

    if haystacks.contains("essence") {
        return Some("essences");
    }
    if haystacks.contains("soul core") {
        return Some("soul-cores");
    }
    if haystacks.contains("idol") {
        return Some("idols");
    }
    if haystacks.contains("rune") {
        return Some("runes");
    }
    if haystacks.contains("uncut") {
        return Some("uncut-gems");
    }
    if haystacks.contains("omen") || haystacks.contains("petition splinter") {
        return Some("ritual");
    }
    if haystacks.contains("liquid ")
        || haystacks.contains("simulacrum splinter")
        || haystacks.contains("delirium")
    {
        return Some("delirium");
    }
    if haystacks.contains("catalyst") || haystacks.contains("breachstone") {
        return Some("breach");
    }
    if haystacks.contains("abyssal bone") || haystacks.contains("tecrods") {
        return Some("abyss");
    }
    if haystacks.contains("expedition")
        || haystacks.contains("artifact")
        || haystacks.contains("barter")
    {
        return Some("expedition");
    }
    if haystacks.contains("fragment")
        || haystacks.contains("key")
        || haystacks.contains("splinter")
        || haystacks.contains("breachstone")
    {
        return Some("fragments");
    }
    if haystacks.contains("lineage") {
        return Some("gems");
    }
    if haystacks.contains("gem") && item.family == "currency" {
        return Some("gems");
    }
    if is_exchange_item(item) {
        return Some("currency");
    }

    None
}

fn category_by_id(category_id: &str) -> Option<ExchangeCategory> {
    EXCHANGE_CATEGORY_MANIFEST
        .iter()
        .find(|entry| entry.id.eq_ignore_ascii_case(category_id))
        .map(|entry| ExchangeCategory {
            id: entry.id.to_string(),
            group: entry.group.to_string(),
            label: entry.label.to_string(),
            feed: entry.feed.to_string(),
            poe_ninja_type: entry.poe_ninja_type.map(str::to_string),
            poe_ninja_slug: entry.poe_ninja_slug.map(str::to_string),
            icon_url: entry.icon_url.map(str::to_string),
            available: entry.available,
        })
}

async fn fetch_exchange_overview(
    league: &str,
    category: ExchangeCategory,
) -> Result<ExchangeOverview, String> {
    let overview_type = category
        .poe_ninja_type
        .clone()
        .ok_or_else(|| format!("{} is not backed by a live feed yet.", category.label))?;

    let client = reqwest::Client::builder()
        .user_agent("Reliquary/0.1 poe-ninja-exchange")
        .build()
        .map_err(|error| error.to_string())?;

    if category.feed == "stash" {
        return fetch_stash_overview(&client, league, &overview_type, category).await;
    }

    let response = fetch_poe_ninja_overview(&client, league, &overview_type).await?;

    let fetched_at_epoch_ms = now_epoch_ms();
    let mut item_by_id = response
        .items
        .into_iter()
        .map(|item| (item.id.clone(), item))
        .collect::<HashMap<_, _>>();

    let primary_currency = match response
        .core
        .items
        .iter()
        .find(|item| item.id == response.core.primary)
    {
        Some(item) => Some(currency_meta_from_poe_ninja_item(&client, item).await?),
        None => None,
    };
    let secondary_currency = match response
        .core
        .items
        .iter()
        .find(|item| item.id == response.core.secondary)
    {
        Some(item) => Some(currency_meta_from_poe_ninja_item(&client, item).await?),
        None => None,
    };
    let quote_currencies = build_quote_currencies(&client, &response.core).await?;

    let mut entries = Vec::with_capacity(response.lines.len());
    for line in response.lines {
        let item = item_by_id.remove(&line.id);
        let icon_url = match item.as_ref().and_then(|item| item.image.as_deref()) {
            Some(url) => Some(icon_data_url_or_fallback(&client, url).await),
            None => None,
        };

        entries.push(ExchangeEntry {
            id: line.id,
            name: item
                .as_ref()
                .map(|item| item.name.clone())
                .unwrap_or_else(|| "Unknown item".to_string()),
            icon_url,
            details_id: item.as_ref().and_then(|item| item.details_id.clone()),
            item_category: item.as_ref().and_then(|item| item.category.clone()),
            price_in_primary: line.primary_value,
            quantity: line.volume_primary_value,
            history_change_percent: line.sparkline.as_ref().and_then(|spark| spark.total_change),
            sparkline: line
                .sparkline
                .map(|spark| sanitize_sparkline(spark.data))
                .unwrap_or_default(),
        });
    }

    let source_league_slug = fetch_poe_ninja_league_slug(&client, league)
        .await
        .unwrap_or_else(|| league_slug(league));
    let source_url = category
        .poe_ninja_slug
        .as_deref()
        .map(|slug| {
            format!(
                "https://poe.ninja/poe2/economy/{}/{slug}",
                source_league_slug
            )
        })
        .unwrap_or_else(|| "https://poe.ninja/poe2/economy/".to_string());

    debug_log::append(
        "exchange.overview.loaded",
        json!({
            "league": league,
            "category": category.id,
            "entries": entries.len(),
            "source_url": source_url,
        }),
    );

    Ok(ExchangeOverview {
        category_id: category.id,
        category_label: category.label,
        league: league.to_string(),
        source: "poe.ninja cache (PoE2 exchange overview)".to_string(),
        source_url,
        fetched_at_epoch_ms,
        primary_currency,
        secondary_currency,
        quote_currencies,
        entries,
    })
}

async fn fetch_stash_overview(
    client: &reqwest::Client,
    league: &str,
    overview_type: &str,
    category: ExchangeCategory,
) -> Result<ExchangeOverview, String> {
    let response = fetch_poe_ninja_stash_overview(client, league, overview_type).await?;
    let fetched_at_epoch_ms = now_epoch_ms();
    let primary_currency = match response
        .core
        .items
        .iter()
        .find(|item| item.id == response.core.primary)
    {
        Some(item) => Some(currency_meta_from_poe_ninja_item(client, item).await?),
        None => None,
    };
    let secondary_currency = match response
        .core
        .items
        .iter()
        .find(|item| item.id == response.core.secondary)
    {
        Some(item) => Some(currency_meta_from_poe_ninja_item(client, item).await?),
        None => None,
    };
    let quote_currencies = build_quote_currencies(client, &response.core).await?;

    let mut entries = Vec::with_capacity(response.lines.len());
    for line in response.lines {
        let icon_url = match line.icon.as_deref() {
            Some(url) => Some(icon_data_url_or_fallback(client, url).await),
            None => None,
        };
        let id = line
            .details_id
            .clone()
            .or(line.item_id.clone())
            .unwrap_or_else(|| line.id.to_string().trim_matches('"').to_string());

        entries.push(ExchangeEntry {
            id,
            name: line.name,
            icon_url,
            details_id: line.details_id,
            item_category: line
                .category
                .or(line.base_type)
                .map(|value| value.trim_matches(['[', ']']).to_string()),
            price_in_primary: line.primary_value,
            quantity: line.listing_count,
            history_change_percent: line.sparkline.as_ref().and_then(|spark| spark.total_change),
            sparkline: line
                .sparkline
                .map(|spark| sanitize_sparkline(spark.data))
                .unwrap_or_default(),
        });
    }

    let source_league_slug = fetch_poe_ninja_league_slug(client, league)
        .await
        .unwrap_or_else(|| league_slug(league));
    let source_url = category
        .poe_ninja_slug
        .as_deref()
        .map(|slug| {
            format!(
                "https://poe.ninja/poe2/economy/{}/{slug}",
                source_league_slug
            )
        })
        .unwrap_or_else(|| "https://poe.ninja/poe2/economy/".to_string());

    debug_log::append(
        "exchange.stash_overview.loaded",
        json!({
            "league": league,
            "category": category.id,
            "entries": entries.len(),
            "source_url": source_url,
        }),
    );

    Ok(ExchangeOverview {
        category_id: category.id,
        category_label: category.label,
        league: league.to_string(),
        source: "poe.ninja cache (PoE2 unique overview)".to_string(),
        source_url,
        fetched_at_epoch_ms,
        primary_currency,
        secondary_currency,
        quote_currencies,
        entries,
    })
}

fn select_entry_for_item(item: &Item, overview: &ExchangeOverview) -> Option<ExchangeEntry> {
    let mut candidates = vec![
        item.base_type.as_deref().unwrap_or("").to_string(),
        item.name.clone(),
    ];
    candidates.push(
        item.base_type
            .as_deref()
            .unwrap_or("")
            .replace("Superior ", "")
            .replace("Greater ", "")
            .replace("Perfect ", ""),
    );

    overview
        .entries
        .iter()
        .find(|entry| {
            let normalized_entry = normalize_name(&entry.name);
            candidates
                .iter()
                .filter(|candidate| !candidate.trim().is_empty())
                .map(|candidate| normalize_name(candidate))
                .any(|candidate| candidate == normalized_entry)
        })
        .cloned()
}

async fn currency_meta_from_poe_ninja_item(
    client: &reqwest::Client,
    item: &PoeNinjaExchangeItem,
) -> Result<CurrencyMeta, String> {
    let icon_url = match item.image.as_deref() {
        Some(url) => Some(icon_data_url_or_fallback(client, url).await),
        None => None,
    };

    Ok(CurrencyMeta {
        id: item.id.clone(),
        name: item.name.clone(),
        icon_url,
    })
}

fn absolutize_url(url: &str) -> String {
    if url.starts_with("http://") || url.starts_with("https://") {
        url.to_string()
    } else if url.starts_with("/gen/image/") {
        format!("{POE_CDN_BASE}{url}")
    } else {
        format!("{POE_NINJA_BASE}{url}")
    }
}

fn sanitize_sparkline(points: Vec<Option<f64>>) -> Vec<f64> {
    let mut last_value = 0.0;

    points
        .into_iter()
        .map(|point| match point {
            Some(value) if value.is_finite() => {
                last_value = value;
                value
            }
            _ => last_value,
        })
        .collect()
}

async fn build_quote_currencies(
    client: &reqwest::Client,
    core: &PoeNinjaExchangeCore,
) -> Result<Vec<ExchangeQuoteCurrency>, String> {
    let mut quote_currencies = Vec::new();

    if let Some(primary_item) = core.items.iter().find(|item| item.id == core.primary) {
        quote_currencies.push(ExchangeQuoteCurrency {
            currency: currency_meta_from_poe_ninja_item(client, primary_item).await?,
            per_primary: 1.0,
        });
    }

    for (currency_id, per_primary) in &core.rates {
        if let Some(item) = core.items.iter().find(|item| item.id == *currency_id) {
            quote_currencies.push(ExchangeQuoteCurrency {
                currency: currency_meta_from_poe_ninja_item(client, item).await?,
                per_primary: *per_primary,
            });
        } else {
            quote_currencies.push(ExchangeQuoteCurrency {
                currency: CurrencyMeta {
                    id: currency_id.clone(),
                    name: currency_id.clone(),
                    icon_url: None,
                },
                per_primary: *per_primary,
            });
        }
    }

    Ok(quote_currencies)
}

async fn fetch_poe_ninja_overview(
    client: &reqwest::Client,
    league: &str,
    overview_type: &str,
) -> Result<PoeNinjaExchangeOverviewResponse, String> {
    let mut last_error = None;

    for attempt in 0..3 {
        let result = async {
            let response = client
                .get(POE_NINJA_EXCHANGE_OVERVIEW_URL)
                .query(&[("league", league), ("type", overview_type)])
                .send()
                .await
                .map_err(|error| error.to_string())?
                .error_for_status()
                .map_err(|error| error.to_string())?;
            let body = response.text().await.map_err(|error| error.to_string())?;
            serde_json::from_str::<PoeNinjaExchangeOverviewResponse>(&body)
                .map_err(|error| format!("failed to parse overview JSON: {error}"))
        }
        .await;

        match result {
            Ok(response) => return Ok(response),
            Err(error) => {
                debug_log::append(
                    "exchange.overview.retry",
                    json!({
                        "league": league,
                        "overview_type": overview_type,
                        "attempt": attempt + 1,
                        "error": error,
                    }),
                );
                last_error = Some(error);
            }
        }
    }

    Err(last_error.unwrap_or_else(|| "unknown exchange overview error".to_string()))
}

async fn fetch_poe_ninja_stash_overview(
    client: &reqwest::Client,
    league: &str,
    overview_type: &str,
) -> Result<PoeNinjaStashOverviewResponse, String> {
    let mut last_error = None;

    for attempt in 0..3 {
        let result = async {
            let response = client
                .get(POE_NINJA_STASH_OVERVIEW_URL)
                .query(&[
                    ("league", league),
                    ("type", overview_type),
                    ("version", "current"),
                ])
                .send()
                .await
                .map_err(|error| error.to_string())?
                .error_for_status()
                .map_err(|error| error.to_string())?;
            let body = response.text().await.map_err(|error| error.to_string())?;
            serde_json::from_str::<PoeNinjaStashOverviewResponse>(&body)
                .map_err(|error| format!("failed to parse unique overview JSON: {error}"))
        }
        .await;

        match result {
            Ok(response) => return Ok(response),
            Err(error) => {
                debug_log::append(
                    "exchange.stash_overview.retry",
                    json!({
                        "league": league,
                        "overview_type": overview_type,
                        "attempt": attempt + 1,
                        "error": error,
                    }),
                );
                last_error = Some(error);
            }
        }
    }

    Err(last_error.unwrap_or_else(|| "unknown unique overview error".to_string()))
}

async fn fetch_poe_ninja_league_slug(client: &reqwest::Client, league: &str) -> Option<String> {
    let cache_key = league.trim().to_ascii_lowercase();
    if cache_key.is_empty() {
        return None;
    }

    if let Some(cached) = LEAGUE_SLUG_CACHE.lock().await.get(&cache_key).cloned() {
        return Some(cached);
    }

    let response = client
        .get(POE_NINJA_INDEX_STATE_URL)
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?
        .json::<PoeNinjaIndexStateResponse>()
        .await
        .ok()?;

    let needle = league.trim().to_ascii_lowercase();
    let slug = response
        .economy_leagues
        .into_iter()
        .chain(response.old_economy_leagues.into_iter())
        .find(|candidate| {
            candidate.name.eq_ignore_ascii_case(&needle)
                || candidate
                    .display_name
                    .as_deref()
                    .map(|display| display.eq_ignore_ascii_case(&needle))
                    .unwrap_or(false)
        })
        .map(|candidate| candidate.url)?;

    LEAGUE_SLUG_CACHE
        .lock()
        .await
        .insert(cache_key, slug.clone());
    Some(slug)
}

async fn icon_data_url_from_url(client: &reqwest::Client, url: &str) -> Result<String, String> {
    let absolute = absolutize_url(url);
    if let Some(cached) = ICON_CACHE.lock().await.get(&absolute).cloned() {
        return Ok(cached);
    }

    let response = client
        .get(&absolute)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?;
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("image/png")
        .to_string();
    let bytes = response.bytes().await.map_err(|error| error.to_string())?;
    let data_url = format!(
        "data:{};base64,{}",
        content_type,
        BASE64_STANDARD.encode(bytes)
    );

    ICON_CACHE.lock().await.insert(absolute, data_url.clone());

    Ok(data_url)
}

async fn icon_data_url_or_fallback(client: &reqwest::Client, url: &str) -> String {
    match icon_data_url_from_url(client, url).await {
        Ok(data_url) => data_url,
        Err(error) => {
            let fallback = absolutize_url(url);
            debug_log::append(
                "exchange.icon.fallback",
                json!({
                    "url": url,
                    "fallback": fallback,
                    "error": error,
                }),
            );
            fallback
        }
    }
}

fn league_slug(league: &str) -> String {
    match league.trim() {
        "Fate of the Vaal" => "vaal".to_string(),
        "HC Fate of the Vaal" => "vaalhc".to_string(),
        "Standard" => "standard".to_string(),
        "Hardcore" => "hardcore".to_string(),
        other => other
            .to_ascii_lowercase()
            .replace('&', "and")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join("-"),
    }
}

fn normalize_name(value: &str) -> String {
    value
        .to_ascii_lowercase()
        .replace(['\u{2019}', '\''], "")
        .replace('-', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn now_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::{
        absolutize_url, category_by_id, category_id_for_item, is_exchange_item, league_slug,
        sanitize_sparkline,
    };
    use crate::Item;

    fn item(name: &str, family: &str, item_class: Option<&str>) -> Item {
        Item {
            name: name.to_string(),
            rarity: "Currency".to_string(),
            family: family.to_string(),
            item_class: item_class.map(str::to_string),
            base_type: Some(name.to_string()),
            item_level: None,
            property_lines: Vec::new(),
            explicit_mods: Vec::new(),
            sockets: None,
            spirit: None,
            hazards: Vec::new(),
            trade_url: None,
            raw_text: name.to_string(),
            is_exchange: false,
            exchange_category_id: None,
        }
    }

    #[test]
    fn maps_broader_ritual_items() {
        let omen = item("Omen of Corruption", "currency", Some("Omen"));
        assert_eq!(category_id_for_item(&omen), Some("ritual"));
    }

    #[test]
    fn maps_runes_and_soul_cores() {
        let rune = item("Greater Desert Rune", "currency", Some("Currency"));
        let soul_core = item("Soul Core of Topotante", "currency", Some("Soul Core"));
        assert_eq!(category_id_for_item(&rune), Some("runes"));
        assert_eq!(category_id_for_item(&soul_core), Some("soul-cores"));
    }

    #[test]
    fn keeps_charms_in_scan_price_check() {
        let charm = item(
            "Natural Golden Charm of the Distiller",
            "charm",
            Some("Charms"),
        );
        assert!(!is_exchange_item(&charm));
    }

    #[test]
    fn keeps_gear_with_exchange_words_in_scan_price_check() {
        let amulet = item("Rune Pendant", "accessory", Some("Amulets"));
        let talisman = item("Soul Core Talisman", "weapon", Some("Talismans"));

        assert!(!is_exchange_item(&amulet));
        assert!(!is_exchange_item(&talisman));
    }

    #[test]
    fn league_slug_matches_known_poe_ninja_routes() {
        assert_eq!(league_slug("Fate of the Vaal"), "vaal");
        assert_eq!(league_slug("HC Fate of the Vaal"), "vaalhc");
    }

    #[test]
    fn unique_equipment_categories_use_stash_feed() {
        let category = category_by_id("unique-weapons").expect("category should exist");
        assert_eq!(category.group, "Equipment");
        assert_eq!(category.feed, "stash");
        assert_eq!(category.poe_ninja_type.as_deref(), Some("UniqueWeapons"));
        assert!(category.available);
    }

    #[test]
    fn sparkline_sanitizer_fills_nulls_with_previous_value() {
        assert_eq!(
            sanitize_sparkline(vec![Some(1.0), None, Some(3.5), None, None]),
            vec![1.0, 1.0, 3.5, 3.5, 3.5]
        );
    }

    #[test]
    fn image_urls_use_poe_cdn_host() {
        assert_eq!(
            absolutize_url("/gen/image/foo.png"),
            "https://web.poecdn.com/gen/image/foo.png"
        );
    }
}
