@echo off
rem สร้าง docs\manual\CafeFlow-Manual.pdf จาก manual.html ด้วย Edge (ไม่ต้องใช้เน็ต)
setlocal
set "HERE=%~dp0"
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
"%EDGE%" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="%HERE%..\CafeFlow-Manual.pdf" "file:///%HERE:\=/%manual.html"
echo PDF: %HERE%..\CafeFlow-Manual.pdf
