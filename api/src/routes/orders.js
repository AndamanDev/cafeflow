/**
 * CafeFlow — เส้นทางเขียนของออเดอร์ (§7, §8, §11, §21)
 * ══════════════════════════════════════════════════════════════════
 * เซิร์ฟเวอร์เป็นผู้ตัดสินทุกอย่าง:
 *   · ราคา — คิดใหม่จากฐานเสมอ ไม่เชื่อตัวเลขที่ client ส่งมา
 *   · ตัวเลือก — ตรวจกับกฎ §11 ชุดเดียวกับที่คีออสก์ใช้แสดง
 *   · สถานะ — เดินตาม CF_FLOW ชุดเดียวกับที่หน้าจอใช้สร้างปุ่ม
 *   · เลขออเดอร์ — ออกจากฐาน ไม่ซ้ำและไม่ข้ามเลข
 *
 * ทุกคำสั่งอยู่ในทรานแซกชันเดียวกับ audit log — ถ้าแยกกันเมื่อไหร่ audit จะโกหก
 */
'use strict';
const path = require('path');
const crypto = require('crypto');

const SHARED = path.resolve(__dirname, '..', '..', '..', 'shared');
const { CFFlow } = require(path.join(SHARED, 'cf-flow.js'));
const { CFPricing } = require(path.join(SHARED, 'cf-pricing.js'));
const { CFRulesCore } = require(path.join(SHARED, 'cf-rules.js'));
const { CFPerms } = require(path.join(SHARED, 'cf-perms.js'));

const { publish } = require('./stream');
const { currentUser } = require('./auth');

/* ══════════════════════════════════════════════════════════════════
   ตัวช่วย
   ══════════════════════════════════════════════════════════════════ */

class ApiError extends Error {
    constructor(status, message, extra) {
        super(message);
        this.status = status;
        Object.assign(this, extra || {});
    }
}

/**
 * วันทำการ ไม่ใช่วันปฏิทิน
 * ร้านปิดหลังเที่ยงคืนได้ ออเดอร์ตี 1 จึงยังเป็นยอดของ "เมื่อวาน"
 * ตัดวันที่ตี 4 ตามที่ร้านกาแฟส่วนใหญ่ใช้
 */
function businessDate(now) {
    const d = new Date(now || Date.now());
    const local = new Date(d.getTime() + 7 * 3600 * 1000);   // Asia/Bangkok
    if (local.getUTCHours() < 4) local.setUTCDate(local.getUTCDate() - 1);
    return local.toISOString().slice(0, 10);
}

/** เขียน audit — ต้องอยู่ในทรานแซกชันเดียวกับสิ่งที่มันบันทึกเสมอ */
async function audit(c, branchId, row) {
    const kind = row.actorKind || (row.actorUserId ? 'USER' : 'SYSTEM');
    await c.query(
        `INSERT INTO audit_log (branch_id, event_type, order_id, old_status, new_status,
                                actor_kind, actor_user_id, device_id, reason, source_ip, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [branchId, row.eventType, row.orderId || null, row.oldStatus || null,
         row.newStatus || null, kind, kind === 'USER' ? row.actorUserId : null,
         row.deviceId || null, row.reason || null, row.ip || null,
         row.payload ? JSON.stringify(row.payload) : null]);
}

/** บอกทุกจอว่ามีอะไรเปลี่ยน + จดลง outbox ให้ sync-worker ส่งขึ้นคลาวด์ทีหลัง */
async function touch(c, branchId, entity, id, op) {
    const rev = Number((await c.query("SELECT nextval('global_rev') AS v")).rows[0].v);
    await c.query(
        'INSERT INTO change_log (branch_id, entity, entity_id, op, rev) VALUES ($1,$2,$3,$4,$5)',
        [branchId, entity, id, op || 'update', rev]);
    return rev;
}

/** โหลดข้อมูลที่ต้องใช้ตรวจกฎตัวเลือก — รูปทรงเดียวกับที่ shared/cf-rules.js คาดหวัง */
async function ruleData(c, branchId) {
    const g = (await c.query('SELECT * FROM modifier_group WHERE branch_id = $1', [branchId])).rows;
    const o = (await c.query(
        `SELECT o.* FROM modifier_option o JOIN modifier_group g ON g.id = o.group_id
          WHERE g.branch_id = $1`, [branchId])).rows;
    const r = (await c.query('SELECT * FROM modifier_rule WHERE branch_id = $1', [branchId])).rows;
    return {
        modifierGroups: g.map((x) => ({ id: x.id, nameTh: x.name_th, type: x.type, required: x.required })),
        modifierOptions: o.map((x) => ({
            id: x.id, groupId: x.group_id, nameTh: x.name_th, shortLabel: x.short_label,
            priceDelta: Number(x.price_delta), isDefault: x.is_default, sort: x.sort })),
        modifierRules: r.map((x) => ({
            id: x.id, serveType: x.serve_type, categoryId: x.category_id,
            groupId: x.group_id, sort: x.sort })),
    };
}

async function settingsOf(c, branchId) {
    const out = {};
    for (const r of (await c.query('SELECT key, value FROM app_setting WHERE branch_id = $1',
        [branchId])).rows) out[r.key] = r.value;
    return out;
}

/* ══════════════════════════════════════════════════════════════════
   สร้างออเดอร์
   ══════════════════════════════════════════════════════════════════ */
async function createOrder(c, branchId, input, ctx) {
    const cart = Array.isArray(input.cart) ? input.cart : [];
    if (!cart.length) throw new ApiError(400, 'ตะกร้าว่าง');

    const clientUuid = input.clientUuid;
    if (!clientUuid || !/^[0-9a-f-]{36}$/i.test(clientUuid)) {
        throw new ApiError(400, 'ต้องส่ง clientUuid เพื่อกันออเดอร์ซ้ำ');
    }

    // กดซ้ำ / retry เพราะ Wi-Fi สะดุด ต้องได้ออเดอร์ใบเดิม ไม่ใช่ใบใหม่
    const dup = await c.query(
        'SELECT id, order_no FROM cf_order WHERE branch_id = $1 AND client_uuid = $2',
        [branchId, clientUuid]);
    if (dup.rows.length) return { orderId: dup.rows[0].id, orderNo: dup.rows[0].order_no, duplicate: true };

    const rules = await ruleData(c, branchId);

    /* ── คิดราคาใหม่จากฐาน ไม่เชื่อตัวเลขจาก client ── */
    const lines = [];
    let subtotal = 0;
    for (const [i, l] of cart.entries()) {
        const pr = await c.query(
            `SELECT p.*, COALESCE(pp.prices, '{}'::jsonb) AS prices
               FROM product p
               LEFT JOIN LATERAL (SELECT jsonb_object_agg(serve_type, price) AS prices
                                    FROM product_price WHERE product_id = p.id) pp ON true
              WHERE p.id = $1 AND p.branch_id = $2 AND p.deleted_at IS NULL`,
            [l.productId, branchId]);
        const row = pr.rows[0];
        if (!row) throw new ApiError(400, `ไม่พบสินค้า ${l.productId}`);
        if (!row.active) throw new ApiError(409, `"${row.name_th}" ปิดการขายอยู่`);
        // ผู้จัดการอาจกดปิดขายกลางคันตอนลูกค้ากำลังเลือก — ต้องตรวจซ้ำที่นี่
        if (row.sold_out) throw new ApiError(409, `"${row.name_th}" หมดแล้ว`);

        const prices = {};
        for (const [k, v] of Object.entries(row.prices || {})) prices[k] = Number(v);
        const product = { id: row.id, prices };

        const unitBase = CFPricing.priceOf(product, l.serveType);
        if (unitBase == null) {
            throw new ApiError(400, `"${row.name_th}" ไม่มีขายแบบที่เลือก`);
        }

        // client ส่งมาแค่ optionId — ที่เหลือ (กลุ่ม ป้าย ราคาส่วนเพิ่ม) อ่านจากฐานเสมอ
        // จึงไม่มีทางยิง API ตรงเพื่อขอท็อปปิ้งราคา 0 หรือแปะป้ายผิด
        const mods = Array.isArray(l.mods) ? l.mods : [];
        const modRows = [];
        for (const m of mods) {
            const opt = rules.modifierOptions.find((o) => o.id === m.optionId);
            if (!opt) throw new ApiError(400, 'ตัวเลือกไม่ถูกต้อง');
            modRows.push({
                groupId: opt.groupId, optionId: opt.id, label: opt.nameTh,
                shortLabel: opt.shortLabel, priceDelta: Number(opt.priceDelta) || 0,
            });
        }

        // ★ ต้องตรวจ "หลัง" เติม groupId แล้วเท่านั้น — ไม่งั้นกลุ่มบังคับจะดูเหมือนยังไม่ถูกเลือก
        //   ทั้งที่ลูกค้าเลือกมาแล้ว (ตัวตรวจจับคู่ mod กับกลุ่มด้วย groupId)
        const problems = CFRulesCore.validate(l.serveType, row.category_id, modRows, rules);
        if (problems.length) throw new ApiError(400, problems[0]);

        const qty = Math.max(1, parseInt(l.qty, 10) || 1);
        const unitPrice = unitBase + modRows.reduce((s, m) => s + m.priceDelta, 0);
        subtotal += unitPrice * qty;

        lines.push({
            lineNo: i + 1, productId: row.id, nameSnapshot: row.name_th,
            serveType: l.serveType, qty, unitPrice, station: row.station, mods: modRows,
        });
    }

    // client ส่งยอดที่มันคำนวณมาด้วยได้ — ไม่ตรงเมื่อไหร่แปลว่าคนละเวอร์ชันหรือถูกแก้
    if (input.expectTotal != null && Math.abs(Number(input.expectTotal) - subtotal) > 0.001) {
        throw new ApiError(409, 'ยอดไม่ตรงกับราคาปัจจุบัน กรุณาตรวจสอบตะกร้าอีกครั้ง',
            { serverTotal: subtotal });
    }

    /* ── ออกเลขออเดอร์แบบ atomic ── */
    const bdate = businessDate();
    const seq = await c.query(
        `INSERT INTO order_seq (branch_id, business_date, last_no) VALUES ($1, $2, 1)
         ON CONFLICT (branch_id, business_date)
         DO UPDATE SET last_no = order_seq.last_no + 1
         RETURNING last_no`, [branchId, bdate]);
    const orderNo = 'A' + String(seq.rows[0].last_no).padStart(3, '0');
    const orderId = 'O-' + bdate.slice(2).replace(/-/g, '') + '-' + orderNo;

    const shift = (await c.query(
        "SELECT id FROM shift WHERE branch_id = $1 AND status = 'OPEN'", [branchId])).rows[0];

    await c.query(
        `INSERT INTO cf_order (id, branch_id, order_no, business_date, client_uuid, shift_id,
                               kiosk_id, dining_option, status, payment_method,
                               subtotal, discount, total, rev)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ORDER_CONFIRMED',$9,$10,0,$10,nextval('global_rev'))`,
        [orderId, branchId, orderNo, bdate, clientUuid, shift ? shift.id : null,
         input.kioskId || null, input.diningOption === 'TAKE_AWAY' ? 'TAKE_AWAY' : 'DINE_IN',
         input.paymentMethod === 'QR' ? 'QR' : 'CASH', subtotal]);

    for (const l of lines) {
        const itemId = `${orderId}-I${l.lineNo}`;
        await c.query(
            `INSERT INTO order_item (id, order_id, line_no, product_id, name_snapshot,
                                     serve_type, qty, unit_price, station, item_status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'DRAFT')`,
            [itemId, orderId, l.lineNo, l.productId, l.nameSnapshot, l.serveType,
             l.qty, l.unitPrice, l.station]);
        for (const [j, m] of l.mods.entries()) {
            await c.query(
                `INSERT INTO order_item_modifier (order_item_id, sort, group_id, option_id,
                                                  label, short_label, price_delta)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                [itemId, j, m.groupId, m.optionId, m.label, m.shortLabel, m.priceDelta]);
        }
    }

    await audit(c, branchId, {
        eventType: 'ORDER_CREATED', orderId, newStatus: 'ORDER_CONFIRMED',
        actorKind: ctx.actorKind, actorUserId: ctx.actorUserId,
        deviceId: ctx.deviceId, ip: ctx.ip,
        payload: { lines: lines.length, total: subtotal },
    });
    await touch(c, branchId, 'orders', orderId, 'insert');

    return { orderId, orderNo, total: subtotal };
}

/* ══════════════════════════════════════════════════════════════════
   เปลี่ยนสถานะ
   ══════════════════════════════════════════════════════════════════ */
async function transition(c, branchId, orderId, newStatus, opts, ctx) {
    // ล็อกแถวไว้ก่อน — สองคนกดพร้อมกันต้องมีคนเดียวที่ผ่าน
    const r = await c.query(
        'SELECT * FROM cf_order WHERE id = $1 AND branch_id = $2 FOR UPDATE',
        [orderId, branchId]);
    const o = r.rows[0];
    if (!o) throw new ApiError(404, 'ไม่พบออเดอร์');

    if (!CFFlow.canGo(o.status, newStatus)) {
        throw new ApiError(409,
            `เปลี่ยนสถานะจาก "${o.status}" ไปเป็น "${newStatus}" ไม่ได้`,
            { from: o.status });
    }

    const reason = String(opts.reason || '').trim();
    if (CFFlow.needsReason(newStatus) && !reason) {
        throw new ApiError(400, 'ต้องระบุเหตุผลก่อนทำรายการนี้');
    }

    const stampCol = {
        paidAt: 'paid_at', sentAt: 'sent_at', preparingAt: 'preparing_at',
        readyAt: 'ready_at', servedAt: 'served_at', completedAt: 'completed_at',
        cancelledAt: 'cancelled_at', voidedAt: 'voided_at', refundedAt: 'refunded_at',
    }[CFFlow.stampFor(newStatus)];

    await c.query(
        `UPDATE cf_order SET prev_status = status, status = $2,
                cancel_reason = COALESCE(NULLIF($3,''), cancel_reason),
                ${stampCol ? stampCol + ' = now(),' : ''}
                rev = nextval('global_rev'), updated_at = now()
          WHERE id = $1`, [orderId, newStatus, reason]);

    await audit(c, branchId, {
        eventType: 'STATUS_CHANGE', orderId, oldStatus: o.status, newStatus,
        actorKind: ctx.actorKind, actorUserId: ctx.actorUserId,
        deviceId: ctx.deviceId, reason: reason || null, ip: ctx.ip,
    });

    /* ── ผลพลอยได้ที่ต้องอยู่ในทรานแซกชันเดียวกัน ── */

    // ชำระแล้ว → บันทึกการชำระ + ส่งเข้าครัวทันที (§44 "Verify Before Forward")
    if (newStatus === 'PAID') {
        await c.query('UPDATE cf_order SET cashier_id = $2 WHERE id = $1',
            [orderId, ctx.actorUserId || null]);
        await settlePayment(c, branchId, o, opts, ctx);
        await sendToKitchen(c, branchId, o, ctx);
    }

    // ยกเลิก / คืนเงิน → เอารายการออกจากบอร์ดครัว
    if (['CANCELLED', 'VOIDED', 'REFUNDED'].includes(newStatus)) {
        await c.query("UPDATE order_item SET item_status = 'VOID' WHERE order_id = $1", [orderId]);
        if (newStatus === 'REFUNDED') {
            await c.query(
                "UPDATE payment SET status = 'REFUNDED', updated_at = now() WHERE order_id = $1",
                [orderId]);
        }
    }

    await touch(c, branchId, 'orders', orderId, 'update');
    return { ok: true, status: newStatus };
}

async function settlePayment(c, branchId, order, opts, ctx) {
    const amount = Number(order.total);
    const method = opts.method || order.payment_method || 'CASH';

    // เพดานการยืนยันแทน — เช็คที่เซิร์ฟเวอร์ ไม่ใช่แค่ disable ปุ่ม
    if (opts.override) {
        const limit = CFPerms.overrideLimitFor(ctx.user, await settingsOf(c, branchId));
        if (limit != null && amount > limit) {
            throw new ApiError(403,
                `ยอด ฿${amount.toFixed(2)} เกินเพดานที่ยืนยันแทนได้ (฿${Number(limit).toFixed(2)})`);
        }
        if (!String(opts.reason || '').trim()) {
            throw new ApiError(400, 'การยืนยันแทนต้องระบุเหตุผล');
        }
    }

    const existing = (await c.query(
        "SELECT * FROM payment WHERE order_id = $1 AND status <> 'REFUNDED' ORDER BY created_at LIMIT 1",
        [order.id])).rows[0];

    const received = opts.received != null ? Number(opts.received) : null;
    const change = received != null ? Math.max(0, received - amount) : null;
    const paymentId = existing ? existing.id : 'PM-' + crypto.randomBytes(6).toString('hex');

    if (existing) {
        await c.query(
            `UPDATE payment SET status = 'PAID', amount = $2, received = $3, change_amount = $4,
                    ref = COALESCE($5, ref), bank = COALESCE($6, bank),
                    tx_at = COALESCE(tx_at, now()), verified_by = $7,
                    override_by = $8, override_reason = $9,
                    override_at = CASE WHEN $8::text IS NULL THEN NULL ELSE now() END,
                    updated_at = now()
              WHERE id = $1`,
            [paymentId, amount, received, change, opts.ref || null, opts.bank || null,
             ctx.actorUserId || 'SYSTEM',
             opts.override ? ctx.actorUserId : null, opts.override ? opts.reason : null]);
    } else {
        await c.query(
            `INSERT INTO payment (id, branch_id, order_id, method, amount, received,
                                  change_amount, ref, bank, tx_at, status, verified_by,
                                  override_by, override_reason, override_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),'PAID',$10,$11,$12,
                     CASE WHEN $11::text IS NULL THEN NULL ELSE now() END)`,
            [paymentId, branchId, order.id, method, amount, received, change,
             opts.ref || null, opts.bank || null, ctx.actorUserId || 'SYSTEM',
             opts.override ? ctx.actorUserId : null, opts.override ? opts.reason : null]);
    }

    await audit(c, branchId, {
        eventType: opts.override ? 'PAYMENT_OVERRIDE'
            : (method === 'CASH' ? 'PAYMENT_RECEIVED' : 'PAYMENT_VERIFIED'),
        orderId: order.id, actorKind: ctx.actorKind, actorUserId: ctx.actorUserId,
        deviceId: ctx.deviceId, reason: opts.override ? opts.reason : null, ip: ctx.ip,
        payload: { amount, method },
    });
    await touch(c, branchId, 'payments', paymentId, existing ? 'update' : 'insert');
}

async function sendToKitchen(c, branchId, order, ctx) {
    const stations = (await c.query(
        'SELECT DISTINCT station FROM order_item WHERE order_id = $1', [order.id])).rows;

    for (const s of stations) {
        await c.query(
            `INSERT INTO order_station_status (order_id, station, status, printed_at)
             VALUES ($1, $2, 'QUEUED', now())
             ON CONFLICT (order_id, station) DO NOTHING`, [order.id, s.station]);
    }
    await c.query("UPDATE order_item SET item_status = 'QUEUED' WHERE order_id = $1", [order.id]);
    await c.query(
        `UPDATE cf_order SET prev_status = status, status = 'SENT_TO_KITCHEN',
                sent_at = now(), rev = nextval('global_rev'), updated_at = now()
          WHERE id = $1`, [order.id]);

    await audit(c, branchId, {
        eventType: 'STATUS_CHANGE', orderId: order.id, oldStatus: 'PAID',
        newStatus: 'SENT_TO_KITCHEN', actorKind: 'SYSTEM', deviceId: ctx.deviceId, ip: ctx.ip,
        payload: { stations: stations.map((x) => x.station) },
    });
}

/* ══════════════════════════════════════════════════════════════════
   สถานีทำเสร็จ (§21)
   ══════════════════════════════════════════════════════════════════ */
async function setStationReady(c, branchId, orderId, station, ctx) {
    const o = (await c.query(
        'SELECT * FROM cf_order WHERE id = $1 AND branch_id = $2 FOR UPDATE',
        [orderId, branchId])).rows[0];
    if (!o) throw new ApiError(404, 'ไม่พบออเดอร์');
    if (!['SENT_TO_KITCHEN', 'PREPARING'].includes(o.status)) {
        throw new ApiError(409, 'ออเดอร์นี้ไม่ได้อยู่ในขั้นตอนการผลิต');
    }

    const upd = await c.query(
        `UPDATE order_station_status SET status = 'READY', ready_at = now(), ready_by = $3
          WHERE order_id = $1 AND station = $2 AND status <> 'READY' RETURNING station`,
        [orderId, station, ctx.actorUserId || null]);
    if (!upd.rows.length) throw new ApiError(409, 'สถานีนี้กดพร้อมไปแล้ว');

    await c.query(
        "UPDATE order_item SET item_status = 'READY' WHERE order_id = $1 AND station = $2",
        [orderId, station]);

    // ★ ออเดอร์เป็น READY ต่อเมื่อ "ทุกสถานี" พร้อม — เช็คในทรานแซกชันเดียวกับที่เขียน
    //   จึงไม่มีทางที่สองสถานีกดพร้อมกันแล้วทั้งคู่คิดว่าตัวเองไม่ใช่คนสุดท้าย
    const remaining = Number((await c.query(
        `SELECT count(*)::int AS n FROM order_station_status
          WHERE order_id = $1 AND status <> 'READY'`, [orderId])).rows[0].n);

    const next = remaining === 0 ? 'READY' : 'PREPARING';
    if (o.status !== next) {
        await c.query(
            `UPDATE cf_order SET prev_status = status, status = $2,
                    ${next === 'READY' ? 'ready_at' : 'preparing_at'} = now(),
                    rev = nextval('global_rev'), updated_at = now()
              WHERE id = $1`, [orderId, next]);
        await audit(c, branchId, {
            eventType: 'STATUS_CHANGE', orderId, oldStatus: o.status, newStatus: next,
            actorKind: ctx.actorKind, actorUserId: ctx.actorUserId, deviceId: ctx.deviceId, ip: ctx.ip,
        });
    }

    await audit(c, branchId, {
        eventType: 'STATION_READY', orderId,
        actorKind: ctx.actorKind, actorUserId: ctx.actorUserId, deviceId: ctx.deviceId,
        ip: ctx.ip, payload: { station, remaining },
    });
    await touch(c, branchId, 'orders', orderId, 'update');

    return { ok: true, station, remaining, orderStatus: next };
}

/* ══════════════════════════════════════════════════════════════════
   ลงทะเบียน route
   ══════════════════════════════════════════════════════════════════ */
function registerOrders(app, { pool, tx, query, branchId }) {

    /** ผู้กระทำของ request นี้ — คน หรือ คีออสก์ */
    async function context(req) {
        const user = await currentUser(query, req);
        const deviceId = req.headers['x-cf-device'] || null;
        const ip = req.ip ? req.ip.replace(/^::ffff:/, '') : null;
        return {
            user,
            actorKind: user ? 'USER' : (deviceId && /^KIOSK/i.test(deviceId) ? 'KIOSK' : 'SYSTEM'),
            actorUserId: user ? user.id : null,
            deviceId, ip,
        };
    }

    function requirePerm(ctx, key) {
        if (!ctx.user) throw new ApiError(401, 'ต้องเข้าสู่ระบบก่อน');
        if (!CFPerms.can(ctx.user.role, key)) throw new ApiError(403, 'บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้');
    }

    const handle = (fn) => async (req, reply) => {
        try {
            return await fn(req, reply);
        } catch (err) {
            if (err instanceof ApiError) {
                return reply.code(err.status).send({ error: err.message, ...err });
            }
            // unique violation จาก client_uuid / จ่ายซ้ำ — ตอบให้รู้เรื่อง ไม่ใช่ 500 เปล่า ๆ
            if (err.code === '23505') {
                req.log.warn({ err: err.detail }, 'unique violation');
                return reply.code(409).send({ error: 'รายการนี้ถูกบันทึกไปแล้ว' });
            }
            req.log.error(err);
            return reply.code(500).send({ error: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
        }
    };

    /* ── สร้างออเดอร์ — คีออสก์เรียก ไม่ต้องล็อกอิน ── */
    app.post('/api/orders', handle(async (req) => {
        const ctx = await context(req);
        const out = await tx((c) => createOrder(c, branchId(), req.body || {}, ctx));
        publish(branchId(), { entity: 'orders', op: 'insert', id: out.orderId });
        return out;
    }));

    /* ── เปลี่ยนสถานะ ── */
    app.post('/api/orders/:id/transition', handle(async (req) => {
        const ctx = await context(req);
        const to = (req.body || {}).status;

        // คีออสก์เปลี่ยนได้เฉพาะช่วงที่ลูกค้ายังถือออเดอร์อยู่ ที่เหลือต้องเป็นพนักงาน
        const KIOSK_ALLOWED = ['WAITING_CASH', 'WAITING_PAYMENT', 'PAYMENT_TIMEOUT', 'PAYMENT_REVIEW'];
        if (!ctx.user) {
            if (ctx.actorKind !== 'KIOSK' || !KIOSK_ALLOWED.includes(to)) {
                throw new ApiError(401, 'ต้องเข้าสู่ระบบก่อน');
            }
        } else if (to === 'PAID') {
            requirePerm(ctx, 'PAY_RECEIVE');
        }

        const out = await tx((c) =>
            transition(c, branchId(), req.params.id, to, req.body || {}, ctx));
        publish(branchId(), { entity: 'orders', op: 'update', id: req.params.id });
        return out;
    }));

    /* ── สถานีทำเสร็จ ── */
    app.post('/api/orders/:id/stations/:station/ready', handle(async (req) => {
        const ctx = await context(req);
        requirePerm(ctx, 'KITCHEN');
        const out = await tx((c) =>
            setStationReady(c, branchId(), req.params.id, req.params.station, ctx));
        publish(branchId(), { entity: 'orders', op: 'update', id: req.params.id });
        return out;
    }));

    /* ── บันทึกการพิมพ์ (§19 reprint ต้องตรวจสอบย้อนหลังได้) ── */
    app.post('/api/orders/:id/print', handle(async (req) => {
        const ctx = await context(req);
        const docType = (req.body || {}).docType || 'receipt';
        await tx(async (c) => {
            if (docType === 'receipt') {
                await c.query(
                    `UPDATE cf_order SET reprint_count = reprint_count + 1,
                            rev = nextval('global_rev') WHERE id = $1 AND branch_id = $2`,
                    [req.params.id, branchId()]);
            }
            await audit(c, branchId(), {
                eventType: 'PRINT', orderId: req.params.id,
                actorKind: ctx.actorKind, actorUserId: ctx.actorUserId,
                deviceId: ctx.deviceId, ip: ctx.ip, payload: { docType },
            });
            await touch(c, branchId(), 'orders', req.params.id, 'update');
        });
        publish(branchId(), { entity: 'orders', op: 'update', id: req.params.id });
        return { ok: true };
    }));

    return { context, requirePerm, handle, audit, touch, ApiError, businessDate, settingsOf };
}

module.exports = { registerOrders, createOrder, transition, setStationReady,
                   audit, touch, ApiError, businessDate, settingsOf };
