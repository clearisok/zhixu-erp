$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

$openAiDrizzleCache = Join-Path $projectRoot 'dist\.openai\drizzle'
if (Test-Path -LiteralPath $openAiDrizzleCache) {
    try {
        Remove-Item -LiteralPath $openAiDrizzleCache -Recurse -Force -ErrorAction Stop
    } catch {
        Write-Warning "Unable to clear $openAiDrizzleCache. Build will continue and may still succeed."
    }
}

$buildStartedAt = Get-Date
& npm.cmd run build
$buildExitCode = $LASTEXITCODE

$indexPath = Join-Path $projectRoot 'dist\client\index.html'
if (-not (Test-Path -LiteralPath $indexPath)) {
    Write-Error 'Build failed: dist\client\index.html was not generated.'
    exit $(if ($buildExitCode -ne 0) { $buildExitCode } else { 1 })
}

$indexFile = Get-Item -LiteralPath $indexPath
$indexHtml = Get-Content -Raw -Encoding UTF8 -LiteralPath $indexPath
$isCurrentBuild = $indexFile.LastWriteTime -ge $buildStartedAt.AddSeconds(-3)
$hasExpectedTitle = $indexHtml.Contains('ZHIXU')

if (-not $isCurrentBuild -or -not $hasExpectedTitle) {
    Write-Error 'Build output validation failed. Check the build log above.'
    exit $(if ($buildExitCode -ne 0) { $buildExitCode } else { 1 })
}

if ($buildExitCode -ne 0) {
    Write-Warning 'Fresh build output was generated and validated. The vinext Windows shutdown error was ignored.'
}

Write-Host 'Local site generated: dist\client\index.html' -ForegroundColor Green
exit 0
