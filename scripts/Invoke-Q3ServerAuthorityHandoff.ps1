param(
    [Parameter(Mandatory = $true)][string]$ExpectedOperationalCommit,
    [Parameter(Mandatory = $true)][string]$ExpectedProductSourceCommit,
    [Parameter(Mandatory = $true)][string]$ExpectedServerImageId,
    [Parameter(Mandatory = $true)][string]$ExpectedServerBuildId,
    [Parameter(Mandatory = $true)][string]$ExpectedServerBuildTime,
    [Parameter(Mandatory = $true)][string]$ExpectedFrozenContainerName,
    [Parameter(Mandatory = $true)][string]$ExpectedFrozenContainerId,
    [Parameter(Mandatory = $true)][string]$ExpectedFrozenImageId,
    [Parameter(Mandatory = $true)][string]$ExpectedFrozenStartedAt,
    [Parameter(Mandatory = $true)][int]$ExpectedFrozenRestartCount,
    [Parameter(Mandatory = $true)][string]$ExpectedFrozenBuildId,
    [Parameter(Mandatory = $true)][string]$ExpectedFrozenBuildTime,
    [Parameter(Mandatory = $true)][string]$ExpectedBrowserOrigin,
    [Parameter(Mandatory = $true)][int]$ExpectedHostPort,
    [Parameter(Mandatory = $true)][string]$ExpectedContainerName,
    [Parameter(Mandatory = $true)][string]$ExpectedComposeProject,
    [Parameter(Mandatory = $true)][string]$ExpectedVolumeName,
    [Parameter(Mandatory = $true)][string]$ExpectedDatabaseName,
    [Parameter(Mandatory = $true)][string]$ExpectedDatabaseNetworkName,
    [Parameter(Mandatory = $true)][string]$ExpectedTargetFingerprint,
    [Parameter(Mandatory = $true)][string]$ExpectedOldWriterName,
    [Parameter(Mandatory = $true)][string]$ExpectedOldWriterId,
    [Parameter(Mandatory = $true)][string]$ExpectedOldWriterImageId,
    [Parameter(Mandatory = $true)][string]$ImportEvidenceFile,
    [Parameter(Mandatory = $true)][string]$ExpectedImportEvidenceSha256,
    [Parameter(Mandatory = $true)][string]$ExpectedImportExecutionId,
    [Parameter(Mandatory = $true)][string]$ExpectedProjectionContentHash,
    [Parameter(Mandatory = $true)][int]$ExpectedImportedRows,
    [Parameter(Mandatory = $true)][string]$ServerContainerName,
    [Parameter(Mandatory = $true)][string]$HandoffEvidenceDirectory,
    [switch]$VerifyOnly,
    [switch]$Execute,
    [string]$ConfirmHandoff,
    [string]$OperatorLabel,
    [string]$AuthorizationRef,
    [switch]$DisposableForceHealthFailure,
    [ValidateRange(1, 120)][int]$HealthTimeoutSeconds = 45
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'database-target-guard.ps1')
. (Join-Path $PSScriptRoot 'q3-split-topology.ps1')

if ($VerifyOnly -eq $Execute) { throw 'select_exactly_one_server_handoff_mode' }
if ($Execute -and ($ConfirmHandoff -cne 'I_UNDERSTAND_Q3_SERVER_AUTHORITY_REPLACES_FROZEN_FRONTEND' -or
    $OperatorLabel -cnotmatch '^[A-Za-z0-9_.:@/-]{1,128}$' -or
    $AuthorizationRef -cnotmatch '^[A-Za-z0-9_.:@/-]{1,128}$')) {
    throw 'server_handoff_confirmation_required'
}
foreach ($sha in @($ExpectedServerImageId, $ExpectedFrozenImageId, $ExpectedOldWriterImageId)) {
    if ($sha -cnotmatch '^sha256:[0-9a-f]{64}$') { throw 'server_handoff_image_intent_invalid' }
}
foreach ($id in @($ExpectedFrozenContainerId, $ExpectedOldWriterId, $ExpectedImportEvidenceSha256,
    $ExpectedProjectionContentHash, $ExpectedTargetFingerprint)) {
    if ($id -cnotmatch '^[0-9a-f]{64}$') { throw 'server_handoff_hash_intent_invalid' }
}
foreach ($commit in @($ExpectedOperationalCommit, $ExpectedProductSourceCommit)) {
    if ($commit -cnotmatch '^[0-9a-f]{40}$') { throw 'server_handoff_commit_intent_invalid' }
}
foreach ($name in @($ExpectedFrozenContainerName, $ExpectedContainerName, $ExpectedComposeProject,
    $ExpectedVolumeName, $ExpectedDatabaseName, $ExpectedDatabaseNetworkName, $ExpectedOldWriterName,
    $ServerContainerName)) {
    if ($name -cnotmatch '^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$') { throw 'server_handoff_name_intent_invalid' }
}
if ($ServerContainerName -cin @($ExpectedFrozenContainerName, $ExpectedContainerName, $ExpectedOldWriterName) -or
    $ExpectedImportedRows -lt 1 -or $ExpectedFrozenRestartCount -lt 0 -or
    $ExpectedServerBuildId -cnotmatch '^[A-Za-z0-9_.:@/-]{1,128}$' -or
    $ExpectedFrozenBuildId -cnotmatch '^[A-Za-z0-9_.:@/-]{1,128}$' -or
    $ExpectedServerBuildTime -cnotmatch '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$' -or
    $ExpectedFrozenStartedAt -cnotmatch '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$') {
    throw 'server_handoff_intent_invalid'
}
Assert-Q3SplitOrigin -Origin $ExpectedBrowserOrigin -Port $ExpectedHostPort
if ($DisposableForceHealthFailure -and ($ExpectedVolumeName -cne 'tmpfs' -or
    $ExpectedHostPort -in @(3001, 3002) -or
    $ExpectedComposeProject -cnotmatch '^q3b0-disposable-[0-9a-f]{10}$' -or
    $ExpectedContainerName -cnotlike "$ExpectedComposeProject-*")) {
    throw 'handoff_disposable_fault_injection_forbidden'
}

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\', '/')
$head = (& git -C $repoRoot rev-parse HEAD 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or $head -cne $ExpectedOperationalCommit) { throw 'handoff_operational_commit_mismatch' }
& git -C $repoRoot merge-base --is-ancestor $ExpectedProductSourceCommit $head 2>$null
if ($LASTEXITCODE -ne 0) { throw 'handoff_product_source_not_ancestor' }
$productPaths = @('app', 'components', 'features', 'server', 'database', 'worker',
    'Dockerfile.server', 'vite.config.ts', 'next.config.ts', 'package.json', 'package-lock.json')
& git -C $repoRoot diff --quiet $ExpectedProductSourceCommit $head -- $productPaths
if ($LASTEXITCODE -ne 0) { throw 'handoff_product_source_drift' }
if (@(& git -C $repoRoot status --porcelain --untracked-files=normal).Count -ne 0) {
    throw 'handoff_worktree_dirty'
}

function Assert-Q3ServerImage {
    $image = Get-Q3DockerObject -Arguments @('image', 'inspect', $ExpectedServerImageId)
    if ($image.Id -cne $ExpectedServerImageId -or
        $image.Config.Labels.'org.opencontainers.image.revision' -cne $ExpectedProductSourceCommit -or
        $image.Config.Labels.'org.opencontainers.image.created' -cne $ExpectedServerBuildTime -or
        $image.Config.Labels.'io.zhixu.build-id' -cne $ExpectedServerBuildId -or
        $image.Config.Labels.'io.zhixu.master-settings-authority' -cne 'server') {
        throw 'handoff_server_image_identity_mismatch'
    }
    Assert-Q3NoDbEnvironment -Object $image
    $raw = @(& docker run --rm --pull=never --network none --read-only --entrypoint node $ExpectedServerImageId `
        -e 'process.stdout.write(require("fs").readFileSync("/app/dist/client/build-info.json","utf8"))' 2>$null)
    if ($LASTEXITCODE -ne 0 -or $raw.Count -eq 0) { throw 'handoff_server_compiled_build_unavailable' }
    try { $info = ($raw -join "`n" | ConvertFrom-Json -DateKind String) }
    catch { throw 'handoff_server_compiled_build_invalid' }
    if ($info.gitCommit -cne $ExpectedProductSourceCommit -or $info.buildId -cne $ExpectedServerBuildId -or
        $info.buildTime -cne $ExpectedServerBuildTime -or $info.masterSettingsAuthority -cne 'server') {
        throw 'handoff_server_compiled_build_mismatch'
    }
}

function Get-Q3Setting {
    param($Container, [string]$Name)
    $matches = @($Container.Config.Env | Where-Object { $_.StartsWith("$Name=", [StringComparison]::Ordinal) })
    if ($matches.Count -ne 1) { throw 'handoff_runtime_setting_missing_or_ambiguous' }
    $value = $matches[0].Substring($Name.Length + 1)
    if ([string]::IsNullOrEmpty($value)) { throw 'handoff_runtime_setting_empty' }
    return $value
}

Assert-Q3ServerImage
$static = Assert-Q3FrozenStatic -ContainerName $ExpectedFrozenContainerName -ContainerId $ExpectedFrozenContainerId `
    -ImageId $ExpectedFrozenImageId -Origin $ExpectedBrowserOrigin -Port $ExpectedHostPort `
    -Revision $ExpectedProductSourceCommit -BuildId $ExpectedFrozenBuildId -BuildTime $ExpectedFrozenBuildTime
if ($static.State.StartedAt -cne $ExpectedFrozenStartedAt -or
    $static.RestartCount -ne $ExpectedFrozenRestartCount) { throw 'handoff_frozen_continuity_mismatch' }
$target = Get-ZhixuVerifiedTarget -ExpectedContainerName $ExpectedContainerName `
    -ExpectedComposeProject $ExpectedComposeProject -ExpectedVolumeName $ExpectedVolumeName `
    -ExpectedDatabaseName $ExpectedDatabaseName -ExpectedTargetFingerprint $ExpectedTargetFingerprint
Assert-ZhixuWritersFrozen -Target $target
$database = Get-Q3DockerObject -Arguments @('inspect', '--type', 'container', $ExpectedContainerName)
$network = Get-Q3DockerObject -Arguments @('network', 'inspect', $ExpectedDatabaseNetworkName)
if (-not $database.NetworkSettings.Networks.PSObject.Properties[$ExpectedDatabaseNetworkName] -or
    $network.Name -cne $ExpectedDatabaseNetworkName -or
    $network.Labels.'com.docker.compose.project' -cne $ExpectedComposeProject) {
    throw 'handoff_database_network_mismatch'
}
$oldWriter = Get-Q3DockerObject -Arguments @('inspect', '--type', 'container', $ExpectedOldWriterName)
if ($oldWriter.Name -cne "/$ExpectedOldWriterName" -or $oldWriter.Id -cne $ExpectedOldWriterId -or
    $oldWriter.Image -cne $ExpectedOldWriterImageId -or $oldWriter.State.Running -ne $false -or
    $oldWriter.Config.Labels.'com.docker.compose.project' -cne $ExpectedComposeProject -or
    $oldWriter.Config.Labels.'com.docker.compose.service' -cne 'server' -or
    -not $oldWriter.NetworkSettings.Networks.PSObject.Properties[$ExpectedDatabaseNetworkName]) {
    throw 'handoff_old_writer_mismatch'
}
$dbName = Get-Q3Setting -Container $oldWriter -Name 'DB_NAME'
$dbUser = Get-Q3Setting -Container $oldWriter -Name 'DB_USER'
if (@($oldWriter.Config.Env | Where-Object { $_.StartsWith('DB_PASSWORD=', [StringComparison]::Ordinal) }).Count -ne 1) {
    throw 'handoff_runtime_setting_missing_or_ambiguous'
}
if ($dbName -cne $target.DatabaseName -or $dbUser -cne $target.DatabaseUser) {
    throw 'handoff_database_settings_mismatch'
}
& docker inspect --type container $ServerContainerName 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) { throw 'handoff_server_container_name_in_use' }

try { $evidencePath = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $ImportEvidenceFile).Path) }
catch { throw 'handoff_import_evidence_unavailable' }
if ((Get-Item -LiteralPath $evidencePath).Attributes -band [IO.FileAttributes]::ReparsePoint -or
    (Get-FileHash -LiteralPath $evidencePath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ExpectedImportEvidenceSha256) {
    throw 'handoff_import_evidence_hash_mismatch'
}
try { $import = Get-Content -LiteralPath $evidencePath -Raw | ConvertFrom-Json -DateKind String }
catch { throw 'handoff_import_evidence_invalid' }
$failureProperty = $import.PSObject.Properties['failure']
$hasFailure = $null -ne $failureProperty -and $null -ne $failureProperty.Value
if ($import.evidenceVersion -ne 1 -or $import.executionType -cne 'quote_master_settings_import' -or
    $import.outcome -cne 'COMMITTED' -or $import.executionId -cne $ExpectedImportExecutionId -or
    $import.repoCommit -cne $ExpectedProductSourceCommit -or $import.reviewedCommit -cne $ExpectedProductSourceCommit -or
    $import.targetFingerprint -cne $ExpectedTargetFingerprint -or
    $import.projectionContentHash -cne $ExpectedProjectionContentHash -or
    $import.readbackContentHash -cne $ExpectedProjectionContentHash -or
    $hasFailure) { throw 'handoff_import_evidence_mismatch' }
$countKeys = @('brands','customerSalespeople','fabrics','trims','manufacturingPresets',
    'brandDefaultTrims','salespersonDefaultTrims','globalSettings','total')
if ($import.plannedCounts.total -ne $ExpectedImportedRows) { throw 'handoff_import_count_mismatch' }
foreach ($key in $countKeys) {
    if ($import.plannedCounts.$key -ne $import.committedCounts.$key -or
        $import.plannedCounts.$key -ne $import.readbackCounts.$key) { throw 'handoff_import_count_mismatch' }
}
$sql = 'SELECT (SELECT count(*) FROM quote_master_brands),(SELECT count(*) FROM quote_master_customer_salespeople),(SELECT count(*) FROM quote_master_fabrics),(SELECT count(*) FROM quote_master_trims),(SELECT count(*) FROM quote_manufacturing_presets),(SELECT count(*) FROM quote_master_default_trim_configs WHERE brand_id IS NOT NULL),(SELECT count(*) FROM quote_master_default_trim_configs WHERE customer_salesperson_id IS NOT NULL),(SELECT count(*) FROM quote_global_settings);'
$rows = @(Invoke-ZhixuReadOnlySql -ContainerName $target.ContainerName -Query $sql)
$actualCounts = @($rows[1] -split '\|')
if ($rows[0] -cne 'on' -or $actualCounts.Count -ne 8) { throw 'handoff_import_readback_unavailable' }
for ($index = 0; $index -lt 8; $index++) {
    if ([int]$actualCounts[$index] -ne $import.readbackCounts.($countKeys[$index])) {
        throw 'handoff_import_readback_mismatch'
    }
}
# Recompute the canonical content hash from the verified candidate image using a
# read-only transaction; a copied import-evidence file alone cannot prove current rows.
$hashProbe = 'import pg from "pg"; import {migrationContentHash,readQuoteMasterSettingsMigrationContent} from "./dist/server/server/integration/quote-master-settings-migration-import.js"; const pool=new pg.Pool({host:process.env.DB_HOST,port:5432,database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,max:1}); try { const client=await pool.connect(); try { await client.query("BEGIN READ ONLY"); const hash=migrationContentHash(await readQuoteMasterSettingsMigrationContent(client)); await client.query("COMMIT"); process.stdout.write(hash); } finally {client.release();} } finally {await pool.end();}'
$dbPassword = Get-Q3Setting -Container $oldWriter -Name 'DB_PASSWORD'
$hadPassword = Test-Path Env:DB_PASSWORD
$oldPassword = if ($hadPassword) { $env:DB_PASSWORD } else { $null }
try {
    $env:DB_PASSWORD = $dbPassword
    $hashOutput = @(& docker run --rm --pull=never --network $ExpectedDatabaseNetworkName --read-only `
        --tmpfs '/tmp:rw,size=64m' --cap-drop ALL --security-opt no-new-privileges `
        -e 'DB_PASSWORD' -e "DB_HOST=$ExpectedContainerName" -e "DB_NAME=$dbName" -e "DB_USER=$dbUser" `
        --entrypoint node $ExpectedServerImageId --input-type=module -e $hashProbe 2>$null)
    $hashExitCode = $LASTEXITCODE
} finally {
    if ($hadPassword) { $env:DB_PASSWORD = $oldPassword }
    else { Remove-Item Env:DB_PASSWORD -ErrorAction SilentlyContinue }
    $dbPassword = $null
}
if ($hashExitCode -ne 0 -or $hashOutput.Count -ne 1 -or
    $hashOutput[0] -cne $ExpectedProjectionContentHash) { throw 'handoff_import_content_hash_mismatch' }

$backupRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'backups')).TrimEnd('\', '/')
$handoffPath = [IO.Path]::GetFullPath($HandoffEvidenceDirectory).TrimEnd('\', '/')
if (-not [IO.Path]::IsPathFullyQualified($HandoffEvidenceDirectory) -or
    -not $handoffPath.StartsWith($backupRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
    (Test-Path -LiteralPath (Join-Path $handoffPath 'handoff-evidence.json'))) {
    throw 'handoff_evidence_destination_invalid'
}
if ($VerifyOnly) {
    Write-Output "q3_server_handoff_verify_only_ready product_commit=$ExpectedProductSourceCommit rows=$ExpectedImportedRows frozen=YES old_writer_stopped=YES"
    return
}

$startedAt = [DateTime]::UtcNow.ToString('o')
$frozenStopped = $false
$completed = $false
try {
    & docker stop --time 30 $ExpectedFrozenContainerName 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'handoff_frozen_stop_failed' }
    $frozenStopped = $true
    $stopped = Get-Q3DockerObject -Arguments @('inspect', '--type', 'container', $ExpectedFrozenContainerName)
    if ($stopped.Id -cne $ExpectedFrozenContainerId -or $stopped.State.Running -ne $false) {
        throw 'handoff_frozen_not_stopped'
    }
    Assert-Q3PortReleased -Port $ExpectedHostPort
    $dbPassword = Get-Q3Setting -Container $oldWriter -Name 'DB_PASSWORD'
    $hadPassword = Test-Path Env:DB_PASSWORD
    $oldPassword = if ($hadPassword) { $env:DB_PASSWORD } else { $null }
    try {
        $env:DB_PASSWORD = $dbPassword
        & docker run --detach --pull=never --name $ServerContainerName --network $ExpectedDatabaseNetworkName `
            --publish "127.0.0.1:$($ExpectedHostPort):3000" --read-only --tmpfs '/tmp:rw,size=64m' `
            --cap-drop ALL --security-opt no-new-privileges `
            --label 'io.zhixu.server-authority=true' `
            -e 'NODE_ENV=production' -e 'DB_PASSWORD' -e "DB_HOST=$ExpectedContainerName" -e 'DB_PORT=5432' `
            -e "DB_NAME=$dbName" -e "DB_USER=$dbUser" `
            -e "ZHIXU_ALLOWED_ORIGINS=$ExpectedBrowserOrigin" -e 'ZHIXU_COOKIE_SECURE=true' `
            -e 'ZHIXU_SERVER_HOST=0.0.0.0' -e 'ZHIXU_SERVER_PORT=3000' `
            $ExpectedServerImageId 2>$null | Out-Null
        $runExitCode = $LASTEXITCODE
    } finally {
        if ($hadPassword) { $env:DB_PASSWORD = $oldPassword }
        else { Remove-Item Env:DB_PASSWORD -ErrorAction SilentlyContinue }
        $dbPassword = $null
    }
    if ($runExitCode -ne 0) { throw 'handoff_server_start_failed' }
    if ($DisposableForceHealthFailure) { throw 'handoff_candidate_health_failed' }
    $deadline = [DateTime]::UtcNow.AddSeconds($HealthTimeoutSeconds)
    $healthy = $false
    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri "$ExpectedBrowserOrigin/api/v1/health" -TimeoutSec 3
            $health = $response.Content | ConvertFrom-Json -DateKind String
            $build = (Invoke-WebRequest -Uri "$ExpectedBrowserOrigin/build-info.json" -TimeoutSec 3).Content | ConvertFrom-Json -DateKind String
            if ($response.StatusCode -eq 200 -and $health.status -ceq 'ok' -and
                $build.gitCommit -ceq $ExpectedProductSourceCommit -and
                $build.buildId -ceq $ExpectedServerBuildId -and
                $build.buildTime -ceq $ExpectedServerBuildTime -and
                $build.masterSettingsAuthority -ceq 'server') { $healthy = $true; break }
        } catch { Start-Sleep -Milliseconds 500 }
        Start-Sleep -Milliseconds 500
    }
    if (-not $healthy) { throw 'handoff_candidate_health_failed' }
    $candidate = Get-Q3DockerObject -Arguments @('inspect', '--type', 'container', $ServerContainerName)
    $bindings = @($candidate.HostConfig.PortBindings.'3000/tcp')
    if ($candidate.Name -cne "/$ServerContainerName" -or $candidate.Image -cne $ExpectedServerImageId -or
        $candidate.State.Running -ne $true -or $candidate.HostConfig.NetworkMode -cne $ExpectedDatabaseNetworkName -or
        $candidate.Config.Labels.'io.zhixu.server-authority' -cne 'true' -or
        $candidate.HostConfig.ReadonlyRootfs -ne $true -or @($candidate.Mounts).Count -ne 0 -or
        $bindings.Count -ne 1 -or $bindings[0].HostIp -cne '127.0.0.1' -or
        $bindings[0].HostPort -cne [string]$ExpectedHostPort) { throw 'handoff_candidate_identity_mismatch' }
    $oldAfter = Get-Q3DockerObject -Arguments @('inspect', '--type', 'container', $ExpectedOldWriterName)
    if ($oldAfter.Id -cne $ExpectedOldWriterId -or $oldAfter.State.Running -ne $false) {
        throw 'handoff_old_writer_restarted'
    }
    New-Item -ItemType Directory -Path $handoffPath -Force | Out-Null
    $handoffEvidence = [ordered]@{
        contract = 'zhixu-q3-server-handoff.v1'; result = 'SERVER_HEALTHY'; startedAt = $startedAt
        finishedAt = [DateTime]::UtcNow.ToString('o'); operator = $OperatorLabel
        authorizationRef = $AuthorizationRef; operationalCommit = $ExpectedOperationalCommit
        productSourceCommit = $ExpectedProductSourceCommit; importExecutionId = $ExpectedImportExecutionId
        importEvidenceSha256 = $ExpectedImportEvidenceSha256; importedCounts = $import.readbackCounts
        projectionContentHash = $ExpectedProjectionContentHash; serverImageId = $ExpectedServerImageId
        serverContainerId = $candidate.Id; serverBuildId = $ExpectedServerBuildId
        serverBuildTime = $ExpectedServerBuildTime; authority = 'server'; origin = $ExpectedBrowserOrigin
        oldWriterStopped = $true; healthPassed = $true; startupInfrastructureWritesPossible = $true
    }
    $evidenceFile = Join-Path $handoffPath 'handoff-evidence.json'
    $bytes = [Text.Encoding]::UTF8.GetBytes(($handoffEvidence | ConvertTo-Json -Depth 8) + "`n")
    $stream = [IO.File]::Open($evidenceFile, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) }
    finally { $stream.Dispose() }
    $completed = $true
    Write-Output "q3_server_handoff_complete server_container_id=$($candidate.Id) authority=server old_writer_stopped=YES evidence_sha256=$((Get-FileHash -LiteralPath $evidenceFile -Algorithm SHA256).Hash.ToLowerInvariant())"
} finally {
    if (-not $completed -and $frozenStopped) {
        & docker inspect --type container $ServerContainerName 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $item = Get-Q3DockerObject -Arguments @('inspect', '--type', 'container', $ServerContainerName)
            if ($item.Name -cne "/$ServerContainerName" -or $item.Image -cne $ExpectedServerImageId) {
                throw 'handoff_candidate_cleanup_identity_mismatch_keep_writers_stopped'
            }
            & docker rm --force $ServerContainerName 2>$null | Out-Null
            if ($LASTEXITCODE -ne 0) { throw 'handoff_candidate_cleanup_failed_keep_writers_stopped' }
        }
        & docker start $ExpectedFrozenContainerName 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'handoff_frozen_recovery_failed_keep_writers_stopped' }
        $recovered = Assert-Q3FrozenStatic -ContainerName $ExpectedFrozenContainerName -ContainerId $ExpectedFrozenContainerId `
            -ImageId $ExpectedFrozenImageId -Origin $ExpectedBrowserOrigin -Port $ExpectedHostPort `
            -Revision $ExpectedProductSourceCommit -BuildId $ExpectedFrozenBuildId -BuildTime $ExpectedFrozenBuildTime
        Write-Warning "handoff_failed_frozen_recovered new_started_at=$($recovered.State.StartedAt) freeze_evidence_invalidated=YES old_writer_not_restarted=YES possible_startup_infrastructure_writes=YES"
    }
}
