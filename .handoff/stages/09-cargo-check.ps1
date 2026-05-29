Write-Host "=== Stage 9/9: cargo check ===" -ForegroundColor Cyan
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root
cargo check --manifest-path src-tauri/Cargo.toml 2>&1
if ($LASTEXITCODE -ne 0) { throw "cargo check failed" }
Write-Host "✓ cargo check OK" -ForegroundColor Green
