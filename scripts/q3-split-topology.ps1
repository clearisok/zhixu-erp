# Shared, sanitized checks for a standalone frozen Browser provider.
Set-StrictMode -Version Latest

function Get-Q3DockerObject {
    param([string[]]$Arguments)
    $output = @(& docker @Arguments 2>$null)
    if ($LASTEXITCODE -ne 0 -or $output.Count -eq 0) { throw 'split_docker_identity_unavailable' }
    try { return @(($output -join "`n" | ConvertFrom-Json -DateKind String))[0] }
    catch { throw 'split_docker_metadata_invalid' }
}

function Assert-Q3SplitOrigin {
    param([string]$Origin, [int]$Port)
    try { $parsed = [Uri]::new($Origin) }
    catch { throw 'split_origin_invalid' }
    if ($parsed.Scheme -cne 'http' -or $parsed.Host -cne '127.0.0.1' -or
        $parsed.Port -ne $Port -or $parsed.AbsolutePath -cne '/' -or $parsed.Query -or
        $parsed.Fragment -or $parsed.UserInfo -or
        $parsed.GetLeftPart([UriPartial]::Authority) -cne $Origin.TrimEnd('/')) {
        throw 'split_origin_port_mismatch'
    }
}

function Assert-Q3NoDbEnvironment {
    param($Object)
    foreach ($entry in @($Object.Config.Env)) {
        $name = ([string]$entry -split '=', 2)[0]
        if ($name -match '^(DB_|DATABASE_URL$|ZHIXU_DB_|ZHIXU_DATABASE_URL$|POSTGRES_|PGHOST$|PGPORT$|PGDATABASE$|PGUSER$|PGPASSWORD$|PGPASSFILE$|ZHIXU_ADMIN_PASSWORD$)') {
            throw 'split_database_environment_forbidden'
        }
    }
}

function Assert-Q3FrozenImage {
    param([string]$ImageId, [string]$Revision, [string]$BuildId, [string]$BuildTime)
    if ($ImageId -cnotmatch '^sha256:[0-9a-f]{64}$' -or $Revision -cnotmatch '^[0-9a-f]{40}$' -or
        $BuildId -cnotmatch '^[A-Za-z0-9_.:@/-]{1,128}$' -or
        $BuildTime -cnotmatch '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$') { throw 'split_image_intent_invalid' }
    $image = Get-Q3DockerObject -Arguments @('image', 'inspect', $ImageId)
    if ($image.Id -cne $ImageId) { throw 'split_image_id_mismatch' }
    if ($image.Config.Labels.'org.opencontainers.image.revision' -cne $Revision) { throw 'split_image_revision_mismatch' }
    if ($image.Config.Labels.'org.opencontainers.image.created' -cne $BuildTime) { throw 'split_image_time_mismatch' }
    if ($image.Config.Labels.'io.zhixu.build-id' -cne $BuildId) { throw 'split_image_build_id_mismatch' }
    if ($image.Config.Labels.'io.zhixu.master-settings-authority' -cne 'frozen') { throw 'split_image_authority_mismatch' }
    $volumes = $image.Config.PSObject.Properties['Volumes']
    if ($null -ne $volumes -and $null -ne $volumes.Value -and @($volumes.Value.PSObject.Properties).Count -ne 0) {
        throw 'split_image_volume_required'
    }
    Assert-Q3NoDbEnvironment -Object $image
    $raw = @(& docker run --rm --pull=never --network none --read-only --entrypoint node $ImageId `
        -e 'process.stdout.write(require("fs").readFileSync("/app/dist/client/build-info.json","utf8"))' 2>$null)
    if ($LASTEXITCODE -ne 0 -or $raw.Count -eq 0) { throw 'split_compiled_build_unavailable' }
    try { $info = ($raw -join "`n" | ConvertFrom-Json -DateKind String) }
    catch { throw 'split_compiled_build_invalid' }
    if ($info.gitCommit -cne $Revision -or $info.buildId -cne $BuildId -or
        $info.buildTime -cne $BuildTime -or $info.masterSettingsAuthority -cne 'frozen') {
        throw 'split_compiled_build_mismatch'
    }
}

function Assert-Q3PortReleased {
    param([int]$Port)
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
    try { $listener.Start() }
    catch { throw 'frontend_port_not_released' }
    finally { $listener.Stop() }
}

function Assert-Q3FrozenStatic {
    param([string]$ContainerName, [string]$ContainerId, [string]$ImageId, [string]$Origin, [int]$Port,
          [string]$Revision, [string]$BuildId, [string]$BuildTime)
    Assert-Q3SplitOrigin -Origin $Origin -Port $Port
    $item = Get-Q3DockerObject -Arguments @('inspect', '--type', 'container', $ContainerName)
    if ($item.Name -cne "/$ContainerName" -or $item.Id -cne $ContainerId -or
        $item.State.Running -ne $true -or $item.Image -cne $ImageId -or
        $item.Config.Labels.'io.zhixu.maintenance-static' -cne 'true' -or
        $item.Config.Labels.PSObject.Properties['com.docker.compose.project'] -or
        $item.HostConfig.NetworkMode -cne 'bridge' -or @($item.Mounts).Count -ne 0 -or
        $item.HostConfig.ReadonlyRootfs -ne $true -or
        'ALL' -notin @($item.HostConfig.CapDrop) -or
        'no-new-privileges' -notin @($item.HostConfig.SecurityOpt) -or
        @($item.NetworkSettings.Networks.PSObject.Properties.Name).Count -ne 1 -or
        @($item.NetworkSettings.Networks.PSObject.Properties.Name)[0] -cne 'bridge') {
        throw 'split_frozen_container_identity_mismatch'
    }
    Assert-Q3NoDbEnvironment -Object $item
    $bindings = @($item.HostConfig.PortBindings.'3000/tcp')
    if ($bindings.Count -ne 1 -or $bindings[0].HostIp -cne '127.0.0.1' -or
        $bindings[0].HostPort -cne [string]$Port) { throw 'split_frozen_port_mismatch' }
    try {
        $health = Invoke-RestMethod -Uri "$Origin/maintenance-health" -Method Get -TimeoutSec 10
        $info = (Invoke-WebRequest -Uri "$Origin/build-info.json" -Method Get -TimeoutSec 10).Content | ConvertFrom-Json -DateKind String
        $api = Invoke-WebRequest -Uri "$Origin/api/v1/health" -Method Get -SkipHttpErrorCheck -TimeoutSec 10
    } catch { throw 'split_frozen_origin_unavailable' }
    if ($health.status -cne 'static_alive' -or $health.database -cne 'not_connected' -or
        $info.gitCommit -cne $Revision -or $info.buildId -cne $BuildId -or
        $info.buildTime -cne $BuildTime -or $info.masterSettingsAuthority -cne 'frozen' -or
        $api.StatusCode -ne 503) { throw 'split_frozen_origin_mismatch' }
    return $item
}
