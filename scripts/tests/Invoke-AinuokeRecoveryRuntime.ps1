#requires -Version 7.2
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{40}$')][string]$SourceSha,
    [string]$Image = 'codex-recovery-e2e:local',
    [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
if (-not $SkipBuild) {
    docker build -f scripts/tests/recovery-runtime.Dockerfile --build-arg "SOURCE_SHA=$SourceSha" -t $Image .
    if ($LASTEXITCODE -ne 0) { throw 'recovery_test_build_failed' }
}
$taskImage = (docker image inspect $Image --format '{{.Id}}').Trim()
if ($LASTEXITCODE -ne 0) { throw 'recovery_test_image_missing' }
$taskVolume = 'codex-recovery-test-' + [guid]::NewGuid().ToString('N').Substring(0,12)
docker volume create --label io.weaveops.recovery-test=true $taskVolume | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'recovery_test_volume_failed' }
$taskMount = (docker volume inspect $taskVolume --format '{{.Mountpoint}}').Trim()
$taskExit = 1
try {
    docker run --rm --network bridge --mount 'type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock' --mount "type=volume,src=$taskVolume,dst=$taskMount" -e "RECOVERY_TEST_IMAGE=$taskImage" -e "RECOVERY_TEST_SOURCE=$SourceSha" -e "RECOVERY_TEST_ROOT=$taskMount" --entrypoint python3 $taskImage scripts/tests/test_ainuoke_recovery_runtime.py -v
    $taskExit = $LASTEXITCODE
} finally {
    $taskLabel = docker volume inspect $taskVolume --format '{{index .Labels "io.weaveops.recovery-test"}}'
    if ($LASTEXITCODE -eq 0 -and $taskLabel.Trim() -eq 'true') { docker volume rm $taskVolume | Out-Null }
}
exit $taskExit
