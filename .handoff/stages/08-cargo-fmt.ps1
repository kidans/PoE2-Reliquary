Write-Host "=== Stage 8/9: cargo fmt ===" -ForegroundColor Cyan
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root
cargo fmt --manifest-path src-tauri/Cargo.toml 2>&1
if ($LASTEXITCODE -ne 0) { throw "cargo fmt failed" }
Write-Host "✓ cargo fmt OK" -ForegroundColor Green
