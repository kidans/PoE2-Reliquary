Write-Host "=== Stage 2/9: git checkout project/map-run-context-plan ===" -ForegroundColor Cyan
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root
git checkout project/map-run-context-plan 2>&1
if ($LASTEXITCODE -ne 0) { throw "git checkout failed" }
Write-Host "✓ git checkout OK" -ForegroundColor Green
