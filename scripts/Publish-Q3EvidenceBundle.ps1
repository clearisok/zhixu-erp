param(
    [Parameter(Mandatory = $true)][string]$SourceEvidenceDirectory,
    [Parameter(Mandatory = $true)][string]$DestinationRoot,
    [Parameter(Mandatory = $true)][string]$DestinationAnchor,
    [Parameter(Mandatory = $true)][string]$AttemptId,
    [string]$ReviewedCommit,
    [string]$FreezeEvidenceFile,
    [string]$FreshBackupFile,
    [string]$CanonicalPreviewReportFile,
    [string]$RehearsalProofFile,
    [string]$RollbackManifestFile,
    [switch]$Prepare,
    [switch]$VerifyOnly,
    [switch]$Execute,
    [string]$ConfirmEvidenceCopy
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (@(@($Prepare, $VerifyOnly, $Execute) | Where-Object { $_ }).Count -ne 1) { throw 'select_exactly_one_evidence_mode' }
if ($AttemptId -cnotmatch '^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$') { throw 'evidence_attempt_id_invalid' }
if ($Execute -and $ConfirmEvidenceCopy -cne 'I_UNDERSTAND_Q3_EVIDENCE_COPY_CREATES_INDEPENDENT_CUSTODY') {
    throw 'independent_evidence_copy_confirmation_required'
}
$stage = 'pre-execute'
$contract = 'zhixu-q3-evidence-bundle.v1'
$names = [ordered]@{
    'freeze-evidence.json' = 'freeze_evidence'
    'source-identity-summary.json' = 'source_identity_summary'
    'rehearsal-proof.json' = 'rehearsal_proof'
    'rollback-manifest.json' = 'rollback_manifest'
}
$manifestName = 'manifest.json'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\', '/')

function Resolve-Q3Path {
    param([string]$Path)
    if (-not [IO.Path]::IsPathFullyQualified($Path)) { throw 'evidence_absolute_path_required' }
    return [IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
}
function Test-Q3Child {
    param([string]$Child, [string]$Parent)
    return $Child.StartsWith($Parent.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
}
function Assert-Q3ExistingPathChain {
    param([string]$Path)
    $walk = $Path
    while ($walk) {
        if (Test-Path -LiteralPath $walk) {
            $item = Get-Item -LiteralPath $walk -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'evidence_reparse_path_forbidden' }
        }
        $parent = [IO.Path]::GetDirectoryName($walk)
        if ([string]::IsNullOrEmpty($parent) -or $parent -ceq $walk) { break }
        $walk = $parent
    }
}
function Read-Q3JsonFile {
    param([string]$Path)
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.PSIsContainer -or $item.Length -lt 2 -or $item.Length -gt 1048576 -or
        ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'evidence_artifact_invalid' }
    try { return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json -DateKind String }
    catch { throw 'evidence_artifact_json_invalid' }
}
function Get-Q3Hash {
    param([string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Write-Q3NewJson {
    param([string]$Path, $Value)
    $bytes = [Text.Encoding]::UTF8.GetBytes(($Value | ConvertTo-Json -Depth 24) + "`n")
    $stream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) }
    finally { $stream.Dispose() }
}
function Copy-Q3NewFile {
    param([string]$Source, [string]$Target)
    $input = [IO.File]::Open($Source, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try {
        $output = [IO.File]::Open($Target, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try { $input.CopyTo($output); $output.Flush($true) }
        finally { $output.Dispose() }
    } finally { $input.Dispose() }
}
function Assert-Q3ArtifactShape {
    param([string]$Kind, $Value)
    if ($null -eq $Value -or $Value -is [array]) { throw 'evidence_artifact_shape_invalid' }
    $json = $Value | ConvertTo-Json -Depth 30 -Compress
    if ($json -match '(?i)DATABASE_URL|postgres(?:ql)?://|"(?:password|cookie|credential|token|secret|localRecords|attachments|templates|rawPayload|rawRows|sourceRows|payload|rows|customer|email|phone|address)"\s*:') {
        throw 'evidence_secret_field_forbidden'
    }
    switch ($Kind) {
        'freeze_evidence' {
            if ($Value.evidenceVersion -ne 1 -or $Value.result -cne 'PASS' -or
                $Value.allOldTabsClosedBeforeFrozenReopen -ne $true -or
                $Value.observed.masterSettingsAuthority -cne 'frozen') { throw 'evidence_freeze_invalid' }
        }
        'source_identity_summary' {
            if ($Value.contract -cne 'zhixu-q3-source-identity.v1' -or
                $Value.fileSha256 -cnotmatch '^[0-9a-f]{64}$' -or
                $Value.sourceHash -cnotmatch '^[0-9a-f]{64}$' -or
                $Value.projectionContentHash -cnotmatch '^[0-9a-f]{64}$' -or
                $Value.bytes -lt 32 -or $Value.blockingErrors -ne 0) { throw 'evidence_source_summary_invalid' }
        }
        'rehearsal_proof' {
            if ($Value.proofVersion -ne 1 -or $Value.result -cne 'PASS' -or
                $Value.disposableContainerRemoved -ne $true) { throw 'evidence_rehearsal_invalid' }
        }
        'rollback_manifest' {
            if ($Value.contract -cne 'zhixu-exact-target-backup.v1' -or
                $Value.sha256 -cnotmatch '^[0-9a-f]{64}$' -or
                $Value.targetFingerprint -cnotmatch '^[0-9a-f]{64}$' -or
                $Value.archiveListVerified -ne $true) { throw 'evidence_rollback_manifest_invalid' }
        }
        default { throw 'evidence_kind_unknown' }
    }
}
function Assert-Q3Bundle {
    param([string]$Directory, [string]$Attempt, [string]$Reviewed, [switch]$AllowIncompleteMarker)
    if (-not (Test-Path -LiteralPath $Directory -PathType Container)) { throw 'evidence_source_directory_missing' }
    Assert-Q3ExistingPathChain -Path $Directory
    $expectedFiles = @($names.Keys) + @($manifestName)
    $actual = @(Get-ChildItem -LiteralPath $Directory -Force)
    if ($AllowIncompleteMarker) { $expectedFiles += '.incomplete' }
    if ($actual.Count -ne $expectedFiles.Count -or @($actual | Where-Object { $_.PSIsContainer -or $_.Name -cnotin $expectedFiles }).Count -ne 0) {
        throw 'evidence_unknown_or_prohibited_artifact'
    }
    $manifestPath = Join-Path $Directory $manifestName
    $manifest = Read-Q3JsonFile -Path $manifestPath
    $manifestKeys = @($manifest.PSObject.Properties.Name | Sort-Object)
    if (($manifestKeys -join ',') -cne 'artifacts,attemptId,contract,createdAt,reviewedCommit,stage,version') { throw 'evidence_manifest_invalid' }
    if ($manifest.contract -cne $contract -or $manifest.version -ne 1 -or
        $manifest.attemptId -cne $Attempt -or $manifest.stage -cne $stage -or
        $manifest.reviewedCommit -cne $Reviewed -or
        $manifest.createdAt -cnotmatch '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$' -or
        @($manifest.artifacts).Count -ne $names.Count) { throw 'evidence_manifest_invalid' }
    $seen = @{}
    foreach ($entry in @($manifest.artifacts)) {
        if ((@($entry.PSObject.Properties.Name | Sort-Object) -join ',') -cne 'bytes,filename,kind,sha256') { throw 'evidence_manifest_artifact_invalid' }
        if ($entry.filename -cnotin $names.Keys -or $seen.ContainsKey([string]$entry.filename) -or
            $entry.kind -cne $names[[string]$entry.filename] -or
            $entry.sha256 -cnotmatch '^[0-9a-f]{64}$' -or $entry.bytes -lt 2) { throw 'evidence_manifest_artifact_invalid' }
        $seen[[string]$entry.filename] = $true
        $path = Join-Path $Directory $entry.filename
        Assert-Q3ExistingPathChain -Path $path
        $value = Read-Q3JsonFile -Path $path
        Assert-Q3ArtifactShape -Kind $entry.kind -Value $value
        if ((Get-Item -LiteralPath $path).Length -ne $entry.bytes -or (Get-Q3Hash -Path $path) -cne $entry.sha256) {
            throw 'evidence_artifact_hash_mismatch'
        }
    }
    $freeze = Read-Q3JsonFile -Path (Join-Path $Directory 'freeze-evidence.json')
    $source = Read-Q3JsonFile -Path (Join-Path $Directory 'source-identity-summary.json')
    $proof = Read-Q3JsonFile -Path (Join-Path $Directory 'rehearsal-proof.json')
    if ($freeze.expected.gitCommit -cne $Reviewed -or $proof.reviewedCommit -cne $Reviewed -or
        $source.fileSha256 -cne $proof.sourceFileSha256 -or $source.sourceHash -cne $proof.sourceHash -or
        $source.projectionContentHash -cne $proof.projectionContentHash -or
        $source.capture.origin -cne $freeze.browserOrigin -or
        $source.capture.namespace -cne $freeze.namespace -or
        $source.capture.schemaVersion -ne $freeze.schemaVersion) { throw 'evidence_cross_artifact_mismatch' }
    return Get-Q3Hash -Path $manifestPath
}

$sourceDirectory = Resolve-Q3Path -Path $SourceEvidenceDirectory
$destinationRootPath = Resolve-Q3Path -Path $DestinationRoot
$anchorPath = Resolve-Q3Path -Path $DestinationAnchor
if (-not (Test-Path -LiteralPath $anchorPath -PathType Container) -or
    -not (Test-Q3Child -Child $destinationRootPath -Parent $anchorPath) -or
    (Test-Q3Child -Child $destinationRootPath -Parent $repoRoot) -or
    (Test-Q3Child -Child $destinationRootPath -Parent $sourceDirectory) -or
    (Test-Q3Child -Child $sourceDirectory -Parent $destinationRootPath) -or
    $destinationRootPath -ceq $sourceDirectory -or $destinationRootPath -ceq $repoRoot) {
    throw 'evidence_destination_invalid'
}
if ((Test-Q3Child -Child $sourceDirectory -Parent $repoRoot) -and
    -not (Test-Q3Child -Child $sourceDirectory -Parent (Join-Path $repoRoot 'backups'))) {
    throw 'evidence_source_must_be_ignored_or_external'
}
Assert-Q3ExistingPathChain -Path $anchorPath
Assert-Q3ExistingPathChain -Path $destinationRootPath
Assert-Q3ExistingPathChain -Path $sourceDirectory
$attemptPath = Join-Path $destinationRootPath $AttemptId
$stagePath = Join-Path $attemptPath $stage
Assert-Q3ExistingPathChain -Path $stagePath

if ($Prepare) {
    if ($ReviewedCommit -cnotmatch '^[0-9a-f]{40}$' -or (Test-Path -LiteralPath $sourceDirectory)) { throw 'evidence_prepare_intent_invalid' }
    $inputs = @($FreezeEvidenceFile, $FreshBackupFile, $CanonicalPreviewReportFile, $RehearsalProofFile, $RollbackManifestFile)
    if (@($inputs | Where-Object { -not $_ -or -not [IO.Path]::IsPathFullyQualified($_) }).Count -ne 0) {
        throw 'evidence_prepare_input_missing'
    }
    foreach ($inputPath in $inputs) { Assert-Q3ExistingPathChain -Path (Resolve-Q3Path -Path $inputPath) }
    $freeze = Read-Q3JsonFile -Path $FreezeEvidenceFile
    $proof = Read-Q3JsonFile -Path $RehearsalProofFile
    $rollback = Read-Q3JsonFile -Path $RollbackManifestFile
    $preview = Read-Q3JsonFile -Path $CanonicalPreviewReportFile
    $fresh = Get-Item -LiteralPath $FreshBackupFile
    if ($fresh.PSIsContainer -or $fresh.Length -lt 32 -or $preview.contract -cne 'quote-master-settings-backup-preview.v1' -or
        @($preview.preview.blockingErrors).Count -ne 0 -or @($preview.sensitiveFieldPaths).Count -ne 0 -or
        $proof.sourceFileSha256 -cne (Get-Q3Hash -Path $FreshBackupFile) -or
        $preview.sourceHash -cne $proof.sourceHash -or $proof.reviewedCommit -cne $ReviewedCommit -or
        ($preview.preview.projectedServerRows | ConvertTo-Json -Compress) -cne ($proof.projectedCounts | ConvertTo-Json -Compress) -or
        $freeze.expected.gitCommit -cne $ReviewedCommit -or
        $preview.capture.origin -cne $freeze.browserOrigin -or
        $preview.capture.namespace -cne $freeze.namespace -or
        $preview.capture.schemaVersion -ne $freeze.schemaVersion) { throw 'evidence_prepare_source_mismatch' }
    Assert-Q3ArtifactShape -Kind 'freeze_evidence' -Value $freeze
    Assert-Q3ArtifactShape -Kind 'rehearsal_proof' -Value $proof
    Assert-Q3ArtifactShape -Kind 'rollback_manifest' -Value $rollback
    $summary = [ordered]@{
        contract = 'zhixu-q3-source-identity.v1'
        capture = $preview.capture
        bytes = $fresh.Length
        fileSha256 = $proof.sourceFileSha256
        sourceHash = $proof.sourceHash
        projectionContentHash = $proof.projectionContentHash
        projectedCounts = $proof.projectedCounts
        blockingErrors = 0
        warnings = @($preview.preview.warnings).Count
    }
    $parent = [IO.Path]::GetDirectoryName($sourceDirectory)
    if (-not (Test-Path -LiteralPath $parent -PathType Container)) { throw 'evidence_source_parent_missing' }
    New-Item -ItemType Directory -Path $sourceDirectory | Out-Null
    Copy-Q3NewFile -Source $FreezeEvidenceFile -Target (Join-Path $sourceDirectory 'freeze-evidence.json')
    Copy-Q3NewFile -Source $RehearsalProofFile -Target (Join-Path $sourceDirectory 'rehearsal-proof.json')
    Copy-Q3NewFile -Source $RollbackManifestFile -Target (Join-Path $sourceDirectory 'rollback-manifest.json')
    Write-Q3NewJson -Path (Join-Path $sourceDirectory 'source-identity-summary.json') -Value $summary
    $artifacts = @($names.Keys | ForEach-Object {
        $path = Join-Path $sourceDirectory $_
        [ordered]@{ filename = $_; kind = $names[$_]; bytes = (Get-Item -LiteralPath $path).Length; sha256 = Get-Q3Hash -Path $path }
    })
    Write-Q3NewJson -Path (Join-Path $sourceDirectory $manifestName) -Value ([ordered]@{
        contract = $contract; version = 1; attemptId = $AttemptId; createdAt = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
        reviewedCommit = $ReviewedCommit; stage = $stage; artifacts = $artifacts
    })
    $manifestHash = Assert-Q3Bundle -Directory $sourceDirectory -Attempt $AttemptId -Reviewed $ReviewedCommit
    Write-Output "q3_evidence_prepared stage=$stage manifest_sha256=$manifestHash"
    return
}

$sourceManifest = Read-Q3JsonFile -Path (Join-Path $sourceDirectory $manifestName)
$commit = [string]$sourceManifest.reviewedCommit
if ($commit -cnotmatch '^[0-9a-f]{40}$') { throw 'evidence_reviewed_commit_invalid' }
$manifestHash = Assert-Q3Bundle -Directory $sourceDirectory -Attempt $AttemptId -Reviewed $commit
if ($VerifyOnly) {
    if (Test-Path -LiteralPath $stagePath) {
        $destinationHash = Assert-Q3Bundle -Directory $stagePath -Attempt $AttemptId -Reviewed $commit
        if ($destinationHash -cne $manifestHash) { throw 'evidence_destination_manifest_mismatch' }
        Write-Output "q3_evidence_verify_only_ready destination_verified=YES manifest_sha256=$manifestHash"
    } else {
        if (Test-Path -LiteralPath $attemptPath) { throw 'evidence_attempt_directory_already_exists' }
        Write-Output "q3_evidence_verify_only_ready destination_parent_ready=YES destination_attempt_directory_pending=YES manifest_sha256=$manifestHash"
    }
    return
}
if (Test-Path -LiteralPath $attemptPath) { throw 'evidence_attempt_directory_already_exists' }
New-Item -ItemType Directory -Path $destinationRootPath -Force | Out-Null
Assert-Q3ExistingPathChain -Path $destinationRootPath
New-Item -ItemType Directory -Path $attemptPath | Out-Null
New-Item -ItemType Directory -Path $stagePath | Out-Null
$marker = Join-Path $stagePath '.incomplete'
[IO.File]::WriteAllText($marker, 'INCOMPLETE')
foreach ($name in @($names.Keys) + @($manifestName)) {
    $sourcePath = Join-Path $sourceDirectory $name
    $targetPath = Join-Path $stagePath $name
    Copy-Q3NewFile -Source $sourcePath -Target $targetPath
}
$sourceAfter = Assert-Q3Bundle -Directory $sourceDirectory -Attempt $AttemptId -Reviewed $commit
if ($sourceAfter -cne $manifestHash) { throw 'evidence_source_changed_during_copy' }
$destinationHash = Assert-Q3Bundle -Directory $stagePath -Attempt $AttemptId -Reviewed $commit -AllowIncompleteMarker
if ($destinationHash -cne $manifestHash) { throw 'evidence_destination_manifest_mismatch' }
Remove-Item -LiteralPath $marker
$destinationHash = Assert-Q3Bundle -Directory $stagePath -Attempt $AttemptId -Reviewed $commit
if ($destinationHash -cne $manifestHash) { throw 'evidence_destination_manifest_mismatch' }
Write-Output "q3_evidence_copy_verified stage=$stage destination_readback=PASS manifest_sha256=$destinationHash"
