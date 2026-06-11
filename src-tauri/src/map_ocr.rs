use std::{
    collections::HashMap,
    env, fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{SystemTime, UNIX_EPOCH},
};

use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::{
    debug_log,
    map_context::{MapOcrEvidence, MapOcrEvidenceState, MapOcrSummary},
};

const OCR_DEBUG_DIR_NAME: &str = "ocr-debug";
const OCR_DEBUG_ARTIFACT_PREFIX: &str = "tab-overlay-ocr";
const MAX_OCR_DEBUG_CAPTURES: usize = 40;

#[derive(Debug, Clone, Copy, Serialize)]
pub struct OcrCaptureRect {
    pub left: i32,
    pub top: i32,
    pub width: i32,
    pub height: i32,
}

pub fn read_overlay_mods(rect: OcrCaptureRect, captured_at_epoch_ms: u64) -> MapOcrEvidence {
    match read_overlay_capture(rect, captured_at_epoch_ms) {
        Ok(capture) => {
            let raw_lines = modifier_line_texts_from_capture(&capture);
            let evidence = evidence_from_lines(raw_lines, captured_at_epoch_ms);
            log_ocr_capture(&capture, &evidence);
            evidence
        }
        Err(error) => MapOcrEvidence {
            state: MapOcrEvidenceState::Partial,
            normalized_mods: Vec::new(),
            raw_lines: Vec::new(),
            summary: None,
            confidence_score: Some(0.0),
            reason: Some(error),
            captured_at_epoch_ms,
        },
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct OcrDebugCapture {
    pub rect: OcrCaptureRect,
    pub image_path: PathBuf,
    pub json_path: PathBuf,
    pub lines: Vec<OcrDebugLine>,
    pub captured_at_epoch_ms: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct OcrDebugLine {
    pub text: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    #[serde(default)]
    pub words: Vec<OcrDebugWord>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct OcrDebugWord {
    pub text: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub fn modifier_line_texts_from_capture(capture: &OcrDebugCapture) -> Vec<String> {
    let mut lines = capture.lines.clone();
    lines.sort_by(|left, right| {
        left.y
            .partial_cmp(&right.y)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| {
                left.x
                    .partial_cmp(&right.x)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
    });

    let right_edge = lines
        .iter()
        .map(|line| line.x + line.width)
        .fold(0.0_f64, f64::max);
    let panel_min_x = right_edge * 0.42;
    let objective_cutoff_y = lines
        .iter()
        .filter(|line| line.y > 40.0)
        .find(|line| is_overlay_section_boundary(&line.text))
        .map(|line| line.y);

    lines
        .into_iter()
        .filter(|line| {
            let text = normalize_ocr_line(&line.text);
            if text.is_empty() || is_overlay_section_boundary(&text) {
                return false;
            }
            if let Some(cutoff_y) = objective_cutoff_y {
                if line.y >= cutoff_y {
                    return false;
                }
            }

            // The Tab panel lives on the right side of the crop. This rejects
            // left-side world labels/objectives that bleed into wide captures.
            let line_right_edge = line.x + line.width;
            line.x >= panel_min_x || line_right_edge >= right_edge * 0.72
        })
        .map(|line| line.text)
        .collect()
}

pub fn evidence_from_lines(raw_lines: Vec<String>, captured_at_epoch_ms: u64) -> MapOcrEvidence {
    let normalized_mods = normalize_ocr_lines(&raw_lines);
    let score = confidence_score(&raw_lines, &normalized_mods);
    let state = if normalized_mods.len() >= 2 && score >= 0.58 {
        MapOcrEvidenceState::Confirmed
    } else if !normalized_mods.is_empty() {
        MapOcrEvidenceState::Partial
    } else {
        MapOcrEvidenceState::None
    };
    let reason = match state {
        MapOcrEvidenceState::Confirmed => Some("matched known map modifier vocabulary".to_string()),
        MapOcrEvidenceState::Partial => {
            Some("some OCR lines looked like map modifiers, but confidence is low".to_string())
        }
        _ if raw_lines.is_empty() => Some("OCR returned no readable lines".to_string()),
        _ => Some("OCR read non-map text; open the in-game Tab map modifier panel".to_string()),
    };

    MapOcrEvidence {
        state,
        summary: (!normalized_mods.is_empty()).then(|| summarize_ocr_mods(&normalized_mods)),
        normalized_mods,
        raw_lines,
        confidence_score: Some(score),
        reason,
        captured_at_epoch_ms,
    }
}

fn summarize_ocr_mods(normalized_mods: &[String]) -> MapOcrSummary {
    let mut summary = MapOcrSummary {
        modifier_count: normalized_mods.len(),
        ..MapOcrSummary::default()
    };

    for line in normalized_mods {
        let lower = line.to_ascii_lowercase();

        if lower.contains("rarity")
            || lower.contains("quantity")
            || lower.contains("pack size")
            || lower.contains("experience")
            || lower.contains("waystone")
            || lower.contains("chest")
        {
            summary.reward_lines.push(line.clone());
        }

        if lower.contains("players")
            || lower.contains("cursed")
            || lower.contains("recovery")
            || lower.contains("flask")
        {
            summary.player_danger_lines.push(line.clone());
        }

        if lower.contains("monster")
            || lower.contains("monsters")
            || lower.contains("armoured")
            || lower.contains("ground")
        {
            summary.monster_danger_lines.push(line.clone());
        }

        for (needle, label) in [
            ("breach", "Breach"),
            ("abyss", "Abyss"),
            ("ritual", "Ritual"),
            ("delirium", "Delirium"),
            ("strongbox", "Strongbox"),
            ("chest", "Chest"),
        ] {
            if lower.contains(needle) && !summary.content_flags.iter().any(|item| item == label) {
                summary.content_flags.push(label.to_string());
            }
        }
    }

    summary
}

pub fn normalize_ocr_lines(raw_lines: &[String]) -> Vec<String> {
    let mut normalized = Vec::new();
    for line in raw_lines {
        let line = normalize_ocr_line(line);
        if line.len() < 8 || !looks_like_map_modifier(&line) {
            continue;
        }
        if !normalized.iter().any(|existing| existing == &line) {
            normalized.push(line);
        }
    }
    normalized
}

fn normalize_ocr_line(line: &str) -> String {
    let mut output = String::new();
    let mut previous_space = false;
    for character in line.chars() {
        let character = match character {
            '{' | '[' => '(',
            '}' | ']' => ')',
            '|' => 'I',
            '’' | '`' => '\'',
            '–' | '—' => '-',
            _ => character,
        };

        if character.is_whitespace() {
            if !previous_space {
                output.push(' ');
            }
            previous_space = true;
        } else if character.is_ascii_graphic() || character == '%' {
            output.push(character);
            previous_space = false;
        }
    }
    repair_common_map_ocr_line(output.trim())
}

fn looks_like_map_modifier(line: &str) -> bool {
    let lower = line.to_ascii_lowercase();
    let known_overlay_noise = [
        "monsters remain",
        "monster level",
        "short allocation",
        "league",
        "realm",
        "map objectives",
        "map content",
        "frame",
        "fps",
        "cpu:",
        "gpu:",
        "network:",
        "server",
        "checkpoint",
        "defeat ",
        "complete all",
        "map device",
    ]
    .iter()
    .any(|needle| lower.contains(needle));
    if known_overlay_noise {
        return false;
    }

    let has_map_subject = [
        "monster",
        "monsters",
        "players",
        "area",
        "pack size",
        "rarity",
        "experience",
        "quantity",
        "waystones",
        "chests",
        "rare monsters",
        "magic monsters",
        "ritual",
        "shrine",
        "shrines",
        "abyss",
        "abysses",
        "delirium",
        "breach",
        "rogue exile",
        "rogue exiles",
        "strongbox",
        "strongboxes",
        "altar",
        "altars",
        "armoured",
        "ground",
        "cursed",
    ]
    .iter()
    .any(|needle| lower.contains(needle));

    let has_modifier_language = [
        "%",
        "increased",
        "reduced",
        "more",
        "less",
        "extra damage",
        "damage from",
        "resistance",
        "critical",
        "stun",
        "effectiveness",
        "found",
        "pack size",
        "chance",
        "contains",
        "contain",
        "has patches",
        "are armoured",
        "are mirrored",
        "is corrupted",
        "corrupted",
        "grant",
        "cursed with",
        "ritual altars",
        "mirror of delirium",
        "strongboxes",
    ]
    .iter()
    .any(|needle| lower.contains(needle));

    has_map_subject && has_modifier_language
}

fn is_overlay_section_boundary(line: &str) -> bool {
    let letters = line
        .chars()
        .filter(|character| character.is_ascii_alphabetic())
        .collect::<String>()
        .to_ascii_lowercase();
    if letters.contains("mapobjectives") || letters.contains("mapcontent") {
        return true;
    }

    // Windows OCR sometimes splits the word into "MAPSOB 'ECTIVES".
    (letters.contains("objectives") || letters.contains("bectives")) && letters.contains("map")
}

fn repair_common_map_ocr_line(line: &str) -> String {
    static MORE_FOUND_RE: Lazy<Regex> =
        Lazy::new(|| Regex::new(r"(?i)\b(\d+(?:\.\d+)?)%\s+more\s+found\s+in\s+area\b").unwrap());
    static MORE_OF_ITEMS_RE: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r"(?i)\b(\d+(?:\.\d+)?)%\s+more\s+of\s+items\s+found\s+in\s+this\s+area\b")
            .unwrap()
    });
    static POISON_GARBLED_RE: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r"(?i)\b(monsters\s+have\s+\d+(?:\.\d+)?%\s+chance\s+to)\s+.+?\s+on\b").unwrap()
    });

    let mut repaired = line
        .replace("AITACK", "ATTACK")
        .replace("Aitack", "Attack")
        .replace(" Hve ", " Have ")
        .replace(" hve ", " have ")
        .replace(" HVE ", " HAVE ");

    repaired = MORE_OF_ITEMS_RE
        .replace_all(&repaired, "$1% more Rarity of Items found in this Area")
        .to_string();
    repaired = MORE_FOUND_RE
        .replace_all(&repaired, "$1% more Waystones found in Area")
        .to_string();
    let upper = repaired.to_ascii_uppercase();
    if upper.contains("CHANCE TO")
        && upper.contains("P")
        && (upper.contains("Q") || upper.contains("O"))
        && upper.ends_with(" ON")
    {
        repaired = POISON_GARBLED_RE
            .replace_all(&repaired, "$1 Poison on Hit")
            .to_string();
    }

    repaired
}

fn confidence_score(raw_lines: &[String], normalized_mods: &[String]) -> f32 {
    if raw_lines.is_empty() {
        return 0.0;
    }
    let ratio = normalized_mods.len() as f32 / raw_lines.len().max(1) as f32;
    let count_bonus = (normalized_mods.len() as f32 * 0.08).min(0.28);
    (0.35 + ratio * 0.45 + count_bonus).min(1.0)
}

#[cfg(target_os = "windows")]
fn read_overlay_capture(
    rect: OcrCaptureRect,
    captured_at_epoch_ms: u64,
) -> Result<OcrDebugCapture, String> {
    let debug_dir = ocr_debug_dir();
    fs::create_dir_all(&debug_dir)
        .map_err(|error| format!("failed to create OCR debug directory: {error}"))?;
    prune_ocr_debug_artifacts(&debug_dir);

    let image_path = debug_dir.join(format!(
        "{OCR_DEBUG_ARTIFACT_PREFIX}-{captured_at_epoch_ms}.png"
    ));
    let json_path = debug_dir.join(format!(
        "{OCR_DEBUG_ARTIFACT_PREFIX}-{captured_at_epoch_ms}.json"
    ));
    let script_path = temp_capture_path("ps1");
    let script = windows_ocr_script(&image_path, rect);
    fs::write(&script_path, script)
        .map_err(|error| format!("failed to write OCR script: {error}"))?;

    let output = Command::new("powershell.exe")
        .arg("-NoProfile")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-File")
        .arg(&script_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| format!("failed to start Windows OCR helper: {error}"))?;

    let _ = fs::remove_file(&script_path);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Windows OCR helper exited without output".to_string()
        } else {
            stderr
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let lines = parse_ocr_debug_lines(&stdout)
        .map_err(|error| format!("failed to parse Windows OCR JSON: {error}; output={stdout}"))?;
    let capture = OcrDebugCapture {
        rect,
        image_path,
        json_path: json_path.clone(),
        lines,
        captured_at_epoch_ms,
    };
    let sidecar = serde_json::to_string_pretty(&capture)
        .map_err(|error| format!("failed to serialize OCR debug sidecar: {error}"))?;
    fs::write(&json_path, sidecar)
        .map_err(|error| format!("failed to write OCR debug sidecar: {error}"))?;
    Ok(capture)
}

fn parse_ocr_debug_lines(stdout: &str) -> Result<Vec<OcrDebugLine>, serde_json::Error> {
    let trimmed = stdout.trim();
    serde_json::from_str::<Vec<OcrDebugLine>>(trimmed).or_else(|_| {
        let sanitized = strip_json_control_characters(trimmed);
        serde_json::from_str::<Vec<OcrDebugLine>>(&sanitized)
    })
}

fn strip_json_control_characters(input: &str) -> String {
    input
        .chars()
        .filter(|character| !character.is_control() || matches!(character, '\n' | '\r' | '\t'))
        .collect()
}

#[cfg(not(target_os = "windows"))]
fn read_overlay_capture(
    _rect: OcrCaptureRect,
    _captured_at_epoch_ms: u64,
) -> Result<OcrDebugCapture, String> {
    Err("Tab overlay OCR is only wired on Windows for this pass".to_string())
}

#[cfg(target_os = "windows")]
fn windows_ocr_script(image_path: &Path, rect: OcrCaptureRect) -> String {
    let image_path = image_path.display().to_string().replace('\'', "''");
    format!(
        r#"
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$ErrorActionPreference = 'Stop'
$imagePath = '{image_path}'
$bitmap = New-Object System.Drawing.Bitmap({width}, {height})
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen({left}, {top}, 0, 0, $bitmap.Size)
$scale = 2
$scaledWidth = [int]($bitmap.Width * $scale)
$scaledHeight = [int]($bitmap.Height * $scale)
$ocrBitmap = New-Object System.Drawing.Bitmap -ArgumentList $scaledWidth, $scaledHeight
$ocrGraphics = [System.Drawing.Graphics]::FromImage($ocrBitmap)
$ocrGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$ocrGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$ocrGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$ocrGraphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$ocrGraphics.DrawImage($bitmap, 0, 0, $ocrBitmap.Width, $ocrBitmap.Height)
$ocrBitmap.Save($imagePath, [System.Drawing.Imaging.ImageFormat]::Png)
$ocrGraphics.Dispose()
$ocrBitmap.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

[void][Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
[void][Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType=WindowsRuntime]
[void][Windows.Storage.FileAccessMode, Windows.Storage, ContentType=WindowsRuntime]
[void][Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
[void][Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
[void][Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]
[void][Windows.Media.Ocr.OcrResult, Windows.Foundation, ContentType=WindowsRuntime]

$asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {{
  $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1
}} | Select-Object -First 1

function Await-WinRt($operation, [type]$resultType) {{
  $task = $asTaskGeneric.MakeGenericMethod($resultType).Invoke($null, @($operation))
  $task.Wait()
  return $task.Result
}}

$file = Await-WinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($imagePath)) ([Windows.Storage.StorageFile])
$stream = Await-WinRt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await-WinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$softwareBitmap = Await-WinRt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($null -eq $engine) {{
  throw 'Windows OCR engine unavailable for user profile languages'
}}
$result = Await-WinRt ($engine.RecognizeAsync($softwareBitmap)) ([Windows.Media.Ocr.OcrResult])
$lines = @()
foreach ($line in $result.Lines) {{
  $words = @()
  foreach ($word in $line.Words) {{
    $rect = $word.BoundingRect
    $words += [pscustomobject]@{{
      text = $word.Text
      x = [double]$rect.X
      y = [double]$rect.Y
      width = [double]$rect.Width
      height = [double]$rect.Height
    }}
  }}

  if ($words.Count -gt 0) {{
    $minX = ($words | Measure-Object -Property x -Minimum).Minimum
    $minY = ($words | Measure-Object -Property y -Minimum).Minimum
    $maxX = ($words | ForEach-Object {{ $_.x + $_.width }} | Measure-Object -Maximum).Maximum
    $maxY = ($words | ForEach-Object {{ $_.y + $_.height }} | Measure-Object -Maximum).Maximum
    $lines += [pscustomobject]@{{
      text = $line.Text
      x = [double]$minX
      y = [double]$minY
      width = [double]($maxX - $minX)
      height = [double]($maxY - $minY)
      words = $words
    }}
  }} else {{
    $lines += [pscustomobject]@{{
      text = $line.Text
      x = 0.0
      y = 0.0
      width = 0.0
      height = 0.0
      words = @()
    }}
  }}
}}
ConvertTo-Json -InputObject $lines -Depth 5 -Compress
"#,
        left = rect.left.max(0),
        top = rect.top.max(0),
        width = rect.width.max(1),
        height = rect.height.max(1),
    )
}

fn log_ocr_capture(capture: &OcrDebugCapture, evidence: &MapOcrEvidence) {
    debug_log::append(
        "map_ocr.capture_debug",
        serde_json::json!({
            "captured_at_epoch_ms": capture.captured_at_epoch_ms,
            "image_path": capture.image_path.display().to_string(),
            "json_path": capture.json_path.display().to_string(),
            "rect": capture.rect,
            "raw_count": capture.lines.len(),
            "normalized_count": evidence.normalized_mods.len(),
            "state": evidence.state.clone(),
            "confidence_score": evidence.confidence_score,
            "lines": &capture.lines,
        }),
    );
}

fn ocr_debug_dir() -> PathBuf {
    if let Ok(path) = env::var("RELIQUARY_OCR_DEBUG_DIR") {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }

    if let Some(parent) = debug_log::path().parent() {
        return parent.join(OCR_DEBUG_DIR_NAME);
    }

    env::temp_dir().join("Reliquary").join(OCR_DEBUG_DIR_NAME)
}

fn prune_ocr_debug_artifacts(debug_dir: &PathBuf) {
    let Ok(entries) = fs::read_dir(debug_dir) else {
        return;
    };

    let mut captures: HashMap<String, (std::time::SystemTime, Vec<PathBuf>)> = HashMap::new();
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        let Some(file_name) = path.file_name().map(|name| name.to_string_lossy()) else {
            continue;
        };
        if !file_name.starts_with(OCR_DEBUG_ARTIFACT_PREFIX) {
            continue;
        }
        let Some(stem) = path
            .file_stem()
            .map(|stem| stem.to_string_lossy().to_string())
        else {
            continue;
        };
        let Some(modified) = entry
            .metadata()
            .ok()
            .and_then(|metadata| metadata.modified().ok())
        else {
            continue;
        };

        let entry = captures.entry(stem).or_insert((modified, Vec::new()));
        if modified > entry.0 {
            entry.0 = modified;
        }
        entry.1.push(path);
    }

    if captures.len() <= MAX_OCR_DEBUG_CAPTURES {
        return;
    }

    let mut captures = captures.into_values().collect::<Vec<_>>();
    captures.sort_by_key(|(modified, _)| *modified);
    let remove_count = captures.len().saturating_sub(MAX_OCR_DEBUG_CAPTURES);
    for (_, paths) in captures.into_iter().take(remove_count) {
        for path in paths {
            let _ = fs::remove_file(path);
        }
    }
}

fn temp_capture_path(extension: &str) -> PathBuf {
    let epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    env::temp_dir().join(format!("reliquary-map-ocr-{epoch}.{extension}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn debug_line(text: &str, x: f64, y: f64, width: f64) -> OcrDebugLine {
        OcrDebugLine {
            text: text.to_string(),
            x,
            y,
            width,
            height: 24.0,
            words: Vec::new(),
        }
    }

    #[test]
    fn normalizes_map_modifier_lines_and_rejects_noise() {
        let lines = vec![
            "Monsters take 29% reduced Extra Damage from Critical Hits".to_string(),
            "More than 50 monsters remain".to_string(),
            "Monster Level: 79".to_string(),
            "Chest".to_string(),
            "Zelina".to_string(),
            "25% More Waystones Found in Area".to_string(),
        ];

        let normalized = normalize_ocr_lines(&lines);

        assert_eq!(normalized.len(), 2);
        assert!(normalized[0].contains("Monsters take 29% reduced Extra Damage"));
        assert!(normalized[1].contains("Waystones Found in Area"));
    }

    #[test]
    fn filters_capture_to_right_tab_panel_before_objectives() {
        let capture = OcrDebugCapture {
            rect: OcrCaptureRect {
                left: 1000,
                top: 240,
                width: 1500,
                height: 520,
            },
            image_path: PathBuf::from("capture.png"),
            json_path: PathBuf::from("capture.json"),
            captured_at_epoch_ms: 100,
            lines: vec![
                debug_line("Chec", 260.0, 250.0, 80.0),
                debug_line("19% INCREASED MONSTER DAMAGE", 930.0, 57.0, 520.0),
                debug_line("AREA HAS PATCHES OF CHILLED GROUND", 890.0, 125.0, 660.0),
                debug_line("MAPSOB 'ECTIVES", 930.0, 344.0, 360.0),
                debug_line("Defeat Grudgeclash, Vile Thorn.", 780.0, 373.0, 620.0),
                debug_line("MAP CONTENT", 980.0, 434.0, 320.0),
            ],
        };

        let lines = modifier_line_texts_from_capture(&capture);

        assert_eq!(
            lines,
            vec![
                "19% INCREASED MONSTER DAMAGE".to_string(),
                "AREA HAS PATCHES OF CHILLED GROUND".to_string(),
            ]
        );
    }

    #[test]
    fn accepts_area_mechanics_and_repairs_common_ocr_damage() {
        let lines = vec![
            "AREA CONTAINS RITUAL ALTARS".to_string(),
            "AREAS CONTAIN A MIRROR OF DELIRIUM".to_string(),
            "MONSTERS ARE ARMOURED".to_string(),
            "PLAYERS ARE PERIODICALLY CURSED WITH ELEMENTAL WEAKNESS".to_string(),
            "60% MORE FOUND IN AREA".to_string(),
            "13% MORE OF ITEMS FOUND IN THIS AREA".to_string(),
            "MONSTERS HAVE 27% CHANCE TO .P.Q.I}QN ON".to_string(),
            "SHRINES GRANT A RANDOM ADDITIONAL SHRINE EFFECT".to_string(),
            "AREA IS CORRUPTED".to_string(),
        ];

        let normalized = normalize_ocr_lines(&lines);

        assert!(normalized
            .iter()
            .any(|line| line == "AREA CONTAINS RITUAL ALTARS"));
        assert!(normalized
            .iter()
            .any(|line| line == "AREAS CONTAIN A MIRROR OF DELIRIUM"));
        assert!(normalized
            .iter()
            .any(|line| line == "MONSTERS ARE ARMOURED"));
        assert!(normalized
            .iter()
            .any(|line| line == "PLAYERS ARE PERIODICALLY CURSED WITH ELEMENTAL WEAKNESS"));
        assert!(normalized
            .iter()
            .any(|line| line == "60% more Waystones found in Area"));
        assert!(normalized
            .iter()
            .any(|line| line == "13% more Rarity of Items found in this Area"));
        assert!(normalized
            .iter()
            .any(|line| line == "MONSTERS HAVE 27% CHANCE TO Poison on Hit"));
        assert!(normalized
            .iter()
            .any(|line| line == "SHRINES GRANT A RANDOM ADDITIONAL SHRINE EFFECT"));
        assert!(normalized.iter().any(|line| line == "AREA IS CORRUPTED"));
    }

    #[test]
    fn evidence_marks_multiple_matched_lines_as_confirmed() {
        let evidence = evidence_from_lines(
            vec![
                "Monsters have 92% increased Stun Buildup".to_string(),
                "9% increased Pack Size".to_string(),
                "25% more Waystones Found in Area".to_string(),
            ],
            100,
        );

        assert_eq!(evidence.state, MapOcrEvidenceState::Confirmed);
        assert!(evidence.confidence_score.unwrap_or_default() >= 0.58);
    }

    #[test]
    fn parses_windows_ocr_json_after_stripping_control_characters() {
        let lines = parse_ocr_debug_lines(
            "[{\"text\":\"MONSTERS HAVE 31% CHANCE TO P\u{7}OISON ON HIT\",\"x\":1,\"y\":2,\"width\":3,\"height\":4,\"words\":[]}]",
        )
        .expect("sanitized OCR JSON should parse");

        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].text, "MONSTERS HAVE 31% CHANCE TO POISON ON HIT");
    }

    #[test]
    fn evidence_includes_compact_summary_for_confirmed_map_mods() {
        let evidence = evidence_from_lines(
            vec![
                "AREA CONTAINS BREACHES".to_string(),
                "CHESTS HAVE 20% INCREASED ITEM QUANTITY".to_string(),
                "18% INCREASED RARITY OF ITEMS FOUND IN THIS AREA".to_string(),
                "114% INCREASED EXPERIENCE GAIN".to_string(),
                "9% INCREASED PACK SIZE".to_string(),
                "35% MORE WAYSTONES FOUND IN AREA".to_string(),
                "PLAYERS ARE PERIODICALLY CURSED WITH ENFEEBLE".to_string(),
                "MONSTERS HAVE 30% INCREASED ACCURACY RATING".to_string(),
            ],
            100,
        );

        let summary = evidence.summary.expect("summary");
        assert_eq!(summary.modifier_count, 8);
        assert!(summary.content_flags.contains(&"Breach".to_string()));
        assert_eq!(summary.reward_lines.len(), 5);
        assert_eq!(summary.player_danger_lines.len(), 1);
        assert_eq!(summary.monster_danger_lines.len(), 1);
    }

    #[test]
    fn evidence_reason_distinguishes_non_map_ocr_text_from_empty_capture() {
        let evidence = evidence_from_lines(
            vec![
                "The Grand Expedition".to_string(),
                "Explore the Islands in search of Gwennen".to_string(),
            ],
            100,
        );

        assert_eq!(evidence.state, MapOcrEvidenceState::None);
        assert!(evidence
            .reason
            .as_deref()
            .unwrap_or_default()
            .contains("non-map text"));
    }
}
