param(
    [Parameter(Mandatory = $true)][string]$BackupFile,
    [Parameter(Mandatory = $true)][string]$ExpectedContainerName,
    [Parameter(Mandatory = $true)][string]$ExpectedComposeProject,
    [Parameter(Mandatory = $true)][string]$ExpectedVolumeName,
    [Parameter(Mandatory = $true)][string]$ExpectedDatabaseName,
    [Parameter(Mandatory = $true)][string]$ExpectedTargetFingerprint,
    [Parameter(Mandatory = $true)][string]$ExpectedBackupSha256,
    [switch]$ConfirmDataLoss,
    [string]$ConfirmTargetFingerprint
)

$ErrorActionPreference = 'Stop'
if (-not $ConfirmDataLoss) { throw 'restore_requires_ConfirmDataLoss' }
if ($ConfirmTargetFingerprint -cne $ExpectedTargetFingerprint) {
    throw 'restore_requires_matching_second_target_confirmation'
}
if ($ExpectedBackupSha256 -cnotmatch '^[0-9a-f]{64}$') { throw 'invalid_expected_backup_hash' }
. (Join-Path $PSScriptRoot 'scripts/database-target-guard.ps1')

$backupRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'backups'))
$resolvedBackup = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $BackupFile).Path)
if (-not $resolvedBackup.StartsWith($backupRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
    -not $resolvedBackup.EndsWith('.dump', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'restore_backup_path_not_allowed'
}
$item = Get-Item -LiteralPath $resolvedBackup
if ($item.Length -lt 1024 -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'restore_backup_file_invalid'
}
$actualHash = (Get-FileHash -LiteralPath $resolvedBackup -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -cne $ExpectedBackupSha256) { throw 'restore_backup_hash_mismatch' }

$target = Get-ZhixuVerifiedTarget `
    -ExpectedContainerName $ExpectedContainerName `
    -ExpectedComposeProject $ExpectedComposeProject `
    -ExpectedVolumeName $ExpectedVolumeName `
    -ExpectedDatabaseName $ExpectedDatabaseName `
    -ExpectedTargetFingerprint $ExpectedTargetFingerprint
Assert-ZhixuWritersFrozen -Target $target

$remoteName = "zhixu-restore-$([Guid]::NewGuid().ToString('N')).dump"
$remotePath = "/var/tmp/$remoteName"
$copied = $false
try {
    & docker cp $resolvedBackup "$($target.ContainerName):$remotePath" 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'restore_backup_copy_failed' }
    $copied = $true
    $remoteHashLine = & docker exec $target.ContainerName sha256sum $remotePath 2>$null
    if ($LASTEXITCODE -ne 0 -or $remoteHashLine -notmatch '^([0-9a-f]{64})\s+' -or $Matches[1] -cne $actualHash) {
        throw 'restore_container_hash_mismatch'
    }
    & docker exec $target.ContainerName pg_restore --list $remotePath 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'restore_archive_invalid' }
    Assert-ZhixuWritersFrozen -Target $target

    & docker exec $target.ContainerName sh -c 'exec pg_restore -w --exit-on-error --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB" "/var/tmp/$1"' sh $remoteName 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'pg_restore_failed_keep_writers_frozen' }
    $verified = Get-ZhixuVerifiedTarget `
        -ExpectedContainerName $ExpectedContainerName `
        -ExpectedComposeProject $ExpectedComposeProject `
        -ExpectedVolumeName $ExpectedVolumeName `
        -ExpectedDatabaseName $ExpectedDatabaseName `
        -ExpectedTargetFingerprint $ExpectedTargetFingerprint
    Assert-ZhixuWritersFrozen -Target $verified
    Write-Output "restore_completed target_fingerprint=$($verified.Fingerprint) backup_sha256=$actualHash writers_remain_frozen=YES"
} finally {
    if ($copied) {
        & docker exec $target.ContainerName sh -c 'test -f "/var/tmp/$1" && rm -- "/var/tmp/$1"' sh $remoteName 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Warning 'restore_container_tmp_cleanup_failed' }
    }
}
# Deliberately no automatic application resume; the operator decides after verification.
