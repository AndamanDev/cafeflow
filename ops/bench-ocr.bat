@echo off
rem ================================================================
rem  CafeFlow - measure how fast this machine reads slips (double-click)
rem
rem  Compares the slip reader the shop uses now (Paddle) with the faster
rem  test engine (OpenVINO) on this machine's own slips (data\slips,
rem  newest 15). Shows seconds per slip and whether both read the same
rem  amount / date / receiver account. Nothing in the shop is changed.
rem
rem   - Run when there are no customers: it uses the whole CPU for a few minutes.
rem   - First run needs internet: installs OpenVINO into ocr-svc\.venv-ov
rem     (~200 MB, separate from the shop's slip reader).
rem   - Take a photo of the result screen and send it to the technician.
rem ================================================================
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
if not exist logs mkdir logs

if not exist "ocr-svc\.venv\Scripts\python.exe" (
  echo.
  echo  !! The slip reader is not installed on this machine - run ocr-svc\setup.bat first.
  goto :end
)

echo.
echo [1/3] OpenVINO test engine...
if exist "ocr-svc\.venv-ov\Scripts\python.exe" (
  echo     Already installed - skipped.
) else (
  echo     Installing - needs internet, 3-10 minutes...
  call ocr-svc\setup-openvino.bat --no-pause
)

set PYTHONIOENCODING=utf-8
set PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True
del /q logs\bench-paddle.json logs\bench-openvino.json 2>nul

echo.
echo [2/3] Current slip reader (Paddle)...
ocr-svc\.venv\Scripts\python.exe ocr-svc\bench\bench.py paddle logs\bench-paddle.json 2>logs\bench-paddle.err.log

echo.
echo [3/3] OpenVINO...
if exist "ocr-svc\.venv-ov\Scripts\python.exe" (
  ocr-svc\.venv-ov\Scripts\python.exe ocr-svc\bench\bench.py openvino logs\bench-openvino.json 2>logs\bench-openvino.err.log
)

node ocr-svc\bench\compare.js logs\bench-paddle.json logs\bench-openvino.json
if not exist logs\bench-openvino.json (
  echo  OpenVINO did not run - see logs\bench-openvino.err.log
)

:end
echo.
pause
