use std::{
    env,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::Duration,
};

use arboard::Clipboard;
use linemux::MuxedLines;
use rdev::{listen, Event, EventType, Key};
use serde::{Deserialize, Serialize};
use tauri::{
    Emitter, LogicalSize, Manager, PhysicalPosition, Position, Size, WebviewUrl,
    WebviewWindowBuilder,
};
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
const SETTINGS_WINDOW_WIDTH: f64 = 740.0;
const SETTINGS_WINDOW_HEIGHT: f64 = 620.0;
const TRADE_WINDOW_WIDTH: f64 = 1000.0;
const TRADE_WINDOW_HEIGHT: f64 = 760.0;
const LISTING_PREVIEW_WINDOW_LABEL: &str = "listing-preview";
const LISTING_PREVIEW_WIDTH: f64 = 360.0;
const LISTING_PREVIEW_HEIGHT: f64 = 560.0;
const LISTING_PREVIEW_GAP: f64 = 12.0;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AppState {
    pub scanned_item: Option<Item>,
    pub trade_queue: Vec<TradeWhisper>,
    pub current_zone: String,
    pub trade_league: String,
    pub league_catalog: Vec<LeagueCatalogEntry>,
    pub trade_leagues: Vec<TradeLeague>,
    pub data_leagues: Vec<DataLeague>,
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ActivePriceFilter {
    pub kind: String,
    pub label: String,
    pub value: Option<f64>,
    pub template: String,
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

    window
        .set_size(Size::Logical(LogicalSize::new(width, height)))
        .map_err(|error| error.to_string())
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

            let state = app.state::<SharedAppState>().inner().clone();
            let app_handle = app.handle().clone();

            spawn_trade_league_worker(app_handle.clone(), state.clone());
            spawn_global_input_worker(app_handle.clone(), state.clone());
            spawn_window_attachment_worker(app_handle.clone());
            spawn_client_log_worker(app_handle, state);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Reliquary Tauri application");
}

fn spawn_global_input_worker(app_handle: tauri::AppHandle, state: SharedAppState) {
    tauri::async_runtime::spawn(async move {
        let (input_tx, mut input_rx) = mpsc::unbounded_channel::<InputAction>();
        let listener_handle = app_handle.clone();

        if let Err(error) = start_rdev_listener(input_tx) {
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
    let (trade_result, data_result, catalog_result) = tokio::join!(
        price_check::fetch_trade_leagues(),
        source_truth::fetch_poe2db_leagues(),
        source_truth::fetch_league_catalog()
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

fn start_rdev_listener(input_tx: mpsc::UnboundedSender<InputAction>) -> Result<(), String> {
    thread::Builder::new()
        .name("reliquary-global-input".to_string())
        .spawn(move || {
            let ctrl_down = Arc::new(AtomicBool::new(false));
            let alt_down = Arc::new(AtomicBool::new(false));
            let callback_ctrl = ctrl_down.clone();
            let callback_alt = alt_down.clone();

            if let Err(error) = listen(move |event| {
                handle_global_input_event(event, &callback_ctrl, &callback_alt, &input_tx);
            }) {
                eprintln!("failed to run global input listener: {error:?}");
            }
        })
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn handle_global_input_event(
    event: Event,
    ctrl_down: &Arc<AtomicBool>,
    alt_down: &Arc<AtomicBool>,
    input_tx: &mpsc::UnboundedSender<InputAction>,
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
        EventType::KeyPress(Key::KeyC)
            if ctrl_down.load(Ordering::SeqCst) && active_window_is_poe2() =>
        {
            thread::sleep(Duration::from_millis(20));
            match read_clipboard_text() {
                Ok(text) if !text.trim().is_empty() => {
                    let _ = input_tx.send(InputAction::ClipboardScan(text));
                }
                Ok(_) => {}
                Err(error) => eprintln!("{error}"),
            }
        }
        EventType::KeyPress(Key::KeyD)
            if alt_down.load(Ordering::SeqCst) && active_window_is_poe2() =>
        {
            let _ = input_tx.send(InputAction::OpenTradeSearch);
        }
        _ => {}
    }
}

fn active_window_allows_overlay_visibility() -> bool {
    let title = active_window_title();
    is_poe_window_title(&title) || is_overlay_window_title(&title)
}

fn active_window_is_poe2() -> bool {
    is_poe_window_title(&active_window_title())
}

fn is_poe_window_title(title: &str) -> bool {
    let normalized = title.to_ascii_lowercase();
    normalized.contains("path of exile 2") || normalized.contains("path of exile")
}

fn is_overlay_window_title(title: &str) -> bool {
    let normalized = title.to_ascii_lowercase();
    normalized.contains("reliquary")
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
    let mut lines = MuxedLines::new()?;
    lines.add_file(&client_log_path).await?;

    while let Some(line) = lines.next_line().await? {
        let content = line.line().to_string();
        if let Some(zone) = zone_from_log_line(&content) {
            {
                let mut locked_state = state.lock().await;
                locked_state.current_zone = zone.clone();
            }
            let _ = app_handle.emit("scan://zone-updated", zone);
        }

        if let Some(whisper) = whispers::evaluate_whisper_string(&content) {
            {
                let mut locked_state = state.lock().await;
                locked_state.trade_queue.push(whisper.clone());
            }
            let _ = app_handle.emit("scan://trade-whisper", whisper);
        }

        let _ = app_handle.emit("scan://client-log-line", content);
    }

    Ok(())
}

fn client_log_path() -> PathBuf {
    if let Ok(path) = env::var("POE2_CLIENT_LOG") {
        return PathBuf::from(path);
    }

    if cfg!(target_os = "windows") {
        if let Ok(user_profile) = env::var("USERPROFILE") {
            return PathBuf::from(user_profile)
                .join("Documents")
                .join("My Games")
                .join("Path of Exile 2")
                .join("Client.txt");
        }
    }

    if let Ok(home) = env::var("HOME") {
        return PathBuf::from(home)
            .join("Documents")
            .join("My Games")
            .join("Path of Exile 2")
            .join("Client.txt");
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
    const MARKER: &str = "You have entered ";
    let start = line.find(MARKER)? + MARKER.len();
    Some(line[start..].trim_end_matches('.').trim().to_string())
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
