@echo off
setlocal EnableExtensions EnableDelayedExpansion
rem ================================================================
rem  CafeFlow - open a shop screen in Edge (run on that screen's machine)
rem
rem    screen-edge.bat                 menu: pick kiosk / cashier / kitchen / queue display
rem    screen-edge.bat display         open the queue display straight away
rem    screen-edge.bat kds             kitchen screen        (also: kiosk, cashier)
rem    screen-edge.bat ip              change the server address
rem    screen-edge.bat monitor         forget which monitor each screen opens on (asks again)
rem    screen-edge.bat display autostart   also open this screen every time Windows starts
rem    screen-edge.bat kiosk shortcut      also put a Desktop icon (Thai name) that opens this
rem                                        screen - shop staff use that, not this file or the menu
rem
rem  PC with 2+ monitors (e.g. cashier in front, kiosk facing customers): asked once
rem  per screen which monitor to use, then remembered (CafeFlowScreen\monitor-<screen>.txt).
rem  A kiosk-mode window cannot be dragged, so it is placed with --window-position.
rem
rem  Server address: on the server PC itself -> localhost, never asked.
rem  Other machines: asked the first time, then remembered on THIS machine
rem  (%LOCALAPPDATA%\CafeFlowScreen\server.txt). Find it on the server PC:
rem  Dashboard > gear menu > "Devices on the network" (top box).
rem  If the server's IP changes (router gave it a new one), run "screen-edge.bat ip".
rem
rem  Why the flags:
rem   --autoplay-policy=no-user-gesture-required
rem        Browsers block sound until someone taps the page, and forget it on every
rem        reload / update / power cut. A TV on the wall has nobody to tap it.
rem        With this flag the queue display, kitchen and cashier beep by themselves.
rem   --unsafely-treat-insecure-origin-as-secure
rem        Camera (slip scanning) only works on https - trust *only* the shop server.
rem   --use-fake-ui-for-media-stream   grant the camera without a click (kiosk)
rem   --kiosk-printing                 queue ticket straight to the default printer (kiosk)
rem   --user-data-dir                  separate profile per screen (flags need it,
rem                                    and staff logins stay out of the kiosk)
rem ================================================================
chcp 65001 >nul
set "EDGE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" ( echo  [x] Microsoft Edge not found & pause & exit /b 1 )

set "CFG_DIR=%LOCALAPPDATA%\CafeFlowScreen"
set "CFG=%CFG_DIR%\server.txt"
if not exist "%CFG_DIR%" mkdir "%CFG_DIR%"

set "ROLE=%~1"
if /i "%ROLE%"=="ip" ( call :ask_ip & exit /b 0 )
if /i "%ROLE%"=="monitor" ( call :forget_monitor & exit /b 0 )

rem ---- server address -----------------------------------------------
rem  This machine IS the server (API answers on localhost) -> use it, nothing to ask.
rem  Otherwise the remembered address, or ask.
set "SERVER="
curl -s -f -m 2 -o nul http://localhost:8080/api/health >nul 2>&1
if not errorlevel 1 set "SERVER=http://localhost:8080"
if "%SERVER%"=="" if exist "%CFG%" set /p SERVER=<"%CFG%"
if "%SERVER%"=="" call :ask_ip
if "%SERVER%"=="" exit /b 1

rem ---- which screen ------------------------------------------------
set "PAGE="
if "%ROLE%"=="" (
  echo.
  echo  CafeFlow - which screen is this machine?   server: %SERVER%
  echo    1  Kiosk           ^(customers order^)
  echo    2  Cashier
  echo    3  Kitchen ^(KDS^)
  echo    4  Queue display   ^(TV^)
  echo    8  Change which monitor each screen opens on
  echo    9  Change server address
  set /p PICK=  Choose 1-4:
  if "!PICK!"=="1" set "ROLE=kiosk"
  if "!PICK!"=="2" set "ROLE=cashier"
  if "!PICK!"=="3" set "ROLE=kds"
  if "!PICK!"=="4" set "ROLE=display"
  if "!PICK!"=="8" ( call :forget_monitor & exit /b 0 )
  if "!PICK!"=="9" ( call :ask_ip & exit /b 0 )
)
if /i "%ROLE%"=="kiosk"   set "PAGE=kiosk.html"
if /i "%ROLE%"=="cashier" set "PAGE=cashier.html"
if /i "%ROLE%"=="kds"     set "PAGE=kds.html"
if /i "%ROLE%"=="display" set "PAGE=display.html"
if "%PAGE%"=="" ( echo  [x] Unknown screen "%ROLE%" - use kiosk, cashier, kds or display & pause & exit /b 1 )

rem ---- can we reach the server? (warn, still open - it may be booting) ----
curl -s -m 4 -o nul "%SERVER%/api/health" >nul 2>&1
if errorlevel 1 (
  echo.
  echo  [x] Cannot reach %SERVER%
  echo     Is the server PC on, and is this machine on the shop Wi-Fi?
  echo     If the server's IP changed: run "screen-edge.bat ip"
  echo     ^(see Dashboard ^> gear ^> Devices on the network on the server PC^)
  echo     Opening anyway - the page keeps retrying by itself.
  timeout /t 6 >nul
)

rem ---- autostart: a tiny .cmd in this user's Startup folder -----------
if /i "%~2"=="autostart" (
  set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
  > "!STARTUP!\CafeFlow-%ROLE%.cmd" echo @call "%~f0" %ROLE%
  echo  Autostart set: !STARTUP!\CafeFlow-%ROLE%.cmd
  echo  ^(some antivirus removes Startup items - if it does not open after reboot, add it again^)
)

rem ---- which monitor (only asked on a PC with more than one) -----------
set "POS="
call :pick_monitor

rem ---- shortcut: after the monitor is chosen, so the icon never has to ask ----
if /i "%~2"=="shortcut" call :make_shortcut "%~f0"

set "COMMON=--no-first-run --autoplay-policy=no-user-gesture-required --user-data-dir="%LOCALAPPDATA%\CafeFlow-%ROLE%" --unsafely-treat-insecure-origin-as-secure=%SERVER%"
if defined POS set "COMMON=%COMMON% --window-position=%POS%"

if /i "%ROLE%"=="kiosk" (
  start "" "%EDGE%" --kiosk "%SERVER%/app/%PAGE%" --edge-kiosk-type=fullscreen %COMMON% --use-fake-ui-for-media-stream --kiosk-printing
) else if /i "%ROLE%"=="cashier" (
  rem cashier moves between pages (cashier / closing / orders) - a normal app window, maximised
  start "" "%EDGE%" --app="%SERVER%/app/%PAGE%" --start-maximized %COMMON% --use-fake-ui-for-media-stream
) else (
  start "" "%EDGE%" --kiosk "%SERVER%/app/%PAGE%" --edge-kiosk-type=fullscreen %COMMON%
)
exit /b 0

rem ================================================================
:pick_monitor
rem  One line per monitor: number X Y width height main(1/0) - Windows' own order
rem  (Join, not '{0} {1} ...' -f - that format string makes powershell.exe hang when run from cmd)
set "MONS=%CFG_DIR%\monitors.txt"
powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $i=0; foreach($s in [System.Windows.Forms.Screen]::AllScreens){ $i++; $b=$s.Bounds; [string]::Join(' ', @($i,$b.X,$b.Y,$b.Width,$b.Height,[int]$s.Primary)) }" <nul > "%MONS%" 2>nul
set "NMON=0"
for /f %%a in ('type "%MONS%"') do set /a NMON+=1
if %NMON% LSS 2 exit /b 0

set "MONCFG=%CFG_DIR%\monitor-%ROLE%.txt"
set "MON="
if exist "%MONCFG%" set /p MON=<"%MONCFG%"
if not defined MON (
  echo.
  echo  This PC has %NMON% monitors - which one shows the %ROLE% screen?
  for /f "tokens=1-6" %%a in ('type "%MONS%"') do (
    if "%%f"=="1" ( echo    %%a  %%dx%%e  ^(main monitor^) ) else ( echo    %%a  %%dx%%e )
  )
  set /p MON=  Choose 1-%NMON%:
  > "%MONCFG%" echo !MON!
)
rem  A point just inside that monitor - Edge then goes full screen on the monitor it is on
for /f "tokens=1-3" %%a in ('type "%MONS%"') do if "%%a"=="!MON!" (
  set /a PX=%%b+100, PY=%%c+100
  set "POS=!PX!,!PY!"
)
rem  Monitor unplugged / wrong number -> open on the main monitor. Not asked again here:
rem  the Desktop icon runs minimised, a question would sit unseen. Change: "screen-edge.bat monitor"
if not defined POS echo  [!] Monitor !MON! not found - opening on the main monitor ^(change: screen-edge.bat monitor^)
exit /b 0

:make_shortcut
rem  Thai names as character codes - Thai typed into a .bat breaks on some Windows 10 code pages.
rem  Minimised window: the icon just opens the screen, no black window in the way.
set "SC_SELF=%~1"
set "SC_ROLE=%ROLE%"
powershell -NoProfile -Command "$th=@{ kiosk=@(0xE15,0xE39,0xE49,0xE2A,0xE31,0xE48,0xE07,0xE2D,0xE32,0xE2B,0xE32,0xE23); cashier=@(0xE41,0xE04,0xE0A,0xE40,0xE0A,0xE35,0xE22,0xE23,0xE4C); kds=@(0xE08,0xE2D,0xE04,0xE23,0xE31,0xE27); display=@(0xE08,0xE2D,0xE40,0xE23,0xE35,0xE22,0xE01,0xE04,0xE34,0xE27) }; $r=$env:SC_ROLE.ToLower(); $name='CafeFlow ' + (-join ($th[$r] | ForEach-Object { [char]$_ })); $lnk=Join-Path ([Environment]::GetFolderPath('Desktop')) ($name + '.lnk'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut($lnk); $s.TargetPath=$env:SC_SELF; $s.Arguments=$r; $s.WorkingDirectory=(Split-Path $env:SC_SELF); $s.IconLocation=$env:EDGE + ',0'; $s.WindowStyle=7; $s.Description='CafeFlow ' + $r; $s.Save(); Write-Output $lnk" <nul > "%CFG_DIR%\shortcut.txt" 2>&1
if errorlevel 1 (
  echo  [x] Could not create the Desktop icon:
  type "%CFG_DIR%\shortcut.txt"
  timeout /t 6 >nul
  exit /b 0
)
echo  Desktop icon created - staff double-click it to open the %ROLE% screen.
echo  ^(it points to this file: %~1 - keep the file where it is^)
exit /b 0

:forget_monitor
del /q "%CFG_DIR%\monitor-*.txt" 2>nul
echo  Monitor choice cleared - each screen asks again the next time it opens.
exit /b 0

rem ================================================================
:ask_ip
echo.
echo  Server address - find it on the server PC: Dashboard ^> gear ^> "Devices on the network"
echo  Type the IP (e.g. 192.168.1.103) or the full address (http://192.168.1.103:8080)
set "IN="
set /p IN=  Server:
if "%IN%"=="" exit /b 0
set "IN=%IN: =%"
echo %IN% | findstr /b /i "http" >nul
if errorlevel 1 (
  echo %IN% | findstr ":" >nul
  if errorlevel 1 ( set "IN=http://%IN%:8080" ) else ( set "IN=http://%IN%" )
)
if "%IN:~-1%"=="/" set "IN=%IN:~0,-1%"
> "%CFG%" echo %IN%
set "SERVER=%IN%"
echo  Saved: %SERVER%
exit /b 0
