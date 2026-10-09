#!/usr/bin/env node
/**
 * CafeFlow — สำรองฐานข้อมูล (Windows / ทุกระบบ — ไม่ต้องมี Git Bash)
 * ══════════════════════════════════════════════════════════════════
 * ทำเหมือน ops/backup.sh: pg_dump "จากใน container" (เวอร์ชันตรงกับฐานเสมอ) แบบ -Fc
 * + ไฟล์ .counts ไว้เทียบตอนกู้ + คัดลอกภาพสลิป/รูปสินค้า (data/) เฉพาะไฟล์ใหม่ + ลบไฟล์เก่าเกิน 30 วัน
 *
 * ถูกเรียกอัตโนมัติ 2 ทาง:
 *   · Task Scheduler "CafeFlow Backup" ทุกคืน 23:30 (ตั้งโดย ops/install-autostart.js)
 *     เครื่องปิดตอนนั้น → ทำตอนเปิดเครื่องครั้งถัดไป (StartWhenAvailable)
 *   · API หลังปิดรอบสำเร็จ (ยอดของรอบนั้นอยู่ในไฟล์สำรองทันที)
 *
 *   node ops/backup.js                 สำรองหนึ่งครั้ง
 *   node ops/backup.js --reason=shift  (ใส่เหตุผลลง log)
 *
 * log: logs/backup.log · ไฟล์: backup/cafeflow-YYYYMMDD-HHMMSS.dump
 * กู้คืน: ops/restore.sh (Git Bash) — ดู ops/README.md
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CONTAINER = process.env.CF_DB_CONTAINER || 'cafeflow-db';
const DB = process.env.PGDATABASE || 'cafeflow';
const USER = process.env.PGUSER || 'cafeflow';
const OUT = process.env.CF_BACKUP_DIR || path.join(ROOT, 'backup');
const KEEP_DAYS = Number(process.env.CF_BACKUP_KEEP_DAYS || 30);
const LOGS = path.join(ROOT, 'logs');
const reason = (process.argv.find((a) => a.startsWith('--reason=')) || '').slice(9) || 'manual';

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(LOGS, { recursive: true });
const stamp = () => new Date().toLocaleString('sv-SE').replace('T', ' ');
function log(m) {
    const line = `${stamp()}  ${m}`;
    console.log(line);
    try { fs.appendFileSync(path.join(LOGS, 'backup.log'), line + '\n'); } catch { /* ไม่เป็นไร */ }
}
function fail(m) { log('!! ' + m); process.exit(1); }

/* ── กันรันซ้อน (ปิดรอบตรงกับเวลา Task พอดี) ── */
const LOCK = path.join(OUT, '.backup.lock');
try {
    const st = fs.statSync(LOCK);
    if (Date.now() - st.mtimeMs < 10 * 60 * 1000) { log('มีการสำรองทำงานอยู่ — ข้าม'); process.exit(0); }
} catch { /* ไม่มีล็อก */ }
fs.writeFileSync(LOCK, String(process.pid));
const unlock = () => { try { fs.unlinkSync(LOCK); } catch { /* ไม่เป็นไร */ } };
process.on('exit', unlock);

/* ── ฐานข้อมูลต้องทำงานอยู่ ── */
const ps = spawnSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8', windowsHide: true });
if (ps.status !== 0 || !String(ps.stdout).split(/\r?\n/).includes(CONTAINER)) {
    fail(`ไม่พบ container '${CONTAINER}' ที่กำลังทำงาน — สำรองไม่ได้ (${reason})`);
}

const d = new Date();
const p2 = (n) => String(n).padStart(2, '0');
const name = `cafeflow-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.dump`;
const file = path.join(OUT, name);

log(`เริ่มสำรอง (${reason}) → ${name}`);
const out = fs.createWriteStream(file);
const dump = spawn('docker', ['exec', CONTAINER, 'pg_dump', '-U', USER, '-d', DB, '-Fc', '--no-owner', '--no-acl'],
    { windowsHide: true });
let errText = '';
dump.stderr.on('data', (b) => { errText += b; });
dump.stdout.pipe(out);
// รอทั้งสองอย่าง: pg_dump จบ และไฟล์เขียนลงดิสก์ครบ (ลำดับที่สองอย่างนี้จบไม่แน่นอน)
Promise.all([new Promise((r) => dump.on('close', r)), new Promise((r) => out.on('close', r))]).then(([code]) => {
    {
        const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
        if (code !== 0 || size < 4096) {
            try { fs.unlinkSync(file); } catch { /* ไม่เป็นไร */ }
            fail(`pg_dump ไม่สำเร็จ (code ${code}, ${size} ไบต์) ${errText.trim().slice(0, 200)}`);
        }

        // จำนวนแถวไว้เทียบตอนกู้ ว่าได้ข้อมูลกลับมาครบจริง
        const counts = spawnSync('docker', ['exec', CONTAINER, 'psql', '-U', USER, '-d', DB, '-t', '-A', '-F,', '-c',
            `SELECT 'cf_order', count(*) FROM cf_order UNION ALL SELECT 'order_item', count(*) FROM order_item
             UNION ALL SELECT 'payment', count(*) FROM payment UNION ALL SELECT 'product', count(*) FROM product
             UNION ALL SELECT 'product_price', count(*) FROM product_price UNION ALL SELECT 'shift', count(*) FROM shift
             UNION ALL SELECT 'audit_log', count(*) FROM audit_log ORDER BY 1`], { encoding: 'utf8', windowsHide: true });
        if (counts.status === 0) fs.writeFileSync(file + '.counts', counts.stdout);

        // ภาพสลิป/รูปสินค้า — ชื่อไฟล์เป็น hash ของเนื้อไฟล์ ไม่มีวันถูกแก้ทับ → คัดลอกเฉพาะไฟล์ใหม่
        let added = 0;
        const copyNew = (src, dst) => {
            if (!fs.existsSync(src)) return;
            for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
                const s = path.join(src, ent.name), t = path.join(dst, ent.name);
                if (ent.isDirectory()) { fs.mkdirSync(t, { recursive: true }); copyNew(s, t); }
                else if (!fs.existsSync(t)) { fs.copyFileSync(s, t); added++; }
            }
        };
        try { fs.mkdirSync(path.join(OUT, 'data'), { recursive: true }); copyNew(path.join(ROOT, 'data'), path.join(OUT, 'data')); }
        catch (e) { log('!! คัดลอก data/ ไม่ครบ: ' + e.message); }

        // ลบไฟล์สำรองฐานข้อมูลที่เก่ากว่า KEEP_DAYS — เหลือไว้อย่างน้อย 7 ไฟล์เสมอ (เครื่องปิดนาน ๆ ไม่ลบหมด)
        const dumps = fs.readdirSync(OUT).filter((f) => /^cafeflow-.*\.dump$/.test(f)).sort();
        const cutoff = Date.now() - KEEP_DAYS * 86400000;
        let removed = 0;
        dumps.slice(0, Math.max(0, dumps.length - 7)).forEach((f) => {
            const fp = path.join(OUT, f);
            if (fs.statSync(fp).mtimeMs < cutoff) {
                fs.unlinkSync(fp);
                try { fs.unlinkSync(fp + '.counts'); } catch { /* ไม่มี */ }
                removed++;
            }
        });

        log(`สำเร็จ ${Math.round(size / 1024)} KB · ไฟล์ใน data/ ใหม่ ${added} · ลบไฟล์เก่า ${removed}`);
        process.exit(0);
    }
});
