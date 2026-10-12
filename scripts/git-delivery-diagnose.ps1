#requires -Version 7.2
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Worktree)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$stage = 'runtime_location'
try {
    $node = (Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $stage = 'diagnostic_execution'
    $result = & $node (Join-Path $PSScriptRoot 'git-delivery.mjs') --diagnose --worktree $Worktree
    if ($LASTEXITCODE -ne 0) { throw 'diagnostic_failed' }
    $stage = 'summary_serialization'
    $summary = $result | ConvertFrom-Json
    $summary | Add-Member -NotePropertyName powerShellVersion -NotePropertyValue $PSVersionTable.PSVersion.ToString()
    $summary | Add-Member -NotePropertyName powerShellExecutable -NotePropertyValue (Join-Path $PSHOME 'pwsh.exe')
    $summary | ConvertTo-Json -Depth 8 -Compress
} catch {
    @{ state = 'STOP_DIAGNOSTIC_UNAVAILABLE'; stage = $stage; errorType = $_.Exception.GetType().Name } | ConvertTo-Json -Compress
    exit 1
}
