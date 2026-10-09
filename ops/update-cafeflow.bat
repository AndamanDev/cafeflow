@echo off
rem ================================================================
rem  CafeFlow - update to the newest version (double-click, run on the server)
rem
rem   1. backup the database first (ops\backup.js) - if the update goes wrong, nothing is lost
rem   2. git pull                 - get the new code
rem   3. npm ci (in api\)         - libraries the new code needs
rem   4. npm run migrate          - new database columns/tables (safe to run again)
rem   5. restart the API          - otherwise the OLD code keeps running
rem      (pages open in browsers reload themselves when they see the new version)
rem
rem  Stops at the first step that fails and tells you which one.
rem  Log of the backup: logs\backup.log
rem ================================================================
chcp 65001 >nul
setlocal
cd /d "%~dp0.."

echo.
echo [1/5] Backing up the database...
node ops\backup.js --reason=update
if errorlevel 1 goto :fail_backup

echo.
echo [2/5] Getting the new code (git pull)...
git pull --ff-only
if errorlevel 1 goto :fail_pull

echo.
echo [3/5] Installing libraries (npm ci)...
pushd api
call npm ci --no-audit --no-fund
if errorlevel 1 ( popd & goto :fail_npm )

echo.
echo [4/5] Updating the database (npm run migrate)...
call npm run migrate
if errorlevel 1 ( popd & goto :fail_migrate )
popd

echo.
echo [5/5] Restarting the API...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
timeout /t 2 /nobreak >nul
schtasks /Run /TN CafeFlow >nul 2>&1
if errorlevel 1 (
  start "" /min powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0run-cafeflow.ps1"
)
powershell -NoProfile -Command ^
  "$t=(Get-Date).AddSeconds(60); do { try { if ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 http://127.0.0.1:8080/api/health).StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep 2 } while ((Get-Date) -lt $t); exit 1"
if errorlevel 1 goto :fail_start

echo.
echo  ======================================================
echo   OK - CafeFlow is updated and running the new version.
echo  ======================================================
goto :end

:fail_backup
echo.
echo  !! Backup failed - update stopped (nothing was changed).
echo     Is Docker Desktop running? See logs\backup.log
goto :end
:fail_pull
echo.
echo  !! git pull failed - update stopped. Files were changed by hand on this machine?
echo     Send a photo of the lines above to the technician.
goto :end
:fail_npm
echo.
echo  !! npm ci failed - check the internet connection, then run this file again.
goto :end
:fail_migrate
echo.
echo  !! Database update failed - the API was NOT restarted (old version still running).
echo     Send a photo of the lines above to the technician. Backup is in backup\
goto :end
:fail_start
echo.
echo  !! The API did not come back. Open logs\api.err.log and logs\start.log
echo     and send a photo of the last lines to the technician.
goto :end

:end
echo.
pause
