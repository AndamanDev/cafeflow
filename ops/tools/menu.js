#!/usr/bin/env node
/**
 * CafeFlow — เมนูรวมงานดูแลระบบ (เปิดผ่าน ops\cafeflow.bat ที่เครื่องเซิร์ฟเวอร์)
 * ══════════════════════════════════════════════════════════════════
 * ผู้ใช้ขอ 19/10/2569: ไฟล์ .bat เยอะจนงง → ไฟล์เดียว กดลูกศรขึ้น/ลงเลือกหัวข้อ แล้ว Enter
 * ไฟล์ย่อยย้ายไป ops\tools\ (restart-api · bench-ocr) — ยังดับเบิลคลิกตรงได้ถ้าเมนูเปิดไม่ขึ้น
 * อัปเดตระบบอยู่ในไฟล์นี้เอง (ไฟล์ update-cafeflow.bat เดิมลบแล้ว 21/10/2569) — ดู update() ด้านล่าง
 *
 *   ↑ ↓ เลือก · Enter ทำ · กดตัวเลขเลือกตรง · Esc / q ออก
 * ไม่มีไลบรารีเพิ่ม (Node อย่างเดียว) · ทำงานได้แม้ไม่มีเน็ต (ยกเว้นข้อ "อัปเดตระบบ" ที่ต้องดึงโค้ด)
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const readline = require('readline');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const OPS = path.resolve(__dirname, '..');
const PORT = 8080;
let reloadAfter = false;   // อัปเดตสำเร็จ → กลับเมนูแล้วเปิดเมนูรุ่นใหม่แทน

const C = { rev: '\x1b[7m', dim: '\x1b[2m', b: '\x1b[1m', g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', x: '\x1b[0m' };

/* ── งานแต่ละข้อ ─────────────────────────────────────────── */
const runBat = (f, args = []) => spawnSync('cmd', ['/c', path.join(OPS, f), ...args], { stdio: 'inherit', cwd: ROOT });
const runNode = (f, args = []) => spawnSync(process.execPath, [f, ...args], { stdio: 'inherit', cwd: ROOT });

const ITEMS = [
    { group: 'ใช้ประจำ' },
    { label: 'ตรวจสถานะระบบ', desc: 'API · ฐานข้อมูล · ตัวอ่านสลิป ทำงานอยู่ไหม — ดูก่อนเมื่อหน้าร้านมีปัญหา', run: status },
    { label: 'รีสตาร์ทระบบ (API + ตัวอ่านสลิป)', desc: 'หน้าเว็บค้าง / เพิ่งอัปเดตโค้ด / ปุ่มใหม่ขึ้น "Route … not found"', run: () => runBat('tools\\restart-api.bat') },
    { label: 'ดูที่อยู่เครื่องเซิร์ฟเวอร์ (IP)', desc: 'ใช้ตั้งเครื่องใหม่ — กรอกใน screen-edge.bat ของเครื่องคีออสก์/ครัว/จอคิว', run: showIp },
    { label: 'เปิดจอบนเครื่องนี้ (คีออสก์ · แคชเชียร์ · ครัว · จอคิว)', desc: 'เปิด Edge เต็มจอพร้อมเสียง — เครื่องอื่นใช้ไฟล์ screen-edge.bat', run: () => runBat('screen-edge.bat') },
    { label: 'สำรองข้อมูลตอนนี้', desc: 'ปกติสำรองเองทุกคืน 23:30 — กดเองก่อนทำอะไรเสี่ยง ๆ', run: () => runNode(path.join(OPS, 'backup.js'), ['--reason=manual']) },
    { label: 'ดู log ล่าสุด', desc: 'บรรทัดท้าย ๆ ของ log ระบบ · สำรองข้อมูล · การเปิดระบบ — ส่งให้ช่างดูได้', run: showLogs },
    { group: 'นาน ๆ ครั้ง' },
    { label: 'อัปเดตระบบเป็นรุ่นใหม่', desc: 'สำรอง → ดึงโค้ดใหม่ (ต้องมีเน็ต) → ไลบรารี → อัปเดตฐานข้อมูล → รีสตาร์ท · ระบบหยุด ~1 นาที', run: update },
    { label: 'ล้างข้อมูลขาย (ก่อนเปิดร้านจริง)', desc: 'ลบออเดอร์/การชำระ/รอบขาย — เก็บเมนู ผู้ใช้ อุปกรณ์ · ถามก่อนว่าจะสำรองไหม', run: () => runNode(path.join(ROOT, 'api', 'src', 'db', 'clear-transactions.js')) },
    { label: 'ตั้งให้ระบบเปิดเองตอนเปิดเครื่อง', desc: 'Task Scheduler: เปิดระบบตอน login + สำรองทุกคืน 23:30', run: () => runNode(path.join(__dirname, 'install-autostart.js')) },
    { label: 'เปลี่ยนรหัสผ่านฐานข้อมูล', desc: 'ทำครั้งเดียวตอนติดตั้ง — เปลี่ยนจากรหัสเริ่มต้นเป็นรหัสสุ่ม แล้วรีสตาร์ท', run: () => { const r = runNode(path.join(__dirname, 'rotate-db-password.js')); if (r.status === 0) runBat('tools\\restart-api.bat'); } },
    { label: 'วัดความเร็วตัวอ่านสลิป', desc: 'เทียบตัวอ่าน 2 แบบกับสลิปของร้าน — ไม่เปลี่ยนอะไรในระบบ', run: () => runBat('tools\\bench-ocr.bat') },
    { label: 'ติดตั้งซ้ำ / ซ่อมระบบ', desc: 'ตรวจ Git · Node · Python · Docker · ฐานข้อมูล · ตัวอ่านสลิป · ไฟร์วอลล์ ทำเฉพาะส่วนที่ขาด — เปิดหน้าต่างใหม่ (กด Yes)', run: () => runBat('cafeflow.bat', ['install']) },
    { group: '' },
    { label: 'ออก', desc: '', run: null },
];
const PICKABLE = ITEMS.map((x, i) => (x.label ? i : -1)).filter((i) => i >= 0);

/* ── อัปเดตระบบ ─────────────────────────────────────────────
 * 1 สำรองก่อน (พังแล้วกู้ได้) · 2 git pull · 3 ไลบรารี (เฉพาะเมื่อ package-lock เปลี่ยน/ของหาย)
 * 4 migrate · 5 รีสตาร์ท แล้วรอ health
 * ขั้น 3–5 รันจาก "ไฟล์นี้ตัวใหม่" ที่เพิ่งดึงมา (spawn ตัวเองด้วย --update-finish) — โค้ดในหน่วยความจำเป็นรุ่นเก่า
 * ถ้ารุ่นใหม่เพิ่มขั้นตอน จะได้ทำขั้นของรุ่นใหม่เลย
 * ไลบรารี: หยุด API ก่อน npm ci เสมอ — API ที่รันอยู่ล็อกไฟล์ .node ไว้ npm ci จะล้มกลางทาง (EPERM) node_modules พัง
 * เครื่องหมายไลบรารี = api\node_modules\.cafeflow-lock (sha256 ตัวเล็กของ package-lock) — ไฟล์เดียวกับที่ setup-shop.js เขียน */
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const npm = (args, cwd) => spawnSync('npm ' + args.join(' '), { stdio: 'inherit', cwd, shell: true });   // npm.cmd ต้องผ่าน shell · args คงที่ ไม่มีค่าจากผู้ใช้

function stopApi() {
    spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
        'Get-NetTCPConnection -LocalPort 8080,5101 -State Listen -ErrorAction SilentlyContinue | ' +
        'ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }'], { stdio: 'ignore' });
    sleep(3000);
}

async function startApi() {
    // งาน CafeFlow ใน Task Scheduler เปิดเฉพาะส่วนที่ดับอยู่ · เครื่องที่ไม่ได้ตั้งงานไว้ → เรียกสคริปต์เปิดระบบตรง ๆ
    if (spawnSync('schtasks', ['/Run', '/TN', 'CafeFlow'], { stdio: 'ignore' }).status !== 0) {
        require('child_process').spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
            '-File', path.join(OPS, 'run-cafeflow.ps1')], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    }
    for (let t = Date.now() + 60000; Date.now() < t;) {
        if ((await get(`http://127.0.0.1:${PORT}/api/health`)).ok) return true;
        sleep(2000);
    }
    return false;
}

function libsNeeded() {
    const lock = path.join(ROOT, 'api', 'package-lock.json');
    const nm = path.join(ROOT, 'api', 'node_modules');
    const hash = require('crypto').createHash('sha256').update(fs.readFileSync(lock)).digest('hex');
    let old = '';
    try { old = fs.readFileSync(path.join(nm, '.cafeflow-lock'), 'utf8').trim().toLowerCase(); } catch { /* ยังไม่เคยบันทึก */ }
    const missing = !fs.existsSync(path.join(nm, 'pg', 'package.json')) || !fs.existsSync(path.join(nm, 'fastify', 'package.json'));
    return { need: hash !== old || missing, hash };
}

const fail = (msg) => { console.log(`\n${C.r}!! ${msg}${C.x}`); return false; };

async function update() {
    console.log(`${C.dim}ทำตอนร้านไม่มีลูกค้า — ระบบหยุดราว 1 นาที${C.x}\n`);
    console.log(`${C.b}[1/5] สำรองฐานข้อมูล…${C.x}`);
    if (runNode(path.join(OPS, 'backup.js'), ['--reason=update']).status !== 0) {
        return fail('สำรองไม่สำเร็จ — หยุดอัปเดต (ยังไม่ได้เปลี่ยนอะไร)\n   Docker Desktop เปิดอยู่ไหม? ดู logs\\backup.log');
    }
    console.log(`\n${C.b}[2/5] ดึงโค้ดใหม่ (git pull)…${C.x}`);
    if (spawnSync('git', ['pull', '--ff-only'], { stdio: 'inherit', cwd: ROOT }).status !== 0) {
        return fail('git pull ไม่สำเร็จ — หยุดอัปเดต · เน็ตหลุด หรือมีคนแก้ไฟล์ในเครื่องนี้เอง\n   ถ่ายรูปข้อความด้านบนส่งช่าง');
    }
    // ขั้นที่เหลือใช้ไฟล์นี้ตัวที่เพิ่งดึงมา · รุ่นใหม่ย้ายเมนูไปที่อื่น → ทำต่อด้วยโค้ดในหน่วยความจำ
    const self = path.join(__dirname, 'menu.js');
    const ok = fs.existsSync(self)
        ? spawnSync(process.execPath, [self, '--update-finish'], { stdio: 'inherit', cwd: ROOT }).status === 0
        : await updateFinish();
    if (ok) reloadAfter = true;
    return ok;
}

async function updateFinish() {
    console.log(`\n${C.b}[3/5] ไลบรารี…${C.x}`);
    const libs = libsNeeded();
    if (!libs.need) {
        console.log('    ไม่มีไลบรารีเปลี่ยน — ข้าม');
    } else {
        console.log('    หยุด API ก่อน (API ล็อกไฟล์ไลบรารีไว้ระหว่างทำงาน)…');
        stopApi();
        const api = path.join(ROOT, 'api');
        if (npm(['ci', '--no-audit', '--no-fund'], api).status !== 0) {
            console.log('    ลองใหม่อีกครั้งใน 5 วินาที — แอนตี้ไวรัสอาจยังสแกนไฟล์อยู่…');
            sleep(5000);
            npm(['ci', '--no-audit', '--no-fund'], api);
        }
        // exit code ของ npm บน Windows เชื่อไม่ได้ — ลองโหลดไลบรารีหลักจริง
        const load = spawnSync(process.execPath, ['-e', "require('./api/node_modules/pg'); require('./api/node_modules/fastify')"], { cwd: ROOT, stdio: 'ignore' });
        if (load.status !== 0) {
            return fail('ลงไลบรารีไม่สำเร็จ — ตอนนี้ API หยุดอยู่\n   1. เช็กเน็ต  2. ปิดหน้าต่าง/โปรแกรมที่เปิดอยู่ในโฟลเดอร์ api  3. กดอัปเดตอีกครั้ง\n   ยังไม่ได้: ปิดแอนตี้ไวรัส 10 นาทีแล้วกดใหม่');
        }
        fs.writeFileSync(path.join(api, 'node_modules', '.cafeflow-lock'), libs.hash);
    }

    console.log(`\n${C.b}[4/5] อัปเดตฐานข้อมูล (migrate)…${C.x}`);
    if (npm(['run', 'migrate'], path.join(ROOT, 'api')).status !== 0) {
        return fail('อัปเดตฐานข้อมูลไม่สำเร็จ — ถ่ายรูปข้อความด้านบนส่งช่าง · ไฟล์สำรองอยู่ใน backup\\');
    }

    console.log(`\n${C.b}[5/5] รีสตาร์ทด้วยโค้ดใหม่…${C.x}`);
    stopApi();
    if (!(await startApi())) {
        return fail('API ไม่กลับมา — เปิด logs\\api.err.log กับ logs\\start.log ถ่ายรูปบรรทัดท้าย ๆ ส่งช่าง');
    }
    console.log(`\n${C.g}${C.b}  ✓ อัปเดตเสร็จ — ระบบทำงานด้วยรุ่นใหม่แล้ว${C.x}`);
    console.log(`${C.dim}  หน้าเว็บที่เปิดค้างไว้ (แคชเชียร์ · ครัว · ตู้) โหลดรุ่นใหม่เอง${C.x}`);
    return true;
}

/* ── งานที่ทำในตัวเมนูเอง ──────────────────────────────────── */
function get(url, ms = 3000) {
    return new Promise((resolve) => {
        const req = http.get(url, { timeout: ms }, (res) => {
            let body = '';
            res.on('data', (b) => { body += b; });
            res.on('end', () => resolve({ ok: res.statusCode === 200, body }));
        });
        req.on('timeout', () => { req.destroy(); resolve({ ok: false, body: 'หมดเวลา' }); });
        req.on('error', (e) => resolve({ ok: false, body: e.code || e.message }));
    });
}

async function status() {
    const line = (ok, name, info) => console.log(`  ${ok ? C.g + '✓' : C.r + '✗'}${C.x} ${name.padEnd(22)} ${C.dim}${info}${C.x}`);
    console.log('\n  กำลังตรวจ…\n');
    const api = await get(`http://127.0.0.1:${PORT}/api/health`);
    let db = '';
    try { const j = JSON.parse(api.body); db = j.ok ? `ตอบใน ${j.db} ms` : ''; } catch { /* ไม่ใช่ JSON */ }
    line(api.ok, 'ระบบ (API)', api.ok ? `http://127.0.0.1:${PORT}` : 'ไม่ตอบ — ' + api.body + ' → ลอง "รีสตาร์ทระบบ"');
    line(api.ok && !!db, 'ฐานข้อมูล', db || 'ต่อไม่ได้ (ดูว่า Docker Desktop เปิดอยู่)');
    const ocr = await get('http://127.0.0.1:5101/health');
    let eng = '';
    try { eng = JSON.parse(ocr.body).engine || ''; } catch { /* */ }
    line(ocr.ok, 'ตัวอ่านสลิป (OCR)', ocr.ok ? 'ทำงาน · ' + eng : 'ไม่ตอบ — สลิปจะรอแคชเชียร์ยืนยันเอง (ร้านยังขายได้)');
    const ips = lanIps();
    line(ips.length > 0, 'เครือข่ายร้าน', ips.length ? ips.map((x) => x.ip).join(', ') : 'ยังไม่ได้ต่อ Wi-Fi/LAN');
}

function lanIps() {
    const out = [];
    for (const [name, list] of Object.entries(os.networkInterfaces())) {
        if (/vEthernet|WSL|Hyper-V|VirtualBox|VMware|Loopback|docker|vmnet/i.test(name)) continue;
        for (const a of list || []) {
            if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) out.push({ name, ip: a.address });
        }
    }
    return out.sort((a, b) => (b.ip.startsWith('192.168.') ? 1 : 0) - (a.ip.startsWith('192.168.') ? 1 : 0));
}

function showIp() {
    const ips = lanIps();
    if (!ips.length) { console.log(`\n  ${C.r}เครื่องนี้ยังไม่ได้ต่อ Wi-Fi/LAN ของร้าน${C.x}`); return; }
    console.log('\n  ที่อยู่เครื่องเซิร์ฟเวอร์ — กรอกตอนเปิด screen-edge.bat บนเครื่องอื่นครั้งแรก\n');
    ips.forEach((x, i) => console.log(`  ${i === 0 ? C.b + C.g : ''}http://${x.ip}:${PORT}${C.x}   ${C.dim}(${x.name})${C.x}`));
    console.log(`\n  ${C.dim}IP เปลี่ยนได้ถ้ายังไม่ได้ล็อกที่เราเตอร์ — เครื่องที่ตั้งไว้แล้วจะต่อไม่ติด ต้องกรอกใหม่ (screen-edge.bat ip)${C.x}`);
}

function showLogs() {
    const tail = (f, n) => {
        const p = path.join(ROOT, 'logs', f);
        if (!fs.existsSync(p)) { console.log(`  ${C.dim}(ยังไม่มี ${f})${C.x}`); return; }
        const lines = fs.readFileSync(p, 'utf8').trimEnd().split(/\r?\n/).slice(-n);
        lines.forEach((l) => console.log('  ' + l.slice(0, 200)));
    };
    for (const [f, n, title] of [['start.log', 8, 'การเปิดระบบ'], ['backup.log', 6, 'สำรองข้อมูล'],
                                 ['api.err.log', 10, 'ข้อผิดพลาดของระบบ'], ['api.log', 10, 'ระบบ (API)']]) {
        console.log(`\n${C.b}── ${title} (logs\\${f}) ──${C.x}`);
        tail(f, n);
    }
}

/* ── หน้าจอเมนู ─────────────────────────────────────────── */
let sel = PICKABLE[0];
let busy = false;

function draw() {
    console.clear();
    console.log(`${C.b}${C.g}  ☕ CafeFlow — เมนูดูแลระบบ${C.x}   ${C.dim}↑ ↓ เลือก · Enter ทำ · Esc ออก${C.x}\n`);
    let n = 0;
    ITEMS.forEach((it, i) => {
        if (!it.label) { if (it.group) console.log(`\n  ${C.dim}${it.group}${C.x}`); return; }
        n++;
        const num = it.run ? String(n).padStart(2) : ' 0';
        const text = ` ${num}  ${it.label} `;
        console.log(i === sel ? `  ${C.rev}${C.b}▶${text}${C.x}` : `   ${text}`);
    });
    const cur = ITEMS[sel];
    console.log(`\n  ${C.y}${cur.desc || ''}${C.x}`);
}

function move(d) {
    const k = PICKABLE.indexOf(sel);
    sel = PICKABLE[(k + d + PICKABLE.length) % PICKABLE.length];
    draw();
}

async function choose() {
    const it = ITEMS[sel];
    if (!it.run) return quit();
    busy = true;
    // หยุดอ่านก่อน แล้วค่อยออกจากโหมดดิบ — สลับกันบน Windows จะมีการอ่านบรรทัดค้างอยู่
    // บรรทัดแรกที่พิมพ์ในงานลูก (เช่น n ของล้างข้อมูลขาย) ถูกเมนูแย่งไป
    process.stdin.pause();
    process.stdin.setRawMode(false);
    // ให้ event loop ปิดการอ่านค้างให้เสร็จก่อน — งานลูกส่วนใหญ่ใช้ spawnSync ซึ่งบล็อก loop
    // ถ้าเรียกทันที การอ่านเก่าของเมนูยังค้าง แย่งบรรทัดที่พิมพ์ใน set /p ของ .bat (IP ใน "เปิดจอ")
    await new Promise((r) => setTimeout(r, 50));
    console.clear();
    console.log(`${C.b}${C.g}▶ ${it.label}${C.x}\n`);
    try { await it.run(); } catch (e) { console.log(`\n${C.r}ทำไม่สำเร็จ: ${e.message}${C.x}`); }
    process.stdin.resume();
    await new Promise((r) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(`\n${C.dim}กด Enter เพื่อกลับเมนู…${C.x}`, () => { rl.close(); r(); });
    });
    if (reloadAfter) {
        // เพิ่งอัปเดต — เมนูที่รันอยู่เป็นรุ่นเก่าในหน่วยความจำ เปิดตัวใหม่จากไฟล์แทน
        process.stdin.pause();
        const r = spawnSync(process.execPath, [path.join(__dirname, 'menu.js')], { stdio: 'inherit', cwd: ROOT });
        process.exit(r.status || 0);
    }
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    busy = false;
    draw();
}

function quit() { console.clear(); process.exit(0); }

// ขั้นหลัง git pull ของการอัปเดต — update() ของเมนูรุ่นก่อนเรียกไฟล์นี้ (รุ่นใหม่) ด้วย flag นี้
if (process.argv.includes('--update-finish')) {
    updateFinish().then((ok) => process.exit(ok ? 0 : 1), (e) => { console.error(e); process.exit(1); });
    return;
}
if (!process.stdin.isTTY) {
    console.error('เปิดเมนูนี้ในหน้าต่างคำสั่ง — ดับเบิลคลิก ops\\cafeflow.bat');
    process.exit(1);
}
readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdin.on('keypress', (str, key) => {
    if (busy || !key) return;
    if (key.name === 'up') move(-1);
    else if (key.name === 'down') move(1);
    else if (key.name === 'return') choose();
    else if (key.name === 'escape' || key.name === 'q' || (key.ctrl && key.name === 'c')) quit();
    else if (/^[0-9]$/.test(str || '')) {
        const n = Number(str);
        const target = n === 0 ? PICKABLE[PICKABLE.length - 1] : PICKABLE[n - 1];
        if (target != null) { sel = target; draw(); choose(); }
    }
});
draw();
