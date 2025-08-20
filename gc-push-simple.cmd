@echo on
setlocal enabledelayedexpansion

rem === CONFIG ===
set BRANCH=main
set "REMOTE=https://github.com/chandlermoore25/gamecast-3d.git"
set "MSG=auto: GameCast update %DATE% %TIME%"

rem === MOVE TO SCRIPT FOLDER (YOUR REPO ROOT) ===
cd /d "%~dp0"

echo [gc] start in "%cd%"

where git >nul 2>nul
if errorlevel 1 (
    echo [gc][error] git not found. Install Git for Windows: https://git-scm.com/download/win
    pause
    exit /b 1
)

rem === INIT IF NEEDED ===
git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
    echo [gc] not inside a git repo -> initializing
    git init -b %BRANCH% || (git init && git checkout -B %BRANCH%)
    git remote add origin "%REMOTE%" 2>nul
)

rem === ENSURE BRANCH ===
git checkout %BRANCH% || git checkout -B %BRANCH%

rem === FETCH & PULL (REBASING) ===
git fetch origin || echo [gc][warn] fetch failed (continuing)
git pull --rebase origin %BRANCH%
if errorlevel 1 (
    echo [gc][warn] pull --rebase failed, attempting stash/retry
    git stash push -u -k -m "auto: pre-pull stash" >nul 2>nul
    git pull --rebase origin %BRANCH%
    if not errorlevel 1 (
        git stash pop >nul 2>nul
    ) else (
        echo [gc][warn] pull still failed; continuing with local-first push
    )
)

rem === ADD/COMMIT/PUSH ===
git add -A
git diff --cached --quiet
if %errorlevel%==0 (
    echo [gc] nothing to commit  pushing to sync
    git push -u origin %BRANCH%
) else (
    git commit -m "%MSG%"
    git push -u origin %BRANCH%
)

echo [gc] done.
pause
