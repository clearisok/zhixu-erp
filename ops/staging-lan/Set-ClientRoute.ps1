#requires -Version 5.1
#requires -RunAsAdministrator
[CmdletBinding()]
param([switch]$Execute, [switch]$Rollback)
$ErrorActionPreference = 'Stop'
$destination = '192.168.66.69/32'
$gateway = '192.168.83.1'
$client = '192.168.83.51'
$adapter = Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'WLAN 2' |
    Where-Object { $_.IPAddress -eq $client -and $_.PrefixLength -eq 24 }
if (@($adapter).Count -ne 1) { throw 'Expected office adapter/IP changed; no mutation.' }
$index = $adapter.InterfaceIndex
$routes = @(Get-NetRoute -AddressFamily IPv4 -DestinationPrefix $destination -PolicyStore ActiveStore -ErrorAction SilentlyContinue)
if ($routes.Count -gt 1 -or ($routes.Count -eq 1 -and ($routes[0].NextHop -ne $gateway -or $routes[0].InterfaceIndex -ne $index))) {
    throw 'Conflicting exact route exists; no replacement or deletion.'
}
$stateDir = Join-Path $env:LOCALAPPDATA 'WeaveOps\staging-lan-163'
$receipt = Join-Path $stateDir 'client-route.json'
$action = if ($Rollback) { 'remove-owned-route' } else { 'add-temporary-route' }
[pscustomobject]@{Action=$action;Destination=$destination;Gateway=$gateway;InterfaceIndex=$index;PolicyStore='ActiveStore';Execute=[bool]$Execute} | ConvertTo-Json
if (-not $Execute) { return }
if ($Rollback) {
    if (-not (Test-Path -LiteralPath $receipt)) { throw 'Owned route receipt missing; no deletion.' }
    $saved = Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json
    if ($saved.schema -ne 'weaveops-lan-client-route.v1' -or $saved.destination -ne $destination -or $saved.gateway -ne $gateway -or $saved.interfaceIndex -ne $index -or $saved.state -ne 'created') {
        throw 'Receipt is not a matching active owned route; no deletion.'
    }
    if ($routes.Count -eq 1) {
        Remove-NetRoute -AddressFamily IPv4 -DestinationPrefix $destination -InterfaceIndex $index -NextHop $gateway -PolicyStore ActiveStore -Confirm:$false
    }
    Copy-Item -LiteralPath $receipt -Destination ($receipt + '.' + (Get-Date -Format 'yyyyMMddTHHmmssfff') + '.history')
    $saved.state = 'rolled_back'
    $saved | ConvertTo-Json | Set-Content -LiteralPath $receipt -Encoding UTF8
    Write-Output 'ROLLBACK_PASS: only the matching owned temporary route removed.'
    return
}
if ($routes.Count -eq 1) { Write-Output 'ALREADY_PRESENT: no mutation and no ownership claimed.'; return }
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
if (Test-Path -LiteralPath $receipt) {
    $prior = Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json
    if ($prior.schema -ne 'weaveops-lan-client-route.v1' -or $prior.destination -ne $destination -or $prior.gateway -ne $gateway) {
        throw 'Unknown receipt exists; no overwrite or route mutation.'
    }
    Copy-Item -LiteralPath $receipt -Destination ($receipt + '.' + (Get-Date -Format 'yyyyMMddTHHmmssfff') + '.history')
}
New-NetRoute -AddressFamily IPv4 -DestinationPrefix $destination -InterfaceIndex $index -NextHop $gateway -RouteMetric 1 -PolicyStore ActiveStore | Out-Null
$saved = [ordered]@{schema='weaveops-lan-client-route.v1';destination=$destination;gateway=$gateway;interfaceIndex=$index;client=$client;state='created';createdAt=(Get-Date).ToString('o')}
try { $saved | ConvertTo-Json | Set-Content -LiteralPath $receipt -Encoding UTF8 }
catch {
    Remove-NetRoute -AddressFamily IPv4 -DestinationPrefix $destination -InterfaceIndex $index -NextHop $gateway -PolicyStore ActiveStore -Confirm:$false
    throw
}
Find-NetRoute -RemoteIPAddress '192.168.66.69' | Select-Object InterfaceAlias,IPAddress,DestinationPrefix,NextHop
Write-Output ('ROUTE_ADDED: active memory only; receipt=' + $receipt)
