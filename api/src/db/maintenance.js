/**
 * CafeFlow — ล้างของเก่าที่ไม่มีใครใช้แล้ว (รันเองในเซิร์ฟเวอร์ ตอนสตาร์ท + ทุก 6 ชม.)
 *
 * ทำไมต้องมี: ตารางพวกนี้มีแต่คนเขียน ไม่มีใครลบ — โตไปเรื่อย ๆ จนสำรอง/กู้ช้าลงทุกวัน
 *   session     หมดอายุ/ถูกยกเลิกเกิน 7 วัน — ใช้ล็อกอินไม่ได้แล้ว เก็บไว้แค่ดูย้อนหลังสั้น ๆ
 *   change_log  เกิน 30 วัน — หน้าจอไม่ได้อ่านตารางนี้ (stream ใช้ประวัติในหน่วยความจำ ดู stream.js)
 *
 * ★ ไม่แตะ cf_order / payment / audit_log / print_job — เป็นข้อมูลบัญชีและหลักฐาน ต้องเก็บ
 */
'use strict';

const EVERY_MS = 6 * 3600 * 1000;

const JOBS = [
    ['session', `DELETE FROM session
                  WHERE expires_at < now() - interval '7 days'
                     OR revoked_at < now() - interval '7 days'`],
    ['change_log', `DELETE FROM change_log WHERE at < now() - interval '30 days'`],
];

async function runMaintenance(query, log) {
    for (const [name, sql] of JOBS) {
        try {
            const r = await query(sql);
            if (r.rowCount) log.info(`[maintenance] ลบ ${name} เก่า ${r.rowCount} แถว`);
        } catch (err) {
            log.warn(`[maintenance] ล้าง ${name} ไม่สำเร็จ: ${err.message}`);
        }
    }
}

function startMaintenance(query, log) {
    runMaintenance(query, log);
    setInterval(() => runMaintenance(query, log), EVERY_MS).unref();
}

module.exports = { startMaintenance, runMaintenance };
