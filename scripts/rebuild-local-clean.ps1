$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$now = Get-Date
$gitCommit = (& git rev-parse --short HEAD 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $gitCommit) { $gitCommit = 'unknown' }
$env:ZHIXU_BUILD_ID = $now.ToString('yyyyMMdd-HHmmss')
$env:ZHIXU_GIT_COMMIT = $gitCommit.Trim()
$env:ZHIXU_BUILD_TIME = $now.ToString('yyyy-MM-ddTHH:mm:sszzz')

Write-Host "Clean production build: $($env:ZHIXU_BUILD_ID) · $($env:ZHIXU_GIT_COMMIT)" -ForegroundColor Yellow
& docker compose down --remove-orphans
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& docker compose build --no-cache
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& docker compose up -d --force-recreate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& docker compose ps
exit $LASTEXITCODE
