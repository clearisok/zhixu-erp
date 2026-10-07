param(
    [Parameter(Mandatory = $true)][string]$ExpectedContainerName,
    [Parameter(Mandatory = $true)][string]$ExpectedComposeProject,
    [Parameter(Mandatory = $true)][string]$ExpectedVolumeName,
    [Parameter(Mandatory = $true)][string]$ExpectedDatabaseName,
    [Parameter(Mandatory = $true)][string]$ExpectedTargetFingerprint,
    [Parameter(Mandatory = $true)][string]$ReviewedCommit,
    [string]$OperatorIntentFile,
    [switch]$VerifyOnly
)

# Q5-B exposes no real Execute parameter, DB-write path, migration runner, or restore path.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $VerifyOnly) { throw 'q5_real_execute_not_activated' }
if ($ReviewedCommit -cnotmatch '^[0-9a-f]{40}$') { throw 'invalid_reviewed_commit' }
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$review = & node --import tsx (Join-Path $PSScriptRoot 'verify-q5-reviewed-source.ts') --repo $repoRoot --reviewed-commit $ReviewedCommit 2>$null
if ($LASTEXITCODE -ne 0 -or -not $review) { throw 'q5_reviewed_source_guard_failed' }

. (Join-Path $PSScriptRoot 'database-target-guard.ps1')
$target = Get-ZhixuVerifiedTarget -ExpectedContainerName $ExpectedContainerName `
    -ExpectedComposeProject $ExpectedComposeProject -ExpectedVolumeName $ExpectedVolumeName `
    -ExpectedDatabaseName $ExpectedDatabaseName -ExpectedTargetFingerprint $ExpectedTargetFingerprint

$localMigrations = @{}
foreach ($file in @(Get-ChildItem -LiteralPath (Join-Path $repoRoot 'database/migrations') -Filter '*.sql' -File)) {
    if ($file.Name -cnotmatch '^(\d{4,})_[a-z0-9][a-z0-9_-]*\.sql$') { throw 'invalid_local_migration_filename' }
    $version = [long]::Parse($Matches[1]).ToString()
    if ($localMigrations.ContainsKey($version)) { throw 'duplicate_local_migration_version' }
    $localMigrations[$version] = [PSCustomObject]@{
        filename = $file.Name
        checksum = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}
$ledger = @(Invoke-ZhixuReadOnlySql -ContainerName $target.ContainerName `
    -Query 'SELECT version::text,filename,checksum FROM schema_migrations ORDER BY version;')
$applied = @{}
foreach ($line in @($ledger | Select-Object -Skip 1)) {
    if (-not $line) { continue }
    $parts = @($line -split '\|')
    if ($parts.Count -ne 3 -or -not $localMigrations.ContainsKey($parts[0])) { throw 'q5_migration_ledger_unexpected' }
    if ($localMigrations[$parts[0]].filename -cne $parts[1] -or $localMigrations[$parts[0]].checksum -cne $parts[2]) {
        throw 'q5_migration_checksum_drift'
    }
    $applied[$parts[0]] = $true
}
$pending = @($localMigrations.Keys | Where-Object { -not $applied.ContainsKey($_) })
# Use explicit boolean conversion; a pending 0008 must remain a named blocker.
$migrationReady = ($pending.Count -eq 0 -and $applied.ContainsKey('5') -and $applied.ContainsKey('6') -and
    $applied.ContainsKey('7') -and $applied.ContainsKey('8'))
$quoteEmpty = $false
$rowCounts = @{}
$sequenceState = $null
if ($migrationReady) {
    $countSql = @'
SELECT (SELECT count(*) FROM quote_center_quotes),
       (SELECT count(*) FROM quote_center_revisions),
       (SELECT count(*) FROM quote_center_price_versions),
       (SELECT count(*) FROM quote_center_estimates),
       (SELECT count(*) FROM quote_center_cost_snapshots),
       (SELECT count(*) FROM quote_center_fabric_lines),
       (SELECT count(*) FROM quote_center_trim_lines),
       (SELECT count(*) FROM quote_center_other_cost_lines),
       (SELECT count(*) FROM quote_attachments),
       (SELECT count(*) FROM quote_revision_attachments);
'@
    $counts = @(Invoke-ZhixuReadOnlySql -ContainerName $target.ContainerName -Query $countSql)
    $values = @($counts[1] -split '\|')
    $sequence = @(Invoke-ZhixuReadOnlySql -ContainerName $target.ContainerName `
        -Query 'SELECT last_value::text,is_called FROM quote_center_quote_number_seq;')
    $sequenceFields = @($sequence[1] -split '\|')
    if ($values.Count -ne 10 -or $sequenceFields.Count -ne 2) { throw 'q5_target_state_unavailable' }
    $tableNames = @('quote_center_quotes', 'quote_center_revisions', 'quote_center_price_versions',
        'quote_center_estimates', 'quote_center_cost_snapshots', 'quote_center_fabric_lines',
        'quote_center_trim_lines', 'quote_center_other_cost_lines', 'quote_attachments',
        'quote_revision_attachments')
    for ($index = 0; $index -lt $tableNames.Count; $index++) {
        if ($values[$index] -cnotmatch '^[0-9]+$') { throw 'q5_target_count_invalid' }
        $rowCounts[$tableNames[$index]] = [long]$values[$index]
    }
    $sequenceState = @{ lastValue = $sequenceFields[0]; isCalled = ($sequenceFields[1] -ceq 't') }
    $quoteEmpty = ($values.Count -eq 10 -and @($values | Where-Object { $_ -cne '0' }).Count -eq 0 -and
        $sequenceFields.Count -eq 2 -and $sequenceFields[0] -ceq '1' -and $sequenceFields[1] -ceq 'f')
}
$verifiedState = @{
    targetIdentity = @{ containerName = $target.ContainerName; composeProject = $target.ComposeProject;
        volumeName = $target.VolumeName; databaseName = $target.DatabaseName; fingerprint = $target.Fingerprint }
    migration = @{ applied = @($applied.Keys | Sort-Object | ForEach-Object { $localMigrations[$_].filename });
        pending = @($pending | Sort-Object | ForEach-Object { $localMigrations[$_].filename }); integrity = 'valid' }
    quoteTarget = @{ ledgerCurrent = $migrationReady; tablesPresent = $migrationReady;
        rowCounts = $rowCounts; empty = $quoteEmpty; sequence = $sequenceState }
}
if ($OperatorIntentFile) {
    $intentPath = (Resolve-Path -LiteralPath $OperatorIntentFile).Path
    $result = @($verifiedState | ConvertTo-Json -Depth 8 -Compress |
        & node --import tsx (Join-Path $PSScriptRoot 'verify-q5-guarded-bundle.ts') --intent $intentPath 2>$null)
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 2) { throw 'q5_evidence_verify_unavailable' }
    if ($result.Count -ne 1) { throw 'q5_evidence_verify_invalid' }
    $result[0]
    return
}
$reason = if (-not $applied.ContainsKey('8')) { 'BLOCKED_PENDING_0008' }
    elseif (-not $migrationReady) { 'migration_pending' }
    elseif (-not $quoteEmpty) { 'quote_target_not_empty' }
    else { 'quote_freeze_and_object_storage_not_activated' }
[PSCustomObject]@{
    contract = 'quote_import_readiness.v1'
    reviewedSource = 'PASS'
    browserFreeze = 'BLOCKED'
    freshSource = 'BLOCKED'
    databaseTarget = 'PASS'
    migration0008 = $(if ($migrationReady) { 'PASS' } else { 'BLOCKED' })
    quoteTargetEmpty = $(if ($quoteEmpty) { 'PASS' } else { 'BLOCKED' })
    rollbackBackup = 'BLOCKED'
    rehearsalEvidence = 'BLOCKED'
    objectStorage = 'BLOCKED'
    writerFreeze = 'BLOCKED'
    executeAuthorized = 'NO'
    readyForExecute = $false
    reason = $reason
    targetFingerprint = $target.Fingerprint
} | ConvertTo-Json -Compress
