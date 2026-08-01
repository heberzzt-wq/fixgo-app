@echo off
setlocal
cd /d "%~dp0"

if not exist "peninsula-tech-logo-lab.html" (
  echo.
  echo [ERROR] No se encontro peninsula-tech-logo-lab.html en:
  echo %CD%
  echo.
  pause
  exit /b 1
)

echo Abriendo Peninsula Tech Logo Lab...
start "" "peninsula-tech-logo-lab.html"
exit /b 0
