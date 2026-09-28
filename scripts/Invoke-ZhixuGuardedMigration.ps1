param(
    [Parameter(Mandatory = $true)][string]$ExpectedContainerName,
    [Parameter(Mandatory = $true)][string]$ExpectedComposeProject,
    [Parameter(Mandatory = $true)][string]$ExpectedVolumeName,
    [Parameter(Mandatory = $true)][string]$ExpectedDatabaseName,
    [Parameter(Mandatory = $true)][string]$ExpectedTargetFingerprint,
    [Parameter(Mandatory = $true)][string]$ExpectedMigrationSourceCommit,
    [switch]$VerifyOnly,
    [switch]$Execute,
    [string]$RollbackBackupFile,
    [string]$ExpectedRollbackBackupSha256
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'database-target-guard.ps1')

if ($VerifyOnly -eq $Execute) { throw 'select_exactly_one_migration_mode' }
if ($ExpectedMigrationSourceCommit -cnotmatch '^[0-9a-f]{40}$') { throw 'invalid_migration_source_commit' }

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$head = (& git -C $repoRoot rev-parse HEAD 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or $head -cnotmatch '^[0-9a-f]{40}$') { throw 'source_checkout_unavailable' }
& git -C $repoRoot merge-base --is-ancestor $ExpectedMigrationSourceCommit $head 2>$null
if ($LASTEXITCODE -ne 0) { throw 'migration_source_not_ancestor' }
$criticalPaths = @(
    'database/migrations', 'server/db/migrate.ts', 'server/db/migration-runner.ts',
    'server/db/pool.ts', 'server/config.ts', 'Dockerfile.server', 'package.json', 'package-lock.json'
)
& git -C $repoRoot diff --quiet $ExpectedMigrationSourceCommit -- $criticalPaths
if ($LASTEXITCODE -ne 0) { throw 'migration_source_differs_from_reviewed_commit' }
$untrackedMigrations = @(& git -C $repoRoot ls-files --others --exclude-standard -- database/migrations)
if ($untrackedMigrations.Count -ne 0) { throw 'untracked_migration_source' }

if ($Execute) {
    if ($ExpectedRollbackBackupSha256 -cnotmatch '^[0-9a-f]{64}$' -or -not $RollbackBackupFile) {
        throw 'verified_rollback_backup_required'
    }
    $backupRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'backups'))
    try { $backupPath = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $RollbackBackupFile).Path) }
    catch { throw 'rollback_backup_unavailable' }
    if (-not $backupPath.StartsWith($backupRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
        -not $backupPath.EndsWith('.dump', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'rollback_backup_path_not_allowed'
    }
    $backupItem = Get-Item -LiteralPath $backupPath
    if ($backupItem.Length -lt 1024 -or ($backupItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'rollback_backup_invalid'
    }
    $backupHash = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($backupHash -cne $ExpectedRollbackBackupSha256) { throw 'rollback_backup_hash_mismatch' }
    & docker run --rm --network none --read-only -v "${backupPath}:/rollback.dump:ro" --entrypoint pg_restore postgres:16-alpine --list /rollback.dump 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'rollback_backup_archive_invalid' }
}

$target = Get-ZhixuVerifiedTarget `
    -ExpectedContainerName $ExpectedContainerName `
    -ExpectedComposeProject $ExpectedComposeProject `
    -ExpectedVolumeName $ExpectedVolumeName `
    -ExpectedDatabaseName $ExpectedDatabaseName `
    -ExpectedTargetFingerprint $ExpectedTargetFingerprint

$imageTag = "zhixu-migration-runner:q3b2h-$($head.Substring(0, 12))"
& docker build --progress quiet -f (Join-Path $repoRoot 'Dockerfile.server') -t $imageTag `
    --build-arg "ZHIXU_BUILD_ID=q3b2h-$($head.Substring(0, 12))" `
    --build-arg "ZHIXU_GIT_COMMIT=$head" `
    --build-arg "ZHIXU_BUILD_TIME=$([DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ'))" $repoRoot 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'migration_image_build_failed' }
$imageRevision = (& docker image inspect $imageTag --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or $imageRevision -cne $head) { throw 'migration_image_revision_mismatch' }

function Invoke-ExactRunner {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)
    $fresh = Get-ZhixuVerifiedTarget `
        -ExpectedContainerName $ExpectedContainerName `
        -ExpectedComposeProject $ExpectedComposeProject `
        -ExpectedVolumeName $ExpectedVolumeName `
        -ExpectedDatabaseName $ExpectedDatabaseName `
        -ExpectedTargetFingerprint $ExpectedTargetFingerprint
    if ($Execute) { Assert-ZhixuWritersFrozen -Target $fresh }
    $inspection = @(Invoke-ZhixuDockerJson -Arguments @('inspect', '--type', 'container', $fresh.ContainerName))
    if ($inspection.Count -ne 1 -or $inspection[0].State.Running -ne $true) { throw 'target_container_changed' }
    $container = $inspection[0]
    $settings = @{}
    foreach ($entry in @($container.Config.Env)) {
        $separator = $entry.IndexOf('=')
        if ($separator -gt 0) { $settings[$entry.Substring(0, $separator)] = $entry.Substring($separator + 1) }
    }
    if ($settings.POSTGRES_DB -cne $fresh.DatabaseName -or
        $settings.POSTGRES_USER -cne $fresh.DatabaseUser -or
        [string]::IsNullOrEmpty($settings.POSTGRES_PASSWORD)) {
        throw 'target_credentials_unavailable'
    }
    $hadPassword = Test-Path Env:DB_PASSWORD
    $previousPassword = if ($hadPassword) { $env:DB_PASSWORD } else { $null }
    try {
        $env:DB_PASSWORD = $settings.POSTGRES_PASSWORD
        $output = @(& docker run --rm --network "container:$($container.Id)" --read-only --tmpfs '/tmp:rw,size=64m' `
            -e NODE_ENV=production -e DB_HOST=127.0.0.1 -e DB_PORT=5432 `
            -e "DB_NAME=$($fresh.DatabaseName)" -e "DB_USER=$($fresh.DatabaseUser)" -e DB_PASSWORD `
            -e ZHIXU_ALLOWED_ORIGINS=https://migration.invalid -e ZHIXU_COOKIE_SECURE=true `
            --entrypoint node $imageTag $ScriptPath 2>$null)
        if ($LASTEXITCODE -ne 0 -or $output.Count -ne 1) { throw 'exact_runner_failed' }
        return $output[0]
    } finally {
        if ($hadPassword) { $env:DB_PASSWORD = $previousPassword }
        else { Remove-Item Env:DB_PASSWORD -ErrorAction SilentlyContinue }
    }
}

$statusLine = Invoke-ExactRunner -ScriptPath 'dist/server/server/db/migration-status.js'
try { $status = $statusLine | ConvertFrom-Json }
catch { throw 'migration_status_invalid' }
$expectedApplied = @('0001_trusted_auth_rbac_operation_logs.sql', '0002_sales_order_foundation.sql', '0003_sales_order_number_sequence.sql')
$expectedPending = @('0004_confirmed_commercial_terms.sql', '0005_quote_foundation.sql', '0006_quote_number_sequence.sql', '0007_quote_master_settings.sql')
if ($status.event -cne 'migration_status' -or $status.integrity -cne 'valid' -or
    $status.ledgerExists -ne $true -or
    (@($status.applied) -join '|') -cne ($expectedApplied -join '|') -or
    (@($status.pending) -join '|') -cne ($expectedPending -join '|')) {
    throw 'migration_preflight_state_mismatch'
}
if ($VerifyOnly) {
    Write-Output "migration_target_verified fingerprint=$($target.Fingerprint) source_commit=$ExpectedMigrationSourceCommit image_revision=$imageRevision applied=3 pending=4"
    return
}

$resultLine = Invoke-ExactRunner -ScriptPath 'dist/server/server/db/migrate.js'
try { $result = $resultLine | ConvertFrom-Json }
catch { throw 'migration_result_invalid_keep_writers_frozen' }
if ($result.event -cne 'migrations_complete' -or
    (@($result.applied) -join '|') -cne ($expectedPending -join '|') -or
    (@($result.skipped) -join '|') -cne ($expectedApplied -join '|')) {
    throw 'migration_result_unexpected_keep_writers_frozen'
}
Write-Output "guarded_migration_complete fingerprint=$($target.Fingerprint) image_revision=$imageRevision applied=4 skipped=3 writers_remain_frozen=YES"
