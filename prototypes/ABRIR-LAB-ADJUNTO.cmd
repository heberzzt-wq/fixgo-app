@echo off
setlocal
cd /d "%~dp0.."
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File ".\prototypes\ABRIR-QR-PENINSULA-TECH.ps1" -TargetPath "prototypes/adjunto-logo-lab.html" -Title "ADJUNTO LAB" -PublicTunnel
if errorlevel 1 (
  echo.
  echo No se pudo abrir el laboratorio movil de ADJUNTO.
  echo Revisa el mensaje mostrado arriba.
  pause
)
endlocal
