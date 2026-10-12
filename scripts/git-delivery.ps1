#requires -Version 7.2
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Worktree,
    [Parameter(Mandatory)][string]$Branch,
    [Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{40}$')][string]$ExpectedHead,
    [ValidatePattern('^[0-9a-f]{64}$')][string]$ExpectedDirtyFingerprint,
    [switch]$Execute,
    [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
# Nonzero native exit is handled explicitly, without printing raw Git output.
$PSNativeCommandUseErrorActionPreference = $false
if ($Execute -and $DryRun) {
    Write-Output '{"state":"STOP_CONFLICTING_ACTIONS"}'
    exit 1
}
try {
    $node = (Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $arguments = @((Join-Path $PSScriptRoot 'git-delivery.mjs'), '--worktree', $Worktree, '--branch', $Branch, '--expected-head', $ExpectedHead)
    if ($ExpectedDirtyFingerprint) { $arguments += @('--expected-dirty-fingerprint', $ExpectedDirtyFingerprint) }
    if ($Execute) { $arguments += '--execute' }
    & $node @arguments
    exit $LASTEXITCODE
} catch {
    Write-Output '{"state":"STOP_TOOL_RUNTIME_UNAVAILABLE"}'
    exit 1
}
