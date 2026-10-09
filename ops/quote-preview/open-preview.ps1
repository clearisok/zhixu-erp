param([string]$Root = 'D:\zhixu-local-preview\d099-18444')
$ErrorActionPreference = 'Stop'
if ([IO.Path]::GetFullPath($Root) -ne 'D:\zhixu-local-preview\d099-18444') { throw 'Unknown Preview root' }
$identity = Get-Content -LiteralPath (Join-Path $Root 'identity.json') -Raw | ConvertFrom-Json
if ($identity.project -ne 'zhixu-preview-d099-18444' -or $identity.origin -ne 'https://localhost:18444') { throw 'Preview identity mismatch' }
if (-not $identity.certificateSpki) { throw 'Missing pinned Preview certificate' }
Start-Process -FilePath 'C:\Program Files\Google\Chrome\Application\chrome.exe' -ArgumentList @('--no-first-run','--no-default-browser-check',"--user-data-dir=$Root\user-profile", "--ignore-certificate-errors-spki-list=$($identity.certificateSpki)", "$($identity.origin)/quote-center") -WindowStyle Normal
