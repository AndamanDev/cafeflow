/**
 * กฎการรับเงิน (→ PAID) ที่เซิร์ฟเวอร์บังคับ — CFFlow.checkSettle
 *
 * เดิมเพดานยืนยันแทน/เหตุผล และยอดเงินสดที่รับมา ตรวจแค่ในหน้าจอ
 * ยิง API ตรงจึงตั้ง QR เป็นจ่ายแล้วโดยไม่มีหลักฐาน หรือรับเงินสดไม่ครบได้
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { CFFlow } = require(path.resolve(__dirname, '..', '..', 'shared', 'cf-flow.js'));

const base = { amount: 120, received: null, override: false, reason: '', limit: 500 };

/* ── เงินสดที่เคาน์เตอร์ ─────────────────────────────────────── */
test('เงินสดรับพอดี / เกิน ผ่าน ไม่นับเป็นการยืนยันแทน', () => {
    for (const received of [120, 120.0, 500]) {
        const r = CFFlow.checkSettle({ ...base, from: 'WAITING_CASH', received });
        assert.deepStrictEqual(r, { ok: true, override: false });
    }
});

test('เงินสดรับไม่พอ → 400', () => {
    const r = CFFlow.checkSettle({ ...base, from: 'WAITING_CASH', received: 100 });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.status, 400);
    assert.match(r.message, /ไม่พอ/);
});

test('ขาดแค่สตางค์เดียวก็ไม่ผ่าน · ทศนิยม float ไม่ทำให้ยอดเท่ากันตกไป', () => {
    assert.strictEqual(CFFlow.checkSettle({ ...base, from: 'WAITING_CASH', amount: 45.5, received: 45.49 }).ok, false);
    // 0.1 + 0.2 = 0.30000000000000004 — ต้องนับว่าเท่ากับ 0.3
    assert.strictEqual(CFFlow.checkSettle({ ...base, from: 'WAITING_CASH', amount: 0.3, received: 0.1 + 0.2 }).ok, true);
});

test('ยอดที่รับมาเป็นค่าเสีย (ติดลบ / ไม่ใช่ตัวเลข) → 400', () => {
    for (const received of [-1, 'abc', NaN, Infinity]) {
        const r = CFFlow.checkSettle({ ...base, from: 'WAITING_CASH', received });
        assert.strictEqual(r.ok, false, String(received));
        assert.strictEqual(r.status, 400);
    }
});

/* ── ยืนยันแทนระบบ ──────────────────────────────────────────── */
test('คนตั้ง PAID จากขั้นรอโอน/รอตรวจ = ยืนยันแทนเสมอ แม้หน้าจอไม่ส่ง override มา', () => {
    for (const from of ['WAITING_PAYMENT', 'PAYMENT_TIMEOUT', 'PAYMENT_REVIEW']) {
        const noReason = CFFlow.checkSettle({ ...base, from });
        assert.strictEqual(noReason.ok, false, from);
        assert.strictEqual(noReason.status, 400);

        const withReason = CFFlow.checkSettle({ ...base, from, reason: 'ลูกค้าโชว์หน้าจอโอนแล้ว' });
        assert.deepStrictEqual(withReason, { ok: true, override: true }, from);
    }
});

test('ยืนยันแทนเกินเพดาน → 403 · ไม่จำกัด (null) ผ่าน', () => {
    const over = CFFlow.checkSettle({ ...base, from: 'PAYMENT_REVIEW', amount: 600, reason: 'x' });
    assert.strictEqual(over.ok, false);
    assert.strictEqual(over.status, 403);

    const unlimited = CFFlow.checkSettle({ ...base, from: 'PAYMENT_REVIEW', amount: 600, reason: 'x', limit: null });
    assert.strictEqual(unlimited.ok, true);
});

test('เพดาน 0 (แคชเชียร์ที่ไม่มีสิทธิ์ยืนยันแทน) ยืนยันแทนไม่ได้เลย', () => {
    const r = CFFlow.checkSettle({ ...base, from: 'PAYMENT_TIMEOUT', reason: 'x', limit: 0 });
    assert.strictEqual(r.status, 403);
});

test('เหตุผลที่มีแต่ช่องว่างไม่นับ', () => {
    const r = CFFlow.checkSettle({ ...base, from: 'PAYMENT_REVIEW', reason: '   ' });
    assert.strictEqual(r.status, 400);
});

test('หน้าจอส่ง override มาเองจาก WAITING_CASH ก็ยังติดกฎยืนยันแทน', () => {
    const r = CFFlow.checkSettle({ ...base, from: 'WAITING_CASH', override: true });
    assert.strictEqual(r.status, 400);
});

/* ── ระบบปิดบิลเองจากสลิปที่ตรวจผ่าน ───────────────────────── */
test('SYSTEM (สลิปผ่าน OCR ครบ) ไม่ต้องมีเหตุผล ไม่ติดเพดาน', () => {
    const r = CFFlow.checkSettle({ ...base, from: 'PAYMENT_REVIEW', bySystem: true, amount: 9999, limit: 0 });
    assert.deepStrictEqual(r, { ok: true, override: false });
});
