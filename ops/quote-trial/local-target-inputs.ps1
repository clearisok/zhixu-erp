# Private input implementation shared by the guarded entry points. Importing this
# library performs no writes. It is not a standalone execution/approval command.
. (Join-Path $PSScriptRoot 'windows-setup.ps1') -LibraryOnly
function New-LocalTargetInputs {
    param([string]$Root, [string]$Project, [int]$Port, [string]$Image,
        [string]$Commit, [string]$BuildId, [string]$BuildTime,
        [string]$OpsRoot = $PSScriptRoot, [string[]]$Subnets = @())
    if (-not $IsWindows -or -not [IO.Path]::IsPathFullyQualified($Root) -or
        $Project -notmatch '^zhixu-quote-trial-[a-z0-9-]{3,40}$' -or $Port -lt 1024 -or $Port -gt 65535 -or
        $Port -in @(3000,3001,3002) -or $Commit -cnotmatch '^[0-9a-f]{40}$') { throw 'explicit_new_target_required' }
    foreach ($value in @($Root,$Image,$BuildId,$BuildTime,$OpsRoot)) { if (-not $value -or $value -match '[\r\n]') { throw 'single_line_inputs_required' } }
    if ($Subnets.Count -and ($Subnets.Count -ne 2 -or $Subnets[0] -eq $Subnets[1] -or @($Subnets | Where-Object { $_ -notmatch '^\d{1,3}(\.\d{1,3}){3}/28$' }).Count)) { throw 'two_validated_subnets_required' }
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
        TRIAL_COMPOSE_OVERRIDE = (Join-Path $OpsRoot 'objects.compose.yml').Replace('\', '/')
        TRIAL_OBJECT_BUNDLE_DIR = "$slash/bundle"
    }
    if ($Subnets.Count) {
        if ($Subnets.Count -ne 2 -or $Subnets[0] -eq $Subnets[1] -or @($Subnets | Where-Object { $_ -notmatch '^\d{1,3}(\.\d{1,3}){3}/28$' }).Count) { throw 'two_validated_subnets_required' }
        $override = [IO.File]::ReadAllText((Join-Path $OpsRoot 'objects.compose.yml'))
        if ($override -match '(?m)^networks\s*:') { throw 'original_network_override_forbidden' }
        $override += "`nnetworks:`n  default:`n    ipam:`n      config:`n        - subnet: $($Subnets[0])`n  ingress:`n    ipam:`n      config:`n        - subnet: $($Subnets[1])`n"
        Write-NewPrivateText (Join-Path $Root 'networks.compose.yml') $override
        $config.TRIAL_COMPOSE_OVERRIDE = "$slash/networks.compose.yml"
    }
    Write-NewPrivateText (Join-Path $Root 'trial.conf') (($config.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "`n")
    $receipt = [ordered]@{ contract = 'zhixu-persistent-local-target.v1'; project = $Project; port = $Port; sourceSha = $Commit; image = $Image; certificateExpiresAt = $expires; databaseContacted = $false; systemTrustChanged = $false }
    Write-NewPrivateText (Join-Path $Root 'prepared.json') ($receipt | ConvertTo-Json)
    $admin = $null; $config = $null
    $receipt
}
