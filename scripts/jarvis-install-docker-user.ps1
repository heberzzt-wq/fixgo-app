# Docker Desktop per-user installation after one-time elevated WSL 2 setup.
# Does not reboot, modify production, pull runtime images, or open public ports.
$ErrorActionPreference="Stop"
& "$env:SystemRoot\System32\wsl.exe" --version 1>$null 2>$null
if($LASTEXITCODE -ne 0){throw "WSL2_NOT_READY: Run jarvis-enable-wsl2.ps1 as administrator, then reboot manually if requested"}
$exe=Get-Command winget.exe -ErrorAction SilentlyContinue
if(!$exe){throw "WINGET_UNAVAILABLE"}
Write-Output "INSTALLING_DOCKER_DESKTOP_PER_USER"
& winget.exe install --id Docker.DockerDesktop --exact --source winget --scope user --accept-source-agreements --accept-package-agreements --disable-interactivity
if($LASTEXITCODE -ne 0){throw "DOCKER_INSTALL_FAILED_EXIT_$LASTEXITCODE"}
Write-Output "DOCKER_INSTALLED_OR_ALREADY_PRESENT"
Write-Output "NEXT: Start Docker Desktop in Linux containers / WSL 2 mode."
Write-Output "NEXT: Verify docker info and run docker pull node:24-alpine."
Write-Output "NEXT: Run the verified isolated patch probe with a real mission receipt."
Write-Output "NO_REBOOT_OR_CONTAINER_START_PERFORMED"
