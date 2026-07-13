@echo off
setlocal

set "FIREBASE_CLI=%APPDATA%\npm\firebase.cmd"

if not exist "%FIREBASE_CLI%" (
    echo Firebase CLI no esta instalada en %%APPDATA%%\npm. 1>&2
    exit /b 9009
)

call "%FIREBASE_CLI%" %*
exit /b %ERRORLEVEL%
