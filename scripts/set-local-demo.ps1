[CmdletBinding(DefaultParameterSetName='Enable')]
param(
 [Parameter(Mandatory=$true)][string]$RuntimeRoot,
 [Parameter(Mandatory=$true,ParameterSetName='Enable')][switch]$Enable,
 [Parameter(Mandatory=$true,ParameterSetName='Disable')][switch]$Disable
)
$ErrorActionPreference='Stop'
$file=Join-Path ([IO.Path]::GetFullPath($RuntimeRoot)) 'service.private.json'
$cfg=Get-Content -LiteralPath $file -Raw|ConvertFrom-Json
if($cfg.schemaVersion -ne 1 -or $cfg.base -ne 'http://127.0.0.1:63051' -or
 $cfg.localDemo.username -ne 'preview.real-orders' -or $cfg.localDemo.userId -notmatch '^[a-f0-9-]{36}$'){
 throw 'configured_local_demo_identity_required'
}
# Only the entry flag changes. The running app reads it without restarting sync.
$cfg.localDemo.enabled=[bool]$Enable
$newFile=$file+'.'+[guid]::NewGuid().ToString('N')+'.new'
[IO.File]::WriteAllText($newFile,($cfg|ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
[IO.File]::Move($newFile,$file,$true)
@{state=$(if($Enable){'LOCAL_DEMO_ENABLED'}else{'LOCAL_DEMO_DISABLED'});base=$cfg.base;identity=$cfg.localDemo.username;restartRequired=$false}|ConvertTo-Json -Compress
