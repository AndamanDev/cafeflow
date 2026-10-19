#!/usr/bin/env node
/**
 * CafeFlow — เปลี่ยนรหัสผ่านฐานข้อมูลจากค่าเริ่มต้น (cafeflow_dev) เป็นรหัสสุ่ม
 * ══════════════════════════════════════════════════════════════════
 * ทำครั้งเดียวต่อเครื่อง ตอนติดตั้งร้าน (รันซ้ำได้ ได้รหัสใหม่ทุกครั้ง)
 *
 *   node ops/tools/rotate-db-password.js
 *   แล้วรีสตาร์ท API: ops\tools\restart-api.bat
 *
 * ลำดับ (กันกรณีเปลี่ยนรหัสในฐานแล้วแต่ .env ไม่ตาม → API ต่อฐานไม่ได้ทั้งร้าน):
 *   1. เขียน .env ฉบับใหม่ลงไฟล์ชั่วคราวก่อน — เขียนไม่ได้ก็หยุด ฐานยังไม่ถูกแตะ
 *   2. ALTER ROLE ในฐาน
 *   3. สลับไฟล์ชั่วคราวเป็น .env · ล้มตรงนี้ → พิมพ์รหัสใหม่ให้ใส่เอง
 *   4. ลองต่อด้วยรหัสใหม่ยืนยัน
 *
 * API ที่รันอยู่ไม่สะดุดทันที (การเชื่อมต่อเดิมยังใช้ได้) แต่ต่อใหม่ไม่ได้จนกว่าจะรีสตาร์ท
 * backup.js / restore ใช้ docker exec (ต่อผ่าน socket ใน container) ไม่ต้องใช้รหัสนี้
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require(path.join(ROOT, 'api', 'node_modules', 'pg'));
const { loadEnv } = require(path.join(ROOT, 'api', 'src', 'env'));

const ENV = path.join(ROOT, '.env');

async function main() {
    if (!loadEnv(ENV)) throw new Error('ไม่พบ .env ที่ ' + ENV + ' — คัดลอกจาก .env.example ก่อน');

    const conn = {
        host: process.env.PGHOST || '127.0.0.1',
        port: parseInt(process.env.PGPORT || '5433', 10),
        database: process.env.PGDATABASE || 'cafeflow',
        user: process.env.PGUSER || 'cafeflow',
    };
    const oldPw = process.env.PGPASSWORD || 'cafeflow_dev';
    // hex ล้วน — ไม่มีอักขระที่ต้อง escape ทั้งใน SQL และใน .env
    const newPw = crypto.randomBytes(24).toString('hex');

    // 1. .env ฉบับใหม่ลงไฟล์ชั่วคราว (เก็บบรรทัดอื่นไว้ตามเดิม)
    const text = fs.readFileSync(ENV, 'utf8');
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    let found = false;
    const next = text.split(/\r?\n/).map((l) => {
        if (/^\s*PGPASSWORD\s*=/.test(l)) { found = true; return 'PGPASSWORD=' + newPw; }
        return l;
    });
    if (!found) next.push('PGPASSWORD=' + newPw);
    const tmp = ENV + '.tmp';
    fs.writeFileSync(tmp, next.join(eol));

    // 2. เปลี่ยนในฐาน
    const c = new Client({ ...conn, password: oldPw });
    try {
        await c.connect();
        await c.query(`ALTER ROLE "${conn.user.replace(/"/g, '""')}" PASSWORD '${newPw}'`);
    } catch (e) {
        fs.rmSync(tmp, { force: true });
        throw new Error('เปลี่ยนรหัสในฐานไม่สำเร็จ (ยังไม่ได้แก้ .env): ' + e.message);
    } finally {
        await c.end().catch(() => {});
    }

    // 3. สลับ .env
    try {
        fs.renameSync(tmp, ENV);
    } catch (e) {
        console.error('!! เปลี่ยนรหัสในฐานแล้ว แต่เขียน .env ไม่ได้: ' + e.message);
        console.error('!! แก้ .env เองให้เป็น:  PGPASSWORD=' + newPw);
        process.exit(2);
    }

    // 4. ยืนยันด้วยรหัสใหม่
    const v = new Client({ ...conn, password: newPw });
    await v.connect();
    await v.query('SELECT 1');
    await v.end();

    console.log('✔ เปลี่ยนรหัสฐานข้อมูลแล้ว และบันทึกลง .env');
    console.log('  ต่อไป: รีสตาร์ท API ด้วย ops\\tools\\restart-api.bat');
}

main().catch((e) => { console.error('✖ ' + e.message); process.exit(1); });
