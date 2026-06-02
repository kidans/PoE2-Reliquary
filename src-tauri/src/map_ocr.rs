use std::{
    env, fs,
    path::PathBuf,
    process::{Command, Stdio},
    time::{SystemTime, UNIX_EPOCH},
};

use crate::map_context::{MapOcrEvidence, MapOcrEvidenceState};

#[derive(Debug, Clone, Copy)]
pub struct OcrCaptureRect {
    pub left: i32,
    pub top: i32,
    pub width: i32,
    pub height: i32,
}

pub fn read_overlay_mods(rect: OcrCaptureRect, captured_at_epoch_ms: u64) -> MapOcrEvidence {
    match read_overlay_lines(rect) {
        Ok(raw_lines) => evidence_from_lines(raw_lines, captured_at_epoch_ms),
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
fn read_overlay_lines(rect: OcrCaptureRect) -> Result<Vec<String>, String> {
    let image_path = temp_capture_path("png");
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
    let _ = fs::remove_file(&image_path);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Windows OCR helper exited without output".to_string()
        } else {
            stderr
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect())
}

#[cfg(not(target_os = "windows"))]
fn read_overlay_lines(_rect: OcrCaptureRect) -> Result<Vec<String>, String> {
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
foreach ($line in $result.Lines) {{
  $line.Text
}}
"#,
        left = rect.left.max(0),
        top = rect.top.max(0),
        width = rect.width.max(1),
        height = rect.height.max(1),
    )
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
