@echo off
rem ================================================================
rem  CafeFlow - install the FAST slip reader engine (OpenVINO).
rem  Same OCR models, ~3x faster on Intel CPUs (i3-6100U: 3.3s -> 1.0s per slip).
rem  Run ONCE while the machine has internet (~200 MB). Safe to run again.
rem  Afterwards ops\tools\restart-api.bat (or a reboot) switches the reader to it.
rem  Without this the shop keeps the normal engine (.venv) - still works.
rem  Needs Python 3.11 (same as setup.bat).
rem ================================================================
setlocal
pushd "%~dp0"
if not exist ".venv-ov\Scripts\python.exe" (
  py -3.11 -m venv .venv-ov || goto :fail
)
.venv-ov\Scripts\python.exe -m pip install -q --upgrade pip || goto :fail
.venv-ov\Scripts\python.exe -m pip install -q -r requirements-openvino.txt || goto :fail
rem first start downloads RapidOCR's own default files once - do it now while online
set CF_OCR_ENGINE=openvino
set PYTHONIOENCODING=utf-8
.venv-ov\Scripts\python.exe server.py --warmup || goto :fail
echo.
echo Done. Run ops\tools\restart-api.bat to start using the fast engine.
popd
if /I not "%~1"=="--no-pause" pause
exit /b 0
:fail
echo.
echo OPENVINO SETUP FAILED - the shop keeps the normal slip reader. Check the internet and run again.
popd
if /I not "%~1"=="--no-pause" pause
exit /b 1
