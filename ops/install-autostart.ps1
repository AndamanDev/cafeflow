# ════════════════════════════════════════════════════════════════
#  CafeFlow — ตั้งให้ระบบเปิดเองทุกครั้งที่ login เข้า Windows (ทำครั้งเดียว)
#
#  ใส่ทางลัดไว้ในโฟลเดอร์ Startup ของผู้ใช้นี้ → เรียก start-cafeflow.ps1 แบบซ่อนหน้าต่าง
#  ไม่ต้องใช้สิทธิ์ผู้ดูแลระบบ · ถอนการตั้งค่า: .\install-autostart.ps1 -Remove
#
#  ⚠️ ต้องให้ Windows login เองตอนเปิดเครื่อง (Docker Desktop ทำงานเฉพาะตอนมีผู้ใช้ login)
#     ตั้งได้ด้วยคำสั่ง netplwiz → เอาติ๊ก "Users must enter a user name and password" ออก
# ════════════════════════════════════════════════════════════════
param([switch]$Remove)

$startup = [Environment]::GetFolderPath('Startup')
$lnk = Join-Path $startup 'CafeFlow.lnk'

if ($Remove) {
    Remove-Item $lnk -ErrorAction SilentlyContinue
    Write-Output "ถอนการเปิดอัตโนมัติแล้ว"
    exit 0
}

$script = Join-Path $PSScriptRoot 'start-cafeflow.ps1'
$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut($lnk)
$s.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$s.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
$s.WorkingDirectory = $PSScriptRoot
$s.WindowStyle = 7   # เปิดแบบย่อ
$s.Description = 'CafeFlow — เปิดฐานข้อมูล API และตัวอ่านสลิป'
$s.Save()
Write-Output "ตั้งแล้ว: $lnk"
