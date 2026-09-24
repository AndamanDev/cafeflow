/**
 * ตัวอ่าน QR บนสลิปโอนเงิน — ต้องแยกสลิปจริงออกจาก QR อื่นให้ได้
 * โดยเฉพาะ QR พร้อมเพย์ของร้านเอง ที่ลูกค้าอาจยกมาสแกนผิดอัน
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const SHARED = path.resolve(__dirname, '..', '..', 'shared');
const { CFSlip } = require(path.join(SHARED, 'cf-slip.js'));
const { CFEmv } = require(path.join(SHARED, 'cf-emv.js'));
const generatePayload = require('promptpay-qr');

const tlv = (t, v) => t + String(v.length).padStart(2, '0') + v;

/** ประกอบ payload แบบเดียวกับ QR มุมสลิป */
function slipPayload({ api = '000001', bank = '004', ref = '015267103712BPM07512', country = 'TH' } = {}) {
    const p = tlv('00', tlv('00', api) + tlv('01', bank) + tlv('02', ref)) + tlv('51', country) + '9104';
    return p + CFEmv.crc16(p);
}

test('อ่านเลขอ้างอิงและธนาคารจากสลิปได้', () => {
    const r = CFSlip.parse(slipPayload());
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.ref, '015267103712BPM07512');
    assert.strictEqual(r.bankCode, '004');
    assert.strictEqual(r.bankName, 'กสิกรไทย');
    assert.strictEqual(r.crcOk, true);
});

test('QR พร้อมเพย์ของร้านไม่ใช่สลิป', () => {
    const r = CFSlip.parse(generatePayload('0812345678', { amount: 150 }));
    assert.strictEqual(r.ok, false);
});

test('ข้อความมั่ว ๆ / ว่าง ไม่ใช่สลิป', () => {
    assert.strictEqual(CFSlip.parse('https://example.com').ok, false);
    assert.strictEqual(CFSlip.parse('').ok, false);
    assert.strictEqual(CFSlip.parse(null).ok, false);
});

test('ไม่มีเลขอ้างอิง หรือไม่ใช่ประเทศไทย → ปฏิเสธ', () => {
    assert.strictEqual(CFSlip.parse(slipPayload({ ref: '' })).ok, false);
    assert.strictEqual(CFSlip.parse(slipPayload({ country: 'SG' })).ok, false);
});

test('CRC ผิดยังอ่านได้ แต่แจ้งว่า CRC ไม่ตรง', () => {
    const p = slipPayload();
    const r = CFSlip.parse(p.slice(0, -4) + '0000');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.crcOk, false);
});
