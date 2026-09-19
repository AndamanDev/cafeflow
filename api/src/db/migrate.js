/**
 * CafeFlow — ตัวรัน migration
 *
 * เขียนเองแทนการลง node-pg-migrate เพราะที่สเกลนี้ต้องการแค่
 * "รันไฟล์ .sql ตามลำดับ ครั้งเดียว ในทรานแซกชัน" — และตัวที่เขียนเองอ่านออก
 * ตอนตีสามที่ร้านเปิดไม่ได้ ซึ่งสำคัญกว่าฟีเจอร์ที่ไม่ได้ใช้
 *
 *   node src/db/migrate.js            รัน migration ที่ยังไม่เคยรัน
 *   node src/db/migrate.js --reset    ลบ schema ทิ้งแล้วรันใหม่ทั้งหมด (dev เท่านั้น)
 *   node src/db/migrate.js --status   ดูว่ารันอะไรไปแล้วบ้าง
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pool, waitReady } = require('./pool');

const DIR = path.resolve(__dirname, '..', '..', '..', 'db', 'migrations');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

async function ensureTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS schema_migration (
            name      text PRIMARY KEY,
            checksum  text NOT NULL,
            ran_at    timestamptz NOT NULL DEFAULT now()
        )`);
}

function files() {
    if (!fs.existsSync(DIR)) return [];
    return fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
}

async function reset() {
    // ไม่ใช้ DROP DATABASE เพราะเราต่ออยู่กับมัน — ล้าง schema แทน
    console.log('!! --reset: ลบข้อมูลทั้งหมดใน schema public');
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
}

async function run() {
    await waitReady();
    if (process.argv.includes('--reset')) await reset();
    await ensureTable();

    const done = new Map(
        (await pool.query('SELECT name, checksum FROM schema_migration')).rows
            .map((r) => [r.name, r.checksum]));

    if (process.argv.includes('--status')) {
        for (const f of files()) console.log((done.has(f) ? '  ✓ ' : '  · ') + f);
        return;
    }

    let applied = 0;
    for (const name of files()) {
        const sql = fs.readFileSync(path.join(DIR, name), 'utf8');
        const sum = sha(sql);

        if (done.has(name)) {
            // ไฟล์ที่รันไปแล้วถูกแก้ = ฐานจริงกับโค้ดไม่ตรงกันโดยที่ไม่มีใครรู้
            // ต้องดังทันที ไม่ใช่ปล่อยผ่าน
            if (done.get(name) !== sum) {
                console.error(`\nMIGRATION ผิดพลาด: ${name} ถูกแก้หลังจากรันไปแล้ว`);
                console.error('  แก้ไฟล์ที่รันแล้วไม่ได้ — ให้สร้างไฟล์ migration ใหม่แทน');
                process.exit(1);
            }
            continue;
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(sql);
            await client.query(
                'INSERT INTO schema_migration (name, checksum) VALUES ($1, $2)', [name, sum]);
            await client.query('COMMIT');
            console.log('  ✓ ' + name);
            applied++;
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('  ✗ ' + name + ' — ' + err.message);
            process.exit(1);
        } finally {
            client.release();
        }
    }
    console.log(applied ? `รัน migration ${applied} ไฟล์` : 'ฐานข้อมูลเป็นรุ่นล่าสุดแล้ว');
}

run()
    .then(() => pool.end())
    .catch((err) => { console.error(err); process.exit(1); });
