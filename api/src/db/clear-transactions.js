/**
 * CafeFlow — ล้างข้อมูลธุรกรรม (ออเดอร์ · การชำระเงิน · รอบขาย · log) ก่อนเปิดร้านจริง
 *
 * เก็บไว้: สาขา หมวด สินค้า ราคา ตัวเลือก ผู้ใช้ อุปกรณ์ (การจับคู่ไม่หลุด) ค่าตั้ง
 * ลบ:     ออเดอร์ทั้งหมด + ของที่ผูกกับออเดอร์ · รอบขาย · เลขคิว · change_log · audit_log
 *         session ที่หมดอายุ/ถูกยกเลิก (คนที่ล็อกอินอยู่ไม่หลุด) · ภาพสลิปใน data/slips
 *
 *   npm run clear-tx                          แสดงจำนวน → ถาม: สำรองก่อนไหม · ลบไฟล์สำรองเก่าด้วยไหม · พิมพ์ YES → ลบ
 *                                             (ผู้ใช้ขอ 19/10/2569 — เลือกไม่สำรองได้)
 *   ops\cafeflow.bat › "ล้างข้อมูลขาย"        เหมือน npm run clear-tx (ops\clear-sales.bat เดิมเลิกใช้ 19/10/2569)
 *   node src/db/clear-transactions.js --yes   ลบจริงแบบไม่ถาม — ต้องมีไฟล์สำรองอายุไม่เกิน 15 นาทีใน backup/
 *                                             (เพิ่ม --no-backup = ไม่ต้องมีไฟล์สำรอง)
 *
 * ⚠️ ลบแล้วไม่มีปุ่มย้อน ทางเดียวคือกู้จากไฟล์สำรองใน backup/ (pg_restore)
 *    หลังล้าง ยังไม่มีรอบเปิด — ผู้จัดการต้องกด "เปิดรอบ" ที่หน้าปิดรอบก่อนคีออสก์จะรับออเดอร์
 */
'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');
const { pool, tx, waitReady } = require('./pool');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const BACKUP_DIR = process.env.CF_BACKUP_DIR || path.join(ROOT, 'backup');
const SLIP_DIR = path.join(ROOT, 'data', 'slips');
const BACKUP_MAX_AGE_MS = 15 * 60 * 1000;

/** ตารางที่ล้างทั้งตาราง — TRUNCATE ทีเดียวพร้อมกัน FK ระหว่างกันจึงไม่ติด */
const TABLES = [
    'cf_order', 'order_item', 'order_item_modifier', 'order_station_status',
    'payment', 'payment_qr', 'payment_slip', 'print_job',
    'shift', 'order_seq', 'change_log', 'audit_log', 'idempotency', 'outbox',
];
const STALE_SESSION = 'expires_at < now() OR revoked_at IS NOT NULL';

function latestBackup() {
    if (!fs.existsSync(BACKUP_DIR)) return null;
    const files = fs.readdirSync(BACKUP_DIR)
        .filter((f) => f.endsWith('.dump'))
        .map((f) => ({ f, t: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
    return files[0] || null;
}

/** ไฟล์สำรองเก่า: cafeflow-*.dump + .counts · ภาพสลิปที่สำรองไว้ (backup/data/slips) — รูปสินค้าที่สำรองไว้ไม่แตะ */
function backupFiles() {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    return fs.readdirSync(BACKUP_DIR).filter((f) => /^cafeflow-.*\.dump(\.counts)?$/.test(f))
        .map((f) => path.join(BACKUP_DIR, f));
}
function sizeOf(p) {
    if (!fs.existsSync(p)) return 0;
    const st = fs.statSync(p);
    if (!st.isDirectory()) return st.size;
    return fs.readdirSync(p).reduce((a, f) => a + sizeOf(path.join(p, f)), 0);
}
function ask(rl, q) { return new Promise((r) => rl.question(q, (a) => r(String(a || '').trim()))); }

function countSlipFiles(dir) {
    if (!fs.existsSync(dir)) return 0;
    let n = 0;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        n += ent.isDirectory() ? countSlipFiles(path.join(dir, ent.name)) : 1;
    }
    return n;
}

async function main() {
    const yes = process.argv.includes('--yes');
    await waitReady();

    console.log('จำนวนแถวที่จะถูกลบ:');
    for (const t of TABLES) {
        const n = (await pool.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
        console.log(`  ${t.padEnd(22)} ${n}`);
    }
    const sess = (await pool.query(`SELECT count(*)::int AS n FROM session WHERE ${STALE_SESSION}`)).rows[0].n;
    console.log(`  ${'session (หมดอายุ)'.padEnd(22)} ${sess}`);
    console.log(`  ${'ภาพสลิป (ไฟล์)'.padEnd(22)} ${countSlipFiles(SLIP_DIR)}`);

    // --ask = บังคับถามแม้ stdin ไม่ใช่หน้าต่างคำสั่ง (ใช้ทดสอบ)
    const interactive = !yes && (process.stdin.isTTY || process.argv.includes('--ask'));
    let doBackup = !process.argv.includes('--no-backup');
    let dropOld = false;

    if (!yes && !interactive) {
        console.log('\nยังไม่ได้ลบอะไร — รันในหน้าต่างคำสั่งเพื่อให้ถาม (ops\\cafeflow.bat › ล้างข้อมูลขาย)');
        return;
    }

    if (interactive) {
        // ถามทีละข้อ (ผู้ใช้ขอ 19/10/2569) — ค่าเริ่ม (กด Enter) คือทางที่ปลอดภัย: สำรอง · ไม่ลบไฟล์สำรองเก่า
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        try {
            console.log('\nเก็บไว้: เมนู ราคา ตัวเลือก ผู้ใช้ อุปกรณ์ เครื่องพิมพ์ ค่าตั้ง');
            doBackup = !/^n/i.test(await ask(rl, '\n1) สำรองข้อมูลก่อนลบไหม? [Y = สำรอง / n = ไม่สำรอง] : '));
            const old = backupFiles();
            const slipCopy = path.join(BACKUP_DIR, 'data', 'slips');
            if (old.length || fs.existsSync(slipCopy)) {
                const mb = ((old.reduce((a, f) => a + sizeOf(f), 0) + sizeOf(slipCopy)) / 1048576).toFixed(1);
                const dumps = old.filter((f) => f.endsWith('.dump')).length;
                dropOld = /^y/i.test(await ask(rl,
                    `2) ลบไฟล์สำรองเก่าทั้งหมดด้วยไหม? (${dumps} ไฟล์ + ภาพสลิปที่สำรองไว้ · ${mb} MB) [y = ลบ / N = เก็บไว้] : `));
            }
            console.log('\nสรุป: ' + (doBackup ? 'สำรองก่อน' : '⚠ ไม่สำรอง') + ' → ลบข้อมูลขายทั้งหมด' +
                (dropOld ? ' → ลบไฟล์สำรองเก่า' + (doBackup ? ' (เก็บไฟล์ที่เพิ่งสำรอง)' : '') : ''));
            if (!doBackup && (dropOld || !latestBackup())) {
                console.log('⚠ หลังลบจะไม่มีไฟล์สำรองเหลือเลย — ย้อนกลับไม่ได้ทุกกรณี');
            }
            const ok = await ask(rl, '3) พิมพ์ YES เพื่อเริ่มลบ (อย่างอื่น = ยกเลิก) : ');
            if (ok !== 'YES') { console.log('ยกเลิก — ยังไม่ได้ลบอะไร'); return; }
        } finally { rl.close(); }

        if (doBackup) {
            console.log('\n[สำรอง] กำลังสำรองฐานข้อมูล…');
            const r = spawnSync(process.execPath, [path.join(ROOT, 'ops', 'backup.js'), '--reason=before-clear'],
                { stdio: 'inherit', cwd: ROOT });
            if (r.status !== 0) {
                console.error('!! สำรองไม่สำเร็จ — ยังไม่ได้ลบอะไร (ตรวจว่า Docker เปิดอยู่ แล้วลองใหม่)');
                process.exitCode = 1;
                return;
            }
        }
    }

    if (doBackup) {
        const b = latestBackup();
        if (!b || Date.now() - b.t > BACKUP_MAX_AGE_MS) {
            console.error('\n!! ไม่พบไฟล์สำรองที่ทำภายใน 15 นาที ใน ' + BACKUP_DIR);
            console.error('   รัน node ops/backup.js ก่อน (หรือใช้ npm run clear-tx ที่ถามและสำรองให้) แล้วค่อยล้าง');
            process.exitCode = 1;
            return;
        }
        console.log('\nไฟล์สำรองล่าสุด: ' + b.f);
    } else {
        console.log('\nไม่สำรองตามที่เลือก');
    }

    await tx(async (c) => {
        await c.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY`);
        await c.query(`DELETE FROM session WHERE ${STALE_SESSION}`);
    });
    // ไฟล์ลบหลังฐาน commit แล้ว — ถ้าฐานล้มกลางทาง ภาพสลิปยังอยู่ครบกับออเดอร์
    if (fs.existsSync(SLIP_DIR)) {
        for (const ent of fs.readdirSync(SLIP_DIR)) {
            fs.rmSync(path.join(SLIP_DIR, ent), { recursive: true, force: true });
        }
    }
    // ลบไฟล์สำรองเก่าหลังล้างฐานสำเร็จแล้ว — ถ้าที่สำรองไว้เพิ่งทำ เก็บไฟล์นั้นไว้
    if (dropOld) {
        const keep = doBackup ? latestBackup() : null;
        const keepBase = keep ? keep.f : null;
        let n = 0;
        for (const f of backupFiles()) {
            const base = path.basename(f);
            if (keepBase && (base === keepBase || base === keepBase + '.counts')) continue;
            fs.rmSync(f, { force: true });
            n++;
        }
        fs.rmSync(path.join(BACKUP_DIR, 'data', 'slips'), { recursive: true, force: true });
        console.log(`ลบไฟล์สำรองเก่า ${n} ไฟล์ + ภาพสลิปที่สำรองไว้` + (keepBase ? ` · เก็บ ${keepBase}` : ''));
    }
    console.log('ล้างเรียบร้อย — รีเฟรชทุกจอ แล้วกด "เปิดรอบ" ที่หน้าปิดรอบ ก่อนคีออสก์จะรับออเดอร์');
}

main()
    .catch((err) => { console.error('ล้างไม่สำเร็จ:', err.message); process.exitCode = 1; })
    .finally(() => pool.end());
