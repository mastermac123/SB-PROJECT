@echo off
title RideSync setup
cd /d "%~dp0"
echo.
echo   Running from: %CD%
if /i not "%CD%"=="%USERPROFILE%\SB-PROJECT" (
  echo   WARNING: this is NOT the main copy. Use the one in %USERPROFILE%\SB-PROJECT
  echo   and delete or rename this older folder, or your settings and updates will not match.
)
if not exist node_modules call npm install
call npm run setup
pause
