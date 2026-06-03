use std::{
    env, fs,
    path::PathBuf,
    process::{Command, Stdio},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};

use crate::{
    debug_log,
    map_context::{MapOcrEvidence, MapOcrEvidenceState},
};

const OCR_DEBUG_DIR_NAME: &str = "ocr-debug";
const OCR_DEBUG_ARTIFACT_PREFIX: &str = "tab-overlay-ocr";
const MAX_OCR_DEBUG_ARTIFACTS: usize = 40;

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
            let raw_lines = capture
                .lines
                .iter()
                .map(|line| line.text.clone())
                .collect::<Vec<_>>();
            let evidence = evidence_from_lines(raw_lines, captured_at_epoch_ms);
            log_ocr_capture(&capture, &evidence);
            evidence
        }
        Err(error) => MapOcrEvidence {
            state: MapOcrEvidenceState::Partial,
            normalized_mods: Vec::new(),
            raw_lines: Vec::new(),
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
        _ => Some("OCR did not find recognizable map modifier lines".to_string()),
    };

    MapOcrEvidence {
        state,
        normalized_mods,
        raw_lines,
        confidence_score: Some(score),
        reason,
        captured_at_epoch_ms,
    }
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
    output.trim().to_string()
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
        "quantity",
        "waystones",
        "chests",
        "rare monsters",
        "magic monsters",
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
    ]
    .iter()
    .any(|needle| lower.contains(needle));

    has_map_subject && has_modifier_language
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
    let lines = serde_json::from_str::<Vec<OcrDebugLine>>(&stdout)
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

#[cfg(not(target_os = "windows"))]
fn read_overlay_capture(
    _rect: OcrCaptureRect,
    _captured_at_epoch_ms: u64,
) -> Result<OcrDebugCapture, String> {
    Err("Tab overlay OCR is only wired on Windows for this pass".to_string())
}

#[cfg(target_os = "windows")]
fn windows_ocr_script(image_path: &PathBuf, rect: OcrCaptureRect) -> String {
    let image_path = image_path.display().to_string().replace('\'', "''");
    format!(
        r#"
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$imagePath = '{image_path}'
$bitmap = New-Object System.Drawing.Bitmap({width}, {height})
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen({left}, {top}, 0, 0, $bitmap.Size)
$bitmap.Save($imagePath, [System.Drawing.Imaging.ImageFormat]::Png)
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

    let mut files = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            let file_name = path.file_name()?.to_string_lossy();
            if !file_name.starts_with(OCR_DEBUG_ARTIFACT_PREFIX) {
                return None;
            }
            let modified = entry.metadata().ok()?.modified().ok()?;
            Some((path, modified))
        })
        .collect::<Vec<_>>();

    if files.len() <= MAX_OCR_DEBUG_ARTIFACTS {
        return;
    }

    files.sort_by_key(|(_, modified)| *modified);
    let remove_count = files.len().saturating_sub(MAX_OCR_DEBUG_ARTIFACTS);
    for (path, _) in files.into_iter().take(remove_count) {
        let _ = fs::remove_file(path);
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
}
