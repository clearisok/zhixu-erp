# Shared exact-target guard for operator backup/restore. Never print container environment.
Set-StrictMode -Version Latest

function Invoke-ZhixuDockerJson {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)
    $output = & docker @Arguments 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $output) { throw 'docker_metadata_unavailable' }
    try { return ($output -join "`n" | ConvertFrom-Json) }
    catch { throw 'docker_metadata_invalid' }
}

function Invoke-ZhixuReadOnlySql {
    param(
        [Parameter(Mandatory = $true)][string]$ContainerName,
        [Parameter(Mandatory = $true)][string]$Query
    )
    $sql = "BEGIN READ ONLY;`nSHOW transaction_read_only;`n$Query`nCOMMIT;"
    $output = @($sql | & docker exec -i $ContainerName sh -c 'exec psql -X -q -w -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -A -t -F "|"' 2>$null)
    if ($LASTEXITCODE -ne 0 -or $output.Count -lt 2 -or $output[0].Trim() -ne 'on') {
        throw 'database_read_only_identity_unavailable'
    }
    return $output
}

function Get-ZhixuTargetFingerprint {
    param([Parameter(Mandatory = $true)][string[]]$Fields)
    # v1 is byte-compatible with Q3B2E/Q3B2F:
    # project|container|PGDATA mount name|database|server address or local_socket|port
    $canonical = $Fields -join '|'
    $hasher = [Security.Cryptography.SHA256]::Create()
    try {
        $hash = $hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($canonical))
        return [BitConverter]::ToString($hash).Replace('-', '').ToLowerInvariant()
    } finally { $hasher.Dispose() }
}

function Get-ZhixuVerifiedTarget {
    param(
        [Parameter(Mandatory = $true)][string]$ExpectedContainerName,
        [Parameter(Mandatory = $true)][string]$ExpectedComposeProject,
        [Parameter(Mandatory = $true)][string]$ExpectedVolumeName,
        [Parameter(Mandatory = $true)][string]$ExpectedDatabaseName,
        [Parameter(Mandatory = $true)][string]$ExpectedTargetFingerprint
    )
    foreach ($value in @($ExpectedContainerName, $ExpectedComposeProject, $ExpectedVolumeName, $ExpectedDatabaseName)) {
        if ($value -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$') { throw 'invalid_target_intent' }
    }
    if ($ExpectedTargetFingerprint -cnotmatch '^[0-9a-f]{64}$') { throw 'invalid_target_fingerprint' }

    $inspection = @(Invoke-ZhixuDockerJson -Arguments @('inspect', '--type', 'container', $ExpectedContainerName))
    if ($inspection.Count -ne 1) { throw 'ambiguous_container' }
    $container = $inspection[0]
    if ($container.Name -ne "/$ExpectedContainerName" -or $container.State.Running -ne $true) {
        throw 'container_not_running_or_mismatch'
    }
    $project = [string]$container.Config.Labels.'com.docker.compose.project'
    $service = [string]$container.Config.Labels.'com.docker.compose.service'
    if ($project -cne $ExpectedComposeProject) { throw 'compose_project_mismatch' }
    if ($service -cne 'database') { throw 'database_service_mismatch' }

    $dataMounts = @($container.Mounts | Where-Object { $_.Destination -eq '/var/lib/postgresql/data' })
    if ($ExpectedVolumeName -eq 'tmpfs') {
        $tmpfsData = $container.HostConfig.Tmpfs.PSObject.Properties['/var/lib/postgresql/data']
        if ($container.Mounts.Count -ne 0 -or $dataMounts.Count -ne 0 -or -not $tmpfsData) {
            throw 'tmpfs_target_mismatch'
        }
        $actualVolume = 'tmpfs'
    } else {
        if ($container.Mounts.Count -ne 1 -or $dataMounts.Count -ne 1 -or
            $dataMounts[0].Type -ne 'volume' -or $dataMounts[0].Name -cne $ExpectedVolumeName) {
            throw 'database_volume_mismatch'
        }
        $volumeInspection = @(Invoke-ZhixuDockerJson -Arguments @('volume', 'inspect', $ExpectedVolumeName))
        if ($volumeInspection.Count -ne 1 -or
            $volumeInspection[0].Labels.'com.docker.compose.project' -cne $ExpectedComposeProject) {
            throw 'volume_project_mismatch'
        }
        $actualVolume = [string]$dataMounts[0].Name
    }

    $identity = @(Invoke-ZhixuReadOnlySql -ContainerName $ExpectedContainerName -Query "SELECT current_database(), current_user, coalesce(inet_server_addr()::text, 'local_socket'), current_setting('port'), current_setting('server_version_num');")
    $fields = @($identity[1] -split '\|')
    if ($fields.Count -ne 5 -or $fields[0] -cne $ExpectedDatabaseName -or
        $fields[2] -notmatch '^[A-Za-z0-9_.:-]+$' -or $fields[3] -notmatch '^[0-9]{2,5}$' -or
        $fields[4] -notmatch '^[0-9]{5,6}$') {
        throw 'database_identity_mismatch'
    }
    $fingerprint = Get-ZhixuTargetFingerprint -Fields @($project, $ExpectedContainerName, $actualVolume, $fields[0], $fields[2], $fields[3])
    if ($fingerprint -cne $ExpectedTargetFingerprint) { throw 'target_fingerprint_mismatch' }
    return [PSCustomObject]@{
        ContainerName = $ExpectedContainerName
        ComposeProject = $project
        Service = $service
        VolumeName = $actualVolume
        DatabaseName = $fields[0]
        DatabaseUser = $fields[1]
        ServerAddress = $fields[2]
        ServerPort = $fields[3]
        PostgresVersionNumber = $fields[4]
        Fingerprint = $fingerprint
    }
}

function Assert-ZhixuWritersFrozen {
    param([Parameter(Mandatory = $true)]$Target)
    $ids = @(& docker ps -a --filter "label=com.docker.compose.project=$($Target.ComposeProject)" --format '{{.ID}}' 2>$null)
    if ($LASTEXITCODE -ne 0) { throw 'writer_inventory_unavailable' }
    foreach ($id in $ids) {
        if (-not $id) { continue }
        $inspection = @(Invoke-ZhixuDockerJson -Arguments @('inspect', '--type', 'container', $id))
        if ($inspection.Count -ne 1) { throw 'writer_inventory_ambiguous' }
        $item = $inspection[0]
        if ($item.State.Running -eq $true -and $item.Name -ne "/$($Target.ContainerName)") {
            throw 'application_writer_not_frozen'
        }
    }
    $sessions = @(Invoke-ZhixuReadOnlySql -ContainerName $Target.ContainerName -Query "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND backend_type = 'client backend' AND pid <> pg_backend_pid();")
    if ($sessions[1] -notmatch '^[0-9]+$' -or [long]$sessions[1] -ne 0) {
        throw 'database_clients_not_frozen'
    }
}
