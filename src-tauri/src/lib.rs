use std::{
    env,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use arboard::Clipboard;
use rdev::{listen, EventType, Key};
use regex::Regex;
use serde::{Deserialize, Serialize};
use tauri::{
    Emitter, LogicalPosition, LogicalSize, Manager, PhysicalPosition, Position, Size, WebviewUrl,
    WebviewWindowBuilder,
};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use thiserror::Error;
use tokio::sync::{mpsc, Mutex};
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW,
};

pub mod debug_log;
mod exchange;
mod hazards;
mod item_parser;
mod macros;
mod price_check;
pub mod source_truth;
mod trade_search;
mod whispers;

pub type SharedAppState = Arc<Mutex<AppState>>;
const LEAGUE_REFRESH_INTERVAL: Duration = Duration::from_secs(15 * 60);
const COMPACT_WINDOW_WIDTH: f64 = 472.0;
const COMPACT_WINDOW_HEIGHT: f64 = 56.0;
const IDLE_WINDOW_WIDTH: f64 = 540.0;
const IDLE_WINDOW_HEIGHT: f64 = 280.0;
const DEFAULT_WINDOW_WIDTH: f64 = 472.0;
const DEFAULT_WINDOW_HEIGHT: f64 = 760.0;
const SCAN_WINDOW_WIDTH: f64 = 540.0;
const SCAN_WINDOW_HEIGHT: f64 = 980.0;
const MAX_SCAN_WINDOW_HEIGHT: f64 = 1160.0;
const SETTINGS_WINDOW_WIDTH: f64 = 740.0;
const SETTINGS_WINDOW_HEIGHT: f64 = 620.0;
const TRADE_WINDOW_WIDTH: f64 = 1000.0;
const TRADE_WINDOW_HEIGHT: f64 = 760.0;
const LISTING_PREVIEW_WINDOW_LABEL: &str = "listing-preview";
const LISTING_PREVIEW_WIDTH: f64 = 360.0;
const LISTING_PREVIEW_HEIGHT: f64 = 560.0;
const LISTING_PREVIEW_GAP: f64 = 12.0;
const SNAP_MARGIN: f64 = 8.0;
const FULL_SNAP_LEFT: f64 = 0.0;
const FULL_SNAP_TOP_RATIO: f64 = 0.09;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurrentAreaInfo {
    pub name: String,
    pub area_level: Option<u32>,
    pub area_type: String,
    pub entered_at_epoch_ms: u64,
    pub act: Option<u32>,
    pub waystone_mod_count: Option<usize>,
    pub waystone_quantity: Option<u32>,
    pub waystone_rarity: Option<u32>,
    pub waystone_pack_size: Option<u32>,
    pub waystone_hazard_count: Option<usize>,
    pub boss: Option<String>,
}

fn classify_area_kind(internal_id: &str) -> &'static str {
    let id = internal_id.to_ascii_lowercase();
    if id.starts_with("map") || id.starts_with("mapworlds") {
        return "map";
    }
    if id.starts_with("hideout") {
        return "hideout";
    }
    if id.ends_with("_town") || id.contains("encampment") || id.contains("refuge") {
        return "town";
    }
    "other"
}

fn zone_ends_with(zone: &str, suffixes: &[&str]) -> bool {
    let zone = zone.trim_end_matches('.');
    suffixes.iter().any(|s| zone.ends_with(s))
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AppState {
    pub scanned_item: Option<Item>,
    pub trade_queue: Vec<TradeWhisper>,
    pub current_zone: String,
    pub current_area: Option<CurrentAreaInfo>,
    pub trade_league: String,
    pub league_catalog: Vec<LeagueCatalogEntry>,
    pub trade_leagues: Vec<TradeLeague>,
    pub data_leagues: Vec<DataLeague>,
    pub source_truth_snapshot: Option<source_truth::Poe2DbDataSnapshot>,
    pub price_check: Option<PriceCheck>,
    pub exchange_tab: ExchangeTabState,
    pub price_currency: String,
    pub price_option: String,
    pub active_price_filters: Vec<ActivePriceFilter>,
    #[serde(skip)]
    pub trade_league_locked: bool,
    #[serde(skip)]
    price_check_continuation: Option<price_check::PriceCheckContinuation>,
    #[serde(skip)]
    price_check_fetch_in_flight: bool,
    #[serde(skip)]
    current_listing_preview: Option<ListingPreviewRequest>,
    #[serde(skip)]
    scan_key: char,
    #[serde(skip)]
    scan_mod: String,
    #[serde(skip)]
    trade_key: char,
    #[serde(skip)]
    trade_mod: String,
}

impl AppState {
    fn new() -> Self {
        let configured_league = configured_trade_league();
        Self {
            trade_league: configured_league
                .clone()
                .unwrap_or_else(|| "Fate of the Vaal".to_string()),
            league_catalog: Vec::new(),
            exchange_tab: exchange::default_tab_state().into(),
            price_currency: "exalted".to_string(),
            price_option: "equivalent".to_string(),
            trade_league_locked: configured_league.is_some(),
            scan_key: 'C',
            scan_mod: "Ctrl".to_string(),
            trade_key: 'D',
            trade_mod: "Alt".to_string(),
            ..Self::default()
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Item {
    pub name: String,
    pub rarity: String,
    pub family: String,
    pub item_class: Option<String>,
    pub base_type: Option<String>,
    pub item_level: Option<u16>,
    pub property_lines: Vec<String>,
    pub explicit_mods: Vec<String>,
    pub sockets: Option<u8>,
    pub spirit: Option<u16>,
    pub hazards: Vec<String>,
    pub trade_url: Option<String>,
    pub raw_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriceCheck {
    pub status: String,
    pub matched: usize,
    pub source_url: Option<String>,
    pub selected_currency: String,
    pub selected_price_option: String,
    pub rate_source: Option<String>,
    pub rate_limit: Option<TradeRateLimit>,
    pub currencies: Vec<CurrencyMeta>,
    pub filters: Vec<PriceFilter>,
    pub requested_filters: Vec<ActivePriceFilter>,
    pub applied_filters: Vec<ActivePriceFilter>,
    pub listings: Vec<PriceListing>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeRateLimit {
    pub policy: Option<String>,
    pub scope: String,
    pub current_hits: Option<u32>,
    pub limit: Option<u32>,
    pub interval_seconds: Option<u32>,
    pub usage_ratio: f64,
    pub active_timeout_seconds: Option<u32>,
    pub retry_after_seconds: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExchangeTabState {
    pub categories: Vec<exchange::ExchangeCategory>,
    pub selected_category_id: String,
    pub selected_item_id: Option<String>,
    pub overview: Option<exchange::ExchangeOverview>,
    pub status: String,
    pub error: Option<String>,
}

impl From<exchange::ExchangeTabState> for ExchangeTabState {
    fn from(value: exchange::ExchangeTabState) -> Self {
        Self {
            categories: value.categories,
            selected_category_id: value.selected_category_id,
            selected_item_id: value.selected_item_id,
            overview: value.overview,
            status: value.status,
            error: value.error,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurrencyMeta {
    pub id: String,
    pub name: String,
    pub icon_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriceFilter {
    pub label: String,
    pub source: String,
    pub enabled: bool,
    pub value: Option<f64>,
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub tier: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriceListing {
    pub price: String,
    pub amount: Option<f64>,
    pub currency: Option<String>,
    pub currency_icon_url: Option<String>,
    pub normalized_price: Option<String>,
    pub normalized_amount: Option<f64>,
    pub normalized_currency: Option<String>,
    pub normalized_currency_icon_url: Option<String>,
    pub item_level: Option<u16>,
    pub listed: String,
    pub source_url: String,
    pub seller: Option<String>,
    pub online: bool,
    pub required_level: Option<u16>,
    pub quality: Option<f64>,
    pub armour: Option<f64>,
    pub evasion: Option<f64>,
    pub energy_shield: Option<f64>,
    pub explicit_mods: Vec<String>,
    pub preview_name: Option<String>,
    pub preview_base_type: Option<String>,
    pub preview_rarity: Option<String>,
    pub preview_item_class: Option<String>,
    pub preview_icon_url: Option<String>,
    pub preview_property_lines: Vec<String>,
    pub preview_description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListingPreviewRequest {
    pub listing: PriceListing,
    pub family: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ActivePriceFilter {
    pub kind: String,
    pub label: String,
    pub value: Option<f64>,
    pub template: String,
    #[serde(default)]
    pub min: Option<f64>,
    #[serde(default)]
    pub max: Option<f64>,
    #[serde(default)]
    pub tier: Option<String>,
    #[serde(default)]
    pub tier_name: Option<String>,
    #[serde(default)]
    pub affix: Option<String>,
    #[serde(default)]
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeLeague {
    pub id: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeagueCatalogEntry {
    pub id: String,
    pub display_name: String,
    pub official_trade_id: Option<String>,
    pub poe_ninja_name: Option<String>,
    pub poe_ninja_slug: Option<String>,
    pub hardcore: bool,
    pub indexed: bool,
    pub trade_enabled: bool,
    pub exchange_enabled: bool,
    pub discovered_at: Option<String>,
    pub expansion: Option<String>,
    pub source_tags: Vec<String>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataLeague {
    pub id: String,
    pub name: String,
    pub version: Option<String>,
    pub expansion: Option<String>,
    pub starts_at: Option<String>,
    pub source: String,
    pub trade_enabled: bool,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeWhisper {
    pub buyer_name: String,
    pub item: String,
    pub price: String,
    pub league: String,
    pub tab_coordinates: Option<TabCoordinates>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabCoordinates {
    pub tab_name: String,
    pub left: u16,
    pub top: u16,
}

#[derive(Debug, Clone, Serialize)]
struct WorkerStatus<'a> {
    worker: &'a str,
    message: String,
}

enum InputAction {
    ClipboardScan(String),
    OpenTradeSearch,
}

#[derive(Debug, Error)]
enum WorkerError {
    #[error("failed to start global input listener: {0}")]
    InputListener(String),
    #[error("failed to read clipboard: {0}")]
    Clipboard(String),
    #[error("failed to watch Client.txt at {path}: {source}")]
    ClientLog {
        path: String,
        source: Box<dyn std::error::Error + Send + Sync>,
    },
}

#[tauri::command]
async fn set_click_passthrough(window: tauri::Window, passthrough: bool) -> Result<(), String> {
    window
        .set_ignore_cursor_events(passthrough)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn start_drag_window(window: tauri::Window) -> Result<(), String> {
    window.start_dragging().map_err(|error| error.to_string())
}

#[tauri::command]
fn minimize_window(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|error| error.to_string())
}

#[tauri::command]
fn set_compact_mode(window: tauri::Window, compact: bool) -> Result<(), String> {
    let size = if compact {
        LogicalSize::new(COMPACT_WINDOW_WIDTH, COMPACT_WINDOW_HEIGHT)
    } else {
        LogicalSize::new(DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT)
    };

    window
        .set_size(Size::Logical(size))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_window_layout(window: tauri::Window, layout: String) -> Result<(), String> {
    let (width, height) = match layout.as_str() {
        "scan" => (SCAN_WINDOW_WIDTH, SCAN_WINDOW_HEIGHT),
        "trade" => (TRADE_WINDOW_WIDTH, TRADE_WINDOW_HEIGHT),
        "settings" => (SETTINGS_WINDOW_WIDTH, SETTINGS_WINDOW_HEIGHT),
        "idle" => (IDLE_WINDOW_WIDTH, IDLE_WINDOW_HEIGHT),
        "default" => (DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT),
        "compact" => (COMPACT_WINDOW_WIDTH, COMPACT_WINDOW_HEIGHT),
        other => {
            return Err(format!("unknown window layout: {other}"));
        }
    };

    let position = snapped_window_position(&window, layout.as_str(), width, height)?;

    window
        .set_size(Size::Logical(LogicalSize::new(width, height)))
        .map_err(|error| error.to_string())?;
    window
        .set_position(Position::Logical(position))
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn set_keybinds(
    state: tauri::State<'_, SharedAppState>,
    scan_mod: String,
    scan_key: String,
    trade_mod: String,
    trade_key: String,
) -> Result<(), String> {
    let mut locked = state.lock().await;
    locked.scan_mod = scan_mod;
    locked.scan_key = scan_key.chars().next().unwrap_or('C');
    locked.trade_mod = trade_mod;
    locked.trade_key = trade_key.chars().next().unwrap_or('D');
    Ok(())
}

#[tauri::command]
fn set_scan_window_height(window: tauri::Window, content_height: f64) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or_else(|| window.primary_monitor().ok().flatten());

    let max_height = monitor
        .as_ref()
        .map(|monitor| {
            let scale_factor = monitor.scale_factor();
            let monitor_height = monitor.size().height as f64 / scale_factor;
            (monitor_height - SNAP_MARGIN * 2.0).max(IDLE_WINDOW_HEIGHT)
        })
        .unwrap_or(MAX_SCAN_WINDOW_HEIGHT);

    let height = if max_height < SCAN_WINDOW_HEIGHT {
        max_height
    } else {
        content_height
            .ceil()
            .clamp(SCAN_WINDOW_HEIGHT, MAX_SCAN_WINDOW_HEIGHT.min(max_height))
    };
    let position = snapped_window_position(&window, "scan", SCAN_WINDOW_WIDTH, height)?;

    window
        .set_size(Size::Logical(LogicalSize::new(SCAN_WINDOW_WIDTH, height)))
        .map_err(|error| error.to_string())?;
    window
        .set_position(Position::Logical(position))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_compact_window_height(window: tauri::Window, content_height: f64) -> Result<(), String> {
    let height = content_height
        .ceil()
        .max(COMPACT_WINDOW_HEIGHT)
        .min(600.0);
    let position = snapped_window_position(&window, "compact", COMPACT_WINDOW_WIDTH, height)?;
    window
        .set_size(Size::Logical(LogicalSize::new(COMPACT_WINDOW_WIDTH, height)))
        .map_err(|error| error.to_string())?;
    window
        .set_position(Position::Logical(position))
        .map_err(|error| error.to_string())
}

fn snapped_window_position(
    window: &tauri::Window,
    layout: &str,
    width: f64,
    height: f64,
) -> Result<LogicalPosition<f64>, String> {
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or_else(|| window.primary_monitor().ok().flatten());

    let Some(monitor) = monitor else {
        return Ok(LogicalPosition::new(FULL_SNAP_LEFT, SNAP_MARGIN));
    };

    let scale_factor = monitor.scale_factor();
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let monitor_x = monitor_position.x as f64 / scale_factor;
    let monitor_y = monitor_position.y as f64 / scale_factor;
    let monitor_width = monitor_size.width as f64 / scale_factor;
    let monitor_height = monitor_size.height as f64 / scale_factor;

    let (x, y) = if layout == "compact" {
        (
            monitor_x + monitor_width - width - SNAP_MARGIN,
            monitor_y + SNAP_MARGIN,
        )
    } else {
        (
            monitor_x + FULL_SNAP_LEFT,
            monitor_y + (monitor_height * FULL_SNAP_TOP_RATIO).max(SNAP_MARGIN),
        )
    };

    Ok(LogicalPosition::new(
        x.clamp(monitor_x, monitor_x + monitor_width - width),
        y.clamp(monitor_y, monitor_y + monitor_height - height),
    ))
}

#[tauri::command]
fn show_listing_preview(
    app_handle: tauri::AppHandle,
    window: tauri::Window,
    state: tauri::State<'_, SharedAppState>,
    preview: ListingPreviewRequest,
    anchor_top: f64,
) -> Result<(), String> {
    {
        let mut locked_state = state.blocking_lock();
        locked_state.current_listing_preview = Some(preview.clone());
    }

    let preview_window = app_handle
        .get_webview_window(LISTING_PREVIEW_WINDOW_LABEL)
        .ok_or_else(|| "listing preview window is unavailable".to_string())?;

    position_listing_preview(&window, &preview_window, anchor_top)?;
    preview_window.show().map_err(|error| error.to_string())?;
    app_handle
        .emit_to(
            LISTING_PREVIEW_WINDOW_LABEL,
            "preview://listing-updated",
            preview,
        )
        .map_err(|error| error.to_string())?;

    let app_handle_clone = app_handle.clone();
    let state_clone = state.inner().clone();
    tauri::async_runtime::spawn(async move {
        for delay_ms in [120_u64, 320_u64] {
            tokio::time::sleep(Duration::from_millis(delay_ms)).await;
            let preview = {
                let locked_state = state_clone.lock().await;
                locked_state.current_listing_preview.clone()
            };
            if let Some(preview) = preview {
                let _ = app_handle_clone.emit_to(
                    LISTING_PREVIEW_WINDOW_LABEL,
                    "preview://listing-updated",
                    preview,
                );
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn hide_listing_preview(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, SharedAppState>,
) -> Result<(), String> {
    {
        let mut locked_state = state.blocking_lock();
        locked_state.current_listing_preview = None;
    }

    if let Some(preview_window) = app_handle.get_webview_window(LISTING_PREVIEW_WINDOW_LABEL) {
        let _ = app_handle.emit_to(
            LISTING_PREVIEW_WINDOW_LABEL,
            "preview://listing-cleared",
            (),
        );
        preview_window.hide().map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
async fn get_listing_preview(
    state: tauri::State<'_, SharedAppState>,
) -> Result<Option<ListingPreviewRequest>, String> {
    Ok(state.lock().await.current_listing_preview.clone())
}

#[tauri::command]
async fn get_app_state(state: tauri::State<'_, SharedAppState>) -> Result<AppState, String> {
    Ok(state.lock().await.clone())
}

#[tauri::command]
async fn set_trade_league(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, SharedAppState>,
    league: String,
) -> Result<(), String> {
    let normalized = league.trim();
    if normalized.is_empty() {
        return Err("league cannot be empty".to_string());
    }

    let (scanned_item, category_id, selected_currency, selected_price_option, active_filters) = {
        let mut locked_state = state.lock().await;
        locked_state.trade_league = normalized.to_string();
        locked_state.trade_league_locked = true;
        locked_state.price_check_continuation = None;
        locked_state.price_check_fetch_in_flight = false;
        let updated_item = locked_state.scanned_item.clone().map(|mut item| {
            item.trade_url = trade_search::marketplace_url_for_item(&item, Some(normalized)).ok();
            item
        });
        locked_state.scanned_item = updated_item.clone();
        (
            updated_item,
            locked_state.exchange_tab.selected_category_id.clone(),
            locked_state.price_currency.clone(),
            locked_state.price_option.clone(),
            locked_state.active_price_filters.clone(),
        )
    };

    if let Some(item) = scanned_item {
        if exchange::is_exchange_item(&item) {
            spawn_exchange_item_worker(
                app_handle,
                state.inner().clone(),
                item,
                normalized.to_string(),
            );
        } else {
            spawn_price_check_worker(
                app_handle,
                state.inner().clone(),
                item,
                normalized.to_string(),
                selected_currency,
                selected_price_option,
                active_filters,
            );
        }
    } else if !category_id.is_empty() {
        spawn_exchange_category_worker(
            app_handle,
            state.inner().clone(),
            normalized.to_string(),
            category_id,
            false,
        );
    }

    Ok(())
}

#[tauri::command]
async fn set_price_currency(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, SharedAppState>,
    currency: String,
) -> Result<(), String> {
    let normalized = currency.trim();
    if normalized.is_empty() {
        return Err("price currency cannot be empty".to_string());
    }

    let (item, league, selected_currency, selected_price_option, active_filters) = {
        let mut locked_state = state.lock().await;
        locked_state.price_currency = normalized.to_string();
        locked_state.price_check_continuation = None;
        locked_state.price_check_fetch_in_flight = false;
        (
            locked_state.scanned_item.clone(),
            locked_state.trade_league.clone(),
            locked_state.price_currency.clone(),
            locked_state.price_option.clone(),
            locked_state.active_price_filters.clone(),
        )
    };

    if let Some(item) = item {
        if exchange::is_exchange_item(&item) {
            spawn_exchange_item_worker(app_handle, state.inner().clone(), item, league);
        } else {
            spawn_price_check_worker(
                app_handle,
                state.inner().clone(),
                item,
                league,
                selected_currency,
                selected_price_option,
                active_filters,
            );
        }
    }

    Ok(())
}

#[tauri::command]
async fn set_price_option(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, SharedAppState>,
    price_option: String,
) -> Result<(), String> {
    let normalized = price_option.trim();
    if normalized.is_empty() {
        return Err("price option cannot be empty".to_string());
    }

    let (item, league, selected_currency, selected_price_option, active_filters) = {
        let mut locked_state = state.lock().await;
        locked_state.price_option = normalized.to_string();
        locked_state.price_check_continuation = None;
        locked_state.price_check_fetch_in_flight = false;
        (
            locked_state.scanned_item.clone(),
            locked_state.trade_league.clone(),
            locked_state.price_currency.clone(),
            locked_state.price_option.clone(),
            locked_state.active_price_filters.clone(),
        )
    };

    if let Some(item) = item {
        if exchange::is_exchange_item(&item) {
            spawn_exchange_item_worker(app_handle, state.inner().clone(), item, league);
        } else {
            spawn_price_check_worker(
                app_handle,
                state.inner().clone(),
                item,
                league,
                selected_currency,
                selected_price_option,
                active_filters,
            );
        }
    }

    Ok(())
}

#[tauri::command]
async fn set_active_price_filters(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, SharedAppState>,
    filters: Vec<ActivePriceFilter>,
) -> Result<(), String> {
    let (item, league, selected_currency, selected_price_option, active_filters) = {
        let mut locked_state = state.lock().await;
        locked_state.active_price_filters = filters;
        locked_state.price_check_continuation = None;
        locked_state.price_check_fetch_in_flight = false;
        (
            locked_state.scanned_item.clone(),
            locked_state.trade_league.clone(),
            locked_state.price_currency.clone(),
            locked_state.price_option.clone(),
            locked_state.active_price_filters.clone(),
        )
    };

    if let Some(item) = item {
        spawn_price_check_worker(
            app_handle,
            state.inner().clone(),
            item,
            league,
            selected_currency,
            selected_price_option,
            active_filters,
        );
    }

    Ok(())
}

#[tauri::command]
async fn load_more_price_check_results(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, SharedAppState>,
) -> Result<(), String> {
    let shared_state = state.inner().clone();
    let continuation = {
        let mut locked_state = shared_state.lock().await;
        if locked_state.price_check_fetch_in_flight {
            return Ok(());
        }
        let Some(continuation) = locked_state.price_check_continuation.clone() else {
            return Ok(());
        };
        locked_state.price_check_fetch_in_flight = true;
        continuation
    };

    tauri::async_runtime::spawn(async move {
        let request_key = continuation.request_key.clone();
        let result = price_check::load_more_price_check_results(continuation).await;

        let maybe_emit = {
            let mut locked_state = shared_state.lock().await;
            locked_state.price_check_fetch_in_flight = false;

            match result {
                Ok(outcome) => {
                    if locked_state
                        .price_check_continuation
                        .as_ref()
                        .map(|current| current.request_key.as_str())
                        != Some(request_key.as_str())
                    {
                        None
                    } else if let Some(current_price_check) = locked_state.price_check.clone() {
                        let mut updated = current_price_check;
                        updated
                            .listings
                            .extend(outcome.price_check.listings.clone());
                        updated.rate_limit = outcome.price_check.rate_limit.clone();
                        updated.status = format!(
                            "Matched {} listings",
                            updated.matched.max(updated.listings.len())
                        );
                        locked_state.price_check = Some(updated.clone());
                        locked_state.price_check_continuation = outcome.continuation.clone();

                        let cache_outcome = price_check::PriceCheckOutcome {
                            price_check: updated.clone(),
                            continuation: outcome.continuation,
                        };
                        Some((updated, cache_outcome))
                    } else {
                        locked_state.price_check_continuation = outcome.continuation;
                        None
                    }
                }
                Err(error) => {
                    if let Some(current_price_check) = locked_state.price_check.clone() {
                        let mut updated = current_price_check;
                        updated.status = error.clone();
                        if updated.listings.is_empty() {
                            updated.error = Some(error.clone());
                        }
                        locked_state.price_check = Some(updated.clone());
                        drop(locked_state);
                        let _ = app_handle.emit("scan://price-check-updated", updated);
                        return;
                    }
                    None
                }
            }
        };

        if let Some((updated, cache_outcome)) = maybe_emit {
            price_check::refresh_cached_price_check(&request_key, &cache_outcome).await;
            let _ = app_handle.emit("scan://price-check-updated", updated);
        }
    });

    Ok(())
}

#[tauri::command]
async fn open_last_trade_search(state: tauri::State<'_, SharedAppState>) -> Result<(), String> {
    let (scanned_item, league) = {
        let locked_state = state.lock().await;
        (
            locked_state.scanned_item.clone(),
            locked_state.trade_league.clone(),
        )
    };

    match scanned_item {
        Some(item) => trade_search::open_marketplace_handoff(&item, Some(&league)),
        None => Err("no scanned item trade URL is available yet".to_string()),
    }
}

#[tauri::command]
async fn set_exchange_category(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, SharedAppState>,
    category_id: String,
) -> Result<(), String> {
    let normalized = category_id.trim();
    if normalized.is_empty() {
        return Err("exchange category cannot be empty".to_string());
    }

    let league = {
        let mut locked_state = state.lock().await;
        locked_state.exchange_tab.selected_category_id = normalized.to_string();
        locked_state.trade_league.clone()
    };

    spawn_exchange_category_worker(
        app_handle,
        state.inner().clone(),
        league,
        normalized.to_string(),
        false,
    );

    Ok(())
}

#[tauri::command]
async fn refresh_exchange_category(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, SharedAppState>,
) -> Result<(), String> {
    let (league, category_id) = {
        let locked_state = state.lock().await;
        (
            locked_state.trade_league.clone(),
            locked_state.exchange_tab.selected_category_id.clone(),
        )
    };

    spawn_exchange_category_worker(app_handle, state.inner().clone(), league, category_id, true);
    Ok(())
}

#[tauri::command]
fn invite_buyer(buyer_name: String) -> Result<(), String> {
    macros::send_invite_macro(&buyer_name)
}

#[tauri::command]
fn trade_with_buyer(buyer_name: String) -> Result<(), String> {
    macros::send_trade_macro(&buyer_name)
}

#[tauri::command]
fn kick_buyer(buyer_name: String) -> Result<(), String> {
    macros::send_kick_macro(&buyer_name)
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    webbrowser::open(&url)
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn debug_log_path() -> String {
    debug_log::path().display().to_string()
}

pub fn run() {
    tauri::Builder::default()
        .manage(Arc::new(Mutex::new(AppState::new())) as SharedAppState)
        .invoke_handler(tauri::generate_handler![
            invite_buyer,
            get_app_state,
            get_listing_preview,
            debug_log_path,
            hide_listing_preview,
            kick_buyer,
            load_more_price_check_results,
            minimize_window,
            open_last_trade_search,
            open_external_url,
            refresh_exchange_category,
            set_price_currency,
            set_price_option,
            set_active_price_filters,
            set_exchange_category,
            set_trade_league,
            set_compact_mode,
            set_window_layout,
            set_keybinds,
            set_compact_window_height,
            set_scan_window_height,
            set_click_passthrough,
            show_listing_preview,
            start_drag_window,
            trade_with_buyer,
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").ok_or_else(|| {
                std::io::Error::new(std::io::ErrorKind::NotFound, "main window was not created")
            })?;
            window.set_always_on_top(true)?;
            window.set_ignore_cursor_events(false)?;
            create_listing_preview_window(app)?;

            let show = MenuItemBuilder::with_id("show", "Show").build(app)?;
            let hide = MenuItemBuilder::with_id("hide", "Hide").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&show, &hide, &quit]).build()?;
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Reliquary")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    let window = match app.get_webview_window("main") {
                        Some(w) => w,
                        None => return,
                    };
                    match event.id.as_ref() {
                        "show" => { let _ = window.show(); }
                        "hide" => { let _ = window.hide(); }
                        "quit" => { app.exit(0); }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up, ..
                    } = event {
                        let window = match tray.app_handle().get_webview_window("main") {
                            Some(w) => w,
                            None => return,
                        };
                        let _ = if window.is_visible().unwrap_or(false) {
                            window.hide()
                        } else {
                            window.show()
                        };
                    }
                })
                .build(app)?;

            let state = app.state::<SharedAppState>().inner().clone();
            let app_handle = app.handle().clone();

            spawn_trade_league_worker(app_handle.clone(), state.clone());
            spawn_global_input_worker(app_handle.clone(), state.clone());
            spawn_window_attachment_worker(app_handle.clone());
            spawn_client_log_worker(app_handle, state);

            init_world_areas();

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Reliquary Tauri application");
}

fn spawn_global_input_worker(app_handle: tauri::AppHandle, state: SharedAppState) {
    tauri::async_runtime::spawn(async move {
        let (input_tx, mut input_rx) = mpsc::unbounded_channel::<InputAction>();
        let listener_handle = app_handle.clone();

        if let Err(error) = start_rdev_listener(input_tx, state.clone()) {
            emit_worker_error(&listener_handle, WorkerError::InputListener(error));
            return;
        }

        emit_worker_status(
            &listener_handle,
            "input",
            "PoE 2 hotkeys armed: Ctrl+C scan, Alt+D trade".to_string(),
        );

        while let Some(action) = input_rx.recv().await {
            match action {
                InputAction::ClipboardScan(raw_text) => {
                    if !looks_like_poe_item_buffer(&raw_text) {
                        debug_log::append(
                            "clipboard_scan.ignored",
                            serde_json::json!({
                                "reason": "clipboard did not look like a copied PoE item",
                                "preview": raw_text.lines().next().unwrap_or("").chars().take(160).collect::<String>(),
                            }),
                        );
                        emit_worker_status(
                            &app_handle,
                            "input",
                            "ignored clipboard text because it was not a copied PoE item"
                                .to_string(),
                        );
                        continue;
                    }

                    let league = {
                        let locked_state = state.lock().await;
                        locked_state.trade_league.clone()
                    };
                    let scanned_item = item_from_clipboard(raw_text, Some(&league));
                    {
                        let mut locked_state = state.lock().await;
                        locked_state.active_price_filters.clear();
                        locked_state.scanned_item = Some(scanned_item.clone());
                        locked_state.price_check = Some(price_check::loading(&scanned_item));
                        locked_state.price_check_continuation = None;
                        locked_state.price_check_fetch_in_flight = false;
                        locked_state.exchange_tab =
                            exchange::loading_tab_state_for_item(&scanned_item).into();
                    }

                    if let Err(error) = app_handle.emit("scan://item-updated", scanned_item) {
                        emit_worker_status(
                            &app_handle,
                            "input",
                            format!("failed to emit scanned item update: {error}"),
                        );
                    }

                    let checked_item = {
                        let locked_state = state.lock().await;
                        locked_state.scanned_item.clone()
                    };

                    if let Some(item) = checked_item {
                        if exchange::is_exchange_item(&item) {
                            spawn_exchange_item_worker(
                                app_handle.clone(),
                                state.clone(),
                                item,
                                league,
                            );
                        }
                    }
                }
                InputAction::OpenTradeSearch => {
                    let scanned_item = {
                        let locked_state = state.lock().await;
                        locked_state.scanned_item.clone()
                    };

                    if let Some(item) = scanned_item {
                        let league = {
                            let locked_state = state.lock().await;
                            locked_state.trade_league.clone()
                        };
                        if let Err(error) =
                            trade_search::open_marketplace_handoff(&item, Some(&league))
                        {
                            emit_worker_status(
                                &app_handle,
                                "input",
                                format!("failed to open marketplace handoff: {error}"),
                            );
                        }
                    } else {
                        emit_worker_status(
                            &app_handle,
                            "input",
                            "scan an item before opening trade search".to_string(),
                        );
                    }
                }
            }
        }
    });
}

fn spawn_window_attachment_worker(app_handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut last_visible = None;

        loop {
            let should_show = active_window_allows_overlay_visibility();

            if last_visible != Some(should_show) {
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = if should_show {
                        window.show()
                    } else {
                        window.hide()
                    };
                }
                last_visible = Some(should_show);
            }

            tokio::time::sleep(Duration::from_millis(180)).await;
        }
    });
}

fn spawn_trade_league_worker(app_handle: tauri::AppHandle, state: SharedAppState) {
    tauri::async_runtime::spawn(async move {
        loop {
            refresh_league_sources(&app_handle, &state).await;
            tokio::time::sleep(LEAGUE_REFRESH_INTERVAL).await;
        }
    });
}

async fn refresh_league_sources(app_handle: &tauri::AppHandle, state: &SharedAppState) {
    let (trade_result, data_result, catalog_result, snapshot_result) = tokio::join!(
        price_check::fetch_trade_leagues(),
        source_truth::fetch_poe2db_leagues(),
        source_truth::fetch_league_catalog(),
        source_truth::refresh_poe2db_data_snapshot(false)
    );

    let mut trade_count = None;
    let mut data_count = None;
    let mut catalog_count = None;

    match trade_result {
        Ok(leagues) => {
            trade_count = Some(leagues.len());
            let selected = preferred_trade_league(&leagues);
            let data_leagues = {
                let locked_state = state.lock().await;
                mark_trade_enabled(locked_state.data_leagues.clone(), &leagues)
            };

            {
                let mut locked_state = state.lock().await;
                locked_state.trade_leagues = leagues.clone();
                locked_state.data_leagues = data_leagues.clone();
                if !locked_state.trade_league_locked {
                    locked_state.trade_league = selected;
                }
            }

            let _ = app_handle.emit("scan://trade-leagues-updated", leagues);
            let _ = app_handle.emit("scan://data-leagues-updated", data_leagues);
            let league = {
                let locked_state = state.lock().await;
                locked_state.trade_league.clone()
            };
            let _ = app_handle.emit("scan://trade-league-updated", league);
        }
        Err(error) => emit_worker_status(
            app_handle,
            "league",
            format!("failed to load official trade leagues: {error}"),
        ),
    }

    match data_result {
        Ok(data_leagues) => {
            data_count = Some(data_leagues.len());
            let trade_leagues = {
                let locked_state = state.lock().await;
                locked_state.trade_leagues.clone()
            };
            let data_leagues = mark_trade_enabled(data_leagues, &trade_leagues);

            {
                let mut locked_state = state.lock().await;
                locked_state.data_leagues = data_leagues.clone();
            }

            let _ = app_handle.emit("scan://data-leagues-updated", data_leagues);
        }
        Err(error) => emit_worker_status(
            app_handle,
            "league",
            format!("failed to load PoE2DB data leagues: {error}"),
        ),
    }

    match catalog_result {
        Ok(catalog) => {
            catalog_count = Some(catalog.len());
            {
                let mut locked_state = state.lock().await;
                locked_state.league_catalog = catalog.clone();
            }
            let _ = app_handle.emit("scan://league-catalog-updated", catalog);
        }
        Err(error) => emit_worker_status(
            app_handle,
            "league",
            format!("failed to build merged league catalog: {error}"),
        ),
    }

    match snapshot_result {
        Ok(snapshot) => {
            {
                let mut locked_state = state.lock().await;
                locked_state.source_truth_snapshot = Some(snapshot.clone());
            }
            let _ = app_handle.emit("scan://source-truth-updated", snapshot);
        }
        Err(error) => emit_worker_status(
            app_handle,
            "source-truth",
            format!("failed to refresh PoE2DB source-truth cache: {error}"),
        ),
    }

    if trade_count.is_some() || data_count.is_some() || catalog_count.is_some() {
        emit_worker_status(
            app_handle,
            "league",
            format!(
                "league feeds refreshed: {} trade, {} PoE2DB data, {} merged; listening every {} minutes",
                trade_count
                    .map(|count| count.to_string())
                    .unwrap_or_else(|| "?".to_string()),
                data_count
                    .map(|count| count.to_string())
                    .unwrap_or_else(|| "?".to_string()),
                catalog_count
                    .map(|count| count.to_string())
                    .unwrap_or_else(|| "?".to_string()),
                LEAGUE_REFRESH_INTERVAL.as_secs() / 60
            ),
        );
    }
}

fn preferred_trade_league(leagues: &[TradeLeague]) -> String {
    leagues
        .iter()
        .find(|league| !league.id.starts_with("HC ") && league.id != "Standard")
        .or_else(|| leagues.iter().find(|league| league.id == "Standard"))
        .or_else(|| leagues.first())
        .map(|league| league.id.clone())
        .unwrap_or_else(|| "Standard".to_string())
}

fn mark_trade_enabled(
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

fn spawn_price_check_worker(
    app_handle: tauri::AppHandle,
    state: SharedAppState,
    item: Item,
    league: String,
    selected_currency: String,
    selected_price_option: String,
    active_filters: Vec<ActivePriceFilter>,
) {
    tauri::async_runtime::spawn(async move {
        let request_item_raw_text = item.raw_text.clone();
        let request_league = league.clone();
        let request_currency = selected_currency.clone();
        let request_price_option = selected_price_option.clone();
        let request_filters = active_filters.clone();
        let outcome = price_check::check_item_price(
            &item,
            Some(&league),
            Some(&selected_currency),
            Some(&selected_price_option),
            &active_filters,
        )
        .await;
        let should_emit = {
            let mut locked_state = state.lock().await;
            let is_current_request = locked_state
                .scanned_item
                .as_ref()
                .map(|current_item| current_item.raw_text == request_item_raw_text)
                .unwrap_or(false)
                && locked_state.trade_league == request_league
                && locked_state.price_currency == request_currency
                && locked_state.price_option == request_price_option
                && locked_state.active_price_filters == request_filters;

            if !is_current_request {
                debug_log::append(
                    "price_check.stale_response_ignored",
                    serde_json::json!({
                        "league": request_league,
                        "selected_currency": request_currency,
                        "selected_price_option": request_price_option,
                        "requested_filters": request_filters,
                    }),
                );
                false
            } else {
                locked_state.price_check = Some(outcome.price_check.clone());
                locked_state.price_check_continuation = outcome.continuation.clone();
                locked_state.price_check_fetch_in_flight = false;
                true
            }
        };
        if should_emit {
            let _ = app_handle.emit("scan://price-check-updated", outcome.price_check);
        }
    });
}

fn spawn_exchange_item_worker(
    app_handle: tauri::AppHandle,
    state: SharedAppState,
    item: Item,
    league: String,
) {
    tauri::async_runtime::spawn(async move {
        let exchange_state = exchange::resolve_item_exchange_state(&item, &league)
            .await
            .unwrap_or_else(|error| exchange::ExchangeTabState {
                categories: exchange::categories(),
                selected_category_id: exchange::default_tab_state().selected_category_id,
                selected_item_id: None,
                overview: None,
                status: "Exchange cache failed.".to_string(),
                error: Some(error),
            });
        let ui_exchange_state: ExchangeTabState = exchange_state.clone().into();
        let price_check = exchange::price_check_from_tab_state(&exchange_state);

        {
            let mut locked_state = state.lock().await;
            locked_state.exchange_tab = ui_exchange_state.clone();
            locked_state.price_check = Some(price_check.clone());
            locked_state.price_check_continuation = None;
            locked_state.price_check_fetch_in_flight = false;
        }
        let _ = app_handle.emit("scan://exchange-tab-updated", ui_exchange_state);
        let _ = app_handle.emit("scan://price-check-updated", price_check);
    });
}

fn spawn_exchange_category_worker(
    app_handle: tauri::AppHandle,
    state: SharedAppState,
    league: String,
    category_id: String,
    force_refresh: bool,
) {
    tauri::async_runtime::spawn(async move {
        let exchange_state =
            match exchange::exchange_overview(&league, &category_id, force_refresh).await {
                Ok(overview) => exchange::ExchangeTabState {
                    categories: exchange::categories(),
                    selected_category_id: category_id.clone(),
                    selected_item_id: None,
                    overview: Some(overview.clone()),
                    status: format!("Cached {} overview ready.", overview.category_label),
                    error: None,
                },
                Err(error) => exchange::ExchangeTabState {
                    categories: exchange::categories(),
                    selected_category_id: category_id.clone(),
                    selected_item_id: None,
                    overview: None,
                    status: "Exchange cache failed.".to_string(),
                    error: Some(error),
                },
            };

        let ui_exchange_state: ExchangeTabState = exchange_state.into();
        {
            let mut locked_state = state.lock().await;
            locked_state.exchange_tab = ui_exchange_state.clone();
        }
        let _ = app_handle.emit("scan://exchange-tab-updated", ui_exchange_state);
    });
}

fn configured_trade_league() -> Option<String> {
    env::var("RELIQUARY_POE2_LEAGUE")
        .ok()
        .map(|league| league.trim().to_string())
        .filter(|league| !league.is_empty())
}

fn start_rdev_listener(input_tx: mpsc::UnboundedSender<InputAction>, state: SharedAppState) -> Result<(), String> {
    thread::Builder::new()
        .name("reliquary-global-input".to_string())
        .spawn(move || {
            let ctrl_down = Arc::new(AtomicBool::new(false));
            let alt_down = Arc::new(AtomicBool::new(false));
            let callback_ctrl = ctrl_down.clone();
            let callback_alt = alt_down.clone();
            let callback_state = state.clone();

            if let Err(error) = listen(move |event| {
                handle_global_input_event(event, &callback_ctrl, &callback_alt, &input_tx, &callback_state);
            }) {
                eprintln!("failed to run global input listener: {error:?}");
            }
        })
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn handle_global_input_event(
    event: rdev::Event,
    ctrl_down: &Arc<AtomicBool>,
    alt_down: &Arc<AtomicBool>,
    input_tx: &mpsc::UnboundedSender<InputAction>,
    state: &SharedAppState,
) {
    match event.event_type {
        EventType::KeyPress(Key::ControlLeft) | EventType::KeyPress(Key::ControlRight) => {
            ctrl_down.store(true, Ordering::SeqCst);
        }
        EventType::KeyRelease(Key::ControlLeft) | EventType::KeyRelease(Key::ControlRight) => {
            ctrl_down.store(false, Ordering::SeqCst);
        }
        EventType::KeyPress(Key::Alt) | EventType::KeyPress(Key::AltGr) => {
            alt_down.store(true, Ordering::SeqCst);
        }
        EventType::KeyRelease(Key::Alt) | EventType::KeyRelease(Key::AltGr) => {
            alt_down.store(false, Ordering::SeqCst);
        }
        EventType::KeyPress(ref key) if active_window_is_poe2() => {
            let locked = state.blocking_lock();
            let scan_key = match locked.scan_key {
                'A' => Key::KeyA, 'B' => Key::KeyB, 'C' => Key::KeyC, 'D' => Key::KeyD,
                'E' => Key::KeyE, 'F' => Key::KeyF, 'G' => Key::KeyG, 'H' => Key::KeyH,
                'I' => Key::KeyI, 'J' => Key::KeyJ, 'K' => Key::KeyK, 'L' => Key::KeyL,
                'M' => Key::KeyM, 'N' => Key::KeyN, 'O' => Key::KeyO, 'P' => Key::KeyP,
                'Q' => Key::KeyQ, 'R' => Key::KeyR, 'S' => Key::KeyS, 'T' => Key::KeyT,
                'U' => Key::KeyU, 'V' => Key::KeyV, 'W' => Key::KeyW, 'X' => Key::KeyX,
                'Y' => Key::KeyY, 'Z' => Key::KeyZ,
                '1' => Key::Num1, '2' => Key::Num2, '3' => Key::Num3, '4' => Key::Num4,
                '5' => Key::Num5, '6' => Key::Num6, '7' => Key::Num7, '8' => Key::Num8,
                '9' => Key::Num9, '0' => Key::Num0,
                _ => return,
            };
            let trade_key = match locked.trade_key {
                'A' => Key::KeyA, 'B' => Key::KeyB, 'C' => Key::KeyC, 'D' => Key::KeyD,
                'E' => Key::KeyE, 'F' => Key::KeyF, 'G' => Key::KeyG, 'H' => Key::KeyH,
                'I' => Key::KeyI, 'J' => Key::KeyJ, 'K' => Key::KeyK, 'L' => Key::KeyL,
                'M' => Key::KeyM, 'N' => Key::KeyN, 'O' => Key::KeyO, 'P' => Key::KeyP,
                'Q' => Key::KeyQ, 'R' => Key::KeyR, 'S' => Key::KeyS, 'T' => Key::KeyT,
                'U' => Key::KeyU, 'V' => Key::KeyV, 'W' => Key::KeyW, 'X' => Key::KeyX,
                'Y' => Key::KeyY, 'Z' => Key::KeyZ,
                '1' => Key::Num1, '2' => Key::Num2, '3' => Key::Num3, '4' => Key::Num4,
                '5' => Key::Num5, '6' => Key::Num6, '7' => Key::Num7, '8' => Key::Num8,
                '9' => Key::Num9, '0' => Key::Num0,
                _ => return,
            };
            let is_scan = key == &scan_key && ((locked.scan_mod == "Ctrl" && ctrl_down.load(Ordering::SeqCst)) || (locked.scan_mod == "Alt" && alt_down.load(Ordering::SeqCst)));
            let is_trade = key == &trade_key && ((locked.trade_mod == "Ctrl" && ctrl_down.load(Ordering::SeqCst)) || (locked.trade_mod == "Alt" && alt_down.load(Ordering::SeqCst)));
            std::mem::drop(locked);

            if is_scan {
                let before = read_clipboard_text().unwrap_or_default();
                for _ in 0..25 {
                    thread::sleep(Duration::from_millis(20));
                    match read_clipboard_text() {
                        Ok(text) if !text.trim().is_empty() && text != before => {
                            if looks_like_poe_item_buffer(&text) {
                                let _ = input_tx.send(InputAction::ClipboardScan(text));
                                return;
                            }
                        }
                        _ => {}
                    }
                }
            }
            if is_trade {
                let _ = input_tx.send(InputAction::OpenTradeSearch);
            }
        }
        _ => {}
    }
}

fn active_window_allows_overlay_visibility() -> bool {
    foreground_window_is_poe2() || is_overlay_window_title(&active_window_title())
}

fn active_window_is_poe2() -> bool {
    foreground_window_is_poe2()
}

fn is_overlay_window_title(title: &str) -> bool {
    let normalized = title.to_ascii_lowercase();
    normalized.contains("reliquary")
}

#[cfg(target_os = "windows")]
fn foreground_window_is_poe2() -> bool {
    let (running, pid) = get_poe2_pid_cache();
    if !running || pid == 0 {
        return false;
    }
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return false;
        }
        let mut proc_id: u32 = 0;
        GetWindowThreadProcessId(hwnd as isize, &mut proc_id);
        proc_id == pid
    }
}

#[cfg(not(target_os = "windows"))]
fn foreground_window_is_poe2() -> bool {
    true
}

#[cfg(target_os = "windows")]
fn get_poe2_pid_cache() -> (bool, u32) {
    use std::sync::Mutex as StdMutex;
    static CACHE: once_cell::sync::Lazy<StdMutex<(bool, u32, std::time::Instant)>> =
        once_cell::sync::Lazy::new(|| StdMutex::new((false, 0, std::time::Instant::now())));

    {
        let cached = CACHE.lock().unwrap();
        if cached.2.elapsed() < Duration::from_secs(3) {
            return (cached.0, cached.1);
        }
    }

    let result = find_poe2_process();
    let mut cached = CACHE.lock().unwrap();
    *cached = (result.is_some(), result.unwrap_or(0), std::time::Instant::now());
    (result.is_some(), result.unwrap_or(0))
}

#[cfg(not(target_os = "windows"))]
fn get_poe2_pid_cache() -> (bool, u32) {
    (true, 0)
}

#[cfg(target_os = "windows")]
fn find_poe2_process() -> Option<u32> {
    unsafe extern "system" {
        fn CreateToolhelp32Snapshot(dwFlags: u32, th32ProcessID: u32) -> isize;
        fn Process32FirstW(hSnapshot: isize, lppe: *mut PROCESSENTRY32W) -> i32;
        fn Process32NextW(hSnapshot: isize, lppe: *mut PROCESSENTRY32W) -> i32;
        fn CloseHandle(hObject: isize) -> i32;
    }

    #[repr(C)]
    #[allow(non_snake_case)]
    struct PROCESSENTRY32W {
        dwSize: u32,
        cntUsage: u32,
        th32ProcessID: u32,
        th32DefaultHeapID: usize,
        th32ModuleID: u32,
        cntThreads: u32,
        th32ParentProcessID: u32,
        pcPriClassBase: i32,
        dwFlags: u32,
        szExeFile: [u16; 260],
    }

    const TH32CS_SNAPPROCESS: u32 = 0x00000002;
    const INVALID_HANDLE_VALUE: isize = -1;

    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE as isize {
            return None;
        }

        let mut pe = std::mem::zeroed::<PROCESSENTRY32W>();
        pe.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

        let mut pid = None;
        if Process32FirstW(snapshot, &mut pe) != 0 {
            loop {
                let end = pe.szExeFile.iter().position(|&c| c == 0).unwrap_or(pe.szExeFile.len());
                let name = String::from_utf16_lossy(&pe.szExeFile[..end]).to_ascii_lowercase();
                if name.contains("pathofexilesteam") || name.contains("pathofexile") {
                    pid = Some(pe.th32ProcessID);
                    break;
                }
                if Process32NextW(snapshot, &mut pe) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snapshot);
        pid
    }
}

#[cfg(target_os = "windows")]
unsafe extern "system" {
    fn GetWindowThreadProcessId(hWnd: isize, lpdwProcessId: *mut u32) -> u32;
}


#[cfg(target_os = "windows")]
fn active_window_title() -> String {
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.is_null() {
        return String::new();
    }

    let length = unsafe { GetWindowTextLengthW(hwnd) };
    if length <= 0 {
        return String::new();
    }

    let mut buffer = vec![0u16; length as usize + 1];
    let copied = unsafe { GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32) };
    if copied <= 0 {
        return String::new();
    }

    String::from_utf16_lossy(&buffer[..copied as usize])
}

#[cfg(not(target_os = "windows"))]
fn active_window_title() -> String {
    "Path of Exile 2".to_string()
}

fn read_clipboard_text() -> Result<String, WorkerError> {
    let mut clipboard =
        Clipboard::new().map_err(|error| WorkerError::Clipboard(error.to_string()))?;
    clipboard
        .get_text()
        .map_err(|error| WorkerError::Clipboard(error.to_string()))
}

fn spawn_client_log_worker(app_handle: tauri::AppHandle, state: SharedAppState) {
    tauri::async_runtime::spawn(async move {
        let client_log_path = client_log_path();
        emit_worker_status(
            &app_handle,
            "client-log",
            format!("watching {}", client_log_path.display()),
        );

        if let Err(error) =
            stream_client_log(app_handle.clone(), state, client_log_path.clone()).await
        {
            emit_worker_error(
                &app_handle,
                WorkerError::ClientLog {
                    path: client_log_path.display().to_string(),
                    source: error,
                },
            );
        }
    });
}

async fn stream_client_log(
    app_handle: tauri::AppHandle,
    state: SharedAppState,
    client_log_path: PathBuf,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use tokio::fs::File;
    use tokio::io::{AsyncBufReadExt, BufReader};

    debug_log::append(
        "client-log.started",
        serde_json::json!({
            "path": client_log_path.display().to_string(),
            "exists": client_log_path.exists(),
        }),
    );

    let generating_re = Regex::new(r#"Generating level (\d+) area "([^"]+)""#)
        .expect("valid area generation regex");

    let mut last_size = tokio::fs::metadata(&client_log_path)
        .await
        .map(|m| m.len())
        .unwrap_or(0);

    if last_size > 0 {
        let catch_up_start = if last_size > 8192 { last_size - 8192 } else { 0 };
        debug_log::append(
            "client-log.catch-up",
            serde_json::json!({ "total_size": last_size, "catch_up_start": catch_up_start }),
        );
        if let Ok(mut file) = File::open(&client_log_path).await {
            use tokio::io::AsyncSeekExt;
            let _ = file.seek(std::io::SeekFrom::Start(catch_up_start)).await;
            let mut reader = BufReader::new(file);
            let mut line_buf = String::new();
            loop {
                line_buf.clear();
                match reader.read_line(&mut line_buf).await {
                    Ok(0) => break,
                    Ok(_) => {
                        let content = line_buf.trim_end().to_string();
                        process_log_line(&content, &generating_re, &app_handle, &state).await;
                    }
                    Err(_) => break,
                }
            }
        }
    }

    loop {
        if let Ok(meta) = tokio::fs::metadata(&client_log_path).await {
            let current_size = meta.len();
            if current_size > last_size {
                let start = last_size;
                last_size = current_size;
                debug_log::append(
                    "client-log.poll",
                    serde_json::json!({ "start": start, "size": current_size, "delta": current_size - start }),
                );
                if let Ok(mut file) = File::open(&client_log_path).await {
                    use tokio::io::AsyncSeekExt;
                    let _ = file.seek(std::io::SeekFrom::Start(start)).await;
                    let mut reader = BufReader::new(file);
                    let mut line_buf = String::new();
                    loop {
                        line_buf.clear();
                        match reader.read_line(&mut line_buf).await {
                            Ok(0) => break,
                            Ok(_) => {
                                let content = line_buf.trim_end().to_string();
                                debug_log::append(
                                    "client-log.line",
                                    serde_json::json!({ "c": &content }),
                                );
                                process_log_line(&content, &generating_re, &app_handle, &state)
                                    .await;
                            }
                            Err(_) => break,
                        }
                    }
                }
            }
        }
        tokio::time::sleep(Duration::from_millis(1000)).await;
    }
}

async fn process_log_line(
    content: &str,
    generating_re: &Regex,
    app_handle: &tauri::AppHandle,
    state: &SharedAppState,
) {
    if let Some(caps) = generating_re.captures(content) {
        if let (Some(level_str), Some(id)) = (caps.get(1), caps.get(2)) {
            if let Ok(level) = level_str.as_str().parse::<u32>() {
                debug_log::append(
                    "client-log.area-generated",
                    serde_json::json!({
                        "internal_id": id.as_str(),
                        "level": level,
                    }),
                );
                let internal_id = id.as_str().to_string();
                let area_type = classify_area_kind(&internal_id);
                let waystone_data = {
                    let locked_state = state.lock().await;
                    locked_state.scanned_item.as_ref().and_then(|item| {
                        if item.family == "waystone"
                            || item.base_type.as_deref().map_or(false, |bt| {
                                bt.to_ascii_lowercase().contains("waystone")
                                    || bt.to_ascii_lowercase().contains("tablet")
                            })
                        {
                            let mod_count = item.explicit_mods.len();
                            let quantity =
                                parse_waystone_number(&item.property_lines, "increased Quantity")
                                    .or_else(|| {
                                        parse_waystone_number_from_text(
                                            &item.raw_text,
                                            "increased Quantity",
                                        )
                                    });
                            let rarity =
                                parse_waystone_number_from_text(&item.raw_text, "increased Rarity");
                            let pack_size =
                                parse_waystone_number(&item.property_lines, "Monster Pack Size")
                                    .or_else(|| {
                                        parse_waystone_number_from_text(&item.raw_text, "Pack Size")
                                    });
                            let hazard_count = item.hazards.len();
                            Some((mod_count, quantity, rarity, pack_size, hazard_count))
                        } else {
                            None
                        }
                    })
                };

                let areas = read_world_areas();
                let area_meta = areas.and_then(|map| map.get(&internal_id));
                let display_name = area_meta
                    .and_then(|m| m.name.clone())
                    .unwrap_or_else(|| internal_id_to_display(&internal_id));
                debug_log::append(
                    "client-log.area-meta-lookup",
                    serde_json::json!({
                        "id": internal_id,
                        "found": area_meta.is_some(),
                        "has_act": area_meta.and_then(|m| m.act).is_some(),
                    }),
                );
                let area = CurrentAreaInfo {
                    name: display_name,
                    area_level: Some(level),
                    area_type: area_type.to_string(),
                    entered_at_epoch_ms: now_epoch_ms(),
                    act: area_meta.and_then(|m| m.act),
                    waystone_mod_count: waystone_data.map(|w| w.0),
                    waystone_quantity: waystone_data.and_then(|w| w.1),
                    waystone_rarity: waystone_data.and_then(|w| w.2),
                    waystone_pack_size: waystone_data.and_then(|w| w.3),
                    waystone_hazard_count: waystone_data.map(|w| w.4),
                    boss: area_boss(&internal_id),
                };

                debug_log::append(
                    "client-log.area-updated",
                    serde_json::json!({
                        "name": area.name,
                        "area_type": area.area_type,
                        "area_level": area.area_level,
                        "boss": area.boss,
                        "act": area.act,
                    }),
                );

                let mut locked_state = state.lock().await;
                locked_state.current_zone = area.name.clone();
                locked_state.current_area = Some(area.clone());
                let _ = app_handle.emit("scan://zone-updated", &area.name);
                let _ = app_handle.emit("scan://area-updated", &area);
                return;
            }
        }
    }

    if let Some(zone) = zone_from_log_line(content) {
        let area_type = area_type_from_scene_source(&zone);
        let mut locked_state = state.lock().await;

        if area_type.is_none() {
            let matches_current_area = locked_state
                .current_area
                .as_ref()
                .map(|area| display_names_match(&area.name, &zone))
                .unwrap_or(false);

            if matches_current_area {
                locked_state.current_zone = zone.clone();
                let _ = app_handle.emit("scan://zone-updated", zone);
            }
            return;
        }

        let area = CurrentAreaInfo {
            name: zone.clone(),
            area_level: None,
            area_type: area_type.unwrap_or("other").to_string(),
            entered_at_epoch_ms: now_epoch_ms(),
            act: None,
            waystone_mod_count: None,
            waystone_quantity: None,
            waystone_rarity: None,
            waystone_pack_size: None,
            waystone_hazard_count: None,
            boss: None,
        };
        locked_state.current_zone = zone.clone();
        locked_state.current_area = Some(area.clone());
        let _ = app_handle.emit("scan://zone-updated", zone);
        let _ = app_handle.emit("scan://area-updated", area);
    }

    if let Some(whisper) = whispers::evaluate_whisper_string(content) {
        {
            let mut locked_state = state.lock().await;
            locked_state.trade_queue.push(whisper.clone());
        }
        let _ = app_handle.emit("scan://trade-whisper", whisper);
    }

    let _ = app_handle.emit("scan://client-log-line", content);
}

fn internal_id_to_display(id: &str) -> String {
    let id = id
        .strip_prefix("Map")
        .or_else(|| id.strip_prefix("map"))
        .or_else(|| id.strip_prefix("Hideout"))
        .or_else(|| id.strip_prefix("hideout"))
        .unwrap_or(id)
        .trim_matches('_');
    let mut result = String::new();
    for (i, ch) in id.chars().enumerate() {
        if i > 0 && ch.is_uppercase() && !result.ends_with(' ') {
            result.push(' ');
        }
        if ch == '_' {
            if !result.ends_with(' ') {
                result.push(' ');
            }
        } else {
            result.push(ch);
        }
    }
    let result = result.trim().to_string();
    if result.is_empty() {
        return id.to_string();
    }
    result
}

fn display_names_match(a: &str, b: &str) -> bool {
    let normalize = |value: &str| {
        value
            .chars()
            .filter(|ch| ch.is_alphanumeric())
            .flat_map(|ch| ch.to_lowercase())
            .collect::<String>()
    };
    normalize(a) == normalize(b)
}

fn area_type_from_scene_source(zone: &str) -> Option<&'static str> {
    let normalized = zone.to_ascii_lowercase();
    if normalized == "atlas" || normalized == "(null)" {
        return None;
    }
    if normalized.contains("hideout") {
        return Some("hideout");
    }
    if normalized.contains("encampment")
        || normalized.contains("refuge")
        || normalized.contains("town")
        || zone_ends_with(&normalized, &["_town"])
    {
        return Some("town");
    }
    None
}

fn client_log_path() -> PathBuf {
    if let Ok(path) = env::var("POE2_CLIENT_LOG") {
        let p = PathBuf::from(path);
        if p.exists() {
            return p;
        }
    }

    for drive in ["G", "D", "E", "F", "C"] {
        for prefix in [
            format!("{drive}:\\Steam\\steamapps\\common\\Path of Exile 2\\logs\\Client.txt"),
            format!("{drive}:\\SteamLibrary\\steamapps\\common\\Path of Exile 2\\logs\\Client.txt"),
            format!("{drive}:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile 2\\logs\\Client.txt"),
        ] {
            let path = PathBuf::from(&prefix);
            if path.exists() {
                return path;
            }
        }
    }

    let default_steam = PathBuf::from(
        "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile 2\\logs\\Client.txt",
    );
    if default_steam.exists() {
        return default_steam;
    }

    let documents = if let Ok(up) = env::var("USERPROFILE") {
        PathBuf::from(up)
            .join("Documents")
            .join("My Games")
            .join("Path of Exile 2")
            .join("Client.txt")
    } else if let Ok(home) = env::var("HOME") {
        PathBuf::from(home)
            .join("Documents")
            .join("My Games")
            .join("Path of Exile 2")
            .join("Client.txt")
    } else {
        return PathBuf::from("Client.txt");
    };

    if documents.exists() {
        return documents;
    }

    PathBuf::from("Client.txt")
}

fn item_from_clipboard(raw_text: String, league: Option<&str>) -> Item {
    let mut item = item_parser::parse_item_buffer(raw_text);

    if is_waystone_like(&item) {
        if let Ok(catalog) = hazards::load_hazard_catalog(hazard_catalog_path()) {
            item.hazards = hazards::check_waystone_hazards(&item.explicit_mods, &catalog);
        }
    }

    item.trade_url = trade_search::marketplace_url_for_item(&item, league).ok();

    item
}

fn looks_like_poe_item_buffer(raw_text: &str) -> bool {
    raw_text.contains("Rarity:") && raw_text.contains("--------")
}

fn is_waystone_like(item: &Item) -> bool {
    item.item_class
        .as_deref()
        .map(|item_class| {
            let normalized = item_class.to_lowercase();
            normalized.contains("waystone") || normalized.contains("map")
        })
        .unwrap_or(false)
}

fn hazard_catalog_path() -> PathBuf {
    env::var("RELIQUARY_BANNED_MODS")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("src-tauri").join("banned_mods.json"))
}

fn zone_from_log_line(line: &str) -> Option<String> {
    if let Some(start) = line.find("[SCENE] Set Source [") {
        let rest = &line[start + "[SCENE] Set Source [".len()..];
        if let Some(end) = rest.find(']') {
            let name = &rest[..end];
            if name == "(null)" {
                return None;
            }
            return Some(name.to_string());
        }
    }
    None
}

fn emit_worker_status(app_handle: &tauri::AppHandle, worker: &'static str, message: String) {
    let _ = app_handle.emit("scan://worker-status", WorkerStatus { worker, message });
}

fn emit_worker_error(app_handle: &tauri::AppHandle, error: WorkerError) {
    let _ = app_handle.emit(
        "scan://worker-error",
        WorkerStatus {
            worker: "backend",
            message: error.to_string(),
        },
    );
}

fn create_listing_preview_window<R: tauri::Runtime>(
    app: &mut tauri::App<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    if app
        .get_webview_window(LISTING_PREVIEW_WINDOW_LABEL)
        .is_some()
    {
        return Ok(());
    }

    let preview_window = WebviewWindowBuilder::new(
        app.handle(),
        LISTING_PREVIEW_WINDOW_LABEL,
        WebviewUrl::App("index.html?preview=listing".into()),
    )
    .title("Reliquary Listing Preview")
    .inner_size(LISTING_PREVIEW_WIDTH, LISTING_PREVIEW_HEIGHT)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .focusable(false)
    .shadow(false)
    .visible(false)
    .build()?;

    preview_window.set_ignore_cursor_events(true)?;
    Ok(())
}

fn position_listing_preview(
    main_window: &tauri::Window,
    preview_window: &tauri::WebviewWindow,
    anchor_top: f64,
) -> Result<(), String> {
    let main_position = main_window
        .outer_position()
        .map_err(|error| error.to_string())?;
    let main_size = main_window
        .outer_size()
        .map_err(|error| error.to_string())?;
    let monitor = main_window
        .current_monitor()
        .map_err(|error| error.to_string())?;

    let mut x = main_position.x as f64 + main_size.width as f64 + LISTING_PREVIEW_GAP;
    let mut y = main_position.y as f64 + anchor_top;

    if let Some(monitor) = monitor {
        let monitor_position = monitor.position();
        let monitor_size = monitor.size();
        let monitor_right = monitor_position.x + monitor_size.width as i32;
        let monitor_bottom = monitor_position.y + monitor_size.height as i32;

        if x + LISTING_PREVIEW_WIDTH > monitor_right as f64 - LISTING_PREVIEW_GAP {
            x = main_position.x as f64 - LISTING_PREVIEW_WIDTH - LISTING_PREVIEW_GAP;
        }

        x = x.clamp(
            monitor_position.x as f64 + LISTING_PREVIEW_GAP,
            monitor_right as f64 - LISTING_PREVIEW_WIDTH - LISTING_PREVIEW_GAP,
        );

        y = y.clamp(
            monitor_position.y as f64 + LISTING_PREVIEW_GAP,
            monitor_bottom as f64 - LISTING_PREVIEW_HEIGHT - LISTING_PREVIEW_GAP,
        );
    }

    preview_window
        .set_position(Position::Physical(PhysicalPosition::new(
            x.round() as i32,
            y.round() as i32,
        )))
        .map_err(|error| error.to_string())
}

fn now_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn parse_waystone_number(lines: &[String], needle: &str) -> Option<u32> {
    let needle = needle.to_ascii_lowercase();
    for line in lines {
        let lower = line.to_ascii_lowercase();
        if lower.contains(&needle) {
            if let Some(num) = lower.split_whitespace().find_map(|w| {
                w.trim_end_matches('%')
                    .trim_end_matches('+')
                    .parse::<u32>()
                    .ok()
            }) {
                return Some(num);
            }
        }
    }
    None
}

fn parse_waystone_number_from_text(text: &str, needle: &str) -> Option<u32> {
    let needle = needle.to_ascii_lowercase();
    let lower = text.to_ascii_lowercase();
    if lower.contains(&needle) {
        lower.split_whitespace().find_map(|w| {
            w.trim_end_matches('%')
                .trim_end_matches('+')
                .parse::<u32>()
                .ok()
        })
    } else {
        None
    }
}

use std::collections::HashMap;
use std::sync::OnceLock;

static WORLD_AREAS: OnceLock<HashMap<String, AreaMeta>> = OnceLock::new();

#[derive(Debug, Clone)]
struct AreaMeta {
    biome: Option<String>,
    boss: Option<String>,
    act: Option<u32>,
    name: Option<String>,
}

fn init_world_areas() {
    let path = world_areas_cache_path();
    let data = if path.exists() {
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|text| parse_world_areas(&text))
    } else {
        None
    };
    let map = data.unwrap_or_default();
    debug_log::append(
        "world-areas.init",
        serde_json::json!({
            "path": path.display().to_string(),
            "exists": path.exists(),
            "count": map.len(),
            "has_g1_2": map.contains_key("G1_2"),
            "has_g1_town": map.contains_key("G1_town"),
        }),
    );
    let _ = WORLD_AREAS.set(map);
}

fn read_world_areas() -> Option<&'static HashMap<String, AreaMeta>> {
    WORLD_AREAS.get()
}

fn area_boss(internal_id: &str) -> Option<String> {
    read_world_areas()
        .and_then(|map| map.get(internal_id))
        .and_then(|m| m.boss.clone())
}

fn world_areas_cache_path() -> PathBuf {
    if let Ok(base) = env::var("LOCALAPPDATA") {
        let dir = PathBuf::from(base).join("Reliquary");
        let _ = std::fs::create_dir_all(&dir);
        return dir.join("world_areas.json");
    }
    PathBuf::from("world_areas.json")
}

fn parse_world_areas(data: &str) -> Option<HashMap<String, AreaMeta>> {
    let root: serde_json::Value = serde_json::from_str(data).ok()?;
    let obj = root.as_object()?;
    let mut map = HashMap::new();

    for (id, entry) in obj {
        let tags: Vec<String> = entry
            .get("tags")?
            .as_array()?
            .iter()
            .filter_map(|t| t.as_str().map(String::from))
            .collect();

        let is_map = tags.contains(&"map".to_string());

        let biome = is_map.then(|| {
            tags.iter()
                .find(|t| t.ends_with("_biome"))
                .map(|t| t.trim_end_matches("_biome").replace('_', " "))
        }).flatten();

        let boss_path = is_map.then(|| {
            entry.get("bosses")
                .and_then(|b| {
                    b.as_str().map(|s| s.to_string()).or_else(|| {
                        b.as_array()
                            .and_then(|arr| arr.first())
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string())
                    })
                })
                .filter(|s| !s.is_empty())
                .map(|s| extract_boss_name(&s))
        }).flatten();

        let act = entry
            .get("act")
            .and_then(|a| a.as_u64())
            .filter(|a| *a > 0)
            .map(|a| a as u32);

        let area_name = entry.get("name").and_then(|n| n.as_str()).map(String::from);

        map.insert(
            id.clone(),
            AreaMeta {
                biome: biome.filter(|b| !b.is_empty()),
                boss: boss_path,
                act,
                name: area_name,
            },
        );
    }

    if map.is_empty() {
        None
    } else {
        Some(map)
    }
}

fn extract_boss_name(path: &str) -> String {
    let parts: Vec<&str> = path.split('/').collect();
    if parts.len() < 2 {
        return path.to_string();
    }
    let name = parts[parts.len() - 2];
    let name = name
        .trim_end_matches(|c: char| c.is_ascii_digit() || c == '_')
        .trim_end_matches("MAP")
        .trim_end_matches("Boss")
        .trim_end_matches("__")
        .trim_end_matches('_');

    let mut result = String::new();
    for (i, ch) in name.chars().enumerate() {
        if i > 0 && ch.is_uppercase() && !result.ends_with(' ') {
            result.push(' ');
        }
        result.push(ch);
    }
    let result = result.trim().to_string();
    if result.is_empty() {
        return name.to_string();
    }
    result
}
