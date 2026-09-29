param(
    [Parameter(Mandatory = $true)][string]$BackupFile,
    [Parameter(Mandatory = $true)][string]$ProofFile,
    [Parameter(Mandatory = $true)][string]$FreezeFile,
    [Parameter(Mandatory = $true)][string]$EvidenceDirectory,
    [Parameter(Mandatory = $true)][string]$ReviewedCommit
)

$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$head = (& git -C $repoRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -cne $ReviewedCommit) { throw 'disposable_guarded_reviewed_commit_mismatch' }
$backupRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'backups'))
$evidencePath = [IO.Path]::GetFullPath($EvidenceDirectory)
if (-not $evidencePath.StartsWith($backupRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'disposable_guarded_evidence_path_invalid' }
foreach ($path in @($BackupFile, $ProofFile, $FreezeFile)) {
    $item = Get-Item -LiteralPath $path
    if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'disposable_guarded_input_invalid' }
}
$sourcePath = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $BackupFile).Path)
$proofPath = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $ProofFile).Path)
$freezePath = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $FreezeFile).Path)
$sourceSha = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
$proofSha = (Get-FileHash -LiteralPath $proofPath -Algorithm SHA256).Hash.ToLowerInvariant()
$freezeSha = (Get-FileHash -LiteralPath $freezePath -Algorithm SHA256).Hash.ToLowerInvariant()
$proof = Get-Content -LiteralPath $proofPath -Raw | ConvertFrom-Json
$freeze = Get-Content -LiteralPath $freezePath -Raw | ConvertFrom-Json
if ($proof.result -cne 'PASS' -or $proof.reviewedCommit -cne $head -or $proof.sourceFileSha256 -cne $sourceSha -or
    $proof.disposableContainerRemoved -ne $true -or $freeze.result -cne 'PASS') { throw 'disposable_guarded_evidence_mismatch' }
New-Item -ItemType Directory -Path $evidencePath -Force | Out-Null
if ((Get-Item -LiteralPath $evidencePath).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'disposable_guarded_evidence_reparse' }
$nonce = [Guid]::NewGuid().ToString('N').Substring(0, 12)
$container = "zhixu-q3-guarded-test-$nonce"
$database = "zhixu_it_q3_guarded_$nonce"
$password = [Guid]::NewGuid().ToString('N')
$imageTag = "zhixu-q3-guarded-test:$($head.Substring(0, 12))"
$started = $false
try {
    & docker run --rm -d --pull=never --name $container --network none --tmpfs '/var/lib/postgresql/data:rw,size=256m' `
        -e "POSTGRES_PASSWORD=$password" -e POSTGRES_DB=postgres postgres:16-alpine 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'disposable_guarded_database_start_failed' }
    $started = $true
    $metadata = (& docker inspect $container | ConvertFrom-Json)[0]
    if ($metadata.HostConfig.NetworkMode -cne 'none' -or @($metadata.HostConfig.PortBindings.PSObject.Properties).Count -ne 0 -or
        @($metadata.Mounts).Count -ne 0 -or -not $metadata.HostConfig.Tmpfs.PSObject.Properties['/var/lib/postgresql/data']) { throw 'disposable_guarded_database_isolation_failed' }
    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        & docker exec $container pg_isready -U postgres -d postgres 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) { throw 'disposable_guarded_database_unavailable' }
    & docker exec $container psql -X -q -w -v ON_ERROR_STOP=1 -U postgres -d postgres -c "CREATE DATABASE $database" 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'disposable_guarded_database_create_failed' }
    & docker build --progress quiet -f (Join-Path $repoRoot 'Dockerfile.server') -t $imageTag `
        --build-arg "ZHIXU_BUILD_ID=q3-guarded-$nonce" --build-arg "ZHIXU_GIT_COMMIT=$head" `
        --build-arg "ZHIXU_BUILD_TIME=$([DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ'))" $repoRoot 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'disposable_guarded_image_build_failed' }
    $common = @(
        'run', '--rm', '--network', "container:$container", '--read-only', '--tmpfs', '/tmp:rw,size=64m',
        '--mount', "type=bind,source=$sourcePath,target=/input/source.json,readonly",
        '--mount', "type=bind,source=$proofPath,target=/input/proof.json,readonly",
        '--mount', "type=bind,source=$freezePath,target=/input/freeze.json,readonly",
        '-e', 'DB_HOST=127.0.0.1', '-e', 'DB_PORT=5432', '-e', "DB_NAME=$database", '-e', 'DB_USER=postgres',
        '-e', "DB_PASSWORD=$password", '-e', "Q3_ACTUAL_HEAD=$head", '-e', "Q3_REVIEWED_COMMIT=$head",
        '-e', "Q3_EXPECTED_BROWSER_ORIGIN=$($freeze.browserOrigin)", '-e', "Q3_EXPECTED_NAMESPACE=$($freeze.namespace)",
        '-e', 'Q3_EXPECTED_ENVIRONMENT=test', '-e', "Q3_EXPECTED_SCHEMA_VERSION=$($freeze.schemaVersion)",
        '-e', "Q3_EXPECTED_FROZEN_BUILD_ID=$($freeze.expected.buildId)",
        '-e', "Q3_EXPECTED_FILE_SHA256=$sourceSha", '-e', "Q3_EXPECTED_SOURCE_HASH=$($proof.sourceHash)",
        '-e', "Q3_EXPECTED_PROJECTION_HASH=$($proof.projectionContentHash)", '-e', "Q3_EXPECTED_PROOF_SHA256=$proofSha",
        '-e', "Q3_EXPECTED_FREEZE_SHA256=$freezeSha", '-e', "Q3_TARGET_FINGERPRINT=$('a' * 64)",
        '-e', "Q3_ROLLBACK_SHA256=$('b' * 64)", '-e', "Q3_ROLLBACK_MANIFEST_SHA256=$('d' * 64)"
    )
    $runGuard = { param([string[]]$extra, [string]$mode)
        $argsList = @($common) + $extra + @('--entrypoint', 'node', $imageTag, 'dist/server/q3/guarded-import-cli.mjs', $mode)
        return @(& docker @argsList 2>$null)
    }
    $pending = & $runGuard @('-e', 'PGOPTIONS=-c default_transaction_read_only=on') 'verify'
    if ($LASTEXITCODE -eq 0) { throw 'disposable_guarded_pending_ledger_accepted' }
    & docker run --rm --network "container:$container" --read-only --tmpfs '/tmp:rw,size=64m' `
        -e DB_HOST=127.0.0.1 -e DB_PORT=5432 -e "DB_PASSWORD=$password" -e "Q3_DISPOSABLE_SUCCESS_DB=$database" `
        -e "Q3_REVIEWED_COMMIT=$head" --entrypoint node $imageTag dist/server/q3/disposable-rehearsal-cli.mjs prepare-guarded-test 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'disposable_guarded_migration_setup_failed' }
    $verifyArgs = @('-e', 'PGOPTIONS=-c default_transaction_read_only=on')
    $verified = @(& $runGuard $verifyArgs 'verify')
    if ($LASTEXITCODE -ne 0 -or $verified.Count -ne 1 -or ($verified[0] | ConvertFrom-Json).ready -ne $true) { throw 'disposable_guarded_verify_failed' }
    $wrongDatabase = & $runGuard ($verifyArgs + @('-e', "DB_NAME=zhixu_it_q3_missing_$nonce")) 'verify'
    if ($LASTEXITCODE -eq 0) { throw 'disposable_guarded_wrong_database_accepted' }
    foreach ($bad in @(
        @('-e', "Q3_EXPECTED_FILE_SHA256=$('c' * 64)"),
        @('-e', "Q3_EXPECTED_SOURCE_HASH=$('c' * 64)"),
        @('-e', "Q3_EXPECTED_PROJECTION_HASH=$('c' * 64)"),
        @('-e', "Q3_EXPECTED_PROOF_SHA256=$('c' * 64)"),
        @('-e', "Q3_EXPECTED_FREEZE_SHA256=$('c' * 64)"),
        @('-e', "Q3_REVIEWED_COMMIT=$('c' * 40)")
    )) {
        $rejected = & $runGuard ($verifyArgs + $bad) 'verify'
        if ($LASTEXITCODE -eq 0) { throw 'disposable_guarded_mismatched_evidence_accepted' }
    }
    $executeArgs = @('--mount', "type=bind,source=$evidencePath,target=/evidence", '-e', 'Q3_CONFIRM_IMPORT=I_UNDERSTAND_Q3_IMPORT_IS_IRREVERSIBLE',
        '-e', 'Q3_OPERATOR_LABEL=synthetic-operator', '-e', 'Q3_AUTHORIZATION_REF=synthetic-test')
    $unconfirmed = & $runGuard @('--mount', "type=bind,source=$evidencePath,target=/evidence") 'execute'
    if ($LASTEXITCODE -eq 0 -or (Test-Path -LiteralPath (Join-Path $evidencePath 'import-evidence.json'))) { throw 'disposable_guarded_unconfirmed_execute_accepted' }
    $executed = @(& $runGuard $executeArgs 'execute')
    if ($LASTEXITCODE -ne 0 -or $executed.Count -ne 1 -or ($executed[0] | ConvertFrom-Json).outcome -cne 'COMMITTED') { throw 'disposable_guarded_execute_failed' }
    $record = Get-Content -LiteralPath (Join-Path $evidencePath 'import-evidence.json') -Raw | ConvertFrom-Json
    if ($record.outcome -cne 'COMMITTED' -or $record.readbackContentHash -cne $proof.projectionContentHash -or
        $record.targetFingerprint -cne ('a' * 64)) { throw 'disposable_guarded_readback_evidence_invalid' }
    $second = & $runGuard $executeArgs 'execute'
    if ($LASTEXITCODE -eq 0) { throw 'disposable_guarded_second_import_accepted' }
    Write-Output 'q3_disposable_guarded_verify_execute_pass port_published=NO second_import_rejected=YES'
} finally {
    if ($started) {
        & docker rm --force $container 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'disposable_guarded_database_cleanup_failed' }
    }
}
