param(
    [Parameter(Mandatory = $true)][string]$ExpectedWriterContainerName,
    [Parameter(Mandatory = $true)][string]$ExpectedWriterComposeProject,
    [Parameter(Mandatory = $true)][string]$ExpectedImageId,
    [Parameter(Mandatory = $true)][string]$ExpectedImageRevision,
    [Parameter(Mandatory = $true)][string]$ExpectedBuildId,
    [Parameter(Mandatory = $true)][string]$ExpectedBuildTime,
    [Parameter(Mandatory = $true)][string]$ExpectedBrowserOrigin,
    [Parameter(Mandatory = $true)][string]$ExpectedStaticContainerName,
    [Parameter(Mandatory = $true)][int]$ExpectedHostPort,
    [switch]$VerifyOnly,
    [switch]$Execute,
    [string]$ConfirmHandoff
)

$ErrorActionPreference = 'Stop'
if ($VerifyOnly -eq $Execute) { throw 'select_exactly_one_handoff_mode' }
if ($Execute -and $ConfirmHandoff -cne 'I_UNDERSTAND_Q3_HANDOFF_STOPS_WRITER') { throw 'independent_handoff_confirmation_required' }
if ($ExpectedImageId -cnotmatch '^sha256:[0-9a-f]{64}$' -or $ExpectedImageRevision -cnotmatch '^[0-9a-f]{40}$' -or
    $ExpectedBuildId -cnotmatch '^[A-Za-z0-9_.:@/-]{1,128}$' -or
    $ExpectedWriterContainerName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$' -or
    $ExpectedStaticContainerName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$' -or
    $ExpectedStaticContainerName -ceq $ExpectedWriterContainerName -or
    $ExpectedHostPort -lt 1 -or $ExpectedHostPort -gt 65535) { throw 'handoff_intent_invalid' }
try { $origin = [Uri]::new($ExpectedBrowserOrigin) }
catch { throw 'handoff_origin_invalid' }
if ($origin.Scheme -cne 'http' -or $origin.Host -notin @('127.0.0.1', 'localhost') -or
    $origin.Port -ne $ExpectedHostPort -or $origin.AbsolutePath -cne '/' -or
    $origin.Query -or $origin.Fragment -or $origin.UserInfo -or
    $origin.GetLeftPart([UriPartial]::Authority) -cne $ExpectedBrowserOrigin.TrimEnd('/')) { throw 'handoff_origin_port_mismatch' }

function Inspect-DockerObject {
    param([string[]]$Arguments)
    $result = @(& docker @Arguments 2>$null)
    if ($LASTEXITCODE -ne 0) { throw 'handoff_docker_identity_unavailable' }
    try { return @($result | ConvertFrom-Json -DateKind String)[0] }
    catch { throw 'handoff_docker_metadata_invalid' }
}
function Assert-NoDbEnvironment {
    param($ContainerOrImage)
    foreach ($entry in @($ContainerOrImage.Config.Env)) {
        $name = ($entry -split '=', 2)[0]
        if ($name -match '^(DB_|DATABASE_URL$|POSTGRES_|PGHOST$|PGPORT$|PGDATABASE$|PGUSER$|PGPASSWORD$|ZHIXU_ADMIN_PASSWORD$)') {
            throw 'handoff_database_environment_forbidden'
        }
    }
}
function Assert-FrozenBuild {
    $repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    & npm exec -- tsx (Join-Path $repoRoot 'scripts/verify-q3-frozen-build.ts') --verify-only `
        --origin $ExpectedBrowserOrigin --commit $ExpectedImageRevision --build-id $ExpectedBuildId --build-time $ExpectedBuildTime 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'running_frozen_build_verification_failed' }
}

$image = Inspect-DockerObject -Arguments @('image', 'inspect', $ExpectedImageId)
if ($image.Id -cne $ExpectedImageId -or
    $image.Config.Labels.'org.opencontainers.image.revision' -cne $ExpectedImageRevision -or
    $image.Config.Labels.'org.opencontainers.image.created' -cne $ExpectedBuildTime -or
    $image.Config.Labels.'io.zhixu.build-id' -cne $ExpectedBuildId -or
    $image.Config.Labels.'io.zhixu.master-settings-authority' -cne 'frozen') { throw 'handoff_image_identity_mismatch' }
Assert-NoDbEnvironment -ContainerOrImage $image
$writer = Inspect-DockerObject -Arguments @('inspect', '--type', 'container', $ExpectedWriterContainerName)
if ($writer.Name -cne "/$ExpectedWriterContainerName" -or $writer.State.Running -ne $true -or
    $writer.Image -cne $ExpectedImageId -or
    $writer.Config.Labels.'com.docker.compose.project' -cne $ExpectedWriterComposeProject) { throw 'handoff_writer_identity_mismatch' }
$bindings = @($writer.NetworkSettings.Ports.'3000/tcp')
if ($bindings.Count -ne 1 -or $bindings[0].HostPort -cne [string]$ExpectedHostPort -or
    $bindings[0].HostIp -notin @('127.0.0.1', '0.0.0.0')) { throw 'handoff_writer_port_mismatch' }
& docker inspect --type container $ExpectedStaticContainerName 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) { throw 'handoff_static_name_already_used' }
Assert-FrozenBuild
if ($VerifyOnly) {
    Write-Output 'q3_maintenance_handoff_verify_only_ready same_image=YES origin_verified=YES writer_not_stopped=YES'
    return
}

# No automatic writer restart: every failure after this boundary keeps the operation frozen.
& docker stop --time 30 $ExpectedWriterContainerName 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'handoff_writer_stop_failed_keep_freeze' }
$stopped = Inspect-DockerObject -Arguments @('inspect', '--type', 'container', $ExpectedWriterContainerName)
if ($stopped.State.Running -ne $false) { throw 'handoff_writer_still_running_keep_freeze' }
& docker run --detach --pull=never --name $ExpectedStaticContainerName --network bridge `
    --publish "127.0.0.1:$($ExpectedHostPort):3000" --read-only --tmpfs '/tmp:rw,size=16m' `
    --cap-drop ALL --security-opt no-new-privileges --no-healthcheck --label 'io.zhixu.maintenance-static=true' `
    --entrypoint node $ExpectedImageId dist/server/server/maintenance-static.js 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'handoff_static_start_failed_keep_freeze' }
$static = Inspect-DockerObject -Arguments @('inspect', '--type', 'container', $ExpectedStaticContainerName)
if ($static.Name -cne "/$ExpectedStaticContainerName" -or $static.State.Running -ne $true -or
    $static.Image -cne $ExpectedImageId -or $static.Config.Labels.'com.docker.compose.project' -or
    $static.HostConfig.NetworkMode -cne 'bridge' -or @($static.Mounts).Count -ne 0 -or
    @($static.NetworkSettings.Networks.PSObject.Properties.Name).Count -ne 1 -or
    @($static.NetworkSettings.Networks.PSObject.Properties.Name)[0] -cne 'bridge') { throw 'handoff_static_isolation_failed_keep_freeze' }
Assert-NoDbEnvironment -ContainerOrImage $static
$staticBindings = @($static.HostConfig.PortBindings.'3000/tcp')
if ($staticBindings.Count -ne 1 -or $staticBindings[0].HostIp -cne '127.0.0.1' -or
    $staticBindings[0].HostPort -cne [string]$ExpectedHostPort) { throw 'handoff_static_port_mismatch_keep_freeze' }
try { $health = Invoke-RestMethod -Method Get -Uri "$ExpectedBrowserOrigin/maintenance-health" -TimeoutSec 15 }
catch { throw 'handoff_static_health_failed_keep_freeze' }
if ($health.status -cne 'static_alive' -or $health.database -cne 'not_connected') { throw 'handoff_static_health_invalid_keep_freeze' }
Assert-FrozenBuild
Write-Output 'q3_maintenance_handoff_complete same_image=YES same_origin=YES static_only=YES writer_stopped=YES'
