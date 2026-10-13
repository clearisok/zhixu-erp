#requires -Version 7.2
[CmdletBinding()]
param(
    [string]$CredentialFile,
    [string]$RequestFile,
    [switch]$ValidateOnly,
    [string]$PrivateDirectory,
    [string]$PrivateFile
)
$ErrorActionPreference = 'Stop'
$failureCode = 'private_preflight_unavailable'
$failureStage = 'runtime_validation'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
function Assert-PrivateAcl([string]$Path, [bool]$Directory, [bool]$RequireWrite) {
    $item = Get-Item -LiteralPath $Path -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.PSIsContainer -ne $Directory) { throw 'private_path_invalid' }
    $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $acl = Get-Acl -LiteralPath $Path
    if ($Directory -and -not $acl.AreAccessRulesProtected) { throw 'private_acl_invalid' }
    $rules = @($acl.Access)
    if ($rules.Count -eq 0 -or $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $owner) { throw 'private_acl_invalid' }
    $operatorRights = [Security.AccessControl.FileSystemRights]0
    foreach ($rule in $rules) {
        $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        if ($rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or $sid -notin @($owner, 'S-1-5-18')) { throw 'private_acl_invalid' }
        if ($sid -eq $owner) { $operatorRights = $operatorRights -bor $rule.FileSystemRights }
    }
    if (-not ($operatorRights -band [Security.AccessControl.FileSystemRights]::Read) -or
        ($RequireWrite -and -not ($operatorRights -band [Security.AccessControl.FileSystemRights]::Write))) { throw 'private_acl_invalid' }
}
try {
    if (-not $IsWindows) { throw 'windows_private_terminal_required' }
    if ($ValidateOnly) {
        if ($CredentialFile -or -not $PrivateDirectory) { throw 'private_validation_invalid' }
        Assert-PrivateAcl $PrivateDirectory $true $true
        if ($PrivateFile) { Assert-PrivateAcl $PrivateFile $false $true }
        exit 0
    }
    if ($PrivateDirectory -or $PrivateFile -or -not $RequestFile) { throw 'operator_arguments_invalid' }
    Assert-PrivateAcl $RequestFile $false $false
    # Every execution starts from committed, clean code; generated outputs are Git ignored.
    $dirty = & git -C $repositoryRoot status --porcelain --untracked-files=normal
    if ($LASTEXITCODE -ne 0 -or $dirty) { throw 'committed_clean_worktree_required' }
    $nodeExecutable = (Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $version = & $nodeExecutable --version
    $runtimeMatch = [regex]::Match($version, '^v([0-9]+\.[0-9]+\.[0-9]+)$')
    if ($LASTEXITCODE -ne 0 -or -not $runtimeMatch.Success -or [version]$runtimeMatch.Groups[1].Value -lt [version]'22.13.0') { throw 'node_runtime_required' }
    if (-not (Test-Path -LiteralPath (Join-Path $repositoryRoot 'node_modules/tsx') -PathType Container)) { throw 'locked_dependencies_required' }
    $failureStage = 'private_directory_setup'
    $outputParent = Join-Path $repositoryRoot 'outputs'
    if (-not (Test-Path -LiteralPath $outputParent)) { [IO.Directory]::CreateDirectory($outputParent) | Out-Null }
    if ((Get-Item -LiteralPath $outputParent).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'private_path_invalid' }
    $directory = Join-Path $outputParent ('ainuoke-live-private-' + [guid]::NewGuid().ToString())
    [IO.Directory]::CreateDirectory($directory) | Out-Null
    # New empty directory only; no Set-Acl/SACL privilege request, no modification of an existing credential file.
    $ownerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls $directory /inheritance:r /grant:r ('*' + $ownerSid + ':(OI)(CI)F') '*S-1-5-18:(OI)(CI)F' 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'private_acl_setup_failed' }
    Assert-PrivateAcl $directory $true $true
    $failureCode = 'private_credential_input_invalid'
    $failureStage = if ($CredentialFile) { 'credential_file_validation' } else { 'private_terminal_input' }
    if ($CredentialFile) {
        # User explicitly chooses this private terminal path. Contents never enter Codex/tool output.
        $resolvedFile = (Resolve-Path -LiteralPath $CredentialFile).Path
        Assert-PrivateAcl $resolvedFile $false $false
        if ((Get-Item -LiteralPath $resolvedFile).Length -gt 8192) { throw 'credential_file_limit' }
        $raw = [Text.UTF8Encoding]::new($false, $true).GetString([IO.File]::ReadAllBytes($resolvedFile)).TrimStart([char]0xFEFF)
        $match = [regex]::Match($raw, '\A账号[:：]([^\r\n]+)\r?\n密码[:：]([^\r\n]+)(?:\r?\n)?\z')
        if (-not $match.Success) { throw 'credential_file_format' }
        $username = $match.Groups[1].Value.Trim()
        $password = $match.Groups[2].Value
        $raw = $null; $match = $null
    } else {
        if ([Console]::IsInputRedirected) { throw 'private_terminal_required' }
        $username = Read-Host 'Ainuoke username'
        $securePassword = Read-Host 'Ainuoke password (hidden, not saved)' -AsSecureString
        $password = ConvertFrom-SecureString -SecureString $securePassword -AsPlainText
    }
    $configuration = @{ sourceKey = 'ningbo-first-team'; baseUrl = 'http://61.164.81.194:9043';
        transportPolicy = 'user-approved-http-d109'; username = $username; password = $password;
        operatorUsername = 'readonly-preflight-not-authorized-for-db' } | ConvertTo-Json -Compress
    $failureCode = 'readonly_worker_start_failed'
    $failureStage = 'worker_start'
    $start = [Diagnostics.ProcessStartInfo]::new($nodeExecutable)
    $start.WorkingDirectory = $repositoryRoot
    $start.UseShellExecute = $false; $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true; $start.RedirectStandardOutput = $true; $start.RedirectStandardError = $true
    $start.StandardInputEncoding = [Text.UTF8Encoding]::new($false)
    $start.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
    foreach ($argument in @('--import','tsx','server/ainuoke-source/quality-diagnostic.ts','--run-read-only','--stdin-config',('--private-output=' + $directory),('--private-request=' + $RequestFile))) {
        $start.ArgumentList.Add($argument)
    }
    $process = [Diagnostics.Process]::Start($start)
    $stdout = $process.StandardOutput.ReadToEndAsync(); $stderr = $process.StandardError.ReadToEndAsync()
    $failureStage = 'worker_stdin'
    $process.StandardInput.Write($configuration); $process.StandardInput.Close()
    $configuration = $null; $password = $null; $securePassword = $null
    $failureCode = 'readonly_worker_timeout'
    $failureStage = 'worker_wait'
    if (-not $process.WaitForExit(690000)) { $process.Kill($true); throw 'readonly_worker_timeout' }
    $failureCode = 'readonly_worker_receipt_invalid'
    $failureStage = 'worker_receipt_validation'
    $receipt = $stdout.GetAwaiter().GetResult() | ConvertFrom-Json
    # Only the Node allowlisted receipt is forwarded; stderr/exception/credential contents are never reflected.
    if ($receipt.schemaVersion -ne 'ainuoke-quality-diagnostic.v1' -or $receipt.databaseAccess -ne 'none' -or $receipt.sourceActivation -ne 'not-activated') { throw 'readonly_receipt_invalid' }
    $receipt | ConvertTo-Json -Depth 20 -Compress
    exit $process.ExitCode
} catch {
    if ($ValidateOnly) { exit 1 }
    @{ schemaVersion = 'ainuoke-quality-diagnostic.v1'; result = 'FAIL'; code = $failureCode; stage = $failureStage; databaseAccess = 'none'; sourceActivation = 'not-activated' } | ConvertTo-Json -Compress
    exit 1
} finally {
    $configuration = $null; $password = $null; $securePassword = $null; $raw = $null
    if ($process -and -not $process.HasExited) { $process.Kill($true) }
    if ($process) { $process.Dispose() }
}
