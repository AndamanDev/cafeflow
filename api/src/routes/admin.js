/**
 * CafeFlow — เมนู · ค่าตั้งค่า · รอบขาย
 * ══════════════════════════════════════════════════════════════════
 * สามก้อนที่เหลือของเส้นทางเขียน ทำให้ร้านเปิด-ปิดวันได้ครบโดยไม่ต้องแตะฐานตรง
 */
'use strict';
const path = require('path');
const SHARED = path.resolve(__dirname, '..', '..', '..', 'shared');
const { CFPerms } = require(path.join(SHARED, 'cf-perms.js'));
const { CF_STATUS } = require(path.join(SHARED, 'cf-consts.js'));

const { publish } = require('./stream');
const { audit, touch, ApiError, businessDateFor } = require('./orders');

const SERVE_TYPES = ['HOT', 'ICED', 'FRAPPE', 'STD'];
const STATIONS = ['BAR', 'KITCHEN', 'BAKERY', 'DESSERT'];

/* ══════════════════════════════════════════════════════════════════
   เมนูและสินค้า (§10, §11)
   ══════════════════════════════════════════════════════════════════ */

/**
 * บันทึกสินค้า — สร้างใหม่เมื่อไม่มี id
 *
 * ⚠️ prices ที่ส่งมาเป็น sparse map เช่น {HOT:50, ICED:50}
 *    คีย์ที่ไม่มี = เลิกขายแบบนั้น → ต้องลบแถวออกจาก product_price
 *    ไม่ใช่ตั้งเป็น 0 (ราคา 0 แปลว่า "แจกฟรี" ซึ่งคนละเรื่องกับ "ไม่มีขาย")
 */
async function saveProduct(c, branchId, id, body, ctx) {
    const name = String(body.nameTh || '').trim();
    if (!name) throw new ApiError(400, 'ต้องระบุชื่อสินค้า (ไทย)');

    const prices = {};
    for (const [k, v] of Object.entries(body.prices || {})) {
        if (v == null) continue;                       // ไม่ขายแบบนี้
        if (!SERVE_TYPES.includes(k)) throw new ApiError(400, 'แบบเสิร์ฟไม่ถูกต้อง: ' + k);
        const n = Number(v);
        if (!(n > 0)) throw new ApiError(400, `ราคาแบบ "${k}" ต้องมากกว่า 0`);
        prices[k] = n;
    }
    if (!Object.keys(prices).length) throw new ApiError(400, 'ต้องเปิดขายอย่างน้อยหนึ่งแบบเสิร์ฟ');

    const station = STATIONS.includes(body.station) ? body.station : 'BAR';
    const cat = await c.query('SELECT id FROM category WHERE id = $1 AND branch_id = $2',
        [body.categoryId, branchId]);
    if (!cat.rows.length) throw new ApiError(400, 'ไม่พบหมวดสินค้า');

    // ช่วงเวลาขาย — ทั้งคู่หรือไม่ใส่เลย (ขายทั้งวัน) · "HH:MM" · ข้ามเที่ยงคืนได้ (20:00–02:00)
    const hhmm = (v) => (v == null || v === '' ? null : String(v).trim());
    const availFrom = hhmm(body.availFrom), availTo = hhmm(body.availTo);
    if ((availFrom == null) !== (availTo == null)) throw new ApiError(400, 'ช่วงเวลาขายต้องใส่ทั้งเวลาเริ่มและเวลาเลิก');
    for (const t of [availFrom, availTo]) {
        if (t != null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new ApiError(400, 'เวลาต้องเป็นแบบ 07:00');
    }
    if (availFrom != null && availFrom === availTo) throw new ApiError(400, 'เวลาเริ่มกับเวลาเลิกต้องไม่เท่ากัน');

    // สต็อก — null = ไม่นับ · 0 = หมด (ตั้งหมดวันนี้ให้เอง) · มากกว่า 0 = ขายได้ (ล้าง "หมด")
    let stock = body.stockQty === undefined || body.stockQty === null || body.stockQty === '' ? null : Number(body.stockQty);
    if (stock != null && !(Number.isInteger(stock) && stock >= 0 && stock <= 100000)) {
        throw new ApiError(400, 'จำนวนสต็อกต้องเป็นจำนวนเต็ม 0 ขึ้นไป');
    }
    let soldOut = !!body.soldOut;
    if (stock === 0) soldOut = true;

    const desc = (v) => { const t = String(v == null ? '' : v).trim().slice(0, 200); return t || null; };

    const isNew = !id;
    const pid = id || ('P-' + Date.now().toString(36).toUpperCase());
    const fields = [body.categoryId, body.groupTh || null, name, body.nameEn || null,
                    body.imageUrl || null, body.artKey || null, station,
                    body.active !== false, soldOut, !!body.recommended,
                    desc(body.descriptionTh), desc(body.descriptionEn), stock, availFrom, availTo];

    if (isNew) {
        // สินค้าใหม่ต่อท้ายหมวด — เลื่อนลำดับทีหลังได้
        await c.query(
            `INSERT INTO product (id, branch_id, category_id, group_th, name_th, name_en,
                                  image_url, art_key, station, active, sold_out, recommended,
                                  description_th, description_en, stock_qty, avail_from, avail_to, sort)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
                     (SELECT COALESCE(max(sort), 0) + 10 FROM product WHERE branch_id = $2 AND category_id = $3))`,
            [pid, branchId, ...fields]);
    } else {
        const r = await c.query(
            `UPDATE product SET category_id = $3, group_th = $4, name_th = $5, name_en = $6,
                    image_url = $7, art_key = $8, station = $9, active = $10,
                    sold_out = $11, recommended = $12, description_th = $13, description_en = $14,
                    stock_qty = $15, avail_from = $16, avail_to = $17, updated_at = now()
              WHERE id = $1 AND branch_id = $2 AND deleted_at IS NULL RETURNING id`,
            [pid, branchId, ...fields]);
        if (!r.rows.length) throw new ApiError(404, 'ไม่พบสินค้า');
    }

    // ต้นทุนต่อแบบเสิร์ฟ — ไม่ส่งมา (ผู้ใช้ที่ไม่เห็นต้นทุน) = คงของเดิม
    let costs = null;
    if (body.costs && typeof body.costs === 'object') {
        costs = {};
        for (const [k, v] of Object.entries(body.costs)) {
            if (v == null || v === '') continue;
            const n = Number(v);
            if (!(n >= 0)) throw new ApiError(400, `ต้นทุนแบบ "${k}" ต้องเป็น 0 ขึ้นไป`);
            costs[k] = n;
        }
    } else if (!isNew) {
        costs = {};
        for (const r of (await c.query('SELECT serve_type, cost FROM product_price WHERE product_id = $1 AND cost IS NOT NULL',
            [pid])).rows) costs[r.serve_type] = Number(r.cost);
    }

    // ราคา: ลบทิ้งแล้วใส่ใหม่ ในทรานแซกชันเดียว — สถานะกลางไม่มีใครเห็น
    await c.query('DELETE FROM product_price WHERE product_id = $1', [pid]);
    for (const [serve, price] of Object.entries(prices)) {
        await c.query(
            'INSERT INTO product_price (product_id, serve_type, price, cost) VALUES ($1,$2,$3,$4)',
            [pid, serve, price, costs && costs[serve] != null ? costs[serve] : null]);
    }

    await audit(c, branchId, {
        eventType: 'PRODUCT_UPDATE', actorKind: ctx.actorKind, actorUserId: ctx.actorUserId,
        deviceId: ctx.deviceId, ip: ctx.ip,
        reason: (isNew ? 'เพิ่มสินค้า ' : 'แก้ไขสินค้า ') + name,
        payload: { productId: pid, prices },
    });
    await touch(c, branchId, 'products', pid, isNew ? 'insert' : 'update');
    return { id: pid, isNew };
}

/** ปิดการขาย — ไม่ลบจริง เพื่อให้ออเดอร์ย้อนหลังยังอ่านชื่อสินค้าได้ */
async function archiveProduct(c, branchId, id, ctx) {
    const r = await c.query(
        `UPDATE product SET active = false, updated_at = now()
          WHERE id = $1 AND branch_id = $2 AND deleted_at IS NULL RETURNING name_th`,
        [id, branchId]);
    if (!r.rows.length) throw new ApiError(404, 'ไม่พบสินค้า');

    await audit(c, branchId, {
        eventType: 'PRODUCT_UPDATE', actorKind: ctx.actorKind, actorUserId: ctx.actorUserId,
        deviceId: ctx.deviceId, ip: ctx.ip, reason: 'ปิดการขาย ' + r.rows[0].name_th,
        payload: { productId: id },
    });
    await touch(c, branchId, 'products', id, 'update');
    return { ok: true };
}

/* ══════════════════════════════════════════════════════════════════
   ค่าตั้งค่า
   ══════════════════════════════════════════════════════════════════ */

/** คีย์ที่เป็นข้อมูลสาขา ไม่ใช่ค่าตั้งระบบ — อยู่ในตาราง branch */
const BRANCH_KEYS = {
    shopName: 'name_th', address: 'address', taxId: 'tax_id', promptpayId: 'promptpay_id',
};

async function saveSettings(c, branchId, body, ctx) {
    const changed = [];
    for (const [key, value] of Object.entries(body || {})) {
        if (value === undefined) continue;
        if (key === 'branch' || key === 'vatPercent' || key === 'vatRegistered') continue;
        if (key === 'displayTheme' && value !== 'light' && value !== 'dark') {
            throw new ApiError(400, 'ธีมจอแสดงคิวต้องเป็น light หรือ dark');
        }
        if ((key === 'displayHighlights' || key === 'displaySound') && typeof value !== 'boolean') {
            throw new ApiError(400, 'ค่าเปิด/ปิดของจอแสดงคิวไม่ถูกต้อง');
        }
        if (key === 'displayHighlightSec' && !(Number.isInteger(value) && value >= 3 && value <= 60)) {
            throw new ApiError(400, 'เวลาสลับเมนูแนะนำต้องเป็น 3–60 วินาที');
        }
        if ((key === 'shopPhone' && (typeof value !== 'string' || value.length > 40)) ||
            (key === 'receiptFooter' && (typeof value !== 'string' || value.length > 200))) {
            throw new ApiError(400, key === 'shopPhone' ? 'เบอร์โทรยาวเกินไป' : 'ข้อความท้ายใบเสร็จยาวได้ไม่เกิน 200 ตัวอักษร');
        }
        if (key === 'dayStartHour' && !(Number.isInteger(value) && value >= 0 && value <= 12)) {
            throw new ApiError(400, 'เวลาเริ่มวันทำการต้องเป็น 00:00–12:00');
        }
        if (key === 'displayTicker' && (typeof value !== 'string' || value.trim().length > 200)) {
            throw new ApiError(400, 'ข้อความประกาศยาวได้ไม่เกิน 200 ตัวอักษร');
        }

        if (BRANCH_KEYS[key]) {
            await c.query(`UPDATE branch SET ${BRANCH_KEYS[key]} = $2 WHERE id = $1`,
                [branchId, value]);
        } else {
            await c.query(
                `INSERT INTO app_setting (branch_id, key, value, updated_by)
                 VALUES ($1,$2,$3,$4)
                 ON CONFLICT (branch_id, key)
                 DO UPDATE SET value = EXCLUDED.value, updated_at = now(),
                               updated_by = EXCLUDED.updated_by`,
                [branchId, key, JSON.stringify(value), ctx.actorUserId || null]);
        }
        changed.push(key);
    }

    // คีย์รุ่นก่อนของโหมดรับสินค้า — ปล่อยค้างไว้จะขัดกับค่าใหม่
    if (changed.includes('kioskDiningMode')) {
        await c.query("DELETE FROM app_setting WHERE branch_id = $1 AND key = 'kioskDiningStep'",
            [branchId]);
    }

    await audit(c, branchId, {
        eventType: 'SETTINGS_UPDATE', actorKind: ctx.actorKind, actorUserId: ctx.actorUserId,
        deviceId: ctx.deviceId, ip: ctx.ip, reason: 'แก้ไขค่าตั้งค่า',
        payload: { keys: changed },
    });
    await touch(c, branchId, 'settings', 'settings', 'update');
    return { ok: true, changed };
}

/* ══════════════════════════════════════════════════════════════════
   รอบขาย (§27)
   ══════════════════════════════════════════════════════════════════ */

/**
 * สร้างรอบใหม่ (OPEN) แล้วยกออเดอร์ที่ยังไม่ชำระเข้ารอบนี้ — ใช้ทั้งตอนปิดรอบและตอนเปิดรอบเอง
 * ไม่ touch/audit ให้ — ผู้เรียกเป็นคนบันทึก เพราะเหตุผลต่างกัน
 */
async function insertShift(c, branchId, openingCash, ctx) {
    const bdate = await businessDateFor(c, branchId);
    const n = Number((await c.query(
        'SELECT count(*)::int AS n FROM shift WHERE branch_id = $1 AND business_date = $2',
        [branchId, bdate])).rows[0].n) + 1;
    const id = 'SH-' + bdate.replace(/-/g, '') + '-' + String(n).padStart(2, '0');

    await c.query(
        `INSERT INTO shift (id, branch_id, business_date, opened_at, opened_by,
                            opening_cash, status)
         VALUES ($1,$2,$3,now(),$4,$5,'OPEN')`,
        [id, branchId, bdate, ctx.actorUserId || null, openingCash]);

    // ออเดอร์ที่ยังไม่ได้ชำระ (รวมที่ค้างจากรอบ/วันก่อน) ยกไปรอบใหม่ —
    // เงินสดคิดตาม shift_id ของออเดอร์ ถ้าทิ้งไว้รอบเก่า ลูกค้ามาจ่ายทีหลัง เงินจะไม่เข้า "เงินสดที่ควรมี" ของรอบที่รับเงินจริง
    // ออเดอร์ที่ชำระแล้วอยู่รอบเดิม เพราะเงินถูกนับในรอบนั้นไปแล้ว
    const carried = (await c.query(
        `UPDATE cf_order SET shift_id = $2, rev = nextval('global_rev'), updated_at = now()
          WHERE branch_id = $1 AND shift_id IS DISTINCT FROM $2
            AND status IN ('DRAFT','ORDER_CONFIRMED','WAITING_CASH','WAITING_PAYMENT',
                           'PAYMENT_TIMEOUT','PAYMENT_REVIEW','PAYMENT_FAILED')
          RETURNING id`, [branchId, id])).rows.map((r) => r.id);
    return { id, carried };
}

/**
 * เปิดรอบ — ทุกเช้าก่อนขาย (ปิดรอบตอนปิดร้านแล้วระบบไม่เปิดรอบใหม่ให้)
 * และตอนร้านเพิ่งติดตั้ง / ล้างข้อมูลทดสอบ
 */
async function openShift(c, branchId, body, ctx) {
    const cash = Number(body.openingCash);
    if (body.openingCash === '' || body.openingCash == null || !isFinite(cash) || cash < 0) {
        throw new ApiError(400, 'ต้องกรอกเงินตั้งต้นในลิ้นชัก (0 ขึ้นไป)');
    }
    // ล็อกสาขาไว้ก่อน — กดเปิดรอบพร้อมกันสองเครื่องต้องได้รอบเดียว
    await c.query('SELECT id FROM branch WHERE id = $1 FOR UPDATE', [branchId]);
    const open = (await c.query(
        "SELECT id FROM shift WHERE branch_id = $1 AND status = 'OPEN'", [branchId])).rows[0];
    if (open) throw new ApiError(409, 'มีรอบ ' + open.id + ' เปิดอยู่แล้ว');

    const { id, carried } = await insertShift(c, branchId, cash, ctx);
    await audit(c, branchId, {
        eventType: 'SHIFT_OPEN', actorKind: ctx.actorKind, actorUserId: ctx.actorUserId,
        deviceId: ctx.deviceId, ip: ctx.ip,
        reason: `เปิดรอบ ${id} · เงินตั้งต้น ${cash.toFixed(2)}`,
        payload: { shiftId: id, openingCash: cash, carriedOver: carried },
    });
    await touch(c, branchId, 'shifts', id, 'insert');
    for (const oid of carried) await touch(c, branchId, 'orders', oid, 'update');
    return { ok: true, shiftId: id, carriedOver: carried.length };
}

/**
 * ปิดรอบ — ค่าเริ่มต้นปิดอย่างเดียว (ปิดร้าน) แบบที่ POS ส่วนใหญ่ทำ:
 *   พรุ่งนี้เช้าพนักงานเปิดรอบเอง กรอกเงินทอนใหม่ → รอบตรงกับวันขายจริง และหลังปิดร้านคีออสก์ไม่รับออเดอร์
 * body.reopen = true (เปลี่ยนกะ) → เปิดรอบใหม่ต่อทันทีในทรานแซกชันเดียวกัน เงินตั้งต้น = เงินที่นับได้
 *   ถ้าปิดสำเร็จแต่เปิดใหม่ล้ม ร้านจะขายต่อไม่ได้ จึงต้องอยู่ทรานแซกชันเดียวกัน
 *
 * expected_cash ถูก snapshot ไว้ตอนปิด ไม่คำนวณใหม่ทีหลัง — ไม่งั้นแก้ออเดอร์
 * ย้อนหลังแล้วส่วนต่างของรอบที่ปิดไปแล้วขยับตาม ซึ่งอธิบายกับเจ้าของร้านไม่ได้
 */
async function closeShift(c, branchId, shiftId, body, ctx) {
    const s = (await c.query(
        'SELECT * FROM shift WHERE id = $1 AND branch_id = $2 FOR UPDATE', [shiftId, branchId])).rows[0];
    if (!s) throw new ApiError(404, 'ไม่พบรอบการขาย');
    if (s.status !== 'OPEN') throw new ApiError(409, 'รอบนี้ปิดไปแล้ว');

    const actual = Number(body.actualCash);
    if (!isFinite(actual) || actual < 0) throw new ApiError(400, 'ต้องกรอกยอดเงินสดที่นับได้จริง');

    // ห้ามปิดรอบถ้ายังมีออเดอร์ไม่จบ (ทุกสถานะ ทุกรอบ) — ต้องจัดการให้เสร็จ/ยกเลิกก่อน
    // ไม่งั้นออเดอร์ค้างถูกยกข้ามรอบไปเรื่อย ๆ และยอดเงินของแต่ละรอบอธิบายไม่ได้
    const pending = (await c.query(
        `SELECT status, count(*)::int AS n FROM cf_order
          WHERE branch_id = $1 AND status NOT IN ('COMPLETED','CANCELLED','VOIDED','REFUNDED')
          GROUP BY status ORDER BY n DESC`, [branchId])).rows;
    if (pending.length) {
        const total = pending.reduce((s, r) => s + r.n, 0);
        const parts = pending.map((r) => ((CF_STATUS[r.status] || {}).label || r.status) + ' ' + r.n);
        throw new ApiError(409,
            `ยังมีออเดอร์ที่ยังไม่จบ ${total} ออเดอร์ (${parts.join(' · ')}) — จัดการให้เสร็จก่อนปิดรอบ`);
    }

    // เงินสดที่ควรมีคิดจากฐาน ไม่เชื่อตัวเลขที่หน้าจอส่งมา
    const cash = Number((await c.query(
        `SELECT COALESCE(SUM(p.amount), 0) AS v FROM payment p
           JOIN cf_order o ON o.id = p.order_id
          WHERE o.shift_id = $1 AND p.method = 'CASH' AND p.status = 'PAID'`,
        [shiftId])).rows[0].v);
    const expected = Number(s.opening_cash) + cash;

    await c.query(
        `UPDATE shift SET status = 'CLOSED', closed_at = now(), closed_by = $2,
                actual_cash = $3, expected_cash = $4 WHERE id = $1`,
        [shiftId, ctx.actorUserId || null, actual, expected]);

    // เปลี่ยนกะ — เปิดรอบใหม่ทันที เงินตั้งต้นคือเงินที่นับได้จริง
    const reopen = body.reopen === true;
    const { id: newId, carried } = reopen
        ? await insertShift(c, branchId, actual, ctx) : { id: null, carried: [] };

    await audit(c, branchId, {
        eventType: 'SHIFT_CLOSE', actorKind: ctx.actorKind, actorUserId: ctx.actorUserId,
        deviceId: ctx.deviceId, ip: ctx.ip,
        reason: `ปิดรอบ ${shiftId} · ผลต่าง ${(actual - expected).toFixed(2)}`,
        payload: { shiftId, expected, actual, cashSales: cash, nextShift: newId, carriedOver: carried },
    });
    await touch(c, branchId, 'shifts', shiftId, 'update');
    if (newId) await touch(c, branchId, 'shifts', newId, 'insert');
    for (const id of carried) await touch(c, branchId, 'orders', id, 'update');

    return { ok: true, closed: shiftId, expected, actual,
             difference: actual - expected, nextShift: newId, carriedOver: carried.length };
}

/* ══════════════════════════════════════════════════════════════════ */
function registerAdmin(app, deps) {
    const { tx, branchId } = deps;
    const { context, requirePerm, handle } = deps.helpers;

    app.post('/api/products', handle(async (req) => {
        const ctx = await context(req);
        requirePerm(ctx, 'MENU_EDIT');
        const out = await tx((c) => saveProduct(c, branchId(), null, req.body || {}, ctx));
        publish(branchId(), { entity: 'products', op: 'insert', id: out.id });
        return out;
    }));

    app.put('/api/products/:id', handle(async (req) => {
        const ctx = await context(req);
        requirePerm(ctx, 'MENU_EDIT');
        const out = await tx((c) => saveProduct(c, branchId(), req.params.id, req.body || {}, ctx));
        publish(branchId(), { entity: 'products', op: 'update', id: out.id });
        return out;
    }));

    app.post('/api/products/:id/archive', handle(async (req) => {
        const ctx = await context(req);
        requirePerm(ctx, 'MENU_EDIT');
        const out = await tx((c) => archiveProduct(c, branchId(), req.params.id, ctx));
        publish(branchId(), { entity: 'products', op: 'update', id: req.params.id });
        return out;
    }));

    app.patch('/api/modifier-groups/:id', handle(async (req) => {
        const ctx = await context(req);
        requirePerm(ctx, 'MENU_EDIT');
        const b = req.body || {};
        const name = String(b.nameTh || '').trim();
        if (!name) throw new ApiError(400, 'ต้องระบุชื่อกลุ่ม');

        // เพดานจำนวนที่เลือกได้ (กลุ่ม MULTI) — ไม่ส่งมา = คงเดิม · 0 = ไม่จำกัด
        let max = null;
        if (b.maxSelect != null && b.maxSelect !== '') {
            max = Number(b.maxSelect);
            if (!Number.isInteger(max) || max < 0 || max > 20) {
                throw new ApiError(400, 'จำนวนที่เลือกได้สูงสุดต้องเป็นเลข 1–20 (เว้นว่าง = ไม่จำกัด)');
            }
        }

        await tx(async (c) => {
            const r = await c.query(
                `UPDATE modifier_group SET name_th = $3,
                        name_en = CASE WHEN $7::boolean THEN $8 ELSE name_en END,
                        active = COALESCE($9, active), sort = COALESCE($10, sort),
                        type = COALESCE($4, type), required = COALESCE($5, required),
                        max_select = CASE
                            WHEN COALESCE($4, type) = 'SINGLE' THEN NULL     -- เลือกได้ 1 อยู่แล้ว
                            WHEN $6::int IS NULL THEN max_select
                            WHEN $6::int = 0 THEN NULL
                            ELSE $6::int END
                  WHERE id = $1 AND branch_id = $2 RETURNING id`,
                [req.params.id, branchId(), name,
                 b.type === 'SINGLE' || b.type === 'MULTI' ? b.type : null,
                 typeof b.required === 'boolean' ? b.required : null, max,
                 // ไม่ส่ง = คงเดิม (ฟอร์มเก่าที่ส่งแค่ชื่อ/รูปแบบยังใช้ได้)
                 b.nameEn !== undefined, b.nameEn ? String(b.nameEn).trim().slice(0, 60) || null : null,
                 typeof b.active === 'boolean' ? b.active : null,
                 Number.isInteger(b.sort) ? b.sort : null]);
            if (!r.rows.length) throw new ApiError(404, 'ไม่พบกลุ่มตัวเลือก');
            await audit(c, branchId(), {
                eventType: 'PRODUCT_UPDATE', actorKind: ctx.actorKind,
                actorUserId: ctx.actorUserId, deviceId: ctx.deviceId, ip: ctx.ip,
                reason: 'แก้ไขกลุ่มตัวเลือก ' + name, payload: { groupId: req.params.id },
            });
            await touch(c, branchId(), 'modifierGroups', req.params.id, 'update');
        });
        publish(branchId(), { entity: 'modifierGroups', op: 'update', id: req.params.id });
        return { ok: true };
    }));

    app.patch('/api/settings', handle(async (req) => {
        const ctx = await context(req);
        requirePerm(ctx, 'MENU_EDIT');     // §29 ไม่มีสิทธิ์แยกสำหรับค่าตั้ง — ใช้ระดับผู้จัดการ
        const out = await tx((c) => saveSettings(c, branchId(), req.body || {}, ctx));
        publish(branchId(), { entity: 'settings', op: 'update', id: 'settings' });
        return out;
    }));

    /** บันทึกยอดเงินที่นับได้ระหว่างรอบ (ยังไม่ปิด) */
    app.patch('/api/shifts/:id', handle(async (req) => {
        const ctx = await context(req);
        requirePerm(ctx, 'SHIFT_CLOSE');
        const v = Number((req.body || {}).actualCash);
        if (!isFinite(v) || v < 0) throw new ApiError(400, 'ยอดเงินสดไม่ถูกต้อง');
        await tx(async (c) => {
            const r = await c.query(
                `UPDATE shift SET actual_cash = $3 WHERE id = $1 AND branch_id = $2
                   AND status = 'OPEN' RETURNING id`, [req.params.id, branchId(), v]);
            if (!r.rows.length) throw new ApiError(404, 'ไม่พบรอบที่เปิดอยู่');
            await touch(c, branchId(), 'shifts', req.params.id, 'update');
        });
        publish(branchId(), { entity: 'shifts', op: 'update', id: req.params.id });
        return { ok: true };
    }));

    app.post('/api/shifts/open', handle(async (req) => {
        const ctx = await context(req);
        requirePerm(ctx, 'SHIFT_CLOSE');
        const out = await tx((c) => openShift(c, branchId(), req.body || {}, ctx));
        publish(branchId(), { entity: 'shifts', op: 'insert', id: out.shiftId });
        return out;
    }));

    app.post('/api/shifts/:id/close', handle(async (req) => {
        const ctx = await context(req);
        requirePerm(ctx, 'SHIFT_CLOSE');
        const out = await tx((c) => closeShift(c, branchId(), req.params.id, req.body || {}, ctx));
        publish(branchId(), { entity: 'shifts', op: 'update', id: req.params.id });
        return out;
    }));
}

module.exports = { registerAdmin, saveProduct, archiveProduct, saveSettings, closeShift, openShift };
