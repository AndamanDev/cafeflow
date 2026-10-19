@echo off
rem ================================================================
rem  CafeFlow - update to the newest version (double-click, run on the server)
rem
rem   1. backup the database first (ops\backup.js) - if the update goes wrong, nothing is lost
rem   2. git pull                 - get the new code
rem   3. libraries (npm ci)       - ONLY when api\package-lock.json changed
rem                                 (or a library is missing). The API is
rem                                 STOPPED first: a running API keeps its
rem                                 .node files open and npm ci fails half way
rem                                 with EPERM, leaving node_modules broken.
rem   4. npm run migrate          - new database columns/tables (safe to run again)
rem   5. start the API            - otherwise the OLD code keeps running
rem      (pages open in browsers reload themselves when they see the new version)
rem
rem  Stops at the first step that fails and tells you which one.
rem  Log of the backup: logs\backup.log
rem
rem  Library marker = api\node_modules\.cafeflow-lock (lowercase sha256 of
rem  api\package-lock.json) - same file ops\tools\setup-shop.js writes and checks.
rem  Waits use "ping -n N 127.0.0.1": "timeout" refuses to run when input is redirected.
rem
rem  This file copies itself to %TEMP% and runs from there: "git pull" may
rem  replace this very file, and cmd reads a .bat line by line while it runs.
rem ================================================================
if /I not "%~1"=="--from-temp" (
  copy /y "%~f0" "%TEMP%\cafeflow-update.bat" >nul
  call "%TEMP%\cafeflow-update.bat" --from-temp "%~dp0"
  exit /b
)
chcp 65001 >nul
setlocal
cd /d "%~2..\.."

echo.
echo [1/5] Backing up the database...
node ops\backup.js --reason=update
if errorlevel 1 goto :fail_backup

echo.
echo [2/5] Getting the new code (git pull)...
git pull --ff-only
if errorlevel 1 goto :fail_pull

echo.
echo [3/5] Libraries...
rem reinstall when: the lockfile changed since last time, was never recorded, or a core library is missing (half-done install)
set "NEED_NPM="
powershell -NoProfile -Command ^
  "$h=(Get-FileHash 'api\package-lock.json' -Algorithm SHA256).Hash; $f='api\node_modules\.cafeflow-lock'; $old=''; if (Test-Path $f) { $old=(Get-Content $f -Raw).Trim() }; if ($h -ne $old -or -not (Test-Path 'api\node_modules\pg\package.json') -or -not (Test-Path 'api\node_modules\fastify\package.json')) { exit 1 } else { exit 0 }"
if errorlevel 1 set "NEED_NPM=1"
if not defined NEED_NPM (
  echo     No library changes - skipped.
  goto :migrate
)

echo     Stopping the API first (it locks library files while running)...
call :stop_api
pushd api
call npm ci --no-audit --no-fund
if errorlevel 1 (
  echo     Retrying once in 5 seconds - antivirus may still be scanning the files...
  ping -n 6 127.0.0.1 >nul
  call npm ci --no-audit --no-fund
)
popd
rem npm's errorlevel on Windows is not reliable - check the core libraries really load
node -e "require('./api/node_modules/pg'); require('./api/node_modules/fastify')" 2>nul
if errorlevel 1 goto :fail_npm
powershell -NoProfile -Command ^
  "(Get-FileHash 'api\package-lock.json' -Algorithm SHA256).Hash.ToLower() | Set-Content -NoNewline -Encoding ascii 'api\node_modules\.cafeflow-lock'"

:migrate
echo.
echo [4/5] Updating the database (npm run migrate)...
pushd api
call npm run migrate
if errorlevel 1 ( popd & goto :fail_migrate )
popd

echo.
echo [5/5] Starting the API with the new code...
call :stop_api
schtasks /Run /TN CafeFlow >nul 2>&1
if errorlevel 1 (
  start "" /min powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%CD%\ops\run-cafeflow.ps1"
)
powershell -NoProfile -Command ^
  "$t=(Get-Date).AddSeconds(60); do { try { if ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 http://127.0.0.1:8080/api/health).StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep 2 } while ((Get-Date) -lt $t); exit 1"
if errorlevel 1 goto :fail_start

echo.
echo  ======================================================
echo   OK - CafeFlow is updated and running the new version.
echo  ======================================================
goto :end

:stop_api
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-NetTCPConnection -LocalPort 8080,5101 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
ping -n 4 127.0.0.1 >nul
exit /b 0

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
echo  !! Installing libraries failed - THE API IS STOPPED.
echo     1. Check the internet connection
echo     2. Close any window/editor open inside D:\cafeflow\api
echo     3. Run this file again
echo     Still failing? Pause the antivirus for 10 minutes and run again.
goto :end
:fail_migrate
echo.
echo  !! Database update failed - send a photo of the lines above to the technician.
echo     Backup is in backup\
goto :end
:fail_start
echo.
echo  !! The API did not come back. Open logs\api.err.log and logs\start.log
echo     and send a photo of the last lines to the technician.
goto :end

:end
echo.
pause
