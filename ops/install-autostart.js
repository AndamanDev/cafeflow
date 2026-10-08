/**
 * CafeFlow — ตั้งให้ระบบเปิดเองทุกครั้งที่ login เข้า Windows (ทำครั้งเดียว)
 *
 *   node D:\cafeflow\ops\install-autostart.js            ตั้ง
 *   node D:\cafeflow\ops\install-autostart.js --remove   ถอน
 *
 * ลงทะเบียน Task Scheduler ชื่อ "CafeFlow" (เมื่อ login + หน่วง 30 วิ) → เรียก run-cafeflow.ps1
 *
 * ทำไมเป็น Node ไม่ใช่ PowerShell: แอนตี้ไวรัสจับสคริปต์ PowerShell ที่ตั้งตัวเองให้เปิดอัตโนมัติว่าเป็นมัลแวร์
 *   (บล็อก install-autostart.ps1 / start-cafeflow.ps1 จน git อ่านไม่ได้ และลบทางลัดใน Startup ทิ้งเงียบ ๆ — 08/10/2569)
 * ทำไม action เรียกผ่าน cmd: บนเครื่องร้าน PowerShell ที่ Task Scheduler เปิดตรง ๆ ค้างนิ่งไม่ทำงาน แต่ผ่าน cmd ได้
 *
 * ⚠️ ต้องให้ Windows login เองตอนเปิดเครื่อง (Docker Desktop ทำงานเฉพาะตอนมีผู้ใช้ login)
 *    ตั้งได้ด้วยคำสั่ง netplwiz → เอาติ๊ก "Users must enter a user name and password" ออก
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const TASK = 'CafeFlow';
const SCRIPT = path.join(__dirname, 'run-cafeflow.ps1');
// ทางลัดของวิธีเดิม — ลบทิ้งทั้งตอนตั้งและถอน กันเปิดซ้อน
const OLD_LNK = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'CafeFlow.lnk');

const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function schtasks(args) {
    const r = spawnSync('schtasks', args, { encoding: 'utf8', windowsHide: true });
    return { code: r.status, out: ((r.stdout || '') + (r.stderr || '')).trim() };
}

function fail(msg, out) {
    console.error('!! ' + msg);
    if (out) console.error('   ' + out);
    if (/access|denied|ปฏิเสธ/i.test(out || '')) {
        console.error('   เปิด PowerShell แบบ Run as administrator แล้วสั่งใหม่');
    }
    process.exit(1);
}

if (process.platform !== 'win32') fail('ใช้ได้บน Windows เท่านั้น');
try {
    fs.rmSync(OLD_LNK, { force: true });
} catch {
    // แอนตี้ไวรัสล็อกไฟล์ไว้ (เจอจริง) — ไม่เป็นไร ทางลัดที่ถูกล็อกก็ไม่ทำงานอยู่แล้ว
    console.log(`(ลบทางลัดเก่าไม่ได้ — ถูกแอนตี้ไวรัสล็อก ลบเองทีหลังได้: ${OLD_LNK})`);
}

if (process.argv.includes('--remove')) {
    const r = schtasks(['/Delete', '/TN', TASK, '/F']);
    console.log(r.code === 0 ? 'ถอนการเปิดอัตโนมัติแล้ว' : 'ไม่มีการตั้งเปิดอัตโนมัติอยู่แล้ว');
    process.exit(0);
}

if (!fs.existsSync(SCRIPT)) fail('ไม่พบ ' + SCRIPT);

const user = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
const cmdExe = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
const args = `/c powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${SCRIPT}"`;

const xml = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>CafeFlow — เปิด Docker ฐานข้อมูล API และตัวอ่านสลิป (ลองซ้ำจนติด)</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>${xmlEsc(user)}</UserId>
      <Delay>PT30S</Delay>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>${xmlEsc(user)}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${xmlEsc(cmdExe)}</Command>
      <Arguments>${xmlEsc(args)}</Arguments>
      <WorkingDirectory>${xmlEsc(__dirname)}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
`;

// schtasks อ่าน XML ที่ประกาศ UTF-16 ต้องเป็น UTF-16 LE มี BOM
const file = path.join(os.tmpdir(), `cafeflow-task-${process.pid}.xml`);
fs.writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, 'utf16le')]));
const r = schtasks(['/Create', '/TN', TASK, '/XML', file, '/F']);
fs.rmSync(file, { force: true });
if (r.code !== 0) fail('ลงทะเบียน Task Scheduler ไม่สำเร็จ', r.out);

console.log(`ตั้งแล้ว: Task Scheduler → ${TASK} (ทำงานทุกครั้งที่ ${user} login)`);
