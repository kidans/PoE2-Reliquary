use std::{collections::HashMap, io::Read, sync::Mutex as StdMutex, time::Duration};

use base64::{
    engine::general_purpose::{STANDARD as BASE64_STANDARD, URL_SAFE, URL_SAFE_NO_PAD},
    Engine as _,
};
use flate2::read::ZlibDecoder;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;

const POE_NINJA_INDEX_STATE_URL: &str = "https://poe.ninja/poe2/api/data/index-state";
const POE_NINJA_BUILD_CHARACTER_URL_PREFIX: &str = "https://poe.ninja/poe2/api/builds";
const POE_NINJA_PROFILE_CACHE_TTL_MS: u64 = 60 * 60 * 1000;
const POE_NINJA_USER_AGENT: &str = "Reliquary/0.1 poe-ninja-build-profile";
const POE_NINJA_REQUEST_TIMEOUT: Duration = Duration::from_secs(12);

static POE_NINJA_PROFILE_CACHE: Lazy<StdMutex<HashMap<String, CachedPoeNinjaProfile>>> =
    Lazy::new(|| StdMutex::new(HashMap::new()));

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BuildSnapshotSource {
    PoeNinjaCharacterUrl,
    PobCode,
    ManualProfile,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildSnapshot {
    pub source: BuildSnapshotSource,
    pub source_url: Option<String>,
    pub account: Option<String>,
    pub character: Option<String>,
    pub league: Option<String>,
    pub class_name: Option<String>,
    pub class_icon_url: Option<String>,
    pub ascendancy: Option<String>,
    pub level: Option<u16>,
    pub life: Option<u32>,
    pub energy_shield: Option<u32>,
    pub mana: Option<u32>,
    pub spirit: Option<u32>,
    pub attributes: BuildAttributes,
    pub charges: BuildCharges,
    pub movement_speed: Option<f32>,
    pub armour: Option<u32>,
    pub evasion_rating: Option<u32>,
    pub evade_chance: Option<f32>,
    pub deflection_rating: Option<u32>,
    pub deflect_chance: Option<f32>,
    pub physical_taken_as: Option<f32>,
    pub resistances: BuildResistances,
    pub effective_health_pool: Option<String>,
    pub max_hit: Option<BuildMaxHit>,
    pub keystones: Vec<String>,
    pub main_skills: Vec<String>,
    pub skill_dps: Vec<BuildSkillDps>,
    pub defensive_layers: Vec<String>,
    pub equipped_uniques: Vec<String>,
    pub recovery_systems: Vec<String>,
    pub fetched_at_epoch_ms: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BuildAttributes {
    pub strength: Option<u32>,
    pub dexterity: Option<u32>,
    pub intelligence: Option<u32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BuildCharges {
    pub endurance: Option<u32>,
    pub frenzy: Option<u32>,
    pub power: Option<u32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BuildResistances {
    pub fire: Option<f32>,
    pub cold: Option<f32>,
    pub lightning: Option<f32>,
    pub chaos: Option<f32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BuildMaxHit {
    pub physical: Option<String>,
    pub fire: Option<String>,
    pub cold: Option<String>,
    pub lightning: Option<String>,
    pub chaos: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildSkillDps {
    pub name: String,
    pub dps: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildFingerprint {
    pub tags: Vec<String>,
    pub recommended_profile_id: String,
    pub confidence: String,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildProfileImportResult {
    pub snapshot: BuildSnapshot,
    pub fingerprint: BuildFingerprint,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PoeNinjaCharacterParts {
    account: String,
    league: Option<String>,
    character: String,
}

#[derive(Debug, Clone)]
struct CachedPoeNinjaProfile {
    fetched_at_epoch_ms: u64,
    result: BuildProfileImportResult,
}

#[derive(Debug, Clone, Deserialize)]
struct PoeNinjaIndexStateResponse {
    #[serde(default, rename = "snapshotVersions")]
    snapshot_versions: Vec<PoeNinjaSnapshotVersion>,
}

#[derive(Debug, Clone, Deserialize)]
struct PoeNinjaSnapshotVersion {
    url: String,
    name: String,
    version: String,
    #[serde(rename = "snapshotName")]
    snapshot_name: String,
}

pub async fn snapshot_from_poe_ninja_url_live(
    url: &str,
    fetched_at_epoch_ms: u64,
) -> Result<BuildProfileImportResult, String> {
    let parts = parse_poe_ninja_character_url(url)?;
    let cache_key = poe_ninja_cache_key(&parts);

    if let Some(cached) = cached_poe_ninja_profile(&cache_key, fetched_at_epoch_ms, false) {
        return Ok(cached);
    }

    match fetch_poe_ninja_profile(&parts, url, fetched_at_epoch_ms).await {
        Ok(result) => {
            if let Ok(mut cache) = POE_NINJA_PROFILE_CACHE.lock() {
                cache.insert(
                    cache_key,
                    CachedPoeNinjaProfile {
                        fetched_at_epoch_ms,
                        result: result.clone(),
                    },
                );
            }
            Ok(result)
        }
        Err(error) => {
            if let Some(mut cached) =
                cached_poe_ninja_profile(&cache_key, fetched_at_epoch_ms, true)
            {
                cached.fingerprint.notes.push(format!(
                    "PoE.ninja refresh failed ({error}); showing the last cached character snapshot."
                ));
                return Ok(cached);
            }

            Err(error)
        }
    }
}

#[cfg(test)]
fn snapshot_from_poe_ninja_url(
    url: &str,
    fetched_at_epoch_ms: u64,
) -> Result<BuildProfileImportResult, String> {
    let parts = parse_poe_ninja_character_url(url)?;
    let mut snapshot = empty_build_snapshot(
        BuildSnapshotSource::PoeNinjaCharacterUrl,
        fetched_at_epoch_ms,
    );
    snapshot.source_url = Some(url.trim().to_string());
    snapshot.account = Some(parts.account);
    snapshot.character = Some(parts.character);
    snapshot.league = parts.league;

    let mut fingerprint = infer_build_fingerprint(&snapshot);
    fingerprint.notes.push(
        "PoE.ninja URL import currently stores identity only; paste a PoB export to fill calculated stats."
            .to_string(),
    );
    Ok(BuildProfileImportResult {
        snapshot,
        fingerprint,
    })
}

async fn fetch_poe_ninja_profile(
    parts: &PoeNinjaCharacterParts,
    source_url: &str,
    fetched_at_epoch_ms: u64,
) -> Result<BuildProfileImportResult, String> {
    let client = reqwest::Client::builder()
        .user_agent(POE_NINJA_USER_AGENT)
        .timeout(POE_NINJA_REQUEST_TIMEOUT)
        .build()
        .map_err(|error| error.to_string())?;
    let index_state = fetch_poe_ninja_index_state(&client).await?;
    let snapshot_version = resolve_poe_ninja_snapshot_version(parts, &index_state)?;
    let character_json = fetch_poe_ninja_character_json(&client, parts, &snapshot_version).await?;

    snapshot_from_poe_ninja_character_json(
        source_url,
        parts,
        &snapshot_version,
        &character_json,
        fetched_at_epoch_ms,
    )
}

async fn fetch_poe_ninja_index_state(
    client: &reqwest::Client,
) -> Result<PoeNinjaIndexStateResponse, String> {
    let body = client
        .get(POE_NINJA_INDEX_STATE_URL)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .text()
        .await
        .map_err(|error| error.to_string())?;

    serde_json::from_str(&body)
        .map_err(|error| format!("failed to parse PoE.ninja index-state JSON: {error}"))
}

async fn fetch_poe_ninja_character_json(
    client: &reqwest::Client,
    parts: &PoeNinjaCharacterParts,
    snapshot_version: &PoeNinjaSnapshotVersion,
) -> Result<Value, String> {
    let url = format!(
        "{}/{}/character",
        POE_NINJA_BUILD_CHARACTER_URL_PREFIX, snapshot_version.version
    );
    let body = client
        .get(url)
        .query(&[
            ("account", parts.account.as_str()),
            ("name", parts.character.as_str()),
            ("overview", snapshot_version.snapshot_name.as_str()),
            ("timeMachine", ""),
        ])
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .text()
        .await
        .map_err(|error| error.to_string())?;

    serde_json::from_str(&body)
        .map_err(|error| format!("failed to parse PoE.ninja character JSON: {error}"))
}

fn resolve_poe_ninja_snapshot_version(
    parts: &PoeNinjaCharacterParts,
    index_state: &PoeNinjaIndexStateResponse,
) -> Result<PoeNinjaSnapshotVersion, String> {
    let league = parts.league.as_deref().ok_or_else(|| {
        "PoE.ninja character imports need a league slug in the URL so Reliquary can pick the correct snapshot.".to_string()
    })?;
    let needle = normalize_poe_ninja_league_key(league);

    index_state
        .snapshot_versions
        .iter()
        .find(|candidate| {
            [
                candidate.url.as_str(),
                candidate.name.as_str(),
                candidate.snapshot_name.as_str(),
            ]
            .iter()
            .any(|value| normalize_poe_ninja_league_key(value) == needle)
        })
        .cloned()
        .ok_or_else(|| {
            format!("PoE.ninja does not expose a current build snapshot for league '{league}'.")
        })
}

fn snapshot_from_poe_ninja_character_json(
    source_url: &str,
    parts: &PoeNinjaCharacterParts,
    snapshot_version: &PoeNinjaSnapshotVersion,
    character: &Value,
    fetched_at_epoch_ms: u64,
) -> Result<BuildProfileImportResult, String> {
    let mut snapshot = empty_build_snapshot(
        BuildSnapshotSource::PoeNinjaCharacterUrl,
        fetched_at_epoch_ms,
    );
    let defensive = character.get("defensiveStats");

    snapshot.source_url = Some(source_url.trim().to_string());
    snapshot.account = value_string(character, "account").or_else(|| Some(parts.account.clone()));
    snapshot.character = value_string(character, "name").or_else(|| Some(parts.character.clone()));
    snapshot.league = value_string(character, "league").or_else(|| {
        if snapshot_version.name.is_empty() {
            parts.league.clone()
        } else {
            Some(snapshot_version.name.clone())
        }
    });
    snapshot.class_name = value_string(character, "class");
    snapshot.class_icon_url = snapshot
        .class_name
        .as_deref()
        .and_then(poe_ninja_class_icon_url);
    snapshot.level = value_u16(character, "level");

    snapshot.life = defensive.and_then(|stats| value_u32(stats, "life"));
    snapshot.energy_shield = defensive.and_then(|stats| value_u32(stats, "energyShield"));
    snapshot.mana = defensive.and_then(|stats| value_u32(stats, "mana"));
    snapshot.spirit = defensive.and_then(|stats| value_u32(stats, "spirit"));
    snapshot.movement_speed = defensive.and_then(|stats| value_f32(stats, "movementSpeed"));
    snapshot.armour = defensive.and_then(|stats| value_u32(stats, "armour"));
    snapshot.evasion_rating = defensive.and_then(|stats| value_u32(stats, "evasionRating"));
    snapshot.evade_chance = defensive.and_then(|stats| value_f32(stats, "evadeChance"));
    snapshot.deflection_rating = defensive.and_then(|stats| value_u32(stats, "deflectionRating"));
    snapshot.deflect_chance = defensive.and_then(|stats| value_f32(stats, "deflectChance"));
    snapshot.attributes = BuildAttributes {
        strength: defensive.and_then(|stats| value_u32(stats, "strength")),
        dexterity: defensive.and_then(|stats| value_u32(stats, "dexterity")),
        intelligence: defensive.and_then(|stats| value_u32(stats, "intelligence")),
    };
    snapshot.charges = BuildCharges {
        endurance: defensive.and_then(|stats| value_u32(stats, "enduranceCharges")),
        frenzy: defensive.and_then(|stats| value_u32(stats, "frenzyCharges")),
        power: defensive.and_then(|stats| value_u32(stats, "powerCharges")),
    };
    snapshot.resistances = BuildResistances {
        fire: defensive.and_then(|stats| value_f32(stats, "fireResistance")),
        cold: defensive.and_then(|stats| value_f32(stats, "coldResistance")),
        lightning: defensive.and_then(|stats| value_f32(stats, "lightningResistance")),
        chaos: defensive.and_then(|stats| value_f32(stats, "chaosResistance")),
    };
    snapshot.physical_taken_as = defensive
        .and_then(|stats| stats.get("physicalTakenAs"))
        .map(|taken_as| {
            ["fire", "cold", "lightning", "chaos"]
                .iter()
                .filter_map(|key| value_f32(taken_as, key))
                .sum::<f32>()
        });
    snapshot.effective_health_pool = defensive
        .and_then(|stats| value_f64(stats, "effectiveHealthPool"))
        .map(format_compact_number);
    snapshot.max_hit = defensive.map(|stats| BuildMaxHit {
        physical: value_f64(stats, "physicalMaximumHitTaken").map(format_compact_number),
        fire: value_f64(stats, "fireMaximumHitTaken").map(format_compact_number),
        cold: value_f64(stats, "coldMaximumHitTaken").map(format_compact_number),
        lightning: value_f64(stats, "lightningMaximumHitTaken").map(format_compact_number),
        chaos: value_f64(stats, "chaosMaximumHitTaken").map(format_compact_number),
    });

    snapshot.keystones = collect_poe_ninja_named_array(character.get("keystones"));
    snapshot.main_skills = collect_poe_ninja_main_skills(character.get("skills"));
    snapshot.skill_dps = collect_poe_ninja_skill_dps(character.get("skills"));
    snapshot.equipped_uniques = collect_poe_ninja_unique_items(character.get("items"));
    snapshot.defensive_layers = infer_poe_ninja_defensive_layers(&snapshot);
    snapshot.recovery_systems = infer_poe_ninja_recovery_systems(character, defensive);

    let mut fingerprint = infer_build_fingerprint(&snapshot);
    fingerprint.confidence = "poe_ninja_snapshot".to_string();
    fingerprint.notes.push(format!(
        "Loaded computed build stats from PoE.ninja snapshot {} for {}.",
        snapshot_version.version, snapshot_version.name
    ));
    if value_string(character, "pathOfBuildingExport").is_some() {
        fingerprint
            .notes
            .push("PoE.ninja also exposed a Path of Building export; Reliquary used PoE.ninja's computed stats for display.".to_string());
    }

    Ok(BuildProfileImportResult {
        snapshot,
        fingerprint,
    })
}

pub fn snapshot_from_pob_text(
    input: &str,
    fetched_at_epoch_ms: u64,
) -> Result<BuildProfileImportResult, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("Paste a PoB export code or readable build text first.".to_string());
    }

    let (profile_text, decoded_pob) = decode_pob_payload(trimmed)
        .map(|decoded| (decoded, true))
        .unwrap_or_else(|| (trimmed.to_string(), false));
    let parsed_xml = looks_like_pob_xml(&profile_text);
    let mut snapshot = if parsed_xml {
        snapshot_from_pob_xml(&profile_text, fetched_at_epoch_ms)
    } else {
        snapshot_from_profile_text(
            BuildSnapshotSource::PobCode,
            &profile_text,
            fetched_at_epoch_ms,
        )
    };
    let mut fingerprint = infer_build_fingerprint(&snapshot);

    if decoded_pob && parsed_xml {
        fingerprint.notes.push(
            "Decoded compressed PoB XML and read supported Build, PlayerStat, and Gem fields. Blank values mean the export did not include that calculated stat."
                .to_string(),
        );
    } else if decoded_pob {
        fingerprint
            .notes
            .push("Decoded a compressed PoB payload and inferred the local hazard profile from readable build text.".to_string());
    } else {
        fingerprint.notes.push(
            "Could not decode this as compressed PoB; inferred the profile from pasted readable build text."
                .to_string(),
        );
    }

    if snapshot.character.is_none() {
        snapshot.character = Some("Imported build".to_string());
    }

    Ok(BuildProfileImportResult {
        snapshot,
        fingerprint,
    })
}

pub fn infer_build_fingerprint(snapshot: &BuildSnapshot) -> BuildFingerprint {
    let mut tags = Vec::new();
    let mut notes = Vec::new();

    let haystack = build_haystack(snapshot);

    if contains_any(&haystack, &["chaos inoculation"]) {
        push_tag(&mut tags, "chaos_inoculation");
        push_tag(&mut tags, "energy_shield_primary");
    }

    if snapshot.energy_shield.unwrap_or(0) >= snapshot.life.unwrap_or(0).saturating_mul(2)
        && snapshot.energy_shield.unwrap_or(0) > 0
    {
        push_tag(&mut tags, "energy_shield_primary");
    }

    if contains_any(
        &haystack,
        &[
            "minion", "summon", "skeletal", "skeleton", "zombie", "spectre",
        ],
    ) {
        push_tag(&mut tags, "minion_build");
    }

    if contains_any(&haystack, &["armour", "block", "stun threshold"]) {
        push_tag(&mut tags, "armour_stack");
    }

    if contains_any(&haystack, &["evasion", "acrobatics", "blind"]) {
        push_tag(&mut tags, "evasion_layered");
    }

    if contains_any(&haystack, &["flask", "charges"]) {
        push_tag(&mut tags, "flask_sustain");
    }

    if contains_any(
        &haystack,
        &[
            "ailment", "ignite", "shock", "freeze", "chill", "bleed", "poison",
        ],
    ) {
        push_tag(&mut tags, "ailment_sensitive");
    }

    if contains_any(
        &haystack,
        &[
            "regen",
            "regeneration",
            "recoup",
            "leech",
            "recharge",
            "recovery",
        ],
    ) {
        push_tag(&mut tags, "recovery_dependent");
    }

    if tags.is_empty() {
        push_tag(&mut tags, "life_based");
        notes.push(
            "No detailed build data was available; using the safe default profile.".to_string(),
        );
    }

    let recommended_profile_id = recommended_profile_for_tags(&tags).to_string();
    let confidence = if snapshot.class_name.is_some()
        || !snapshot.main_skills.is_empty()
        || !snapshot.keystones.is_empty()
    {
        "inferred".to_string()
    } else {
        "metadata_only".to_string()
    };

    BuildFingerprint {
        tags,
        recommended_profile_id,
        confidence,
        notes,
    }
}

fn empty_build_snapshot(source: BuildSnapshotSource, fetched_at_epoch_ms: u64) -> BuildSnapshot {
    BuildSnapshot {
        source,
        source_url: None,
        account: None,
        character: None,
        league: None,
        class_name: None,
        class_icon_url: None,
        ascendancy: None,
        level: None,
        life: None,
        energy_shield: None,
        mana: None,
        spirit: None,
        attributes: BuildAttributes::default(),
        charges: BuildCharges::default(),
        movement_speed: None,
        armour: None,
        evasion_rating: None,
        evade_chance: None,
        deflection_rating: None,
        deflect_chance: None,
        physical_taken_as: None,
        resistances: BuildResistances::default(),
        effective_health_pool: None,
        max_hit: None,
        keystones: Vec::new(),
        main_skills: Vec::new(),
        skill_dps: Vec::new(),
        defensive_layers: Vec::new(),
        equipped_uniques: Vec::new(),
        recovery_systems: Vec::new(),
        fetched_at_epoch_ms,
    }
}

fn poe_ninja_class_icon_url(class_name: &str) -> Option<String> {
    let mut slug = String::new();
    let mut previous_was_separator = false;

    for character in class_name.trim().chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
            previous_was_separator = false;
        } else if !previous_was_separator && !slug.is_empty() {
            slug.push('-');
            previous_was_separator = true;
        }
    }

    if slug.ends_with('-') {
        slug.pop();
    }

    if slug.is_empty() {
        None
    } else {
        Some(format!("https://assets.poe.ninja/poe2/classes/{slug}.webp"))
    }
}

fn parse_poe_ninja_character_url(url: &str) -> Result<PoeNinjaCharacterParts, String> {
    let trimmed = url.trim();
    let path = trimmed
        .strip_prefix("https://poe.ninja/")
        .or_else(|| trimmed.strip_prefix("https://www.poe.ninja/"))
        .or_else(|| trimmed.strip_prefix("http://poe.ninja/"))
        .or_else(|| trimmed.strip_prefix("http://www.poe.ninja/"))
        .ok_or_else(poe_ninja_url_error)?;
    let path = path.split(['?', '#']).next().unwrap_or(path);
    let segments: Vec<&str> = path
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();

    if segments.len() >= 6
        && segments[0] == "poe2"
        && segments[1] == "builds"
        && segments.get(3) == Some(&"character")
    {
        return Ok(PoeNinjaCharacterParts {
            league: Some(decode_url_segment(segments[2])?),
            account: decode_url_segment(segments[4])?,
            character: decode_url_segment(segments[5])?,
        });
    }

    if segments.len() < 5 || segments[0] != "poe2" || segments[1] != "profile" {
        return Err(poe_ninja_url_error());
    }

    let (account, league, character) = if segments.get(3) == Some(&"character") {
        if segments.len() < 5 {
            return Err(poe_ninja_url_error());
        }
        (segments[2], None, segments[4])
    } else {
        if segments.len() < 6 || segments.get(4) != Some(&"character") {
            return Err(poe_ninja_url_error());
        }
        (segments[2], Some(segments[3]), segments[5])
    };

    Ok(PoeNinjaCharacterParts {
        account: decode_url_segment(account)?,
        league: league.map(|value| {
            urlencoding::decode(value)
                .map(|decoded| decoded.to_string())
                .unwrap_or_else(|_| value.to_string())
        }),
        character: decode_url_segment(character)?,
    })
}

fn poe_ninja_url_error() -> String {
    "Paste a poe.ninja PoE2 character URL like https://poe.ninja/poe2/builds/league/character/account/name".to_string()
}

fn decode_url_segment(segment: &str) -> Result<String, String> {
    urlencoding::decode(segment)
        .map_err(|error| error.to_string())
        .map(|value| value.to_string())
}

fn poe_ninja_cache_key(parts: &PoeNinjaCharacterParts) -> String {
    format!(
        "{}::{}::{}",
        parts
            .league
            .as_deref()
            .unwrap_or_default()
            .to_ascii_lowercase(),
        parts.account.to_ascii_lowercase(),
        parts.character.to_ascii_lowercase()
    )
}

fn cached_poe_ninja_profile(
    cache_key: &str,
    now_epoch_ms: u64,
    allow_stale: bool,
) -> Option<BuildProfileImportResult> {
    let cache = POE_NINJA_PROFILE_CACHE.lock().ok()?;
    let cached = cache.get(cache_key)?;
    if allow_stale
        || now_epoch_ms.saturating_sub(cached.fetched_at_epoch_ms) <= POE_NINJA_PROFILE_CACHE_TTL_MS
    {
        return Some(cached.result.clone());
    }
    None
}

fn normalize_poe_ninja_league_key(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn value_string(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn value_u16(value: &Value, key: &str) -> Option<u16> {
    value_u64(value, key).and_then(|value| u16::try_from(value).ok())
}

fn value_u32(value: &Value, key: &str) -> Option<u32> {
    value_u64(value, key).and_then(|value| u32::try_from(value).ok())
}

fn value_u64(value: &Value, key: &str) -> Option<u64> {
    value.get(key).and_then(|field| {
        field
            .as_u64()
            .or_else(|| field.as_f64().map(|value| value as u64))
    })
}

fn value_f32(value: &Value, key: &str) -> Option<f32> {
    value_f64(value, key).map(|value| value as f32)
}

fn value_f64(value: &Value, key: &str) -> Option<f64> {
    value.get(key).and_then(|field| {
        field.as_f64().or_else(|| {
            field
                .as_str()
                .and_then(|text| text.replace(',', "").parse::<f64>().ok())
        })
    })
}

fn collect_poe_ninja_named_array(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| value_string(item, "name"))
                .fold(Vec::new(), |mut values, name| {
                    push_tag(&mut values, &clean_bracketed_markup(&name));
                    values
                })
        })
        .unwrap_or_default()
}

fn collect_poe_ninja_main_skills(value: Option<&Value>) -> Vec<String> {
    let mut skills = Vec::new();
    if let Some(skill_groups) = value.and_then(Value::as_array) {
        for skill_group in skill_groups {
            if let Some(gems) = skill_group.get("allGems").and_then(Value::as_array) {
                if let Some(name) = gems.first().and_then(|gem| value_string(gem, "name")) {
                    push_tag(&mut skills, &clean_bracketed_markup(&name));
                }
            }
        }
    }
    skills
}

fn collect_poe_ninja_skill_dps(value: Option<&Value>) -> Vec<BuildSkillDps> {
    let mut rows = Vec::new();
    if let Some(skill_groups) = value.and_then(Value::as_array) {
        for skill_group in skill_groups {
            if let Some(dps_entries) = skill_group.get("dps").and_then(Value::as_array) {
                for dps_entry in dps_entries {
                    let Some(name) = value_string(dps_entry, "name") else {
                        continue;
                    };
                    let dps = value_f64(dps_entry, "dps").map(format_compact_number);
                    rows.push(BuildSkillDps {
                        name: clean_bracketed_markup(&name),
                        dps,
                    });
                }
            }
        }
    }
    rows.sort_by(|left, right| {
        let left_value = left
            .dps
            .as_deref()
            .and_then(parse_compact_number)
            .unwrap_or(0.0);
        let right_value = right
            .dps
            .as_deref()
            .and_then(parse_compact_number)
            .unwrap_or(0.0);
        right_value
            .partial_cmp(&left_value)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    rows
}

fn collect_poe_ninja_unique_items(value: Option<&Value>) -> Vec<String> {
    let mut uniques = Vec::new();
    if let Some(items) = value.and_then(Value::as_array) {
        for item in items {
            let item_data = item.get("itemData").unwrap_or(item);
            let rarity = value_string(item_data, "rarity")
                .or_else(|| value_string(item_data, "frameTypeId"))
                .unwrap_or_default();
            if !rarity.eq_ignore_ascii_case("unique") {
                continue;
            }
            if let Some(name) = value_string(item_data, "name") {
                push_tag(&mut uniques, &clean_bracketed_markup(&name));
            } else if let Some(type_line) = value_string(item_data, "typeLine") {
                push_tag(&mut uniques, &clean_bracketed_markup(&type_line));
            }
        }
    }
    uniques
}

fn infer_poe_ninja_defensive_layers(snapshot: &BuildSnapshot) -> Vec<String> {
    let mut layers = Vec::new();
    if snapshot.armour.unwrap_or(0) > 0 {
        push_tag(&mut layers, "Armour");
    }
    if snapshot.evasion_rating.unwrap_or(0) > 0 {
        push_tag(&mut layers, "Evasion");
    }
    if snapshot.energy_shield.unwrap_or(0) > 0 {
        push_tag(&mut layers, "Energy Shield");
    }
    if snapshot.deflection_rating.unwrap_or(0) > 0 || snapshot.deflect_chance.unwrap_or(0.0) > 0.0 {
        push_tag(&mut layers, "Deflection");
    }
    for keystone in &snapshot.keystones {
        push_tag(&mut layers, keystone);
    }
    layers
}

fn infer_poe_ninja_recovery_systems(character: &Value, defensive: Option<&Value>) -> Vec<String> {
    let mut systems = Vec::new();
    if defensive
        .and_then(|stats| value_f32(stats, "lifeRegen"))
        .unwrap_or(0.0)
        > 0.0
    {
        push_tag(&mut systems, "Life Regeneration");
    }
    let haystack = [
        character
            .get("items")
            .map(Value::to_string)
            .unwrap_or_default(),
        character
            .get("skills")
            .map(Value::to_string)
            .unwrap_or_default(),
        character
            .get("keystones")
            .map(Value::to_string)
            .unwrap_or_default(),
    ]
    .join(" ")
    .to_ascii_lowercase();
    for label in [
        "Recoup",
        "Leech",
        "Flask",
        "Recharge",
        "Regeneration",
        "Recovery",
    ] {
        if haystack.contains(&label.to_ascii_lowercase()) {
            push_tag(&mut systems, label);
        }
    }
    systems
}

fn clean_bracketed_markup(value: &str) -> String {
    let mut cleaned = String::with_capacity(value.len());
    let mut inside_tag = false;
    let mut tag_text = String::new();
    for character in value.chars() {
        match character {
            '[' => {
                inside_tag = true;
                tag_text.clear();
            }
            ']' if inside_tag => {
                inside_tag = false;
                let label = tag_text
                    .split('|')
                    .next_back()
                    .unwrap_or(tag_text.as_str())
                    .trim();
                cleaned.push_str(label);
            }
            _ if inside_tag => tag_text.push(character),
            _ => cleaned.push(character),
        }
    }
    if inside_tag {
        cleaned.push_str(&tag_text);
    }
    cleaned.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn format_compact_number(value: f64) -> String {
    if value >= 2_147_000_000.0 {
        return "2.1B".to_string();
    }
    if value >= 1_000_000_000.0 {
        return format!("{:.1}B", value / 1_000_000_000.0);
    }
    if value >= 1_000_000.0 {
        return trim_trailing_decimal(value / 1_000_000.0, "M");
    }
    if value >= 1_000.0 {
        return trim_trailing_decimal(value / 1_000.0, "k");
    }
    trim_trailing_decimal(value, "")
}

fn trim_trailing_decimal(value: f64, suffix: &str) -> String {
    let mut formatted = format!("{value:.1}");
    if formatted.ends_with(".0") {
        formatted.truncate(formatted.len().saturating_sub(2));
    }
    format!("{formatted}{suffix}")
}

fn parse_compact_number(value: &str) -> Option<f64> {
    let trimmed = value.trim();
    let (number, multiplier) = match trimmed.chars().last()? {
        'k' | 'K' => (&trimmed[..trimmed.len().saturating_sub(1)], 1_000.0),
        'm' | 'M' => (&trimmed[..trimmed.len().saturating_sub(1)], 1_000_000.0),
        'b' | 'B' => (&trimmed[..trimmed.len().saturating_sub(1)], 1_000_000_000.0),
        _ => (trimmed, 1.0),
    };
    number
        .replace(',', "")
        .parse::<f64>()
        .ok()
        .map(|value| value * multiplier)
}

fn build_haystack(snapshot: &BuildSnapshot) -> String {
    [
        snapshot.character.as_deref().unwrap_or(""),
        snapshot.class_name.as_deref().unwrap_or(""),
        snapshot.ascendancy.as_deref().unwrap_or(""),
        &snapshot.keystones.join(" "),
        &snapshot.main_skills.join(" "),
        &snapshot.defensive_layers.join(" "),
        &snapshot.equipped_uniques.join(" "),
        &snapshot.recovery_systems.join(" "),
    ]
    .join(" ")
    .to_ascii_lowercase()
}

fn snapshot_from_profile_text(
    source: BuildSnapshotSource,
    text: &str,
    fetched_at_epoch_ms: u64,
) -> BuildSnapshot {
    let haystack = text.to_ascii_lowercase();
    let class_name = extract_known_label(
        &haystack,
        &[
            "Warrior",
            "Mercenary",
            "Witch",
            "Sorceress",
            "Ranger",
            "Monk",
            "Huntress",
            "Druid",
        ],
    )
    .or_else(|| extract_text_field(text, &[r#"(?i)\bclass(?:name)?["'\s:=]+([A-Za-z ]{3,32})"#]));
    let class_icon_url = class_name.as_deref().and_then(poe_ninja_class_icon_url);

    BuildSnapshot {
        source,
        source_url: None,
        account: None,
        character: extract_text_field(
            text,
            &[
                r#"(?i)\bcharacter(?:name)?["'\s:=]+([A-Za-z0-9 _#'\-]{2,48})"#,
                r#"(?i)\bbuild(?:name)?["'\s:=]+([A-Za-z0-9 _#'\-]{2,48})"#,
            ],
        ),
        league: extract_text_field(text, &[r#"(?i)\bleague["'\s:=]+([A-Za-z0-9 _'\-]{2,48})"#]),
        class_name,
        class_icon_url,
        ascendancy: extract_known_label(
            &haystack,
            &[
                "Titan",
                "Warbringer",
                "Witchhunter",
                "Gemling Legionnaire",
                "Blood Mage",
                "Infernalist",
                "Stormweaver",
                "Chronomancer",
                "Deadeye",
                "Pathfinder",
                "Invoker",
                "Acolyte of Chayula",
            ],
        )
        .or_else(|| {
            extract_text_field(
                text,
                &[r#"(?i)\bascend(?:ancy|className)?["'\s:=]+([A-Za-z ]{3,40})"#],
            )
        }),
        level: extract_number(text, &[r#"(?i)\blevel["'\s:=]+(\d{1,3})"#])
            .and_then(|value| u16::try_from(value).ok()),
        life: extract_number(text, &[r#"(?i)\blife["'\s:=]+([0-9,]{1,8})"#]),
        energy_shield: extract_number(
            text,
            &[
                r#"(?i)\benergy shield["'\s:=]+([0-9,]{1,8})"#,
                r#"(?i)\bes["'\s:=]+([0-9,]{1,8})"#,
            ],
        ),
        mana: extract_number(text, &[r#"(?i)\bmana["'\s:=]+([0-9,]{1,8})"#]),
        spirit: extract_number(text, &[r#"(?i)\bspirit["'\s:=]+([0-9,]{1,8})"#]),
        attributes: BuildAttributes {
            strength: extract_number(text, &[r#"(?i)\b(?:strength|str)["'\s:=]+([0-9,]{1,5})"#]),
            dexterity: extract_number(text, &[r#"(?i)\b(?:dexterity|dex)["'\s:=]+([0-9,]{1,5})"#]),
            intelligence: extract_number(
                text,
                &[r#"(?i)\b(?:intelligence|int)["'\s:=]+([0-9,]{1,5})"#],
            ),
        },
        charges: BuildCharges {
            endurance: extract_number(
                text,
                &[r#"(?i)\b(?:endurance charges?|endurance)["'\s:=]+([0-9,]{1,3})"#],
            ),
            frenzy: extract_number(
                text,
                &[r#"(?i)\b(?:frenzy charges?|frenzy)["'\s:=]+([0-9,]{1,3})"#],
            ),
            power: extract_number(
                text,
                &[r#"(?i)\b(?:power charges?|power)["'\s:=]+([0-9,]{1,3})"#],
            ),
        },
        movement_speed: extract_decimal(
            text,
            &[r#"(?i)\bmovement speed["'\s:=]+([0-9,.]{1,8})%?"#],
        ),
        armour: extract_number(text, &[r#"(?i)\barmou?r["'\s:=]+([0-9,]{1,8})"#]),
        evasion_rating: extract_number(
            text,
            &[r#"(?i)\bevasion(?: rating)?["'\s:=]+([0-9,]{1,8})"#],
        ),
        evade_chance: extract_decimal(text, &[r#"(?i)\bevade chance["'\s:=]+([0-9,.]{1,8})%?"#]),
        deflection_rating: extract_number(
            text,
            &[r#"(?i)\bdeflection(?: rating)?["'\s:=]+([0-9,]{1,8})"#],
        ),
        deflect_chance: extract_decimal(
            text,
            &[r#"(?i)\bdeflect chance["'\s:=]+([0-9,.]{1,8})%?"#],
        ),
        physical_taken_as: extract_decimal(
            text,
            &[r#"(?i)\bphysical taken as["'\s:=]+([0-9,.]{1,8})%?"#],
        ),
        resistances: BuildResistances {
            fire: extract_resistance(text, &["fire", "f"]),
            cold: extract_resistance(text, &["cold", "c"]),
            lightning: extract_resistance(text, &["lightning", "light", "l"]),
            chaos: extract_resistance(text, &["chaos", "ch"]),
        },
        effective_health_pool: extract_text_field(
            text,
            &[r#"(?i)\b(?:effective health pool|ehp)["'\s:=]+([0-9,.kKmMbB]+)"#],
        ),
        max_hit: Some(BuildMaxHit {
            physical: extract_text_field(
                text,
                &[r#"(?i)\b(?:physical max hit|max hit physical)["'\s:=]+([0-9,.kKmMbB]+)"#],
            ),
            fire: extract_text_field(
                text,
                &[r#"(?i)\b(?:fire max hit|max hit fire)["'\s:=]+([0-9,.kKmMbB]+)"#],
            ),
            cold: extract_text_field(
                text,
                &[r#"(?i)\b(?:cold max hit|max hit cold)["'\s:=]+([0-9,.kKmMbB]+)"#],
            ),
            lightning: extract_text_field(
                text,
                &[r#"(?i)\b(?:lightning max hit|max hit lightning)["'\s:=]+([0-9,.kKmMbB]+)"#],
            ),
            chaos: extract_text_field(
                text,
                &[r#"(?i)\b(?:chaos max hit|max hit chaos)["'\s:=]+([0-9,.kKmMbB]+)"#],
            ),
        }),
        keystones: collect_known_labels(
            &haystack,
            &[
                "Chaos Inoculation",
                "Eldritch Battery",
                "Mind Over Matter",
                "Acrobatics",
                "Resolute Technique",
                "Blood Magic",
                "Ghost Reaver",
            ],
        ),
        main_skills: collect_known_labels(
            &haystack,
            &[
                "Lightning Arrow",
                "Gas Arrow",
                "Ice Strike",
                "Tempest Flurry",
                "Hammer of the Gods",
                "Summon Skeletal Sniper",
                "Skeletal Sniper",
                "Raging Spirits",
                "Spark",
                "Ball Lightning",
                "Comet",
                "Bonestorm",
                "Detonate Dead",
                "Earthquake",
                "Whirling Slash",
                "Flicker Strike",
                "Frostbolt",
            ],
        ),
        skill_dps: collect_skill_dps(text),
        defensive_layers: collect_known_labels(
            &haystack,
            &[
                "Armour",
                "Evasion",
                "Energy Shield",
                "Block",
                "Spell Block",
                "Blind",
                "Stun Threshold",
                "Mind Over Matter",
                "Chaos Inoculation",
                "Dodge",
            ],
        ),
        equipped_uniques: collect_unique_item_names(text),
        recovery_systems: collect_known_labels(
            &haystack,
            &[
                "Life Regeneration",
                "Energy Shield Recharge",
                "Recoup",
                "Leech",
                "Flask Charges",
                "Recovery",
                "Regeneration",
            ],
        ),
        fetched_at_epoch_ms,
    }
}

fn decode_pob_payload(input: &str) -> Option<String> {
    let candidate = input
        .lines()
        .map(str::trim)
        .find(|line| line.len() > 24 && line.chars().all(is_base64ish))
        .unwrap_or(input.trim());
    let cleaned: String = candidate
        .chars()
        .filter(|character| is_base64ish(*character))
        .collect();
    if cleaned.len() < 24 {
        return None;
    }

    let decoded = URL_SAFE_NO_PAD
        .decode(cleaned.as_bytes())
        .or_else(|_| URL_SAFE.decode(cleaned.as_bytes()))
        .or_else(|_| BASE64_STANDARD.decode(cleaned.as_bytes()))
        .ok()?;

    let mut inflated = String::new();
    if ZlibDecoder::new(decoded.as_slice())
        .read_to_string(&mut inflated)
        .is_ok()
        && !inflated.trim().is_empty()
    {
        return Some(inflated);
    }

    String::from_utf8(decoded)
        .ok()
        .filter(|value| !value.trim().is_empty())
}

fn is_base64ish(character: char) -> bool {
    character.is_ascii_alphanumeric() || matches!(character, '+' | '/' | '-' | '_' | '=')
}

fn extract_text_field(text: &str, patterns: &[&str]) -> Option<String> {
    patterns.iter().find_map(|pattern| {
        Regex::new(pattern)
            .ok()
            .and_then(|regex| regex.captures(text))
            .and_then(|captures| captures.get(1))
            .map(|match_value| clean_extracted_label(match_value.as_str()))
            .filter(|value| !value.is_empty())
    })
}

fn extract_number(text: &str, patterns: &[&str]) -> Option<u32> {
    extract_text_field(text, patterns).and_then(|value| {
        value
            .chars()
            .filter(|character| character.is_ascii_digit())
            .collect::<String>()
            .parse()
            .ok()
    })
}

fn extract_decimal(text: &str, patterns: &[&str]) -> Option<f32> {
    extract_text_field(text, patterns).and_then(|value| {
        value
            .replace(',', "")
            .trim_end_matches('%')
            .parse::<f32>()
            .ok()
    })
}

fn extract_resistance(text: &str, labels: &[&str]) -> Option<f32> {
    labels.iter().find_map(|label| {
        let pattern = format!(
            r#"(?i)\b{}(?: resistance| res)?["'\s:=]+(-?[0-9,.]{{1,8}})%?"#,
            regex::escape(label)
        );
        extract_decimal(text, &[&pattern])
    })
}

fn extract_known_label(haystack: &str, labels: &[&str]) -> Option<String> {
    labels
        .iter()
        .find(|label| haystack.contains(&label.to_ascii_lowercase()))
        .map(|label| (*label).to_string())
}

fn collect_known_labels(haystack: &str, labels: &[&str]) -> Vec<String> {
    let mut values = Vec::new();
    for label in labels {
        if haystack.contains(&label.to_ascii_lowercase()) {
            push_tag(&mut values, label);
        }
    }
    values
}

fn collect_unique_item_names(text: &str) -> Vec<String> {
    let mut values = Vec::new();
    let lines: Vec<&str> = text.lines().collect();
    for (index, line) in lines.iter().enumerate() {
        if line.trim().eq_ignore_ascii_case("rarity: unique") {
            if let Some(name) = lines
                .get(index + 1)
                .map(|value| clean_extracted_label(value))
            {
                if !name.is_empty() {
                    push_tag(&mut values, &name);
                }
            }
        }
    }
    values
}

fn collect_skill_dps(text: &str) -> Vec<BuildSkillDps> {
    let mut values = Vec::new();
    let Some(regex) = Regex::new(
        r#"(?i)^\s*(?:skill\s*)?([A-Za-z][A-Za-z '\-]{2,32}?)\s+(?:dps|damage per second)["'\s:=]+([0-9,.]+[kKmMbB]?)\s*$"#,
    )
    .ok()
    else {
        return values;
    };

    for line in text.lines() {
        let Some(captures) = regex.captures(line) else {
            continue;
        };
        let Some(name) = captures
            .get(1)
            .map(|value| clean_extracted_label(value.as_str()))
        else {
            continue;
        };
        let Some(dps) = captures
            .get(2)
            .map(|value| clean_extracted_label(value.as_str()))
        else {
            continue;
        };
        if name.len() < 3 || name.eq_ignore_ascii_case("level") {
            continue;
        }
        if !values
            .iter()
            .any(|entry: &BuildSkillDps| entry.name.eq_ignore_ascii_case(&name))
        {
            values.push(BuildSkillDps {
                name,
                dps: Some(dps),
            });
        }
    }

    values.truncate(6);
    values
}

fn looks_like_pob_xml(text: &str) -> bool {
    let trimmed = text.trim_start();
    trimmed.starts_with("<PathOfBuilding") || trimmed.contains("<PathOfBuilding")
}

fn snapshot_from_pob_xml(xml: &str, fetched_at_epoch_ms: u64) -> BuildSnapshot {
    let mut snapshot = empty_build_snapshot(BuildSnapshotSource::PobCode, fetched_at_epoch_ms);
    let haystack = xml.to_ascii_lowercase();

    if let Some(build_attrs) = first_xml_tag_attrs(xml, "Build") {
        snapshot.level = xml_attr(&build_attrs, "level")
            .and_then(|value| parse_u32_stat(&value))
            .and_then(|value| u16::try_from(value).ok());
        snapshot.class_name = xml_attr(&build_attrs, "className");
        snapshot.class_icon_url = snapshot
            .class_name
            .as_deref()
            .and_then(poe_ninja_class_icon_url);
        snapshot.ascendancy = xml_attr(&build_attrs, "ascendClassName")
            .or_else(|| xml_attr(&build_attrs, "ascendancyName"));
    }

    for player_stat_attrs in xml_tag_attrs(xml, "PlayerStat") {
        let Some(stat) = xml_attr(&player_stat_attrs, "stat") else {
            continue;
        };
        let Some(value) = xml_attr(&player_stat_attrs, "value")
            .or_else(|| xml_attr(&player_stat_attrs, "output"))
        else {
            continue;
        };
        apply_pob_player_stat(&mut snapshot, &stat, &value);
    }

    snapshot.keystones = collect_pob_xml_keystones(xml);
    snapshot.main_skills = collect_pob_xml_skills(xml);
    if snapshot.main_skills.is_empty() {
        snapshot.main_skills = collect_known_labels(
            &haystack,
            &[
                "Lightning Arrow",
                "Gas Arrow",
                "Ice Strike",
                "Tempest Flurry",
                "Hammer of the Gods",
                "Summon Skeletal Sniper",
                "Skeletal Sniper",
                "Raging Spirits",
                "Spark",
                "Ball Lightning",
                "Comet",
                "Bonestorm",
                "Detonate Dead",
                "Earthquake",
                "Whirling Slash",
                "Flicker Strike",
                "Frostbolt",
            ],
        );
    }
    snapshot.defensive_layers = collect_known_labels(
        &haystack,
        &[
            "Armour",
            "Evasion",
            "Energy Shield",
            "Block",
            "Spell Block",
            "Blind",
            "Stun Threshold",
            "Mind Over Matter",
            "Chaos Inoculation",
            "Dodge",
        ],
    );
    snapshot.recovery_systems = collect_known_labels(
        &haystack,
        &[
            "Life Regeneration",
            "Energy Shield Recharge",
            "Recoup",
            "Leech",
            "Flask Charges",
            "Recovery",
            "Regeneration",
        ],
    );

    snapshot
}

fn apply_pob_player_stat(snapshot: &mut BuildSnapshot, stat: &str, value: &str) {
    let key = normalize_pob_stat_key(stat);
    match key.as_str() {
        "life" | "totallife" | "maximumlife" | "lifemaximum" => {
            snapshot.life = parse_u32_stat(value)
        }
        "energyshield" | "totalenergyshield" | "maximumenergyshield" | "es" => {
            snapshot.energy_shield = parse_u32_stat(value)
        }
        "mana" | "totalmana" | "maximummana" => snapshot.mana = parse_u32_stat(value),
        "spirit" | "totalspirit" | "maximumspirit" => snapshot.spirit = parse_u32_stat(value),
        "strength" | "str" => snapshot.attributes.strength = parse_u32_stat(value),
        "dexterity" | "dex" => snapshot.attributes.dexterity = parse_u32_stat(value),
        "intelligence" | "int" => snapshot.attributes.intelligence = parse_u32_stat(value),
        "endurancecharges" | "endurancecharge" => {
            snapshot.charges.endurance = parse_u32_stat(value)
        }
        "frenzycharges" | "frenzycharge" => snapshot.charges.frenzy = parse_u32_stat(value),
        "powercharges" | "powercharge" => snapshot.charges.power = parse_u32_stat(value),
        "movementspeed" | "movementspeedmod" | "movementspeedmodifier" => {
            snapshot.movement_speed = parse_f32_stat(value)
        }
        "armour" | "armor" | "totalarmour" | "totalarmor" => {
            snapshot.armour = parse_u32_stat(value)
        }
        "evasion" | "evasionrating" | "totalevasion" => {
            snapshot.evasion_rating = parse_u32_stat(value)
        }
        "evadechance" | "chanceevade" => snapshot.evade_chance = parse_f32_stat(value),
        "deflection" | "deflectionrating" => snapshot.deflection_rating = parse_u32_stat(value),
        "deflectchance" | "chancedeflect" => snapshot.deflect_chance = parse_f32_stat(value),
        "physicaltakenas" | "physicaldamagetakenas" => {
            snapshot.physical_taken_as = parse_f32_stat(value)
        }
        "fireresist" | "fireresistance" | "firemaximumresistance" => {
            snapshot.resistances.fire = parse_f32_stat(value)
        }
        "coldresist" | "coldresistance" | "coldmaximumresistance" => {
            snapshot.resistances.cold = parse_f32_stat(value)
        }
        "lightningresist" | "lightningresistance" | "lightningmaximumresistance" => {
            snapshot.resistances.lightning = parse_f32_stat(value)
        }
        "chaosresist" | "chaosresistance" | "chaosmaximumresistance" => {
            snapshot.resistances.chaos = parse_f32_stat(value)
        }
        "effectivehealthpool" | "ehp" => {
            snapshot.effective_health_pool = Some(clean_extracted_label(value))
        }
        "physicalmaxhit" | "maxhitphysical" => {
            snapshot
                .max_hit
                .get_or_insert_with(BuildMaxHit::default)
                .physical = Some(clean_extracted_label(value))
        }
        "firemaxhit" | "maxhitfire" => {
            snapshot
                .max_hit
                .get_or_insert_with(BuildMaxHit::default)
                .fire = Some(clean_extracted_label(value))
        }
        "coldmaxhit" | "maxhitcold" => {
            snapshot
                .max_hit
                .get_or_insert_with(BuildMaxHit::default)
                .cold = Some(clean_extracted_label(value))
        }
        "lightningmaxhit" | "maxhitlightning" => {
            snapshot
                .max_hit
                .get_or_insert_with(BuildMaxHit::default)
                .lightning = Some(clean_extracted_label(value))
        }
        "chaosmaxhit" | "maxhitchaos" => {
            snapshot
                .max_hit
                .get_or_insert_with(BuildMaxHit::default)
                .chaos = Some(clean_extracted_label(value))
        }
        _ => {}
    }
}

fn first_xml_tag_attrs(xml: &str, tag: &str) -> Option<String> {
    xml_tag_attrs(xml, tag).into_iter().next()
}

fn xml_tag_attrs(xml: &str, tag: &str) -> Vec<String> {
    let pattern = format!(r#"(?is)<{}\b([^>]*)>"#, regex::escape(tag));
    let Some(regex) = Regex::new(&pattern).ok() else {
        return Vec::new();
    };
    regex
        .captures_iter(xml)
        .filter_map(|captures| captures.get(1).map(|value| value.as_str().to_string()))
        .collect()
}

fn xml_attr(attrs: &str, name: &str) -> Option<String> {
    let pattern = format!(
        r#"(?is)\b{}\s*=\s*(?:"([^"]*)"|'([^']*)')"#,
        regex::escape(name)
    );
    Regex::new(&pattern)
        .ok()
        .and_then(|regex| regex.captures(attrs))
        .and_then(|captures| captures.get(1).or_else(|| captures.get(2)))
        .map(|value| decode_xml_entities(value.as_str()))
        .map(|value| clean_extracted_label(&value))
        .filter(|value| !value.is_empty())
}

fn decode_xml_entities(value: &str) -> String {
    value
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
}

fn normalize_pob_stat_key(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .collect::<String>()
        .to_ascii_lowercase()
}

fn parse_u32_stat(value: &str) -> Option<u32> {
    parse_f32_stat(value).and_then(|number| {
        if number.is_finite() && number >= 0.0 {
            Some(number.round() as u32)
        } else {
            None
        }
    })
}

fn parse_f32_stat(value: &str) -> Option<f32> {
    value
        .trim()
        .trim_end_matches('%')
        .replace(',', "")
        .parse::<f32>()
        .ok()
}

fn collect_pob_xml_keystones(xml: &str) -> Vec<String> {
    let mut values = Vec::new();
    let known = [
        "Chaos Inoculation",
        "Eldritch Battery",
        "Mind Over Matter",
        "Acrobatics",
        "Resolute Technique",
        "Blood Magic",
        "Ghost Reaver",
    ];
    for attrs in xml_tag_attrs(xml, "Node") {
        let Some(name) = xml_attr(&attrs, "name") else {
            continue;
        };
        if known.iter().any(|label| label.eq_ignore_ascii_case(&name)) {
            push_tag(&mut values, &name);
        }
    }
    values
}

fn collect_pob_xml_skills(xml: &str) -> Vec<String> {
    let mut values = Vec::new();
    for attrs in xml_tag_attrs(xml, "Gem") {
        for attr in ["nameSpec", "name", "skillId"] {
            let Some(name) = xml_attr(&attrs, attr) else {
                continue;
            };
            if is_usable_pob_skill_name(&name) {
                push_tag(&mut values, &name);
                break;
            }
        }
    }
    values.truncate(6);
    values
}

fn is_usable_pob_skill_name(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    value.len() >= 3
        && !lower.contains("support")
        && !lower.starts_with("meta ")
        && !lower.starts_with("skill ")
}

fn clean_extracted_label(value: &str) -> String {
    value
        .trim_matches(|character: char| {
            character.is_whitespace() || matches!(character, '"' | '\'' | '=' | ':' | '/')
        })
        .split(['<', '>', '\r', '\n'])
        .next()
        .unwrap_or("")
        .trim()
        .to_string()
}

fn contains_any(haystack: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| haystack.contains(needle))
}

fn push_tag(tags: &mut Vec<String>, tag: &str) {
    if !tags.iter().any(|existing| existing == tag) {
        tags.push(tag.to_string());
    }
}

fn recommended_profile_for_tags(tags: &[String]) -> &'static str {
    if tags
        .iter()
        .any(|tag| tag == "energy_shield_primary" || tag == "chaos_inoculation")
    {
        return "energy_shield_recovery";
    }
    if tags.iter().any(|tag| tag == "minion_build") {
        return "minion";
    }
    if tags.iter().any(|tag| tag == "flask_sustain") {
        return "flask_sustain";
    }
    if tags.iter().any(|tag| tag == "armour_stack") {
        return "armour";
    }
    if tags.iter().any(|tag| tag == "evasion_layered") {
        return "evasion";
    }
    "general_safe_mapping"
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::{write::ZlibEncoder, Compression};
    use serde_json::json;
    use std::io::Write;

    #[test]
    fn parses_poe_ninja_character_url_with_league() {
        let result = snapshot_from_poe_ninja_url(
            "https://poe.ninja/poe2/profile/Phars-6205/runesofaldur/character/Pharsbeyblade",
            42,
        )
        .unwrap();

        assert_eq!(result.snapshot.account.as_deref(), Some("Phars-6205"));
        assert_eq!(result.snapshot.league.as_deref(), Some("runesofaldur"));
        assert_eq!(result.snapshot.character.as_deref(), Some("Pharsbeyblade"));
        assert_eq!(result.snapshot.fetched_at_epoch_ms, 42);
        assert_eq!(
            result.fingerprint.recommended_profile_id,
            "general_safe_mapping"
        );
        assert_eq!(result.fingerprint.confidence, "metadata_only");
    }

    #[test]
    fn parses_poe_ninja_character_url_without_league() {
        let result = snapshot_from_poe_ninja_url(
            "https://poe.ninja/poe2/profile/DistributedAutomaton-5739/character/CrystalController",
            42,
        )
        .unwrap();

        assert_eq!(
            result.snapshot.account.as_deref(),
            Some("DistributedAutomaton-5739")
        );
        assert_eq!(result.snapshot.league, None);
        assert_eq!(
            result.snapshot.character.as_deref(),
            Some("CrystalController")
        );
    }

    #[test]
    fn parses_current_poe_ninja_build_character_urls() {
        let result = snapshot_from_poe_ninja_url(
            "https://poe.ninja/poe2/builds/runesofaldur/character/Phars-6205/Pharsbeyblade",
            42,
        )
        .unwrap();

        assert_eq!(result.snapshot.account.as_deref(), Some("Phars-6205"));
        assert_eq!(result.snapshot.league.as_deref(), Some("runesofaldur"));
        assert_eq!(result.snapshot.character.as_deref(), Some("Pharsbeyblade"));
    }

    #[test]
    fn resolves_poe_ninja_snapshot_versions_by_slug_or_display_name() {
        let state = PoeNinjaIndexStateResponse {
            snapshot_versions: vec![
                PoeNinjaSnapshotVersion {
                    url: "standard".to_string(),
                    name: "Standard".to_string(),
                    version: "std-version".to_string(),
                    snapshot_name: "standard".to_string(),
                },
                PoeNinjaSnapshotVersion {
                    url: "runesofaldur".to_string(),
                    name: "Runes of Aldur".to_string(),
                    version: "league-version".to_string(),
                    snapshot_name: "runes-of-aldur".to_string(),
                },
            ],
        };
        let parts = PoeNinjaCharacterParts {
            account: "Phars-6205".to_string(),
            league: Some("Runes of Aldur".to_string()),
            character: "Pharsbeyblade".to_string(),
        };

        let snapshot = resolve_poe_ninja_snapshot_version(&parts, &state).unwrap();

        assert_eq!(snapshot.version, "league-version");
        assert_eq!(snapshot.snapshot_name, "runes-of-aldur");
    }

    #[test]
    fn maps_poe_ninja_character_json_to_profile_snapshot() {
        let parts = PoeNinjaCharacterParts {
            account: "Phars-6205".to_string(),
            league: Some("runesofaldur".to_string()),
            character: "Pharsbeyblade".to_string(),
        };
        let snapshot_version = PoeNinjaSnapshotVersion {
            url: "runesofaldur".to_string(),
            name: "Runes of Aldur".to_string(),
            version: "1118-20260608-19403".to_string(),
            snapshot_name: "runes-of-aldur".to_string(),
        };
        let payload = json!({
            "account": "Phars-6205",
            "name": "Pharsbeyblade",
            "league": "Runes of Aldur",
            "class": "Martial Artist",
            "level": 94,
            "pathOfBuildingExport": "eNrt...",
            "defensiveStats": {
                "life": 1,
                "energyShield": 3744,
                "mana": 1101,
                "spirit": 156,
                "movementSpeed": 128,
                "evasionRating": 14057,
                "evadeChance": 59,
                "armour": 0,
                "deflectionRating": 2530,
                "deflectChance": 19,
                "strength": 52,
                "dexterity": 115,
                "intelligence": 193,
                "enduranceCharges": 3,
                "frenzyCharges": 3,
                "powerCharges": 5,
                "effectiveHealthPool": 24278,
                "physicalMaximumHitTaken": 3891,
                "fireMaximumHitTaken": 13896,
                "coldMaximumHitTaken": 13417,
                "lightningMaximumHitTaken": 13896,
                "chaosMaximumHitTaken": 2147483647u64,
                "fireResistance": 75,
                "coldResistance": 74,
                "lightningResistance": 75,
                "chaosResistance": 100,
                "physicalTakenAs": {
                    "physical": 100,
                    "fire": 0,
                    "cold": 0,
                    "lightning": 0,
                    "chaos": 0
                }
            },
            "keystones": [{ "name": "Chaos Inoculation" }],
            "skills": [
                {
                    "allGems": [{ "name": "Rend" }],
                    "dps": [{ "name": "Rend", "dps": 371 }]
                },
                {
                    "allGems": [{ "name": "Hollow Focus" }],
                    "dps": [{ "name": "Hollow Focus", "dps": 28 }]
                }
            ],
            "items": [
                { "itemData": { "rarity": "Unique", "name": "Mageblood", "typeLine": "Utility Belt" } },
                { "itemData": { "rarity": "Rare", "name": "Cataclysm Cloak", "typeLine": "Sleek Jacket" } }
            ]
        });

        let result = snapshot_from_poe_ninja_character_json(
            "https://poe.ninja/poe2/builds/runesofaldur/character/Phars-6205/Pharsbeyblade",
            &parts,
            &snapshot_version,
            &payload,
            42,
        )
        .unwrap();

        assert_eq!(
            result.snapshot.class_name.as_deref(),
            Some("Martial Artist")
        );
        assert_eq!(
            result.snapshot.class_icon_url.as_deref(),
            Some("https://assets.poe.ninja/poe2/classes/martial-artist.webp")
        );
        assert_eq!(result.snapshot.level, Some(94));
        assert_eq!(result.snapshot.life, Some(1));
        assert_eq!(result.snapshot.energy_shield, Some(3744));
        assert_eq!(result.snapshot.attributes.dexterity, Some(115));
        assert_eq!(result.snapshot.charges.power, Some(5));
        assert_eq!(result.snapshot.evasion_rating, Some(14057));
        assert_eq!(result.snapshot.deflect_chance, Some(19.0));
        assert_eq!(result.snapshot.resistances.chaos, Some(100.0));
        assert_eq!(
            result.snapshot.effective_health_pool.as_deref(),
            Some("24.3k")
        );
        assert_eq!(
            result
                .snapshot
                .max_hit
                .as_ref()
                .and_then(|hit| hit.physical.as_deref()),
            Some("3.9k")
        );
        assert!(result
            .snapshot
            .keystones
            .contains(&"Chaos Inoculation".to_string()));
        assert!(result.snapshot.main_skills.contains(&"Rend".to_string()));
        assert_eq!(result.snapshot.skill_dps[0].name, "Rend");
        assert_eq!(result.snapshot.skill_dps[0].dps.as_deref(), Some("371"));
        assert_eq!(result.snapshot.equipped_uniques, vec!["Mageblood"]);
        assert_eq!(result.fingerprint.confidence, "poe_ninja_snapshot");
        assert_eq!(
            result.fingerprint.recommended_profile_id,
            "energy_shield_recovery"
        );
    }

    #[test]
    fn rejects_non_poe_ninja_urls() {
        let error =
            snapshot_from_poe_ninja_url("https://example.com/character/foo", 42).unwrap_err();

        assert!(error.contains("poe.ninja PoE2 character URL"));
    }

    #[test]
    fn infers_energy_shield_profile_from_chaos_inoculation() {
        let snapshot = BuildSnapshot {
            source: BuildSnapshotSource::ManualProfile,
            source_url: None,
            account: None,
            character: Some("CI Runner".to_string()),
            league: None,
            class_name: Some("Blood Mage".to_string()),
            class_icon_url: None,
            ascendancy: None,
            level: Some(92),
            life: Some(1),
            energy_shield: Some(9200),
            mana: None,
            spirit: None,
            attributes: BuildAttributes::default(),
            charges: BuildCharges::default(),
            movement_speed: None,
            armour: None,
            evasion_rating: None,
            evade_chance: None,
            deflection_rating: None,
            deflect_chance: None,
            physical_taken_as: None,
            resistances: BuildResistances::default(),
            effective_health_pool: None,
            max_hit: None,
            keystones: vec!["Chaos Inoculation".to_string()],
            main_skills: Vec::new(),
            skill_dps: Vec::new(),
            defensive_layers: Vec::new(),
            equipped_uniques: Vec::new(),
            recovery_systems: vec!["Energy Shield Recharge".to_string()],
            fetched_at_epoch_ms: 42,
        };

        let fingerprint = infer_build_fingerprint(&snapshot);

        assert!(fingerprint.tags.contains(&"chaos_inoculation".to_string()));
        assert_eq!(fingerprint.recommended_profile_id, "energy_shield_recovery");
        assert_eq!(fingerprint.confidence, "inferred");
    }

    #[test]
    fn infers_minion_profile_from_skills() {
        let snapshot = BuildSnapshot {
            source: BuildSnapshotSource::ManualProfile,
            source_url: None,
            account: None,
            character: None,
            league: None,
            class_name: None,
            class_icon_url: None,
            ascendancy: None,
            level: None,
            life: None,
            energy_shield: None,
            mana: None,
            spirit: None,
            attributes: BuildAttributes::default(),
            charges: BuildCharges::default(),
            movement_speed: None,
            armour: None,
            evasion_rating: None,
            evade_chance: None,
            deflection_rating: None,
            deflect_chance: None,
            physical_taken_as: None,
            resistances: BuildResistances::default(),
            effective_health_pool: None,
            max_hit: None,
            keystones: Vec::new(),
            main_skills: vec!["Summon Skeletal Sniper".to_string()],
            skill_dps: Vec::new(),
            defensive_layers: Vec::new(),
            equipped_uniques: Vec::new(),
            recovery_systems: Vec::new(),
            fetched_at_epoch_ms: 42,
        };

        let fingerprint = infer_build_fingerprint(&snapshot);

        assert!(fingerprint.tags.contains(&"minion_build".to_string()));
        assert_eq!(fingerprint.recommended_profile_id, "minion");
    }

    #[test]
    fn imports_readable_pob_build_text_as_fallback() {
        let result = snapshot_from_pob_text(
            r#"
            character: AegisRunner
            class: Witch
            ascendancy: Blood Mage
            level: 91
            life: 1
            energy shield: 8420
            mana: 1101
            spirit: 156
            strength: 52
            dexterity: 115
            intelligence: 193
            evasion rating: 14057
            fire resistance: 75
            cold resistance: 74
            lightning resistance: 75
            chaos resistance: 100
            effective health pool: 24k
            Rend dps: 0.4k
            keystone: Chaos Inoculation
            main skill: Spark
            recovery: Energy Shield Recharge
            "#,
            42,
        )
        .unwrap();

        assert_eq!(result.snapshot.source, BuildSnapshotSource::PobCode);
        assert_eq!(result.snapshot.character.as_deref(), Some("AegisRunner"));
        assert_eq!(result.snapshot.energy_shield, Some(8420));
        assert_eq!(result.snapshot.mana, Some(1101));
        assert_eq!(result.snapshot.spirit, Some(156));
        assert_eq!(result.snapshot.attributes.dexterity, Some(115));
        assert_eq!(result.snapshot.resistances.chaos, Some(100.0));
        assert_eq!(
            result.snapshot.effective_health_pool.as_deref(),
            Some("24k")
        );
        assert!(result
            .snapshot
            .skill_dps
            .iter()
            .any(|skill| skill.name == "Rend"));
        assert!(result
            .fingerprint
            .tags
            .contains(&"energy_shield_primary".to_string()));
        assert_eq!(
            result.fingerprint.recommended_profile_id,
            "energy_shield_recovery"
        );
        assert!(result
            .fingerprint
            .notes
            .iter()
            .any(|note| note.contains("pasted readable build text")));
    }

    #[test]
    fn decodes_compressed_pob_payloads() {
        let payload = r#"
            <PathOfBuilding>
              <Build level="94" className="Witch" ascendClassName="Infernalist" />
              <Calcs>
                <PlayerStat stat="Life" value="1" />
                <PlayerStat stat="EnergyShield" value="8420" />
                <PlayerStat stat="Mana" value="1101" />
                <PlayerStat stat="Spirit" value="156" />
                <PlayerStat stat="Strength" value="52" />
                <PlayerStat stat="Dexterity" value="115" />
                <PlayerStat stat="Intelligence" value="193" />
                <PlayerStat stat="FireResist" value="75" />
                <PlayerStat stat="ColdResist" value="74" />
                <PlayerStat stat="LightningResist" value="75" />
                <PlayerStat stat="ChaosResist" value="100" />
                <PlayerStat stat="EffectiveHealthPool" value="24k" />
              </Calcs>
              <Tree><Spec><Nodes><Node name="Chaos Inoculation" /></Nodes></Spec></Tree>
              <Skills><Skill><Gem nameSpec="Summon Skeletal Sniper" /></Skill></Skills>
            </PathOfBuilding>
        "#;
        let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(payload.as_bytes()).unwrap();
        let compressed = encoder.finish().unwrap();
        let code = URL_SAFE_NO_PAD.encode(compressed);

        let result = snapshot_from_pob_text(&code, 42).unwrap();

        assert_eq!(result.snapshot.class_name.as_deref(), Some("Witch"));
        assert_eq!(result.snapshot.ascendancy.as_deref(), Some("Infernalist"));
        assert_eq!(result.snapshot.level, Some(94));
        assert_eq!(result.snapshot.life, Some(1));
        assert_eq!(result.snapshot.energy_shield, Some(8420));
        assert_eq!(result.snapshot.mana, Some(1101));
        assert_eq!(result.snapshot.spirit, Some(156));
        assert_eq!(result.snapshot.attributes.strength, Some(52));
        assert_eq!(result.snapshot.attributes.dexterity, Some(115));
        assert_eq!(result.snapshot.attributes.intelligence, Some(193));
        assert_eq!(result.snapshot.resistances.fire, Some(75.0));
        assert_eq!(result.snapshot.resistances.chaos, Some(100.0));
        assert_eq!(
            result.snapshot.effective_health_pool.as_deref(),
            Some("24k")
        );
        assert!(result
            .snapshot
            .main_skills
            .contains(&"Summon Skeletal Sniper".to_string()));
        assert!(result
            .fingerprint
            .tags
            .contains(&"chaos_inoculation".to_string()));
        assert!(result
            .fingerprint
            .notes
            .iter()
            .any(|note| note.contains("Decoded compressed PoB XML")));
    }

    #[test]
    fn compressed_pob_xml_does_not_scrape_random_internal_values_as_stats() {
        let payload = r#"
            <PathOfBuilding>
              <Build level="71" className="Sorceress" />
              <Spec treeVersion="2" sockets="18" power="71">
                <Node id="20" name="Small Passive" />
              </Spec>
              <Skills>
                <Skill totalDPS="437"><Gem nameSpec="Spark" level="20" quality="9" /></Skill>
              </Skills>
              <Item id="136" text="fire resistance: 17.3" />
            </PathOfBuilding>
        "#;
        let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(payload.as_bytes()).unwrap();
        let compressed = encoder.finish().unwrap();
        let code = URL_SAFE_NO_PAD.encode(compressed);

        let result = snapshot_from_pob_text(&code, 42).unwrap();

        assert_eq!(result.snapshot.level, Some(71));
        assert_eq!(result.snapshot.class_name.as_deref(), Some("Sorceress"));
        assert_eq!(result.snapshot.life, None);
        assert_eq!(result.snapshot.energy_shield, None);
        assert_eq!(result.snapshot.mana, None);
        assert_eq!(result.snapshot.attributes.intelligence, None);
        assert_eq!(result.snapshot.charges.power, None);
        assert_eq!(result.snapshot.resistances.fire, None);
        assert!(result.snapshot.main_skills.contains(&"Spark".to_string()));
    }
}
