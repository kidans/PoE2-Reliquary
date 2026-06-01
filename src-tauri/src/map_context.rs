use serde::{Deserialize, Serialize};

use crate::{
    hazards::{
        check_waystone_profile_hazards, profile_by_id, HazardSummary, WaystoneHazardWarning,
    },
    CurrentAreaInfo, Item,
};

pub const WAYSTONE_ARM_TIMEOUT_MS: u64 = 15 * 60 * 1000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MapRunConfidence {
    Armed,
    AreaOnly,
    Stale,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WaystoneSnapshot {
    pub name: String,
    pub base_type: Option<String>,
    pub tier: Option<u8>,
    pub item_level: Option<u16>,
    pub explicit_mods: Vec<String>,
    pub quantity: Option<u32>,
    pub rarity: Option<u32>,
    pub pack_size: Option<u32>,
    pub hazard_count: usize,
    pub profile_hazards: Vec<WaystoneHazardWarning>,
    pub profile_hazard_summary: HazardSummary,
    pub raw_hash: String,
    pub captured_at_epoch_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MapRunContext {
    pub area: CurrentAreaInfo,
    pub waystone: Option<WaystoneSnapshot>,
    pub confidence: MapRunConfidence,
    pub started_at_epoch_ms: u64,
}

impl MapRunContext {
    pub fn area_only(area: CurrentAreaInfo, started_at_epoch_ms: u64) -> Self {
        Self {
            area,
            waystone: None,
            confidence: MapRunConfidence::AreaOnly,
            started_at_epoch_ms,
        }
    }

    pub fn armed(
        mut area: CurrentAreaInfo,
        waystone: WaystoneSnapshot,
        started_at_epoch_ms: u64,
    ) -> Self {
        area.waystone_mod_count = Some(waystone.explicit_mods.len());
        area.waystone_quantity = waystone.quantity;
        area.waystone_rarity = waystone.rarity;
        area.waystone_pack_size = waystone.pack_size;
        area.waystone_hazard_count = Some(waystone.profile_hazard_summary.total());
        Self {
            area,
            waystone: Some(waystone),
            confidence: MapRunConfidence::Armed,
            started_at_epoch_ms,
        }
    }

    pub fn stale(area: CurrentAreaInfo, started_at_epoch_ms: u64) -> Self {
        Self {
            area,
            waystone: None,
            confidence: MapRunConfidence::Stale,
            started_at_epoch_ms,
        }
    }
}

pub fn is_waystone_item(item: &Item) -> bool {
    item.family == "waystone"
        || item.base_type.as_deref().map_or(false, |base_type| {
            let base_type = base_type.to_ascii_lowercase();
            base_type.contains("waystone") || base_type.contains("tablet")
        })
}

pub fn snapshot_from_item(
    item: &Item,
    captured_at_epoch_ms: u64,
    hazard_profile_id: &str,
) -> Option<WaystoneSnapshot> {
    if !is_waystone_item(item) {
        return None;
    }

    let profile = profile_by_id(hazard_profile_id);
    let profile_hazards = check_waystone_profile_hazards(&item.explicit_mods, &profile);
    let profile_hazard_summary = HazardSummary::from_warnings(&profile_hazards);

    Some(WaystoneSnapshot {
        name: item.name.clone(),
        base_type: item.base_type.clone(),
        tier: parse_waystone_tier(item),
        item_level: item.item_level,
        explicit_mods: item.explicit_mods.clone(),
        quantity: parse_waystone_number(&item.property_lines, "increased Quantity")
            .or_else(|| parse_waystone_number_from_text(&item.raw_text, "increased Quantity")),
        rarity: parse_waystone_number_from_text(&item.raw_text, "increased Rarity"),
        pack_size: parse_waystone_number(&item.property_lines, "Monster Pack Size")
            .or_else(|| parse_waystone_number_from_text(&item.raw_text, "Pack Size")),
        hazard_count: profile_hazard_summary.total(),
        profile_hazards,
        profile_hazard_summary,
        raw_hash: stable_text_hash(&item.raw_text),
        captured_at_epoch_ms,
    })
}

pub fn refresh_snapshot_hazards(
    snapshot: &WaystoneSnapshot,
    hazard_profile_id: &str,
) -> WaystoneSnapshot {
    let profile = profile_by_id(hazard_profile_id);
    let profile_hazards = check_waystone_profile_hazards(&snapshot.explicit_mods, &profile);
    let profile_hazard_summary = HazardSummary::from_warnings(&profile_hazards);

    let mut refreshed = snapshot.clone();
    refreshed.hazard_count = profile_hazard_summary.total();
    refreshed.profile_hazards = profile_hazards;
    refreshed.profile_hazard_summary = profile_hazard_summary;
    refreshed
}

pub fn bind_area_to_waystone(
    area: CurrentAreaInfo,
    pending_waystone: Option<WaystoneSnapshot>,
    now_epoch_ms: u64,
) -> MapRunContext {
    match pending_waystone {
        Some(waystone)
            if now_epoch_ms.saturating_sub(waystone.captured_at_epoch_ms)
                <= WAYSTONE_ARM_TIMEOUT_MS =>
        {
            MapRunContext::armed(area, waystone, now_epoch_ms)
        }
        Some(_) => MapRunContext::stale(area, now_epoch_ms),
        None => MapRunContext::area_only(area, now_epoch_ms),
    }
}

fn parse_waystone_tier(item: &Item) -> Option<u8> {
    item.base_type
        .as_deref()
        .and_then(|base_type| parse_waystone_number_from_text(base_type, "Tier"))
        .and_then(|tier| u8::try_from(tier).ok())
        .or_else(|| {
            parse_waystone_number_from_text(&item.raw_text, "Waystone Tier")
                .and_then(|tier| u8::try_from(tier).ok())
        })
}

pub fn parse_waystone_number(lines: &[String], needle: &str) -> Option<u32> {
    lines
        .iter()
        .find(|line| line.contains(needle))
        .and_then(|line| first_unsigned_number(line))
}

pub fn parse_waystone_number_from_text(text: &str, needle: &str) -> Option<u32> {
    text.lines()
        .find(|line| line.contains(needle))
        .and_then(first_unsigned_number)
}

fn first_unsigned_number(text: &str) -> Option<u32> {
    let mut digits = String::new();
    for character in text.chars() {
        if character.is_ascii_digit() {
            digits.push(character);
        } else if !digits.is_empty() {
            break;
        }
    }
    digits.parse::<u32>().ok()
}

fn stable_text_hash(text: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in text.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn map_area() -> CurrentAreaInfo {
        CurrentAreaInfo {
            name: "Heart of the Tribe".to_string(),
            area_level: Some(80),
            area_type: "map".to_string(),
            entered_at_epoch_ms: 2_000,
            act: None,
            waystone_mod_count: None,
            waystone_quantity: None,
            waystone_rarity: None,
            waystone_pack_size: None,
            waystone_hazard_count: None,
            boss: Some("Unknown".to_string()),
        }
    }

    fn waystone_item(mods: Vec<&str>) -> Item {
        Item {
            name: "Warped Carving Waystone".to_string(),
            rarity: "Rare".to_string(),
            family: "waystone".to_string(),
            item_class: Some("Waystone".to_string()),
            base_type: Some("Waystone (Tier 15)".to_string()),
            item_level: Some(80),
            property_lines: vec![
                "Waystone Tier: 15".to_string(),
                "Monster Pack Size: +9%".to_string(),
            ],
            explicit_mods: mods.into_iter().map(str::to_string).collect(),
            sockets: None,
            spirit: None,
            hazards: Vec::new(),
            trade_url: None,
            raw_text:
                "Waystone Tier: 15\nMonster Pack Size: +9%\nPlayers have 50% reduced Recovery Rate"
                    .to_string(),
            is_exchange: false,
            exchange_category_id: None,
        }
    }

    #[test]
    fn bind_area_without_pending_is_area_only() {
        let run = bind_area_to_waystone(map_area(), None, 2_000);
        assert_eq!(run.confidence, MapRunConfidence::AreaOnly);
        assert!(run.waystone.is_none());
    }

    #[test]
    fn bind_area_with_fresh_pending_is_armed() {
        let waystone = snapshot_from_item(&waystone_item(vec![]), 1_000, "general_safe_mapping")
            .expect("waystone snapshot");

        let run =
            bind_area_to_waystone(map_area(), Some(waystone), 1_000 + WAYSTONE_ARM_TIMEOUT_MS);

        assert_eq!(run.confidence, MapRunConfidence::Armed);
        assert!(run.waystone.is_some());
        assert_eq!(run.area.waystone_mod_count, Some(0));
        assert_eq!(run.area.waystone_pack_size, Some(9));
    }

    #[test]
    fn bind_area_with_expired_pending_is_stale() {
        let waystone = snapshot_from_item(&waystone_item(vec![]), 1_000, "general_safe_mapping")
            .expect("waystone snapshot");

        let run =
            bind_area_to_waystone(map_area(), Some(waystone), 1_001 + WAYSTONE_ARM_TIMEOUT_MS);

        assert_eq!(run.confidence, MapRunConfidence::Stale);
        assert!(run.waystone.is_none());
    }

    #[test]
    fn snapshot_from_item_ignores_non_waystones() {
        let mut item = waystone_item(vec![]);
        item.family = "armour".to_string();
        item.base_type = Some("Body Armour".to_string());

        assert!(snapshot_from_item(&item, 1_000, "general_safe_mapping").is_none());
    }

    #[test]
    fn refresh_snapshot_hazards_recalculates_profile_summary() {
        let snapshot = snapshot_from_item(
            &waystone_item(vec!["Players have 50% reduced Recovery Rate"]),
            1_000,
            "general_safe_mapping",
        )
        .expect("waystone snapshot");

        assert_eq!(snapshot.profile_hazard_summary.danger, 1);
        assert_eq!(snapshot.profile_hazard_summary.build_breaking, 0);

        let refreshed = refresh_snapshot_hazards(&snapshot, "energy_shield_recovery");

        assert_eq!(refreshed.profile_hazard_summary.build_breaking, 1);
        assert_eq!(refreshed.raw_hash, snapshot.raw_hash);
        assert_eq!(
            refreshed.captured_at_epoch_ms,
            snapshot.captured_at_epoch_ms
        );
    }
}
