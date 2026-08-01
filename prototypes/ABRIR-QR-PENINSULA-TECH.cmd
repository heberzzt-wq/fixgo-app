@echo off
setlocal
cd /d "%~dp0.."
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File ".\prototypes\ABRIR-QR-PENINSULA-TECH.ps1"
if errorlevel 1 (
  echo.
  echo No se pudo crear o abrir el QR.
  echo Revisa el mensaje mostrado arriba.
  pause
)
endlocal
