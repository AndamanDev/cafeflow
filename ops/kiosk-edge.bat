@echo off
rem ================================================================
rem  CafeFlow - open the kiosk in full screen (run on the kiosk machine)
rem
rem  Why the flags:
rem   --unsafely-treat-insecure-origin-as-secure
rem        Browsers only allow the camera on https pages. The shop server
rem        is plain http on the LAN, so we tell this browser profile to
rem        trust *only* the shop server. Needed for scanning slips.
rem   --use-fake-ui-for-media-stream
rem        Grant camera permission automatically - nobody stands at the
rem        kiosk to click "Allow".
rem   --user-data-dir
rem        Separate profile just for the kiosk. The flag above only works
rem        with its own profile, and it keeps staff logins out of the kiosk.
rem
rem  Edit SERVER to the shop server's IP (set a fixed IP on the router).
rem  Put a shortcut to this file in shell:startup to open on boot.
rem ================================================================
set SERVER=http://192.168.1.105:8080

start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" ^
  --kiosk "%SERVER%/app/kiosk.html" --edge-kiosk-type=fullscreen ^
  --no-first-run ^
  --user-data-dir="%LOCALAPPDATA%\CafeFlowKiosk" ^
  --unsafely-treat-insecure-origin-as-secure=%SERVER% ^
  --use-fake-ui-for-media-stream
