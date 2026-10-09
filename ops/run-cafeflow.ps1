# ════════════════════════════════════════════════════════════════
#  CafeFlow — เปิดระบบทั้งชุดบนเครื่องเซิร์ฟเวอร์ และ "ลองซ้ำจนกว่าจะติด"
#  (เรียกเองตอน login ผ่าน install-autostart.ps1 · สั่งเองก็ได้)
#
#  ลำดับ: Docker Desktop → ฐานข้อมูล → API (8080) → ตัวอ่านสลิป (5101)
#  - ขั้นไหนไม่ติด รอแล้วลองใหม่ (10 → 20 → … สูงสุด 60 วิ) ไม่เลิกจนกว่าจะติด
#  - Docker ค้างเกิน 3 นาที → ปิด Docker Desktop แล้วเปิดใหม่
#  - API เปิดแล้วตาย (พอร์ตไม่ขึ้น) → นับเป็นไม่ติด ลองใหม่
#  - ตัวอ่านสลิปลองแค่ 5 ครั้ง (ไม่มีก็ขายได้ ไม่ควรวนค้างทั้งวัน)
#
#  ตัวไหนเปิดอยู่แล้วข้ามไป · เปิดสคริปต์ซ้อนกันไม่ได้ (ตัวที่สองจะออกทันที)
#  log: logs\start.log · logs\api.log · logs\ocr.log (รอบก่อนหน้าอยู่ใน *.prev.log)
# ════════════════════════════════════════════════════════════════
$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
$Logs = Join-Path $Root 'logs'
New-Item -ItemType Directory -Force $Logs | Out-Null
function Log($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m" | Add-Content -Encoding utf8 (Join-Path $Logs 'start.log') }
function PortBusy($p) { [bool](Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) }

# กันเปิดซ้อน — ตอน login ทางลัด Startup กับคนกดเองอาจชนกัน
$mutex = New-Object System.Threading.Mutex($false, 'CafeFlowStartup')
if (-not $mutex.WaitOne(0)) { Log 'มีสคริปต์เปิดระบบทำงานอยู่แล้ว — ออก'; exit 0 }

# รอจนเงื่อนไขเป็นจริง ไม่เกิน $sec วินาที
function WaitFor([scriptblock]$cond, [int]$sec) {
    $deadline = (Get-Date).AddSeconds($sec)
    do { if (& $cond) { return $true }; Start-Sleep -Seconds 2 } while ((Get-Date) -lt $deadline)
    return [bool](& $cond)
}

# ทำ $step ซ้ำจนสำเร็จ · $max = 0 คือไม่จำกัดครั้ง
function Retry([string]$name, [scriptblock]$step, [int]$max = 0) {
    $n = 0
    while ($true) {
        $n++
        if (& $step $n) { Log ("$name พร้อม" + $(if ($n -gt 1) { " (ครั้งที่ $n)" })); return $true }
        if ($max -and $n -ge $max) { Log "!! $name ไม่ติดหลังลอง $n ครั้ง — เลิกลอง"; return $false }
        $wait = [Math]::Min(10 * $n, 60)
        Log "!! $name ยังไม่ติด (ครั้งที่ $n) — ลองใหม่ใน $wait วิ"
        Start-Sleep -Seconds $wait
    }
}

# เปิดโปรแกรมแบบซ่อนหน้าต่าง ส่ง output ลง log (เก็บรอบก่อนไว้เป็น .prev.log)
function StartHidden([string]$exe, [string[]]$argv, [string]$dir, [string]$logName) {
    $out = Join-Path $Logs "$logName.log"
    $err = Join-Path $Logs "$logName.err.log"
    foreach ($f in $out, $err) {
        if (Test-Path $f) { Move-Item $f ($f -replace '\.log$', '.prev.log') -Force -ErrorAction SilentlyContinue }
    }
    Start-Process $exe -ArgumentList $argv -WorkingDirectory $dir -WindowStyle Hidden `
        -RedirectStandardOutput $out -RedirectStandardError $err
}

function LastLines([string]$logName) {
    $f = Join-Path $Logs "$logName.err.log"
    if (Test-Path $f) { (Get-Content $f -Tail 3 -Encoding utf8 | Where-Object { $_ }) -join ' · ' }
}

Log '── เริ่มเปิดระบบ ──'

# ── 1. Docker Desktop ────────────────────────────────────────────
function DockerUp { docker info *> $null; return ($LASTEXITCODE -eq 0) }

# ไม่ให้หน้าต่าง Docker Desktop เด้งขึ้นทุกครั้งที่เปิด — ตรงกับติ๊ก
# Settings › General › "Open Docker Dashboard when Docker Desktop starts" ออก
# รุ่นใหม่เก็บใน settings-store.json (OpenUIOnStartupDisabled) รุ่นเก่า settings.json (openUIOnStartupDisabled)
# แก้เป็นข้อความตรง ๆ ไม่ผ่าน ConvertTo-Json (PS 5.1 จัดรูป JSON ใหม่จนเพี้ยน) · เขียน UTF-8 ไม่มี BOM — Docker อ่าน BOM ไม่ได้
# ต้องทำตอน Docker ยังไม่เปิด ไม่งั้น Docker เขียนค่าของมันทับ
function DockerQuiet {
    foreach ($f in "$env:APPDATA\Docker\settings-store.json", "$env:APPDATA\Docker\settings.json") {
        if (-not (Test-Path $f)) { continue }
        try {
            $key = if ($f -like '*settings-store.json') { 'OpenUIOnStartupDisabled' } else { 'openUIOnStartupDisabled' }
            $txt = [IO.File]::ReadAllText($f)
            if ($txt -match "`"$key`"\s*:\s*true") { continue }
            if ($txt -match "`"$key`"\s*:\s*false") {
                $new = $txt -replace "(`"$key`"\s*:\s*)false", '${1}true'
            } elseif ($txt -match '^\s*\{\s*\}\s*$') {
                $new = "{ `"$key`": true }"
            } else {
                $new = $txt -replace '^\s*\{', "{`n  `"$key`": true,"
            }
            [IO.File]::WriteAllText($f, $new, (New-Object System.Text.UTF8Encoding $false))
            Log "ปิดหน้าต่าง Docker ตอนเปิด ($key)"
        } catch { Log "!! ตั้งให้ Docker ไม่โชว์หน้าต่างไม่ได้: $($_.Exception.Message)" }
    }
}
Retry 'Docker' {
    param($n)
    if (DockerUp) { return $true }
    $exe = @(
        "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe",
        "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $exe) { Log '!! ไม่พบ Docker Desktop ในเครื่อง'; return $false }
    $running = Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue
    if ($running -and $n -gt 1) {
        # เปิดอยู่แต่ไม่พร้อมมาแล้วรอบหนึ่ง = ค้าง → ปิดแล้วเปิดใหม่
        Log 'Docker Desktop ค้าง — ปิดแล้วเปิดใหม่'
        $running | Stop-Process -Force
        Start-Sleep -Seconds 5
        $running = $null
    }
    if (-not $running) { DockerQuiet; Log "เปิด Docker Desktop: $exe"; Start-Process $exe -WindowStyle Minimized }
    WaitFor { DockerUp } 180
} | Out-Null

# ── 2. ฐานข้อมูล ───────────────────────────────────────────────────
function DbReady { docker exec cafeflow-db pg_isready -U cafeflow -d cafeflow *> $null; return ($LASTEXITCODE -eq 0) }
Retry 'ฐานข้อมูล' {
    if (DbReady) { return $true }
    Push-Location $Root
    # ผ่าน cmd — PowerShell 5.1 แปลง stderr ของ docker เป็น error record อ่านใน log ไม่ออก
    $out = cmd /c "docker compose up -d db 2>&1"
    Pop-Location
    Log ("docker compose: " + (($out | Where-Object { $_ }) -join ' · '))
    WaitFor { DbReady } 60
} | Out-Null

# ── 3. API (พอร์ต 8080) ────────────────────────────────────────────
Retry 'API' {
    if (PortBusy 8080) { return $true }
    $node = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $node) { Log '!! ไม่พบ node ในเครื่อง'; return $false }
    # node ตรง ไม่ใช่ --watch (ร้านจริงไม่ต้องรีโหลดเมื่อแก้ไฟล์)
    StartHidden $node @('src\server.js') (Join-Path $Root 'api') 'api'
    if (WaitFor { PortBusy 8080 } 45) { return $true }
    Log "!! API ไม่ขึ้น: $(LastLines 'api')"
    return $false
} | Out-Null

# ── 4. ตัวอ่านสลิป OCR (พอร์ต 5101) ──────────────────────────────
$py = Join-Path $Root 'ocr-svc\.venv\Scripts\python.exe'
if (-not (Test-Path $py)) {
    Log 'ยังไม่ได้ติดตั้งตัวอ่านสลิป (ocr-svc\setup.bat) — ข้าม ร้านขายได้ปกติ'
} else {
    $env:PYTHONIOENCODING = 'utf-8'
    Retry 'ตัวอ่านสลิป' {
        if (PortBusy 5101) { return $true }
        StartHidden $py @('server.py') (Join-Path $Root 'ocr-svc') 'ocr'
        # โหลดโมเดลครั้งแรกช้า
        if (WaitFor { PortBusy 5101 } 120) { return $true }
        Log "!! ตัวอ่านสลิปไม่ขึ้น: $(LastLines 'ocr')"
        return $false
    } 5 | Out-Null
}

Log '── เปิดระบบเสร็จ ──'
$mutex.ReleaseMutex()
