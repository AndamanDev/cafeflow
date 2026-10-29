@echo off
rem ================================================================
rem  CafeFlow - ONE file for the shop server. Just double-click.
rem
rem  It checks this machine first:
rem   - CafeFlow installed and ready  -> maintenance menu (ops\tools\menu.js)
rem       arrow keys up/down, Enter, Esc to quit
rem       status - restart - server IP - screens - backup - logs -
rem       update - clear sales data - autostart - DB password - repair
rem   - not installed / half installed -> installs it (asks Windows for
rem       administrator permission by itself - no right-click needed)
rem       Run 1: Git, Node.js, Python 3.11, WSL, Docker Desktop (winget)
rem              + Windows Terminal (optional - Thai text; old console shows boxes)
rem              -> asks you to RESTART if Docker/WSL was just installed
rem       Run 2: downloads CafeFlow, then ops\tools\setup-shop.js does the rest
rem              (database, packages, slip reader, autostart, firewall ...)
rem              and puts a "CafeFlow" shortcut on the desktop
rem   - "cafeflow.bat install" = run the installer again (repair). Safe to
rem       repeat: every step checks first and skips what is already done.
rem
rem  Works on its own (USB stick / downloaded from GitHub) or from inside the repo.
rem  "Ready" = Node.js found + api\node_modules\.cafeflow-lock (written by tools\setup-shop.js).
rem  No labels/goto on purpose: this file may arrive with LF line endings
rem  (raw download from GitHub) and cmd mis-reads labels in LF files.
rem  The installer runs from a copy in %TEMP%: "git pull" may replace this
rem  very file, and cmd reads a .bat line by line while it runs.
rem  (Replaces install-cafeflow.bat - merged here 19/10/2569.)
rem ================================================================
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title CafeFlow

rem ---- where am I / where is CafeFlow ------------------------------
set "SELF=%~dp0"
if /i "%~2"=="--from-temp" set "SELF=%~3"
set "DIR="
if exist "%SELF%tools\menu.js" for %%I in ("%SELF%..") do set "DIR=%%~fI"
if not defined DIR if exist "D:\cafeflow\ops\tools\menu.js" set "DIR=D:\cafeflow"
if not defined DIR if exist "C:\cafeflow\ops\tools\menu.js" set "DIR=C:\cafeflow"

set "READY=0"
if defined DIR if exist "%DIR%\api\node_modules\.cafeflow-lock" (
    where node >nul 2>&1
    if not errorlevel 1 set "READY=1"
)
if /i "%~1"=="install" set "READY=0"

rem ---- ready: open the menu ----------------------------------------
rem  The menu is in Thai. The old console window (Windows 10) has no Thai
rem  font and shows boxes - reopen this file inside Windows Terminal.
rem  Windows 10: "wt" may be installed but its folder missing from PATH -> look there too.
if "%READY%"=="1" if not defined WT_SESSION (
    set "WT="
    where wt >nul 2>&1
    if not errorlevel 1 set "WT=wt"
    if not defined WT if exist "%LOCALAPPDATA%\Microsoft\WindowsApps\wt.exe" set "WT=%LOCALAPPDATA%\Microsoft\WindowsApps\wt.exe"
    if defined WT (
        start "" "!WT!" -w new --title CafeFlow -d "%DIR%" cmd /c "%~f0"
        if not errorlevel 1 exit /b 0
        echo  [x] Windows Terminal did not open - showing the menu in this window.
    )
    echo  Thai text shows as boxes? Install Windows Terminal, then open this file again:
    echo    winget install -e --id Microsoft.WindowsTerminal
    echo  Already installed? Settings ^> Apps ^> App execution aliases ^> turn on Windows Terminal ^(wt.exe^)
    echo.
)
rem  Menu crashed (e.g. broken install) -> keep the window open so the error can be read
if "%READY%"=="1" (
    cd /d "%DIR%"
    node ops\tools\menu.js
    set "RC=!errorlevel!"
    if not "!RC!"=="0" (
        echo.
        echo  [x] The menu stopped with an error ^(code !RC!^) - send the message above to the technician.
        echo      Repair: run "%~f0" install
        echo.
        pause
    )
    exit /b !RC!
)

rem ---- not ready: install / repair ---------------------------------
echo.
echo  ===== CafeFlow installer =====
echo.
if /i not "%~1"=="install" (
    echo  CafeFlow is not installed on this computer yet ^(or not finished^).
    echo  Installing now - you can run this file again any time, finished steps are skipped.
    echo.
)

net session >nul 2>&1
if errorlevel 1 (
    echo  Asking Windows for administrator permission - press "Yes" ...
    powershell -NoProfile -Command "try { Start-Process -FilePath '%~f0' -ArgumentList 'install' -Verb RunAs -ErrorAction Stop } catch { exit 1 }"
    if errorlevel 1 (
        echo.
        echo  [x] Permission was refused - the installer needs "Yes" to install programs.
        echo.
        pause
        exit /b 1
    )
    exit /b 0
)

if /i not "%~2"=="--from-temp" (
    copy /y "%~f0" "%TEMP%\cafeflow-install.bat" >nul
    call "%TEMP%\cafeflow-install.bat" install --from-temp "%~dp0"
    exit /b !errorlevel!
)
title CafeFlow installer

where winget >nul 2>&1
if errorlevel 1 (
    echo  [x] winget not found. Open Microsoft Store, install/update "App Installer",
    echo      then run this file again.
    echo.
    pause
    exit /b 1
)

set "WG=winget install -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity"
set "RESTART=0"

rem ---- 1. Git ------------------------------------------------------
set "GIT=%ProgramFiles%\Git\cmd\git.exe"
if exist "%GIT%" (
    echo  [1/5] Git ............ already installed
) else (
    echo  [1/5] Git ............ installing
    %WG% --id Git.Git --scope machine
    if not exist "%GIT%" (
        echo  [x] Git install failed - check the internet connection and run again.
        pause
        exit /b 1
    )
)

rem ---- 2. Node.js --------------------------------------------------
set "NODE=%ProgramFiles%\nodejs\node.exe"
if exist "%NODE%" (
    echo  [2/5] Node.js ........ already installed
) else (
    echo  [2/5] Node.js ........ installing
    %WG% --id OpenJS.NodeJS.LTS --scope machine
    if not exist "%NODE%" (
        echo  [x] Node.js install failed - check the internet connection and run again.
        pause
        exit /b 1
    )
)

rem ---- 3. Python 3.11 (slip reader needs exactly 3.11) -------------
set "PYOK=0"
py -3.11 -c "import sys" >nul 2>&1
if not errorlevel 1 set "PYOK=1"
if exist "%ProgramFiles%\Python311\python.exe" set "PYOK=1"
if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set "PYOK=1"
if "%PYOK%"=="1" (
    echo  [3/5] Python 3.11 .... already installed
) else (
    echo  [3/5] Python 3.11 .... installing
    %WG% --id Python.Python.3.11 --scope machine
    if not exist "%ProgramFiles%\Python311\python.exe" (
        echo  [x] Python 3.11 install failed - check the internet connection and run again.
        pause
        exit /b 1
    )
)

rem ---- 4. WSL (Docker Desktop runs on it) --------------------------
wsl --status >nul 2>&1
if errorlevel 1 (
    echo  [4/5] WSL ............ installing
    wsl --install --no-distribution
    set "RESTART=1"
) else (
    echo  [4/5] WSL ............ ready
)

rem ---- 5. Docker Desktop (all-users or per-user install) -----------
set "DOCKER_OK=0"
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" set "DOCKER_OK=1"
if exist "%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe" set "DOCKER_OK=1"
if "%DOCKER_OK%"=="1" (
    echo  [5/5] Docker Desktop . already installed
) else (
    echo  [5/5] Docker Desktop . installing - this takes a while
    %WG% --id Docker.DockerDesktop --scope machine
    if not exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
        echo  [x] Docker Desktop install failed - check the internet connection and run again.
        pause
        exit /b 1
    )
    set "RESTART=1"
)

rem ---- extra: Windows Terminal (Thai text in the menu) - not required --
where wt >nul 2>&1
if errorlevel 1 (
    echo  [+]   Windows Terminal installing - so the menu can show Thai text
    winget install -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity --id Microsoft.WindowsTerminal
    if errorlevel 1 echo  [x] Windows Terminal not installed - the menu still works, Thai may show as boxes.
) else (
    echo  [+]   Windows Terminal . already installed
)

if "%RESTART%"=="1" (
    echo.
    echo  ==========================================================
    echo   Programs installed. RESTART the computer now,
    echo   then double-click this file again.
    echo  ==========================================================
    echo.
    pause
    exit /b 0
)

rem ---- CafeFlow folder ---------------------------------------------
rem  1) the repo this file sits in / an existing install (found above)  2) D: if it is a fixed disk, else C:
if not defined DIR if exist "%SELF%..\.git" for %%I in ("%SELF%..") do set "DIR=%%~fI"
if not defined DIR if exist "D:\cafeflow\.git" set "DIR=D:\cafeflow"
if not defined DIR if exist "C:\cafeflow\.git" set "DIR=C:\cafeflow"
if not defined DIR (
    set "DIR=C:\cafeflow"
    fsutil fsinfo drivetype D: 2>nul | find /i "Fixed" >nul
    if not errorlevel 1 set "DIR=D:\cafeflow"
)

if exist "%DIR%\.git" (
    echo.
    echo  CafeFlow folder: %DIR% - getting the latest version
    "%GIT%" -C "%DIR%" pull --ff-only
    if errorlevel 1 echo  [x] Could not update - continuing with the current version.
) else (
    echo.
    echo  Downloading CafeFlow to %DIR%
    "%GIT%" clone https://github.com/AndamanDev/cafeflow.git "%DIR%"
    if not exist "%DIR%\.git" (
        echo  [x] Download failed - check the internet connection and run again.
        pause
        exit /b 1
    )
)

rem  Files created here are owned by Administrators. CafeFlow later runs as the
rem  normal (non-elevated) user, which must be able to write logs\ data\ backup\
icacls "%DIR%" /grant "%USERNAME%":(OI)(CI)M /Q >nul
set "SAFE=%DIR:\=/%"
"%GIT%" config --global --get-all safe.directory 2>nul | find /i "%SAFE%" >nul
if errorlevel 1 "%GIT%" config --global --add safe.directory "%SAFE%"

rem  Freshly installed programs are not on this window's PATH yet
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles%\Git\cmd;%ProgramFiles%\Docker\Docker\resources\bin;%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin;%PATH%"

echo.
"%NODE%" "%DIR%\ops\tools\setup-shop.js"
set "RC=%errorlevel%"

rem  Desktop shortcut for every user -> the menu inside the CafeFlow folder
if "%RC%"=="0" (
    powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('CommonDesktopDirectory')+'\CafeFlow.lnk'); $s.TargetPath='%DIR%\ops\cafeflow.bat'; $s.WorkingDirectory='%DIR%'; $s.Description='CafeFlow menu'; $s.Save()" >nul 2>&1
    echo.
    echo  From now on: double-click "CafeFlow" on the desktop ^(= %DIR%\ops\cafeflow.bat^)
    echo  for every task - status, restart, update, backup ...
)
echo.
pause
exit /b %RC%
