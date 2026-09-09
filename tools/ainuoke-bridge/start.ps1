param(
  [string]$AinuokeBaseUrl = $(if ($env:ZHIXU_AINUOKE_BASE_URL) { $env:ZHIXU_AINUOKE_BASE_URL } else { "http://61.164.81.194:9043" }),
  [string]$AinuokeReportPath = $(if ($env:ZHIXU_AINUOKE_REPORT_PATH) { $env:ZHIXU_AINUOKE_REPORT_PATH } else { "/kaijin/report/report/getReportObjAndData" }),
  [ValidateSet("127.0.0.1", "::1")]
  [string]$BindHost = "127.0.0.1",
  [int]$Port = 8765
)

$ErrorActionPreference = "Stop"
$bridgeRoot = $PSScriptRoot
$previousPythonPath = $env:PYTHONPATH
try {
  $env:PYTHONPATH = if ($previousPythonPath) { "$bridgeRoot;$previousPythonPath" } else { $bridgeRoot }
  python -m ainuoke_bridge --host $BindHost --port $Port --ainuoke-base-url $AinuokeBaseUrl --ainuoke-report-path $AinuokeReportPath
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  $env:PYTHONPATH = $previousPythonPath
}
