/**
 * ตัวตีความผล OCR — ทดสอบกับข้อความที่ PaddleOCR อ่านได้จริงจากภาพกล้องคีออสก์
 * (สลิปจริง 2 ใบ ถ่ายจากจอมือถือ: ใบหนึ่งชัด ใบหนึ่งมืดและเบลอ)
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { CFSlipRules } = require(path.resolve(__dirname, '..', '..', 'shared', 'cf-slip-rules.js'));

// ภาพชัด — K PLUS / make: 135.00 บาท · 14 ก.ย. 2569 20:03
const CLEAR = ['โอนเงินสำเร็จ', 'Make', '14 ก.ย. 2569 20:03', 'by KBank', 'อนุวัฒน์ จ',
    'xxx-x-x8204-x', 'อกิชญา โตจริง', 'Xxx-xxx-9457', 'จ้านวน', '135.00', 'บาท',
    'คำรรรมเนียม', 'สแกนเพื้อดรวจสอบ', '0.00 บาn', 'เลนที่รายการ: 0462575095uipuaeQpp8'];

// ภาพมืด/เบลอ — K+: 410.00 บาท · วันที่อ่านเพี้ยน
const BLURRY = ['จ่ายบิลสำเร็จ', 'K+', '178ะ 09 19:20 น', 'นาย อนวัตน์ 9', 'อ.กสิกรไทย', '8RXX3I',
    'ร้วานยุงเงิน (สามครัาวิสันต์)', '[mm', '2013508029017801230', 'NIAPORN', 'เอนที่งายการ',
    '0162601926240PM080n9', 'จM', '410.00 นm', 'คาครจม', '0000n', 'Um'];

// กรุงไทย — ยอดมีจุลภาค · มีขีดคั่นก่อนเวลา · OCR อ่าน "ก" เป็น n
const KTB = ['Krungthai', 'โอนเงินสำเร็จ', 'รหัสอ้างอิง A7711d901765c4fa6', 'จาก', 'นายอนุวัฒน์ จ ***',
    'กรุงไทย', 'XXX-x-xx353-9', 'ไปยัง', 'นาย อนุวัฒน์ จันทร์รัศมี', 'กสึกรไทย', 'xxx-×-xx118-1',
    'จำนวนเงิน', '1,000.00 บาก', 'ค่าธรรมเนียม', '0.00 บาท', 'วันที่ทำรายการ', '16 n.ย. 2569 - 19:03'];

// 14 ก.ย. 2569 20:03 เวลาไทย = 13:03 UTC
const AT = (d, hm) => new Date(`2026-09-${d}T${hm}:00+07:00`).toISOString();

test('อ่านยอดเงินได้ทั้งภาพชัดและภาพเบลอ (ข้าม 0.00 ค่าธรรมเนียม)', () => {
    assert.strictEqual(CFSlipRules.findAmount(CLEAR), 135);
    assert.strictEqual(CFSlipRules.findAmount(BLURRY), 410);
});

test('เลขที่รายการ/เลขบัญชียาว ๆ ไม่ถูกนับเป็นยอดเงิน', () => {
    assert.strictEqual(CFSlipRules.findAmount(['2013508029017801230', '1,250.50 บาท']), 1250.5);
});

test('อ่านวันที่ของภาพชัด · ภาพเบลอที่วันที่เพี้ยนต้องได้ null ไม่ใช่วันมั่ว ๆ', () => {
    assert.deepStrictEqual(CFSlipRules.findDate(CLEAR), { y: 2026, m: 9, d: 14, hh: 20, mm: 3 });
    assert.strictEqual(CFSlipRules.findDate(BLURRY), null);
});

test('สลิปที่ตรงทั้งยอดและเวลา → PASS', () => {
    const r = CFSlipRules.evaluate(CLEAR, { total: 135, orderAt: AT(14, '20:01'), scannedAt: AT(14, '20:04') });
    assert.strictEqual(r.verdict, 'PASS');
    assert.strictEqual(r.txAt, AT(14, '20:03'));
});

test('ยอดไม่ตรง → FAIL (เคสจริง: ออเดอร์ 165 แต่สลิป 135)', () => {
    const r = CFSlipRules.evaluate(CLEAR, { total: 165, orderAt: AT(14, '20:01'), scannedAt: AT(14, '20:04') });
    assert.strictEqual(r.checks.amount, 'FAIL');
    assert.strictEqual(r.verdict, 'FAIL');
});

test('สลิปเก่าคนละวัน → FAIL (เคสจริง: สลิป 14 ก.ย. เอามาใช้ 24 ก.ย.)', () => {
    const r = CFSlipRules.evaluate(CLEAR, { total: 135, orderAt: AT(24, '15:37'), scannedAt: AT(24, '15:39') });
    assert.strictEqual(r.checks.date, 'FAIL');
    assert.match(r.notes.join(' '), /ไม่ใช่วันนี้/);
});

test('วันเดียวกันแต่เวลาก่อนสั่งออเดอร์นาน → FAIL', () => {
    const r = CFSlipRules.evaluate(CLEAR, { total: 135, orderAt: AT(14, '21:00'), scannedAt: AT(14, '21:02') });
    assert.strictEqual(r.checks.date, 'FAIL');
});

test('อ่านวันที่ไม่ออกแต่ยอดตรง → WARN ไม่ใช่ FAIL (ห้ามเตือนแดงเมื่อไม่แน่ใจ)', () => {
    const r = CFSlipRules.evaluate(BLURRY, { total: 410, orderAt: AT(24, '15:30'), scannedAt: AT(24, '15:32') });
    assert.strictEqual(r.checks.amount, 'PASS');
    assert.strictEqual(r.checks.date, 'UNKNOWN');
    assert.strictEqual(r.verdict, 'WARN');
});

test('สลิปกรุงไทย: ยอดมีจุลภาค + วันที่มีขีดคั่น + "ก" ที่อ่านเป็น n', () => {
    assert.strictEqual(CFSlipRules.findAmount(KTB), 1000);
    assert.deepStrictEqual(CFSlipRules.findDate(KTB), { y: 2026, m: 9, d: 16, hh: 19, mm: 3 });
});

// พร้อมเพย์กรุงไทย — ยอด "55 บาท" ไม่มีทศนิยม · OCR แยกตัวเลขกับคำว่าบาทคนละบรรทัด · วันที่อยู่นอกภาพ
const NODEC = ['นางสาว รัชฎา นาไชยธง', 'Prompt', 'Pay', 'เลขพร้อมเพย์:****** 5706', '55', 'บาท',
    'จำนวนเงิน', '0 บาท', 'ค่าธรรมเนียม', 'บันทึกช่วยจำ', 'ทดสอบ', 'รหัสอ้างอิง', 'Ed6eef5a0f94c4ba0',
    'บันทึก/แชร์', 'เสร็จสิ้น'];

test('ยอดไม่มีทศนิยม "55 บาท" (ตัวเลขกับบาทคนละบรรทัด) · เลขพร้อมเพย์ 5706 ไม่ถูกนับ', () => {
    assert.strictEqual(CFSlipRules.findAmount(NODEC), 55);
    assert.strictEqual(CFSlipRules.findAmount(['ยอดโอน 1,250 บาท']), 1250);
    assert.strictEqual(CFSlipRules.findAmount(['เลขบัญชี 5706', 'รหัส 123456']), null);
});

test('ยอดตรงแต่วันที่อยู่นอกภาพ → WARN (ไม่เตือนแดง)', () => {
    const r = CFSlipRules.evaluate(NODEC, { total: 55, orderAt: AT(24, '17:16'), scannedAt: AT(24, '17:17') });
    assert.strictEqual(r.checks.amount, 'PASS');
    assert.strictEqual(r.verdict, 'WARN');
});

test('อ่านอะไรไม่ออกเลย → WARN', () => {
    const r = CFSlipRules.evaluate(['???', 'K+'], { total: 100, scannedAt: AT(24, '15:32') });
    assert.strictEqual(r.verdict, 'WARN');
});
