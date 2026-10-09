# Windows-only hidden input wrapper. No database, COS or Docker mutation here.
[CmdletBinding()]
param([switch]$PrepareOnly, [switch]$LibraryOnly)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
Set-StrictMode -Version Latest

function Assert-NoReparsePath([string]$Path) {
    $cursor = [IO.Path]::GetFullPath($Path)
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'unsafe_path' }
        }
        $parent = [IO.Path]::GetDirectoryName($cursor)
        if ($parent -eq $cursor) { break }
        $cursor = $parent
    }
}
function Assert-PrivateDirectory([string]$Path) {
    Assert-NoReparsePath $Path
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $acl = Get-Acl -LiteralPath $Path
    if (-not $acl.AreAccessRulesProtected) { throw 'private_acl_required' }
    foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
        if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin @($sid, 'S-1-5-18')) { throw 'private_acl_required' }
    }
}
function New-PrivateDirectory([string]$Path) {
    Assert-NoReparsePath $Path
    if (Test-Path -LiteralPath $Path) { throw 'target_exists' }
    [void][IO.Directory]::CreateDirectory($Path)
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl.SetOwner($sid)
    foreach ($identity in @($sid, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
        $rule = [Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $Path -AclObject $acl
    Assert-PrivateDirectory $Path
}
function Write-NewPrivateText([string]$Path, [string]$Text) {
    Assert-NoReparsePath $Path
    # Child folders inherit the protected root; locate and verify that root.
    $parent = [IO.Path]::GetDirectoryName($Path)
    while (-not (Get-Acl -LiteralPath $parent).AreAccessRulesProtected) {
        $parent = [IO.Path]::GetDirectoryName($parent)
        if (-not $parent) { throw 'private_acl_required' }
    }
    Assert-PrivateDirectory $parent
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes($Text)
    $stream = [IO.FileStream]::new($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose(); [Array]::Clear($bytes) }
}
function Assert-HiddenValues([string]$Id, [string]$Key, [string]$Admin, [string]$Viewer) {
    if ($Id -notmatch '^[\x21-\x7e]{1,4096}$' -or $Key -notmatch '^[\x21-\x7e]{1,4096}$') { throw 'credential_format_invalid' }
    # One-line ASCII config representation; existing bootstrap minimum is 12.
    if ($Admin -notmatch '^[\x21-\x7e]{12,256}$' -or $Viewer -notmatch '^[\x21-\x7e]{12,256}$') { throw 'password_format_invalid' }
}
function Read-HiddenValue([string]$Prompt) {
    $secure = Read-Host $Prompt -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $secure.Dispose() }
}
function Save-TrialInputs([string]$Root, [string]$Id, [string]$Key, [string]$Admin, [string]$Viewer, [string]$Template) {
    Assert-PrivateDirectory $Root
    Assert-HiddenValues $Id $Key $Admin $Viewer
    $paths = @('secrets/cos-id', 'secrets/cos-key', 'secrets/viewer-password', 'trial.conf', 'inputs-ready.json')
    foreach ($relative in $paths) { if (Test-Path -LiteralPath (Join-Path $Root $relative)) { throw 'inputs_already_exist' } }
    if ($Template -notmatch '(?m)^TRIAL_DB_PASSWORD=@DB_PASSWORD@$' -or $Template -notmatch '(?m)^TRIAL_ADMIN_PASSWORD=@ADMIN_PASSWORD@$') { throw 'template_invalid' }
    $random = [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    $dbPassword = [Convert]::ToHexString($random).ToLowerInvariant()
    [Array]::Clear($random)
    $config = $Template.Replace('@DB_PASSWORD@', $dbPassword).Replace('@ADMIN_PASSWORD@', $Admin)
    Write-NewPrivateText (Join-Path $Root $paths[0]) ($Id + "`n")
    Write-NewPrivateText (Join-Path $Root $paths[1]) ($Key + "`n")
    Write-NewPrivateText (Join-Path $Root $paths[2]) ($Viewer + "`n")
    Write-NewPrivateText (Join-Path $Root $paths[3]) $config
    # This receipt never contains credentials, hashes of credentials, or false live/CAM claims.
    Write-NewPrivateText (Join-Path $Root $paths[4]) '{"result":"INPUTS_SAVED","linuxPermissionsVerified":false,"offlineLoaderVerified":false,"databaseContacted":false,"networkContacted":false}'
    $dbPassword = $null; $config = $null
}
function New-LocalhostCertificate([string]$Root) {
    $rsa = [Security.Cryptography.RSA]::Create(2048)
    try {
        $req = [Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=Zhixu Quote Trial win01 localhost', $rsa, [Security.Cryptography.HashAlgorithmName]::SHA256, [Security.Cryptography.RSASignaturePadding]::Pkcs1)
        $san = [Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
        $san.AddDnsName('localhost'); $san.AddIpAddress([Net.IPAddress]::Parse('127.0.0.1'))
        $req.CertificateExtensions.Add($san.Build())
        $req.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false, $false, 0, $true))
        $req.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new([Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature -bor [Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyEncipherment, $true))
        $oids = [Security.Cryptography.OidCollection]::new()
        [void]$oids.Add([Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.1'))
        $req.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($oids, $true))
        $cert = $req.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-5), [DateTimeOffset]::UtcNow.AddDays(30))
        try {
            Write-NewPrivateText (Join-Path $Root 'tls/cert.pem') $cert.ExportCertificatePem()
            Write-NewPrivateText (Join-Path $Root 'tls/key.pem') $rsa.ExportPkcs8PrivateKeyPem()
            return @{ sha256 = $cert.GetCertHashString([Security.Cryptography.HashAlgorithmName]::SHA256); expiresUtc = $cert.NotAfter.ToUniversalTime().ToString('o'); scope = 'CurrentUser only'; subject = $cert.Subject }
        } finally { $cert.Dispose() }
    } finally { $rsa.Dispose() }
}
if ($LibraryOnly) { return }

try {
    if (-not $IsWindows -or $PSVersionTable.PSVersion.Major -lt 7) { throw 'windows_powershell_7_required' }
    $root = 'D:\zhixu-local-trial\win01'
    if ($PrepareOnly) {
        # Run only from the standard checkout, not from another historical checkout.
        $repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
        if ($repo -ne 'D:\workspace\zhixu-ainuoke-api') { throw 'standard_checkout_required' }
        $base = 'cc3c450562e692b696024558706954816227cb8a'
        $reviewed = '1e71d773c2d578029f42267b16999167b393c49f'
        $image = 'zhixu-quote-trial:9ee254db89c6'
        $imageId = 'sha256:c496a93c3f895448f65b3ede533105dc832c6be8ec61682badece39cb32a3d57'
        $project = 'zhixu-quote-trial-win01'
        if ((& git -C $repo rev-parse HEAD) -ne $base) { throw 'baseline_mismatch' }
        if (& git -C $repo diff $reviewed $base -- ops/quote-trial) { throw 'reviewed_ops_mismatch' }
        if (& git -C $repo diff --name-only $base -- ops/quote-trial Backup-Zhixu.ps1 scripts/database-target-guard.ps1) { throw 'reviewed_ops_mismatch' }
        $context = & docker context show
        $endpoint = & docker context inspect $context --format '{{.Endpoints.docker.Host}}'
        if ($context -ne 'desktop-linux' -or $endpoint -ne 'npipe:////./pipe/dockerDesktopLinuxEngine') { throw 'local_docker_required' }
        if ((& docker image inspect --format '{{.Id}}' $image) -ne $imageId) { throw 'image_identity_mismatch' }
        if (& docker ps -a --filter "label=com.docker.compose.project=$project" --format '{{.ID}}') { throw 'project_exists' }
        foreach ($name in @('data', 'secrets', 'tls')) {
            if ((& docker volume ls --format '{{.Name}}') -contains "${project}_$name") { throw 'volume_exists' }
        }
        if ((& docker network ls --format '{{.Name}}') -contains "${project}_default") { throw 'network_exists' }
        if (Get-NetTCPConnection -LocalPort 18443 -ErrorAction SilentlyContinue) { throw 'port_in_use' }
        New-PrivateDirectory $root
        foreach ($dir in @('tools/ops/quote-trial', 'tools/scripts', 'secrets', 'tls', 'object-backup')) { [void][IO.Directory]::CreateDirectory((Join-Path $root $dir)) }
        $files = @(& git -C $repo ls-tree -r --name-only $base ops/quote-trial) + @('Backup-Zhixu.ps1', 'scripts/database-target-guard.ps1')
        $hashes = [ordered]@{}
        foreach ($file in $files) {
            Copy-Item -LiteralPath (Join-Path $repo $file) -Destination (Join-Path $root "tools/$file")
            $hashes[$file] = (Get-FileHash -LiteralPath (Join-Path $root "tools/$file") -Algorithm SHA256).Hash.ToLowerInvariant()
        }
        Copy-Item -LiteralPath $PSCommandPath -Destination (Join-Path $root 'tools/ops/quote-trial/windows-setup.ps1')
        $hashes['ops/quote-trial/windows-setup.ps1'] = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
        $cert = New-LocalhostCertificate $root
        $manifest = [ordered]@{ project = $project; root = $root; origin = 'https://localhost:18443'; database = 'quote_trial'; databaseVolume = "${project}_data"; network = "${project}_default"; secretsVolume = "${project}_secrets"; tlsVolume = "${project}_tls"; image = $image; imageId = $imageId; appSource = '9ee254db89c6b02dbbb95e7a4b3d7c7e02763f23'; opsSource = $reviewed; mergedBase = $base; files = $hashes; certificate = $cert }
        Write-NewPrivateText (Join-Path $root 'target.json') ($manifest | ConvertTo-Json -Depth 8)
        $portable = $root.Replace('\', '/')
        Write-NewPrivateText (Join-Path $root 'trial.template') @"
TRIAL_PROJECT=$project
TRIAL_PORT=18443
TRIAL_IMAGE=$image
TRIAL_COMMIT=$($manifest.appSource)
TRIAL_BUILD_ID=quote-trial-20261009
TRIAL_BUILD_TIME=2026-10-09T03:00:00Z
TRIAL_HTTPS_ORIGIN=$($manifest.origin)
TRIAL_DB_PASSWORD=@DB_PASSWORD@
TRIAL_ADMIN_USERNAME=trial-admin
TRIAL_ADMIN_PASSWORD=@ADMIN_PASSWORD@
TRIAL_S3_ENDPOINT=https://cos.ap-hongkong.myqcloud.com
TRIAL_S3_REGION=ap-hongkong
TRIAL_S3_BUCKET=weaveops-prod-1501437430
TRIAL_S3_PATH_STYLE=false
TRIAL_SECRET_ID_FILE=$portable/secrets/cos-id
TRIAL_SECRET_KEY_FILE=$portable/secrets/cos-key
TRIAL_TLS_CERT_FILE=$portable/tls/cert.pem
TRIAL_TLS_KEY_FILE=$portable/tls/key.pem
TRIAL_COMPOSE_OVERRIDE=$portable/windows.compose.yml
TRIAL_OBJECT_BUNDLE_DIR=$portable/object-backup
"@
        # Dedicated Linux-owned volumes; the gateway cannot read COS credentials.
        Write-NewPrivateText (Join-Path $root 'windows.compose.yml') @"
services:
  app:
    volumes: !override
      - secrets:/run/secrets:ro
      - ./object-bundle.mjs:/trial/object-bundle.mjs:ro
      - `${TRIAL_OBJECT_BUNDLE_DIR:?explicit protected bundle directory required}:/bundle
  gateway:
    volumes: !override
      - ./tls-gateway.mjs:/trial/tls-gateway.mjs:ro
      - ./gateway-health.mjs:/trial/gateway-health.mjs:ro
      - ./readiness.mjs:/trial/readiness.mjs:ro
      - tls:/run/tls:ro
volumes:
  secrets:
  tls:
"@
        # Bind paths in the override are relative to the first (snapshotted) Compose file.
        Write-Output ($manifest | ConvertTo-Json -Depth 8 -Compress)
    } else {
        Assert-PrivateDirectory $root
        foreach ($relative in @('secrets/cos-id', 'secrets/cos-key', 'secrets/viewer-password', 'trial.conf', 'inputs-ready.json')) {
            if (Test-Path -LiteralPath (Join-Path $root $relative)) { throw 'inputs_already_exist' }
        }
        $manifest = Get-Content -LiteralPath (Join-Path $root 'target.json') -Raw | ConvertFrom-Json
        if ($manifest.root -ne $root -or $manifest.project -ne 'zhixu-quote-trial-win01') { throw 'target_mismatch' }
        foreach ($field in $manifest.files.PSObject.Properties) {
            if ((Get-FileHash -LiteralPath (Join-Path $root "tools/$($field.Name)") -Algorithm SHA256).Hash.ToLowerInvariant() -ne $field.Value) { throw 'snapshot_mismatch' }
        }
        $certificate = [Security.Cryptography.X509Certificates.X509Certificate2]::CreateFromPem([IO.File]::ReadAllText((Join-Path $root 'tls/cert.pem')))
        try {
            if ($certificate.GetCertHashString([Security.Cryptography.HashAlgorithmName]::SHA256) -ne $manifest.certificate.sha256 -or $certificate.NotAfter -le [DateTime]::Now) { throw 'certificate_mismatch' }
            Write-Host "Localhost Quote Trial only. Trust scope: CurrentUser Root (NOT LocalMachine)."
            Write-Host "Public certificate SHA-256: $($manifest.certificate.sha256)"
            Write-Host "Expires (UTC): $($manifest.certificate.expiresUtc)"
            if ((Read-Host 'To approve this trust type TRUST LOCALHOST') -cne 'TRUST LOCALHOST') { throw 'trust_not_confirmed' }
            $store = [Security.Cryptography.X509Certificates.X509Store]::new('Root', 'CurrentUser')
            try { $store.Open([Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite); $store.Add($certificate) } finally { $store.Close() }
        } finally { $certificate.Dispose() }
        $id = Read-HiddenValue 'COS SecretId (hidden)'
        $key = Read-HiddenValue 'COS SecretKey (hidden)'
        $admin = Read-HiddenValue 'New trial-admin password (hidden, 12+ one-line ASCII characters)'
        $viewer = Read-HiddenValue 'New trial-viewer password (hidden, 12+ one-line ASCII characters)'
        try { Save-TrialInputs $root $id $key $admin $viewer ([IO.File]::ReadAllText((Join-Path $root 'trial.template'))) }
        finally { $id = $null; $key = $null; $admin = $null; $viewer = $null }
        Write-Output '{"result":"INPUTS_SAVED","scope":"new win01 target only","databaseContacted":false,"networkContacted":false}'
    }
} catch {
    # Never print raw exceptions, input values, environment, or credential hashes.
    $safe = @('unsafe_path', 'private_acl_required', 'target_exists', 'credential_format_invalid', 'password_format_invalid', 'inputs_already_exist', 'template_invalid', 'windows_powershell_7_required', 'standard_checkout_required', 'baseline_mismatch', 'reviewed_ops_mismatch', 'local_docker_required', 'image_identity_mismatch', 'project_exists', 'volume_exists', 'network_exists', 'port_in_use', 'target_mismatch', 'snapshot_mismatch', 'certificate_mismatch', 'trust_not_confirmed')
    $code = if ($_.Exception.Message -in $safe) { $_.Exception.Message } else { 'setup_failed_review_private_target' }
    Write-Output (@{ result = 'FAIL'; code = $code } | ConvertTo-Json -Compress)
    exit 1
}
