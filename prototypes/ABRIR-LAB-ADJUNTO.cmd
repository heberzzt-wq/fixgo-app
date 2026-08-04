@echo off
setlocal
cd /d "%~dp0"

set "HTML=%CD%\adjunto-logo-lab.html"
if not exist "%HTML%" (
  echo.
  echo [ERROR] No se encontro adjunto-logo-lab.html en:
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
echo Abriendo ADJUNTO Logo Lab en el navegador...
start "ADJUNTO Logo Lab" "%BROWSER%" --new-window "%URL%"
exit /b 0
