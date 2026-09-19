/**
 * CafeFlow — QR พร้อมเพย์ตามยอดชำระ (§14, §16)
 * ══════════════════════════════════════════════════════════════════
 * สร้าง QR ที่ "ผูกยอดไว้ในตัว" ทันทีที่ลูกค้าเลือกจ่ายด้วย QR
 * ลูกค้าสแกนแล้วแอปธนาคารขึ้นยอดมาให้เลย — พิมพ์ยอดผิดไม่ได้
 * ซึ่งเป็นสาเหตุอันดับหนึ่งของยอดไม่ตรงที่ทำให้แคชเชียร์ต้องมานั่งไล่ทีหลัง
 *
 * ★ ไม่ต้องต่อ payment gateway — พร้อมเพย์เป็นมาตรฐานเปิด ประกอบ payload
 *   ได้ในเครื่อง จึงออก QR ได้แม้เน็ตร้านหลุด (ข้อกำหนดหลักของระบบนี้)
 *
 * สิ่งที่ QR ทำไม่ได้: บอกว่าเงินเข้าแล้วหรือยัง — ต้องมีคนหรือ OCR ยืนยัน
 */
'use strict';
const path = require('path');
const generatePayload = require('promptpay-qr');
const QRCode = require('qrcode');

const SHARED = path.resolve(__dirname, '..', '..', '..', 'shared');
const { CFEmv } = require(path.join(SHARED, 'cf-emv.js'));

const { publish } = require('./stream');
const { audit, touch, ApiError, settingsOf } = require('./orders');

const DEFAULT_TIMEOUT_SEC = 60;

/**
 * ออก QR ใบใหม่ให้ออเดอร์
 *
 * ⚠️ ทุกครั้งที่ออกใบใหม่ต้องยกเลิกใบเก่าทั้งหมดก่อน
 *    ไม่งั้นลูกค้าอาจจ่ายตามยอดของใบเก่า (ตะกร้าเปลี่ยนไปแล้ว) แล้วระบบ
 *    บันทึกว่าจ่ายครบทั้งที่ขาด
 */
async function issueQr(c, branchId, orderId, ctx) {
    const o = (await c.query(
        'SELECT * FROM cf_order WHERE id = $1 AND branch_id = $2 FOR UPDATE',
        [orderId, branchId])).rows[0];
    if (!o) throw new ApiError(404, 'ไม่พบออเดอร์');

    const OK = ['ORDER_CONFIRMED', 'WAITING_PAYMENT', 'PAYMENT_TIMEOUT', 'PAYMENT_FAILED'];
    if (!OK.includes(o.status)) {
        throw new ApiError(409, 'ออเดอร์นี้ไม่อยู่ในขั้นตอนที่ออก QR ได้');
    }

    const br = (await c.query('SELECT promptpay_id, name_th FROM branch WHERE id = $1',
        [branchId])).rows[0];
    if (!br.promptpay_id) {
        // บอกให้ชัดว่าต้องไปตั้งที่ไหน — ไม่ใช่ error ลอย ๆ ที่หน้าร้านแก้เองไม่ได้
        throw new ApiError(409,
            'ยังไม่ได้ตั้งพร้อมเพย์ของร้าน — ตั้งได้ที่หน้าภาพรวม › ตั้งค่าคีออสก์');
    }

    const amount = Number(o.total);
    if (!(amount > 0)) throw new ApiError(409, 'ยอดออเดอร์ต้องมากกว่า 0');

    const payload = generatePayload(String(br.promptpay_id), { amount });

    // ตรวจก่อนส่งออกไป — QR ที่ CRC ผิดจะสแกนติดแต่ธนาคารปฏิเสธ
    // ปล่อยให้ลูกค้าเจอหน้าร้านแล้วหาสาเหตุยากกว่านี้มาก
    const check = CFEmv.verify(payload, { amount });
    if (!check.ok) {
        throw new ApiError(500, 'สร้าง QR ไม่ถูกต้อง: ' + check.problems.join(' · '));
    }

    const settings = await settingsOf(c, branchId);
    const sec = parseInt(settings.qrTimeoutSec, 10) || DEFAULT_TIMEOUT_SEC;

    await c.query(
        `UPDATE payment_qr SET cancelled_at = now()
          WHERE order_id = $1 AND cancelled_at IS NULL`, [orderId]);

    const q = (await c.query(
        `INSERT INTO payment_qr (order_id, target, amount, payload, expires_at)
         VALUES ($1,$2,$3,$4, now() + ($5 || ' seconds')::interval)
         RETURNING id, created_at, expires_at`,
        [orderId, String(br.promptpay_id), amount, payload, String(sec)])).rows[0];

    await c.query(
        `UPDATE cf_order SET payment_method = 'QR', rev = nextval('global_rev'),
                updated_at = now() WHERE id = $1`, [orderId]);

    await audit(c, branchId, {
        eventType: 'QR_ISSUED', orderId,
        actorKind: ctx.actorKind, actorUserId: ctx.actorUserId,
        deviceId: ctx.deviceId, ip: ctx.ip,
        payload: { amount, expiresAt: q.expires_at, qrId: q.id },
    });
    await touch(c, branchId, 'orders', orderId, 'update');

    return { qrId: q.id, payload, amount, orderNo: o.orderNo,
             createdAt: q.created_at, expiresAt: q.expires_at, timeoutSec: sec };
}

/**
 * ตัวนับเวลาอยู่ฝั่งเซิร์ฟเวอร์ ไม่ใช่ setInterval ในเบราว์เซอร์
 * เพราะถ้าคีออสก์ปิดจอหรือรีเฟรช ออเดอร์จะค้างรอชำระตลอดกาล
 * และไม่มีใครรู้ว่าต้องไปเคลียร์
 */
async function expireDueQr(pool, branchId, publishFn) {
    const due = await pool.query(
        `SELECT DISTINCT q.order_id, o.status
           FROM payment_qr q JOIN cf_order o ON o.id = q.order_id
          WHERE q.cancelled_at IS NULL AND q.expires_at < now()
            AND o.branch_id = $1 AND o.status = 'WAITING_PAYMENT'`, [branchId]);

    for (const row of due.rows) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const o = (await client.query(
                "SELECT * FROM cf_order WHERE id = $1 AND status = 'WAITING_PAYMENT' FOR UPDATE",
                [row.order_id])).rows[0];
            if (!o) { await client.query('ROLLBACK'); continue; }   // มีคนจ่ายไปพอดี

            await client.query(
                `UPDATE cf_order SET prev_status = status, status = 'PAYMENT_TIMEOUT',
                        rev = nextval('global_rev'), updated_at = now() WHERE id = $1`,
                [row.order_id]);
            await client.query(
                'UPDATE payment_qr SET cancelled_at = now() WHERE order_id = $1 AND cancelled_at IS NULL',
                [row.order_id]);
            await audit(client, branchId, {
                eventType: 'PAYMENT_TIMEOUT', orderId: row.order_id,
                oldStatus: 'WAITING_PAYMENT', newStatus: 'PAYMENT_TIMEOUT',
                actorKind: 'SYSTEM', reason: 'หมดเวลาสแกน QR',
            });
            await touch(client, branchId, 'orders', row.order_id, 'update');
            await client.query('COMMIT');
            publishFn(branchId, { entity: 'orders', op: 'update', id: row.order_id });
        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            console.error('[qr-expire]', err.message);
        } finally {
            client.release();
        }
    }
    return due.rows.length;
}

function registerPayments(app, deps) {
    const { pool, tx, branchId } = deps;
    const { context, handle } = deps.helpers;

    /** ออก QR — คีออสก์เรียกได้โดยไม่ต้องล็อกอิน (ลูกค้าเป็นคนกด) */
    app.post('/api/orders/:id/qr', handle(async (req) => {
        const ctx = await context(req);
        const out = await tx((c) => issueQr(c, branchId(), req.params.id, ctx));

        // ส่ง SVG ไปเลย เบราว์เซอร์จึงไม่ต้องมีไลบรารี QR
        // (และอาร์ติแฟกต์คีออสก์ก็ไม่ต้องแบกมันไปด้วย)
        out.svg = await QRCode.toString(out.payload, {
            type: 'svg', errorCorrectionLevel: 'M', margin: 1,
        });
        publish(branchId(), { entity: 'orders', op: 'update', id: req.params.id });
        return out;
    }));

    /** ดูใบที่ยังใช้ได้ — คีออสก์รีเฟรชแล้วต้องได้ใบเดิม ไม่ใช่ออกใบใหม่ */
    app.get('/api/orders/:id/qr', handle(async (req) => {
        const r = await deps.query(
            `SELECT q.* FROM payment_qr q JOIN cf_order o ON o.id = q.order_id
              WHERE q.order_id = $1 AND o.branch_id = $2
                AND q.cancelled_at IS NULL AND q.expires_at > now()
              ORDER BY q.id DESC LIMIT 1`, [req.params.id, branchId()]);
        if (!r.rows.length) throw new ApiError(404, 'ไม่มี QR ที่ยังใช้ได้');
        const q = r.rows[0];
        return {
            qrId: q.id, payload: q.payload, amount: Number(q.amount),
            createdAt: q.created_at, expiresAt: q.expires_at,
            svg: await QRCode.toString(q.payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 }),
        };
    }));

    /**
     * ตัวเก็บกวาด QR หมดอายุ — เดินทุก 5 วินาที
     * ความคลาดเคลื่อนไม่เกิน 5 วินาทีถือว่ายอมรับได้สำหรับ timeout 60 วินาที
     * และถูกกว่าการตั้ง timer ต่อออเดอร์มาก
     */
    let timer = null;
    app.addHook('onReady', async () => {
        timer = setInterval(() => {
            expireDueQr(pool, branchId(), publish).catch((e) =>
                console.error('[qr-expire]', e.message));
        }, 5000);
        timer.unref();
    });
    app.addHook('onClose', async () => { if (timer) clearInterval(timer); });
}

module.exports = { registerPayments, issueQr, expireDueQr };
