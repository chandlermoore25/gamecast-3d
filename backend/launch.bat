@echo off
REM launch.bat - Windows batch file to start GameCast
title GameCast Launcher

echo ⚾ GameCast Launcher
echo ===============================================

REM Check if we're in the right directory
if not exist "fastapi_app.py" (
    echo ❌ fastapi_app.py not found!
    echo Please run this from your GameCast backend folder
    pause
    exit /b 1
)

echo 📦 Installing/checking dependencies...
python -m pip install fastapi uvicorn requests --quiet

echo 🚀 Starting GameCast backend...
echo Backend will be available at: http://localhost:8000
echo.

REM Start the backend
start "GameCast Backend" cmd /k "python -m uvicorn fastapi_app:app --reload --host 0.0.0.0 --port 8000"

REM Wait a moment for backend to start
timeout /t 3 /nobreak > nul

echo 🌐 Starting frontend server...
REM Start a simple HTTP server for the frontend
start "GameCast Frontend" cmd /k "python -m http.server 8080"

REM Wait a moment for frontend to start
timeout /t 2 /nobreak > nul

echo 🌐 Opening GameCast in browser...
start http://localhost:8080

echo.
echo ✅ GameCast is starting up!
echo ===============================================
echo Backend API: http://localhost:8000
echo Frontend:    http://localhost:8080
echo.
echo Both servers are running in separate windows.
echo Close those windows to stop the servers.
echo ===============================================
pause