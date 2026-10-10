@echo off
title RideSync - Ola Maps
cd /d "%~dp0"
echo.
echo   Running from: %CD%
if /i not "%CD%"=="%USERPROFILE%\SB-PROJECT" (
  echo   WARNING: this is NOT the main copy. Use the one in %USERPROFILE%\SB-PROJECT
)
node scripts\ola.mjs
pause
