@echo off
setlocal
cd /d "%~dp0"

set "HTML=%CD%\peninsula-tech-logo-lab.html"
if not exist "%HTML%" (
  echo.
  echo [ERROR] No se encontro peninsula-tech-logo-lab.html en:
  echo %CD%
  echo.
  pause
  exit /b 1
)

set "BROWSER="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if not defined BROWSER (
  echo.
  echo [ERROR] No se encontro Google Chrome ni Microsoft Edge.
  echo Abre manualmente este archivo en el navegador:
  echo %HTML%
  echo.
  pause
  exit /b 1
)

set "URL=file:///%HTML:\=/%"
echo Abriendo Peninsula Tech Logo Lab en el navegador...
start "Peninsula Tech Logo Lab" "%BROWSER%" --new-window "%URL%"
exit /b 0
