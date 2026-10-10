@echo off
title RideSync Admin
cd /d "%~dp0"
echo.
echo   Opening the RideSync admin dashboard...
rem Start RideSync in its own window if it isn't running yet.
netstat -ano | findstr /R /C:":5173 .*LISTENING" >nul
if errorlevel 1 (
  echo   RideSync isn't running - starting it in a new window. Keep that window open.
  start "RideSync AI" cmd /k start.bat
  echo   Waiting for it to be ready...
  for /l %%i in (1,1,60) do (
    timeout /t 2 /nobreak >nul
    netstat -ano | findstr /R /C:":5173 .*LISTENING" >nul && goto ready
  )
  echo   RideSync is taking long to start. Check the other window for errors.
  pause
  exit /b 1
)
:ready
start "" http://localhost:5173/admin
echo   Done. Sign in with your admin email (Gmail) in the browser.
timeout /t 4 >nul
