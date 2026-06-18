$ErrorActionPreference = "Stop"

$exe = Join-Path $PSScriptRoot "app\src-tauri\target\release\reliquary-runic-experiment.exe"
if (-not (Test-Path -LiteralPath $exe)) {
    throw "Runic experiment executable not found. Build it first with: cd $PSScriptRoot\app; npm run tauri:build"
}

Start-Process -FilePath $exe
