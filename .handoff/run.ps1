param(
  [ValidateSet("all","resume","delegate","status")]
  [string]$Action = "status"
)

$root = Split-Path -Parent $PSScriptRoot
$stages = @(
  @{id="git-fetch";      script="01-git-fetch.ps1";       deps=@()}
  @{id="git-checkout";   script="02-git-checkout.ps1";    deps=@("git-fetch")}
  @{id="git-pull";       script="03-git-pull.ps1";        deps=@("git-checkout")}
  @{id="apply-p0-p1";   script="04-apply-priority.ps1";  deps=@("git-pull")}
  @{id="fix-atlas-ui";   script="05-fix-atlas-ui.ps1";    deps=@("git-pull")}
  @{id="npm-ci";         script="06-npm-ci.ps1";          deps=@("apply-p0-p1","fix-atlas-ui")}
  @{id="npm-build";      script="07-npm-build.ps1";       deps=@("npm-ci")}
  @{id="cargo-fmt";      script="08-cargo-fmt.ps1";       deps=@("npm-build")}
  @{id="cargo-check";    script="09-cargo-check.ps1";     deps=@("cargo-fmt")}
)

Set-Location $root

switch ($Action) {
  "status" {
    Write-Host "Pipeline: project/map-run-context-plan" -ForegroundColor Cyan
    foreach ($s in $stages) {
      $state = if (Test-Path ".handoff\.$($s.id).ok") { "✓" } else { "·" }
      Write-Host "  $state $($s.id)"
    }
  }

  "all" {
    foreach ($s in $stages) {
      if (Test-Path ".handoff\.$($s.id).ok") { Write-Host "SKIP $($s.id) (already done)"; continue }
      & "$PSScriptRoot\stages\$($s.script)"
      if ($LASTEXITCODE -eq 0) { New-Item -ItemType File -Path ".handoff\.$($s.id).ok" -Force | Out-Null }
      else { Write-Host "FAILED at $($s.id)" -ForegroundColor Red; exit 1 }
    }
    Write-Host "=== ALL STAGES COMPLETE ===" -ForegroundColor Green
  }

  "resume" {
    $found = $false
    foreach ($s in $stages) {
      if (Test-Path ".handoff\.$($s.id).ok") { continue }
      if (-not $found) { $found = $true; Write-Host "RESUMING at $($s.id)" -ForegroundColor Yellow }
      & "$PSScriptRoot\stages\$($s.script)"
      if ($LASTEXITCODE -eq 0) { New-Item -ItemType File -Path ".handoff\.$($s.id).ok" -Force | Out-Null }
      else { Write-Host "FAILED at $($s.id)" -ForegroundColor Red; exit 1 }
    }
    if (-not $found) { Write-Host "All stages already complete." -ForegroundColor Green }
  }

  "delegate" {
    Write-Host "Delegating next pending stage..." -ForegroundColor Cyan
    foreach ($s in $stages) {
      if (Test-Path ".handoff\.$($s.id).ok") { continue }
      $depsOk = $true
      foreach ($d in $s.deps) { if (-not (Test-Path ".handoff\.$d.ok")) { $depsOk = $false; break } }
      if (-not $depsOk) { Write-Host "  $($s.id): waiting on deps"; continue }
      Write-Host "  → Delegating: $($s.id)" -ForegroundColor Yellow
      & "$PSScriptRoot\stages\$($s.script)"
      if ($LASTEXITCODE -eq 0) { New-Item -ItemType File -Path ".handoff\.$($s.id).ok" -Force | Out-Null }
      else { Write-Host "FAILED at $($s.id)" -ForegroundColor Red; exit 1 }
      break
    }
  }
}
