use std::{
    collections::HashSet,
    sync::{
        mpsc::{self, RecvTimeoutError, Sender},
        Arc, RwLock,
    },
    thread,
    time::Duration,
};

use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use serde::Serialize;

use crate::{
    build_profile::BuildSnapshot,
    map_context::{MapOcrEvidenceState, MapRunContext},
    CurrentAreaInfo,
};

const DISCORD_TEXT_LIMIT: usize = 128;
const RELIQUARY_DISCORD_APPLICATION_ID: &str = "1516117492932804748";
const RELIQUARY_BADGE_ASSET_KEY: &str = "reliquary";

fn resolve_application_id(runtime: Option<&str>, build_time: Option<&str>) -> Option<String> {
    runtime
        .filter(|value| !value.trim().is_empty())
        .or_else(|| build_time.filter(|value| !value.trim().is_empty()))
        .or(Some(RELIQUARY_DISCORD_APPLICATION_ID))
        .map(str::trim)
        .map(str::to_string)
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PresenceProfile {
    pub character: Option<String>,
    pub level: Option<u16>,
    pub class_name: Option<String>,
    pub class_icon_url: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PresenceContext {
    pub profile: Option<PresenceProfile>,
    pub area_name: Option<String>,
    pub area_type: Option<String>,
    pub started_at_epoch_ms: Option<u64>,
    pub content_flags: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PresencePayload {
    pub details: String,
    pub state: String,
    pub start_timestamp_seconds: i64,
    pub large_image: Option<String>,
    pub large_text: Option<String>,
    pub small_image: Option<String>,
    pub small_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct DiscordPresenceStatus {
    pub enabled: bool,
    pub configured: bool,
    pub connected: bool,
    pub message: String,
}

impl DiscordPresenceStatus {
    fn disabled(configured: bool) -> Self {
        Self {
            enabled: false,
            configured,
            connected: false,
            message: if configured {
                "Discord Rich Presence is disabled".to_string()
            } else {
                "Discord Application ID is not configured".to_string()
            },
        }
    }
}

enum PresenceCommand {
    SetEnabled(bool),
    Update(Option<PresencePayload>),
    Shutdown,
}

pub struct DiscordPresenceService {
    sender: Sender<PresenceCommand>,
    status: Arc<RwLock<DiscordPresenceStatus>>,
}

impl DiscordPresenceService {
    pub fn new() -> Self {
        let runtime_application_id = std::env::var("RELIQUARY_DISCORD_APP_ID").ok();
        let application_id = resolve_application_id(
            runtime_application_id.as_deref(),
            option_env!("RELIQUARY_DISCORD_APP_ID"),
        );
        Self::new_with_application_id(application_id)
    }

    fn new_with_application_id(application_id: Option<String>) -> Self {
        let configured = application_id.is_some();
        let status = Arc::new(RwLock::new(DiscordPresenceStatus::disabled(configured)));
        let worker_status = status.clone();
        let (sender, receiver) = mpsc::channel();

        thread::Builder::new()
            .name("reliquary-discord-presence".to_string())
            .spawn(move || run_presence_worker(application_id, receiver, worker_status))
            .expect("failed to start Discord Rich Presence worker");

        Self { sender, status }
    }

    pub fn set_enabled(&self, enabled: bool) {
        if let Ok(mut status) = self.status.write() {
            status.enabled = enabled;
            if enabled {
                status.message = if status.configured {
                    "Connecting to Discord".to_string()
                } else {
                    "Discord Application ID is not configured".to_string()
                };
            } else {
                status.connected = false;
                status.message = if status.configured {
                    "Discord Rich Presence is disabled".to_string()
                } else {
                    "Discord Application ID is not configured".to_string()
                };
            }
        }
        let _ = self.sender.send(PresenceCommand::SetEnabled(enabled));
    }

    pub fn update(&self, payload: Option<PresencePayload>) {
        let _ = self.sender.send(PresenceCommand::Update(payload));
    }

    pub fn status(&self) -> DiscordPresenceStatus {
        self.status
            .read()
            .map(|status| status.clone())
            .unwrap_or_else(|_| DiscordPresenceStatus {
                enabled: false,
                configured: false,
                connected: false,
                message: "Discord Rich Presence status is unavailable".to_string(),
            })
    }
}

impl Drop for DiscordPresenceService {
    fn drop(&mut self) {
        let _ = self.sender.send(PresenceCommand::Shutdown);
    }
}

fn run_presence_worker(
    application_id: Option<String>,
    receiver: mpsc::Receiver<PresenceCommand>,
    status: Arc<RwLock<DiscordPresenceStatus>>,
) {
    let mut enabled = false;
    let mut latest_payload: Option<PresencePayload> = None;
    let mut published_payload: Option<PresencePayload> = None;
    let mut client: Option<DiscordIpcClient> = None;

    loop {
        match receiver.recv_timeout(Duration::from_secs(15)) {
            Ok(PresenceCommand::SetEnabled(next_enabled)) => {
                enabled = next_enabled;
                if !enabled {
                    clear_and_close(&mut client);
                    published_payload = None;
                    set_status(
                        &status,
                        DiscordPresenceStatus::disabled(application_id.is_some()),
                    );
                    continue;
                }
            }
            Ok(PresenceCommand::Update(payload)) => latest_payload = payload,
            Ok(PresenceCommand::Shutdown) | Err(RecvTimeoutError::Disconnected) => {
                clear_and_close(&mut client);
                return;
            }
            Err(RecvTimeoutError::Timeout) => {}
        }

        if !enabled {
            continue;
        }

        let Some(application_id) = application_id.as_deref() else {
            set_status(
                &status,
                DiscordPresenceStatus {
                    enabled: true,
                    configured: false,
                    connected: false,
                    message: "Discord Application ID is not configured".to_string(),
                },
            );
            continue;
        };

        let Some(payload) = latest_payload.as_ref() else {
            set_status(
                &status,
                DiscordPresenceStatus {
                    enabled: true,
                    configured: true,
                    connected: client.is_some(),
                    message: "Waiting for a character profile or area".to_string(),
                },
            );
            continue;
        };

        if published_payload.as_ref() == Some(payload) && client.is_some() {
            continue;
        }

        if client.is_none() {
            let mut candidate = DiscordIpcClient::new(application_id);
            match candidate.connect() {
                Ok(()) => client = Some(candidate),
                Err(error) => {
                    set_status(
                        &status,
                        DiscordPresenceStatus {
                            enabled: true,
                            configured: true,
                            connected: false,
                            message: format!("Waiting for Discord: {error}"),
                        },
                    );
                    continue;
                }
            }
        }

        let Some(active_client) = client.as_mut() else {
            continue;
        };

        match active_client.set_activity(discord_activity(payload)) {
            Ok(()) => {
                published_payload = Some(payload.clone());
                set_status(
                    &status,
                    DiscordPresenceStatus {
                        enabled: true,
                        configured: true,
                        connected: true,
                        message: "Discord Rich Presence is active".to_string(),
                    },
                );
            }
            Err(error) => {
                let _ = active_client.close();
                client = None;
                published_payload = None;
                set_status(
                    &status,
                    DiscordPresenceStatus {
                        enabled: true,
                        configured: true,
                        connected: false,
                        message: format!("Discord disconnected: {error}"),
                    },
                );
            }
        }
    }
}

fn discord_activity(payload: &PresencePayload) -> activity::Activity<'_> {
    let mut result = activity::Activity::new()
        .details(payload.details.as_str())
        .state(payload.state.as_str());

    if payload.start_timestamp_seconds > 0 {
        result =
            result.timestamps(activity::Timestamps::new().start(payload.start_timestamp_seconds));
    }

    let mut assets = activity::Assets::new();
    if let Some(image) = payload.large_image.as_deref() {
        assets = assets.large_image(image);
    }
    if let Some(text) = payload.large_text.as_deref() {
        assets = assets.large_text(text);
    }
    if let Some(image) = payload.small_image.as_deref() {
        assets = assets.small_image(image);
    }
    if let Some(text) = payload.small_text.as_deref() {
        assets = assets.small_text(text);
    }

    result.assets(assets)
}

fn clear_and_close(client: &mut Option<DiscordIpcClient>) {
    if let Some(active_client) = client.as_mut() {
        let _ = active_client.clear_activity();
        let _ = active_client.close();
    }
    *client = None;
}

fn set_status(status: &Arc<RwLock<DiscordPresenceStatus>>, next: DiscordPresenceStatus) {
    if let Ok(mut current) = status.write() {
        *current = next;
    }
}

pub fn context_from_sources(
    profile: Option<&BuildSnapshot>,
    area: Option<&CurrentAreaInfo>,
    active_map_run: Option<&MapRunContext>,
) -> PresenceContext {
    let effective_area = area.or_else(|| active_map_run.map(|run| &run.area));
    let matching_map_run = active_map_run.filter(|run| {
        effective_area.is_some_and(|area| {
            area.area_type == "map"
                && run.area.name.eq_ignore_ascii_case(&area.name)
                && run.area.entered_at_epoch_ms == area.entered_at_epoch_ms
        })
    });
    let content_flags = matching_map_run
        .and_then(|run| run.ocr_evidence.as_ref())
        .filter(|evidence| {
            matches!(
                evidence.state,
                MapOcrEvidenceState::Confirmed | MapOcrEvidenceState::Locked
            )
        })
        .and_then(|evidence| evidence.summary.as_ref())
        .map(|summary| summary.content_flags.clone())
        .unwrap_or_default();

    PresenceContext {
        profile: profile.map(|snapshot| PresenceProfile {
            character: snapshot.character.clone(),
            level: snapshot.level,
            class_name: snapshot
                .ascendancy
                .clone()
                .or_else(|| snapshot.class_name.clone()),
            class_icon_url: snapshot.class_icon_url.clone(),
        }),
        area_name: effective_area.map(|area| area.name.clone()),
        area_type: effective_area.map(|area| area.area_type.clone()),
        started_at_epoch_ms: matching_map_run
            .map(|run| run.started_at_epoch_ms)
            .or_else(|| effective_area.map(|area| area.entered_at_epoch_ms)),
        content_flags,
    }
}

pub fn build_presence_payload(context: &PresenceContext) -> Option<PresencePayload> {
    if context.profile.is_none() && context.area_name.is_none() {
        return None;
    }

    let profile = context.profile.as_ref();
    let details = profile_details(profile);
    let state = activity_state(context);
    let class_name = profile.and_then(|profile| clean_optional(&profile.class_name));

    Some(PresencePayload {
        details: truncate_discord_text(&details),
        state: truncate_discord_text(&state),
        start_timestamp_seconds: context.started_at_epoch_ms.unwrap_or_default() as i64 / 1000,
        large_image: profile.and_then(|profile| clean_optional(&profile.class_icon_url)),
        large_text: class_name,
        small_image: Some(RELIQUARY_BADGE_ASSET_KEY.to_string()),
        small_text: Some("Reliquary".to_string()),
    })
}

fn profile_details(profile: Option<&PresenceProfile>) -> String {
    let Some(profile) = profile else {
        return "Playing Path of Exile 2".to_string();
    };

    let character = clean_optional(&profile.character);
    let class_name = clean_optional(&profile.class_name);
    let suffix = match (profile.level, class_name) {
        (Some(level), Some(class_name)) => Some(format!("Level {level} {class_name}")),
        (Some(level), None) => Some(format!("Level {level}")),
        (None, Some(class_name)) => Some(class_name),
        (None, None) => None,
    };

    match (character, suffix) {
        (Some(character), Some(suffix)) => format!("{character} · {suffix}"),
        (Some(character), None) => character,
        (None, Some(suffix)) => suffix,
        (None, None) => "Playing Path of Exile 2".to_string(),
    }
}

fn activity_state(context: &PresenceContext) -> String {
    let area_name = context
        .area_name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or("Unknown Area");
    let area_type = context.area_type.as_deref().unwrap_or_default();

    match area_type {
        "map" => mapping_state(area_name, &context.content_flags),
        "hideout" => format!("Hideout · {area_name}"),
        _ => format!("Campaign · {area_name}"),
    }
}

fn mapping_state(area_name: &str, flags: &[String]) -> String {
    let mut state = format!("Mapping · {area_name}");
    let mut seen = HashSet::new();

    for flag in flags {
        let flag = flag.trim();
        if flag.is_empty() || !seen.insert(flag.to_ascii_lowercase()) {
            continue;
        }

        let candidate = format!("{state} · {flag}");
        if candidate.chars().count() > DISCORD_TEXT_LIMIT {
            break;
        }
        state = candidate;
    }

    state
}

fn clean_optional(value: &Option<String>) -> Option<String> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn truncate_discord_text(value: &str) -> String {
    if value.chars().count() <= DISCORD_TEXT_LIMIT {
        return value.to_string();
    }

    let mut truncated = value
        .chars()
        .take(DISCORD_TEXT_LIMIT.saturating_sub(1))
        .collect::<String>();
    truncated.push('…');
    truncated
}

#[cfg(test)]
mod tests {
    use super::{
        build_presence_payload, context_from_sources, resolve_application_id,
        DiscordPresenceService, PresenceContext, PresenceProfile,
    };
    use crate::{
        map_context::{
            MapOcrEvidence, MapOcrEvidenceState, MapOcrSummary, MapRunConfidence, MapRunContext,
        },
        CurrentAreaInfo,
    };

    fn profile() -> PresenceProfile {
        PresenceProfile {
            character: Some("Pharsbeyblade".to_string()),
            level: Some(94),
            class_name: Some("Martial Artist".to_string()),
            class_icon_url: Some(
                "https://assets.poe.ninja/poe2/classes/martial-artist.webp".to_string(),
            ),
        }
    }

    #[test]
    fn mapping_presence_includes_confirmed_mechanics_and_run_timer() {
        let payload = build_presence_payload(&PresenceContext {
            profile: Some(profile()),
            area_name: Some("Burial Bog".to_string()),
            area_type: Some("map".to_string()),
            started_at_epoch_ms: Some(1_781_527_680_000),
            content_flags: vec!["Abyss".to_string(), "Strongbox".to_string()],
        })
        .expect("mapping payload");

        assert_eq!(payload.details, "Pharsbeyblade · Level 94 Martial Artist");
        assert_eq!(payload.state, "Mapping · Burial Bog · Abyss · Strongbox");
        assert_eq!(payload.start_timestamp_seconds, 1_781_527_680);
        assert_eq!(
            payload.large_image.as_deref(),
            Some("https://assets.poe.ninja/poe2/classes/martial-artist.webp")
        );
        assert_eq!(payload.large_text.as_deref(), Some("Martial Artist"));
        assert_eq!(payload.small_image.as_deref(), Some("reliquary"));
        assert_eq!(payload.small_text.as_deref(), Some("Reliquary"));
    }

    #[test]
    fn campaign_presence_uses_area_entry_timer() {
        let payload = build_presence_payload(&PresenceContext {
            profile: Some(PresenceProfile {
                level: Some(34),
                ..profile()
            }),
            area_name: Some("The Drowned City".to_string()),
            area_type: Some("other".to_string()),
            started_at_epoch_ms: Some(60_999),
            content_flags: vec![],
        })
        .expect("campaign payload");

        assert_eq!(payload.details, "Pharsbeyblade · Level 34 Martial Artist");
        assert_eq!(payload.state, "Campaign · The Drowned City");
        assert_eq!(payload.start_timestamp_seconds, 60);
    }

    #[test]
    fn hideout_presence_is_explicit() {
        let payload = build_presence_payload(&PresenceContext {
            profile: Some(profile()),
            area_name: Some("Shoreline Hideout".to_string()),
            area_type: Some("hideout".to_string()),
            started_at_epoch_ms: Some(42_000),
            content_flags: vec![],
        })
        .expect("hideout payload");

        assert_eq!(payload.state, "Hideout · Shoreline Hideout");
    }

    #[test]
    fn mechanics_are_deduplicated_and_trimmed_to_discord_limit() {
        let payload = build_presence_payload(&PresenceContext {
            profile: Some(profile()),
            area_name: Some(
                "A Very Long Map Name Used To Exercise Discord State Truncation".to_string(),
            ),
            area_type: Some("map".to_string()),
            started_at_epoch_ms: Some(1_000),
            content_flags: vec![
                "Abyss".to_string(),
                "Abyss".to_string(),
                "Delirium".to_string(),
                "Breach".to_string(),
                "Expedition".to_string(),
                "Ritual".to_string(),
                "Strongbox".to_string(),
            ],
        })
        .expect("mapping payload");

        assert!(payload.state.chars().count() <= 128);
        assert_eq!(payload.state.matches("Abyss").count(), 1);
        assert!(payload.state.starts_with("Mapping · A Very Long Map Name"));
    }

    #[test]
    fn incomplete_profile_has_honest_fallback_text() {
        let payload = build_presence_payload(&PresenceContext {
            profile: Some(PresenceProfile {
                character: Some("Pharsbeyblade".to_string()),
                level: None,
                class_name: None,
                class_icon_url: None,
            }),
            area_name: Some("Sanctuary".to_string()),
            area_type: Some("town".to_string()),
            started_at_epoch_ms: Some(2_000),
            content_flags: vec![],
        })
        .expect("fallback payload");

        assert_eq!(payload.details, "Pharsbeyblade");
        assert_eq!(payload.state, "Campaign · Sanctuary");
        assert!(payload.large_image.is_none());
    }

    #[test]
    fn no_profile_and_no_area_has_no_presence() {
        assert!(build_presence_payload(&PresenceContext::default()).is_none());
    }

    #[test]
    fn service_without_application_id_is_safe_and_reports_unconfigured() {
        let service = DiscordPresenceService::new_with_application_id(None);
        let status = service.status();

        assert!(!status.enabled);
        assert!(!status.configured);
        assert!(!status.connected);
        assert_eq!(status.message, "Discord Application ID is not configured");

        service.set_enabled(true);
        let enabled_status = service.status();
        assert!(enabled_status.enabled);
        assert!(!enabled_status.configured);
        assert_eq!(
            enabled_status.message,
            "Discord Application ID is not configured"
        );
    }

    #[test]
    fn application_id_resolution_prefers_overrides_then_uses_reliquary_default() {
        assert_eq!(
            resolve_application_id(Some("runtime-id"), Some("build-id")),
            Some("runtime-id".to_string())
        );
        assert_eq!(
            resolve_application_id(Some("  "), Some("build-id")),
            Some("build-id".to_string())
        );
        assert_eq!(
            resolve_application_id(None, None),
            Some("1516117492932804748".to_string())
        );
    }

    #[test]
    fn source_adapter_uses_map_run_start_and_only_confirmed_ocr_flags() {
        let area = CurrentAreaInfo {
            name: "Burial Bog".to_string(),
            area_level: Some(79),
            area_type: "map".to_string(),
            entered_at_epoch_ms: 99_000,
            act: None,
            waystone_mod_count: None,
            waystone_quantity: None,
            waystone_rarity: None,
            waystone_pack_size: None,
            waystone_hazard_count: None,
            boss: None,
        };
        let run = MapRunContext {
            area: area.clone(),
            waystone: None,
            confidence: MapRunConfidence::OcrConfirmed,
            ocr_evidence: Some(MapOcrEvidence {
                state: MapOcrEvidenceState::Confirmed,
                normalized_mods: vec![],
                raw_lines: vec![],
                summary: Some(MapOcrSummary {
                    content_flags: vec!["Abyss".to_string(), "Strongbox".to_string()],
                    ..MapOcrSummary::default()
                }),
                confidence_score: Some(0.9),
                reason: None,
                captured_at_epoch_ms: 100_000,
            }),
            started_at_epoch_ms: 12_000,
        };

        let context = context_from_sources(None, Some(&area), Some(&run));

        assert_eq!(context.started_at_epoch_ms, Some(12_000));
        assert_eq!(context.content_flags, vec!["Abyss", "Strongbox"]);
    }

    #[test]
    fn source_adapter_ignores_partial_ocr_mechanics() {
        let area = CurrentAreaInfo {
            name: "Burial Bog".to_string(),
            area_level: Some(79),
            area_type: "map".to_string(),
            entered_at_epoch_ms: 99_000,
            act: None,
            waystone_mod_count: None,
            waystone_quantity: None,
            waystone_rarity: None,
            waystone_pack_size: None,
            waystone_hazard_count: None,
            boss: None,
        };
        let run = MapRunContext {
            area: area.clone(),
            waystone: None,
            confidence: MapRunConfidence::OcrPartial,
            ocr_evidence: Some(MapOcrEvidence {
                state: MapOcrEvidenceState::Partial,
                normalized_mods: vec![],
                raw_lines: vec![],
                summary: Some(MapOcrSummary {
                    content_flags: vec!["Breach".to_string()],
                    ..MapOcrSummary::default()
                }),
                confidence_score: Some(0.5),
                reason: None,
                captured_at_epoch_ms: 100_000,
            }),
            started_at_epoch_ms: 12_000,
        };

        let context = context_from_sources(None, Some(&area), Some(&run));

        assert!(context.content_flags.is_empty());
    }
}
