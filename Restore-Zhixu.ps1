param(
    [Parameter(Mandatory = $true)]
    [string]$BackupFile,
    [switch]$ConfirmDataLoss
)

$ErrorActionPreference = 'Stop'
if (-not $ConfirmDataLoss) {
    Write-Error 'Restore replaces current business data. Re-run with -ConfirmDataLoss after checking the backup path.'
    exit 1
}

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backupRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'backups'))
$resolvedBackup = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $BackupFile).Path)
if (-not $resolvedBackup.StartsWith($backupRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetExtension($resolvedBackup) -ne '.dump') {
    Write-Error 'Only .dump files inside this project backups directory can be restored.'
    exit 1
}

Set-Location $projectRoot
$environment = Get-Content -LiteralPath (Join-Path $projectRoot '.env') | Where-Object { $_ -match '^[A-Za-z_][A-Za-z0-9_]*=' } | ForEach-Object {
    $key, $value = $_ -split '=', 2
    @{ Key = $key; Value = $value }
}
$dbName = ($environment | Where-Object Key -eq 'ZHIXU_DB_NAME').Value
$dbUser = ($environment | Where-Object Key -eq 'ZHIXU_DB_USER').Value
if (-not $dbName) { $dbName = 'zhixu' }
if (-not $dbUser) { $dbUser = 'zhixu' }

$arguments = @('compose', 'exec', '-T', 'database', 'pg_restore', '-U', $dbUser, '-d', $dbName, '--clean', '--if-exists', '--no-owner')
$process = Start-Process -FilePath 'docker' -ArgumentList $arguments -NoNewWindow -Wait -PassThru -RedirectStandardInput $resolvedBackup
if ($process.ExitCode -ne 0) {
    Write-Error 'Restore failed. Current data may require recovery from a verified backup.'
    exit $process.ExitCode
}

& docker compose restart zhixu | Out-Null
Write-Host 'Restore complete. Zhixu has been restarted.' -ForegroundColor Green
