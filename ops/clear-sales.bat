@echo off
rem ================================================================
rem  CafeFlow - clear ALL sales data before opening the shop for real
rem
rem  DELETES : every order, payment, slip image, shift (round),
rem            queue numbers, print jobs and the activity log
rem  KEEPS   : menu, categories, prices, options, users, devices
rem            (pairing stays), printers and all settings
rem
rem  Steps:
rem   1. show how many rows will be deleted (nothing deleted yet)
rem   2. ask you to type YES
rem   3. back up the database first (backup\cafeflow-*.dump)
rem   4. delete
rem  Undo = restore that backup file. There is no other way back.
rem
rem  After clearing: refresh the cashier / kiosk / kitchen / queue
rem  screens, then press "Open shift" on the closing page before the
rem  kiosk takes orders again.
rem ================================================================
chcp 65001 >nul
cd /d "%~dp0.."

echo.
echo  CafeFlow - CLEAR ALL SALES DATA
echo  ------------------------------
node api\src\db\clear-transactions.js --quiet-hint || goto :fail
echo.
echo  Menu, prices, users, devices, printers and settings are KEPT.
echo  Everything listed above will be DELETED.
echo.
set "ANS="
set /p ANS= Type YES to back up and delete (anything else = cancel): 
if /I not "%ANS%"=="YES" goto :cancel

echo.
echo [1/2] Backing up the database...
node ops\backup.js --reason=before-clear || goto :fail
echo.
echo [2/2] Clearing...
node api\src\db\clear-transactions.js --yes || goto :fail
echo.
echo  DONE. Refresh all screens, then open a new shift on the closing page.
echo.
pause
exit /b 0

:cancel
echo.
echo  Cancelled - nothing was deleted.
echo.
pause
exit /b 0

:fail
echo.
echo  FAILED - see the message above. If the backup step failed, nothing was deleted.
echo.
pause
exit /b 1
