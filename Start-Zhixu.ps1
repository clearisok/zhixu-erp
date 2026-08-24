param(
    [switch]$SkipBuild,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

$envPath = Join-Path $projectRoot '.env'
$envExamplePath = Join-Path $projectRoot '.env.example'

if (-not (Test-Path -LiteralPath $envPath)) {
    if (Test-Path -LiteralPath $envExamplePath) {
        Copy-Item -LiteralPath $envExamplePath -Destination $envPath
        Write-Host '已自动生成 .env，请先确认密码后继续启动。' -ForegroundColor Yellow
        Write-Host "请检查: $envPath" -ForegroundColor Yellow
        if (-not $NoBrowser) {
            Start-Process notepad.exe $envPath
        }
        exit 1
    }

    throw ".env not found and .env.example is missing."
}

if (-not $SkipBuild) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\rebuild-local.ps1
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
    & docker compose up -d
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$ready = $false
for ($attempt = 1; $attempt -le 30; $attempt++) {
    try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 3
        if ($health.ok) { $ready = $true; break }
    } catch {
        Start-Sleep -Seconds 1
    }
}

if (-not $ready) {
    Write-Error 'Zhixu did not become ready. Run: docker compose logs --tail 100'
    exit 1
}

Write-Host 'Zhixu is ready: http://localhost:3000' -ForegroundColor Green
if (-not $NoBrowser) { Start-Process 'http://localhost:3000' }
