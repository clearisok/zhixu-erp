param(
  [string]$AinuokeBaseUrl = $env:ZHIXU_AINUOKE_BASE_URL,
  [string]$AinuokeReportPath = $env:ZHIXU_AINUOKE_REPORT_PATH,
  [ValidateSet("127.0.0.1", "::1")]
  [string]$BindHost = "127.0.0.1",
  [int]$Port = 8765
)

$ErrorActionPreference = "Stop"
if (-not $AinuokeBaseUrl -or -not $AinuokeReportPath) {
  throw "Provide -AinuokeBaseUrl and -AinuokeReportPath, or set them in the current process environment."
}

$bridgeRoot = $PSScriptRoot
$previousPythonPath = $env:PYTHONPATH
try {
  $env:PYTHONPATH = if ($previousPythonPath) { "$bridgeRoot;$previousPythonPath" } else { $bridgeRoot }
  python -m ainuoke_bridge --host $BindHost --port $Port --ainuoke-base-url $AinuokeBaseUrl --ainuoke-report-path $AinuokeReportPath
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  $env:PYTHONPATH = $previousPythonPath
}
