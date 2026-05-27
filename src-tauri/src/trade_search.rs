use arboard::Clipboard;
use serde::Serialize;

use crate::Item;

const DEFAULT_LEAGUE: &str = "Standard";
const TRADE_WEB_BASE: &str = "https://www.pathofexile.com/trade2/search/poe2";

pub fn open_marketplace_handoff(item: &Item, league: Option<&str>) -> Result<(), String> {
    ensure_supported_trade_search(item)?;
    let league = normalized_league(league);
    copy_marketplace_clipboard_summary(item)?;
    let url = item
        .trade_url
        .clone()
        .map(Ok)
        .unwrap_or_else(|| build_marketplace_query_url(item, league))?;

    webbrowser::open(&url)
        .map(|_| ())
        .map_err(|error| error.to_string())
}

pub fn marketplace_url_for_item(item: &Item, league: Option<&str>) -> Result<String, String> {
    ensure_supported_trade_search(item)?;
    let league = normalized_league(league);
    build_marketplace_query_url(item, league)
}

fn ensure_supported_trade_search(item: &Item) -> Result<(), String> {
    if item.is_exchange {
        return Err(
            "exchange-style items route into the dedicated exchange flow, not normal gear trade search".to_string(),
        );
    }

    Ok(())
}

fn build_marketplace_query_url(item: &Item, league: &str) -> Result<String, String> {
    let query = serde_json::to_string(&TradePageRequest::from_item(item))
        .map_err(|error| error.to_string())?;

    Ok(format!(
        "{}/{}?q={}",
        TRADE_WEB_BASE,
        urlencoding::encode(league),
        query
    ))
}

#[cfg(test)]
fn build_marketplace_landing_url(league: &str) -> String {
    format!("{TRADE_WEB_BASE}/{}", urlencoding::encode(league))
}

fn normalized_league(league: Option<&str>) -> &str {
    league
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_LEAGUE)
}

fn copy_marketplace_clipboard_summary(item: &Item) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|error| error.to_string())?;
    clipboard
        .set_text(build_marketplace_clipboard_summary(item))
        .map_err(|error| error.to_string())
}

fn build_marketplace_clipboard_summary(item: &Item) -> String {
    let mut lines = vec![
        format!("Name: {}", item.name),
        format!(
            "Base: {}",
            item.base_type.as_deref().unwrap_or("Unknown base")
        ),
        format!("Rarity: {}", item.rarity),
    ];

    if !item.explicit_mods.is_empty() {
        lines.push("Modifiers:".to_string());
        lines.extend(
            item.explicit_mods
                .iter()
                .map(|modifier| format!("- {modifier}")),
        );
    }

    lines.join("\n")
}

#[derive(Debug, Serialize)]
struct TradePageRequest {
    query: TradePageQuery,
    sort: TradePageSort,
}

impl TradePageRequest {
    fn from_item(item: &Item) -> Self {
        Self {
            query: TradePageQuery::from_item(item),
            sort: TradePageSort {
                price: "asc".to_string(),
            },
        }
    }
}

#[derive(Debug, Serialize)]
struct TradePageQuery {
    status: TradePageStatus,
    stats: Vec<TradePageStatGroup>,
    filters: TradePageFilters,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    item_type: Option<String>,
}

impl TradePageQuery {
    fn from_item(item: &Item) -> Self {
        let is_unique = item.rarity.eq_ignore_ascii_case("unique");
        let item_type = item
            .base_type
            .clone()
            .or_else(|| (!item.name.trim().is_empty()).then(|| item.name.clone()));
        let name = is_unique.then(|| item.name.clone());

        Self {
            status: TradePageStatus {
                option: "securable".to_string(),
            },
            stats: vec![TradePageStatGroup {
                group_type: "and".to_string(),
                filters: Vec::new(),
            }],
            filters: TradePageFilters {},
            name,
            item_type,
        }
    }
}

#[derive(Debug, Serialize)]
struct TradePageStatus {
    option: String,
}

#[derive(Debug, Serialize)]
struct TradePageStatGroup {
    #[serde(rename = "type")]
    group_type: String,
    filters: Vec<TradePageStatFilter>,
}

#[derive(Debug, Serialize)]
struct TradePageStatFilter {}

#[derive(Debug, Serialize)]
struct TradePageFilters {}

#[derive(Debug, Serialize)]
struct TradePageSort {
    price: String,
}

#[cfg(test)]
mod tests {
    use crate::Item;

    use super::{
        build_marketplace_clipboard_summary, build_marketplace_landing_url,
        build_marketplace_query_url,
    };

    #[test]
    fn builds_the_official_poe2_marketplace_landing_url_shape() {
        let url = build_marketplace_landing_url("Fate of the Vaal");

        assert_eq!(
            url,
            "https://www.pathofexile.com/trade2/search/poe2/Fate%20of%20the%20Vaal"
        );
    }

    #[test]
    fn prepares_a_clipboard_summary_without_calling_trade_api() {
        let item = Item {
            name: "Blazing Mesa Waystone".to_string(),
            rarity: "Rare".to_string(),
            family: "waystone".to_string(),
            item_class: Some("Waystones".to_string()),
            base_type: Some("Waystone (Tier 15)".to_string()),
            item_level: Some(82),
            property_lines: Vec::new(),
            explicit_mods: vec!["+18% to Monster Pack Size".to_string()],
            sockets: None,
            spirit: None,
            hazards: Vec::new(),
            trade_url: None,
            raw_text: String::new(),
            is_exchange: false,
            exchange_category_id: None,
        };

        let summary = build_marketplace_clipboard_summary(&item);

        assert!(summary.contains("Base: Waystone (Tier 15)"));
        assert!(summary.contains("+18% to Monster Pack Size"));
    }

    #[test]
    fn builds_trade_page_query_url_without_api_endpoint() {
        let item = Item {
            name: "Blazing Mesa Waystone".to_string(),
            rarity: "Rare".to_string(),
            family: "waystone".to_string(),
            item_class: Some("Waystones".to_string()),
            base_type: Some("Waystone (Tier 15)".to_string()),
            item_level: Some(82),
            property_lines: Vec::new(),
            explicit_mods: vec!["+18% to Monster Pack Size".to_string()],
            sockets: None,
            spirit: None,
            hazards: Vec::new(),
            trade_url: None,
            raw_text: String::new(),
            is_exchange: false,
            exchange_category_id: None,
        };

        let url = build_marketplace_query_url(&item, "Fate of the Vaal").unwrap();

        assert!(url.starts_with(
            "https://www.pathofexile.com/trade2/search/poe2/Fate%20of%20the%20Vaal?q="
        ));
        assert!(url.contains(r#""type":"Waystone (Tier 15)""#));
        assert!(!url.contains("api/trade2/search"));
        assert!(!url.contains("api/trade2/fetch"));
    }

    #[test]
    fn does_not_build_trade_query_for_exchange_mode_items() {
        let item = Item {
            name: "Greater Orb of Transmutation".to_string(),
            rarity: "Currency".to_string(),
            family: "currency".to_string(),
            item_class: Some("Currency Stackable Currency".to_string()),
            base_type: Some("Greater Orb of Transmutation".to_string()),
            item_level: None,
            property_lines: vec!["Stack Size: 3/20".to_string()],
            explicit_mods: Vec::new(),
            sockets: None,
            spirit: None,
            hazards: Vec::new(),
            trade_url: None,
            raw_text: String::new(),
            is_exchange: true,
            exchange_category_id: None,
        };

        let result = build_marketplace_query_url(&item, "Fate of the Vaal");

        assert!(result.is_ok());
        assert!(super::marketplace_url_for_item(&item, Some("Fate of the Vaal")).is_err());
    }
}
