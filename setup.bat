@echo off
title RideSync setup
cd /d "%~dp0"
if not exist node_modules call npm install
call npm run setup
pause
