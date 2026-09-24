@echo off
rem  CafeFlow - start the slip reader (OCR) on 127.0.0.1:5101.
rem  Put a shortcut to this file in shell:startup so it starts on boot.
rem  If it is not running the shop still sells; cashiers just see no OCR result.
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
.venv\Scripts\python.exe server.py
