#requires -Version 7.2
# Read metadata only. Never change an existing file's ACL or read its contents.
param([Parameter(Mandatory)][string]$Path)
$ErrorActionPreference = 'Stop'
try {
    if (-not $IsWindows -or -not [IO.Path]::IsPathFullyQualified($Path)) { throw 'private_file_invalid' }
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.PSIsContainer) { throw 'private_file_invalid' }
    $cursor = $item
    while ($null -ne $cursor) {
        if ($cursor.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'private_file_invalid' }
        $cursor = if ($cursor -is [IO.FileInfo]) { $cursor.Directory } else { $cursor.Parent }
    }
    $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $acl = Get-Acl -LiteralPath $item.FullName
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $owner -or @($acl.Access).Count -eq 0) { throw 'private_file_invalid' }
    $readable = $false
    foreach ($rule in $acl.Access) {
        $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        if ($rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or $sid -notin @($owner,'S-1-5-18')) { throw 'private_file_invalid' }
        if ($sid -eq $owner -and ($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::Read)) { $readable = $true }
    }
    if (-not $readable) { throw 'private_file_invalid' }
    exit 0
} catch { exit 1 }
