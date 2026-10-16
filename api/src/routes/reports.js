/**
 * CafeFlow — รายงานและการค้นหาย้อนหลัง (§25, §26, §27, §28)
 * ══════════════════════════════════════════════════════════════════
 * ทำไมต้องย้ายมาคิดที่เซิร์ฟเวอร์:
 *   หน้าเว็บ cache ข้อมูลไว้แค่ 24 ชั่วโมง + ออเดอร์ที่ยังไม่จบ ซึ่งพอสำหรับ
 *   "หน้างานวันนี้" แต่ตัวเลขของรอบที่ปิดไปแล้วหรือรายงานข้ามวันจะขาดไปเงียบ ๆ
 *   — ผิดแบบที่ไม่มีใครสังเกต จนกว่าจะเอาไปกระทบกับบัญชี
 *
 * นิยามของคำว่า "ขายแล้ว" ต้องอยู่ที่เดียว ไม่งั้นแต่ละหน้าจะตีความต่างกัน
 */
'use strict';
const { ApiError, businessDateFor } = require('./orders');
const { CFPerms } = require('../../../shared/cf-perms.js');

/** สถานะที่ถือว่าขายแล้ว — จ่ายเงินเรียบร้อยและยังไม่ถูกคืน */
const SOLD = ['PAID', 'SENT_TO_KITCHEN', 'PREPARING', 'READY', 'SERVED', 'COMPLETED'];
const IN_PROGRESS = ['SENT_TO_KITCHEN', 'PREPARING'];
const WAITING_PAY = ['WAITING_CASH', 'WAITING_PAYMENT', 'PAYMENT_TIMEOUT', 'PAYMENT_REVIEW'];

const n = (v) => (v == null ? 0 : Number(v));

/**
 * เงื่อนไขขอบเขต — ต่อท้าย args ที่ส่งมา คืนรายการเงื่อนไข SQL
 *   shiftId           รอบขาย
 *   from / to         เวลาสร้างออเดอร์ (timestamptz · to ไม่รวม)
 *   dayFrom / dayTo   วันทำการ 'YYYY-MM-DD' (รวมทั้งสองวัน) — ตรงกับเลข A001 และหน้าประวัติบิล
 *                     ไม่ใช่เที่ยงคืน: ร้านปิดหลังเที่ยงคืนได้ ยอดตี 1 ยังเป็นของ "เมื่อวาน"
 */
function scopeWhere({ shiftId, from, to, dayFrom, dayTo }, args) {
    const where = [];
    if (shiftId) { args.push(shiftId); where.push(`o.shift_id = $${args.length}`); }
    if (from) { args.push(from); where.push(`o.created_at >= $${args.length}`); }
    if (to) { args.push(to); where.push(`o.created_at < $${args.length}`); }
    if (dayFrom) { args.push(dayFrom); where.push(`o.business_date >= $${args.length}::date`); }
    if (dayTo) { args.push(dayTo); where.push(`o.business_date <= $${args.length}::date`); }
    return where;
}

/**
 * สรุปตัวเลขของขอบเขตหนึ่ง (รอบขาย · ช่วงเวลา · ช่วงวันทำการ)
 * รูปทรงต้องตรงกับ CFKpi.summary() ฝั่งเบราว์เซอร์เป๊ะ — หน้าเว็บอ่านคีย์เดิม
 */
async function summarize(c, branchId, opts) {
    const args = [branchId];
    const where = scopeWhere(opts || {}, args);
    const scope = where.length ? 'AND ' + where.join(' AND ') : '';

    const sql = (extra) => `SELECT ${extra} FROM cf_order o WHERE o.branch_id = $1 ${scope}`;

    const r = (await c.query(sql(`
        COALESCE(SUM(o.total) FILTER (WHERE o.status = ANY($${args.length + 1})), 0) AS sales,
        COALESCE(SUM(o.total) FILTER (WHERE o.status = ANY($${args.length + 1})
                                        AND o.payment_method = 'CASH'), 0) AS cash,
        COALESCE(SUM(o.total) FILTER (WHERE o.status = ANY($${args.length + 1})
                                        AND o.payment_method = 'QR'), 0) AS qr,
        count(*) FILTER (WHERE o.status = ANY($${args.length + 1}))::int AS order_count,
        count(*) FILTER (WHERE o.status IN ('CANCELLED','VOIDED'))::int AS cancelled_count,
        COALESCE(SUM(o.total) FILTER (WHERE o.status IN ('CANCELLED','VOIDED')), 0) AS cancelled_amount,
        count(*) FILTER (WHERE o.status = 'REFUNDED')::int AS refunded_count,
        COALESCE(SUM(o.total) FILTER (WHERE o.status = 'REFUNDED'), 0) AS refunded_amount,
        count(*) FILTER (WHERE o.status = ANY($${args.length + 2}))::int AS waiting_pay,
        count(*) FILTER (WHERE o.status = 'WAITING_CASH')::int AS waiting_cash,
        count(*) FILTER (WHERE o.status IN ('PAYMENT_REVIEW','PAYMENT_TIMEOUT'))::int AS payment_review,
        count(*) FILTER (WHERE o.status = ANY($${args.length + 3}))::int AS preparing,
        count(*) FILTER (WHERE o.status = 'READY')::int AS ready,
        -- เวลารอชำระ: สร้างออเดอร์ → จ่ายเสร็จ · เวลาจัดเตรียม: เข้าครัว → พร้อมรับ
        COALESCE(AVG(EXTRACT(EPOCH FROM (o.paid_at - o.created_at)))
                 FILTER (WHERE o.paid_at IS NOT NULL), 0) AS avg_wait_sec,
        COALESCE(AVG(EXTRACT(EPOCH FROM (o.ready_at - o.sent_at)))
                 FILTER (WHERE o.ready_at IS NOT NULL AND o.sent_at IS NOT NULL), 0) AS avg_prep_sec,
        MIN(o.created_at) FILTER (WHERE o.status = ANY($${args.length + 1})) AS first_at,
        MAX(o.created_at) FILTER (WHERE o.status = ANY($${args.length + 1})) AS last_at
    `), [...args, SOLD, WAITING_PAY, IN_PROGRESS])).rows[0];

    const sales = n(r.sales);
    const count = n(r.order_count);

    // ออเดอร์ต่อชั่วโมง คิดจากช่วงที่มีการขายจริง ไม่ใช่ความยาวของกะ
    // (กะ 8 ชั่วโมงที่ขายจริง 2 ชั่วโมง ตัวเลขต้องสะท้อนความหนาแน่นตอนขาย)
    let throughput = count;
    if (count >= 2 && r.first_at && r.last_at) {
        const hours = (new Date(r.last_at) - new Date(r.first_at)) / 3600000;
        throughput = hours > 0.1 ? count / hours : count;
    }

    return {
        sales, cash: n(r.cash), qr: n(r.qr),
        orderCount: count,
        avgOrder: count ? sales / count : 0,
        cancelledCount: r.cancelled_count, cancelledAmount: n(r.cancelled_amount),
        refundedCount: r.refunded_count, refundedAmount: n(r.refunded_amount),
        waitingPay: r.waiting_pay, waitingCash: r.waiting_cash,
        paymentReview: r.payment_review, preparing: r.preparing, ready: r.ready,
        avgWaitSec: n(r.avg_wait_sec), avgPrepSec: n(r.avg_prep_sec),
        throughput,
    };
}

/** สินค้าขายดี — ใช้ในใบปิดรอบ */
async function topProducts(c, branchId, opts, limit = 8, withCost = false) {
    const args = [branchId, SOLD];
    const where = ['o.branch_id = $1', 'o.status = ANY($2)', ...scopeWhere(opts || {}, args)];
    args.push(limit);

    const r = await c.query(
        `SELECT i.product_id, i.name_snapshot AS name,
                SUM(i.qty)::int AS qty,
                SUM(i.qty * i.unit_price) AS amount,
                SUM(i.qty * i.unit_cost) AS cost,
                bool_or(i.unit_cost IS NULL) AS cost_missing
           FROM order_item i JOIN cf_order o ON o.id = i.order_id
          WHERE ${where.join(' AND ')} AND i.item_status <> 'VOID'
          GROUP BY i.product_id, i.name_snapshot
          ORDER BY qty DESC LIMIT $${args.length}`, args);

    // ต้นทุนส่งเฉพาะคนที่แก้ราคาได้ · บางแก้วยังไม่ได้ใส่ต้นทุน = cost null (ไม่เดากำไร)
    return r.rows.map((x) => {
        const out = { productId: x.product_id, name: x.name, qty: x.qty, amount: n(x.amount) };
        if (withCost) out.cost = x.cost_missing ? null : n(x.cost);
        return out;
    });
}

/** ภาระงานแต่ละสถานี — นับตั๋วที่ยังไม่พร้อมของออเดอร์ที่อยู่ในสายการผลิต */
async function stationLoad(c, branchId) {
    const r = await c.query(
        `SELECT s.station, count(*)::int AS n
           FROM order_station_status s JOIN cf_order o ON o.id = s.order_id
          WHERE o.branch_id = $1 AND o.status = ANY($2) AND s.status <> 'READY'
          GROUP BY s.station`, [branchId, IN_PROGRESS]);

    const load = { BAR: 0, KITCHEN: 0, BAKERY: 0, DESSERT: 0 };
    r.rows.forEach((x) => { load[x.station] = x.n; });
    const max = Math.max(1, ...Object.values(load));
    return Object.keys(load).map((st) => ({
        station: st, count: load[st], pct: Math.round((load[st] / max) * 100),
    }));
}

/** การควบคุมเงินสด (§27) */
async function cashControl(c, branchId, shiftId) {
    const sh = (await c.query('SELECT * FROM shift WHERE id = $1 AND branch_id = $2',
        [shiftId, branchId])).rows[0];
    if (!sh) return null;
    const s = await summarize(c, branchId, { shiftId });
    const opening = n(sh.opening_cash);
    // รอบที่ปิดแล้วใช้ค่าที่ snapshot ไว้ตอนปิด ไม่คำนวณใหม่
    // ไม่งั้นแก้ออเดอร์ย้อนหลังแล้วส่วนต่างของรอบเก่าขยับตาม
    const frozen = sh.status === 'CLOSED' && sh.expected_cash != null;
    const expected = frozen ? n(sh.expected_cash) : opening + s.cash;
    // ขายเงินสดของรอบที่ปิดแล้วต้องมาจาก snapshot เดียวกัน — ไม่งั้นคืนเงินหลังปิดรอบแล้ว
    // ใบปิดรอบบวกไม่ลงตัว (เงินตั้งต้น + ขายเงินสด ≠ ควรมี)
    const cashSales = frozen ? expected - opening : s.cash;
    const actual = sh.actual_cash == null ? null : n(sh.actual_cash);
    return { shiftId, opening, cashSales, expected, actual,
             difference: actual == null ? null : actual - expected };
}

/** ก้อนรายงานที่แนบไปกับ snapshot — หน้าเว็บจึงอ่านได้แบบ synchronous */
async function snapshotReports(c, branchId, withCost) {
    const open = (await c.query(
        "SELECT id FROM shift WHERE branch_id = $1 AND status = 'OPEN' LIMIT 1",
        [branchId])).rows[0];
    const shiftId = open ? open.id : null;
    // ยอดของวันทำการนี้ — หน้าภาพรวมใช้เป็นตัวเลขหลัก (แบบ POS ทั่วไป) · ยอดของรอบไว้นับลิ้นชัก (แคชเชียร์/ปิดรอบ)
    const day = await businessDateFor(c, branchId);
    const today = { date: day, summary: await summarize(c, branchId, { dayFrom: day, dayTo: day }) };
    // ไม่มีรอบเปิด → ใช้ยอดวันนี้ · เดิม summarize({}) ไม่มีเงื่อนไขเลย = รวมยอดทั้งประวัติร้านมาโชว์
    const scope = shiftId ? { shiftId } : { dayFrom: day, dayTo: day };
    return {
        shiftId,
        summary: shiftId ? await summarize(c, branchId, scope) : today.summary,
        today,
        stationLoad: await stationLoad(c, branchId),
        topProducts: await topProducts(c, branchId, scope, 8, withCost),
        cashControl: shiftId ? await cashControl(c, branchId, shiftId) : null,
    };
}

/* ══════════════════════════════════════════════════════════════════ */
/**
 * วาดใบปิดรอบสำหรับกระดาษม้วน — ใช้ทั้งพรีวิวและพิมพ์จริง ภาพจึงตรงกันเสมอ
 * ออกที่เครื่องของเคาน์เตอร์ (ไม่ผูกสถานี) เหมือนใบเสร็จ
 * หารอบไม่เจอ = 404 — ห้ามถอยไปใช้รอบที่เปิดอยู่ ใบปิดรอบผิดรอบคือตัวเลขเงินผิดทั้งใบ
 */
async function renderClosing(c, branchId, shiftId) {
    const { closingSlip } = require('../print/raster');
    const escpos = require('../print/escpos');
    const { printerFor } = require('../print/worker');

    const shift = (await c.query('SELECT * FROM shift WHERE id = $1 AND branch_id = $2',
        [shiftId, branchId])).rows[0];
    if (!shift) throw new ApiError(404, 'ไม่พบรอบการขาย');

    const staffId = shift.closed_by || shift.opened_by;
    const staff = staffId
        ? (await c.query('SELECT name_th FROM app_user WHERE id = $1', [staffId])).rows[0]
        : null;
    const branch = (await c.query('SELECT * FROM branch WHERE id = $1', [branchId])).rows[0];
    const printer = await printerFor(c, branchId, null);
    const width = (printer && printer.paper_width) || '80mm';

    const doc = closingSlip({
        shift, branch, width, dots: printer && printer.print_dots,
        summary: await summarize(c, branchId, { shiftId }),
        cash: await cashControl(c, branchId, shiftId),
        staff: staff ? staff.name_th : null,
    });
    const payload = escpos.document({ bitmap: doc.bitmap, width: doc.width, height: doc.height });
    return { doc, payload, printer, width };
}

function registerReports(app, deps) {
    const { pool, tx, query, branchId } = deps;
    const { context, requirePerm, handle, audit } = deps.helpers;

    const printerInfo = (p) => {
        const { targetOf } = require('../print/worker');
        return p ? { id: p.id, name: p.name_th, conn: p.printer_conn || 'NETWORK',
                     ready: !!targetOf(p, false) } : null;
    };

    /** พรีวิวใบปิดรอบ — บิตแมปชุดเดียวกับที่จะส่งเข้าเครื่องพิมพ์ */
    app.get('/api/reports/shift/:id/print-preview', handle(async (req) => {
        const ctx = await context(req);
        requirePerm(ctx, 'SHIFT_CLOSE');
        const { bitsToPng } = require('../print/raster');
        const c = await pool.connect();
        try {
            const r = await renderClosing(c, branchId(), req.params.id);
            const png = bitsToPng(r.doc.bitmap, r.doc.width, r.doc.height);
            return { image: 'data:image/png;base64,' + png.toString('base64'),
                     width: r.width, dots: r.doc.width, printer: printerInfo(r.printer) };
        } finally { c.release(); }
    }));

    /** พิมพ์ใบปิดรอบที่เครื่องพิมพ์ความร้อนของเคาน์เตอร์ */
    app.post('/api/reports/shift/:id/print', handle(async (req) => {
        const ctx = await context(req);
        requirePerm(ctx, 'SHIFT_CLOSE');
        const { enqueue } = require('../print/worker');
        return tx(async (c) => {
            const { payload, printer, width } = await renderClosing(c, branchId(), req.params.id);
            const jobId = await enqueue(c, branchId(), {
                deviceId: printer ? printer.id : null,
                docType: 'CLOSING', paperWidth: width, payload,
            });
            await audit(c, branchId(), {
                eventType: 'PRINT', actorKind: ctx.actorKind, actorUserId: ctx.actorUserId,
                deviceId: ctx.deviceId, ip: ctx.ip,
                payload: { docType: 'CLOSING', shiftId: req.params.id, width, jobId },
            });
            return { ok: true, jobId, width, printer: printerInfo(printer) };
        });
    }));

    /** รายงานของรอบใดก็ได้ รวมรอบที่ปิดไปแล้ว */
    app.get('/api/reports/shift/:id', handle(async (req) => {
        const ctx = await context(req);
        requirePerm(ctx, 'REPORT');
        const c = await pool.connect();
        try {
            const id = req.params.id;
            return {
                shiftId: id,
                summary: await summarize(c, branchId(), { shiftId: id }),
                topProducts: await topProducts(c, branchId(), { shiftId: id }, 20, !!(ctx.user && CFPerms.can(ctx.user.role, 'PRICE_EDIT'))),
                cashControl: await cashControl(c, branchId(), id),
            };
        } finally { c.release(); }
    }));

    /** รายงานตามช่วงเวลา — ข้ามวันได้ ไม่ติดหน้าต่าง cache ของเบราว์เซอร์ */
    app.get('/api/reports/range', handle(async (req) => {
        const ctx = await context(req);
        requirePerm(ctx, 'REPORT');
        const { from, to } = req.query;
        if (!from || !to) throw new ApiError(400, 'ต้องระบุ from และ to');
        const c = await pool.connect();
        try {
            return {
                from, to,
                summary: await summarize(c, branchId(), { from, to }),
                topProducts: await topProducts(c, branchId(), { from, to }, 20, !!(ctx.user && CFPerms.can(ctx.user.role, 'PRICE_EDIT'))),
            };
        } finally { c.release(); }
    }));

    /**
     * หน้ารายงาน (reports.html) — ช่วงวันทำการ from..to (รวมทั้งสองวัน · ตรงกับเลข A001)
     * ผู้จัดการ + แอดมินเท่านั้น (ผู้ใช้เลือก 15/10/2569) — แคชเชียร์ดูยอดรอบตัวเองที่หน้าปิดรอบได้อยู่แล้ว
     *   summary   ตัวเลขสรุป (รูปทรงเดียวกับ CFKpi.summary)
     *   byHour    ยอดขายแต่ละชั่วโมง 0–23 (เวลาไทย ตามเวลาสั่ง) · byDay ยอดแต่ละวันทำการ
     *   products  ทุกเมนูที่ขาย + ต้นทุน/กำไร (ต้นทุน ณ วันขาย · ไม่รวมท็อปปิ้ง = กำไรสูงกว่าจริงเล็กน้อยถ้ามีท็อปปิ้งเสริม)
     *   staff     ต่อพนักงาน: บิลที่รับเงิน · ยืนยันแทน · ยกเลิก/คืนเงิน
     *             บิลที่ระบบปิดเองจากสลิปผ่าน (cashier_id ว่าง) รวมเป็นแถว "ระบบอัตโนมัติ"
     */
    app.get('/api/reports/days', handle(async (req) => {
        const ctx = await context(req);
        if (!ctx.user) throw new ApiError(401, 'ต้องเข้าสู่ระบบก่อน');
        if (!['ADMIN', 'MANAGER'].includes(ctx.user.role)) throw new ApiError(403, 'รายงานดูได้เฉพาะผู้จัดการและแอดมิน');
        const DAY = /^\d{4}-\d{2}-\d{2}$/;
        const { from, to } = req.query;
        if (!DAY.test(String(from || '')) || !DAY.test(String(to || ''))) throw new ApiError(400, 'ต้องระบุ from และ to เป็น YYYY-MM-DD');
        if (from > to) throw new ApiError(400, 'วันเริ่มต้องไม่หลังวันสิ้นสุด');
        if ((new Date(to) - new Date(from)) / 86400000 > 366) throw new ApiError(400, 'ดูได้ครั้งละไม่เกิน 1 ปี');

        const scope = { dayFrom: from, dayTo: to };
        const c = await pool.connect();
        try {
            const args = [branchId(), from, to, SOLD];
            const inRange = 'o.branch_id = $1 AND o.business_date BETWEEN $2::date AND $3::date';

            const hours = (await c.query(
                `SELECT EXTRACT(HOUR FROM o.created_at AT TIME ZONE 'Asia/Bangkok')::int AS h,
                        count(*)::int AS orders, SUM(o.total) AS sales
                   FROM cf_order o WHERE ${inRange} AND o.status = ANY($4)
                  GROUP BY 1`, args)).rows;
            const byHour = Array.from({ length: 24 }, (_, h) => {
                const r = hours.find((x) => x.h === h);
                return { hour: h, orders: r ? r.orders : 0, sales: r ? n(r.sales) : 0 };
            });

            const byDay = (await c.query(
                `SELECT to_char(o.business_date, 'YYYY-MM-DD') AS day,
                        count(*) FILTER (WHERE o.status = ANY($4))::int AS orders,
                        COALESCE(SUM(o.total) FILTER (WHERE o.status = ANY($4)), 0) AS sales
                   FROM cf_order o WHERE ${inRange}
                  GROUP BY 1 ORDER BY 1`, args)).rows.map((r) => ({ day: r.day, orders: r.orders, sales: n(r.sales) }));

            // ต่อพนักงาน — รับเงิน (ผูกที่ cashier_id ตอนเป็น PAID) · ยืนยันแทน · ยกเลิก/ยกเลิกบิล/คืนเงิน (จาก audit)
            const paid = (await c.query(
                `SELECT o.cashier_id AS id, count(*)::int AS orders, SUM(o.total) AS sales,
                        COALESCE(SUM(o.total) FILTER (WHERE o.payment_method = 'CASH'), 0) AS cash,
                        COALESCE(SUM(o.total) FILTER (WHERE o.payment_method = 'QR'), 0) AS qr
                   FROM cf_order o WHERE ${inRange} AND o.status = ANY($4)
                  GROUP BY 1`, args)).rows;
            const overrides = (await c.query(
                `SELECT p.override_by AS id, count(*)::int AS n
                   FROM payment p JOIN cf_order o ON o.id = p.order_id
                  WHERE ${inRange} AND p.override_by IS NOT NULL GROUP BY 1`, args.slice(0, 3))).rows;
            const voids = (await c.query(
                `SELECT a.actor_user_id AS id, a.new_status AS st, count(*)::int AS n
                   FROM audit_log a JOIN cf_order o ON o.id = a.order_id
                  WHERE ${inRange} AND a.event_type = 'STATUS_CHANGE'
                    AND a.new_status IN ('CANCELLED','VOIDED','REFUNDED') AND a.actor_user_id IS NOT NULL
                  GROUP BY 1, 2`, args.slice(0, 3))).rows;
            const users = new Map((await c.query('SELECT id, name_th, role, active FROM app_user WHERE branch_id = $1',
                [branchId()])).rows.map((u) => [u.id, u]));

            const staff = new Map();
            const row = (id) => {
                const key = id || 'SYSTEM';
                if (!staff.has(key)) {
                    const u = id ? users.get(id) : null;
                    staff.set(key, { userId: id || null, name: u ? u.name_th : (id ? id : 'ระบบอัตโนมัติ (สลิปผ่าน)'),
                                     role: u ? u.role : null, active: u ? u.active : true,
                                     orders: 0, sales: 0, cash: 0, qr: 0, overrides: 0, cancelled: 0, voided: 0, refunded: 0 });
                }
                return staff.get(key);
            };
            paid.forEach((p) => Object.assign(row(p.id), { orders: p.orders, sales: n(p.sales), cash: n(p.cash), qr: n(p.qr) }));
            overrides.forEach((o) => { row(o.id).overrides = o.n; });
            voids.forEach((v) => { row(v.id)[{ CANCELLED: 'cancelled', VOIDED: 'voided', REFUNDED: 'refunded' }[v.st]] = v.n; });

            /* ── สรุปยอดขายรายวัน (แบบ POS ทั่วไป) ──
               ยอดขายรวม = ก่อนหักคืนเงิน/ส่วนลด (บิลที่เคยรับเงิน: ขายแล้ว + คืนเงิน)
               สุทธิ = รวม − คืนเงิน − ส่วนลด = ยอดของบิลที่ขายอยู่ (ตรงกับ summary.sales)
               ★ คืนเงินนับเข้าวันทำการของบิล ไม่ใช่วันที่คืน — บิลหนึ่งใบอยู่วันเดียว ยอดย้อนหลังไม่ขยับข้ามวัน */
            const PAID_EVER = [...SOLD, 'REFUNDED'];
            const dayRows = (await c.query(
                `SELECT to_char(o.business_date, 'YYYY-MM-DD') AS day,
                        COALESCE(SUM(o.total + o.discount), 0) AS gross,
                        COALESCE(SUM(o.total) FILTER (WHERE o.status = 'REFUNDED'), 0) AS refunds,
                        COALESCE(SUM(o.discount), 0) AS discounts,
                        count(*) FILTER (WHERE o.status = ANY($4))::int AS orders,
                        count(*) FILTER (WHERE o.discount > 0)::int AS discount_orders
                   FROM cf_order o WHERE ${inRange} AND o.status = ANY($5)
                  GROUP BY 1 ORDER BY 1`, [...args, PAID_EVER])).rows;
            const costRows = (await c.query(
                `SELECT to_char(o.business_date, 'YYYY-MM-DD') AS day,
                        SUM(i.qty * i.unit_cost) AS cost, bool_or(i.unit_cost IS NULL) AS cost_missing
                   FROM order_item i JOIN cf_order o ON o.id = i.order_id
                  WHERE ${inRange} AND o.status = ANY($4) AND i.item_status <> 'VOID'
                  GROUP BY 1`, args)).rows;
            const costOf = new Map(costRows.map((r) => [r.day, r]));
            const daily = dayRows.map((r) => {
                const k = costOf.get(r.day);
                const net = n(r.gross) - n(r.refunds) - n(r.discounts);
                const cost = k && !k.cost_missing ? n(k.cost) : null;      // บางแก้วไม่มีต้นทุน = ไม่เดากำไร
                return { day: r.day, orders: r.orders, gross: n(r.gross), refunds: n(r.refunds),
                         discounts: n(r.discounts), discountOrders: r.discount_orders,
                         net, cost, profit: cost == null ? null : net - cost };
            });

            /* ── ต่อสินค้า (พร้อมหมวดปัจจุบันของสินค้า) → รวมเป็นต่อหมวดที่นี่ ไม่ query ซ้ำ ──
               amount = qty × unit_price (รวมราคาตัวเลือกแล้ว) · ต้นทุน ณ วันขาย ไม่รวมต้นทุนท็อปปิ้ง */
            const prodRows = (await c.query(
                `SELECT i.product_id, i.name_snapshot AS name,
                        COALESCE(cat.id, '') AS cat_id, COALESCE(cat.name_th, 'ไม่มีหมวด') AS cat_name,
                        SUM(i.qty)::int AS qty, SUM(i.qty * i.unit_price) AS amount,
                        SUM(i.qty * i.unit_cost) AS cost, bool_or(i.unit_cost IS NULL) AS cost_missing
                   FROM order_item i JOIN cf_order o ON o.id = i.order_id
                   LEFT JOIN product p ON p.id = i.product_id
                   LEFT JOIN category cat ON cat.id = p.category_id
                  WHERE ${inRange} AND o.status = ANY($4) AND i.item_status <> 'VOID'
                  GROUP BY 1, 2, 3, 4 ORDER BY qty DESC, amount DESC`, args)).rows;
            const products = prodRows.map((r) => ({
                productId: r.product_id, name: r.name, category: r.cat_name,
                qty: r.qty, amount: n(r.amount), cost: r.cost_missing ? null : n(r.cost),
            }));
            const cats = new Map();
            for (const p of products) {
                const k = cats.get(p.category) || { name: p.category, qty: 0, amount: 0, cost: 0, items: 0 };
                k.qty += p.qty; k.amount += p.amount; k.items += 1;
                k.cost = k.cost == null || p.cost == null ? null : k.cost + p.cost;
                cats.set(p.category, k);
            }
            const categories = [...cats.values()].sort((a, b) => b.amount - a.amount);

            /* ── ต่อประเภทการชำระ — ขาย / คืนเงิน / สุทธิ ── */
            const payments = (await c.query(
                `SELECT o.payment_method AS method,
                        count(*) FILTER (WHERE o.status = ANY($4))::int AS orders,
                        COALESCE(SUM(o.total) FILTER (WHERE o.status = ANY($4)), 0) AS amount,
                        count(*) FILTER (WHERE o.status = 'REFUNDED')::int AS refund_orders,
                        COALESCE(SUM(o.total) FILTER (WHERE o.status = 'REFUNDED'), 0) AS refunds
                   FROM cf_order o WHERE ${inRange} AND o.status = ANY($5)
                  GROUP BY 1 ORDER BY amount DESC`, [...args, PAID_EVER])).rows.map((r) => ({
                method: r.method, orders: r.orders, refundOrders: r.refund_orders,
                gross: n(r.amount) + n(r.refunds), refunds: n(r.refunds), net: n(r.amount),
            }));

            /* ── ต่อตัวเลือกเพิ่มเติม — นับเป็นจำนวนแก้ว (qty ของรายการ) · ยอด = ราคาเพิ่มของตัวเลือก ── */
            const modifiers = (await c.query(
                `SELECT m.group_id, COALESCE(g.name_th, m.group_id) AS group_name, m.label,
                        SUM(i.qty)::int AS qty, SUM(i.qty * m.price_delta) AS amount
                   FROM order_item_modifier m
                   JOIN order_item i ON i.id = m.order_item_id
                   JOIN cf_order o ON o.id = i.order_id
                   LEFT JOIN modifier_group g ON g.id = m.group_id
                  WHERE ${inRange} AND o.status = ANY($4) AND i.item_status <> 'VOID'
                  GROUP BY 1, 2, 3 ORDER BY group_name, qty DESC`, args)).rows.map((r) => ({
                group: r.group_name, label: r.label, qty: r.qty, amount: n(r.amount),
            }));

            /* ── ภาษี — เฉพาะสาขาที่จด VAT · ราคาขายรวม VAT แล้ว (สูตรเดียวกับใบเสร็จ raster.receipt) ── */
            const br = (await c.query('SELECT vat_registered, vat_percent FROM branch WHERE id = $1',
                [branchId()])).rows[0] || {};
            const rate = Number(br.vat_percent ?? 7);
            const tax = {
                registered: !!br.vat_registered, rate,
                days: daily.map((d) => {
                    const vat = d.net - d.net / (1 + rate / 100);
                    return { day: d.day, net: d.net, beforeVat: d.net - vat, vat };
                }),
            };

            return {
                from, to,
                summary: await summarize(c, branchId(), scope),
                byHour, byDay, daily,
                products, categories, payments, modifiers, tax,
                staff: [...staff.values()].sort((a, b) => b.sales - a.sales),
            };
        } finally { c.release(); }
    }));

    /**
     * รายงาน › ใบเสร็จรับเงิน — บิลที่เคยรับเงินในช่วงวันทำการ (ขายแล้ว + คืนเงิน) ใหม่สุดก่อน
     * แบ่งหน้า (ร้านขายดีเดือนหนึ่งหลายพันใบ) · all=1 = ทั้งหมดสำหรับ CSV (เพดาน 20,000 ใบ)
     */
    app.get('/api/reports/receipts', handle(async (req) => {
        const ctx = await context(req);
        if (!ctx.user) throw new ApiError(401, 'ต้องเข้าสู่ระบบก่อน');
        if (!['ADMIN', 'MANAGER'].includes(ctx.user.role)) throw new ApiError(403, 'รายงานดูได้เฉพาะผู้จัดการและแอดมิน');
        const DAY = /^\d{4}-\d{2}-\d{2}$/;
        const { from, to } = req.query;
        if (!DAY.test(String(from || '')) || !DAY.test(String(to || ''))) throw new ApiError(400, 'ต้องระบุ from และ to เป็น YYYY-MM-DD');
        if (from > to) throw new ApiError(400, 'วันเริ่มต้องไม่หลังวันสิ้นสุด');

        const all = req.query.all === '1';
        const limit = all ? 20000 : Math.min(parseInt(req.query.limit || '100', 10) || 100, 500);
        const offset = all ? 0 : Math.max(0, parseInt(req.query.offset || '0', 10) || 0);
        const args = [branchId(), from, to, [...SOLD, 'REFUNDED']];
        const where = `o.branch_id = $1 AND o.business_date BETWEEN $2::date AND $3::date AND o.status = ANY($4)`;

        const rows = (await query(
            `SELECT o.id, o.order_no, o.status, o.total, o.discount, o.payment_method, o.dining_option,
                    o.created_at, o.paid_at, o.refunded_at, o.cashier_id, u.name_th AS cashier_name,
                    (SELECT COALESCE(SUM(i.qty), 0)::int FROM order_item i
                      WHERE i.order_id = o.id AND i.item_status <> 'VOID') AS item_qty
               FROM cf_order o LEFT JOIN app_user u ON u.id = o.cashier_id
              WHERE ${where}
              ORDER BY COALESCE(o.paid_at, o.created_at) DESC
              LIMIT $5 OFFSET $6`, [...args, limit, offset])).rows;
        const total = (await query(`SELECT count(*)::int AS n FROM cf_order o WHERE ${where}`, args)).rows[0].n;

        return {
            total, limit, offset,
            receipts: rows.map((o) => ({
                id: o.id, orderNo: o.order_no, status: o.status, total: n(o.total), discount: n(o.discount),
                paymentMethod: o.payment_method, diningOption: o.dining_option,
                paidAt: o.paid_at || o.created_at, refundedAt: o.refunded_at,
                // บิลที่ระบบปิดเองจากสลิปผ่าน ไม่มีพนักงาน
                cashier: o.cashier_id ? (o.cashier_name || o.cashier_id) : 'ระบบอัตโนมัติ',
                itemQty: o.item_qty,
            })),
        };
    }));

    /**
     * ข้อมูลทั้งรอบสำหรับทำ CSV (§28)
     *
     * ส่งเป็น "ข้อมูลดิบรูปทรงเดียวกับ snapshot" ไม่ใช่ไฟล์ CSV สำเร็จรูป
     * โดยตั้งใจ — สัญญาเรื่องคอลัมน์ตาม §28 อยู่ใน cf-export.js อยู่แล้ว
     * ถ้าสร้าง CSV ที่เซิร์ฟเวอร์อีกชุดจะมีนิยามคอลัมน์สองที่ที่ค่อย ๆ เพี้ยนจากกัน
     */
    app.get('/api/reports/shift/:id/data', handle(async (req) => {
        const ctx = await context(req);
        requirePerm(ctx, 'REPORT');
        const S = require('../serialize/snapshot');
        const c = await pool.connect();
        try {
            const orders = (await c.query(
                `SELECT o.*, COALESCE(ss.m, '{}'::jsonb) AS station_status
                   FROM cf_order o
                   LEFT JOIN LATERAL (
                       SELECT jsonb_object_agg(station, status) AS m
                         FROM order_station_status WHERE order_id = o.id
                   ) ss ON true
                  WHERE o.shift_id = $1 AND o.branch_id = $2
                  ORDER BY o.created_at`, [req.params.id, branchId()])).rows;
            const ids = orders.map((o) => o.id);

            const items = ids.length ? (await c.query(
                `SELECT i.*, COALESCE(m.mods, '[]'::jsonb) AS mods
                   FROM order_item i
                   LEFT JOIN LATERAL (
                       SELECT jsonb_agg(jsonb_build_object(
                                  'groupId', group_id, 'optionId', option_id, 'label', label,
                                  'shortLabel', short_label, 'priceDelta', price_delta)
                              ORDER BY sort) AS mods
                         FROM order_item_modifier WHERE order_item_id = i.id
                   ) m ON true
                  WHERE i.order_id = ANY($1) ORDER BY i.order_id, i.line_no`, [ids])).rows : [];
            const payments = ids.length ? (await c.query(
                'SELECT * FROM payment WHERE order_id = ANY($1) ORDER BY created_at', [ids])).rows : [];

            return {
                shiftId: req.params.id,
                orders: orders.map(S.toOrder),
                orderItems: items.map(S.toOrderItem),
                payments: payments.map(S.toPayment),
            };
        } finally { c.release(); }
    }));

    /**
     * รายละเอียดออเดอร์ใบเดียว — ใช้ตอนเปิดผลค้นย้อนหลังที่ไม่ได้อยู่ใน cache
     * รูปทรงตรงกับที่ snapshot ส่ง หน้าเว็บจึงเอาไปใส่ cache ต่อได้เลย
     */
    app.get('/api/orders/:id', handle(async (req) => {
        const ctx = await context(req);
        if (!ctx.user) throw new ApiError(401, 'ต้องเข้าสู่ระบบก่อน');
        const S = require('../serialize/snapshot');
        const c = await pool.connect();
        try {
            const o = (await c.query(
                `SELECT o.*, COALESCE(ss.m, '{}'::jsonb) AS station_status
                   FROM cf_order o
                   LEFT JOIN LATERAL (
                       SELECT jsonb_object_agg(station, status) AS m
                         FROM order_station_status WHERE order_id = o.id
                   ) ss ON true
                  WHERE o.id = $1 AND o.branch_id = $2`,
                [req.params.id, branchId()])).rows[0];
            if (!o) throw new ApiError(404, 'ไม่พบออเดอร์');

            const items = (await c.query(
                `SELECT i.*, COALESCE(m.mods, '[]'::jsonb) AS mods
                   FROM order_item i
                   LEFT JOIN LATERAL (
                       SELECT jsonb_agg(jsonb_build_object(
                                  'groupId', group_id, 'optionId', option_id, 'label', label,
                                  'shortLabel', short_label, 'priceDelta', price_delta)
                              ORDER BY sort) AS mods
                         FROM order_item_modifier WHERE order_item_id = i.id
                   ) m ON true
                  WHERE i.order_id = $1 ORDER BY i.line_no`, [o.id])).rows;
            const payments = (await c.query(
                'SELECT * FROM payment WHERE order_id = $1 ORDER BY created_at', [o.id])).rows;
            const audits = (await c.query(
                'SELECT * FROM audit_log WHERE order_id = $1 ORDER BY id', [o.id])).rows;

            return {
                orders: [S.toOrder(o)],
                orderItems: items.map(S.toOrderItem),
                payments: payments.map(S.toPayment),
                auditLogs: audits.map(S.toAudit),
            };
        } finally { c.release(); }
    }));

    /**
     * ค้นหาออเดอร์ย้อนหลัง — หน้าออเดอร์ใช้แทนการ scan cache
     * cache มีแค่ 24 ชั่วโมง ค้นของเมื่อวานจึงไม่เจอถ้าไม่ผ่านทางนี้
     */
    app.get('/api/orders/search', handle(async (req) => {
        const ctx = await context(req);
        if (!ctx.user) throw new ApiError(401, 'ต้องเข้าสู่ระบบก่อน');

        const where = ['o.branch_id = $1'];
        const args = [branchId()];
        const { from, to, status, q, day } = req.query;
        // ดูทั้งวันทำการ (หน้าจัดการออเดอร์ › เลือกวัน) — ตรงกับวันที่ออกเลขออเดอร์ ไม่ใช่วันปฏิทิน
        if (day) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day))) throw new ApiError(400, 'วันที่ไม่ถูกต้อง');
            args.push(String(day)); where.push(`o.business_date = $${args.length}`);
        }
        if (from) { args.push(from); where.push(`o.created_at >= $${args.length}`); }
        if (to) { args.push(to); where.push(`o.created_at < $${args.length}`); }
        if (status) {
            args.push(String(status).split(',').map((s) => s.trim()).filter(Boolean));
            where.push(`o.status = ANY($${args.length})`);
        }
        if (q) {
            // ค้นได้ทั้งเลขออเดอร์และชื่อสินค้าในบิล — พนักงานจำได้อย่างใดอย่างหนึ่ง
            args.push('%' + String(q).trim() + '%');
            where.push(`(o.order_no ILIKE $${args.length} OR EXISTS (
                SELECT 1 FROM order_item i WHERE i.order_id = o.id
                   AND i.name_snapshot ILIKE $${args.length}))`);
        }
        // ดูทั้งวันได้ถึง 1000 ใบ — ร้านขายดีวันหนึ่งเกิน 200 ได้
        const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, day ? 1000 : 200);
        const offset = Math.max(0, parseInt(req.query.offset || '0', 10) || 0);
        args.push(limit, offset);

        const rows = await query(
            `SELECT o.id, o.order_no, o.status, o.total, o.payment_method, o.dining_option,
                    o.created_at, o.paid_at, o.completed_at, o.kiosk_id, o.shift_id,
                    to_char(o.business_date, 'YYYY-MM-DD') AS bdate,
                    (SELECT count(*)::int FROM order_item i WHERE i.order_id = o.id) AS item_count
               FROM cf_order o WHERE ${where.join(' AND ')}
               ORDER BY o.created_at DESC
               LIMIT $${args.length - 1} OFFSET $${args.length}`, args);

        const total = await query(
            `SELECT count(*)::int AS n FROM cf_order o WHERE ${where.join(' AND ')}`,
            args.slice(0, -2));

        return {
            total: total.rows[0].n, limit, offset,
            orders: rows.rows.map((o) => ({
                id: o.id, orderNo: o.order_no, status: o.status, total: n(o.total),
                paymentMethod: o.payment_method, diningOption: o.dining_option,
                createdAt: o.created_at, paidAt: o.paid_at, completedAt: o.completed_at,
                kioskId: o.kiosk_id, shiftId: o.shift_id, itemCount: o.item_count, businessDate: o.bdate,
            })),
        };
    }));
}

module.exports = { registerReports, summarize, topProducts, stationLoad,
                   cashControl, snapshotReports, SOLD, IN_PROGRESS, WAITING_PAY };
