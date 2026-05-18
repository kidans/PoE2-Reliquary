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
use tauri::{Emitter, Manager};
use thiserror::Error;
use tokio::sync::{mpsc, Mutex};

pub type SharedAppState = Arc<Mutex<AppState>>;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AppState {
    pub scanned_item: Option<Item>,
    pub trade_queue: Vec<TradeWhisper>,
    pub current_zone: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Item {
    pub name: String,
    pub rarity: String,
    pub explicit_mods: Vec<String>,
    pub raw_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeWhisper {
    pub buyer_name: String,
    pub item: String,
    pub price: String,
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
async fn get_app_state(state: tauri::State<'_, SharedAppState>) -> AppState {
    state.lock().await.clone()
}

pub fn run() {
    tauri::Builder::default()
        .manage(SharedAppState::default())
        .invoke_handler(tauri::generate_handler![
            get_app_state,
            set_click_passthrough
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").ok_or_else(|| {
                std::io::Error::new(std::io::ErrorKind::NotFound, "main window was not created")
            })?;
            window.set_always_on_top(true)?;
            window.set_ignore_cursor_events(true)?;

            let state = app.state::<SharedAppState>().inner().clone();
            let app_handle = app.handle().clone();

            spawn_global_input_worker(app_handle.clone(), state.clone());
            spawn_client_log_worker(app_handle, state);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Lumen-Scan Tauri application");
}

fn spawn_global_input_worker(app_handle: tauri::AppHandle, state: SharedAppState) {
    tauri::async_runtime::spawn(async move {
        let (clipboard_tx, mut clipboard_rx) = mpsc::unbounded_channel::<String>();
        let listener_handle = app_handle.clone();

        if let Err(error) = start_rdev_listener(clipboard_tx) {
            emit_worker_error(&listener_handle, WorkerError::InputListener(error));
            return;
        }

        emit_worker_status(
            &listener_handle,
            "input",
            "global Ctrl+C listener started".to_string(),
        );

        while let Some(raw_text) = clipboard_rx.recv().await {
            let scanned_item = item_from_clipboard(raw_text);
            {
                let mut locked_state = state.lock().await;
                locked_state.scanned_item = Some(scanned_item.clone());
            }

            if let Err(error) = app_handle.emit("scan://item-updated", scanned_item) {
                emit_worker_status(
                    &app_handle,
                    "input",
                    format!("failed to emit scanned item update: {error}"),
                );
            }
        }
    });
}

fn start_rdev_listener(clipboard_tx: mpsc::UnboundedSender<String>) -> Result<(), String> {
    thread::Builder::new()
        .name("lumen-scan-global-input".to_string())
        .spawn(move || {
            let ctrl_down = Arc::new(AtomicBool::new(false));
            let callback_ctrl = ctrl_down.clone();

            if let Err(error) = listen(move |event| {
                handle_global_input_event(event, &callback_ctrl, &clipboard_tx);
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
    clipboard_tx: &mpsc::UnboundedSender<String>,
) {
    match event.event_type {
        EventType::KeyPress(Key::ControlLeft) | EventType::KeyPress(Key::ControlRight) => {
            ctrl_down.store(true, Ordering::SeqCst);
        }
        EventType::KeyRelease(Key::ControlLeft) | EventType::KeyRelease(Key::ControlRight) => {
            ctrl_down.store(false, Ordering::SeqCst);
        }
        EventType::KeyPress(Key::KeyC) if ctrl_down.load(Ordering::SeqCst) => {
            thread::sleep(Duration::from_millis(20));
            match read_clipboard_text() {
                Ok(text) if !text.trim().is_empty() => {
                    let _ = clipboard_tx.send(text);
                }
                Ok(_) => {}
                Err(error) => eprintln!("{error}"),
            }
        }
        _ => {}
    }
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
                    source: Box::new(error),
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

fn item_from_clipboard(raw_text: String) -> Item {
    let mut non_empty_lines = raw_text.lines().filter(|line| !line.trim().is_empty());
    let rarity = non_empty_lines
        .find_map(|line| line.strip_prefix("Rarity: ").map(str::to_string))
        .unwrap_or_else(|| "Unknown".to_string());

    let name = raw_text
        .lines()
        .skip_while(|line| !line.starts_with("Rarity: "))
        .skip(1)
        .find(|line| !line.trim().is_empty() && !line.starts_with("--------"))
        .map(|line| line.trim().to_string())
        .unwrap_or_else(|| "Unknown Item".to_string());

    let explicit_mods = raw_text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter(|line| !line.starts_with("Rarity: "))
        .filter(|line| !line.starts_with("Item Class: "))
        .filter(|line| !line.starts_with("--------"))
        .filter(|line| line.contains('%') || line.contains('+') || line.contains("increased"))
        .map(str::to_string)
        .collect();

    Item {
        name,
        rarity,
        explicit_mods,
        raw_text,
    }
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
