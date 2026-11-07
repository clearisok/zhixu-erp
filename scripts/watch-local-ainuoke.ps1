param([Parameter(Mandatory=$true)][string]$RuntimeRoot)
$ErrorActionPreference='Stop'
$lock=$null
try{$lock=[IO.File]::Open((Join-Path $RuntimeRoot 'watchdog.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}catch{exit 0}
try{
 @{pid=$PID;startedAt=(Get-Date).ToUniversalTime().ToString('o');mode='current-user-hidden-watchdog'}|ConvertTo-Json -Compress|Set-Content -LiteralPath (Join-Path $RuntimeRoot 'watchdog-status.json') -Encoding utf8
 $failures=0
 while($true){
  $cfg=Get-Content -LiteralPath (Join-Path $RuntimeRoot 'service.private.json') -Raw|ConvertFrom-Json
  if(-not $cfg.enabled){exit 0}
  & (Join-Path $cfg.releaseDirectory 'scripts/start-local-ainuoke.ps1') -RuntimeRoot $RuntimeRoot
  $code=$LASTEXITCODE
  if($code -eq 0){exit 0}
  # Database/Desktop not ready is a local startup wait, never a login retry.
  if($code -eq 3){Start-Sleep -Seconds 60;continue}
  if($code -eq 75){Start-Sleep -Seconds 2;continue}
  $failures++
  @{at=(Get-Date).ToUniversalTime().ToString('o');event='local_runtime_restart';exitCode=$code;attempt=$failures}|ConvertTo-Json -Compress|Add-Content -LiteralPath (Join-Path $RuntimeRoot 'watchdog-events.jsonl') -Encoding utf8
  if($failures -ge 3){exit 1}
  Start-Sleep -Seconds ([Math]::Min(60,15*$failures))
 }
}finally{if($lock){$lock.Dispose()}}
