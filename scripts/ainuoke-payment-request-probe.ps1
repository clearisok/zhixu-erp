#requires -Version 7.2
[CmdletBinding()]
param([switch]$ReadFirstPage, [switch]$ReadContracts, [string]$SamplesFile, [string]$ExpectedSamplesHash, [string]$CredentialFile, [switch]$Help)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$repositoryRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$failureCode = 'payment_private_wrapper_unavailable'
$schemaVersion = if ($ReadContracts) { 'ainuoke-payment-contract-probe.v1' } else { 'ainuoke-payment-request-probe.v1' }
$stage = 'arguments'
$workerDetails = @{}
function Assert-PrivateCredential([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.Length -gt 8192) { throw 'credential_file_invalid' }
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
function Resolve-PhysicalPath([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'private_path_invalid' }
    $physical = & $nodeExecutable -e 'process.stdout.write(require("node:fs").realpathSync.native(process.argv[1]))' $Path 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $physical) { throw 'private_path_invalid' }
    return [string]$physical
}
function Validate-PrivateOutput([string]$Directory) {
    & pwsh -NoProfile -NonInteractive -File (Join-Path $PSScriptRoot 'ainuoke-live-preflight.ps1') -ValidateOnly -PrivateDirectory $Directory 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'private_acl_validation_failed' }
}
try {
    if ($Help) { Write-Output 'Fixed 6086941: -ReadFirstPage for 100-row page; or -ReadContracts -SamplesFile -ExpectedSamplesHash for two verified contracts, at most 2 pages each/two passes. Both require -CredentialFile. No DB/activation.'; exit 0 }
    if (-not $CredentialFile -or ($ReadFirstPage -eq $ReadContracts) -or
        ($ReadFirstPage -and ($SamplesFile -or $ExpectedSamplesHash)) -or
        ($ReadContracts -and (-not $SamplesFile -or $ExpectedSamplesHash -notmatch '^[0-9a-f]{64}$'))) { $failureCode = 'payment_explicit_scope_required'; throw 'scope_required' }
    if (-not $IsWindows) { throw 'windows_private_terminal_required' }
    $stage = 'worktree'
    $dirty = & git -C $repositoryRoot status --porcelain --untracked-files=normal
    if ($LASTEXITCODE -ne 0 -or $dirty) { throw 'committed_clean_worktree_required' }
    $nodeExecutable = (Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $version = & $nodeExecutable --version
    $runtimeMatch = [regex]::Match($version, '^v([0-9]+\.[0-9]+\.[0-9]+)$')
    if ($LASTEXITCODE -ne 0 -or -not $runtimeMatch.Success -or [version]$runtimeMatch.Groups[1].Value -lt [version]'22.13.0') { throw 'node_runtime_required' }
    if (-not (Test-Path -LiteralPath (Join-Path $repositoryRoot 'node_modules/tsx') -PathType Container)) { throw 'locked_dependencies_required' }
    $repositoryRoot = Resolve-PhysicalPath $repositoryRoot
    $stage = 'private_output'
    $outputParent = Join-Path $repositoryRoot 'outputs'
    if (-not (Test-Path -LiteralPath $outputParent)) { [IO.Directory]::CreateDirectory($outputParent) | Out-Null }
    if ((Get-Item -LiteralPath $outputParent).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'private_path_invalid' }
    $directory = Join-Path $outputParent ('ainuoke-payment-private-' + [guid]::NewGuid().ToString())
    [IO.Directory]::CreateDirectory($directory) | Out-Null
    # Only a new empty directory is protected; never change the existing credential ACL.
    $ownerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls $directory /inheritance:r /grant:r ('*' + $ownerSid + ':(OI)(CI)F') '*S-1-5-18:(OI)(CI)F' 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'private_acl_setup_failed' }
    Validate-PrivateOutput $directory
    & git -C $repositoryRoot check-ignore --quiet -- (Join-Path $directory 'private-report.json')
    if ($LASTEXITCODE -ne 0) { throw 'private_git_ignore_required' }
    if ($ReadContracts) {
        $stage = 'samples'
        $failureCode = 'payment_contract_samples_path_invalid'
        $resolvedSamples = Resolve-PhysicalPath $SamplesFile
        $samplesDirectory = Split-Path -Parent $resolvedSamples
        if (-not $resolvedSamples.StartsWith(($outputParent + [IO.Path]::DirectorySeparatorChar), [StringComparison]::OrdinalIgnoreCase)) { throw 'samples_scope_invalid' }
        $failureCode = 'payment_contract_samples_acl_invalid'
        Validate-PrivateOutput $samplesDirectory
        & pwsh -NoProfile -NonInteractive -File (Join-Path $PSScriptRoot 'ainuoke-live-preflight.ps1') -ValidateOnly -PrivateDirectory $samplesDirectory -PrivateFile $resolvedSamples 1>$null 2>$null
        if ($LASTEXITCODE -ne 0) { throw 'samples_acl_invalid' }
        $failureCode = 'payment_contract_samples_hash_invalid'
        if ((Get-Item -LiteralPath $resolvedSamples).Length -gt 262144 -or
            (Get-FileHash -LiteralPath $resolvedSamples -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedSamplesHash) { throw 'samples_invalid' }
    }
    $stage = 'credential_file'
    $failureCode = 'payment_private_credential_invalid'
    $resolvedFile = (Resolve-Path -LiteralPath $CredentialFile).Path
    Assert-PrivateCredential $resolvedFile
    $raw = [Text.UTF8Encoding]::new($false, $true).GetString([IO.File]::ReadAllBytes($resolvedFile)).TrimStart([char]0xFEFF)
    $match = [regex]::Match($raw, '\A账号[:：]([^\r\n]+)\r?\n密码[:：]([^\r\n]+)(?:\r?\n)?\z')
    if (-not $match.Success) { throw 'credential_file_format' }
    $username = $match.Groups[1].Value.Trim()
    $password = $match.Groups[2].Value
    $raw = $null; $match = $null
    $configuration = @{ sourceKey = 'payment-request-diagnostic'; baseUrl = 'http://61.164.81.194:9043'; transportPolicy = 'user-approved-http-d109';
        username = $username; password = $password; operatorUsername = 'readonly-no-db-authorization' } | ConvertTo-Json -Compress
    $stage = 'worker'
    $failureCode = 'payment_readonly_worker_failed'
    $start = [Diagnostics.ProcessStartInfo]::new($nodeExecutable)
    $start.WorkingDirectory = $repositoryRoot; $start.UseShellExecute = $false; $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true; $start.RedirectStandardOutput = $true; $start.RedirectStandardError = $true
    $start.StandardInputEncoding = [Text.UTF8Encoding]::new($false); $start.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
    $workerArguments = if ($ReadContracts) {
        @('--import','tsx','server/ainuoke-source/payment-request-contract-probe.ts','--run-read-contracts','--stdin-config',
            ('--private-output=' + $directory),('--samples-file=' + $resolvedSamples),('--expected-samples=' + $ExpectedSamplesHash))
    } else {
        @('--import','tsx','server/ainuoke-source/payment-request-probe.ts','--run-read-only','--stdin-config',('--private-output=' + $directory))
    }
    foreach ($argument in $workerArguments) { $start.ArgumentList.Add($argument) }
    $process = [Diagnostics.Process]::Start($start)
    $stdout = $process.StandardOutput.ReadToEndAsync(); $stderr = $process.StandardError.ReadToEndAsync()
    $process.StandardInput.Write($configuration); $process.StandardInput.Close()
    $configuration = $null; $password = $null; $username = $null
    if (-not $process.WaitForExit($(if ($ReadContracts) { 195000 } else { 135000 }))) { $process.Kill($true); throw 'payment_worker_timeout' }
    $stage = 'receipt'
    $failureCode = 'payment_readonly_receipt_invalid'
    $receiptText = $stdout.GetAwaiter().GetResult()
    if ($receiptText.Length -gt 32768) { throw 'receipt_limit' }
    $receipt = $receiptText | ConvertFrom-Json
    if ($receipt.schemaVersion -ne $schemaVersion -or $receipt.databaseAccess -ne 'none' -or $receipt.sourceActivation -ne 'not-activated') { throw 'receipt_invalid' }
    if ($ReadContracts) {
        $contractFailureCodes = @('payment_contract_input_invalid','payment_contract_selection_invalid','payment_contract_account_mismatch','payment_contract_scope_refused','payment_contract_response_limit','payment_contract_identity_mismatch','payment_contract_count_mismatch','payment_contract_page_limit','payment_contract_repeated_page','payment_contract_source_changed','payment_contract_witness_missing','payment_contract_empty_unverified','payment_contract_paging_mismatch','payment_contract_failed','payment_observation_duplicate_json_key','payment_observation_invalid_json','payment_observation_invalid_shape','payment_observation_invalid_count','redirect_refused','auth_expired','invalid_credential','network_unavailable','upstream_http_error','upstream_schema_error','payment_probe_endpoint_refused','payment_probe_scope_refused','payment_probe_request_limit','payment_probe_response_limit','payment_probe_invalid_json','payment_probe_invalid_metadata','payment_probe_structure_limit','payment_probe_secret_field','payment_probe_secret_reflection','payment_probe_invalid_number','payment_probe_page_limit','payment_probe_report_mismatch','payment_probe_report_metadata_invalid_json','payment_probe_report_metadata_shape','payment_probe_column_metadata_invalid_json','payment_probe_column_metadata_shape','payment_contract_timeout','payment_contract_worker_limit','payment_contract_worker_unavailable','payment_contract_worker_invalid','payment_contract_invalid_evidence','payment_contract_exact_runtime_required','payment_contract_samples_invalid','payment_contract_explicit_scope_required','payment_contract_clean_commit_required','source_secret_field')
        $contractAllowed = @('schemaVersion','result','code','reportId','sourceFingerprint','samplesSha256','selectionHash','selectedContracts','contractSummaries',
            'httpAttempts','reportRequests','workerStage','stage','collectionValidation','queryValidation','consistencyScope','databaseAccess','sourceActivation',
            'mappingVerified','bankPaymentStatus','toolingCommit','privateReportPath','privateReportSha256','evidenceRetained')
        if (@($receipt.PSObject.Properties.Name | Where-Object { $_ -notin $contractAllowed }).Count -gt 0) { throw 'contract_receipt_invalid' }
        if ($process.ExitCode -eq 0) {
            if ($receipt.result -ne 'READ_ONLY_CONTRACT_PROBE_RECORDED' -or $receipt.reportId -ne '6086941' -or
                $receipt.samplesSha256 -ne $ExpectedSamplesHash -or $receipt.sourceFingerprint -notmatch '^[0-9a-f]{64}$' -or
                $receipt.selectionHash -notmatch '^[0-9a-f]{64}$' -or $receipt.selectedContracts -ne 2 -or
                $receipt.httpAttempts -lt 5 -or $receipt.httpAttempts -gt 9 -or $receipt.reportRequests -ne ($receipt.httpAttempts - 1) -or
                $receipt.collectionValidation -ne 'complete-selected-contracts' -or
                $receipt.queryValidation -ne 'two-positive-contracts-two-pass-row-parity' -or
                $receipt.consistencyScope -ne 'two-pass-observed-rows-not-upstream-transaction' -or
                $receipt.mappingVerified -ne $false -or $receipt.bankPaymentStatus -ne 'not-inferred' -or
                @($receipt.contractSummaries).Count -ne 2) { throw 'contract_receipt_invalid' }
            for ($sampleIndex=0; $sampleIndex -lt 2; $sampleIndex++) {
                $entry=$receipt.contractSummaries[$sampleIndex]
                if ((($entry.PSObject.Properties.Name | Sort-Object) -join ',') -ne 'alias,contentHash,pageCount,rowCount' -or
                    $entry.alias -ne ('S' + ($sampleIndex + 1)) -or $entry.contentHash -notmatch '^[0-9a-f]{64}$' -or
                    $entry.rowCount -lt 1 -or $entry.rowCount -gt 200 -or $entry.pageCount -ne [Math]::Ceiling($entry.rowCount/100)) { throw 'contract_summary_invalid' }
            }
        } else {
            if ($receipt.result -ne 'FAIL' -or $receipt.code -notin $contractFailureCodes) { throw 'contract_failure_invalid' }
        }
        if ($receipt.evidenceRetained -eq $true) {
            $reportPath=[IO.Path]::GetFullPath([string]$receipt.privateReportPath)
            if ([IO.Path]::GetDirectoryName($reportPath) -ne [IO.Path]::GetFullPath($directory) -or
                [IO.Path]::GetFileName($reportPath) -notmatch '^ainuoke-payment-request-private-[0-9a-f-]{36}\.json$' -or
                $receipt.privateReportSha256 -notmatch '^[0-9a-f]{64}$') { throw 'contract_private_receipt_invalid' }
            & pwsh -NoProfile -NonInteractive -File (Join-Path $PSScriptRoot 'ainuoke-live-preflight.ps1') -ValidateOnly -PrivateDirectory $directory -PrivateFile $reportPath 1>$null 2>$null
            if ($LASTEXITCODE -ne 0 -or (Get-FileHash -LiteralPath $reportPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $receipt.privateReportSha256) { throw 'contract_private_receipt_invalid' }
        } elseif ($process.ExitCode -eq 0) { throw 'contract_private_evidence_missing' }
        if ($process.ExitCode -ne 0) {
            $failureCode = [string]$receipt.code
            $stage = if ($receipt.stage -in @('arguments','private_output','worktree','samples','configuration','collection','validation','report_write')) { $receipt.stage } else { 'collection' }
            $workerDetails = @{}
            if ($receipt.workerStage -in @('not-started','login','report','validation')) { $workerDetails['workerStage']=$receipt.workerStage }
            foreach ($counter in @('httpAttempts','reportRequests')) {
                if ($receipt.PSObject.Properties.Name -contains $counter) {
                    $number=$receipt.$counter
                    $maximum=if ($counter -eq 'httpAttempts') {9} else {8}
                    if (($number -isnot [int] -and $number -isnot [long]) -or $number -lt 0 -or $number -gt $maximum) { throw 'contract_failure_counter_invalid' }
                    $workerDetails[$counter]=$number
                }
            }
            if ($receipt.evidenceRetained -eq $true) {
                $workerDetails['evidenceRetained']=$true
                $workerDetails['privateReportPath']=$reportPath
                $workerDetails['privateReportSha256']=$receipt.privateReportSha256
            }
            throw 'contract_worker_failed'
        }
        $receipt | ConvertTo-Json -Depth 8 -Compress
        exit 0
    }
    if ($process.ExitCode -eq 0) {
        $allowed = @('schemaVersion','result','transport','sourceFingerprint','databaseAccess','sourceActivation','humanBusinessAcceptance','scope','reportId','page','pageSize','reportedTotal','returnedRows','firstPageMatchesReportedSize','allVisibleRecordsRead','discoveryRequests','reportRequests','httpAttempts','fetchedAt','rawResponseSha256','reportIdentityReturned','columnMetadataReturned','reportMetadataJsonEncoded','columnMetadataJsonEncoded','candidateFieldCoverage','unrecognizedRowFieldCount','mappingVerified','unitSemantics','currencySemantics','formulaValidation','bankPaymentStatus','toolingCommit','privateReportPath','privateReportSha256')
        if (@($receipt.PSObject.Properties.Name | Where-Object { $_ -notin $allowed }).Count -gt 0 -or $receipt.reportId -ne '6086941' -or $receipt.page -ne 1 -or $receipt.pageSize -ne 100) { throw 'receipt_invalid' }
        $receipt | ConvertTo-Json -Depth 8 -Compress
    } else {
        # Only a closed code/stage allowlist can leave a failed worker.
        $safeCodes = @('payment_probe_worker_encoding','payment_probe_worker_json_invalid','payment_probe_invalid_envelope','payment_probe_invalid_timestamp','payment_probe_stale_evidence','payment_probe_hash_mismatch','payment_probe_response_shape','payment_probe_rows_shape','payment_probe_row_count_mismatch','payment_probe_count_invalid','payment_probe_total_mismatch','payment_probe_pagination_mismatch','payment_probe_report_metadata_invalid_json','payment_probe_report_metadata_shape','payment_probe_column_metadata_invalid_json','payment_probe_column_metadata_shape','invalid_payment_probe_input','payment_probe_origin_not_approved','payment_probe_explicit_action_required','invalid_payment_probe_credentials','payment_probe_endpoint_refused','payment_probe_scope_refused','payment_probe_request_limit','payment_probe_response_limit','payment_probe_invalid_json','payment_probe_invalid_metadata','payment_probe_structure_limit','payment_probe_secret_field','payment_probe_secret_reflection','payment_probe_invalid_number','payment_probe_page_limit','payment_probe_raw_evidence_missing','payment_probe_report_mismatch','redirect_refused','auth_expired','invalid_credential','network_unavailable','upstream_http_error','upstream_schema_error','payment_probe_failed',
            'payment_probe_explicit_action_required','preflight_private_output_required','payment_probe_clean_commit_required','invalid_collector_configuration','payment_probe_scope_refused','payment_probe_timeout','payment_probe_limit','payment_probe_worker_unavailable','payment_probe_invalid_evidence','payment_probe_report_mismatch','source_secret_field','payment_probe_failed')
        $safeStages = @('arguments','private_output','worktree','configuration','collection','evidence_validation','report_write')
        if ($receipt.result -eq 'FAIL' -and $receipt.code -in $safeCodes -and $receipt.stage -in $safeStages) {
            $failureCode = $receipt.code; $stage = $receipt.stage
            if ($receipt.workerStage -in @('not-started','login','report','validation') -and $receipt.httpAttempts -ge 0 -and $receipt.httpAttempts -le 2 -and $receipt.reportRequests -ge 0 -and $receipt.reportRequests -le 1) {
                $workerDetails = @{workerStage=$receipt.workerStage; httpAttempts=$receipt.httpAttempts; reportRequests=$receipt.reportRequests}
            }
        }
        if ($receipt.evidenceRetained -eq $true -and $receipt.result -eq 'FAIL' -and $receipt.code -in $safeCodes -and $receipt.stage -in $safeStages) {
            $reportPath = [IO.Path]::GetFullPath([string]$receipt.privateReportPath)
            if ([IO.Path]::GetDirectoryName($reportPath) -ne [IO.Path]::GetFullPath($directory) -or
                [IO.Path]::GetFileName($reportPath) -notmatch '^ainuoke-payment-request-private-[0-9a-f-]{36}\.json$' -or
                [string]$receipt.privateReportSha256 -notmatch '^[0-9a-f]{64}$') { throw 'rejected_evidence_receipt_invalid' }
            & pwsh -NoProfile -NonInteractive -File (Join-Path $PSScriptRoot 'ainuoke-live-preflight.ps1') -ValidateOnly -PrivateDirectory $directory -PrivateFile $reportPath 1>$null 2>$null
            if ($LASTEXITCODE -ne 0) { throw 'rejected_evidence_acl_invalid' }
            if ((Get-FileHash -LiteralPath $reportPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne [string]$receipt.privateReportSha256) { throw 'rejected_evidence_hash_invalid' }
            $workerDetails['evidenceRetained']=$true
            $workerDetails['privateReportPath']=$reportPath
            $workerDetails['privateReportSha256']=[string]$receipt.privateReportSha256
        }
        throw 'payment_worker_failed'
    }
    exit 0
} catch {
    $failureReceipt = @{ schemaVersion = $schemaVersion; result = 'FAIL'; code = $failureCode; stage = $stage; databaseAccess = 'none'; sourceActivation = 'not-activated' }
    foreach ($key in $workerDetails.Keys) { $failureReceipt[$key] = $workerDetails[$key] }
    $failureReceipt | ConvertTo-Json -Compress
    exit 1
} finally {
    $configuration = $null; $password = $null; $username = $null; $raw = $null; $match = $null
    if ($process -and -not $process.HasExited) { $process.Kill($true) }
    if ($process) { $process.Dispose() }
}
