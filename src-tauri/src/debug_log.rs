use std::{
    env,
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde_json::json;

const DEFAULT_LOG_DIR_NAME: &str = "Reliquary";
const DEFAULT_LOG_FILE_NAME: &str = "reliquary-debug.log";
const MAX_LOG_BYTES: u64 = 2 * 1024 * 1024;
const ROTATED_LOG_SUFFIX: &str = "1";

pub fn append(event: &str, data: serde_json::Value) {
    if let Err(error) = append_inner(event, data) {
        eprintln!("failed to write Reliquary debug log: {error}");
    }
}

pub fn path() -> PathBuf {
    if let Ok(path) = env::var("RELIQUARY_DEBUG_LOG") {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }

    if cfg!(target_os = "windows") {
        if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
            return PathBuf::from(local_app_data)
                .join(DEFAULT_LOG_DIR_NAME)
                .join(DEFAULT_LOG_FILE_NAME);
        }
    }

    env::temp_dir()
        .join(DEFAULT_LOG_DIR_NAME)
        .join(DEFAULT_LOG_FILE_NAME)
}

pub fn print_cli(args: &[String]) -> Result<(), String> {
    let log_path = path();

    if args.iter().any(|arg| arg == "--path") {
        println!("{}", log_path.display());
        return Ok(());
    }

    let mut content = String::new();
    match OpenOptions::new().read(true).open(&log_path) {
        Ok(mut file) => {
            file.read_to_string(&mut content)
                .map_err(|error| error.to_string())?;
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            println!("No debug log exists yet at {}", log_path.display());
            return Ok(());
        }
        Err(error) => return Err(error.to_string()),
    }

    if let Some(tail_count) = tail_count(args) {
        let lines = content.lines().rev().take(tail_count).collect::<Vec<_>>();
        for line in lines.into_iter().rev() {
            println!("{line}");
        }
        return Ok(());
    }

    print!("{content}");
    Ok(())
}

fn append_inner(event: &str, data: serde_json::Value) -> Result<(), String> {
    let log_path = path();
    if let Some(parent) = log_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    rotate_if_needed(&log_path)?;

    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();

    let entry = json!({
        "ts_ms": timestamp_ms,
        "event": event,
        "data": data,
    });

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|error| error.to_string())?;
    writeln!(file, "{entry}").map_err(|error| error.to_string())
}

fn rotate_if_needed(log_path: &PathBuf) -> Result<(), String> {
    let Ok(metadata) = fs::metadata(log_path) else {
        return Ok(());
    };

    if metadata.len() < MAX_LOG_BYTES {
        return Ok(());
    }

    let rotated_path = rotated_log_path(log_path);
    if rotated_path.exists() {
        fs::remove_file(&rotated_path).map_err(|error| error.to_string())?;
    }
    fs::rename(log_path, rotated_path).map_err(|error| error.to_string())
}

fn rotated_log_path(log_path: &Path) -> PathBuf {
    let mut rotated = log_path.to_path_buf().into_os_string();
    rotated.push(format!(".{ROTATED_LOG_SUFFIX}"));
    PathBuf::from(rotated)
}

fn tail_count(args: &[String]) -> Option<usize> {
    args.windows(2).find_map(|window| {
        (window[0] == "--tail")
            .then(|| window[1].parse::<usize>().ok())
            .flatten()
    })
}
