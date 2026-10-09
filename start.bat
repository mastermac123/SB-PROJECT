@echo off
title RideSync AI
cd /d "%~dp0"
where node >nul 2>nul || (echo. & echo   Node.js is not installed. Get the LTS version from https://nodejs.org & echo. & pause & exit /b 1)
if not exist node_modules (
  echo Installing RideSync for the first time. This takes a minute...
  call npm install || (pause & exit /b 1)
)
echo.
echo   RideSync is starting at http://localhost:5173
echo   Login codes appear in THIS window until email is set up.
echo   Keep this window open. Press Ctrl+C to stop.
echo.
call npm run dev
pause
