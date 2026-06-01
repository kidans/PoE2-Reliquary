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
