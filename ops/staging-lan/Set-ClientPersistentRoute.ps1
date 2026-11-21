#requires -Version 5.1
#requires -RunAsAdministrator
[CmdletBinding()]
param([switch]$Execute, [switch]$Rollback)
$ErrorActionPreference = 'Stop'
$destination = '192.168.66.69/32'
$gateway = '192.168.83.1'
$adapter = @(Get-NetIPAddress -InterfaceAlias 'WLAN 2' -AddressFamily IPv4 | Where-Object { $_.IPAddress -eq '192.168.83.51' -and $_.PrefixLength -eq 24 })
if ($adapter.Count -ne 1) { throw 'Expected office adapter/address changed.' }
$index = $adapter[0].InterfaceIndex
$stateDir = Join-Path $env:LOCALAPPDATA 'WeaveOps/staging-lan-163'
$receipt = Join-Path $stateDir 'persistent-route.json'
$temporaryReceipt = Join-Path $stateDir 'client-route.json'
function Read-Routes($store) { @(Get-NetRoute -AddressFamily IPv4 -DestinationPrefix $destination -PolicyStore $store -ErrorAction SilentlyContinue) }
function Assert-Matches($routes) {
    if ($routes.Count -gt 1 -or @($routes | Where-Object { $_.NextHop -ne $gateway -or $_.InterfaceIndex -ne $index -or $_.RouteMetric -ne 1 }).Count) { throw 'Conflicting exact route; no mutation.' }
}
$active = @(Read-Routes 'ActiveStore')
$persistent = @(Read-Routes 'PersistentStore')
Assert-Matches $active
Assert-Matches $persistent
$saved = if (Test-Path -LiteralPath $receipt) { Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json } else { $null }
if ($saved -and ($saved.schema -ne 'weaveops-lan-persistent-route.v1' -or $saved.destination -ne $destination -or $saved.gateway -ne $gateway -or $saved.interfaceIndex -ne $index)) { throw 'Unknown receipt; no mutation.' }
[pscustomobject]@{Execute=[bool]$Execute;Rollback=[bool]$Rollback;Destination=$destination;InterfaceIndex=$index;ActiveCount=$active.Count;PersistentCount=$persistent.Count} | ConvertTo-Json
if (-not $Execute) { return }
if ($Rollback) {
    if (-not $saved -or $saved.state -ne 'created' -or $persistent.Count -ne 1) { throw 'Matching active ownership receipt required.' }
    Remove-NetRoute -AddressFamily IPv4 -DestinationPrefix $destination -InterfaceIndex $index -NextHop $gateway -PolicyStore PersistentStore -Confirm:$false
    if (@(Read-Routes 'PersistentStore').Count) { throw 'Persistent route removal not verified.' }
    if (-not @(Read-Routes 'ActiveStore').Count) { New-NetRoute -AddressFamily IPv4 -DestinationPrefix $destination -InterfaceIndex $index -NextHop $gateway -RouteMetric 1 -PolicyStore ActiveStore | Out-Null }
    $saved.state = 'rolled_back'
    $saved | ConvertTo-Json | Set-Content -LiteralPath $receipt -Encoding UTF8
    Write-Output 'PERSISTENT_ROLLBACK_VERIFIED: prior temporary office route retained.'
    return
}
if ($persistent.Count -eq 1) {
    if (-not $saved -or $saved.state -ne 'created') { throw 'Existing persistent route is not owned.' }
    Write-Output 'PERSISTENT_ALREADY_VERIFIED: no mutation.'
    return
}
if ($saved -and $saved.state -ne 'rolled_back') { throw 'Unexpected receipt state; inspect before retry.' }
if ($active.Count -eq 1) {
    $temporary = Get-Content -LiteralPath $temporaryReceipt -Raw | ConvertFrom-Json
    if ($temporary.schema -ne 'weaveops-lan-client-route.v1' -or $temporary.state -ne 'created' -or $temporary.destination -ne $destination -or $temporary.gateway -ne $gateway -or $temporary.interfaceIndex -ne $index) { throw 'Active route is not the earlier owned temporary route.' }
}
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
if ($saved) { Copy-Item -LiteralPath $receipt -Destination ($receipt + '.' + (Get-Date -Format 'yyyyMMddTHHmmssfff') + '.history') }
$removed = $false
try {
    if ($active.Count -eq 1) {
        Remove-NetRoute -AddressFamily IPv4 -DestinationPrefix $destination -InterfaceIndex $index -NextHop $gateway -PolicyStore ActiveStore -Confirm:$false
        $removed = $true
    }
    # Microsoft documents the default as both stores; PersistentStore is not a
    # supported New-NetRoute creation value. Do not specify PolicyStore here.
    New-NetRoute -AddressFamily IPv4 -DestinationPrefix $destination -InterfaceIndex $index -NextHop $gateway -RouteMetric 1 | Out-Null
    $newActive = @(Read-Routes 'ActiveStore'); $newPersistent = @(Read-Routes 'PersistentStore')
    Assert-Matches $newActive; Assert-Matches $newPersistent
    if ($newActive.Count -ne 1 -or $newPersistent.Count -ne 1) { throw 'Both stores not verified.' }
    [ordered]@{schema='weaveops-lan-persistent-route.v1';state='created';destination=$destination;gateway=$gateway;interfaceIndex=$index;createdAt=(Get-Date).ToString('o');rebootTested=$false} | ConvertTo-Json | Set-Content -LiteralPath $receipt -Encoding UTF8
} catch {
    # Only recover this exact route, never reset networking or alter other paths.
    if ($removed -and -not @(Read-Routes 'ActiveStore').Count) { New-NetRoute -AddressFamily IPv4 -DestinationPrefix $destination -InterfaceIndex $index -NextHop $gateway -RouteMetric 1 -PolicyStore ActiveStore | Out-Null }
    throw
}
Write-Output 'PERSISTENT_ROUTE_VERIFIED: exact route in ActiveStore and PersistentStore; reboot not tested.'
