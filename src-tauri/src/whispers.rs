use once_cell::sync::Lazy;
use regex::Regex;

use crate::{TabCoordinates, TradeWhisper};

static WHISPER_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r#"@From\s+(?P<buyer>[^:]+):\s+Hi,\s+I would like to buy your\s+(?P<item>.+?)\s+listed for\s+(?P<price>.+?)\s+in\s+(?P<league>.+?)(?:\s+\(stash tab "(?P<tab>[^"]+)"; position: left (?P<left>\d+), top (?P<top>\d+)\))?\.?$"#,
    )
    .expect("valid trade whisper regex")
});

pub fn evaluate_whisper_string(line: &str) -> Option<TradeWhisper> {
    let captures = WHISPER_RE.captures(line.trim())?;
    let tab_coordinates = match (
        captures.name("tab"),
        captures.name("left"),
        captures.name("top"),
    ) {
        (Some(tab), Some(left), Some(top)) => Some(TabCoordinates {
            tab_name: tab.as_str().to_string(),
            left: left.as_str().parse().ok()?,
            top: top.as_str().parse().ok()?,
        }),
        _ => None,
    };

    Some(TradeWhisper {
        buyer_name: captures.name("buyer")?.as_str().trim().to_string(),
        item: captures.name("item")?.as_str().trim().to_string(),
        price: captures.name("price")?.as_str().trim().to_string(),
        league: captures.name("league")?.as_str().trim().to_string(),
        tab_coordinates,
    })
}

#[cfg(test)]
mod tests {
    use super::evaluate_whisper_string;

    #[test]
    fn parses_trade_whisper_with_stash_coordinates() {
        let line = r#"@From ZanaEnjoyer: Hi, I would like to buy your Blazing Mesa Waystone listed for 2 exalted orb in Standard (stash tab "maps"; position: left 4, top 7)"#;

        let whisper = evaluate_whisper_string(line).expect("whisper should parse");

        assert_eq!(whisper.buyer_name, "ZanaEnjoyer");
        assert_eq!(whisper.item, "Blazing Mesa Waystone");
        assert_eq!(whisper.price, "2 exalted orb");
        assert_eq!(whisper.league, "Standard");
        assert_eq!(whisper.tab_coordinates.unwrap().left, 4);
    }
}
