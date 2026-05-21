use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use crate::{DataLeague, LeagueCatalogEntry, TradeLeague};

pub const POE2DB_SCHEMA_VERSION: u16 = 1;
const POE2DB_HOME_URL: &str = "https://poe2db.tw/us/";
const POE2DB_LEAGUE_URL: &str = "https://poe2db.tw/us/League";
const POE_NINJA_INDEX_STATE_URL: &str = "https://poe.ninja/poe2/api/data/index-state";
const TRADE_API_BASE: &str = "https://www.pathofexile.com/api/trade2";
const POE2DB_CACHE_FILE: &str = "poe2db-source-truth-v1.json";
const POE2DB_CACHE_TTL_MS: u64 = 30 * 60 * 1000;
const DEFAULT_MOD_TIER_SLUGS: &[&str] = &["Physical_damage"];

static POE2DB_LEAGUE_ROW_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?s)<tr><td>(?P<version>[^<]*)</td><td>(?P<name>.*?)</td><td>(?P<weeks>[^<]*)</td><td>(?P<date>[^<]*)</td></tr>",
    )
    .expect("valid PoE2DB league row regex")
});

static POE2DB_HOME_LEAGUE_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r#"(?s)<h5 class="card-header"><small class='float-end'>\s*<span>&lt;(?P<expansion>[^&]+)&gt;</span>\s*<span>(?P<version>\d+(?:\.\d+)?)</span></small>(?P<name>[^<]+)</h5>"#,
    )
    .expect("valid PoE2DB home league regex")
});

static POE2DB_MOD_ROW_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?s)<tr><td>(?P<name>[^<]*)</td><td>(?P<level>\d+)</td><td>(?P<affix>Prefix|Suffix)</td><td>(?P<modifier>.*?)</td><td>(?P<weights>.*?)</td></tr>",
    )
    .expect("valid PoE2DB modifier tier row regex")
});

static HTML_TAG_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?s)<[^>]+>").expect("valid HTML tag regex"));
static BADGE_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"(?s)<span class="badge\b.*?</span>"#).expect("valid badge regex"));
static MOD_VALUE_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r#"(?s)<span class=['"]mod-value['"]>\(?(?P<min>-?\d+(?:\.\d+)?)\s*<span class="ndash">[^<]+</span>\s*(?P<max>-?\d+(?:\.\d+)?)\)?</span>"#,
    )
    .expect("valid modifier value regex")
});
static TAG_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?s)<span class="badge\b[^"]*" data-tag="(?P<tag>[^"]+)">(?P<label>.*?)</span>"#)
        .expect("valid modifier tag regex")
});
static WEIGHT_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?s)<i>(?P<tag>[^<]+)</i>\s*(?P<weight>-?\d+(?:\.\d+)?)"#)
        .expect("valid modifier weight regex")
});
static RANGE_TEXT_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\(?-?\d+(?:\.\d+)?\s*[—-]\s*-?\d+(?:\.\d+)?\)?").expect("valid range text regex")
});
static NUMBER_TEXT_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"-?\d+(?:\.\d+)?").expect("valid number text regex"));

#[derive(Debug, Clone, Serialize)]
pub struct SourceTruth {
    pub id: &'static str,
    pub name: &'static str,
    pub url: &'static str,
    pub purpose: &'static str,
    pub cli_role: &'static str,
}

#[derive(Debug, Clone, Serialize)]
pub struct ItemFamilyManifestEntry {
    pub family: &'static str,
    pub poe2db_section: &'static str,
    pub item_classes: &'static [&'static str],
    pub notes: &'static str,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Poe2DbModTierPage {
    pub slug: String,
    pub source_url: String,
    pub tiers: Vec<Poe2DbModTier>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Poe2DbModTier {
    pub id: String,
    pub tier: String,
    pub name: String,
    pub required_level: u16,
    pub affix: Option<AffixKind>,
    pub text: String,
    pub template: String,
    pub roll_bands: Vec<RollBand>,
    pub tags: Vec<String>,
    pub weights: Vec<TagWeight>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum AffixKind {
    Prefix,
    Suffix,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollBand {
    pub min: f64,
    pub max: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagWeight {
    pub tag: String,
    pub weight: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Poe2DbDataSnapshot {
    pub schema_version: u16,
    pub source: String,
    pub fetched_at_epoch_ms: u64,
    pub cache_path: Option<String>,
    pub families: Vec<NormalizedItemFamily>,
    pub leagues: Vec<DataLeague>,
    pub mod_pages: Vec<Poe2DbModTierPage>,
    pub status: Poe2DbAdapterStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NormalizedItemFamily {
    pub family: String,
    pub poe2db_section: String,
    pub item_classes: Vec<String>,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Poe2DbAdapterStatus {
    pub state: String,
    pub message: String,
    pub fresh: bool,
    pub cache_age_seconds: Option<u64>,
    pub pages_cached: usize,
    pub pages_failed: usize,
    pub failed_pages: Vec<String>,
}

static ITEM_FAMILY_MANIFEST: &[ItemFamilyManifestEntry] = &[
    ItemFamilyManifestEntry {
        family: "gem",
        poe2db_section: "Gems",
        item_classes: &[
            "Gem",
            "Skill Gems",
            "Support Gems",
            "Meta Skill Gem",
            "Spirit Gems",
            "Lineage Supports",
        ],
        notes: "Gem family from the PoE2DB Item taxonomy.",
    },
    ItemFamilyManifestEntry {
        family: "weapon",
        poe2db_section: "One Handed Weapons / Two Handed Weapons",
        item_classes: &[
            "Claws",
            "Daggers",
            "Wands",
            "One Hand Swords",
            "One Hand Axes",
            "One Hand Maces",
            "Sceptres",
            "Spears",
            "Flails",
            "Bows",
            "Staves",
            "Two Hand Swords",
            "Two Hand Axes",
            "Two Hand Maces",
            "Quarterstaves",
            "Crossbows",
            "Traps",
            "Talismans",
        ],
        notes: "Weapon-family items use weapon-style property/value segregation.",
    },
    ItemFamilyManifestEntry {
        family: "offhand",
        poe2db_section: "Off-hand",
        item_classes: &["Quivers", "Shields", "Bucklers", "Foci"],
        notes: "Off-hand equipment is kept distinct from main armour pieces.",
    },
    ItemFamilyManifestEntry {
        family: "armour",
        poe2db_section: "Armour",
        item_classes: &["Gloves", "Boots", "Body Armours", "Helmets"],
        notes: "Armour-family items expose armour/evasion/energy shield style values.",
    },
    ItemFamilyManifestEntry {
        family: "accessory",
        poe2db_section: "Jewellery",
        item_classes: &["Amulets", "Rings"],
        notes: "Accessories share jewellery-style parsing and trade filters.",
    },
    ItemFamilyManifestEntry {
        family: "belt",
        poe2db_section: "Jewellery",
        item_classes: &["Belts"],
        notes: "Belts are split out because charm slots are a dedicated property block.",
    },
    ItemFamilyManifestEntry {
        family: "flask",
        poe2db_section: "Flasks",
        item_classes: &["Flasks", "Life Flasks", "Mana Flasks"],
        notes: "Flasks use recovery/charges properties and modifier-only effects.",
    },
    ItemFamilyManifestEntry {
        family: "charm",
        poe2db_section: "Flasks",
        item_classes: &["Charms"],
        notes: "Charms behave more like triggerable flasks than normal accessories.",
    },
    ItemFamilyManifestEntry {
        family: "currency",
        poe2db_section: "Currency",
        item_classes: &[
            "Stackable Currency",
            "Currency Stackable Currency",
            "Augment",
            "Omen",
            "Omens",
            "Incubators",
            "Liquid Emotions",
            "Essence",
            "Splinter",
            "Catalysts",
            "Vault Keys",
            "Trial Coins",
            "Pinnacle Keys",
            "Soul Core",
        ],
        notes: "Exchange-style items should not fall through normal gear price search.",
    },
    ItemFamilyManifestEntry {
        family: "waystone",
        poe2db_section: "Waystones",
        item_classes: &[
            "Waystones",
            "Map Fragments",
            "Misc Map Items",
            "Expedition Logbooks",
            "Inscribed Ultimatum",
        ],
        notes: "Endgame map-family items keep their own property and hazard handling.",
    },
    ItemFamilyManifestEntry {
        family: "tablet",
        poe2db_section: "Waystones",
        item_classes: &["Tablet", "Tablets"],
        notes: "Tablets are their own family because they have dedicated prefix/suffix pools.",
    },
    ItemFamilyManifestEntry {
        family: "jewel",
        poe2db_section: "Jewels",
        item_classes: &["Jewels"],
        notes: "Jewels use jewel-style explicit modifier segregation.",
    },
    ItemFamilyManifestEntry {
        family: "relic",
        poe2db_section: "Other",
        item_classes: &["Relics"],
        notes: "Relics are ungear-like evaluation items with distinct property handling.",
    },
    ItemFamilyManifestEntry {
        family: "other",
        poe2db_section: "Other",
        item_classes: &["Hideouts", "Hideout Doodads", "Strongbox"],
        notes: "Miscellaneous non-gear item types.",
    },
];

pub fn registry() -> Vec<SourceTruth> {
    vec![
        SourceTruth {
            id: "poe-ninja-poe2-economy",
            name: "poe.ninja PoE2 Economy",
            url: "https://poe.ninja/poe2/economy/",
            purpose: "Current exchange rates and market-normalized currency values.",
            cli_role: "Normalize listed prices into comparable value units before the overlay ranks trade results.",
        },
        SourceTruth {
            id: "poe2db",
            name: "PoE2DB",
            url: "https://poe2db.tw/us/",
            purpose: "Item descriptions, base item metadata, gems, modifiers, and league mechanics reference data.",
            cli_role: "Resolve copied item text into accurate base metadata before building trade queries.",
        },
    ]
}

pub fn item_family_manifest() -> &'static [ItemFamilyManifestEntry] {
    ITEM_FAMILY_MANIFEST
}

pub fn normalized_item_family_manifest() -> Vec<NormalizedItemFamily> {
    ITEM_FAMILY_MANIFEST
        .iter()
        .map(|entry| NormalizedItemFamily {
            family: entry.family.to_string(),
            poe2db_section: entry.poe2db_section.to_string(),
            item_classes: entry
                .item_classes
                .iter()
                .map(|item_class| item_class.to_string())
                .collect(),
            notes: entry.notes.to_string(),
        })
        .collect()
}

pub fn classify_item_class(item_class: Option<&str>) -> &'static str {
    let normalized = item_class.unwrap_or("").trim().to_ascii_lowercase();

    for entry in ITEM_FAMILY_MANIFEST {
        if entry
            .item_classes
            .iter()
            .any(|class_name| normalized.contains(&class_name.to_ascii_lowercase()))
        {
            return entry.family;
        }
    }

    "other"
}

pub async fn fetch_poe2db_leagues() -> Result<Vec<DataLeague>, String> {
    let client = reqwest::Client::builder()
        .user_agent("Reliquary/0.1 poe2db-league-listener")
        .build()
        .map_err(|error| error.to_string())?;

    let league_html = client
        .get(POE2DB_LEAGUE_URL)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .text()
        .await
        .map_err(|error| error.to_string())?;

    let home_html = client
        .get(POE2DB_HOME_URL)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .text()
        .await
        .map_err(|error| error.to_string())?;

    Ok(parse_poe2db_leagues(&league_html, &home_html))
}

pub async fn fetch_league_catalog() -> Result<Vec<LeagueCatalogEntry>, String> {
    let (trade_result, data_result, ninja_result) = tokio::join!(
        fetch_trade_leagues(),
        fetch_poe2db_leagues(),
        fetch_poe_ninja_leagues()
    );

    let trade_leagues = trade_result?;
    let data_leagues = mark_data_leagues_trade_enabled(data_result?, &trade_leagues);
    let ninja_leagues = ninja_result?;

    Ok(build_league_catalog(
        &trade_leagues,
        &data_leagues,
        &ninja_leagues,
    ))
}

pub async fn refresh_poe2db_data_snapshot(force: bool) -> Result<Poe2DbDataSnapshot, String> {
    let cache_path = poe2db_cache_path();

    if !force {
        if let Some(snapshot) = load_fresh_poe2db_snapshot(&cache_path)? {
            return Ok(snapshot);
        }
    }

    let mut failed_pages = Vec::new();
    let leagues = fetch_poe2db_leagues().await.unwrap_or_else(|error| {
        failed_pages.push(format!("League: {error}"));
        Vec::new()
    });
    let mut mod_pages = Vec::new();

    for slug in DEFAULT_MOD_TIER_SLUGS {
        match fetch_poe2db_mod_tiers(slug).await {
            Ok(page) => mod_pages.push(page),
            Err(error) => failed_pages.push(format!("{slug}: {error}")),
        }
    }

    let pages_failed = failed_pages.len();
    let fetched_at_epoch_ms = now_epoch_ms();
    let state = if pages_failed == 0 {
        "ready"
    } else if mod_pages.is_empty() && leagues.is_empty() {
        "degraded"
    } else {
        "partial"
    };
    let message = match state {
        "ready" => "PoE2DB source-truth cache is fresh.".to_string(),
        "partial" => {
            "PoE2DB source-truth cache is partial; missing pages degrade to unknown.".to_string()
        }
        _ => "PoE2DB source-truth cache could not refresh; missing data stays unknown.".to_string(),
    };
    let pages_cached = mod_pages.len();

    let snapshot = Poe2DbDataSnapshot {
        schema_version: POE2DB_SCHEMA_VERSION,
        source: "PoE2DB".to_string(),
        fetched_at_epoch_ms,
        cache_path: Some(cache_path.display().to_string()),
        families: normalized_item_family_manifest(),
        leagues,
        mod_pages,
        status: Poe2DbAdapterStatus {
            state: state.to_string(),
            message,
            fresh: true,
            cache_age_seconds: Some(0),
            pages_cached,
            pages_failed,
            failed_pages,
        },
    };

    write_poe2db_snapshot_cache(&cache_path, &snapshot)?;
    Ok(snapshot)
}

pub fn print_cli(args: &[String]) -> Result<(), String> {
    let sources = registry();

    if args.iter().any(|arg| arg == "--json") {
        let json = serde_json::to_string_pretty(&sources).map_err(|error| error.to_string())?;
        println!("{json}");
        return Ok(());
    }

    println!("Reliquary source-of-truth feeds");
    println!();

    for source in sources {
        println!("{} ({})", source.name, source.id);
        println!("  URL: {}", source.url);
        println!("  Purpose: {}", source.purpose);
        println!("  CLI role: {}", source.cli_role);
        println!();
    }

    Ok(())
}

pub fn print_leagues_cli(args: &[String]) -> Result<(), String> {
    let runtime = tokio::runtime::Runtime::new().map_err(|error| error.to_string())?;
    let snapshot = runtime.block_on(async {
        let (trade_result, data_result) =
            tokio::join!(fetch_trade_leagues(), fetch_poe2db_leagues());

        let trade_leagues = trade_result?;
        let data_leagues = mark_data_leagues_trade_enabled(data_result?, &trade_leagues);

        Ok::<LeagueSnapshot, String>(LeagueSnapshot {
            trade_leagues,
            data_leagues,
        })
    })?;

    if args.iter().any(|arg| arg == "--json") {
        let json = serde_json::to_string_pretty(&snapshot).map_err(|error| error.to_string())?;
        println!("{json}");
        return Ok(());
    }

    println!("Reliquary league feeds");
    println!();
    println!("Official trade leagues:");
    for league in &snapshot.trade_leagues {
        println!("  - {}", league.id);
    }

    println!();
    println!("PoE2DB data leagues:");
    for league in &snapshot.data_leagues {
        let version = league
            .version
            .as_deref()
            .map(|value| format!(" {value}"))
            .unwrap_or_default();
        let expansion = league
            .expansion
            .as_deref()
            .map(|value| format!(" <{value}>"))
            .unwrap_or_default();
        let starts_at = league
            .starts_at
            .as_deref()
            .map(|value| format!(" starts {value}"))
            .unwrap_or_default();
        println!("  - {}{}{}{}", league.name, expansion, version, starts_at);
    }

    Ok(())
}

pub fn print_item_families_cli(args: &[String]) -> Result<(), String> {
    let families = item_family_manifest();

    if args.iter().any(|arg| arg == "--json") {
        let json = serde_json::to_string_pretty(&families).map_err(|error| error.to_string())?;
        println!("{json}");
        return Ok(());
    }

    println!("Reliquary item family manifest");
    println!();

    for family in families {
        println!("{} ({})", family.family, family.poe2db_section);
        println!("  Classes: {}", family.item_classes.join(", "));
        println!("  Notes: {}", family.notes);
        println!();
    }

    Ok(())
}

pub fn print_mod_tiers_cli(args: &[String]) -> Result<(), String> {
    let slug = args
        .iter()
        .find(|arg| !arg.starts_with("--"))
        .ok_or_else(|| "usage: reliquary tiers <poe2db-slug-or-url> [--json]".to_string())?;
    let runtime = tokio::runtime::Runtime::new().map_err(|error| error.to_string())?;
    let page = runtime.block_on(fetch_poe2db_mod_tiers(slug))?;

    if args.iter().any(|arg| arg == "--json") {
        let json = serde_json::to_string_pretty(&page).map_err(|error| error.to_string())?;
        println!("{json}");
        return Ok(());
    }

    println!("PoE2DB modifier tiers: {}", page.slug);
    println!("Source: {}", page.source_url);
    println!();

    for tier in &page.tiers {
        let bands = tier
            .roll_bands
            .iter()
            .map(|band| format!("{}-{}", format_number(band.min), format_number(band.max)))
            .collect::<Vec<_>>()
            .join(", ");
        println!(
            "{} {} lvl {} {} :: {}",
            tier.tier,
            tier.name,
            tier.required_level,
            tier.affix
                .as_ref()
                .map(|affix| format!("{affix:?}"))
                .unwrap_or_else(|| "Unknown".to_string()),
            tier.text
        );
        println!("  template: {}", tier.template);
        if !bands.is_empty() {
            println!("  bands: {bands}");
        }
        if !tier.tags.is_empty() {
            println!("  tags: {}", tier.tags.join(", "));
        }
    }

    Ok(())
}

pub fn print_poe2db_snapshot_cli(args: &[String]) -> Result<(), String> {
    let force = args
        .iter()
        .any(|arg| arg == "--force" || arg == "--refresh");
    let runtime = tokio::runtime::Runtime::new().map_err(|error| error.to_string())?;
    let snapshot = runtime.block_on(refresh_poe2db_data_snapshot(force))?;

    if args.iter().any(|arg| arg == "--json") {
        let json = serde_json::to_string_pretty(&snapshot).map_err(|error| error.to_string())?;
        println!("{json}");
        return Ok(());
    }

    println!("Reliquary PoE2DB source-truth cache");
    println!("  schema: v{}", snapshot.schema_version);
    println!("  status: {}", snapshot.status.message);
    println!(
        "  cached: {} modifier page(s), {} failed",
        snapshot.status.pages_cached, snapshot.status.pages_failed
    );
    println!(
        "  families: {}, leagues: {}",
        snapshot.families.len(),
        snapshot.leagues.len()
    );
    if let Some(cache_path) = &snapshot.cache_path {
        println!("  cache: {cache_path}");
    }

    Ok(())
}

pub async fn fetch_poe2db_mod_tiers(slug_or_url: &str) -> Result<Poe2DbModTierPage, String> {
    let (slug, url) = poe2db_mod_url(slug_or_url);
    let client = reqwest::Client::builder()
        .user_agent("Reliquary/0.1 poe2db-mod-tiers")
        .build()
        .map_err(|error| error.to_string())?;
    let html = client
        .get(&url)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .text()
        .await
        .map_err(|error| error.to_string())?;

    let tiers = parse_poe2db_mod_tiers(&html);
    if tiers.is_empty() {
        return Err(format!("no PoE2DB modifier tier rows found at {url}"));
    }

    Ok(Poe2DbModTierPage {
        slug,
        source_url: url,
        tiers,
    })
}

async fn fetch_trade_leagues() -> Result<Vec<TradeLeague>, String> {
    let client = reqwest::Client::builder()
        .user_agent("Reliquary/0.1 league-cli")
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .get(format!("{TRADE_API_BASE}/data/leagues"))
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json::<TradeLeagueResponse>()
        .await
        .map_err(|error| error.to_string())?;

    Ok(response
        .result
        .into_iter()
        .filter(|league| league.realm.as_deref() == Some("poe2"))
        .map(|league| TradeLeague {
            id: league.id,
            text: league.text,
        })
        .collect())
}

async fn fetch_poe_ninja_leagues() -> Result<Vec<PoeNinjaLeague>, String> {
    let client = reqwest::Client::builder()
        .user_agent("Reliquary/0.1 poe-ninja-index-state")
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .get(POE_NINJA_INDEX_STATE_URL)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json::<PoeNinjaIndexStateResponse>()
        .await
        .map_err(|error| error.to_string())?;

    Ok(response.economy_leagues)
}

fn parse_poe2db_leagues(league_html: &str, home_html: &str) -> Vec<DataLeague> {
    let mut table_leagues = POE2DB_LEAGUE_ROW_RE
        .captures_iter(league_html)
        .filter_map(|captures| data_league_from_table_row(&captures))
        .collect::<Vec<_>>();
    let mut leagues = Vec::new();

    for captures in POE2DB_HOME_LEAGUE_RE.captures_iter(home_html) {
        let version = clean_cell(
            captures
                .name("version")
                .map(|value| value.as_str())
                .unwrap_or(""),
        );
        let name = clean_cell(
            captures
                .name("name")
                .map(|value| value.as_str())
                .unwrap_or(""),
        );
        let expansion = clean_cell(
            captures
                .name("expansion")
                .map(|value| value.as_str())
                .unwrap_or(""),
        );

        if name.is_empty() {
            continue;
        }

        let matching_table = table_leagues
            .iter()
            .position(|league| league.version.as_deref() == Some(version.as_str()))
            .map(|index| table_leagues.remove(index));
        let starts_at = matching_table
            .as_ref()
            .and_then(|league| league.starts_at.clone());

        leagues.push(DataLeague {
            id: data_league_id("poe2db-home", &version, &name),
            name,
            version: non_empty(version),
            expansion: non_empty(expansion),
            starts_at,
            source: POE2DB_HOME_URL.to_string(),
            trade_enabled: false,
            note: Some(
                "PoE2DB home highlight; useful for early item and mechanic discovery.".to_string(),
            ),
        });
    }

    leagues.extend(table_leagues);
    leagues
}

fn parse_poe2db_mod_tiers(html: &str) -> Vec<Poe2DbModTier> {
    let mut seen = HashSet::new();
    let mut rows = POE2DB_MOD_ROW_RE
        .captures_iter(html)
        .filter_map(|captures| {
            let name = clean_cell(captures.name("name")?.as_str());
            let required_level = captures.name("level")?.as_str().parse::<u16>().ok()?;
            let affix = affix_kind(captures.name("affix").map(|value| value.as_str()));
            let modifier_html = captures.name("modifier")?.as_str();
            let weights_html = captures.name("weights")?.as_str();
            let text = modifier_text(modifier_html);
            let template = modifier_template(&text);

            if name.is_empty() || text.is_empty() || template.is_empty() {
                return None;
            }

            let affix_key = affix
                .as_ref()
                .map(|value| format!("{value:?}"))
                .unwrap_or_else(|| "unknown".to_string());
            let key = format!("{name}|{required_level}|{affix_key}|{template}");
            if !seen.insert(key) {
                return None;
            }

            let id = modifier_tier_id(&name, required_level, affix.as_ref(), &template);
            Some(Poe2DbModTier {
                id,
                tier: String::new(),
                name,
                required_level,
                affix,
                text,
                template,
                roll_bands: roll_bands(modifier_html),
                tags: modifier_tags(modifier_html),
                weights: modifier_weights(weights_html),
            })
        })
        .collect::<Vec<_>>();

    assign_tier_labels(&mut rows);
    rows.sort_by(|left, right| {
        left.template
            .cmp(&right.template)
            .then(left.affix.cmp(&right.affix))
            .then(right.required_level.cmp(&left.required_level))
    });
    rows
}

fn assign_tier_labels(rows: &mut [Poe2DbModTier]) {
    let mut groups: HashMap<String, Vec<usize>> = HashMap::new();

    for (index, row) in rows.iter().enumerate() {
        groups
            .entry(format!(
                "{}|{}",
                row.affix
                    .as_ref()
                    .map(|affix| format!("{affix:?}"))
                    .unwrap_or_else(|| "unknown".to_string()),
                row.template
            ))
            .or_default()
            .push(index);
    }

    for indexes in groups.values_mut() {
        indexes.sort_by(|left, right| {
            rows[*right]
                .required_level
                .cmp(&rows[*left].required_level)
                .then(rows[*left].name.cmp(&rows[*right].name))
        });

        for (tier_index, row_index) in indexes.iter().enumerate() {
            rows[*row_index].tier = format!("T{}", tier_index + 1);
        }
    }
}

fn modifier_text(modifier_html: &str) -> String {
    let without_badges = BADGE_RE.replace_all(modifier_html, " ");
    let normalized = without_badges
        .replace(r#"<span class="ndash">—</span>"#, "-")
        .replace(r#"<span class='ndash'>—</span>"#, "-");
    clean_cell(&HTML_TAG_RE.replace_all(&normalized, " "))
}

fn modifier_template(text: &str) -> String {
    let no_ranges = RANGE_TEXT_RE.replace_all(text, "#");
    let no_numbers = NUMBER_TEXT_RE.replace_all(&no_ranges, "#");
    clean_cell(&no_numbers)
}

fn roll_bands(modifier_html: &str) -> Vec<RollBand> {
    MOD_VALUE_RE
        .captures_iter(modifier_html)
        .filter_map(|captures| {
            let min = captures.name("min")?.as_str().parse::<f64>().ok()?;
            let max = captures.name("max")?.as_str().parse::<f64>().ok()?;
            Some(RollBand { min, max })
        })
        .collect()
}

fn modifier_tags(modifier_html: &str) -> Vec<String> {
    let mut seen = HashSet::new();
    TAG_RE
        .captures_iter(modifier_html)
        .filter_map(|captures| {
            let tag = clean_cell(captures.name("tag")?.as_str());
            (!tag.is_empty() && seen.insert(tag.clone())).then_some(tag)
        })
        .collect()
}

fn modifier_weights(weights_html: &str) -> Vec<TagWeight> {
    WEIGHT_RE
        .captures_iter(weights_html)
        .filter_map(|captures| {
            let tag = clean_cell(captures.name("tag")?.as_str());
            let weight = captures.name("weight")?.as_str().parse::<f64>().ok()?;
            Some(TagWeight { tag, weight })
        })
        .collect()
}

fn affix_kind(value: Option<&str>) -> Option<AffixKind> {
    match value.map(clean_cell).unwrap_or_default().as_str() {
        "Prefix" => Some(AffixKind::Prefix),
        "Suffix" => Some(AffixKind::Suffix),
        "" => None,
        _ => Some(AffixKind::Unknown),
    }
}

fn modifier_tier_id(
    name: &str,
    required_level: u16,
    affix: Option<&AffixKind>,
    template: &str,
) -> String {
    let affix = affix
        .map(|value| format!("{value:?}").to_ascii_lowercase())
        .unwrap_or_else(|| "unknown".to_string());
    format!(
        "{}:{}:{}:{}",
        slugify(template),
        affix,
        required_level,
        slugify(name)
    )
}

fn poe2db_mod_url(slug_or_url: &str) -> (String, String) {
    let trimmed = slug_or_url.trim();
    let slug = trimmed
        .trim_start_matches("https://poe2db.tw/us/")
        .trim_start_matches("http://poe2db.tw/us/")
        .trim_start_matches('/')
        .to_string();
    let slug = match slug.as_str() {
        "PhysicalDamage" => "Physical_damage".to_string(),
        "ChaosDamage" => "Chaos_damage".to_string(),
        "FireDamage" => "Fire_damage".to_string(),
        "ColdDamage" => "Cold_damage".to_string(),
        "LightningDamage" => "Lightning_damage".to_string(),
        _ => slug,
    };
    let url = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("https://poe2db.tw/us/{slug}")
    };

    (slug, url)
}

fn load_fresh_poe2db_snapshot(cache_path: &PathBuf) -> Result<Option<Poe2DbDataSnapshot>, String> {
    if !cache_path.exists() {
        return Ok(None);
    }

    let raw = fs::read_to_string(cache_path).map_err(|error| error.to_string())?;
    let mut snapshot: Poe2DbDataSnapshot =
        serde_json::from_str(&raw).map_err(|error| error.to_string())?;

    if snapshot.schema_version != POE2DB_SCHEMA_VERSION {
        return Ok(None);
    }

    let age = now_epoch_ms().saturating_sub(snapshot.fetched_at_epoch_ms);
    if age > POE2DB_CACHE_TTL_MS {
        return Ok(None);
    }

    snapshot.cache_path = Some(cache_path.display().to_string());
    snapshot.status.fresh = true;
    snapshot.status.cache_age_seconds = Some(age / 1000);
    snapshot.status.message = format!(
        "PoE2DB source-truth cache loaded from disk; age {} min.",
        age / 1000 / 60
    );
    Ok(Some(snapshot))
}

fn write_poe2db_snapshot_cache(
    cache_path: &PathBuf,
    snapshot: &Poe2DbDataSnapshot,
) -> Result<(), String> {
    if let Some(parent) = cache_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let json = serde_json::to_string_pretty(snapshot).map_err(|error| error.to_string())?;
    fs::write(cache_path, json).map_err(|error| error.to_string())
}

fn poe2db_cache_path() -> PathBuf {
    let root = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("APPDATA").map(PathBuf::from))
        .unwrap_or_else(std::env::temp_dir);

    root.join("Reliquary")
        .join("source-truth")
        .join(POE2DB_CACHE_FILE)
}

fn now_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn format_number(value: f64) -> String {
    if value.fract().abs() < f64::EPSILON {
        format!("{}", value as i64)
    } else {
        format!("{value}")
    }
}

fn mark_data_leagues_trade_enabled(
    data_leagues: Vec<DataLeague>,
    trade_leagues: &[TradeLeague],
) -> Vec<DataLeague> {
    data_leagues
        .into_iter()
        .map(|mut data_league| {
            data_league.trade_enabled = trade_leagues.iter().any(|trade_league| {
                league_names_overlap(&data_league.name, &trade_league.id)
                    || data_league
                        .expansion
                        .as_deref()
                        .map(|expansion| league_names_overlap(expansion, &trade_league.id))
                        .unwrap_or(false)
            });
            data_league
        })
        .collect()
}

fn league_names_overlap(left: &str, right: &str) -> bool {
    let left = left.to_ascii_lowercase();
    let right = right.to_ascii_lowercase();
    !left.is_empty() && !right.is_empty() && (left.contains(&right) || right.contains(&left))
}

fn data_league_from_table_row(captures: &regex::Captures<'_>) -> Option<DataLeague> {
    let version = clean_cell(captures.name("version")?.as_str());
    let raw_name = clean_cell(captures.name("name")?.as_str());
    let starts_at = clean_cell(captures.name("date")?.as_str());

    let (name, expansion) = split_expansion(&raw_name);
    if name.is_empty() {
        return None;
    }

    Some(DataLeague {
        id: data_league_id("poe2db-table", &version, &name),
        name,
        version: non_empty(version),
        expansion: non_empty(expansion),
        starts_at: non_empty(starts_at),
        source: POE2DB_LEAGUE_URL.to_string(),
        trade_enabled: false,
        note: Some("PoE2DB league table; may appear before official trade leagues.".to_string()),
    })
}

fn split_expansion(raw_name: &str) -> (String, String) {
    if let Some((name, rest)) = raw_name.split_once('<') {
        let expansion = rest.trim_end_matches('>').trim().to_string();
        return (name.trim().to_string(), expansion);
    }

    (raw_name.trim().to_string(), String::new())
}

fn clean_cell(value: &str) -> String {
    decode_html_entities(value)
        .replace('\n', " ")
        .replace('\r', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn decode_html_entities(value: &str) -> String {
    value
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#039;", "'")
}

fn non_empty(value: String) -> Option<String> {
    (!value.trim().is_empty()).then_some(value)
}

fn data_league_id(source: &str, version: &str, name: &str) -> String {
    let slug = slugify(name);

    format!("{source}:{version}:{slug}")
}

fn slugify(value: &str) -> String {
    value
        .to_ascii_lowercase()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn build_league_catalog(
    trade_leagues: &[TradeLeague],
    data_leagues: &[DataLeague],
    ninja_leagues: &[PoeNinjaLeague],
) -> Vec<LeagueCatalogEntry> {
    let mut entries = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for trade in trade_leagues {
        let matching_ninja = ninja_leagues
            .iter()
            .find(|league| league_names_overlap(&league.name, &trade.id));
        let matching_data = data_leagues.iter().find(|league| {
            league_names_overlap(&league.name, &trade.id)
                || league
                    .expansion
                    .as_deref()
                    .map(|expansion| league_names_overlap(expansion, &trade.id))
                    .unwrap_or(false)
        });

        let key = trade.id.to_ascii_lowercase();
        if seen.insert(key) {
            entries.push(LeagueCatalogEntry {
                id: trade.id.clone(),
                display_name: trade.text.clone(),
                official_trade_id: Some(trade.id.clone()),
                poe_ninja_name: matching_ninja.map(|league| league.name.clone()),
                poe_ninja_slug: matching_ninja.map(|league| league.url.clone()),
                hardcore: matching_ninja
                    .map(|league| league.hardcore)
                    .unwrap_or_else(|| trade.id.starts_with("HC ") || trade.id == "Hardcore"),
                indexed: matching_ninja.map(|league| league.indexed).unwrap_or(false),
                trade_enabled: true,
                exchange_enabled: matching_ninja.is_some(),
                discovered_at: matching_data.and_then(|league| league.starts_at.clone()),
                expansion: matching_data.and_then(|league| league.expansion.clone()),
                source_tags: collect_source_tags(true, matching_ninja.is_some(), matching_data.is_some()),
                note: match (matching_ninja.is_some(), matching_data.is_some()) {
                    (false, true) => Some("Known to official trade and PoE2DB; waiting for PoE.ninja exchange indexing.".to_string()),
                    _ => matching_data.and_then(|league| league.note.clone()),
                },
            });
        }
    }

    for ninja in ninja_leagues {
        let key = ninja.name.to_ascii_lowercase();
        if seen.insert(key) {
            let matching_data = data_leagues.iter().find(|league| {
                league_names_overlap(&league.name, &ninja.name)
                    || league
                        .expansion
                        .as_deref()
                        .map(|expansion| league_names_overlap(expansion, &ninja.name))
                        .unwrap_or(false)
            });

            entries.push(LeagueCatalogEntry {
                id: ninja.name.clone(),
                display_name: ninja
                    .display_name
                    .clone()
                    .unwrap_or_else(|| ninja.name.clone()),
                official_trade_id: None,
                poe_ninja_name: Some(ninja.name.clone()),
                poe_ninja_slug: Some(ninja.url.clone()),
                hardcore: ninja.hardcore,
                indexed: ninja.indexed,
                trade_enabled: false,
                exchange_enabled: true,
                discovered_at: matching_data.and_then(|league| league.starts_at.clone()),
                expansion: matching_data.and_then(|league| league.expansion.clone()),
                source_tags: collect_source_tags(false, true, matching_data.is_some()),
                note: Some(
                    "Visible in PoE.ninja exchange feed before official trade support.".to_string(),
                ),
            });
        }
    }

    for data in data_leagues {
        let key = data.name.to_ascii_lowercase();
        if seen.insert(key) {
            entries.push(LeagueCatalogEntry {
                id: data.id.clone(),
                display_name: data.name.clone(),
                official_trade_id: None,
                poe_ninja_name: None,
                poe_ninja_slug: None,
                hardcore: data.name.starts_with("HC "),
                indexed: false,
                trade_enabled: data.trade_enabled,
                exchange_enabled: false,
                discovered_at: data.starts_at.clone(),
                expansion: data.expansion.clone(),
                source_tags: collect_source_tags(data.trade_enabled, false, true),
                note: Some(data.note.clone().unwrap_or_else(|| {
                    "PoE2DB-discovered league entry; keep watching for API support.".to_string()
                })),
            });
        }
    }

    entries.sort_by_key(|entry| {
        (
            !entry.trade_enabled,
            !entry.exchange_enabled,
            !entry.indexed,
            entry.hardcore,
            entry.display_name.to_ascii_lowercase(),
        )
    });

    entries
}

fn collect_source_tags(official: bool, ninja: bool, poe2db: bool) -> Vec<String> {
    let mut tags = Vec::new();
    if official {
        tags.push("official-trade".to_string());
    }
    if ninja {
        tags.push("poe-ninja".to_string());
    }
    if poe2db {
        tags.push("poe2db".to_string());
    }
    tags
}

#[derive(Debug, Serialize)]
struct LeagueSnapshot {
    trade_leagues: Vec<TradeLeague>,
    data_leagues: Vec<DataLeague>,
}

#[derive(Debug, serde::Deserialize)]
struct TradeLeagueResponse {
    result: Vec<TradeLeagueEntry>,
}

#[derive(Debug, serde::Deserialize)]
struct TradeLeagueEntry {
    id: String,
    text: String,
    realm: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PoeNinjaIndexStateResponse {
    economy_leagues: Vec<PoeNinjaLeague>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PoeNinjaLeague {
    name: String,
    url: String,
    display_name: Option<String>,
    hardcore: bool,
    indexed: bool,
}

#[cfg(test)]
mod tests {
    use super::{
        classify_item_class, item_family_manifest, normalized_item_family_manifest,
        parse_poe2db_leagues, parse_poe2db_mod_tiers, AffixKind, Poe2DbAdapterStatus,
        Poe2DbDataSnapshot, POE2DB_SCHEMA_VERSION,
    };

    #[test]
    fn parses_poe2db_table_and_home_highlight_leagues() {
        let table = r#"
            <tr><td>0.5</td><td>Return of the Ancients</td><td>28</td><td>2026-05-30</td></tr>
            <tr><td>0.4</td><td>Fate of the Vaal &lt;The Last of the Druids&gt;</td><td>24</td><td>2025-12-13</td></tr>
        "#;
        let home = r#"
            <h5 class="card-header"><small class='float-end'> <span>&lt;Return of the Ancients&gt;</span> <span>0.5</span></small>Runes of Aldur</h5>
        "#;

        let leagues = parse_poe2db_leagues(table, home);

        assert!(leagues.iter().any(|league| {
            league.name == "Runes of Aldur"
                && league.expansion.as_deref() == Some("Return of the Ancients")
                && league.starts_at.as_deref() == Some("2026-05-30")
        }));
        assert!(leagues.iter().any(|league| {
            league.name == "Fate of the Vaal"
                && league.expansion.as_deref() == Some("The Last of the Druids")
        }));
    }

    #[test]
    fn classifies_poe2db_item_classes_using_manifest() {
        assert_eq!(classify_item_class(Some("Belts")), "belt");
        assert_eq!(classify_item_class(Some("Charms")), "charm");
        assert_eq!(classify_item_class(Some("Tablet")), "tablet");
        assert_eq!(
            classify_item_class(Some("Currency Stackable Currency")),
            "currency"
        );
        assert_eq!(classify_item_class(Some("Talismans")), "weapon");
    }

    #[test]
    fn exposes_manifest_entries_for_cli_and_updates() {
        let manifest = item_family_manifest();
        assert!(manifest.iter().any(|entry| entry.family == "belt"));
        assert!(manifest.iter().any(|entry| entry.family == "charm"));
        assert!(manifest.iter().any(|entry| entry.family == "currency"));
    }

    #[test]
    fn parses_poe2db_modifier_tier_rows() {
        let html = r#"
            <tr><td>Glinting</td><td>1</td><td>Prefix</td><td><span class="explicitMod">Adds <span class='mod-value'>(1<span class="ndash">—</span>2)</span> to <span class='mod-value'>(4<span class="ndash">—</span>5)</span> <a data-keyword="Physical" href="Physical_Damage">Physical</a> Damage</span> <span class="badge bg-primary craftingdamage" data-tag="damage">Damage</span> <span class="badge bg-primary craftingphysical" data-tag="physical">Physical</span> <span class="badge bg-primary craftingattack" data-tag="attack">Attack</span></td><td><i>bow</i> 1<br><i>default</i> 0<br></td></tr>
            <tr><td>Flaring</td><td>75</td><td>Prefix</td><td><span class="explicitMod">Adds <span class='mod-value'>(26<span class="ndash">—</span>39)</span> to <span class='mod-value'>(44<span class="ndash">—</span>66)</span> <a data-keyword="Physical" href="Physical_Damage">Physical</a> Damage</span> <span class="badge bg-primary craftingdamage" data-tag="damage">Damage</span> <span class="badge bg-primary craftingphysical" data-tag="physical">Physical</span> <span class="badge bg-primary craftingattack" data-tag="attack">Attack</span></td><td><i>bow</i> 1<br><i>default</i> 0<br></td></tr>
        "#;

        let tiers = parse_poe2db_mod_tiers(html);
        let flaring = tiers
            .iter()
            .find(|tier| tier.name == "Flaring")
            .expect("Flaring tier parsed");

        assert_eq!(flaring.tier, "T1");
        assert!(flaring.id.contains("physical-damage"));
        assert_eq!(flaring.required_level, 75);
        assert_eq!(flaring.affix, Some(AffixKind::Prefix));
        assert_eq!(flaring.template, "Adds # to # Physical Damage");
        assert_eq!(flaring.roll_bands.len(), 2);
        assert_eq!(flaring.roll_bands[0].min, 26.0);
        assert_eq!(flaring.roll_bands[0].max, 39.0);
        assert!(flaring.tags.iter().any(|tag| tag == "damage"));
        assert!(flaring.weights.iter().any(|weight| weight.tag == "bow"));
    }

    #[test]
    fn serializes_versioned_poe2db_snapshot_schema() {
        let snapshot = Poe2DbDataSnapshot {
            schema_version: POE2DB_SCHEMA_VERSION,
            source: "PoE2DB".to_string(),
            fetched_at_epoch_ms: 123,
            cache_path: Some("cache.json".to_string()),
            families: normalized_item_family_manifest(),
            leagues: Vec::new(),
            mod_pages: Vec::new(),
            status: Poe2DbAdapterStatus {
                state: "ready".to_string(),
                message: "test".to_string(),
                fresh: true,
                cache_age_seconds: Some(0),
                pages_cached: 0,
                pages_failed: 0,
                failed_pages: Vec::new(),
            },
        };

        let json = serde_json::to_string(&snapshot).expect("snapshot serializes");
        let decoded: Poe2DbDataSnapshot =
            serde_json::from_str(&json).expect("snapshot deserializes");

        assert_eq!(decoded.schema_version, POE2DB_SCHEMA_VERSION);
        assert!(decoded.families.iter().any(|entry| entry.family == "belt"));
        assert_eq!(decoded.status.state, "ready");
    }
}
