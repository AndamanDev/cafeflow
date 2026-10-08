/**
 * CafeFlow — ล้างข้อมูลธุรกรรม (ออเดอร์ · การชำระเงิน · รอบขาย · log) ก่อนเปิดร้านจริง
 *
 * เก็บไว้: สาขา หมวด สินค้า ราคา ตัวเลือก ผู้ใช้ อุปกรณ์ (การจับคู่ไม่หลุด) ค่าตั้ง
 * ลบ:     ออเดอร์ทั้งหมด + ของที่ผูกกับออเดอร์ · รอบขาย · เลขคิว · change_log · audit_log
 *         session ที่หมดอายุ/ถูกยกเลิก (คนที่ล็อกอินอยู่ไม่หลุด) · ภาพสลิปใน data/slips
 *
 *   node src/db/clear-transactions.js         ดูว่าจะลบอะไรบ้าง (ไม่ลบจริง)
 *   node src/db/clear-transactions.js --yes   ลบจริง — ต้องมีไฟล์สำรองอายุไม่เกิน 15 นาทีใน backup/
 *
 * ⚠️ ลบแล้วไม่มีปุ่มย้อน ทางเดียวคือกู้จากไฟล์สำรอง (ops/restore.sh)
 *    หลังล้าง ยังไม่มีรอบเปิด — ผู้จัดการต้องกด "เปิดรอบ" ที่หน้าปิดรอบก่อนคีออสก์จะรับออเดอร์
 */
'use strict';
const fs = require('fs');
const path = require('path');
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

    if (!yes) {
        console.log('\nยังไม่ได้ลบอะไร — สำรองข้อมูลก่อน (ops/backup.sh) แล้วรันใหม่พร้อม --yes');
        return;
    }

    const b = latestBackup();
    if (!b || Date.now() - b.t > BACKUP_MAX_AGE_MS) {
        console.error('\n!! ไม่พบไฟล์สำรองที่ทำภายใน 15 นาที ใน ' + BACKUP_DIR);
        console.error('   รัน ops/backup.sh ก่อน (Git Bash) แล้วค่อยล้าง');
        process.exitCode = 1;
        return;
    }
    console.log('\nไฟล์สำรองล่าสุด: ' + b.f);

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
    console.log('ล้างเรียบร้อย — เปิด npm start แล้วกด "เปิดรอบ" ที่หน้าปิดรอบ ก่อนคีออสก์จะรับออเดอร์');
}

main()
    .catch((err) => { console.error('ล้างไม่สำเร็จ:', err.message); process.exitCode = 1; })
    .finally(() => pool.end());
