#requires -Version 7.2
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{40}$')][string]$ExpectedHead,
    [string]$Proxy = 'http://127.0.0.1:7888',
    [switch]$Execute
)
$ErrorActionPreference = 'Stop'
$uri = [uri]$Proxy
if (-not $uri.IsAbsoluteUri -or -not $uri.IsLoopback -or $uri.Scheme -ne 'http' -or $uri.UserInfo -or $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment) {
    throw 'Only an uncredentialed loopback HTTP proxy is accepted.'
}
$count = 0
if ($env:GIT_CONFIG_COUNT -and (-not [int]::TryParse($env:GIT_CONFIG_COUNT,[ref]$count) -or $count -lt 0 -or $count -gt 32)) { throw 'Unexpected process Git configuration count.' }
$key = 'GIT_CONFIG_KEY_' + $count
$value = 'GIT_CONFIG_VALUE_' + $count
$names = @('GIT_CONFIG_COUNT',$key,$value,'HTTPS_PROXY')
$before = @{}
foreach ($name in $names) { $before[$name] = [Environment]::GetEnvironmentVariable($name,'Process') }
$worktree = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
try {
    [Environment]::SetEnvironmentVariable($key,'http.https://github.com.proxy','Process')
    [Environment]::SetEnvironmentVariable($value,$Proxy,'Process')
    [Environment]::SetEnvironmentVariable('GIT_CONFIG_COUNT',($count+1).ToString(),'Process')
    [Environment]::SetEnvironmentVariable('HTTPS_PROXY',$Proxy,'Process')
    # This is only a process-scoped wrapper, never an alternate push strategy.
    # All branch/dirty/ancestry/single-push/independent-SHA checks stay authoritative.
    & (Join-Path $worktree 'scripts/git-delivery.ps1') -Worktree $worktree -Branch 'feat/staging-lan-direct' -ExpectedHead $ExpectedHead -Execute:$Execute
    $resultCode = $LASTEXITCODE
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name,$before[$name],'Process') }
}
exit $resultCode
