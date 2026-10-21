#requires -Version 7.2
[CmdletBinding()]
param([switch]$VerifyFilter, [string]$CandidateFile, [string]$CredentialFile, [switch]$Help)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$process=$null; $stage='arguments'; $code='garment_filter_explicit_scope_required'; $started=$false
try {
    if ($Help) { Write-Output 'Fixed frozen D1933 C1 / zero-control / C1. -VerifyFilter -CandidateFile -CredentialFile. <=1 login +3 reports,100 rows; each report4MiB,total reports12MiB,login4MiB,180s, no retry/DB/activation. New real-read authorization required.'; exit 0 }
    if (-not $IsWindows -or -not $VerifyFilter -or -not $CandidateFile -or -not $CredentialFile) { throw 'scope_required' }
    $root=(Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
    $stage='private_output'; $code='garment_filter_private_launcher_failed'
    if ((Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'private_path_invalid' }
    $parent=Join-Path $root 'outputs'
    if (-not (Test-Path -LiteralPath $parent)) { [IO.Directory]::CreateDirectory($parent) | Out-Null }
    if ((Get-Item -LiteralPath $parent).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'private_path_invalid' }
    $directory=Join-Path $parent ('ainuoke-garment-filter-private-'+[guid]::NewGuid().ToString())
    [IO.Directory]::CreateDirectory($directory) | Out-Null
    $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls $directory /inheritance:r /grant:r ('*'+$sid+':(OI)(CI)F') '*S-1-5-18:(OI)(CI)F' 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'private_acl_failed' }
    & pwsh -NoProfile -NonInteractive -File (Join-Path $PSScriptRoot 'ainuoke-live-preflight.ps1') -ValidateOnly -PrivateDirectory $directory 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'private_acl_failed' }
    $node=(Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $start=[Diagnostics.ProcessStartInfo]::new($node)
    $start.WorkingDirectory=$root; $start.UseShellExecute=$false; $start.CreateNoWindow=$true
    $start.RedirectStandardOutput=$true; $start.RedirectStandardError=$true
    $start.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
    foreach ($argument in @('--import','tsx','server/ainuoke-source/garment-contract-verification.ts','--verify-d1933-contract-filter',
        ('--candidate-file='+[IO.Path]::GetFullPath($CandidateFile)),('--credential-file='+[IO.Path]::GetFullPath($CredentialFile)),('--private-output='+$directory))) { $start.ArgumentList.Add($argument) }
    $stage='worker'; $code='garment_filter_private_launcher_failed'
    $process=[Diagnostics.Process]::Start($start); $started=$true
    $stdout=$process.StandardOutput.ReadToEndAsync(); $stderr=$process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit(180000)) { $process.Kill($true); $code='garment_filter_timeout'; throw 'worker_timeout' }
    $text=$stdout.GetAwaiter().GetResult()
    if ($text.Length -gt 65536) { throw 'receipt_limit' }
    $receipt=$text | ConvertFrom-Json
    $allowed=@('schemaVersion','result','reportId','databaseAccess','sourceActivation','businessSnapshotPublication','code','sourceFingerprint','candidateSha256',
        'queryManifestSha256','httpAttempts','reportRequests','retainedPages','retainedBytes','positiveRows','contractAlias','controlAlias','proofScope',
        'universalFilterSemanticsVerified','pageHashes','toolingCommit','evidenceRetained','privateReportPath','privateReportSha256','stage','requestCounts')
    if ($receipt.schemaVersion -ne 'ainuoke-garment-filter-verification.v1' -or $receipt.result -notin @('FAIL','SCOPED_FILTER_OBSERVED') -or
        $receipt.databaseAccess -ne 'none' -or $receipt.sourceActivation -ne 'not-activated' -or $receipt.businessSnapshotPublication -ne 'not-performed' -or
        @($receipt.PSObject.Properties.Name | Where-Object { $_ -notin $allowed }).Count -gt 0) { throw 'receipt_invalid' }
    if ($receipt.evidenceRetained -eq $true) {
        $path=[IO.Path]::GetFullPath([string]$receipt.privateReportPath)
        if ([IO.Path]::GetDirectoryName($path) -ne $directory -or [IO.Path]::GetFileName($path) -notmatch '^ainuoke-garment-shipment-private-[0-9a-f-]{36}\.json$' -or
            $receipt.privateReportSha256 -notmatch '^[0-9a-f]{64}$') { throw 'private_receipt_invalid' }
        & pwsh -NoProfile -NonInteractive -File (Join-Path $PSScriptRoot 'ainuoke-live-preflight.ps1') -ValidateOnly -PrivateDirectory $directory -PrivateFile $path 1>$null 2>$null
        if ($LASTEXITCODE -ne 0 -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $receipt.privateReportSha256) { throw 'private_receipt_invalid' }
    }
    if ($process.ExitCode -notin @(0,1) -or ($process.ExitCode -eq 0) -ne ($receipt.result -eq 'SCOPED_FILTER_OBSERVED')) { throw 'receipt_invalid' }
    $receipt | ConvertTo-Json -Depth 8 -Compress
    exit $process.ExitCode
} catch {
    @{schemaVersion='ainuoke-garment-filter-verification.v1';result='FAIL';code=$code;stage=$stage;databaseAccess='none';sourceActivation='not-activated';
        businessSnapshotPublication='not-performed';requestCounts=$(if ($started) {'unknown-worker-result'} else {'not-started'})} | ConvertTo-Json -Compress
    exit 1
} finally {
    if ($process -and -not $process.HasExited) { $process.Kill($true) }
    if ($process) { $process.Dispose() }
}
