/**
 * CafeFlow — การเชื่อมต่อฐานข้อมูล
 *
 * ทุก write ต้องผ่าน tx() เพื่อให้ "ข้อมูล + audit + change_log + outbox"
 * ลงพร้อมกันหรือไม่ลงเลย — ถ้าแยกกันเมื่อไหร่ audit จะโกหก
 */
'use strict';
const { Pool } = require('pg');
const { loadEnv } = require('../env');

loadEnv();

const pool = new Pool({
    host: process.env.PGHOST || '127.0.0.1',
    port: parseInt(process.env.PGPORT || '5433', 10),
    database: process.env.PGDATABASE || 'cafeflow',
    user: process.env.PGUSER || 'cafeflow',
    password: process.env.PGPASSWORD || 'cafeflow_dev',
    max: 10,
    idleTimeoutMillis: 30000,
    // ร้านอยู่ไทย — ให้ทุก session ตัดวันตามเวลาไทย ไม่ใช่ UTC
    // ไม่งั้น "ยอดวันนี้" หลังห้าทุ่มจะไปโผล่วันถัดไป
    options: '-c timezone=Asia/Bangkok',
});

pool.on('error', (err) => {
    // การเชื่อมต่อที่ idle แล้วหลุดไม่ควรทำให้ทั้งเซิร์ฟเวอร์ตาย
    console.error('[db] idle client error:', err.message);
});

function query(text, params) {
    return pool.query(text, params);
}

/**
 * รันหลายคำสั่งในทรานแซกชันเดียว
 *   await tx(async (c) => { await c.query(...); return something; })
 */
async function tx(fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const out = await fn(client);
        await client.query('COMMIT');
        return out;
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch { /* การเชื่อมต่อตายไปแล้ว */ }
        throw err;
    } finally {
        client.release();
    }
}

/** รอจนฐานข้อมูลพร้อม — ตอน docker compose up ทั้งชุด DB มักช้ากว่า API */
async function waitReady(tries = 30, delayMs = 1000) {
    for (let i = 1; i <= tries; i++) {
        try {
            await pool.query('SELECT 1');
            return true;
        } catch (err) {
            if (i === tries) throw err;
            await new Promise((r) => setTimeout(r, delayMs));
        }
    }
    return false;
}

module.exports = { pool, query, tx, waitReady };
