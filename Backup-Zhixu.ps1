param(
    [Parameter(Mandatory = $true)][string]$ExpectedContainerName,
    [Parameter(Mandatory = $true)][string]$ExpectedComposeProject,
    [Parameter(Mandatory = $true)][string]$ExpectedVolumeName,
    [Parameter(Mandatory = $true)][string]$ExpectedDatabaseName,
    [Parameter(Mandatory = $true)][string]$ExpectedTargetFingerprint,
    [switch]$VerifyTargetOnly
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts/database-target-guard.ps1')

$target = Get-ZhixuVerifiedTarget `
    -ExpectedContainerName $ExpectedContainerName `
    -ExpectedComposeProject $ExpectedComposeProject `
    -ExpectedVolumeName $ExpectedVolumeName `
    -ExpectedDatabaseName $ExpectedDatabaseName `
    -ExpectedTargetFingerprint $ExpectedTargetFingerprint

if ($VerifyTargetOnly) {
    Write-Output "target_verified fingerprint=$($target.Fingerprint) database=$($target.DatabaseName) postgres_version_num=$($target.PostgresVersionNumber)"
    return
}

$backupRoot = Join-Path $PSScriptRoot 'backups'
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$nonce = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$name = "zhixu-$stamp-$nonce.dump"
$remotePath = "/tmp/$name"
$backupPath = Join-Path $backupRoot $name
if (Test-Path -LiteralPath $backupPath) { throw 'backup_target_already_exists' }
$created = $false

try {
    & docker exec $target.ContainerName sh -c 'test ! -e "/tmp/$1" && exec pg_dump -w -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --file="/tmp/$1"' sh $name 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'pg_dump_failed' }
    $created = $true

    $remoteHashLine = & docker exec $target.ContainerName sha256sum $remotePath 2>$null
    if ($LASTEXITCODE -ne 0 -or $remoteHashLine -notmatch '^([0-9a-f]{64})\s+') { throw 'container_hash_failed' }
    $remoteHash = $Matches[1]

    & docker cp "$($target.ContainerName):$remotePath" $backupPath 2>$null
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $backupPath)) { throw 'backup_copy_failed' }
    $item = Get-Item -LiteralPath $backupPath
    if ($item.Length -lt 1024) { throw 'backup_too_small' }
    $hostHash = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($hostHash -cne $remoteHash) { throw 'backup_hash_mismatch' }

    & docker exec $target.ContainerName pg_restore --list $remotePath 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'backup_archive_invalid' }
    $manifestPath = "$backupPath.manifest.json"
    $manifest = [ordered]@{
        contract = 'zhixu-exact-target-backup.v1'
        createdAt = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
        filename = $name
        bytes = $item.Length
        sha256 = $hostHash
        targetFingerprint = $target.Fingerprint
        containerName = $target.ContainerName
        composeProject = $ExpectedComposeProject
        volumeName = $ExpectedVolumeName
        databaseName = $target.DatabaseName
        archiveListVerified = $true
    }
    $bytes = [Text.Encoding]::UTF8.GetBytes(($manifest | ConvertTo-Json -Depth 4) + "`n")
    $stream = [IO.File]::Open($manifestPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
    Write-Output "backup_verified filename=$name bytes=$($item.Length) sha256=$hostHash target_fingerprint=$($target.Fingerprint)"
} finally {
    if ($created) {
        & docker exec $target.ContainerName sh -c 'test -f "/tmp/$1" && rm -- "/tmp/$1"' sh $name 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Warning 'backup_container_tmp_cleanup_failed' }
    }
}
