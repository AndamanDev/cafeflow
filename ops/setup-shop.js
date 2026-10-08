/**
 * CafeFlow — ตั้งค่าเครื่องหลักของร้านให้พร้อมขาย (ส่วนที่ 2 ของ ops\install-cafeflow.bat)
 *
 *   node ops\setup-shop.js          ต้องรันแบบ admin (ไฟร์วอลล์)
 *
 * กดซ้ำได้เสมอ — ทุกขั้นตรวจก่อน ทำแล้วข้าม · ล้มตรงไหน แก้แล้วกดไฟล์ติดตั้งอีกครั้งจะทำต่อจากตรงนั้น
 * ไม่ seed ทับร้านที่มีเมนูแล้ว · ไม่แตะข้อมูลออเดอร์
 *
 * ขั้นตอนเหมือน INSTALL.md ข้อ 2–4 (+ไฟร์วอลล์ข้อ 5) · log: logs\install.log
 * ไม่เพิ่ม exclusion ให้แอนตี้ไวรัสเอง — สคริปต์ที่ทำแบบนั้นคือพฤติกรรมมัลแวร์ที่แอนตี้ไวรัสจับแน่
 */
'use strict';
const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const API = path.join(ROOT, 'api');
const OPS = __dirname;
const LOGS = path.join(ROOT, 'logs');
const API_PORT = 8080;
const FW_RULE = 'CafeFlow 8080';

fs.mkdirSync(LOGS, { recursive: true });
const LOG_FILE = path.join(LOGS, 'install.log');
const stamp = () => new Date().toLocaleString('sv-SE').replace('T', ' ');
function log(m) {
    console.log(m);
    fs.appendFileSync(LOG_FILE, `${stamp()}  ${m}\n`);
}
const skip = (name, why = 'มีแล้ว') => log(`  ✓ ${name} — ข้าม (${why})`);
const doing = (name) => log(`  → ${name}`);

/** หยุดทั้งหมด พร้อมบอกวิธีแก้ — กดไฟล์ติดตั้งอีกครั้งจะทำต่อจากขั้นนี้ */
class Stop extends Error {}
const stop = (msg) => { throw new Stop(msg); };

/** รันคำสั่ง · inherit = ให้คนเห็นความคืบหน้า (npm, pip) */
function run(cmd, args, { cwd = ROOT, inherit = false, shell = false } = {}) {
    const r = spawnSync(cmd, args, {
        cwd, shell, windowsHide: true, encoding: 'utf8',
        stdio: inherit ? ['ignore', 'inherit', 'inherit'] : 'pipe',
    });
    if (r.error) return { code: -1, out: r.error.message };
    return { code: r.status, out: ((r.stdout || '') + (r.stderr || '')).trim() };
}
const ok = (cmd, args, opts) => run(cmd, args, opts).code === 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET ไปที่ 127.0.0.1 ตรง ๆ (fetch ของ Node บางเครื่องค้างที่ IPv6) */
function httpOk(url) {
    return new Promise((resolve) => {
        const req = http.get(url, { timeout: 3000 }, (res) => { res.resume(); resolve(res.statusCode === 200); });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
    });
}

async function waitFor(check, seconds, every = 3000) {
    const end = Date.now() + seconds * 1000;
    while (Date.now() < end) {
        if (await check()) return true;
        await sleep(every);
    }
    return !!(await check());
}

/* ── ขั้นตอน ─────────────────────────────────────────────────────── */

function stepEnv() {
    const env = path.join(ROOT, '.env');
    if (fs.existsSync(env)) return skip('.env');
    doing('สร้าง .env จาก .env.example');
    fs.copyFileSync(path.join(ROOT, '.env.example'), env);
}

async function stepDocker() {
    const ready = () => ok('docker', ['info']);
    if (ready()) return skip('Docker', 'พร้อมแล้ว');
    const exe = [
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Docker', 'Docker', 'Docker Desktop.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'DockerDesktop', 'Docker Desktop.exe'),
    ].find((p) => fs.existsSync(p));
    if (!exe) stop('ไม่พบ Docker Desktop — กดไฟล์ติดตั้งอีกครั้งเพื่อลงใหม่');
    doing('เปิด Docker Desktop แล้วรอให้พร้อม (สูงสุด 5 นาที)');
    // เปิดผ่าน explorer → Docker ทำงานด้วยสิทธิ์ผู้ใช้ปกติ ไม่ใช่สิทธิ์ admin ของหน้าต่างนี้
    spawn('explorer.exe', [exe], { detached: true, stdio: 'ignore' }).unref();
    if (!(await waitFor(ready, 300, 5000))) {
        stop('Docker ยังไม่พร้อม\n'
            + '     • ถ้า Docker Desktop ถามให้ยอมรับเงื่อนไข → กด Accept (ถ้าให้ Sign in กด Skip)\n'
            + '     • ถ้าขึ้น error เรื่อง WSL / virtualization → รีสตาร์ทเครื่อง หรือเปิด Virtualization ใน BIOS\n'
            + '     รอจนมุมซ้ายล่างขึ้น "Engine running" แล้วกดไฟล์ติดตั้งอีกครั้ง');
    }
    log('  ✓ Docker พร้อม');
}

async function stepDatabase() {
    const ready = () => ok('docker', ['exec', 'cafeflow-db', 'pg_isready', '-U', 'cafeflow', '-d', 'cafeflow']);
    if (ready()) return skip('ฐานข้อมูล', 'ทำงานอยู่');
    doing('เปิดฐานข้อมูล (ครั้งแรกต้องโหลด image ราว 100 MB)');
    const r = run('docker', ['compose', 'up', '-d', 'db'], { inherit: true });
    if (r.code !== 0) stop('เปิดฐานข้อมูลไม่สำเร็จ — ดูข้อความด้านบน');
    if (!(await waitFor(ready, 120, 2000))) stop('ฐานข้อมูลไม่พร้อมภายใน 2 นาที — ลองกดไฟล์ติดตั้งอีกครั้ง');
    log('  ✓ ฐานข้อมูลพร้อม');
}

function stepPackages() {
    const lock = fs.readFileSync(path.join(API, 'package-lock.json'));
    const hash = crypto.createHash('sha256').update(lock).digest('hex');
    const nm = path.join(API, 'node_modules');
    const marker = path.join(nm, '.cafeflow-lock');
    if (fs.existsSync(nm) && (!fs.existsSync(marker) || fs.readFileSync(marker, 'utf8') === hash)) {
        // ติดตั้งไว้ก่อนมี marker (ลงมือเอง) — ถือว่าตรง แล้วจดไว้เทียบรอบหน้า
        if (!fs.existsSync(marker)) fs.writeFileSync(marker, hash);
        return skip('แพ็กเกจของ API');
    }
    doing('ติดตั้งแพ็กเกจของ API (npm ci)');
    const r = run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: API, inherit: true, shell: true });
    if (r.code !== 0) stop('npm ci ไม่สำเร็จ — เช็กอินเทอร์เน็ตแล้วกดไฟล์ติดตั้งอีกครั้ง');
    fs.writeFileSync(marker, hash);
}

function stepMigrate() {
    doing('อัปเดตโครงสร้างฐานข้อมูล');
    const r = run(process.execPath, ['src/db/migrate.js'], { cwd: API, inherit: true });
    if (r.code !== 0) stop('migrate ไม่สำเร็จ — ถ่ายรูปหน้าจอส่งช่าง');
}

async function stepSeed() {
    // ใช้ตัวเชื่อมฐานของ API เอง (อ่าน .env เอง)
    const { pool } = require(path.join(API, 'src', 'db', 'pool'));
    let products = 0;
    try {
        products = (await pool.query('SELECT count(*)::int AS n FROM product')).rows[0].n;
    } finally {
        await pool.end();
    }
    if (products > 0) return skip('ข้อมูลตั้งต้น', `มีเมนูแล้ว ${products} รายการ — ไม่ทับ`);
    doing('ใส่ข้อมูลตั้งต้น (เมนูตัวอย่าง · บัญชีผู้ใช้ รหัส demo)');
    const r = run(process.execPath, ['src/db/seed.js'], { cwd: API, inherit: true });
    if (r.code !== 0) stop('seed ไม่สำเร็จ — ถ่ายรูปหน้าจอส่งช่าง');
}

/** ตัวอ่านสลิป — ไม่มีก็ขายได้ จึงล้มแล้วแค่เตือน ไม่หยุด */
function stepOcr() {
    const dir = path.join(ROOT, 'ocr-svc');
    const py = path.join(dir, '.venv', 'Scripts', 'python.exe');
    if (fs.existsSync(py) && ok(py, ['-c', 'import paddleocr'], { cwd: dir })) return skip('ตัวอ่านสลิป');
    doing('ติดตั้งตัวอ่านสลิป (โหลดราว 900 MB · 10–30 นาที อย่าปิดหน้าต่าง)');
    // stdin = nul → คำสั่ง pause ใน setup.bat ผ่านเองไม่ค้าง
    const r = run('cmd.exe', ['/c', 'setup.bat'], { cwd: dir, inherit: true });
    if (r.code !== 0) {
        log('  ⚠ ติดตั้งตัวอ่านสลิปไม่สำเร็จ — ร้านขายได้ แต่ยังตรวจสลิปจากภาพไม่ได้ · กดไฟล์ติดตั้งอีกครั้งเพื่อลองใหม่');
        return false;
    }
    return true;
}

function stepAutostart() {
    doing('ตั้งให้ระบบเปิดเองทุกครั้งที่ login');
    const r = run(process.execPath, [path.join(OPS, 'install-autostart.js')]);
    log('     ' + r.out.split(/\r?\n/).join('\n     '));
    if (r.code !== 0) stop('ตั้งเปิดอัตโนมัติไม่สำเร็จ — ดูข้อความด้านบน');
}

function stepNoSleep() {
    doing('ตั้งเครื่องไม่ให้หลับเมื่อเสียบปลั๊ก');
    for (const k of ['standby-timeout-ac', 'hibernate-timeout-ac', 'disk-timeout-ac']) run('powercfg', ['/change', k, '0']);
}

function stepFirewall() {
    doing(`เปิดไฟร์วอลล์พอร์ต ${API_PORT} ให้จออื่นในร้านเข้าได้`);
    run('netsh', ['advfirewall', 'firewall', 'delete', 'rule', `name=${FW_RULE}`]);
    // ทุกโปรไฟล์ — เครื่องร้านมักถูกตั้งเครือข่ายเป็น Public โดยไม่มีใครรู้ แล้วจอทั้งร้านต่อไม่ติด
    const r = run('netsh', ['advfirewall', 'firewall', 'add', 'rule', `name=${FW_RULE}`, 'dir=in', 'action=allow',
        'protocol=TCP', `localport=${API_PORT}`, 'profile=any']);
    if (r.code !== 0) log('  ⚠ เปิดไฟร์วอลล์ไม่สำเร็จ (ต้องรันแบบ admin) — ทำเองตามคู่มือขั้นที่ 10.3');
}

async function stepStart() {
    const health = () => httpOk(`http://127.0.0.1:${API_PORT}/api/health`);
    if (await health()) return skip('เปิดระบบ', 'ทำงานอยู่');
    doing('เปิดระบบ (Docker → ฐานข้อมูล → API → ตัวอ่านสลิป) รอสูงสุด 3 นาที');
    run('schtasks', ['/Run', '/TN', 'CafeFlow']);
    if (!(await waitFor(health, 180))) stop(`ระบบยังไม่ขึ้น — เปิดไฟล์ ${path.join(LOGS, 'start.log')} ถ่ายรูปบรรทัดล่าง ๆ ส่งช่าง`);
    log('  ✓ ระบบพร้อม');
}

/** IP วงแลนร้าน — ตัดการ์ดเสมือนของ WSL/Docker/Hyper-V/VM ออก (เช่น vEthernet (WSL) 172.x) ไม่งั้นคนติดตั้งจดผิดตัว */
function lanIps() {
    return Object.entries(os.networkInterfaces())
        .filter(([name]) => !/vEthernet|WSL|Hyper-V|VirtualBox|VMware|Loopback|Bluetooth/i.test(name))
        .flatMap(([, addrs]) => addrs)
        .filter((a) => a && a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'))
        .map((a) => a.address);
}

/* ── หลัก ────────────────────────────────────────────────────────── */

async function main() {
    log(`══ ตั้งค่าเครื่องหลัก CafeFlow ที่ ${ROOT}`);
    if (process.platform !== 'win32') stop('ใช้ได้บน Windows เท่านั้น');

    stepEnv();
    await stepDocker();
    await stepDatabase();
    stepPackages();
    stepMigrate();
    await stepSeed();
    const ocrOk = stepOcr();
    stepAutostart();
    stepNoSleep();
    stepFirewall();
    await stepStart();

    spawn('explorer.exe', [`http://localhost:${API_PORT}/app/login.html`], { detached: true, stdio: 'ignore' }).unref();

    const ips = lanIps();
    console.log(`
════════════════════════════════════════════════════════
  ติดตั้งเสร็จ ✓   เข้าใช้ครั้งแรก: ชื่อ admin  รหัส demo
════════════════════════════════════════════════════════
  IP เครื่องนี้: ${ips.join(' หรือ ') || '(หาไม่เจอ — พิมพ์ ipconfig)'}
  จออื่นในร้านเปิด: http://${ips[0] || '<IP เครื่องนี้>'}:${API_PORT}/app/login.html
${ocrOk === false ? '\n  ⚠ ตัวอ่านสลิปยังไม่ได้ติดตั้ง — กดไฟล์ติดตั้งอีกครั้งเพื่อลองใหม่\n' : ''}
  ยังต้องทำเอง (ดู docs\\INSTALL-EASY.md):
   1. ให้ Windows login เอง — Win+R พิมพ์ netplwiz เอาติ๊กออก
   2. BIOS: Restore on AC Power Loss = Power On
   3. จอง IP เครื่องนี้ที่เราเตอร์
   4. ตั้งค่าร้าน เปลี่ยนรหัสผ่าน เครื่องพิมพ์ จับคู่ตู้สั่งอาหาร
   5. รีสตาร์ทเครื่องหนึ่งครั้ง แล้วเช็กว่าระบบขึ้นเองภายใน 3 นาที
`);
    log('══ เสร็จ');
}

main().then(() => process.exit(0)).catch((err) => {
    if (err instanceof Stop) {
        log(`\n  ✗ ${err.message}`);
    } else {
        log(`\n  ✗ ผิดพลาด: ${err.stack || err.message}`);
    }
    log('    แก้แล้วกดไฟล์ติดตั้งอีกครั้ง — ขั้นที่ทำเสร็จแล้วจะถูกข้าม');
    process.exit(1);
});
