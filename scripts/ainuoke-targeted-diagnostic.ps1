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
# On Windows, mode 0600 alone is not an NTFS ACL. A normal operator shell may
# read ACLs but cannot change protected ACLs; fail closed if the local private
# scope is not already restricted. New reports inherit this directory ACL.
$owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
$system = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
function Assert-PrivateAcl([string]$path) {
    $acl = Get-Acl -LiteralPath $path
    $rules = @($acl.Access)
    if (-not $acl.AreAccessRulesProtected -or $rules.Count -eq 0) { throw 'Private ACL is not protected.' }
    $hasOwnerAccess = $false
    foreach ($rule in $rules) {
        $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        if ($rule.IsInherited -or $rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
            $sid -notin @($owner.Value, $system.Value)) { throw 'Private ACL includes an unexpected access rule.' }
        if ($sid -eq $owner.Value -and ($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::Read) -and
            ($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::Write)) { $hasOwnerAccess = $true }
    }
    if (-not $hasOwnerAccess) { throw 'Private ACL does not grant operator read/write access.' }
}
Assert-PrivateAcl $privateDirectory
foreach ($fileName in @('ainuoke-targeted-request.json', 'ainuoke-targeted-review.md')) {
    $privateFile = Join-Path $privateDirectory $fileName
    if (-not (Test-Path -LiteralPath $privateFile -PathType Leaf) -or
        ((Get-Item -LiteralPath $privateFile).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Private scope file missing or linked.' }
    Assert-PrivateAcl $privateFile
}
Push-Location -LiteralPath $bridgeDirectory
try {
    & python -m ainuoke_bridge.server_source --interactive-targeted-diagnostic
    $diagnosticExit = $LASTEXITCODE
} finally {
    Pop-Location
}
exit $diagnosticExit
