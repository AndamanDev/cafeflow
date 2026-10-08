@echo off
rem ================================================================
rem  CafeFlow - one-click installer for the shop server.
rem
rem  Right-click -> "Run as administrator". Safe to run again and again:
rem  every step checks first and skips what is already done.
rem    Run 1: installs Git, Node.js, Python 3.11, Docker Desktop (winget)
rem           -> asks you to RESTART if Docker/WSL was just installed
rem    Run 2: downloads CafeFlow, then ops\setup-shop.js does the rest
rem           (database, packages, slip reader, autostart, firewall ...)
rem
rem  Works on its own (USB stick / downloaded) or from inside the repo.
rem  No labels/goto on purpose: this file may arrive with LF line endings
rem  (raw download from GitHub) and cmd mis-reads labels in LF files.
rem ================================================================
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title CafeFlow installer
echo.
echo  ===== CafeFlow installer =====
echo.

net session >nul 2>&1
if errorlevel 1 (
    echo  [!] Please right-click this file and choose "Run as administrator".
    echo.
    pause
    exit /b 1
)

where winget >nul 2>&1
if errorlevel 1 (
    echo  [!] winget not found. Open Microsoft Store, install/update "App Installer",
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
        echo  [!] Git install failed - check the internet connection and run again.
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
        echo  [!] Node.js install failed - check the internet connection and run again.
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
        echo  [!] Python 3.11 install failed - check the internet connection and run again.
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
        echo  [!] Docker Desktop install failed - check the internet connection and run again.
        pause
        exit /b 1
    )
    set "RESTART=1"
)

if "%RESTART%"=="1" (
    echo.
    echo  ==========================================================
    echo   Programs installed. RESTART the computer now,
    echo   then run this file again ^(Run as administrator^).
    echo  ==========================================================
    echo.
    pause
    exit /b 0
)

rem ---- CafeFlow folder ---------------------------------------------
rem  1) the repo this file sits in  2) an existing install  3) D: if it is a fixed disk, else C:
set "DIR="
if exist "%~dp0..\.git" for %%I in ("%~dp0..") do set "DIR=%%~fI"
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
    if errorlevel 1 echo  [!] Could not update - continuing with the current version.
) else (
    echo.
    echo  Downloading CafeFlow to %DIR%
    "%GIT%" clone https://github.com/AndamanDev/cafeflow.git "%DIR%"
    if not exist "%DIR%\.git" (
        echo  [!] Download failed - check the internet connection and run again.
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
"%NODE%" "%DIR%\ops\setup-shop.js"
set "RC=%errorlevel%"
echo.
pause
exit /b %RC%
