# Creates private inputs only. No containers, databases, trust-store or existing files changed.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Root,
    [Parameter(Mandatory)][string]$Project,
    [Parameter(Mandatory)][int]$Port,
    [Parameter(Mandatory)][string]$Image,
    [Parameter(Mandatory)][string]$Commit,
    [Parameter(Mandatory)][string]$BuildId,
    [Parameter(Mandatory)][string]$BuildTime,
    [switch]$Execute
)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'windows_private_acl_required' }
if (-not [IO.Path]::IsPathFullyQualified($Root) -or $Project -notmatch '^zhixu-quote-trial-[a-z0-9-]{3,40}$' -or
    $Port -lt 1024 -or $Port -gt 65535 -or $Port -in @(3000, 3001, 3002, 50426) -or $Commit -cnotmatch '^[0-9a-f]{40}$') { throw 'explicit_new_target_required' }
foreach ($value in @($Root, $Image, $BuildId, $BuildTime)) { if ($value -match '[\r\n]' -or -not $value) { throw 'single_line_inputs_required' } }
if (Test-Path -LiteralPath $Root) { throw 'new_private_directory_required' }
if (-not $Execute) { [ordered]@{ operation = 'PREPARE_ONLY'; project = $Project; port = $Port; writes = 0 } | ConvertTo-Json -Compress; return }
. (Join-Path $PSScriptRoot 'local-target-inputs.ps1')
New-LocalTargetInputs -Root $Root -Project $Project -Port $Port -Image $Image -Commit $Commit -BuildId $BuildId -BuildTime $BuildTime | ConvertTo-Json -Compress
