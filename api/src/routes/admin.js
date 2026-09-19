/**
 * CafeFlow — เมนู · ค่าตั้งค่า · รอบขาย
 * ══════════════════════════════════════════════════════════════════
 * สามก้อนที่เหลือของเส้นทางเขียน ทำให้ร้านเปิด-ปิดวันได้ครบโดยไม่ต้องแตะฐานตรง
 */
'use strict';
const path = require('path');
const SHARED = path.resolve(__dirname, '..', '..', '..', 'shared');
const { CFPerms } = require(path.join(SHARED, 'cf-perms.js'));

const { publish } = require('./stream');
const { audit, touch, ApiError, businessDate } = require('./orders');

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

    const isNew = !id;
    const pid = id || ('P-' + Date.now().toString(36).toUpperCase());

    if (isNew) {
        await c.query(
            `INSERT INTO product (id, branch_id, category_id, group_th, name_th, name_en,
                                  image_url, art_key, station, active, sold_out, recommended)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [pid, branchId, body.categoryId, body.groupTh || null, name, body.nameEn || null,
             body.imageUrl || null, body.artKey || null, station,
             body.active !== false, !!body.soldOut, !!body.recommended]);
    } else {
        const r = await c.query(
            `UPDATE product SET category_id = $3, group_th = $4, name_th = $5, name_en = $6,
                    image_url = $7, art_key = $8, station = $9, active = $10,
                    sold_out = $11, recommended = $12, updated_at = now()
              WHERE id = $1 AND branch_id = $2 AND deleted_at IS NULL RETURNING id`,
            [pid, branchId, body.categoryId, body.groupTh || null, name, body.nameEn || null,
             body.imageUrl || null, body.artKey || null, station,
             body.active !== false, !!body.soldOut, !!body.recommended]);
        if (!r.rows.length) throw new ApiError(404, 'ไม่พบสินค้า');
    }

    // ราคา: ลบทิ้งแล้วใส่ใหม่ ในทรานแซกชันเดียว — สถานะกลางไม่มีใครเห็น
    await c.query('DELETE FROM product_price WHERE product_id = $1', [pid]);
    for (const [serve, price] of Object.entries(prices)) {
        await c.query(
            'INSERT INTO product_price (product_id, serve_type, price) VALUES ($1,$2,$3)',
            [pid, serve, price]);
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
 * ปิดรอบแล้วเปิดรอบใหม่ — ต้องอยู่ในทรานแซกชันเดียวกัน
 * ถ้าปิดสำเร็จแต่เปิดใหม่ล้ม ร้านจะขายต่อไม่ได้จนกว่าจะมีคนเข้าไปแก้ฐาน
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
    if (!isFinite(actual)) throw new ApiError(400, 'ต้องกรอกยอดเงินสดที่นับได้จริง');

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

    // เปิดรอบใหม่ทันที เงินตั้งต้นคือเงินที่นับได้จริง
    const bdate = businessDate();
    const n = Number((await c.query(
        'SELECT count(*)::int AS n FROM shift WHERE branch_id = $1 AND business_date = $2',
        [branchId, bdate])).rows[0].n) + 1;
    const newId = 'SH-' + bdate.replace(/-/g, '') + '-' + String(n).padStart(2, '0');

    await c.query(
        `INSERT INTO shift (id, branch_id, business_date, opened_at, opened_by,
                            opening_cash, status)
         VALUES ($1,$2,$3,now(),$4,$5,'OPEN')`,
        [newId, branchId, bdate, ctx.actorUserId || null, actual]);

    await audit(c, branchId, {
        eventType: 'SHIFT_CLOSE', actorKind: ctx.actorKind, actorUserId: ctx.actorUserId,
        deviceId: ctx.deviceId, ip: ctx.ip,
        reason: `ปิดรอบ ${shiftId} · ผลต่าง ${(actual - expected).toFixed(2)}`,
        payload: { shiftId, expected, actual, cashSales: cash, nextShift: newId },
    });
    await touch(c, branchId, 'shifts', shiftId, 'update');
    await touch(c, branchId, 'shifts', newId, 'insert');

    return { ok: true, closed: shiftId, expected, actual,
             difference: actual - expected, nextShift: newId };
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

        await tx(async (c) => {
            const r = await c.query(
                `UPDATE modifier_group SET name_th = $3,
                        type = COALESCE($4, type), required = COALESCE($5, required)
                  WHERE id = $1 AND branch_id = $2 RETURNING id`,
                [req.params.id, branchId(), name,
                 b.type === 'SINGLE' || b.type === 'MULTI' ? b.type : null,
                 typeof b.required === 'boolean' ? b.required : null]);
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
        if (!isFinite(v)) throw new ApiError(400, 'ยอดเงินสดไม่ถูกต้อง');
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

    app.post('/api/shifts/:id/close', handle(async (req) => {
        const ctx = await context(req);
        requirePerm(ctx, 'SHIFT_CLOSE');
        const out = await tx((c) => closeShift(c, branchId(), req.params.id, req.body || {}, ctx));
        publish(branchId(), { entity: 'shifts', op: 'update', id: req.params.id });
        return out;
    }));
}

module.exports = { registerAdmin, saveProduct, archiveProduct, saveSettings, closeShift };
