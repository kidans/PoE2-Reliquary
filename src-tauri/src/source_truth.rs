use once_cell::sync::Lazy;
use regex::Regex;
use serde::Serialize;

use crate::{DataLeague, LeagueCatalogEntry, TradeLeague};

const POE2DB_HOME_URL: &str = "https://poe2db.tw/us/";
const POE2DB_LEAGUE_URL: &str = "https://poe2db.tw/us/League";
const POE_NINJA_INDEX_STATE_URL: &str = "https://poe.ninja/poe2/api/data/index-state";
const TRADE_API_BASE: &str = "https://www.pathofexile.com/api/trade2";

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
        .user_agent("Lumen-Scan/0.1 poe2db-league-listener")
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

pub fn print_cli(args: &[String]) -> Result<(), String> {
    let sources = registry();

    if args.iter().any(|arg| arg == "--json") {
        let json = serde_json::to_string_pretty(&sources).map_err(|error| error.to_string())?;
        println!("{json}");
        return Ok(());
    }

    println!("Lumen-Scan source-of-truth feeds");
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

    println!("Lumen-Scan league feeds");
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

    println!("Lumen-Scan item family manifest");
    println!();

    for family in families {
        println!("{} ({})", family.family, family.poe2db_section);
        println!("  Classes: {}", family.item_classes.join(", "));
        println!("  Notes: {}", family.notes);
        println!();
    }

    Ok(())
}

async fn fetch_trade_leagues() -> Result<Vec<TradeLeague>, String> {
    let client = reqwest::Client::builder()
        .user_agent("Lumen-Scan/0.1 league-cli")
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
        .user_agent("Lumen-Scan/0.1 poe-ninja-index-state")
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
    let slug = name
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
        .join("-");

    format!("{source}:{version}:{slug}")
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
    use super::{classify_item_class, item_family_manifest, parse_poe2db_leagues};

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
}
