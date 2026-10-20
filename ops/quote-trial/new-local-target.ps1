# Creates private inputs only. No containers, databases, trust-store or existing files changed.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Root,
    [Parameter(Mandatory)][string]$Project,
    [Parameter(Mandatory)][int]$Port,
    [Parameter(Mandatory)][string]$Image,
    [Parameter(Mandatory)][string]$Commit,
    [Parameter(Mandatory)][string]$BuildId,
    [Parameter(Mandatory)][string]$BuildTime,
    [switch]$Execute
)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'windows_private_acl_required' }
if (-not [IO.Path]::IsPathFullyQualified($Root) -or $Project -notmatch '^zhixu-quote-trial-[a-z0-9-]{3,40}$' -or
    $Port -lt 1024 -or $Port -gt 65535 -or $Port -in @(3000, 3001, 3002, 50426) -or $Commit -cnotmatch '^[0-9a-f]{40}$') { throw 'explicit_new_target_required' }
foreach ($value in @($Root, $Image, $BuildId, $BuildTime)) { if ($value -match '[\r\n]' -or -not $value) { throw 'single_line_inputs_required' } }
if (Test-Path -LiteralPath $Root) { throw 'new_private_directory_required' }
if (-not $Execute) { [ordered]@{ operation = 'PREPARE_ONLY'; project = $Project; port = $Port; writes = 0 } | ConvertTo-Json -Compress; return }
. (Join-Path $PSScriptRoot 'windows-setup.ps1') -LibraryOnly
New-PrivateDirectory $Root
[void][IO.Directory]::CreateDirectory((Join-Path $Root 'secrets'))
[void][IO.Directory]::CreateDirectory((Join-Path $Root 'tls'))
[void][IO.Directory]::CreateDirectory((Join-Path $Root 'bundle'))
function New-PrivateRandom { [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24)).ToLowerInvariant() }
Write-NewPrivateText (Join-Path $Root 'secrets/cos-id') ('local' + (New-PrivateRandom).Substring(0, 16))
Write-NewPrivateText (Join-Path $Root 'secrets/cos-key') (New-PrivateRandom)
$admin = New-PrivateRandom
Write-NewPrivateText (Join-Path $Root 'secrets/admin-password') $admin
$rsa = [Security.Cryptography.RSA]::Create(2048)
try {
    $request = [Security.Cryptography.X509Certificates.CertificateRequest]::new("CN=$Project", $rsa, [Security.Cryptography.HashAlgorithmName]::SHA256, [Security.Cryptography.RSASignaturePadding]::Pkcs1)
    $san = [Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
    $san.AddDnsName('localhost'); $san.AddDnsName('objects-tls'); $san.AddIpAddress([Net.IPAddress]::Parse('127.0.0.1'))
    $request.CertificateExtensions.Add($san.Build())
    $certificate = $request.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-5), [DateTimeOffset]::UtcNow.AddDays(90))
    try {
        Write-NewPrivateText (Join-Path $Root 'tls/cert.pem') $certificate.ExportCertificatePem()
        Write-NewPrivateText (Join-Path $Root 'tls/key.pem') $rsa.ExportPkcs8PrivateKeyPem()
        $expires = $certificate.NotAfter.ToUniversalTime().ToString('o')
    } finally { $certificate.Dispose() }
} finally { $rsa.Dispose() }
$slash = [IO.Path]::GetFullPath($Root).Replace('\', '/')
$config = [ordered]@{
    TRIAL_PROJECT = $Project; TRIAL_PORT = $Port; TRIAL_IMAGE = $Image; TRIAL_COMMIT = $Commit
    TRIAL_BUILD_ID = $BuildId; TRIAL_BUILD_TIME = $BuildTime; TRIAL_HTTPS_ORIGIN = "https://localhost:$Port"
    TRIAL_DB_PASSWORD = (New-PrivateRandom); TRIAL_ADMIN_USERNAME = 'local.admin'; TRIAL_ADMIN_PASSWORD = $admin
    TRIAL_LOCAL_OBJECTS = 'true'; TRIAL_S3_ENDPOINT = 'https://objects-tls:8443'; TRIAL_S3_REGION = 'us-east-1'
    TRIAL_S3_BUCKET = 'zhixu-local-attachments'; TRIAL_S3_PATH_STYLE = 'true'
    TRIAL_SECRET_ID_FILE = "$slash/secrets/cos-id"; TRIAL_SECRET_KEY_FILE = "$slash/secrets/cos-key"
    TRIAL_TLS_CERT_FILE = "$slash/tls/cert.pem"; TRIAL_TLS_CA_FILE = "$slash/tls/cert.pem"; TRIAL_TLS_KEY_FILE = "$slash/tls/key.pem"
    TRIAL_COMPOSE_OVERRIDE = (Join-Path $PSScriptRoot 'objects.compose.yml').Replace('\', '/')
    TRIAL_OBJECT_BUNDLE_DIR = "$slash/bundle"
}
Write-NewPrivateText (Join-Path $Root 'trial.conf') (($config.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "`n")
$receipt = [ordered]@{ contract = 'zhixu-persistent-local-target.v1'; project = $Project; port = $Port; sourceSha = $Commit; image = $Image; certificateExpiresAt = $expires; databaseContacted = $false; systemTrustChanged = $false }
Write-NewPrivateText (Join-Path $Root 'prepared.json') ($receipt | ConvertTo-Json)
$admin = $null; $config = $null
$receipt | ConvertTo-Json -Compress
