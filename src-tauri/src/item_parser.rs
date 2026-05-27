use once_cell::sync::Lazy;
use regex::Regex;

use crate::{source_truth, Item};

static RARITY_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?m)^Rarity:\s*(?P<rarity>.+)$").expect("valid rarity regex"));
static ITEM_CLASS_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?m)^Item Class:\s*(?P<item_class>.+)$").expect("valid item class regex")
});
static ITEM_LEVEL_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?m)^Item Level:\s*(?P<item_level>\d+)\s*$").expect("valid item level regex")
});
static WAYSTONE_TIER_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?im)^Waystone Tier:\s*(?P<tier>\d+)$").expect("valid waystone tier regex")
});
static SOCKET_COUNT_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)\b(?P<count>\d+)\s+sockets?\b").expect("valid socket regex"));
static SOCKET_LINE_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?m)^Sockets:\s*(?P<sockets>.+)$").expect("valid sockets line regex")
});
static SPIRIT_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)(?:(?P<before>\d+)\s+spirit|spirit\D+(?P<after>\d+))")
        .expect("valid spirit regex")
});
static MOD_HINT_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)(\+|-|\d+%|\d+\s+to\s+\d+|increased|reduced|more|less|resistance|damage|speed|life|mana|spirit|rarity|quantity|level|attribute|armour|evasion|energy shield|critical|thorns|impale|charge|charges|shock|shocks|gain|gains|lose|loses|maximum|cannot|inflict|extract|projectile|stun|recovery|duration)")
        .expect("valid modifier hint regex")
});
static FLASK_BASE_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)(?P<base>[A-Za-z' -]+Flask)(?:\s+of\b.*)?$").expect("valid flask base regex")
});
static CHARM_BASE_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)(?P<base>[A-Za-z' -]+Charm)(?:\s+of\b.*)?$").expect("valid charm base regex")
});
static TABLET_BASE_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)(?P<base>[A-Za-z' -]+Tablet)(?:\s+of\b.*)?$").expect("valid tablet base regex")
});

pub fn parse_item_buffer(raw_text: String) -> Item {
    let rarity = capture_named(&RARITY_RE, &raw_text, "rarity").unwrap_or("Unknown");
    let item_class = capture_named(&ITEM_CLASS_RE, &raw_text, "item_class");
    let family = classify_item_family(item_class).to_string();
    let sections = split_sections(&raw_text);
    let (name, base_type) = parse_item_identity(&sections, rarity, item_class, &family);
    let base_type = normalize_search_base_type(base_type, &family, &raw_text);
    let property_lines = parse_property_lines(&sections, &family);
    let explicit_mods = parse_explicit_mods(&sections, &family);
    let sockets = parse_socket_count(&raw_text);
    let spirit = parse_spirit(&raw_text);
    let item_level = parse_item_level(&raw_text);

    Item {
        name,
        rarity: rarity.to_string(),
        family,
        item_class: item_class.map(str::to_string),
        base_type,
        item_level,
        property_lines,
        explicit_mods,
        sockets,
        spirit,
        hazards: Vec::new(),
        trade_url: None,
        raw_text,
        is_exchange: false,
        exchange_category_id: None,
    }
}

fn capture_named<'a>(regex: &Regex, text: &'a str, name: &str) -> Option<&'a str> {
    regex
        .captures(text)
        .and_then(|captures| captures.name(name))
        .map(|matched| matched.as_str().trim())
}

fn split_sections(raw_text: &str) -> Vec<Vec<String>> {
    let mut sections = Vec::new();
    let mut current = Vec::new();

    for line in raw_text.lines().map(str::trim) {
        if line == "--------" {
            if !current.is_empty() {
                sections.push(current);
                current = Vec::new();
            }
            continue;
        }

        if !line.is_empty() {
            current.push(line.to_string());
        }
    }

    if !current.is_empty() {
        sections.push(current);
    }

    sections
}

fn parse_item_identity(
    sections: &[Vec<String>],
    rarity: &str,
    item_class: Option<&str>,
    family: &str,
) -> (String, Option<String>) {
    let Some(identity_section) = sections.first() else {
        return ("Unknown Item".to_string(), None);
    };

    let lines = identity_section
        .iter()
        .map(String::as_str)
        .filter(|line| !line.starts_with("Item Class: "))
        .filter(|line| !line.starts_with("Rarity: "))
        .collect::<Vec<_>>();

    let Some(first) = lines.first().copied() else {
        return ("Unknown Item".to_string(), None);
    };

    if let Some(second) = lines.get(1).copied() {
        if !second.contains(':') && !MOD_HINT_RE.is_match(second) {
            if rarity.eq_ignore_ascii_case("unique") {
                return (first.to_string(), Some(second.to_string()));
            }

            return (
                format!("{first} {second}").trim().to_string(),
                Some(second.to_string()),
            );
        }
    }

    let inferred_base = infer_base_type(first, item_class, family);
    (first.to_string(), inferred_base)
}

fn infer_base_type(name: &str, item_class: Option<&str>, family: &str) -> Option<String> {
    if family == "flask" {
        let Some(flask_match) = FLASK_BASE_RE
            .captures(name)
            .and_then(|captures| captures.name("base"))
            .map(|value| value.as_str().trim())
        else {
            return item_class.map(|value| value.trim_end_matches('s').to_string());
        };

        let words = flask_match.split_whitespace().collect::<Vec<_>>();
        let base_words = if words.len() > 3 {
            words[1..].to_vec()
        } else {
            words
        };

        return Some(base_words.join(" "));
    }

    if family == "charm" {
        let Some(charm_match) = CHARM_BASE_RE
            .captures(name)
            .and_then(|captures| captures.name("base"))
            .map(|value| value.as_str().trim())
        else {
            return Some("Charm".to_string());
        };

        let words = charm_match.split_whitespace().collect::<Vec<_>>();
        let base_words = if words.len() > 2 {
            words[1..].to_vec()
        } else {
            words
        };

        return Some(base_words.join(" "));
    }

    if family == "tablet" {
        if let Some(tablet_match) = TABLET_BASE_RE
            .captures(name)
            .and_then(|captures| captures.name("base"))
            .map(|value| value.as_str().trim())
        {
            let words = tablet_match.split_whitespace().collect::<Vec<_>>();
            let base_words = if words.len() > 2 {
                words[1..].to_vec()
            } else {
                words
            };

            return Some(base_words.join(" "));
        }
    }

    if matches!(family, "currency" | "gem" | "jewel" | "relic" | "tablet") {
        return Some(name.to_string());
    }

    None
}

fn normalize_search_base_type(
    base_type: Option<String>,
    family: &str,
    raw_text: &str,
) -> Option<String> {
    let Some(base_type) = base_type else {
        return None;
    };

    if family == "waystone" || base_type.eq_ignore_ascii_case("waystone") {
        if let Some(tier) = WAYSTONE_TIER_RE
            .captures(raw_text)
            .and_then(|captures| captures.name("tier"))
            .map(|tier| tier.as_str())
        {
            return Some(format!("Waystone (Tier {tier})"));
        }
    }

    Some(base_type)
}

fn parse_property_lines(sections: &[Vec<String>], family: &str) -> Vec<String> {
    sections
        .iter()
        .skip(1)
        .flat_map(|section| section.iter())
        .filter(|line| is_property_line(line, family))
        .cloned()
        .collect()
}

fn parse_explicit_mods(sections: &[Vec<String>], family: &str) -> Vec<String> {
    sections
        .iter()
        .skip(1)
        .flat_map(|section| section.iter())
        .filter(|line| is_modifier_line(line, family))
        .cloned()
        .collect()
}

fn classify_item_family(item_class: Option<&str>) -> &'static str {
    let family = source_truth::classify_item_class(item_class);
    if family != "other" {
        return family;
    }

    let normalized = item_class.unwrap_or("").trim().to_ascii_lowercase();
    if normalized.contains("maps") {
        return "waystone";
    }

    "other"
}

fn is_modifier_line(line: &str, family: &str) -> bool {
    if line.is_empty()
        || line.starts_with("Item Class: ")
        || line.starts_with("Rarity: ")
        || line.starts_with("Requires:")
        || line.starts_with("Requirements:")
        || line.starts_with("Sockets:")
        || line.starts_with("Item Level:")
        || line.starts_with("Quality:")
        || line.starts_with("Level:")
        || line.starts_with("Waystone Tier:")
        || line.starts_with("Spirit:")
        || is_property_line(line, family)
        || is_flavour_line(line, family)
    {
        return false;
    }

    MOD_HINT_RE.is_match(line)
}

fn is_property_line(line: &str, family: &str) -> bool {
    let lower = line.to_ascii_lowercase();

    if matches!(lower.as_str(), "flask" | "charm" | "relic") {
        return true;
    }

    if has_property_prefix(&lower) {
        return true;
    }

    match family {
        "flask" => {
            lower.starts_with("recovers ")
                || lower.starts_with("consumes ")
                || lower.starts_with("currently has ")
                || lower.starts_with("lasts ")
        }
        "charm" => {
            lower.starts_with("consumes ")
                || lower.starts_with("currently has ")
                || lower.starts_with("lasts ")
                || lower.starts_with("used when ")
        }
        "belt" => lower.contains("charm slot"),
        "tablet" => lower.starts_with("place into "),
        _ => false,
    }
}

fn is_flavour_line(line: &str, family: &str) -> bool {
    let lower = line.to_ascii_lowercase();

    if matches!(family, "flask" | "charm") {
        return lower.starts_with("right click to ")
            || lower.starts_with("used automatically when condition is met")
            || lower.starts_with("can only hold charges")
            || lower.contains("refill at wells")
            || lower.contains("refill by killing monsters");
    }

    line.ends_with('.') && !MOD_HINT_RE.is_match(line)
}

fn has_property_prefix(lower: &str) -> bool {
    [
        "quality:",
        "level:",
        "stack size:",
        "waystone tier:",
        "minimum modifier level:",
        "charm slots:",
        "armour:",
        "evasion rating:",
        "energy shield:",
        "block chance:",
        "rune sockets:",
        "gem sockets:",
        "critical hit chance:",
        "attacks per second:",
        "physical damage:",
        "weapon range:",
        "spirit:",
        "dps:",
        "mana cost:",
        "cast time:",
        "attack time:",
        "cooldown time:",
        "reload time:",
        "stored uses:",
        "limit:",
        "radius:",
        "duration:",
        "soul gain prevention:",
    ]
    .iter()
    .any(|prefix| lower.starts_with(prefix))
}

fn parse_socket_count(raw_text: &str) -> Option<u8> {
    if let Some(count) = SOCKET_COUNT_RE
        .captures(raw_text)
        .and_then(|captures| captures.name("count"))
        .and_then(|count| count.as_str().parse::<u8>().ok())
    {
        return Some(count);
    }

    SOCKET_LINE_RE
        .captures(raw_text)
        .and_then(|captures| captures.name("sockets"))
        .map(|sockets| {
            sockets
                .as_str()
                .split_whitespace()
                .filter(|socket| {
                    socket
                        .chars()
                        .all(|character| character.is_ascii_alphabetic())
                })
                .count() as u8
        })
        .filter(|count| *count > 0)
}

fn parse_spirit(raw_text: &str) -> Option<u16> {
    let captures = SPIRIT_RE.captures(raw_text)?;
    captures
        .name("before")
        .or_else(|| captures.name("after"))
        .and_then(|amount| amount.as_str().parse::<u16>().ok())
}

fn parse_item_level(raw_text: &str) -> Option<u16> {
    ITEM_LEVEL_RE
        .captures(raw_text)
        .and_then(|captures| captures.name("item_level"))
        .and_then(|level| level.as_str().parse::<u16>().ok())
}

#[cfg(test)]
mod tests {
    use super::parse_item_buffer;

    #[test]
    fn parses_core_item_fields_and_explicit_modifiers() {
        let raw = r#"Item Class: Waystones
Rarity: Rare
Blazing Mesa
Waystone
--------
Waystone Tier: 15
Item Level: 82
--------
Area contains patches of Burning Ground
Players have 40% reduced Recovery Rate of Life and Energy Shield
+18% to Monster Pack Size
--------"#;

        let item = parse_item_buffer(raw.to_string());

        assert_eq!(item.rarity, "Rare");
        assert_eq!(item.family, "waystone");
        assert_eq!(item.item_class.as_deref(), Some("Waystones"));
        assert_eq!(item.name, "Blazing Mesa Waystone");
        assert_eq!(item.base_type.as_deref(), Some("Waystone (Tier 15)"));
        assert_eq!(item.item_level, Some(82));
        assert!(item.explicit_mods.contains(
            &"Players have 40% reduced Recovery Rate of Life and Energy Shield".to_string()
        ));
        assert!(item
            .explicit_mods
            .contains(&"+18% to Monster Pack Size".to_string()));
    }

    #[test]
    fn extracts_spirit_and_sockets_when_present() {
        let raw = r#"Item Class: Sceptres
Rarity: Magic
Storm Chant
Sceptre
--------
Grants 100 Spirit
--------
Sockets: S S
--------
+21% increased Lightning Damage"#;

        let item = parse_item_buffer(raw.to_string());

        assert_eq!(item.family, "weapon");
        assert_eq!(item.spirit, Some(100));
        assert_eq!(item.sockets, Some(2));
    }

    #[test]
    fn keeps_unique_name_separate_from_base_type() {
        let raw = "Item Class: Body Armours\r\nRarity: Unique\r\nRedflare Conduit\r\nAnchorite Garb\r\n--------\r\nRequires: Level 33, 31 Dex, 31 Int\r\n--------\r\nItem Level: 79\r\n--------\r\n+65 to maximum Mana\r\n+22% to Lightning Resistance\r\n20% chance to gain a Power Charge on Hit\r\n";

        let item = parse_item_buffer(raw.to_string());

        assert_eq!(item.name, "Redflare Conduit");
        assert_eq!(item.base_type.as_deref(), Some("Anchorite Garb"));
        assert_eq!(item.item_level, Some(79));
        assert!(!item
            .explicit_mods
            .iter()
            .any(|modifier| modifier.starts_with("Requires:")));
    }

    #[test]
    fn keeps_unique_charge_and_shock_modifier_lines() {
        let raw = "Item Class: Body Armours\r\nRarity: Unique\r\nRedflare Conduit\r\nAnchorite Garb\r\n--------\r\nItem Level: 79\r\n--------\r\nLose all Power Charges on reaching maximum Power Charges\r\nShocks you when you reach maximum Power Charges\r\n--------\r\nIn all things, control.\r\n";

        let item = parse_item_buffer(raw.to_string());

        assert!(item
            .explicit_mods
            .contains(&"Lose all Power Charges on reaching maximum Power Charges".to_string()));
        assert!(item
            .explicit_mods
            .contains(&"Shocks you when you reach maximum Power Charges".to_string()));
        assert!(!item
            .explicit_mods
            .contains(&"In all things, control.".to_string()));
    }

    #[test]
    fn classifies_flasks_and_keeps_only_real_mods() {
        let raw = r#"Item Class: Mana Flasks
Rarity: Magic
Dense Ultimate Mana Flask of the Foliage
--------
Flask
Recovers 310 Mana over 2.10 Seconds
Consumes 10 of 75 Charges on use
Currently has 75 Charges
Requires: Level 60
--------
Gains 0.15 Charges per Second
41% increased Recovery Rate
--------
Right Click to Drink. Can only hold Charges while in Belt. Refill at Wells or by killing Monsters."#;

        let item = parse_item_buffer(raw.to_string());

        assert_eq!(item.family, "flask");
        assert_eq!(item.base_type.as_deref(), Some("Ultimate Mana Flask"));
        assert!(item
            .property_lines
            .contains(&"Recovers 310 Mana over 2.10 Seconds".to_string()));
        assert!(item
            .explicit_mods
            .contains(&"Gains 0.15 Charges per Second".to_string()));
        assert!(item
            .explicit_mods
            .contains(&"41% increased Recovery Rate".to_string()));
        assert!(!item
            .explicit_mods
            .iter()
            .any(|line| line.starts_with("Recovers ")));
        assert!(!item
            .explicit_mods
            .iter()
            .any(|line| line.starts_with("Consumes ")));
        assert!(!item
            .explicit_mods
            .iter()
            .any(|line| line.starts_with("Currently has ")));
        assert!(!item
            .explicit_mods
            .iter()
            .any(|line| line.starts_with("Right Click to ")));
    }

    #[test]
    fn keeps_gem_properties_out_of_explicit_mods() {
        let raw = r#"Item Class: Skill Gems
Rarity: Magic
Spark
--------
Level: 14
Mana Cost: 12
Cast Time: 0.70 sec
--------
+1 to Level of all Lightning Skills
+12% increased Cast Speed"#;

        let item = parse_item_buffer(raw.to_string());

        assert_eq!(item.family, "gem");
        assert!(item.property_lines.contains(&"Level: 14".to_string()));
        assert!(item.property_lines.contains(&"Mana Cost: 12".to_string()));
        assert!(item
            .property_lines
            .contains(&"Cast Time: 0.70 sec".to_string()));
        assert!(item
            .explicit_mods
            .contains(&"+1 to Level of all Lightning Skills".to_string()));
        assert!(item
            .explicit_mods
            .contains(&"+12% increased Cast Speed".to_string()));
        assert!(!item
            .explicit_mods
            .iter()
            .any(|line| line.starts_with("Level:")));
        assert!(!item
            .explicit_mods
            .iter()
            .any(|line| line.starts_with("Mana Cost:")));
    }

    #[test]
    fn classifies_stackable_currency_and_uses_name_as_base() {
        let raw = r#"Item Class: Currency Stackable Currency
Rarity: Currency
Greater Orb of Transmutation
--------
Stack Size: 3/20
Minimum Modifier Level: 55"#;

        let item = parse_item_buffer(raw.to_string());

        assert_eq!(item.family, "currency");
        assert_eq!(item.name, "Greater Orb of Transmutation");
        assert_eq!(
            item.base_type.as_deref(),
            Some("Greater Orb of Transmutation")
        );
        assert!(item
            .property_lines
            .contains(&"Stack Size: 3/20".to_string()));
        assert!(item
            .property_lines
            .contains(&"Minimum Modifier Level: 55".to_string()));
        assert!(item.explicit_mods.is_empty());
    }

    #[test]
    fn classifies_charms_and_keeps_trigger_properties_out_of_mods() {
        let raw = r#"Item Class: Charms
Rarity: Magic
Natural Golden Charm of the Distiller
--------
Charm
Lasts 1 Second
Consumes 60 of 80 Charges on use
Currently has 80 Charges
Requires: Level 53
--------
Used when you Kill a Rare or Unique Enemy
Recover 250 Life when Used
25% reduced Charges per use
--------
Used automatically when condition is met. Can only hold Charges while in Belt. Refill at Wells or by killing Monsters."#;

        let item = parse_item_buffer(raw.to_string());

        assert_eq!(item.family, "charm");
        assert_eq!(item.base_type.as_deref(), Some("Golden Charm"));
        assert!(item.property_lines.contains(&"Lasts 1 Second".to_string()));
        assert!(item
            .property_lines
            .contains(&"Consumes 60 of 80 Charges on use".to_string()));
        assert!(item
            .property_lines
            .contains(&"Currently has 80 Charges".to_string()));
        assert!(item
            .property_lines
            .contains(&"Used when you Kill a Rare or Unique Enemy".to_string()));
        assert!(item
            .explicit_mods
            .contains(&"Recover 250 Life when Used".to_string()));
        assert!(item
            .explicit_mods
            .contains(&"25% reduced Charges per use".to_string()));
        assert!(!item
            .explicit_mods
            .iter()
            .any(|line| line.starts_with("Used automatically when condition is met")));
    }

    #[test]
    fn classifies_belts_and_treats_charm_slots_as_property() {
        let raw = r#"Item Class: Belts
Rarity: Unique
Headhunter
Heavy Belt
--------
Requires: Level 50
--------
27% increased Stun Threshold
Has 3 Charm Slots
+40 to maximum Life
+35 to Strength
+28 to Dexterity
When you Kill a Rare Monster, you gain its Modifiers for 60 seconds
--------
Corrupted"#;

        let item = parse_item_buffer(raw.to_string());

        assert_eq!(item.family, "belt");
        assert!(item
            .property_lines
            .contains(&"Has 3 Charm Slots".to_string()));
        assert!(!item
            .explicit_mods
            .contains(&"Has 3 Charm Slots".to_string()));
        assert!(item
            .explicit_mods
            .contains(&"+40 to maximum Life".to_string()));
    }
}
