#requires -Version 7.2
[CmdletBinding()]
param([switch]$ReadFirstPage, [string]$CredentialFile, [switch]$Help)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$repositoryRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$failureCode = 'shipment_private_wrapper_failed'
$stage = 'arguments'
$process = $null
$workerDetails = @{}
function Assert-PrivateCredential([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -gt 8192) { throw 'credential_invalid' }
    $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $acl = Get-Acl -LiteralPath $Path
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $owner -or @($acl.Access).Count -eq 0) { throw 'credential_acl_invalid' }
    $readable = $false
    foreach ($rule in $acl.Access) {
        $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        if ($rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or $sid -notin @($owner,'S-1-5-18')) { throw 'credential_acl_invalid' }
        if ($sid -eq $owner -and ($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::Read)) { $readable = $true }
    }
    if (-not $readable) { throw 'credential_acl_invalid' }
}
function Validate-PrivatePath([string]$Directory, [string]$File) {
    $arguments = @('-NoProfile','-NonInteractive','-File',(Join-Path $PSScriptRoot 'ainuoke-live-preflight.ps1'),'-ValidateOnly','-PrivateDirectory',$Directory)
    if ($File) { $arguments += @('-PrivateFile',$File) }
    & pwsh @arguments 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'private_acl_invalid' }
}
try {
    if ($Help) { Write-Output 'Fixed 6086979 / insideorderno contains D1935, first page only. -ReadFirstPage -CredentialFile. 1 login + 1 report, <=100 rows/4MiB/120s, no retry/DB/activation.'; exit 0 }
    if (-not $ReadFirstPage -or -not $CredentialFile) { $failureCode='shipment_probe_explicit_action_required'; throw 'scope_required' }
    if (-not $IsWindows) { throw 'windows_private_terminal_required' }
    $stage='worktree'
    $dirty = & git -C $repositoryRoot status --porcelain --untracked-files=normal
    if ($LASTEXITCODE -ne 0 -or $dirty) { $failureCode='shipment_probe_clean_commit_required'; throw 'clean_worktree_required' }
    if ((Get-Item -LiteralPath $repositoryRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'private_path_invalid' }
    $nodeExecutable = (Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $version = & $nodeExecutable --version
    $runtimeMatch = [regex]::Match($version, '^v([0-9]+\.[0-9]+\.[0-9]+)$')
    if ($LASTEXITCODE -ne 0 -or -not $runtimeMatch.Success -or [version]$runtimeMatch.Groups[1].Value -lt [version]'22.13.0' -or
        -not (Test-Path -LiteralPath (Join-Path $repositoryRoot 'node_modules/tsx') -PathType Container)) { throw 'locked_runtime_required' }
    $stage='private_output'
    $outputParent=Join-Path $repositoryRoot 'outputs'
    if (-not (Test-Path -LiteralPath $outputParent)) { [IO.Directory]::CreateDirectory($outputParent) | Out-Null }
    if ((Get-Item -LiteralPath $outputParent).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'private_path_invalid' }
    $directory=Join-Path $outputParent ('ainuoke-shipment-private-'+[guid]::NewGuid().ToString())
    [IO.Directory]::CreateDirectory($directory) | Out-Null
    $ownerSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls $directory /inheritance:r /grant:r ('*'+$ownerSid+':(OI)(CI)F') '*S-1-5-18:(OI)(CI)F' 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'private_acl_setup_failed' }
    Validate-PrivatePath $directory
    & git -C $repositoryRoot check-ignore --quiet -- (Join-Path $directory 'private-report.json')
    if ($LASTEXITCODE -ne 0) { throw 'private_ignore_required' }
    $stage='credential_file'; $failureCode='shipment_private_credential_invalid'
    $resolvedFile=(Resolve-Path -LiteralPath $CredentialFile).Path
    Assert-PrivateCredential $resolvedFile
    $raw=[Text.UTF8Encoding]::new($false,$true).GetString([IO.File]::ReadAllBytes($resolvedFile)).TrimStart([char]0xFEFF)
    $match=[regex]::Match($raw,'\A账号[:：]([^\r\n]+)\r?\n密码[:：]([^\r\n]+)(?:\r?\n)?\z')
    if (-not $match.Success) { throw 'credential_file_format' }
    $username=$match.Groups[1].Value.Trim(); $password=$match.Groups[2].Value
    $raw=$null; $match=$null
    $configuration=@{sourceKey='garment-shipment-diagnostic';baseUrl='http://61.164.81.194:9043';transportPolicy='user-approved-http-d109';username=$username;password=$password;operatorUsername='readonly-no-db-authorization'} | ConvertTo-Json -Compress
    $stage='worker'; $failureCode='shipment_private_worker_failed'
    $start=[Diagnostics.ProcessStartInfo]::new($nodeExecutable)
    $start.WorkingDirectory=$repositoryRoot; $start.UseShellExecute=$false; $start.CreateNoWindow=$true
    $start.RedirectStandardInput=$true; $start.RedirectStandardOutput=$true; $start.RedirectStandardError=$true
    $start.StandardInputEncoding=[Text.UTF8Encoding]::new($false); $start.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
    foreach ($argument in @('--import','tsx','server/ainuoke-source/garment-shipment-probe.ts','--read-6086979-d1935-first-page','--stdin-config',('--private-output='+$directory))) { $start.ArgumentList.Add($argument) }
    $process=[Diagnostics.Process]::Start($start)
    $stdout=$process.StandardOutput.ReadToEndAsync(); $stderr=$process.StandardError.ReadToEndAsync()
    $process.StandardInput.Write($configuration); $process.StandardInput.Close()
    $configuration=$null; $password=$null; $username=$null
    if (-not $process.WaitForExit(135000)) { $process.Kill($true); $failureCode='shipment_probe_timeout'; throw 'worker_timeout' }
    $stage='receipt'; $failureCode='shipment_private_receipt_invalid'
    $receiptText=$stdout.GetAwaiter().GetResult()
    if ($receiptText.Length -gt 262144) { throw 'receipt_limit' }
    $receipt=$receiptText | ConvertFrom-Json
    $allowed=@('schemaVersion','result','reportId','queryContext','sourceFingerprint','databaseAccess','sourceActivation','mappingVerified','businessMeaningVerified','page','pageSize','reportedTotal','returnedRows','allVisibleRecordsRead','httpAttempts','reportRequests','fetchedAt','rawResponseSha256','reportIdentityReturned','columnCount','rowFields','otherFieldNameCount','stableContractIdentity','shipmentQuantityMeaning','shipmentDateMeaning','toolingCommit','privateReportPath','privateReportSha256','code','stage','workerStage','evidenceRetained')
    if ($receipt.schemaVersion -ne 'ainuoke-garment-shipment-probe.v1' -or $receipt.databaseAccess -ne 'none' -or
        $receipt.sourceActivation -ne 'not-activated' -or @($receipt.PSObject.Properties.Name | Where-Object { $_ -notin $allowed }).Count -gt 0) { throw 'receipt_invalid' }
    if ($process.ExitCode -eq 0) {
        if ($receipt.result -ne 'READ_ONLY_CANDIDATE_PAGE_RECORDED' -or $receipt.reportId -ne '6086979' -or $receipt.page -ne 1 -or $receipt.pageSize -ne 100 -or
            $receipt.httpAttempts -ne 2 -or $receipt.reportRequests -ne 1 -or $receipt.mappingVerified -ne $false -or $receipt.businessMeaningVerified -ne $false -or
            (($receipt.queryContext.PSObject.Properties.Name)-join ',') -ne 'insideOrderNo' -or $receipt.queryContext.insideOrderNo -ne 'D1935' -or
            $receipt.sourceFingerprint -notmatch '^[0-9a-f]{64}$' -or $receipt.toolingCommit -notmatch '^[0-9a-f]{40}$' -or
            @($receipt.rowFields).Count -gt 1000 -or @($receipt.rowFields | Where-Object { $_ -isnot [string] -or $_ -notmatch '^[A-Za-z_][A-Za-z0-9_]{0,127}$' }).Count -gt 0) { throw 'receipt_scope_invalid' }
    } else {
        $safeCodes=@('shipment_probe_invalid_evidence','shipment_probe_report_mismatch','shipment_probe_hash_mismatch','shipment_probe_stale_evidence','shipment_probe_scope_refused','shipment_probe_timeout','shipment_probe_output_limit','shipment_probe_worker_unavailable','shipment_probe_worker_encoding','shipment_probe_worker_failed','shipment_probe_failed','shipment_probe_duplicate_json_key','shipment_probe_invalid_json','invalid_shipment_probe_input','shipment_probe_origin_not_approved','shipment_probe_explicit_action_required','invalid_shipment_probe_credentials','shipment_probe_endpoint_refused','shipment_probe_request_limit','shipment_probe_response_limit','shipment_probe_invalid_metadata','shipment_probe_structure_limit','shipment_probe_secret_field','shipment_probe_secret_reflection','shipment_probe_invalid_number','shipment_probe_page_limit','shipment_probe_raw_evidence_missing','shipment_probe_report_metadata_invalid_json','shipment_probe_report_metadata_shape','shipment_probe_column_metadata_invalid_json','shipment_probe_column_metadata_shape','redirect_refused','auth_expired','invalid_credential','network_unavailable','upstream_http_error','upstream_schema_error','source_secret_field','preflight_private_output_required','shipment_probe_clean_commit_required','invalid_collector_configuration')
        if ($receipt.result -ne 'FAIL' -or $receipt.code -notin $safeCodes -or $receipt.stage -notin @('arguments','private_output','worktree','configuration','collection','validation','report_write')) { throw 'failure_receipt_invalid' }
        $failureCode=[string]$receipt.code; $stage=[string]$receipt.stage
        if ($receipt.workerStage -in @('not-started','login','report','validation')) { $workerDetails['workerStage']=$receipt.workerStage }
        foreach ($counter in @('httpAttempts','reportRequests')) {
            if ($receipt.PSObject.Properties.Name -contains $counter) {
                $number=$receipt.$counter; $maximum=if ($counter -eq 'httpAttempts') {2} else {1}
                if (($number -isnot [int] -and $number -isnot [long]) -or $number -lt 0 -or $number -gt $maximum) { throw 'failure_count_invalid' }
                $workerDetails[$counter]=$number
            }
        }
    }
    if ($process.ExitCode -eq 0 -or $receipt.evidenceRetained -eq $true) {
        $reportPath=[IO.Path]::GetFullPath([string]$receipt.privateReportPath)
        if ([IO.Path]::GetDirectoryName($reportPath) -ne [IO.Path]::GetFullPath($directory) -or
            [IO.Path]::GetFileName($reportPath) -notmatch '^ainuoke-garment-shipment-private-[0-9a-f-]{36}\.json$' -or $receipt.privateReportSha256 -notmatch '^[0-9a-f]{64}$') { throw 'private_receipt_invalid' }
        Validate-PrivatePath $directory $reportPath
        if ((Get-FileHash -LiteralPath $reportPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $receipt.privateReportSha256) { throw 'private_report_hash_invalid' }
        if ($process.ExitCode -ne 0) { $workerDetails['evidenceRetained']=$true; $workerDetails['privateReportPath']=$reportPath; $workerDetails['privateReportSha256']=$receipt.privateReportSha256 }
    }
    if ($process.ExitCode -ne 0) { throw 'worker_failed' }
    $receipt | ConvertTo-Json -Depth 8 -Compress
    exit 0
} catch {
    $failure=@{schemaVersion='ainuoke-garment-shipment-probe.v1';result='FAIL';code=$failureCode;stage=$stage;databaseAccess='none';sourceActivation='not-activated'}
    foreach ($key in $workerDetails.Keys) { $failure[$key]=$workerDetails[$key] }
    $failure | ConvertTo-Json -Compress
    exit 1
} finally {
    $configuration=$null; $password=$null; $username=$null; $raw=$null; $match=$null
    if ($process -and -not $process.HasExited) { $process.Kill($true) }
    if ($process) { $process.Dispose() }
}
