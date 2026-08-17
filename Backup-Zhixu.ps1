$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backupRoot = Join-Path $projectRoot 'backups'
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
Set-Location $projectRoot

$environment = Get-Content -LiteralPath (Join-Path $projectRoot '.env') | Where-Object { $_ -match '^[A-Za-z_][A-Za-z0-9_]*=' } | ForEach-Object {
    $key, $value = $_ -split '=', 2
    @{ Key = $key; Value = $value }
}
$dbName = ($environment | Where-Object Key -eq 'ZHIXU_DB_NAME').Value
$dbUser = ($environment | Where-Object Key -eq 'ZHIXU_DB_USER').Value
if (-not $dbName) { $dbName = 'zhixu' }
if (-not $dbUser) { $dbUser = 'zhixu' }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = Join-Path $backupRoot "zhixu-$stamp.dump"
$arguments = @('compose', 'exec', '-T', 'database', 'pg_dump', '-U', $dbUser, '-d', $dbName, '--format=custom', '--no-owner')
$process = Start-Process -FilePath 'docker' -ArgumentList $arguments -NoNewWindow -Wait -PassThru -RedirectStandardOutput $backupPath

if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $backupPath) -or (Get-Item -LiteralPath $backupPath).Length -lt 1024) {
    Write-Error 'Backup failed. Check that the Zhixu containers are running.'
    exit 1
}

Write-Host "Backup created: $backupPath" -ForegroundColor Green
