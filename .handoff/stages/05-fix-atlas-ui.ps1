Write-Host "=== Stage 5/9: python scripts/fix_atlas_ui.py ===" -ForegroundColor Cyan
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root
python scripts/fix_atlas_ui.py 2>&1
if ($LASTEXITCODE -ne 0) { throw "fix_atlas_ui.py failed" }
Write-Host "✓ fix_atlas_ui.py OK" -ForegroundColor Green
