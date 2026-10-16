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

/* ── QR รับเงินที่ร้านอัปโหลด (16/10/2569) ─────────────────────── */
// QR ร้านค้า/ชำระบิลแบบที่ธนาคารให้ (K SHOP · แม่มณี ฯลฯ) — ประกอบเองตามมาตรฐาน Thai QR tag 30
const tlv = (t, v) => t + String(v.length).padStart(2, '0') + v;
function billpayQr({ amount, name = 'CAFE CLOUD' } = {}) {
    let b = tlv('00', '01') + tlv('01', amount == null ? '11' : '12') +
        tlv('30', tlv('00', 'A000000677010112') + tlv('01', '010753600010286') + tlv('02', 'SHOP001') + tlv('03', 'KSHOP')) +
        tlv('53', '764') + (amount == null ? '' : tlv('54', Number(amount).toFixed(2))) +
        tlv('58', 'TH') + tlv('59', name) + '6304';
    return b + CFEmv.crc16(b);
}

test('classify: QR พร้อมเพย์ส่วนตัว → ได้เลขพร้อมเพย์กลับมาตรง (เบอร์โทร · 13 หลัก · e-wallet)', () => {
    assert.deepStrictEqual(
        [generatePayload('0812345678', {}), generatePayload('1234567890123', { amount: 5 }),
         generatePayload('123456789012345', {})].map((p) => CFEmv.classify(p).id),
        ['0812345678', '1234567890123', '123456789012345']);
    assert.strictEqual(CFEmv.classify(generatePayload('0812345678', {})).kind, 'promptpay');
});

test('classify: QR ร้านค้า (ชำระบิล) → ได้รหัสร้าน ref และชื่อร้าน', () => {
    const k = CFEmv.classify(billpayQr());
    assert.deepStrictEqual(k, { kind: 'billpay', billerId: '010753600010286', ref1: 'SHOP001', ref2: 'KSHOP', name: 'CAFE CLOUD' });
});

test('classify: CRC ผิด / ลิงก์เว็บ / ข้อความมั่ว → ใช้ไม่ได้', () => {
    const good = billpayQr();
    const broken = good.slice(0, -1) + (good.slice(-1) === '0' ? '1' : '0');
    for (const p of [broken, 'https://example.com/pay', '', 'hello world 1234567890']) {
        assert.strictEqual(CFEmv.classify(p).kind, 'unknown', p);
    }
});

test('withAmount: ใส่ยอดลง QR ร้านค้า → ผ่านตัวตรวจเดียวกับตอนออก QR · ใช้ครั้งเดียว · รหัสร้านไม่เปลี่ยน', () => {
    const p = CFEmv.withAmount(billpayQr(), 65.5);
    assert.deepStrictEqual(CFEmv.verify(p, { amount: 65.5 }).problems, []);
    const f = CFEmv.parseTLV(p);
    assert.strictEqual(f['01'], '12');
    assert.strictEqual(f['54'], '65.50');
    assert.strictEqual(f['30'], CFEmv.parseTLV(billpayQr())['30']);
    assert.strictEqual(CFEmv.classify(p).billerId, '010753600010286');
});

test('withAmount: แม่แบบที่มียอดอยู่แล้ว → แทนที่ ไม่ซ้อนสองยอด', () => {
    const p = CFEmv.withAmount(billpayQr({ amount: 99 }), 10);
    assert.strictEqual(CFEmv.parseTLV(p)['54'], '10.00');
    assert.strictEqual((p.match(/5405/g) || []).length + (p.match(/5404/g) || []).length, 1);
    assert.strictEqual(CFEmv.verify(p, { amount: 10 }).ok, true);
});

test('withAmount: แม่แบบ CRC เสีย → ไม่ยอมสร้าง (ห้ามส่ง QR ที่ธนาคารปฏิเสธไปให้ลูกค้า)', () => {
    const good = billpayQr();
    assert.throws(() => CFEmv.withAmount(good.slice(0, -1) + 'Z', 10));
});
