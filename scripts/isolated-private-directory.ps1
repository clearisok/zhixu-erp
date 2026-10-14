#requires -Version 7.2
param([Parameter(Mandatory)][string]$Directory,[switch]$Create)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../outputs'))
$target=[IO.Path]::GetFullPath($Directory)
if(-not $target.StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetDirectoryName($target) -ne $root -or [IO.Path]::GetFileName($target) -notmatch '^isolated-private-[0-9a-f-]{36}$'){throw 'private_directory_scope_invalid'}
if((Get-Item -LiteralPath (Split-Path $root) -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'private_parent_link'}
if($Create){if(Test-Path -LiteralPath $target){throw 'new_private_directory_required'};if(-not(Test-Path -LiteralPath $root)){[IO.Directory]::CreateDirectory($root)|Out-Null};if((Get-Item -LiteralPath $root -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'private_parent_link'};[IO.Directory]::CreateDirectory($target)|Out-Null;$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;& icacls $target /inheritance:r /grant:r ('*'+$sid+':(OI)(CI)F') '*S-1-5-18:(OI)(CI)F' 1>$null 2>$null;if($LASTEXITCODE -ne 0){throw 'private_acl_setup_failed'}}
& (Join-Path $PSScriptRoot 'ainuoke-live-preflight.ps1') -ValidateOnly -PrivateDirectory $target
if($LASTEXITCODE -ne 0){throw 'private_acl_invalid'}
foreach($file in Get-ChildItem -LiteralPath $target -Force){if($file.PSIsContainer){throw 'private_nested_directory_not_expected'};& (Join-Path $PSScriptRoot 'ainuoke-live-preflight.ps1') -ValidateOnly -PrivateDirectory $target -PrivateFile $file.FullName;if($LASTEXITCODE -ne 0){throw 'private_file_acl_invalid'}}
& git -C (Split-Path $PSScriptRoot) check-ignore --quiet -- $target
if($LASTEXITCODE -ne 0){throw 'private_directory_not_ignored'}