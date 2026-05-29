Write-Host "=== Stage 1/9: git fetch origin ===" -ForegroundColor Cyan
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root
git fetch origin 2>&1
if ($LASTEXITCODE -ne 0) { throw "git fetch failed" }
Write-Host "✓ git fetch origin OK" -ForegroundColor Green
