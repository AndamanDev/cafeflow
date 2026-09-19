/**
 * ตรวจว่า QR ที่เราออกให้ลูกค้าเป็น payload ที่ธนาคารรับจริง
 *
 * ทดสอบตัวตรวจของเราเองกับสตริงที่รู้ผลแน่นอนก่อน แล้วค่อยเอาไปตรวจ
 * ผลจากไลบรารี — ถ้าวันหนึ่งไลบรารีเปลี่ยนพฤติกรรม เทสต์นี้จะจับได้
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { CFEmv } = require(path.resolve(__dirname, '..', '..', 'shared', 'cf-emv.js'));
const generatePayload = require('promptpay-qr');

/* ── ค่าอ้างอิงจากมาตรฐาน EMVCo ─────────────────────────────── */
test('CRC-16/CCITT-FALSE ตรงกับค่าอ้างอิงของมาตรฐาน', () => {
    // "123456789" เป็นชุดทดสอบมาตรฐานของ CRC-16/CCITT-FALSE → 0x29B1
    assert.strictEqual(CFEmv.crc16('123456789'), '29B1');
});

test('แยก TLV ได้ถูกต้อง และจับโครงที่พังได้', () => {
    const f = CFEmv.parseTLV('000201' + '5802TH');
    assert.strictEqual(f['00'], '01');
    assert.strictEqual(f['58'], 'TH');
    // ความยาวบอก 10 แต่มีจริง 2 ตัว — ต้องไม่ยอมรับ
    assert.strictEqual(CFEmv.parseTLV('5810TH'), null);
});

/* ── payload จริงจากไลบรารี ─────────────────────────────────── */
test('QR ผูกยอด: โครงถูก ฟิลด์ครบ CRC ตรง', () => {
    const amount = 137;
    const payload = generatePayload('0812345678', { amount });
    const r = CFEmv.verify(payload, { amount });

    assert.deepStrictEqual(r.problems, [], 'ไม่ควรมีปัญหา');
    assert.ok(r.ok);
    assert.strictEqual(r.fields['58'], 'TH');
    assert.strictEqual(r.fields['53'], '764');
    assert.strictEqual(parseFloat(r.fields['54']), amount);
});

test('ยอดเศษสตางค์ถูกใส่ครบสองตำแหน่ง', () => {
    const payload = generatePayload('0812345678', { amount: 99.5 });
    const r = CFEmv.verify(payload, { amount: 99.5 });
    assert.deepStrictEqual(r.problems, []);
    assert.strictEqual(r.fields['54'], '99.50');
});

test('จับได้เมื่อยอดใน QR ไม่ตรงกับยอดที่ต้องชำระ', () => {
    const payload = generatePayload('0812345678', { amount: 100 });
    const r = CFEmv.verify(payload, { amount: 137 });
    assert.strictEqual(r.ok, false);
    assert.ok(r.problems.some((p) => p.includes('ไม่ตรงกับยอดที่ต้องชำระ')));
});

test('จับได้เมื่อ QR ไม่ผูกยอด (ลูกค้าต้องพิมพ์เอง = ยอดผิดได้)', () => {
    const payload = generatePayload('0812345678', {});   // ไม่ใส่ amount
    const r = CFEmv.verify(payload, { amount: 137 });
    assert.strictEqual(r.ok, false);
    assert.ok(r.problems.some((p) => p.includes('ไม่ได้ผูกยอด')));
});

test('จับได้เมื่อ CRC ถูกแก้ — นี่คือบั๊กที่สแกนติดแต่ธนาคารปฏิเสธ', () => {
    const payload = generatePayload('0812345678', { amount: 137 });
    const broken = payload.slice(0, -1) + (payload.slice(-1) === '0' ? '1' : '0');
    const r = CFEmv.verify(broken, { amount: 137 });
    assert.strictEqual(r.ok, false);
    assert.ok(r.problems.some((p) => p.includes('CRC ไม่ตรง')));
});

test('รองรับเลขประจำตัวผู้เสียภาษี 13 หลัก ไม่ใช่แค่เบอร์โทร', () => {
    const payload = generatePayload('1234567890123', { amount: 50 });
    const r = CFEmv.verify(payload, { amount: 50 });
    assert.deepStrictEqual(r.problems, []);
});
