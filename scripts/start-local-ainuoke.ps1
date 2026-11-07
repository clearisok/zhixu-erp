param([Parameter(Mandatory=$true)][string]$RuntimeRoot)
$ErrorActionPreference='Stop'
$cfg=Get-Content -LiteralPath (Join-Path $RuntimeRoot 'service.private.json') -Raw|ConvertFrom-Json
if($cfg.schemaVersion -ne 1 -or $cfg.base -ne 'http://127.0.0.1:63051'){throw 'local_runtime_identity_mismatch'}
# Docker Desktop starts after Windows user logon. No password is stored in the task.
& docker info --format '{{.ServerVersion}}' *> $null
if($LASTEXITCODE -ne 0){
 $desktop=Join-Path $env:ProgramFiles 'Docker/Docker/Docker Desktop.exe'
 if(-not(Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue) -and (Test-Path -LiteralPath $desktop)){
  Start-Process -FilePath $desktop -WindowStyle Hidden
 }
 $ready=$false
 for($i=0;$i -lt 30;$i++){Start-Sleep -Seconds 2;& docker info --format '{{.ServerVersion}}' *> $null;if($LASTEXITCODE -eq 0){$ready=$true;break}}
 if(-not $ready){exit 3}
}
$db=(& docker inspect weaveops-local-postgres | ConvertFrom-Json)[0]
if($LASTEXITCODE -ne 0 -or $db.Config.Labels.'io.weaveops.local' -ne 'automatic-20261107' -or -not($db.Mounts|Where-Object {$_.Name -eq 'weaveops-local-postgres-data' -and $_.Destination -eq '/var/lib/postgresql/data'})){throw 'persistent_database_identity_mismatch'}
if(-not $db.State.Running){& docker start weaveops-local-postgres *> $null;if($LASTEXITCODE -ne 0){exit 3}}
# A dynamically published Docker port can change when the engine restarts. Only
# resolve it from the labelled container and named volume already checked above.
$db=(& docker inspect weaveops-local-postgres | ConvertFrom-Json)[0]
$ports=@($db.NetworkSettings.Ports.'5432/tcp')
if($ports.Count -ne 1 -or $ports[0].HostIp -ne '127.0.0.1' -or $ports[0].HostPort -notmatch '^[0-9]{1,5}$'){throw 'persistent_database_binding_mismatch'}
$port=[int]$ports[0].HostPort
if($port -lt 1 -or $port -gt 65535){throw 'persistent_database_binding_mismatch'}
$runtimeFile=Join-Path $RuntimeRoot 'runtime.private.json'
$runtime=Get-Content -LiteralPath $runtimeFile -Raw|ConvertFrom-Json
$uri=[uri]$runtime.databaseUrl
if($runtime.containerName -ne 'weaveops-local-postgres' -or $uri.Host -notin @('127.0.0.1','localhost') -or -not $uri.AbsolutePath.StartsWith('/zhixu_it_real_orders_preview_')){throw 'persistent_database_url_mismatch'}
if($uri.Port -ne $port){
 $builder=[UriBuilder]::new($uri);$builder.Port=$port;$runtime.databaseUrl=$builder.Uri.AbsoluteUri
 $newFile=Join-Path $RuntimeRoot 'runtime.private.new.json'
 [IO.File]::WriteAllText($newFile,($runtime|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
 [IO.File]::Move($newFile,$runtimeFile,$true)
}
$databaseReady=$false
for($i=0;$i -lt 30;$i++){
 & docker exec weaveops-local-postgres pg_isready -U postgres *> $null
 if($LASTEXITCODE -eq 0){$databaseReady=$true;break}
 Start-Sleep -Seconds 1
}
if(-not $databaseReady){exit 3}
Set-Location -LiteralPath $cfg.releaseDirectory
& $cfg.nodeExecutable --import tsx server/local-ainuoke-runtime.ts "--root=$RuntimeRoot" *>> (Join-Path $RuntimeRoot 'process.log')
exit $LASTEXITCODE
