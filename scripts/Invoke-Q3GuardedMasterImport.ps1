param(
    [Parameter(Mandatory = $true)][string]$ExpectedContainerName,
    [Parameter(Mandatory = $true)][string]$ExpectedComposeProject,
    [Parameter(Mandatory = $true)][string]$ExpectedVolumeName,
    [Parameter(Mandatory = $true)][string]$ExpectedDatabaseName,
    [Parameter(Mandatory = $true)][string]$ExpectedTargetFingerprint,
    [Parameter(Mandatory = $true)][string]$ExpectedImportSourceCommit,
    [Parameter(Mandatory = $true)][string]$ExpectedBrowserOrigin,
    [Parameter(Mandatory = $true)][string]$ExpectedBrowserNamespace,
    [Parameter(Mandatory = $true)][string]$ExpectedBrowserEnvironment,
    [Parameter(Mandatory = $true)][int]$ExpectedBrowserSchemaVersion,
    [Parameter(Mandatory = $true)][string]$ExpectedFrozenBuildId,
    [Parameter(Mandatory = $true)][ValidateSet('colocated', 'split')][string]$ExpectedFrontendTopology,
    [Parameter(Mandatory = $true)][string]$FreshBackupFile,
    [Parameter(Mandatory = $true)][string]$ExpectedBackupFileSha256,
    [Parameter(Mandatory = $true)][string]$ExpectedSourceHash,
    [Parameter(Mandatory = $true)][string]$ExpectedProjectionContentHash,
    [Parameter(Mandatory = $true)][string]$RehearsalProofFile,
    [Parameter(Mandatory = $true)][string]$ExpectedRehearsalProofSha256,
    [Parameter(Mandatory = $true)][string]$FrozenEvidenceFile,
    [Parameter(Mandatory = $true)][string]$ExpectedFrozenEvidenceSha256,
    [Parameter(Mandatory = $true)][string]$RollbackBackupFile,
    [Parameter(Mandatory = $true)][string]$ExpectedRollbackBackupSha256,
    [Parameter(Mandatory = $true)][string]$RollbackBackupManifestFile,
    [Parameter(Mandatory = $true)][string]$ExpectedRollbackBackupManifestSha256,
    [switch]$VerifyOnly,
    [switch]$Execute,
    [string]$ConfirmImport,
    [string]$OperatorLabel,
    [string]$AuthorizationRef
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'database-target-guard.ps1')
. (Join-Path $PSScriptRoot 'q3-split-topology.ps1')
if ($VerifyOnly -eq $Execute) { throw 'select_exactly_one_import_mode' }
foreach ($sha in @($ExpectedTargetFingerprint, $ExpectedBackupFileSha256, $ExpectedSourceHash, $ExpectedProjectionContentHash, $ExpectedRehearsalProofSha256, $ExpectedFrozenEvidenceSha256, $ExpectedRollbackBackupSha256, $ExpectedRollbackBackupManifestSha256)) {
    if ($sha -cnotmatch '^[0-9a-f]{64}$') { throw 'invalid_import_hash_intent' }
}
if ($ExpectedImportSourceCommit -cnotmatch '^[0-9a-f]{40}$' -or $ExpectedBrowserSchemaVersion -lt 1 -or $ExpectedBrowserEnvironment -notin @('development', 'production')) { throw 'invalid_import_source_intent' }
if ($Execute -and ($ConfirmImport -cne 'I_UNDERSTAND_Q3_IMPORT_IS_IRREVERSIBLE' -or $OperatorLabel -cnotmatch '^[A-Za-z0-9_.:@/-]{1,128}$' -or $AuthorizationRef -cnotmatch '^[A-Za-z0-9_.:@/-]{1,128}$')) { throw 'independent_import_confirmation_required' }
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$head = (& git -C $repoRoot rev-parse HEAD 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or $head -cnotmatch '^[0-9a-f]{40}$') { throw 'source_checkout_unavailable' }
& git -C $repoRoot merge-base --is-ancestor $ExpectedImportSourceCommit $head 2>$null
if ($LASTEXITCODE -ne 0) { throw 'import_source_not_ancestor' }
$critical = @(
    'features/basic-settings', 'features/data-management', 'features/permissions', 'features/runtime/build-info.ts', 'vite.config.ts',
    'server/integration/quote-master-settings-migration-import.ts',
    'server/quote-masters', 'server/db', 'server/build-identity.ts', 'server/index.ts',
    'server/maintenance-static.ts', 'server/maintenance-static-app.ts', 'server/static-files.ts',
    'database/migrations',
    'scripts/Invoke-Q3GuardedMasterImport.ps1', 'scripts/Invoke-Q3IsolatedRehearsal.ps1',
    'scripts/Publish-Q3EvidenceBundle.ps1',
    'scripts/verify-q3-frozen-build.ts', 'scripts/Invoke-Q3MaintenanceStaticHandoff.ps1',
    'scripts/q3-split-topology.ps1', 'scripts/Invoke-Q3IndependentFrozenFrontend.ps1',
    'scripts/Invoke-Q3IndependentWriterFreeze.ps1',
    'scripts/build-q3-import-runners.mjs', 'scripts/database-target-guard.ps1',
    'Dockerfile.server', 'Backup-Zhixu.ps1', 'server/tsconfig.json', 'package.json', 'package-lock.json'
)
& git -C $repoRoot diff --quiet $ExpectedImportSourceCommit $head -- $critical
if ($LASTEXITCODE -ne 0) { throw 'import_code_differs_from_reviewed_commit' }
& git -C $repoRoot diff --quiet -- $critical
if ($LASTEXITCODE -ne 0) { throw 'import_critical_worktree_dirty' }
& git -C $repoRoot diff --cached --quiet -- $critical
if ($LASTEXITCODE -ne 0) { throw 'import_critical_index_dirty' }
$untracked = @(& git -C $repoRoot ls-files --others --exclude-standard -- $critical)
if ($LASTEXITCODE -ne 0 -or $untracked.Count -ne 0) { throw 'untracked_import_critical_source' }
$ignoredCritical = @(& git -C $repoRoot ls-files --others --ignored --exclude-standard -- $critical)
if ($LASTEXITCODE -ne 0 -or $ignoredCritical.Count -ne 0) { throw 'ignored_import_critical_source' }

function Assert-ImmutableFile {
    param([string]$Path, [string]$Hash, [string]$Kind)
    try { $resolved = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $Path).Path) }
    catch { throw "${Kind}_file_unavailable" }
    $walk = $resolved
    while ($walk) {
        if ((Get-Item -LiteralPath $walk).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "${Kind}_path_reparse" }
        $parent = [IO.Path]::GetDirectoryName($walk)
        if ([string]::IsNullOrEmpty($parent) -or $parent -eq $walk) { break }
        $walk = $parent
    }
    $item = Get-Item -LiteralPath $resolved
    if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -lt 32) { throw "${Kind}_file_invalid" }
    if ((Get-FileHash -LiteralPath $resolved -Algorithm SHA256).Hash.ToLowerInvariant() -cne $Hash) { throw "${Kind}_hash_mismatch" }
    return $resolved
}
$sourcePath = Assert-ImmutableFile -Path $FreshBackupFile -Hash $ExpectedBackupFileSha256 -Kind 'fresh_source'
$proofPath = Assert-ImmutableFile -Path $RehearsalProofFile -Hash $ExpectedRehearsalProofSha256 -Kind 'rehearsal_proof'
$freezePath = Assert-ImmutableFile -Path $FrozenEvidenceFile -Hash $ExpectedFrozenEvidenceSha256 -Kind 'frozen_evidence'
$freeze = Get-Content -LiteralPath $freezePath -Raw | ConvertFrom-Json -DateKind String
if ($freeze.result -cne 'PASS' -or $freeze.allOldTabsClosedBeforeFrozenReopen -ne $true -or $freeze.browserOrigin -cne $ExpectedBrowserOrigin -or
    $freeze.namespace -cne $ExpectedBrowserNamespace -or $freeze.schemaVersion -ne $ExpectedBrowserSchemaVersion -or
    $freeze.expected.gitCommit -cne $ExpectedImportSourceCommit -or $freeze.observed.buildId -cne $ExpectedFrozenBuildId -or
    $freeze.observed.masterSettingsAuthority -cne 'frozen') { throw 'browser_freeze_evidence_mismatch' }
$frontendProperty = $freeze.PSObject.Properties['frozenFrontend']
$frozenFrontend = if ($frontendProperty) { $frontendProperty.Value } else { $null }
if ($ExpectedFrontendTopology -ceq 'split') {
    if (-not $frozenFrontend -or $frozenFrontend.topology -cne 'split') { throw 'split_freeze_identity_missing' }
    $port = ([Uri]::new($ExpectedBrowserOrigin)).Port
    $splitStatic = Assert-Q3FrozenStatic -ContainerName $frozenFrontend.containerName -ContainerId $frozenFrontend.containerId `
        -ImageId $frozenFrontend.imageId -Origin $ExpectedBrowserOrigin -Port $port `
        -Revision $ExpectedImportSourceCommit -BuildId $ExpectedFrozenBuildId -BuildTime $freeze.expected.buildTime
    if ($splitStatic.State.StartedAt -cne $frozenFrontend.startedAt -or
        $splitStatic.RestartCount -ne $frozenFrontend.restartCount) { throw 'split_frozen_continuity_lost_keep_freeze' }
} elseif ($frozenFrontend) { throw 'frontend_topology_evidence_mismatch' }
try {
    $running = (Invoke-WebRequest -Method Get -Uri "$ExpectedBrowserOrigin/build-info.json" -MaximumRedirection 0 -TimeoutSec 15 -Headers @{ 'Cache-Control' = 'no-cache' }).Content | ConvertFrom-Json -DateKind String
} catch { throw 'running_frozen_build_unavailable' }
if ($running.gitCommit -cne $ExpectedImportSourceCommit -or $running.buildId -cne $ExpectedFrozenBuildId -or $running.masterSettingsAuthority -cne 'frozen' -or
    $running.buildTime -cne $freeze.expected.buildTime) { throw 'running_frozen_build_mismatch' }

$target = Get-ZhixuVerifiedTarget -ExpectedContainerName $ExpectedContainerName -ExpectedComposeProject $ExpectedComposeProject `
    -ExpectedVolumeName $ExpectedVolumeName -ExpectedDatabaseName $ExpectedDatabaseName -ExpectedTargetFingerprint $ExpectedTargetFingerprint
Assert-ZhixuWritersFrozen -Target $target
$backupRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'backups'))
$rollbackPath = Assert-ImmutableFile -Path $RollbackBackupFile -Hash $ExpectedRollbackBackupSha256 -Kind 'rollback_backup'
$manifestPath = Assert-ImmutableFile -Path $RollbackBackupManifestFile -Hash $ExpectedRollbackBackupManifestSha256 -Kind 'rollback_manifest'
if (-not $rollbackPath.StartsWith($backupRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
    -not $rollbackPath.EndsWith('.dump', [StringComparison]::OrdinalIgnoreCase) -or (Get-Item -LiteralPath $rollbackPath).Length -lt 1024) { throw 'final_rollback_backup_invalid' }
if ($manifestPath -cne "$rollbackPath.manifest.json") { throw 'rollback_manifest_path_mismatch' }
$backupManifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json -DateKind String
if ($backupManifest.contract -cne 'zhixu-exact-target-backup.v1' -or $backupManifest.filename -cne [IO.Path]::GetFileName($rollbackPath) -or
    $backupManifest.bytes -ne (Get-Item -LiteralPath $rollbackPath).Length -or $backupManifest.sha256 -cne $ExpectedRollbackBackupSha256 -or
    $backupManifest.targetFingerprint -cne $target.Fingerprint -or $backupManifest.containerName -cne $target.ContainerName -or
    $backupManifest.composeProject -cne $ExpectedComposeProject -or $backupManifest.volumeName -cne $ExpectedVolumeName -or
    $backupManifest.databaseName -cne $ExpectedDatabaseName -or $backupManifest.archiveListVerified -ne $true) { throw 'rollback_manifest_identity_mismatch' }
try { $backupCreatedAt = [DateTime]::Parse($backupManifest.createdAt).ToUniversalTime() }
catch { throw 'rollback_manifest_time_invalid' }
if ($backupCreatedAt -lt [DateTime]::Parse($freeze.freezeStartedAt).ToUniversalTime() -or
    $backupCreatedAt -gt [DateTime]::UtcNow -or (Get-Item -LiteralPath $rollbackPath).LastWriteTimeUtc -lt [DateTime]::Parse($freeze.freezeStartedAt).ToUniversalTime()) { throw 'rollback_backup_predates_freeze' }
& docker run --rm --network none --read-only --mount "type=bind,source=$rollbackPath,target=/rollback.dump,readonly" `
    --entrypoint pg_restore postgres:16-alpine --list /rollback.dump 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'rollback_backup_archive_invalid' }

$evidenceDirectory = Join-Path $backupRoot 'q3b2i-import-evidence'
if ($Execute) {
    New-Item -ItemType Directory -Path $evidenceDirectory -Force | Out-Null
    if ((Get-Item -LiteralPath $evidenceDirectory).Attributes -band [IO.FileAttributes]::ReparsePoint -or
        (Test-Path -LiteralPath (Join-Path $evidenceDirectory 'import-evidence.json'))) { throw 'import_evidence_target_invalid' }
}
$imageTag = "zhixu-q3-import:$($head.Substring(0, 12))"
& docker build --progress quiet -f (Join-Path $repoRoot 'Dockerfile.server') -t $imageTag `
    --build-arg "ZHIXU_BUILD_ID=q3-import-$($head.Substring(0, 12))" --build-arg "ZHIXU_GIT_COMMIT=$head" `
    --build-arg "ZHIXU_BUILD_TIME=$([DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ'))" $repoRoot 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'import_runner_image_build_failed' }
$imageRevision = (& docker image inspect $imageTag --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or $imageRevision -cne $head) { throw 'import_runner_image_mismatch' }
$fresh = Get-ZhixuVerifiedTarget -ExpectedContainerName $ExpectedContainerName -ExpectedComposeProject $ExpectedComposeProject `
    -ExpectedVolumeName $ExpectedVolumeName -ExpectedDatabaseName $ExpectedDatabaseName -ExpectedTargetFingerprint $ExpectedTargetFingerprint
Assert-ZhixuWritersFrozen -Target $fresh
$inspection = @(Invoke-ZhixuDockerJson -Arguments @('inspect', '--type', 'container', $fresh.ContainerName))
$settings = @{}
foreach ($entry in @($inspection[0].Config.Env)) {
    $separator = $entry.IndexOf('=')
    if ($separator -gt 0) { $settings[$entry.Substring(0, $separator)] = $entry.Substring($separator + 1) }
}
if ($settings.POSTGRES_DB -cne $fresh.DatabaseName -or $settings.POSTGRES_USER -cne $fresh.DatabaseUser -or [string]::IsNullOrEmpty($settings.POSTGRES_PASSWORD)) { throw 'target_credentials_unavailable' }
$hadPassword = Test-Path Env:DB_PASSWORD
$oldPassword = if ($hadPassword) { $env:DB_PASSWORD } else { $null }
try {
    $env:DB_PASSWORD = $settings.POSTGRES_PASSWORD
    $mode = if ($Execute) { 'execute' } else { 'verify' }
    $arguments = @(
        'run', '--rm', '--network', "container:$($inspection[0].Id)", '--read-only', '--tmpfs', '/tmp:rw,size=64m',
        '--mount', "type=bind,source=$sourcePath,target=/input/source.json,readonly",
        '--mount', "type=bind,source=$proofPath,target=/input/proof.json,readonly",
        '--mount', "type=bind,source=$freezePath,target=/input/freeze.json,readonly",
        '-e', 'NODE_ENV=production', '-e', 'DB_HOST=127.0.0.1', '-e', 'DB_PORT=5432',
        '-e', "DB_NAME=$($fresh.DatabaseName)", '-e', "DB_USER=$($fresh.DatabaseUser)", '-e', 'DB_PASSWORD',
        '-e', "Q3_ACTUAL_HEAD=$head", '-e', "Q3_REVIEWED_COMMIT=$ExpectedImportSourceCommit",
        '-e', "Q3_EXPECTED_BROWSER_ORIGIN=$ExpectedBrowserOrigin", '-e', "Q3_EXPECTED_NAMESPACE=$ExpectedBrowserNamespace",
        '-e', "Q3_EXPECTED_ENVIRONMENT=$ExpectedBrowserEnvironment", '-e', "Q3_EXPECTED_SCHEMA_VERSION=$ExpectedBrowserSchemaVersion",
        '-e', "Q3_EXPECTED_FROZEN_BUILD_ID=$ExpectedFrozenBuildId", '-e', "Q3_EXPECTED_FILE_SHA256=$ExpectedBackupFileSha256",
        '-e', "Q3_EXPECTED_SOURCE_HASH=$ExpectedSourceHash", '-e', "Q3_EXPECTED_PROJECTION_HASH=$ExpectedProjectionContentHash",
        '-e', "Q3_EXPECTED_PROOF_SHA256=$ExpectedRehearsalProofSha256", '-e', "Q3_EXPECTED_FREEZE_SHA256=$ExpectedFrozenEvidenceSha256",
        '-e', "Q3_TARGET_FINGERPRINT=$ExpectedTargetFingerprint", '-e', "Q3_ROLLBACK_SHA256=$ExpectedRollbackBackupSha256",
        '-e', "Q3_ROLLBACK_MANIFEST_SHA256=$ExpectedRollbackBackupManifestSha256"
    )
    if ($VerifyOnly) { $arguments += @('-e', 'PGOPTIONS=-c default_transaction_read_only=on') }
    if ($Execute) {
        $arguments += @('--mount', "type=bind,source=$evidenceDirectory,target=/evidence", '-e', "Q3_CONFIRM_IMPORT=$ConfirmImport",
            '-e', "Q3_OPERATOR_LABEL=$OperatorLabel", '-e', "Q3_AUTHORIZATION_REF=$AuthorizationRef")
    }
    $arguments += @('--entrypoint', 'node', $imageTag, 'dist/server/q3/guarded-import-cli.mjs', $mode)
    $output = @(& docker @arguments 2>$null)
    if ($LASTEXITCODE -ne 0 -or $output.Count -ne 1) { throw 'guarded_import_runner_failed_keep_freeze' }
    try { $result = $output[0] | ConvertFrom-Json }
    catch { throw 'guarded_import_result_invalid_keep_freeze' }
    if ($VerifyOnly) {
        if ($result.event -cne 'q3_import_verify_only' -or $result.ready -ne $true) { throw 'guarded_import_verify_failed' }
        Write-Output "q3_import_verify_only_ready fingerprint=$($fresh.Fingerprint) source_hash=$ExpectedSourceHash rows=$($result.projectedCounts.total)"
    } else {
        if ($result.event -cne 'q3_import_result' -or $result.outcome -cne 'COMMITTED') { throw 'guarded_import_not_verified_keep_freeze' }
        Write-Output "q3_import_committed_readback_verified execution_id=$($result.executionId) writers_remain_frozen=YES"
    }
} finally {
    if ($hadPassword) { $env:DB_PASSWORD = $oldPassword }
    else { Remove-Item Env:DB_PASSWORD -ErrorAction SilentlyContinue }
}
