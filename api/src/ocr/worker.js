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

async function callOcr(url, file, flip) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), OCR_TIMEOUT_MS);
    try {
        const r = await fetch(url.replace(/\/$/, '') + '/ocr', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: file, flip: !!flip }), signal: ctl.signal,
        });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) { const e = new Error(body.error || 'OCR ' + r.status); e.bad = true; throw e; }
        return body;
    } finally {
        clearTimeout(t);
    }
}

/**
 * บัญชีของร้านที่ใช้เทียบผู้รับเงินบนสลิป — ตั้งที่ หน้าภาพรวม › ข้อมูลร้าน
 * พร้อมเพย์ของร้านนับเป็นบัญชีร้านเสมอ (คือเลขที่ QR ของคีออสก์ส่งเงินเข้า)
 */
async function shopAccount(pool, branchId) {
    const kv = {};
    for (const r of (await pool.query(
        "SELECT key, value FROM app_setting WHERE branch_id = $1 AND key IN ('shopAccountName','shopAccountNos')",
        [branchId])).rows) kv[r.key] = r.value;
    const br = (await pool.query('SELECT promptpay_id FROM branch WHERE id = $1', [branchId])).rows[0] || {};
    const accounts = String(kv.shopAccountNos || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (br.promptpay_id) accounts.push(br.promptpay_id);
    return { name: kv.shopAccountName || '', accounts };
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
        // QR ที่ร้านออกให้ออเดอร์นี้ — เวลาออกใบแรก (สลิปก่อนหน้านั้นคือสลิปเก่า)
        // และเลขพร้อมเพย์ที่ใช้ตอนนั้น (ร้านเปลี่ยนเลขทีหลังก็ยังเทียบถูก)
        const qr = (await pool.query(
            'SELECT min(created_at) AS first_at, array_agg(DISTINCT target) AS targets FROM payment_qr WHERE order_id = $1',
            [o.id])).rows[0] || {};
        const shop = await shopAccount(pool, o.branch_id);
        for (const t of qr.targets || []) if (t) shop.accounts.push(t);
        const expect = {
            total: Number(o.total), orderAt: o.created_at, scannedAt: slip.created_at,
            qrAt: qr.first_at || null, shop, ref: slip.parsed_ref, bankCode: slip.parsed_bank,
        };
        let res = CFSlipRules.evaluate(out.lines || [], expect);
        // ภาพกลับด้านแบบกระจก (กล้องกลับภาพมาเอง / ตั้งสวิตช์ "พลิกภาพคืน" ผิด) อ่านไม่ออกทั้งใบ
        // ขาดยอดหรือวันที่ → ลองพลิกซ้ายขวาแล้วอ่านใหม่ เลือกผลที่อ่านได้มากกว่า
        // (เจอจริง 09/10/2569: ภาพจากคีออสก์ 2 ใบกลับด้าน · ใบหนึ่ง OCR มั่วได้ "0.27" จึงต้องดูวันที่ด้วย
        //  ไม่ใช่รอเฉพาะตอนไม่เจออะไรเลย · ภาพปกติที่พลิกแล้วอ่านไม่ได้อะไร ผลเดิมชนะเสมอ)
        let flipped = false;
        const score = (r) => (r.amount != null ? 1 : 0) + (r.txAt != null ? 1 : 0);
        if (score(res) < 2) {
            const out2 = await callOcr(url, path.join(SLIP_DIR, slip.image_path), true).catch(() => null);
            const res2 = out2 && CFSlipRules.evaluate(out2.lines || [], expect);
            if (res2 && score(res2) > score(res)) {
                out.lines = out2.lines; out.ms = (out.ms || 0) + (out2.ms || 0); res = res2; flipped = true;
            }
        }
        await pool.query(
            `UPDATE payment_slip SET ocr_status = 'DONE', ocr_engine = 'paddleocr', ocr_ms = $2,
                    ocr_raw = $3, parsed_amount = $4, parsed_tx_at = $5, verdict = $6,
                    checks = COALESCE(checks, '{}'::jsonb) || jsonb_build_object('ocr', $7::jsonb)
              WHERE id = $1`,
            [slip.id, out.ms || null, JSON.stringify(out.lines || []), res.amount, res.txAt,
             res.verdict, JSON.stringify({ checks: res.checks, notes: res.notes, dateText: res.dateText,
                                           sender: res.sender, receiver: res.receiver, flipped })]);
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
