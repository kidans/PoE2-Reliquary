Write-Host "=== Stage 6/9: npm ci --ignore-scripts ===" -ForegroundColor Cyan
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root
npm ci --ignore-scripts 2>&1
if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
Write-Host "✓ npm ci OK" -ForegroundColor Green
