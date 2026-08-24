$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$listener = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
$owningProcessId = if ($listener) { $listener.OwningProcess } else { $null }
if (-not $owningProcessId) {
    $netstatLine = netstat -ano -p tcp | Select-String -Pattern '^\s*TCP\s+\S+:3001\s+\S+\s+LISTENING\s+(\d+)\s*$' | Select-Object -First 1
    if ($netstatLine -and $netstatLine.Matches.Count -gt 0) {
        $owningProcessId = [int]$netstatLine.Matches[0].Groups[1].Value
    }
}
if ($owningProcessId) {
    $process = Get-Process -Id $owningProcessId -ErrorAction SilentlyContinue
    $processLabel = if ($process) { "$($process.ProcessName) (PID $($process.Id))" } else { "PID $owningProcessId" }
    Write-Error "DEV startup failed: 127.0.0.1:3001 is already used by $processLabel. This script will not stop that process."
    exit 1
}

$now = Get-Date
$gitCommit = (& git rev-parse --short HEAD 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $gitCommit) { $gitCommit = 'unknown' }

$env:ZHIXU_BUILD_ENV = 'development'
$env:ZHIXU_BUILD_ID = $now.ToString('yyyyMMdd-HHmmss')
$env:ZHIXU_GIT_COMMIT = $gitCommit.Trim()
$env:ZHIXU_BUILD_TIME = $now.ToString('yyyy-MM-ddTHH:mm:sszzz')

Write-Host 'Zhixu ERP DEV: http://127.0.0.1:3001' -ForegroundColor Green
Write-Host "Build ID: $($env:ZHIXU_BUILD_ID) · Git Commit: $($env:ZHIXU_GIT_COMMIT)" -ForegroundColor DarkGray
& npm.cmd run dev:local
exit $LASTEXITCODE
