@echo off
rem ================================================================
rem  CafeFlow - install the slip reader (OCR). Run ONCE on the shop server,
rem  while it still has internet: it downloads Python packages (~900 MB)
rem  and the OCR models. After this the reader works fully offline.
rem  Needs Python 3.11 (python.org, tick "Add to PATH").
rem ================================================================
cd /d "%~dp0"
py -3.11 -m venv .venv || goto :fail
.venv\Scripts\python.exe -m pip install --upgrade pip || goto :fail
.venv\Scripts\python.exe -m pip install -r requirements.txt || goto :fail
.venv\Scripts\python.exe server.py --warmup || goto :fail
echo.
echo Done. Start the reader with start.bat
pause
exit /b 0
:fail
echo.
echo SETUP FAILED - see the messages above.
pause
exit /b 1
