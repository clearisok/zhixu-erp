param(
    [Parameter(Mandatory = $true)][string]$ExpectedContainerName,
    [Parameter(Mandatory = $true)][string]$ExpectedComposeProject,
    [Parameter(Mandatory = $true)][string]$ExpectedVolumeName,
    [Parameter(Mandatory = $true)][string]$ExpectedDatabaseName,
    [Parameter(Mandatory = $true)][string]$ExpectedTargetFingerprint,
    [Parameter(Mandatory = $true)][string]$ExpectedWriterContainerName,
    [Parameter(Mandatory = $true)][string]$ExpectedWriterContainerId,
    [Parameter(Mandatory = $true)][string]$ExpectedWriterImageId,
    [Parameter(Mandatory = $true)][string]$ExpectedBrowserOrigin,
    [Parameter(Mandatory = $true)][int]$ExpectedHostPort,
    [Parameter(Mandatory = $true)][string]$ExpectedStaticContainerName,
    [Parameter(Mandatory = $true)][string]$ExpectedStaticContainerId,
    [Parameter(Mandatory = $true)][string]$ExpectedFrozenImageId,
    [Parameter(Mandatory = $true)][string]$ExpectedFrozenRevision,
    [Parameter(Mandatory = $true)][string]$ExpectedFrozenBuildId,
    [Parameter(Mandatory = $true)][string]$ExpectedFrozenBuildTime,
    [Parameter(Mandatory = $true)][string]$FrozenEvidenceFile,
    [Parameter(Mandatory = $true)][string]$ExpectedFrozenEvidenceSha256,
    [switch]$VerifyOnly,
    [switch]$Execute,
    [string]$ConfirmWriterFreeze
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'database-target-guard.ps1')
. (Join-Path $PSScriptRoot 'q3-split-topology.ps1')
if ($VerifyOnly -eq $Execute) { throw 'select_exactly_one_writer_freeze_mode' }
if ($Execute -and $ConfirmWriterFreeze -cne 'I_UNDERSTAND_Q3_INDEPENDENT_WRITER_STOP_KEEPS_FRONTEND_FROZEN') {
    throw 'independent_writer_confirmation_required'
}
if ($ExpectedWriterContainerName -cnotmatch '^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$' -or
    $ExpectedWriterContainerName -ceq $ExpectedContainerName -or
    $ExpectedWriterContainerId -cnotmatch '^[0-9a-f]{64}$' -or
    $ExpectedStaticContainerId -cnotmatch '^[0-9a-f]{64}$' -or
    $ExpectedWriterImageId -cnotmatch '^sha256:[0-9a-f]{64}$' -or
    $ExpectedFrozenEvidenceSha256 -cnotmatch '^[0-9a-f]{64}$') { throw 'split_writer_intent_invalid' }
$target = Get-ZhixuVerifiedTarget -ExpectedContainerName $ExpectedContainerName `
    -ExpectedComposeProject $ExpectedComposeProject -ExpectedVolumeName $ExpectedVolumeName `
    -ExpectedDatabaseName $ExpectedDatabaseName -ExpectedTargetFingerprint $ExpectedTargetFingerprint
Assert-Q3FrozenImage -ImageId $ExpectedFrozenImageId -Revision $ExpectedFrozenRevision `
    -BuildId $ExpectedFrozenBuildId -BuildTime $ExpectedFrozenBuildTime
$static = Assert-Q3FrozenStatic -ContainerName $ExpectedStaticContainerName -ContainerId $ExpectedStaticContainerId `
    -ImageId $ExpectedFrozenImageId -Origin $ExpectedBrowserOrigin -Port $ExpectedHostPort `
    -Revision $ExpectedFrozenRevision -BuildId $ExpectedFrozenBuildId -BuildTime $ExpectedFrozenBuildTime
try { $evidencePath = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $FrozenEvidenceFile).Path) }
catch { throw 'split_freeze_evidence_unavailable' }
$evidenceItem = Get-Item -LiteralPath $evidencePath
if ($evidenceItem.PSIsContainer -or ($evidenceItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
    (Get-FileHash -LiteralPath $evidencePath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ExpectedFrozenEvidenceSha256) {
    throw 'split_freeze_evidence_invalid'
}
try { $evidence = Get-Content -LiteralPath $evidencePath -Raw | ConvertFrom-Json -DateKind String }
catch { throw 'split_freeze_evidence_invalid' }
if ($evidence.result -cne 'PASS' -or $evidence.allOldTabsClosedBeforeFrozenReopen -ne $true -or
    $evidence.browserOrigin -cne $ExpectedBrowserOrigin -or $evidence.observed.masterSettingsAuthority -cne 'frozen' -or
    $evidence.observed.gitCommit -cne $ExpectedFrozenRevision -or
    $evidence.observed.buildId -cne $ExpectedFrozenBuildId -or
    $evidence.observed.buildTime -cne $ExpectedFrozenBuildTime -or
    $evidence.frozenFrontend.topology -cne 'split' -or
    $evidence.frozenFrontend.containerName -cne $ExpectedStaticContainerName -or
    $evidence.frozenFrontend.containerId -cne $ExpectedStaticContainerId -or
    $evidence.frozenFrontend.imageId -cne $ExpectedFrozenImageId -or
    $evidence.frozenFrontend.startedAt -cne $static.State.StartedAt -or
    $evidence.frozenFrontend.restartCount -ne $static.RestartCount -or
    [DateTime]::Parse($evidence.freezeStartedAt).ToUniversalTime() -lt [DateTime]::Parse($static.Created).ToUniversalTime()) {
    throw 'split_freeze_evidence_mismatch'
}
$writer = Get-Q3DockerObject -Arguments @('inspect', '--type', 'container', $ExpectedWriterContainerName)
if ($writer.Name -cne "/$ExpectedWriterContainerName" -or $writer.Id -cne $ExpectedWriterContainerId -or
    $writer.Image -cne $ExpectedWriterImageId -or $writer.State.Running -ne $true -or
    $writer.Config.Labels.'com.docker.compose.project' -cne $ExpectedComposeProject -or
    $writer.Config.Labels.'com.docker.compose.service' -cne 'server') { throw 'split_writer_identity_mismatch' }
$writerBindings = @($writer.NetworkSettings.Ports.'3000/tcp')
if (@($writerBindings | Where-Object { $_ -and $_.HostPort -ceq [string]$ExpectedHostPort }).Count -ne 0) {
    throw 'split_writer_owns_browser_origin'
}
$ids = @(& docker ps --filter "label=com.docker.compose.project=$ExpectedComposeProject" --format '{{.ID}}' 2>$null)
if ($LASTEXITCODE -ne 0) { throw 'split_writer_inventory_unavailable' }
foreach ($id in $ids) {
    if (-not $id) { continue }
    $item = Get-Q3DockerObject -Arguments @('inspect', '--type', 'container', $id)
    if ($item.Name -notin @("/$ExpectedContainerName", "/$ExpectedWriterContainerName")) {
        throw 'split_other_project_writer_running'
    }
}
if ($VerifyOnly) {
    Write-Output "q3_independent_writer_verify_only_ready static_container_id=$($static.Id) writer_not_stopped=YES target_verified=YES"
    return
}

# The independent frontend stays running. Never automatically restart this writer on failure.
& docker stop --time 30 $ExpectedWriterContainerName 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'split_writer_stop_failed_keep_freeze' }
$stopped = Get-Q3DockerObject -Arguments @('inspect', '--type', 'container', $ExpectedWriterContainerName)
if ($stopped.Id -cne $ExpectedWriterContainerId -or $stopped.State.Running -ne $false) {
    throw 'split_writer_still_running_keep_freeze'
}
$after = Assert-Q3FrozenStatic -ContainerName $ExpectedStaticContainerName -ContainerId $ExpectedStaticContainerId `
    -ImageId $ExpectedFrozenImageId -Origin $ExpectedBrowserOrigin -Port $ExpectedHostPort `
    -Revision $ExpectedFrozenRevision -BuildId $ExpectedFrozenBuildId -BuildTime $ExpectedFrozenBuildTime
if ($after.Id -cne $static.Id -or $after.State.StartedAt -cne $static.State.StartedAt -or
    $after.RestartCount -ne $static.RestartCount) { throw 'split_frozen_continuity_lost_keep_freeze' }
Assert-ZhixuWritersFrozen -Target $target
Write-Output "q3_independent_writer_frozen static_container_id=$($after.Id) frozen_continuity=YES writers_frozen=YES keep_browser_frozen=YES"
