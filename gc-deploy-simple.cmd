@echo on
setlocal

set BRANCH=main
set "MSG=deploy: manual trigger"

cd /d "%~dp0"
where git >nul 2>nul
if errorlevel 1 (
    echo [gc][error] git not found. Install Git for Windows: https://git-scm.com/download/win
    pause
    exit /b 1
)

git checkout %BRANCH% || git checkout -B %BRANCH%
git commit --allow-empty -m "%MSG%"
git push -u origin %BRANCH%

echo [gc] deploy triggered.
pause
