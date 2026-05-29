Write-Host "=== Stage 7/9: npm run build ===" -ForegroundColor Cyan
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root
npm run build 2>&1
if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
Write-Host "✓ npm run build OK" -ForegroundColor Green
