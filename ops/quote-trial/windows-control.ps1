# Daily entrypoint for this real, persistent target. Never init/restore/down/cleanup.
[CmdletBinding()]
param([ValidateSet('Start','Status','Restart','Logs','Backup')][string]$Action='Status')
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$true
$root='D:\zhixu-local-trial\win01'
$project='zhixu-quote-trial-win01'
$config=Join-Path $root 'trial.conf'
$cli=Join-Path $root 'tools/ops/quote-trial/trial.mjs'
try {
    if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'powershell_7_required' }
    $manifest=Get-Content -LiteralPath (Join-Path $root 'target.json') -Raw | ConvertFrom-Json
    if ($manifest.root -ne $root -or $manifest.project -ne $project) { throw 'target_mismatch' }
    if ((& docker context show) -ne 'desktop-linux' -or (& docker context inspect desktop-linux --format '{{.Endpoints.docker.Host}}') -ne 'npipe:////./pipe/dockerDesktopLinuxEngine') { throw 'local_docker_required' }
    foreach ($field in $manifest.files.PSObject.Properties) {
        if ((Get-FileHash -LiteralPath (Join-Path $root "tools/$($field.Name)") -Algorithm SHA256).Hash.ToLowerInvariant() -ne $field.Value) { throw 'snapshot_mismatch' }
    }
    if ($Action -ne 'Backup') {
        if ($Action -in @('Start','Restart')) { & node $cli $Action.ToLowerInvariant() $config "--execute=$project" }
        else { & node $cli $Action.ToLowerInvariant() $config }
    } else {
        # Canonical target and dump wrapper; no restore. Fresh exclusive object bundle per backup.
        $target=(& node $cli target $config | Out-String | ConvertFrom-Json)
        if ($target.project -ne $project -or $target.container -ne "$project-database-1" -or $target.volume -ne "$($project)_data" -or $target.database -ne 'quote_trial') { throw 'target_mismatch' }
        $bundle=Join-Path $root ('object-backups/'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8))
        if (Test-Path -LiteralPath $bundle) { throw 'backup_destination_exists' }
        [void][IO.Directory]::CreateDirectory($bundle)
        $lines=[IO.File]::ReadAllLines($config) | ForEach-Object { if ($_.StartsWith('TRIAL_OBJECT_BUNDLE_DIR=')) { 'TRIAL_OBJECT_BUNDLE_DIR='+$bundle.Replace('\','/') } else { $_ } }
        $backupConfig=Join-Path $bundle 'backup.conf'
        $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($lines -join "`n")+"`n")
        $stream=[IO.FileStream]::new($backupConfig,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        try { $stream.Write($bytes,0,$bytes.Length) } finally { $stream.Dispose();[Array]::Clear($bytes) }
        & node $cli check $backupConfig
        & node $cli maintenance $config "--execute=$project"
        & (Join-Path $root 'tools/Backup-Zhixu.ps1') -ExpectedContainerName $target.container -ExpectedComposeProject $project -ExpectedVolumeName $target.volume -ExpectedDatabaseName $target.database -ExpectedTargetFingerprint $target.fingerprint
        & node $cli objects-export $backupConfig "--execute=$project"
        & node $cli start $config "--execute=$project"
        Write-Output (@{result='BACKUP_AND_RESUME_PASS';objectBundle=$bundle} | ConvertTo-Json -Compress)
    }
} catch {
    Write-Output (@{result='FAIL';action=$Action;code='review_safe_cli_output_do_not_delete_or_restore';maintenance=($Action -eq 'Backup')} | ConvertTo-Json -Compress)
    exit 1
}
