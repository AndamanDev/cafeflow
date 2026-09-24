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
const fs = require('fs');
const crypto = require('crypto');
const generatePayload = require('promptpay-qr');
const QRCode = require('qrcode');

const SHARED = path.resolve(__dirname, '..', '..', '..', 'shared');
const { CFEmv } = require(path.join(SHARED, 'cf-emv.js'));
const { CFSlip } = require(path.join(SHARED, 'cf-slip.js'));

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

/**
 * รับสลิปที่ลูกค้าสแกนจากจอมือถือที่คีออสก์
 *
 * ทำได้แค่ในร้าน (ไม่ใช้เน็ต): ตรวจว่าเป็น QR สลิปจริงในเชิงรูปแบบ และสลิปใบนี้
 * ไม่เคยถูกใช้กับออเดอร์อื่น — แล้วส่งออเดอร์ไปรอแคชเชียร์ยืนยัน (PAYMENT_REVIEW)
 * ไม่ตั้งเป็น PAID เอง เพราะ QR บนสลิปไม่มียอดเงินและบัญชีปลายทาง
 * (ถ้าวันหน้าต่อบริการตรวจสลิปกับธนาคาร จุดนี้คือที่ที่จะตัดสินใจส่งเข้าครัวได้เลย)
 */
/**
 * ภาพสลิปที่กล้องคีออสก์ถ่ายไว้ตอนอ่าน QR ได้ — เก็บเป็นหลักฐานให้แคชเชียร์/เจ้าของร้านดูย้อนหลัง
 * อยู่ใน data/slips/ (ไม่ใช่ /media/ ที่เปิดให้ทุกคน) เพราะสลิปมีชื่อและเลขบัญชีบางส่วนของลูกค้า
 * เปิดดูได้ผ่าน GET /api/slips/:id/image ที่ต้องเป็นพนักงานรับเงินเท่านั้น
 */
const SLIP_DIR = path.resolve(__dirname, '..', '..', '..', 'data', 'slips');
const SLIP_MAX_BYTES = 1.5 * 1024 * 1024;

/** รับ data URL ของ JPEG → { rel, sha } · รูปเสีย/ใหญ่เกินคืน null (ไม่ทำให้รับสลิปล้ม) */
function saveSlipImage(dataUrl) {
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!m) return null;
    const buf = Buffer.from(m[1], 'base64');
    // ตรวจหัวไฟล์ JPEG จริง ไม่เชื่อแค่ข้อความ data:image/jpeg ที่ client ส่งมา
    if (buf.length < 1000 || buf.length > SLIP_MAX_BYTES || buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    const month = new Date().toISOString().slice(0, 7);
    const rel = month + '/' + sha + '.jpg';
    fs.mkdirSync(path.join(SLIP_DIR, month), { recursive: true });
    const dest = path.join(SLIP_DIR, rel);
    if (!fs.existsSync(dest)) fs.writeFileSync(dest, buf);
    return { rel, sha };
}

async function submitSlip(c, branchId, orderId, payload, ctx, image) {
    const { transition } = require('./orders');
    const slip = CFSlip.parse(payload);
    if (!slip.ok) throw new ApiError(400, slip.reason);

    const o = (await c.query('SELECT * FROM cf_order WHERE id = $1 AND branch_id = $2 FOR UPDATE',
        [orderId, branchId])).rows[0];
    if (!o) throw new ApiError(404, 'ไม่พบออเดอร์');

    // สลิปใบนี้เคยใช้แล้ว — ของออเดอร์เดียวกัน (ลูกค้าสแกนซ้ำ) ถือว่าผ่าน ของออเดอร์อื่นปฏิเสธ
    const dup = (await c.query('SELECT id, order_id FROM payment_slip WHERE parsed_ref = $1',
        [slip.ref])).rows[0];
    let slipId = dup ? dup.id : null;
    if (dup && dup.order_id !== o.id) {
        // คืนผลแทนการ throw — ถ้า throw ทรานแซกชันจะ rollback และ audit ของความพยายามนี้หายไปด้วย
        // (ร่องรอยการเอาสลิปมาใช้ซ้ำคือสิ่งที่เจ้าของร้านต้องเห็นย้อนหลังได้)
        await audit(c, branchId, {
            eventType: 'SLIP_REJECTED', orderId: o.id, actorKind: ctx.actorKind,
            actorUserId: ctx.actorUserId, deviceId: ctx.deviceId, ip: ctx.ip,
            reason: 'สลิปซ้ำกับออเดอร์อื่น', payload: { ref: slip.ref, usedBy: dup.order_id },
        });
        return { ok: false, status: 409, error: 'สลิปนี้ถูกใช้ชำระออเดอร์อื่นไปแล้ว กรุณาติดต่อพนักงาน' };
    }

    if (!dup) {
        let img = null;
        try { img = image ? saveSlipImage(image) : null; }
        catch (err) { console.error('[slip] เก็บภาพสลิปไม่สำเร็จ:', err.message); }   // ไม่มีภาพก็ยังรับสลิปได้
        await c.query(
            `INSERT INTO payment_slip (order_id, uploaded_by, ocr_status, ocr_engine, parsed_ref,
                                       parsed_bank, parsed_source, qr_payload, checks, verdict,
                                       image_path, sha256)
             VALUES ($1,$2,$9,'QR',$3,$4,'BARCODE',$5,$6,'WARN',$7,$8)
             ON CONFLICT (sha256) DO NOTHING
             RETURNING id`,
            [o.id, ctx.deviceId || ctx.actorUserId || null, slip.ref, slip.bankCode,
             String(payload).trim(),
             JSON.stringify({ format: true, duplicate: false, crc: slip.crcOk,
                              bankVerified: false }),
             img ? img.rel : null, img ? img.sha : null,
             img ? 'QUEUED' : 'DONE']).then((r) => { if (r.rows[0]) slipId = r.rows[0].id; });  // มีภาพ → รอ OCR (api/src/ocr/worker.js)
    }

    // ยังอยู่ระหว่างรอจ่าย → ส่งไปรอแคชเชียร์ตรวจ · อยู่ในขั้นตรวจแล้ว (สแกนซ้ำ) → ไม่ต้องทำอะไร
    if (['WAITING_PAYMENT', 'PAYMENT_TIMEOUT'].includes(o.status)) {
        await transition(c, branchId, o.id, 'PAYMENT_REVIEW', {
            reason: `ลูกค้าสแกนสลิป ${slip.bankName || slip.bankCode || ''} เลขอ้างอิง ${slip.ref}`.replace(/\s+/g, ' '),
        }, ctx);
    } else if (o.status !== 'PAYMENT_REVIEW') {
        throw new ApiError(409, 'ออเดอร์นี้ไม่ได้รอการชำระแล้ว');
    }
    await touch(c, branchId, 'orders', o.id, 'update');
    return { ok: true, slipId: slipId ? String(slipId) : null, ref: slip.ref, bank: slip.bankName,
             duplicateScan: !!dup };
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

    /** คีออสก์ส่ง payload ของ QR บนสลิป — ต้องเป็นคีออสก์ที่จับคู่แล้ว หรือพนักงาน */
    // ภาพสลิปทำให้ body ใหญ่กว่าค่าตั้งทั้งระบบ (512 KB) — เปิดเพิ่มเฉพาะ route นี้
    app.post('/api/orders/:id/slip', { bodyLimit: 3 * 1024 * 1024 }, handle(async (req) => {
        const ctx = await context(req);
        if (!ctx.user && !(ctx.device && ctx.device.kind === 'KIOSK')) {
            throw new ApiError(401, 'เครื่องนี้ยังไม่ได้จับคู่กับร้าน');
        }
        const body = req.body || {};
        const out = await tx((c) => submitSlip(c, branchId(), req.params.id,
            body.payload, ctx, body.image));
        if (!out.ok) throw new ApiError(out.status, out.error);      // หลัง commit แล้ว audit ยังอยู่
        // ลูกค้ายืนรอผลอยู่หน้าเครื่อง — ปลุกคิว OCR ทันที ไม่ต้องรอรอบถัดไป
        require('../ocr/worker').wake();
        publish(branchId(), { entity: 'orders', op: 'update', id: req.params.id });
        return out;
    }));

    /**
     * ผลตรวจสลิปใบหนึ่ง — คีออสก์ถามซ้ำระหว่างลูกค้ารอ (~5 วิ) เพื่อบอกได้ทันทีว่ายอด/วันที่ไม่ตรง
     * ส่งเฉพาะผลตรวจกับข้อความ ไม่ส่งภาพหรือข้อมูลบัญชี (หน้าจอคีออสก์ใครเดินผ่านก็เห็น)
     */
    app.get('/api/slips/:id/check', handle(async (req) => {
        const ctx = await context(req);
        if (!ctx.user && !(ctx.device && ctx.device.kind === 'KIOSK')) {
            throw new ApiError(401, 'เครื่องนี้ยังไม่ได้จับคู่กับร้าน');
        }
        const r = await deps.query(
            `SELECT s.ocr_status, s.image_path, s.verdict, s.checks FROM payment_slip s
               JOIN cf_order o ON o.id = s.order_id
              WHERE s.id = $1 AND o.branch_id = $2`, [req.params.id, branchId()]);
        const s = r.rows[0];
        if (!s) throw new ApiError(404, 'ไม่พบสลิป');
        const ocr = (s.checks && s.checks.ocr) || null;
        return {
            // ไม่มีภาพ = ไม่มีอะไรให้ OCR อ่าน ถือว่าเสร็จแล้ว (แคชเชียร์ตรวจเอง)
            status: s.image_path ? s.ocr_status : 'DONE',
            verdict: ocr ? s.verdict : null,
            checks: ocr ? ocr.checks : null,
            notes: ocr ? ocr.notes : [],
        };
    }));

    /** ภาพสลิป — ข้อมูลส่วนตัวของลูกค้า ให้ดูได้เฉพาะพนักงานที่รับเงินได้ */
    app.get('/api/slips/:id/image', handle(async (req, reply) => {
        const ctx = await context(req);
        if (!ctx.user) throw new ApiError(401, 'ต้องเข้าสู่ระบบก่อน');
        const { CFPerms } = require(path.join(SHARED, 'cf-perms.js'));
        if (!CFPerms.can(ctx.user.role, 'PAY_RECEIVE')) throw new ApiError(403, 'บัญชีนี้ไม่มีสิทธิ์ดูสลิป');
        const r = await deps.query(
            `SELECT s.image_path FROM payment_slip s JOIN cf_order o ON o.id = s.order_id
              WHERE s.id = $1 AND o.branch_id = $2`, [req.params.id, branchId()]);
        const rel = r.rows[0] && r.rows[0].image_path;
        if (!rel) throw new ApiError(404, 'ไม่มีภาพของสลิปนี้');
        const file = path.join(SLIP_DIR, rel);
        if (!file.startsWith(SLIP_DIR + path.sep) || !fs.existsSync(file)) {
            throw new ApiError(404, 'ไม่พบไฟล์ภาพสลิป');
        }
        reply.header('Cache-Control', 'private, max-age=86400');
        return reply.type('image/jpeg').send(fs.createReadStream(file));
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

module.exports = { registerPayments, issueQr, expireDueQr, submitSlip };
