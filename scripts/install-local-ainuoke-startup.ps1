param([Parameter(Mandatory=$true)][string]$RuntimeRoot)
$ErrorActionPreference='Stop'
$cfg=Get-Content -LiteralPath (Join-Path $RuntimeRoot 'service.private.json') -Raw|ConvertFrom-Json
if($cfg.schemaVersion -ne 1 -or $cfg.base -ne 'http://127.0.0.1:63051'){throw 'local_runtime_identity_mismatch'}
$key='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$name='WeaveOpsLocalAinuoke'
if(Get-ItemProperty -LiteralPath $key -Name $name -ErrorAction SilentlyContinue){throw 'existing_startup_requires_review'}
$pwsh=(Get-Command pwsh).Source
$watch=Join-Path $cfg.releaseDirectory 'scripts/watch-local-ainuoke.ps1'
$command='"'+$pwsh+'" -NoProfile -NonInteractive -WindowStyle Hidden -File "'+$watch+'" -RuntimeRoot "'+$RuntimeRoot+'"'
$vbs=Join-Path $RuntimeRoot 'start-hidden.vbs'
('Set shell = CreateObject("WScript.Shell")'+[Environment]::NewLine+'shell.Run "'+$command.Replace('"','""')+'", 0, False')|Set-Content -LiteralPath $vbs -Encoding ascii
New-ItemProperty -LiteralPath $key -Name $name -PropertyType String -Value ('wscript.exe //B //Nologo "'+$vbs+'"')|Out-Null
# WMI owns this background process, so closing Codex cannot terminate its job.
$start=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine=$command;CurrentDirectory=$cfg.releaseDirectory}
if($start.ReturnValue -ne 0){throw 'background_process_start_failed'}
@{state='CURRENT_USER_BACKGROUND_INSTALLED';watchdogPid=$start.ProcessId;startup=$name}|ConvertTo-Json -Compress
