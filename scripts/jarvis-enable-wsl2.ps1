# One-time administrator setup. DOES NOT reboot, stop services, or install Ubuntu.
# Run manually in elevated PowerShell after saving Jarvis work and ensuring access.
#Requires -RunAsAdministrator
$ErrorActionPreference="Stop"
$before=@{}
foreach($port in @(5000,3344,11434)){
 $l=Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
 $before[$port]=$l.OwningProcess
}
Write-Output "JARVIS_WSL_SETUP_ADMIN=True"
foreach($port in @(5000,3344,11434)){
 Write-Output ("BEFORE_PORT_"+$port+"="+$before[$port])
}
Write-Output "WSL_INSTALL_NO_DISTRIBUTION_START"
& "$env:SystemRoot\System32\wsl.exe" --install --no-distribution
$exitCode=$LASTEXITCODE
Write-Output ("WSL_INSTALL_EXIT="+$exitCode)
Write-Output "NO_REBOOT_PERFORMED_BY_THIS_SCRIPT"
Write-Output "NEXT: review whether Windows requests a reboot; schedule it yourself after stopping Jarvis safely."
Write-Output "NEXT: reopen PowerShell and verify wsl --version, wsl --status."
Write-Output "NEXT: install Docker Desktop per-user with WSL 2 backend and pull node:24-alpine."
if($exitCode -ne 0){exit $exitCode}
