/**
 * CafeFlow — ใส่ข้อมูลตั้งต้นลง PostgreSQL
 *
 * อ่านจาก app/js/cf-data.js ซึ่งเป็นไฟล์เดียวกับที่เว็บแอปใช้ — ไม่พิมพ์เมนู
 * 80 รายการใหม่ เพราะพิมพ์ใหม่แปลว่าพิมพ์ผิด และวันหนึ่งสองที่จะไม่ตรงกัน
 *
 * ใส่เฉพาะข้อมูลตั้งต้นของร้าน (ผู้ใช้ อุปกรณ์ หมวด สินค้า กฎตัวเลือก ค่าตั้ง)
 * ออเดอร์/การชำระเงินตัวอย่างใส่เมื่อสั่ง --demo เท่านั้น — ของจริงต้องเริ่มจากศูนย์
 *
 *   node src/db/seed.js           ข้อมูลตั้งต้น
 *   node src/db/seed.js --demo    ใส่ออเดอร์ตัวอย่างด้วย (สำหรับเดโม/ทดสอบ)
 *   node src/db/seed.js --force   เขียนทับแม้มีข้อมูลอยู่แล้ว
 */
'use strict';
const path = require('path');
const argon2 = require('argon2');
const { pool, tx, waitReady } = require('./pool');
const { loadEnv } = require('../env');

loadEnv();

const { CF_SEED } = require(path.resolve(__dirname, '..', '..', '..', 'app', 'js', 'cf-data.js'));

const DEMO = process.argv.includes('--demo');
const FORCE = process.argv.includes('--force');

/** คีย์ค่าตั้งที่เป็นข้อมูลของสาขา ไม่ใช่ค่าตั้งระบบ — ย้ายไปอยู่ตาราง branch */
const BRANCH_KEYS = ['shopName', 'branch', 'address', 'taxId', 'vatPercent'];

async function seed(c) {
    const db = CF_SEED(new Date());
    const s = db.settings;

    /* ── สาขา ── */
    const branchId = (await c.query(
        `INSERT INTO branch (code, name_th, address, tax_id, vat_registered, vat_percent,
                             promptpay_id)
         VALUES ($1, $2, $3, $4, false, $5, $6)
         ON CONFLICT (code) DO UPDATE SET name_th = EXCLUDED.name_th
         RETURNING id`,
        [process.env.CF_BRANCH_CODE || 'MAIN', s.shopName, s.address, s.taxId,
         s.vatPercent || 7, process.env.CF_PROMPTPAY_ID || null])).rows[0].id;

    /* ── ผู้ใช้ — รหัสผ่านต้องเป็น hash ตั้งแต่แถวแรกที่ลงฐาน ── */
    for (const u of db.users) {
        const hash = await argon2.hash(u.password, { type: argon2.argon2id });
        await c.query(
            `INSERT INTO app_user (id, branch_id, username, password_hash, name_th, role,
                                   override_limit, active)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (id) DO UPDATE SET name_th = EXCLUDED.name_th, role = EXCLUDED.role`,
            [u.id, branchId, u.username, hash, u.name, u.role, u.overrideLimit, u.active]);
    }

    /* ── อุปกรณ์ ── */
    for (const d of db.devices) {
        await c.query(
            `INSERT INTO device (id, branch_id, kind, name_th, ip, assigned_station,
                                 assigned_cashier, paper_width, last_seen_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL)
             ON CONFLICT (id) DO UPDATE SET name_th = EXCLUDED.name_th, ip = EXCLUDED.ip`,
            [d.id, branchId, d.type, d.name, d.ip, d.assignedStation, d.assignedCashier,
             d.type === 'PRINTER' ? (s.kitchenSlipWidth || '58mm') : '80mm']);
    }
    // สถานะ ONLINE/OFFLINE ไม่ได้ seed — ของจริงมาจาก heartbeat เท่านั้น

    /* ── หมวด ── */
    for (const cat of db.categories) {
        await c.query(
            `INSERT INTO category (id, branch_id, name_th, name_en, sort, active)
             VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE
             SET name_th = EXCLUDED.name_th, sort = EXCLUDED.sort`,
            [cat.id, branchId, cat.nameTh, cat.nameEn, cat.sort, cat.active]);
    }

    /* ── สินค้า + ราคาแยกแถวตามแบบเสิร์ฟ ──
       ★ จุดที่พลาดแล้วเจ็บที่สุดของทั้งการย้าย: prices เป็น sparse map
       คีย์ที่ไม่มี = ไม่ขายแบบนั้น ถ้าเผลอเติมเป็น 0 คีออสก์จะขายชาไทยแบบร้อน
       ซึ่งร้านไม่มี — จึงวนเฉพาะคีย์ที่มีจริงเท่านั้น */
    let priceRows = 0;
    for (const p of db.products) {
        await c.query(
            `INSERT INTO product (id, branch_id, category_id, group_th, name_th, name_en,
                                  image_url, art_key, station, active, sold_out, recommended)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT (id) DO UPDATE SET
                name_th = EXCLUDED.name_th, station = EXCLUDED.station,
                active = EXCLUDED.active, sold_out = EXCLUDED.sold_out,
                updated_at = now()`,
            [p.id, branchId, p.categoryId, p.groupTh, p.nameTh, p.nameEn,
             p.imageUrl || null, p.artKey || null, p.station || 'BAR',
             p.active !== false, !!p.soldOut, !!p.recommended]);

        await c.query('DELETE FROM product_price WHERE product_id = $1', [p.id]);
        for (const [serve, price] of Object.entries(p.prices || {})) {
            if (price == null) continue;              // ← ไม่ขายแบบนี้ ไม่ใช่ราคา 0
            await c.query(
                'INSERT INTO product_price (product_id, serve_type, price) VALUES ($1,$2,$3)',
                [p.id, serve, price]);
            priceRows++;
        }
    }

    /* ── กลุ่มตัวเลือก / ตัวเลือก / กฎ ── */
    for (const g of db.modifierGroups) {
        await c.query(
            `INSERT INTO modifier_group (id, branch_id, name_th, type, required)
             VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE
             SET name_th = EXCLUDED.name_th, type = EXCLUDED.type, required = EXCLUDED.required`,
            [g.id, branchId, g.nameTh, g.type, !!g.required]);
    }
    for (const o of db.modifierOptions) {
        await c.query(
            `INSERT INTO modifier_option (id, group_id, name_th, short_label, price_delta,
                                          is_default, sort)
             VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO UPDATE
             SET name_th = EXCLUDED.name_th, price_delta = EXCLUDED.price_delta`,
            [o.id, o.groupId, o.nameTh, o.shortLabel, o.priceDelta || 0, !!o.isDefault, o.sort || 0]);
    }
    for (const r of db.modifierRules) {
        await c.query(
            `INSERT INTO modifier_rule (id, branch_id, group_id, serve_type, category_id, sort)
             VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
            [r.id, branchId, r.groupId, r.serveType || null, r.categoryId || null, r.sort || 0]);
    }

    /* ── ค่าตั้ง — เก็บเป็น key/value ── */
    let settingRows = 0;
    for (const [key, value] of Object.entries(s)) {
        if (BRANCH_KEYS.includes(key)) continue;       // ไปอยู่ตาราง branch แล้ว
        await c.query(
            `INSERT INTO app_setting (branch_id, key, value) VALUES ($1,$2,$3)
             ON CONFLICT (branch_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
            [branchId, key, JSON.stringify(value)]);
        settingRows++;
    }

    /* ── รอบขายที่เปิดอยู่ ── */
    const today = new Date().toISOString().slice(0, 10);
    await c.query(
        `INSERT INTO shift (id, branch_id, business_date, opened_at, opened_by,
                            opening_cash, status)
         VALUES ($1,$2,$3,now(),$4,$5,'OPEN')
         ON CONFLICT (id) DO NOTHING`,
        [`SH-${today.replace(/-/g, '')}-01`, branchId, today, 'U-3', 2000]);

    return { branchId, priceRows, settingRows,
             products: db.products.length, users: db.users.length };
}

async function main() {
    await waitReady();

    const existing = await pool.query('SELECT count(*)::int AS n FROM product');
    if (existing.rows[0].n > 0 && !FORCE) {
        console.log(`มีสินค้าอยู่แล้ว ${existing.rows[0].n} รายการ — ใส่ --force ถ้าต้องการเขียนทับ`);
        return;
    }

    const out = await tx(seed);
    console.log('seed เรียบร้อย');
    console.log(`  สาขา       ${out.branchId}`);
    console.log(`  ผู้ใช้      ${out.users} คน (รหัสผ่านถูก hash ด้วย argon2id)`);
    console.log(`  สินค้า     ${out.products} รายการ · ราคา ${out.priceRows} แถว`);
    console.log(`  ค่าตั้ง     ${out.settingRows} คีย์`);
    if (DEMO) console.log('  (--demo ยังไม่รองรับ — ออเดอร์ตัวอย่างจะเพิ่มในเฟสถัดไป)');
}

main()
    .then(() => pool.end())
    .catch((err) => { console.error(err); process.exit(1); });
