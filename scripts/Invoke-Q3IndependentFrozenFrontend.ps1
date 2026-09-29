param(
    [Parameter(Mandatory = $true)][string]$ExpectedImageId,
    [Parameter(Mandatory = $true)][string]$ExpectedImageRevision,
    [Parameter(Mandatory = $true)][string]$ExpectedBuildId,
    [Parameter(Mandatory = $true)][string]$ExpectedBuildTime,
    [Parameter(Mandatory = $true)][string]$ExpectedBrowserOrigin,
    [Parameter(Mandatory = $true)][string]$ExpectedStaticContainerName,
    [Parameter(Mandatory = $true)][int]$ExpectedHostPort,
    [switch]$VerifyOnly,
    [switch]$Execute,
    [string]$ConfirmFrontendReplacement
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'q3-split-topology.ps1')
if ($VerifyOnly -eq $Execute) { throw 'select_exactly_one_frontend_mode' }
if ($Execute -and $ConfirmFrontendReplacement -cne 'I_UNDERSTAND_Q3_FROZEN_FRONTEND_REPLACES_CURRENT_3001') {
    throw 'independent_frontend_confirmation_required'
}
if ($ExpectedStaticContainerName -cnotmatch '^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$' -or
    $ExpectedHostPort -lt 1 -or $ExpectedHostPort -gt 65535) { throw 'split_frontend_intent_invalid' }
Assert-Q3SplitOrigin -Origin $ExpectedBrowserOrigin -Port $ExpectedHostPort
Assert-Q3FrozenImage -ImageId $ExpectedImageId -Revision $ExpectedImageRevision -BuildId $ExpectedBuildId -BuildTime $ExpectedBuildTime
& docker inspect --type container $ExpectedStaticContainerName 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) { throw 'split_static_name_already_used' }
Assert-Q3PortReleased -Port $ExpectedHostPort
if ($VerifyOnly) {
    Write-Output 'q3_independent_frontend_verify_only_ready port_released=YES image_frozen=YES no_writer_stopped=YES'
    return
}

# No process is killed here. The operator must separately stop the exact old host frontend.
& docker run --detach --pull=never --name $ExpectedStaticContainerName --network bridge `
    --publish "127.0.0.1:$($ExpectedHostPort):3000" --read-only --tmpfs '/tmp:rw,size=16m' `
    --cap-drop ALL --security-opt no-new-privileges --no-healthcheck `
    --label 'io.zhixu.maintenance-static=true' --entrypoint node $ExpectedImageId `
    dist/server/server/maintenance-static.js 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'split_static_start_failed_keep_freeze' }
$static = Get-Q3DockerObject -Arguments @('inspect', '--type', 'container', $ExpectedStaticContainerName)
$verified = $null
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try {
        $verified = Assert-Q3FrozenStatic -ContainerName $ExpectedStaticContainerName -ContainerId $static.Id `
            -ImageId $ExpectedImageId -Origin $ExpectedBrowserOrigin -Port $ExpectedHostPort `
            -Revision $ExpectedImageRevision -BuildId $ExpectedBuildId -BuildTime $ExpectedBuildTime
        break
    } catch {
        if ($_.Exception.Message -cne 'split_frozen_origin_unavailable' -or $attempt -eq 19) { throw }
        Start-Sleep -Milliseconds 250
    }
}
Write-Output "q3_independent_frontend_started container_id=$($verified.Id) image_id=$ExpectedImageId same_origin=YES static_only=YES writer_not_stopped=YES"
