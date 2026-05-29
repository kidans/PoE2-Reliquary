Write-Host "=== Stage 4/9: python scripts/apply_priority_0_1.py ===" -ForegroundColor Cyan
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root
python scripts/apply_priority_0_1.py 2>&1
if ($LASTEXITCODE -ne 0) { throw "apply_priority_0_1.py failed" }
Write-Host "✓ apply_priority_0_1.py OK" -ForegroundColor Green
