#requires -Version 7.2
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
# Explicit local read-only audit. No stored credentials, account mutation or database.
$bridgeDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) 'tools/ainuoke-bridge'
Push-Location -LiteralPath $bridgeDirectory
try {
    & python -m ainuoke_bridge.server_source --interactive-readonly-audit
    $auditExit = $LASTEXITCODE
} finally {
    Pop-Location
}
exit $auditExit
