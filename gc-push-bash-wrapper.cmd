@echo off
setlocal
set HERE=%~dp0
rem Try Git Bash first
for %%G in ("C:\Program Files\Git\bin\bash.exe" "C:\Program Files\Git\usr\bin\bash.exe" "%ProgramFiles%\Git\bin\bash.exe") do (
  if exist %%G set BASH=%%G
)
if "%BASH%"=="" (
  echo [gc-bash] Could not find Git Bash. Install Git for Windows: https://git-scm.com/download/win
  pause
  exit /b 1
)
"%BASH%" "%HERE%gc-push.sh" -m "auto: update"
echo.
echo Done. Press any key to close.
pause
