#requires -Version 7.2
[CmdletBinding()]
param([switch]$RecoverFilter, [string]$CredentialFile, [switch]$Help)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$process=$null; $stage='arguments'; $code='garment_recovery_scope_required'; $started=$false
$clock=[Diagnostics.Stopwatch]::StartNew()
try {
    if ($Help) { Write-Output 'Fresh D1933 first page then unique C1 / empty C0 / C1. -RecoverFilter -CredentialFile. <=2 logins +4 reports,100 rows/page,4MiB/report,16MiB reports,4MiB/login,shared180s. No retry/pages/DB/activation. NEW specific real-read authorization required.'; exit 0 }
    if (-not $IsWindows -or -not $RecoverFilter -or -not $CredentialFile) { throw 'scope_required' }
    $root=(Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
    if ((Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'private_path_invalid' }
    $stage='private_output'; $code='garment_recovery_launcher_failed'
    $directory=Join-Path $root ('outputs/isolated-private-'+[guid]::NewGuid().ToString())
    & pwsh -NoProfile -NonInteractive -File (Join-Path $PSScriptRoot 'isolated-private-directory.ps1') -Directory $directory -Create 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'private_acl_failed' }
    $node=(Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $start=[Diagnostics.ProcessStartInfo]::new($node)
    $start.WorkingDirectory=$root; $start.UseShellExecute=$false; $start.CreateNoWindow=$true
    $start.RedirectStandardOutput=$true; $start.RedirectStandardError=$true
    $start.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
    foreach ($argument in @('--import','tsx','server/ainuoke-source/garment-filter-recovery.ts','--recover-d1933-contract-filter',
        ('--credential-file='+[IO.Path]::GetFullPath($CredentialFile)),('--private-output='+$directory))) { $start.ArgumentList.Add($argument) }
    $stage='worker'
    $remaining=[Math]::Floor(180000-$clock.Elapsed.TotalMilliseconds)
    if ($remaining -le 0) { $code='garment_recovery_deadline'; throw 'deadline' }
    $process=[Diagnostics.Process]::Start($start); $started=$true
    $stdout=$process.StandardOutput.ReadToEndAsync(); $stderr=$process.StandardError.ReadToEndAsync()
    $timedOut=-not $process.WaitForExit([int]$remaining)
    if ($timedOut) {
        $process.Kill($true); $code='garment_recovery_deadline'
        if (-not $process.WaitForExit(5000)) { throw 'termination_unconfirmed' }
    }
    $text=$stdout.GetAwaiter().GetResult()
    if ($text.Length -gt 65536) { throw 'receipt_limit' }
    $lines=@($text -split '\r?\n')
    # A killed final write may be partial; only newline-complete frames qualify.
    if ($timedOut -and -not $text.EndsWith("`n")) { $lines=@($lines | Select-Object -SkipLast 1) }
    $lines=@($lines | Where-Object { $_.Length -gt 0 })
    if ($lines.Count -lt 1 -or $lines.Count -gt 4) { throw 'receipt_limit' }
    $frames=@($lines | ForEach-Object { $_ | ConvertFrom-Json })
    $allowed=@('schemaVersion','result','code','stage','toolingCommit','databaseAccess','sourceActivation','businessSnapshotPublication',
        'requestCounts','httpAttempts','reportRequests','knownHttpAttempts','knownReportRequests','phases','retainedFiles','observation')
    for ($index=0; $index -lt $frames.Count; $index++) {
        $frame=$frames[$index]
        if ($frame.schemaVersion -ne 'ainuoke-garment-filter-recovery.v1' -or $frame.result -notin @('FAIL','SCOPED_FILTER_OBSERVED','PROGRESS') -or
            $frame.databaseAccess -ne 'none' -or $frame.sourceActivation -ne 'not-activated' -or $frame.businessSnapshotPublication -ne 'not-performed' -or
            @($frame.PSObject.Properties.Name | Where-Object { $_ -notin $allowed }).Count -gt 0 -or
            $frame.requestCounts -notin @('not-started','exact','unknown-worker-result') -or
            ($frame.result -ne 'PROGRESS' -and $index -ne $frames.Count-1) -or
            ($frame.result -eq 'PROGRESS' -and ($index -ge 3 -or $null -ne $frame.code -or
                $frame.stage -notin @('candidate-selection','filter-collection','filter-write')))) { throw 'receipt_invalid' }
    }
    $receipt=$frames[-1]
    if ((@($receipt.phases.PSObject.Properties.Name | Sort-Object) -join ',') -ne 'candidate,filter') { throw 'phase_invalid' }
    foreach ($name in @('candidate','filter')) {
        $phase=$receipt.phases.$name
        if ((@($phase.PSObject.Properties.Name | Sort-Object) -join ',') -ne 'httpAttempts,reportRequests,status' -or
            $phase.status -notin @('not-started','exact','unknown-worker-result')) { throw 'phase_invalid' }
        $maximum=if ($name -eq 'candidate') {2} else {4}
        if ($phase.status -eq 'unknown-worker-result') {
            if ($null -ne $phase.httpAttempts -or $null -ne $phase.reportRequests) { throw 'phase_invalid' }
        } else {
            foreach ($field in @('httpAttempts','reportRequests')) {
                $value=$phase.$field; $limit=if ($field -eq 'httpAttempts') {$maximum} else {$maximum-1}
                if (($value -isnot [int] -and $value -isnot [long]) -or $value -lt 0 -or $value -gt $limit) { throw 'phase_invalid' }
            }
            if ($phase.status -eq 'not-started' -and ($phase.httpAttempts -ne 0 -or $phase.reportRequests -ne 0)) { throw 'phase_invalid' }
        }
    }
    $files=@($receipt.retainedFiles)
    if ($files.Count -gt 2 -or @($files.role | Select-Object -Unique).Count -ne $files.Count) { throw 'private_receipt_invalid' }
    foreach ($file in $files) {
        if ((@($file.PSObject.Properties.Name | Sort-Object) -join ',') -ne 'privateReportPath,privateReportSha256,role' -or
            $file.role -notin @('candidate','filter')) { throw 'private_receipt_invalid' }
        $path=[IO.Path]::GetFullPath([string]$file.privateReportPath)
        if ([IO.Path]::GetDirectoryName($path) -ne $directory -or [IO.Path]::GetFileName($path) -notmatch '^ainuoke-garment-shipment-private-[0-9a-f-]{36}\.json$' -or
            $file.privateReportSha256 -notmatch '^[0-9a-f]{64}$') { throw 'private_receipt_invalid' }
        & pwsh -NoProfile -NonInteractive -File (Join-Path $PSScriptRoot 'ainuoke-live-preflight.ps1') -ValidateOnly -PrivateDirectory $directory -PrivateFile $path 1>$null 2>$null
        if ($LASTEXITCODE -ne 0 -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.privateReportSha256) { throw 'private_receipt_invalid' }
    }
    if ($timedOut) {
        # A completed progress frame proves past counts, not that later work
        # never started. Preserve exact facts and downgrade unstarted phases.
        if ($receipt.result -eq 'PROGRESS') {
            foreach ($name in @('candidate','filter')) {
                if ($receipt.phases.$name.status -eq 'not-started') {
                    $receipt.phases.$name.status='unknown-worker-result'
                    $receipt.phases.$name.httpAttempts=$null; $receipt.phases.$name.reportRequests=$null
                }
            }
        }
        $knownHttp=0; $knownReports=0; $unknown=$false
        foreach ($name in @('candidate','filter')) {
            $phase=$receipt.phases.$name
            if ($phase.status -eq 'unknown-worker-result') { $unknown=$true }
            else { $knownHttp+=$phase.httpAttempts; $knownReports+=$phase.reportRequests }
        }
        $receipt.result='FAIL'; $receipt.code='garment_recovery_deadline'; $receipt.stage='launcher-timeout'
        $receipt.knownHttpAttempts=$knownHttp; $receipt.knownReportRequests=$knownReports
        $receipt.httpAttempts=$(if ($unknown) {$null} else {$knownHttp}); $receipt.reportRequests=$(if ($unknown) {$null} else {$knownReports})
        $receipt.requestCounts=$(if ($unknown) {'unknown-worker-result'} elseif ($knownHttp -gt 0) {'exact'} else {'not-started'})
        $receipt | ConvertTo-Json -Depth 12 -Compress
        exit 1
    }
    if ($receipt.result -eq 'PROGRESS' -or $process.ExitCode -notin @(0,1) -or ($process.ExitCode -eq 0) -ne ($receipt.result -eq 'SCOPED_FILTER_OBSERVED')) { throw 'receipt_invalid' }
    $receipt | ConvertTo-Json -Depth 12 -Compress
    exit $process.ExitCode
} catch {
    @{schemaVersion='ainuoke-garment-filter-recovery.v1';result='FAIL';code=$code;stage=$stage;databaseAccess='none';sourceActivation='not-activated';
        businessSnapshotPublication='not-performed';requestCounts=$(if ($started) {'unknown-worker-result'} else {'not-started'})} | ConvertTo-Json -Compress
    exit 1
} finally {
    if ($process -and -not $process.HasExited) { $process.Kill($true) }
    if ($process) { $process.Dispose() }
}
