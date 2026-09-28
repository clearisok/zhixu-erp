param(
    [Parameter(Mandatory = $true)][string]$BackupFile,
    [Parameter(Mandatory = $true)][string]$ExpectedBackupFileSha256,
    [Parameter(Mandatory = $true)][string]$ExpectedSourceHash,
    [Parameter(Mandatory = $true)][string]$ReviewedCommit,
    [Parameter(Mandatory = $true)][string]$EvidenceDirectory
)

$ErrorActionPreference = 'Stop'
if ($ExpectedBackupFileSha256 -cnotmatch '^[0-9a-f]{64}$' -or $ExpectedSourceHash -cnotmatch '^[0-9a-f]{64}$' -or $ReviewedCommit -cnotmatch '^[0-9a-f]{40}$') { throw 'invalid_rehearsal_intent' }
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$head = (& git -C $repoRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -cne $ReviewedCommit) { throw 'reviewed_commit_mismatch' }
$critical = @(
    'features/basic-settings', 'features/data-management', 'features/runtime/build-info.ts',
    'server/integration/quote-master-settings-migration-import.ts', 'server/quote-masters', 'server/db',
    'database/migrations', 'scripts/Invoke-Q3IsolatedRehearsal.ps1', 'scripts/Invoke-Q3GuardedMasterImport.ps1',
    'scripts/build-q3-import-runners.mjs', 'scripts/database-target-guard.ps1',
    'Dockerfile.server', 'Backup-Zhixu.ps1', 'server/tsconfig.json', 'package.json', 'package-lock.json'
)
& git -C $repoRoot diff --quiet -- $critical
if ($LASTEXITCODE -ne 0) { throw 'rehearsal_critical_worktree_dirty' }
& git -C $repoRoot diff --cached --quiet -- $critical
if ($LASTEXITCODE -ne 0) { throw 'rehearsal_critical_index_dirty' }
$untracked = @(& git -C $repoRoot ls-files --others --exclude-standard -- $critical)
if ($LASTEXITCODE -ne 0 -or $untracked.Count -ne 0) { throw 'rehearsal_untracked_critical_source' }
$ignoredCritical = @(& git -C $repoRoot ls-files --others --ignored --exclude-standard -- $critical)
if ($LASTEXITCODE -ne 0 -or $ignoredCritical.Count -ne 0) { throw 'rehearsal_ignored_critical_source' }
$sourcePath = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $BackupFile).Path)
$sourceItem = Get-Item -LiteralPath $sourcePath
if (-not $sourceItem.PSIsContainer -and $sourceItem.Length -gt 32 -and -not ($sourceItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    $actualHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -cne $ExpectedBackupFileSha256) { throw 'rehearsal_source_file_hash_mismatch' }
} else { throw 'rehearsal_source_file_invalid' }
$backupRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'backups'))
$evidencePath = [IO.Path]::GetFullPath($EvidenceDirectory)
if (-not $evidencePath.StartsWith($backupRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'rehearsal_evidence_path_not_ignored' }
New-Item -ItemType Directory -Path $evidencePath -Force | Out-Null
if ((Get-Item -LiteralPath $evidencePath).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'rehearsal_evidence_path_reparse' }
$nonce = [Guid]::NewGuid().ToString('N').Substring(0, 12)
$container = "zhixu-q3-rehearsal-$nonce"
$successDb = "zhixu_it_q3_success_$nonce"
$rollbackDb = "zhixu_it_q3_rollback_$nonce"
$password = [Guid]::NewGuid().ToString('N')
$imageTag = "zhixu-q3-rehearsal:$($head.Substring(0, 12))"
$candidate = Join-Path $evidencePath 'proof.candidate.json'
$proof = Join-Path $evidencePath 'proof.json'
if ((Test-Path -LiteralPath $candidate) -or (Test-Path -LiteralPath $proof)) { throw 'rehearsal_evidence_already_exists' }
$started = $false
$candidateReady = $false
try {
    & docker run --rm -d --pull=never --name $container --network none --tmpfs '/var/lib/postgresql/data:rw,size=256m' `
        -e "POSTGRES_PASSWORD=$password" -e POSTGRES_DB=postgres postgres:16-alpine 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'disposable_database_start_failed' }
    $started = $true
    $metadata = (& docker inspect $container | ConvertFrom-Json)[0]
    if ($metadata.HostConfig.NetworkMode -cne 'none' -or @($metadata.HostConfig.PortBindings.PSObject.Properties).Count -ne 0 -or @($metadata.Mounts).Count -ne 0 -or
        -not $metadata.HostConfig.Tmpfs.PSObject.Properties['/var/lib/postgresql/data']) { throw 'disposable_database_isolation_failed' }
    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        & docker exec $container pg_isready -U postgres -d postgres 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) { throw 'disposable_database_unavailable' }
    & docker exec $container psql -X -q -w -v ON_ERROR_STOP=1 -U postgres -d postgres -c "CREATE DATABASE $successDb" 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'disposable_success_database_create_failed' }
    & docker exec $container psql -X -q -w -v ON_ERROR_STOP=1 -U postgres -d postgres -c "CREATE DATABASE $rollbackDb" 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'disposable_rollback_database_create_failed' }
    & docker build --progress quiet -f (Join-Path $repoRoot 'Dockerfile.server') -t $imageTag `
        --build-arg "ZHIXU_BUILD_ID=q3-rehearsal-$nonce" --build-arg "ZHIXU_GIT_COMMIT=$head" `
        --build-arg "ZHIXU_BUILD_TIME=$([DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ'))" $repoRoot 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'disposable_runner_image_build_failed' }
    & docker run --rm --network "container:$container" --read-only --tmpfs '/tmp:rw,size=64m' `
        --mount "type=bind,source=$sourcePath,target=/input/source.json,readonly" `
        --mount "type=bind,source=$evidencePath,target=/evidence" `
        -e DB_HOST=127.0.0.1 -e DB_PORT=5432 -e "DB_PASSWORD=$password" `
        -e "Q3_DISPOSABLE_SUCCESS_DB=$successDb" -e "Q3_DISPOSABLE_ROLLBACK_DB=$rollbackDb" `
        -e "Q3_REVIEWED_COMMIT=$head" -e "Q3_EXPECTED_FILE_SHA256=$ExpectedBackupFileSha256" `
        -e "Q3_EXPECTED_SOURCE_HASH=$ExpectedSourceHash" `
        --entrypoint node $imageTag dist/server/q3/disposable-rehearsal-cli.mjs
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $candidate)) { throw 'disposable_rehearsal_failed' }
    $candidateReady = $true
} finally {
    if ($started) {
        & docker rm --force $container 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'disposable_database_cleanup_failed' }
    }
}
if (-not $candidateReady) { throw 'rehearsal_candidate_missing' }
& docker inspect $container 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) { throw 'disposable_database_still_exists' }
$result = Get-Content -LiteralPath $candidate -Raw | ConvertFrom-Json
if ($result.result -cne 'PASS' -or $result.sourceFileSha256 -cne $ExpectedBackupFileSha256 -or
    $result.sourceHash -cne $ExpectedSourceHash -or $result.disposableContainerRemoved -ne $false) { throw 'rehearsal_candidate_invalid' }
$result.disposableContainerRemoved = $true
$bytes = [Text.Encoding]::UTF8.GetBytes(($result | ConvertTo-Json -Depth 30) + "`n")
$stream = [IO.File]::Open($proof, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
Remove-Item -LiteralPath $candidate
$proofHash = (Get-FileHash -LiteralPath $proof -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Output "q3_rehearsal_proof_ready source_hash=$ExpectedSourceHash proof_sha256=$proofHash path=$proof"
