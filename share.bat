@echo off
title RideSync - phone link
cd /d "%~dp0"
where cloudflared >nul 2>nul || (
  echo.
  echo   Installing Cloudflare's free tunnel tool (one time only^)...
  winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
  echo.
  echo   Installed. Close this window and double-click share.bat again.
  echo.
  pause
  exit /b 0
)
echo.
echo   Make sure RideSync is already running (start.bat).
echo.
echo   In a few seconds a link like  https://something.trycloudflare.com  appears below.
echo   Open that link on any phone (Android or iPhone), on any network.
echo   The link works while this window and start.bat stay open, and changes every time.
echo.
cloudflared tunnel --no-autoupdate --url http://localhost:5173
pause
