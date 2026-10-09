@echo off
rem ================================================================
rem  CafeFlow - restart the API so new code takes effect
rem
rem  Use after "git pull" / copying new code. Without this the running
rem  API keeps the OLD code (new buttons answer "Route ... not found").
rem  Pages already open in browsers reload by themselves.
rem
rem  1. stop the program listening on port 8080 (the API)
rem  2. run the CafeFlow startup task again (it starts only what is down)
rem  3. wait until http://127.0.0.1:8080/api/health answers
rem ================================================================
chcp 65001 >nul
echo Stopping CafeFlow API (port 8080)...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
timeout /t 2 /nobreak >nul

echo Starting CafeFlow again...
schtasks /Run /TN CafeFlow >nul 2>&1
if errorlevel 1 (
  rem no autostart task on this machine - run the startup script directly
  start "" /min powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0run-cafeflow.ps1"
)

echo Waiting for the API (up to 60 seconds)...
powershell -NoProfile -Command ^
  "$t=(Get-Date).AddSeconds(60); do { try { if ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 http://127.0.0.1:8080/api/health).StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep 2 } while ((Get-Date) -lt $t); exit 1"
if errorlevel 1 (
  echo.
  echo  !! API did not come back. Open logs\api.err.log and logs\start.log
  echo     and send a photo of the last lines to the technician.
) else (
  echo.
  echo  OK - CafeFlow API restarted with the new code.
)
echo.
pause
