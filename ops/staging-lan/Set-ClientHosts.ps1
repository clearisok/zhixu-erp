#requires -Version 5.1
[CmdletBinding()]
param([switch]$Execute, [switch]$Rollback)
$ErrorActionPreference = 'Stop'
$hostsPath = Join-Path $env:SystemRoot 'System32/drivers/etc/hosts'
$domain = 'staging.weaveops.top'
$ownedLine = '192.168.66.69 staging.weaveops.top # weaveops-staging-lan-163'
$stateDir = Join-Path $env:LOCALAPPDATA 'WeaveOps/staging-lan-163'
$receiptPath = Join-Path $stateDir 'client-hosts.json'
$before = [IO.File]::ReadAllBytes($hostsPath)
if ($before -contains 0) { throw 'Unsupported hosts encoding; no mutation.' }
$utf8 = New-Object Text.UTF8Encoding($false, $true)
$text = $utf8.GetString($before)
$lines = [regex]::Split($text, '\r?\n')
$mappings = @($lines | Where-Object {
    $fields = [regex]::Split(($_ -split '#', 2)[0].Trim(), '\s+')
    $fields.Count -gt 1 -and $fields[1..($fields.Count - 1)] -icontains $domain
})
$ownedCount = @($lines | Where-Object { $_ -ceq $ownedLine }).Count
if ($mappings.Count -gt 1 -or ($mappings.Count -eq 1 -and ([regex]::Split($mappings[0].Trim(), '\s+'))[0] -ne '192.168.66.69')) {
    throw 'Conflicting domain mapping; preserve existing hosts.'
}
$saved = $null
if (Test-Path -LiteralPath $receiptPath) {
    $saved = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
    if ($saved.schema -ne 'weaveops-lan-client-hosts.v1' -or $saved.line -cne $ownedLine -or $saved.path -ne $hostsPath) {
        throw 'Unknown hosts receipt; no mutation.'
    }
}
if ($Rollback) {
    if (-not $saved -or $saved.state -ne 'created' -or $ownedCount -ne 1) {
        throw 'Matching active owned line/receipt required; no removal.'
    }
    $pattern = '(?m)^' + [regex]::Escape($ownedLine) + '(\r?\n|$)'
    $after = $utf8.GetBytes([regex]::Replace($text, $pattern, ''))
} else {
    if ($mappings.Count -eq 1) {
        Write-Output 'ALREADY_MAPPED: no mutation or new ownership claimed.'
        return
    }
    if ($ownedCount -ne 0 -or ($saved -and $saved.state -ne 'rolled_back')) {
        throw 'Unexpected prior state; inspect receipt before proceeding.'
    }
    $separator = if ($before.Length -eq 0 -or $before[-1] -eq 10) { '' } else { "`r`n" }
    [byte[]]$after = $before + $utf8.GetBytes($separator + $ownedLine + "`r`n")
}
[pscustomobject]@{Action=$(if ($Rollback) {'remove-owned-hosts-line'} else {'add-single-hosts-line'});Domain=$domain;Address='192.168.66.69';Execute=[bool]$Execute} | ConvertTo-Json
if (-not $Execute) { return }
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Use an elevated PowerShell for -Execute; no mutation.'
}
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
$stamp = (Get-Date -Format 'yyyyMMddTHHmmssfff') + '-' + [guid]::NewGuid().ToString('N')
$backup = Join-Path $stateDir ('hosts-before-' + $stamp + '.bak')
[IO.File]::WriteAllBytes($backup, $before)
if ($saved) { Copy-Item -LiteralPath $receiptPath -Destination ($receiptPath + '.' + $stamp + '.history') }
$stream = [IO.File]::Open($hostsPath, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::Read)
try {
    $actual = New-Object byte[] $stream.Length
    $read = $stream.Read($actual, 0, $actual.Length)
    if ($read -ne $before.Length -or [Convert]::ToBase64String($actual) -cne [Convert]::ToBase64String($before)) {
        throw 'Concurrent hosts change; no mutation.'
    }
    try {
        $stream.Position = 0
        $stream.Write($after, 0, $after.Length)
        $stream.SetLength($after.Length)
        $stream.Flush()
        [ordered]@{schema='weaveops-lan-client-hosts.v1';path=$hostsPath;line=$ownedLine;state=$(if ($Rollback) {'rolled_back'} else {'created'});backup=$backup;at=(Get-Date).ToString('o')} |
            ConvertTo-Json | Set-Content -LiteralPath $receiptPath -Encoding UTF8
    } catch {
        $stream.Position = 0
        $stream.Write($before, 0, $before.Length)
        $stream.SetLength($before.Length)
        $stream.Flush()
        throw
    }
} finally { $stream.Dispose() }
Clear-DnsClientCache
Write-Output ('HOSTS_VERIFIED: exact owned line changed; backup=' + $backup)
