param([Parameter(Mandatory=$true)][string]$RuntimeRoot)
$ErrorActionPreference='Stop'
$cfg=Get-Content -LiteralPath (Join-Path $RuntimeRoot 'service.private.json') -Raw|ConvertFrom-Json
if($cfg.schemaVersion -ne 1 -or $cfg.base -ne 'http://127.0.0.1:63051'){throw 'local_runtime_identity_mismatch'}
$taskName='WeaveOps Local Ainuoke Sync'
if(Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue){throw 'existing_local_task_requires_review'}
$script=Join-Path $cfg.releaseDirectory 'scripts/start-local-ainuoke.ps1'
$action=New-ScheduledTaskAction -Execute (Get-Command pwsh).Source -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -File `"$script`" -RuntimeRoot `"$RuntimeRoot`"" -WorkingDirectory $cfg.releaseDirectory
$logon=New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
$watchdog=New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 1)
$settings=New-ScheduledTaskSettingsSet -Hidden -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal=New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($logon,$watchdog) -Settings $settings -Principal $principal -Description 'Owned local617 service; due-only queue, Asia/Shanghai; loopback only.' | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output '{"state":"LOCAL_BACKGROUND_TASK_REGISTERED","task":"WeaveOps Local Ainuoke Sync"}'
