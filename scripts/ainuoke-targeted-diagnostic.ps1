#requires -Version 7.2
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
# Explicit local read-only diagnostic. The ignored scope file contains no credentials.
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$bridgeDirectory = Join-Path $repositoryRoot 'tools/ainuoke-bridge'
$privateDirectory = Join-Path $repositoryRoot 'outputs'
if (-not (Test-Path -LiteralPath $privateDirectory -PathType Container)) { throw 'Private scope directory missing.' }
if ((Get-Item -LiteralPath $privateDirectory).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Private scope directory cannot be a link.' }
# On Windows, mode 0600 alone is not an NTFS ACL. Restrict the ignored output
# directory before the short-lived worker creates its report.
$owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
$system = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
$privateAcl = Get-Acl -LiteralPath $privateDirectory
$privateAcl.SetAccessRuleProtection($true, $false)
$privateAcl.SetOwner($owner)
foreach ($principal in @($owner, $system)) {
    $rule = [Security.AccessControl.FileSystemAccessRule]::new($principal, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $privateAcl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $privateDirectory -AclObject $privateAcl
foreach ($fileName in @('ainuoke-targeted-request.json', 'ainuoke-targeted-review.md')) {
    $privateFile = Join-Path $privateDirectory $fileName
    if (-not (Test-Path -LiteralPath $privateFile -PathType Leaf) -or
        ((Get-Item -LiteralPath $privateFile).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Private scope file missing or linked.' }
    $fileAcl = Get-Acl -LiteralPath $privateFile
    $fileAcl.SetAccessRuleProtection($true, $false)
    $fileAcl.SetOwner($owner)
    foreach ($principal in @($owner, $system)) {
        $fileAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($principal, 'FullControl', 'Allow'))
    }
    Set-Acl -LiteralPath $privateFile -AclObject $fileAcl
}
Push-Location -LiteralPath $bridgeDirectory
try {
    & python -m ainuoke_bridge.server_source --interactive-targeted-diagnostic
    $diagnosticExit = $LASTEXITCODE
} finally {
    Pop-Location
}
exit $diagnosticExit
