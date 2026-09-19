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
const { ApiError } = require('./orders');

/** สถานะที่ถือว่าขายแล้ว — จ่ายเงินเรียบร้อยและยังไม่ถูกคืน */
const SOLD = ['PAID', 'SENT_TO_KITCHEN', 'PREPARING', 'READY', 'SERVED', 'COMPLETED'];
const IN_PROGRESS = ['SENT_TO_KITCHEN', 'PREPARING'];
const WAITING_PAY = ['WAITING_CASH', 'WAITING_PAYMENT', 'PAYMENT_TIMEOUT', 'PAYMENT_REVIEW'];

const n = (v) => (v == null ? 0 : Number(v));

/**
 * สรุปตัวเลขของขอบเขตหนึ่ง (รอบขาย หรือช่วงเวลา)
 * รูปทรงต้องตรงกับ CFKpi.summary() ฝั่งเบราว์เซอร์เป๊ะ — หน้าเว็บอ่านคีย์เดิม
 */
async function summarize(c, branchId, { shiftId, from, to }) {
    const where = [];
    const args = [branchId];
    if (shiftId) { args.push(shiftId); where.push(`o.shift_id = $${args.length}`); }
    if (from) { args.push(from); where.push(`o.created_at >= $${args.length}`); }
    if (to) { args.push(to); where.push(`o.created_at < $${args.length}`); }
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
async function topProducts(c, branchId, { shiftId, from, to }, limit = 8) {
    const where = ['o.branch_id = $1', 'o.status = ANY($2)'];
    const args = [branchId, SOLD];
    if (shiftId) { args.push(shiftId); where.push(`o.shift_id = $${args.length}`); }
    if (from) { args.push(from); where.push(`o.created_at >= $${args.length}`); }
    if (to) { args.push(to); where.push(`o.created_at < $${args.length}`); }
    args.push(limit);

    const r = await c.query(
        `SELECT i.product_id, i.name_snapshot AS name,
                SUM(i.qty)::int AS qty,
                SUM(i.qty * i.unit_price) AS amount
           FROM order_item i JOIN cf_order o ON o.id = i.order_id
          WHERE ${where.join(' AND ')} AND i.item_status <> 'VOID'
          GROUP BY i.product_id, i.name_snapshot
          ORDER BY qty DESC LIMIT $${args.length}`, args);

    return r.rows.map((x) => ({ productId: x.product_id, name: x.name,
                                qty: x.qty, amount: n(x.amount) }));
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
    const expected = sh.status === 'CLOSED' && sh.expected_cash != null
        ? n(sh.expected_cash) : opening + s.cash;
    const actual = sh.actual_cash == null ? null : n(sh.actual_cash);
    return { shiftId, opening, cashSales: s.cash, expected, actual,
             difference: actual == null ? null : actual - expected };
}

/** ก้อนรายงานที่แนบไปกับ snapshot — หน้าเว็บจึงอ่านได้แบบ synchronous */
async function snapshotReports(c, branchId) {
    const open = (await c.query(
        "SELECT id FROM shift WHERE branch_id = $1 AND status = 'OPEN' LIMIT 1",
        [branchId])).rows[0];
    const shiftId = open ? open.id : null;
    return {
        shiftId,
        summary: await summarize(c, branchId, shiftId ? { shiftId } : {}),
        stationLoad: await stationLoad(c, branchId),
        topProducts: await topProducts(c, branchId, shiftId ? { shiftId } : {}),
        cashControl: shiftId ? await cashControl(c, branchId, shiftId) : null,
    };
}

/* ══════════════════════════════════════════════════════════════════ */
function registerReports(app, deps) {
    const { pool, query, branchId } = deps;
    const { context, requirePerm, handle } = deps.helpers;

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
                topProducts: await topProducts(c, branchId(), { shiftId: id }, 20),
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
                topProducts: await topProducts(c, branchId(), { from, to }, 20),
            };
        } finally { c.release(); }
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
        const { from, to, status, q } = req.query;
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
        const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 200);
        const offset = Math.max(0, parseInt(req.query.offset || '0', 10) || 0);
        args.push(limit, offset);

        const rows = await query(
            `SELECT o.id, o.order_no, o.status, o.total, o.payment_method, o.dining_option,
                    o.created_at, o.paid_at, o.completed_at, o.kiosk_id, o.shift_id,
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
                kioskId: o.kiosk_id, shiftId: o.shift_id, itemCount: o.item_count,
            })),
        };
    }));
}

module.exports = { registerReports, summarize, topProducts, stationLoad,
                   cashControl, snapshotReports, SOLD, IN_PROGRESS, WAITING_PAY };
