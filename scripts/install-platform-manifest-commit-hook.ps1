# Install a versioned, read-only post-commit manifest updater on this laptop.
# No branch, remote, production or Git tracked file is modified by the hook.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$hook = Join-Path $root '.githooks\post-commit'
if (!(Test-Path -LiteralPath $hook -PathType Leaf)) { throw 'V142_MANIFEST_HOOK_MISSING' }
$existing = (& git -C $root config --local --get core.hooksPath 2>$null)
if ($LASTEXITCODE -notin @(0,1)) { throw 'V142_GIT_CONFIG_UNAVAILABLE' }
if ($existing -and $existing.Trim() -ne '.githooks') { throw ('V142_EXISTING_HOOKS_PATH_PRESERVED: ' + $existing) }
& git -C $root config --local core.hooksPath '.githooks'
if ($LASTEXITCODE -ne 0) { throw 'V142_HOOK_INSTALL_FAILED' }
Write-Output 'V142_MANIFEST_POST_COMMIT_INSTALLED: .githooks'
Write-Output 'Automatically records commits outside Git; evidence and production status require separate verification.'
