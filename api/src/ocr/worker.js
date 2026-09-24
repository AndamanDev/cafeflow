/**
 * CafeFlow — คิวอ่านสลิปด้วย OCR (§14 §17)
 * ══════════════════════════════════════════════════════════════════
 * ลูกค้าสแกนสลิปแล้ว ออเดอร์ไปรอแคชเชียร์ทันที — ไม่รอ OCR
 * ตัวนี้หยิบภาพที่ยังไม่ได้อ่านทีละใบ ส่งให้ ocr-svc (PaddleOCR, ~6 วิ/ใบ)
 * แล้วเทียบยอด/วันที่กับออเดอร์ด้วย shared/cf-slip-rules.js ผลขึ้นการ์ดแคชเชียร์เอง
 *
 * ocr-svc ล่มหรือไม่ได้เปิด → ใบที่ค้างรอไว้ในคิว (QUEUED) แล้วอ่านต่อเมื่อกลับมา
 * ร้านขายได้ตามปกติ แคชเชียร์แค่ไม่มีผลตรวจจากภาพ
 */
'use strict';
const path = require('path');
const { CFSlipRules } = require('../../../shared/cf-slip-rules.js');

const SLIP_DIR = path.resolve(__dirname, '..', '..', '..', 'data', 'slips');
const OCR_TIMEOUT_MS = 60000;          // ใบแรกหลังเปิดเครื่องช้ากว่าปกติ (โหลดโมเดล)
const IDLE_MS = 2000;
const DOWN_BACKOFF_MS = 30000;         // ocr-svc ไม่ตอบ — ไม่ต้องยิงถี่

async function callOcr(url, file) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), OCR_TIMEOUT_MS);
    try {
        const r = await fetch(url.replace(/\/$/, '') + '/ocr', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: file }), signal: ctl.signal,
        });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) { const e = new Error(body.error || 'OCR ' + r.status); e.bad = true; throw e; }
        return body;
    } finally {
        clearTimeout(t);
    }
}

/** อ่านหนึ่งใบ — คืน true ถ้ามีงานทำ */
async function processOne(pool, url, onDone) {
    // จองงานแบบกันสองตัวหยิบใบเดียวกัน (เผื่อวันหน้ารันหลาย process)
    const r = await pool.query(
        `UPDATE payment_slip SET ocr_status = 'RUNNING'
          WHERE id = (SELECT id FROM payment_slip
                       WHERE ocr_status = 'QUEUED' AND image_path IS NOT NULL
                       ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
          RETURNING *`);
    const slip = r.rows[0];
    if (!slip) return false;

    const o = (await pool.query('SELECT id, branch_id, total, created_at FROM cf_order WHERE id = $1',
        [slip.order_id])).rows[0];
    try {
        const out = await callOcr(url, path.join(SLIP_DIR, slip.image_path));
        const res = CFSlipRules.evaluate(out.lines || [], {
            total: Number(o.total), orderAt: o.created_at, scannedAt: slip.created_at,
        });
        await pool.query(
            `UPDATE payment_slip SET ocr_status = 'DONE', ocr_engine = 'paddleocr', ocr_ms = $2,
                    ocr_raw = $3, parsed_amount = $4, parsed_tx_at = $5, verdict = $6,
                    checks = COALESCE(checks, '{}'::jsonb) || jsonb_build_object('ocr', $7::jsonb)
              WHERE id = $1`,
            [slip.id, out.ms || null, JSON.stringify(out.lines || []), res.amount, res.txAt,
             res.verdict, JSON.stringify({ checks: res.checks, notes: res.notes, dateText: res.dateText })]);
    } catch (err) {
        if (!err.bad) {
            // ต่อ ocr-svc ไม่ได้ — คืนเข้าคิว รอมันกลับมา
            await pool.query("UPDATE payment_slip SET ocr_status = 'QUEUED' WHERE id = $1", [slip.id]);
            throw err;
        }
        await pool.query(
            "UPDATE payment_slip SET ocr_status = 'ERROR', ocr_raw = $2 WHERE id = $1",
            [slip.id, JSON.stringify({ error: err.message })]);
    }
    if (onDone && o) await onDone(o);
    return true;
}

let wakeFn = () => {};
/** มีสลิปใหม่เข้าคิว — เริ่มอ่านทันที ไม่ต้องรอรอบ 2 วินาที (ลูกค้ายืนรอผลที่คีออสก์) */
function wake() { wakeFn(); }

function startOcrWorker(pool, { url, onDone } = {}) {
    if (!url) {
        console.warn('[ocr] ไม่ได้ตั้ง CF_OCR_URL — ไม่อ่านสลิปด้วย OCR');
        return () => {};
    }
    let stopped = false;
    let timer = null;
    let warned = false;

    let running = false;
    const tick = async () => {
        if (stopped || running) return;
        running = true;
        let delay = IDLE_MS;
        try {
            // มีงานก็ทำต่อทันที ไม่ต้องรอรอบถัดไป
            if (await processOne(pool, url, onDone)) delay = 0;
            warned = false;
        } catch (err) {
            if (!warned) console.warn('[ocr] ต่อ ocr-svc ไม่ได้ (' + err.message + ') — สลิปรออยู่ในคิว');
            warned = true;
            delay = DOWN_BACKOFF_MS;
        }
        running = false;
        if (!stopped) timer = setTimeout(tick, delay);
    };
    wakeFn = () => {
        if (running || stopped) return;          // กำลังอ่านอยู่ — จบแล้วจะหยิบใบถัดไปเองทันที
        clearTimeout(timer);
        timer = setTimeout(tick, 0);
    };

    // process ก่อนหน้าตายกลางงาน → ใบที่ค้าง RUNNING ต้องกลับเข้าคิว ไม่งั้นไม่มีใครอ่านอีกเลย
    pool.query("UPDATE payment_slip SET ocr_status = 'QUEUED' WHERE ocr_status = 'RUNNING'")
        .catch(() => {})
        .finally(() => { timer = setTimeout(tick, IDLE_MS); if (timer.unref) timer.unref(); });

    return () => { stopped = true; if (timer) clearTimeout(timer); };
}

module.exports = { startOcrWorker, processOne, wake };
