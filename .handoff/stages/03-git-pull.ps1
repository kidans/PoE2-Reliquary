Write-Host "=== Stage 3/9: git pull ===" -ForegroundColor Cyan
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root
git pull 2>&1
if ($LASTEXITCODE -ne 0) { throw "git pull failed" }
Write-Host "✓ git pull OK" -ForegroundColor Green
