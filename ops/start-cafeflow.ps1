# ════════════════════════════════════════════════════════════════
#  CafeFlow — เปิดระบบทั้งชุดบนเครื่องเซิร์ฟเวอร์ (เรียกเองตอน login ผ่าน install-autostart.ps1)
#
#  ลำดับสำคัญ: Docker ต้องขึ้นก่อน → ฐานข้อมูลพร้อม → ค่อยเปิด API
#  (API รอฐานข้อมูลแค่ 30 วิ แต่ Docker Desktop หลังบูตใช้ 1–3 นาที — เปิด API เร็วไปจะตายทันที)
#
#  ตัวไหนเปิดอยู่แล้ว (พอร์ตถูกใช้) ข้ามไป — เรียกซ้ำได้ ไม่เปิดซ้อน
#  log อยู่ที่ logs\start.log · logs\api.log · logs\ocr.log
# ════════════════════════════════════════════════════════════════
$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
$Logs = Join-Path $Root 'logs'
New-Item -ItemType Directory -Force $Logs | Out-Null
function Log($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m" | Add-Content -Encoding utf8 (Join-Path $Logs 'start.log') }
function PortBusy($p) { [bool](Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) }

Log '── เริ่มเปิดระบบ ──'

# ── 1. Docker Desktop ────────────────────────────────────────────
function DockerUp { docker info *> $null; return ($LASTEXITCODE -eq 0) }
if (-not (DockerUp)) {
    $candidates = @(
        "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe",
        "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    )
    $exe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($exe) { Log "เปิด Docker Desktop: $exe"; Start-Process $exe } else { Log '!! ไม่พบ Docker Desktop' }
    $deadline = (Get-Date).AddMinutes(5)
    while (-not (DockerUp) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 5 }
}
if (-not (DockerUp)) { Log '!! Docker ไม่พร้อมภายใน 5 นาที — ยกเลิก (ดู Docker Desktop)'; exit 1 }
Log 'Docker พร้อม'

# ── 2. ฐานข้อมูล ───────────────────────────────────────────────────
Push-Location $Root
# ผ่าน cmd — PowerShell 5.1 แปลง stderr ของ docker เป็น error record ภาษาเครื่อง อ่านใน log ไม่ออก
$out = cmd /c "docker compose up -d db 2>&1"
Log ("docker compose: " + (($out | Where-Object { $_ }) -join ' · '))
Pop-Location
$deadline = (Get-Date).AddMinutes(2)
do {
    docker exec cafeflow-db pg_isready -U cafeflow -d cafeflow *> $null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)
if ($LASTEXITCODE -ne 0) { Log '!! ฐานข้อมูลไม่พร้อมภายใน 2 นาที'; exit 1 }
Log 'ฐานข้อมูลพร้อม'

# ── 3. API (พอร์ต 8080) ────────────────────────────────────────────
if (PortBusy 8080) {
    Log 'API เปิดอยู่แล้ว — ข้าม'
} else {
    # cmd /c เพื่อส่ง log ต่อท้ายไฟล์ได้ · ใช้ node ตรง ไม่ใช่ --watch (ร้านจริงไม่ต้องรีโหลดเมื่อแก้ไฟล์)
    Start-Process cmd.exe -WindowStyle Hidden -WorkingDirectory (Join-Path $Root 'api') `
        -ArgumentList '/c', "node src\server.js >> `"$Logs\api.log`" 2>&1"
    Log 'เปิด API แล้ว'
}

# ── 4. ตัวอ่านสลิป OCR (พอร์ต 5101) ──────────────────────────────
$py = Join-Path $Root 'ocr-svc\.venv\Scripts\python.exe'
if (PortBusy 5101) {
    Log 'ตัวอ่านสลิปเปิดอยู่แล้ว — ข้าม'
} elseif (-not (Test-Path $py)) {
    Log 'ยังไม่ได้ติดตั้งตัวอ่านสลิป (ocr-svc\setup.bat) — ข้าม ร้านขายได้ปกติ'
} else {
    Start-Process cmd.exe -WindowStyle Hidden -WorkingDirectory (Join-Path $Root 'ocr-svc') `
        -ArgumentList '/c', "set PYTHONIOENCODING=utf-8&& `"$py`" server.py >> `"$Logs\ocr.log`" 2>&1"
    Log 'เปิดตัวอ่านสลิปแล้ว'
}

Log '── เปิดระบบเสร็จ ──'
