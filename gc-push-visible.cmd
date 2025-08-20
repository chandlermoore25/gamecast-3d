@echo off
setlocal
set SCRIPT=%~dp0gc-push.ps1
if not exist "%SCRIPT%" (
  echo [gc-push-visible] Could not find gc-push.ps1 next to this file.
  pause
  exit /b 1
)
echo Launching PowerShell and keeping window open...
powershell -NoExit -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
echo.
echo (If the window stayed open, logs are above. A transcript log file was written as gc-push_YYYYMMDD_HHMMSS.log)
pause
