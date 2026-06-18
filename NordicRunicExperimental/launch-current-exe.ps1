$exe = "C:\Projects\Kalandra\src-tauri\target\release\reliquary.exe"

if (!(Test-Path -LiteralPath $exe)) {
  Write-Error "Reliquary executable was not found at: $exe"
  exit 1
}

Start-Process -FilePath $exe
