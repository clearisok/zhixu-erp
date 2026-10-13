#requires -Version 7.2
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
# D109: explicit local command; only the approved origin and fixed read-only probe.
# Credentials are typed privately into Python getpass, never argv/env/files/PowerShell history.
$bridgeDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) 'tools/ainuoke-bridge'
Push-Location -LiteralPath $bridgeDirectory
try {
    & python -m ainuoke_bridge.server_source --interactive-approved-http
    $probeExit = $LASTEXITCODE
} finally {
    Pop-Location
}
exit $probeExit
