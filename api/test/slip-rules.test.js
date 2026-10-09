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

/* ── คนโอน / ผู้รับ — ข้อความจริงจาก OCR ของสลิปที่ลูกค้าสแกนที่คีออสก์ ─────────── */
const REAL = {
    // make: คู่ ชื่อ→เลขบัญชี · มียอด -50.00 ของแอปที่เปิดค้างด้านหลังปนมา
    MAKE: ['โอนเง็น', '-50.00', 'อื่นๆ', 'ศ.25 ก.ย.2569', 'โอนเงินสำเร็จ', 'Make', '25 ก.ย. 2569 08:51', 'by KBank',
        'อนุวัฒน์ จ', 'xxx-X-x8204-x', 'นายอนวัฒน์ จันทร์รัศมี', 'XXX-XXx-8987', 'จำนวน', '80.00 บาท', 'ค่าธรรมเนียม', '0.00 บาท'],
    // K PLUS → พร้อมเพย์ · "สมหวัง" คือข้อความที่อ่านได้จากโลโก้ ต้องไม่ถูกนับเป็นชื่อ
    KPLUS: ['ทำรายการสำเร็จ', 'โอนเงินสำเร็จ', 'น.ส. รัชฎา น', 'มสข', 'ธ.กสึกรไทย', 'สมหวัง', 'O', 'XXX-X-X2811-x',
        'นางสาว รัชฎา นาไชยธง', 'Prompt', 'รหัสพร้อมเพย์', 'Pay', 'xxx-Xxx-5706', 'จำนวน:', '80.00 บาท'],
    // SCB จ่ายบิล: ป้าย จาก/ไปยัง · ชื่อผู้รับอยู่ "หลัง" เลขบัญชี · วันที่มีขีดติดเวลา
    SCB: ['SCB', 'จ่ายเงินสำเร็จ', '25 ก.ย. 2569 -10:48', 'จาก', 'น.ส. รัชฎา น.', 'ไปยัง', 'Xxx-xxx896-1',
        'ก้อยคาเฟ ดอนเมือง', 'Biller ID : 010753600031508', 'จำนวนเงิน', 'บันทึกช่วยจำ', '85.00', 'น้ำ'],
};

test('แยกคนโอน/ผู้รับ: make (ชื่อ→เลขบัญชี) · ยอดของแอปอื่นด้านหลังไม่ถูกนับ', () => {
    const p = CFSlipRules.findParties(REAL.MAKE);
    assert.strictEqual(p.sender.name, 'อนุวัฒน์ จ');
    assert.strictEqual(p.sender.tail, '8204');
    assert.strictEqual(p.receiver.name, 'นายอนวัฒน์ จันทร์รัศมี');
    assert.strictEqual(p.receiver.tail, '8987');
    assert.strictEqual(CFSlipRules.findAmount(REAL.MAKE), 80);
});

test('แยกคนโอน/ผู้รับ: K PLUS → พร้อมเพย์ · ข้อความจากโลโก้ไม่ใช่ชื่อ · ธนาคารสะกดเพี้ยนยังรู้จัก', () => {
    const p = CFSlipRules.findParties(REAL.KPLUS);
    assert.deepStrictEqual(p.sender, { name: 'น.ส. รัชฎา น', tail: '2811', bank: 'กสิกรไทย' });
    assert.deepStrictEqual(p.receiver, { name: 'นางสาว รัชฎา นาไชยธง', tail: '5706', bank: 'พร้อมเพย์' });
});

test('แยกคนโอน/ผู้รับ: SCB มีป้ายจาก/ไปยัง และชื่อผู้รับอยู่หลังเลขบัญชี', () => {
    const p = CFSlipRules.findParties(REAL.SCB);
    assert.strictEqual(p.sender.name, 'น.ส. รัชฎา น.');
    assert.deepStrictEqual(p.receiver, { name: 'ก้อยคาเฟ ดอนเมือง', tail: '8961', bank: null });
    assert.deepStrictEqual(CFSlipRules.findDate(REAL.SCB), { y: 2026, m: 9, d: 25, hh: 10, mm: 48 });
});

test('แยกคนโอน/ผู้รับ: กรุงไทย · ตัด *** ท้ายชื่อ · ธนาคารทั้งสองฝั่ง', () => {
    const p = CFSlipRules.findParties(KTB);
    assert.deepStrictEqual(p.sender, { name: 'นายอนุวัฒน์ จ', tail: '3539', bank: 'กรุงไทย' });
    assert.deepStrictEqual(p.receiver, { name: 'นาย อนุวัฒน์ จันทร์รัศมี', tail: '1181', bank: 'กสิกรไทย' });
});

test('เห็นแค่ผู้รับ (คนโอนหลุดกรอบ) → ถือเป็นผู้รับ ไม่ใช่คนโอน', () => {
    const p = CFSlipRules.findParties(NODEC);
    assert.strictEqual(p.sender, null);
    assert.strictEqual(p.receiver.tail, '5706');
});

test('ตรวจบัญชีร้าน: เลขท้ายตรง = ผ่าน · เลขไม่ตรง = ไม่ผ่าน · ไม่ได้ตั้ง = ข้าม', () => {
    const rx = CFSlipRules.findParties(REAL.KPLUS).receiver;
    assert.strictEqual(CFSlipRules.receiverCheck(rx, { accounts: ['080-186-5706'] }), 'PASS');
    assert.strictEqual(CFSlipRules.receiverCheck(rx, { accounts: ['0891234567'] }), 'FAIL');
    assert.strictEqual(CFSlipRules.receiverCheck(rx, {}), 'SKIP');
    assert.strictEqual(CFSlipRules.receiverCheck(null, { accounts: ['0801865706'] }), 'UNKNOWN');
});

test('ตรวจบัญชีร้านด้วยชื่อ — ยอมให้ OCR สะกดเพี้ยน (อนวัฒน์ / อนุวัฒน์)', () => {
    const rx = CFSlipRules.findParties(REAL.MAKE).receiver;       // "นายอนวัฒน์ จันทร์รัศมี" ไม่มีเลขร้านให้เทียบ
    assert.strictEqual(CFSlipRules.receiverCheck({ name: rx.name }, { name: 'อนุวัฒน์ จันทร์รัศมี' }), 'PASS');
    assert.strictEqual(CFSlipRules.receiverCheck({ name: 'ร้านถุงเงิน (ลานครัววิลันต์)' }, { name: 'ก้อยคาเฟ' }), 'FAIL');
});

test('โอนให้คนอื่น → FAIL ทั้งใบ แม้ยอดและวันที่ตรง', () => {
    const r = CFSlipRules.evaluate(REAL.MAKE, { total: 80, orderAt: AT(25, '08:49'), scannedAt: AT(25, '08:52'),
        shop: { name: 'ก้อยคาเฟ', accounts: ['0801865706'] } });
    assert.strictEqual(r.checks.amount, 'PASS');
    assert.strictEqual(r.checks.date, 'PASS');
    assert.strictEqual(r.checks.receiver, 'FAIL');
    assert.strictEqual(r.verdict, 'FAIL');
    assert.match(r.notes[2], /ไม่ใช่บัญชีร้าน/);
});

test('ยอดถูก OCR ตัดเป็นสองบรรทัด "80" | ".00 นาท" → 80 · ไม่เอา 0.00 ค่าธรรมเนียม', () => {
    const t = ['นางสาว รัชฏา นาไชยธง', 'Xxx-Xxx-5706', 'จำนวน:', '80', '.00 บาท', 'คำธรรมเนียม:', '0.00 นาท'];
    assert.strictEqual(CFSlipRules.findAmount(t), 80);
});

test('วันที่ที่ "ก" ถูกอ่านเป็นเลข 0: "250ย. 69 11:54 น." → 25 ก.ย.', () => {
    assert.deepStrictEqual(CFSlipRules.findDate(['250ย. 69 11:54 น.']), { y: 2026, m: 9, d: 25, hh: 11, mm: 54 });
});

/* ── วันที่จากเลขอ้างอิง (สลิปกสิกร) — ยืนยันกับสลิปจริง ─────────────────── */
test('เลขอ้างอิง K PLUS บอกวันและเวลา · make บอกแค่วัน · ธนาคารอื่นไม่ใช้', () => {
    assert.deepStrictEqual(CFSlipRules.refDate('016268115425CPP10873', '004'), { doy: 268, hh: 11, mm: 54 });  // 25 ก.ย. 11:54
    assert.deepStrictEqual(CFSlipRules.refDate('016260192624BPM06689', '004'), { doy: 260, hh: 19, mm: 26 });  // 17 ก.ย. 19:26
    assert.deepStrictEqual(CFSlipRules.refDate('0462575o95uipuaeQpp8', '004'), { doy: 257 });                 // 14 ก.ย.
    assert.strictEqual(CFSlipRules.refDate('A7711d901765c4fa6', '006'), null);
    assert.strictEqual(CFSlipRules.refDate('016268115425CPP10873', '014'), null);
});

test('OCR หาวันที่ไม่เจอ → ใช้วันที่จากเลขอ้างอิง · สลิปเก่าก็ยังจับได้', () => {
    const lines = ['จำนวน:', '80.00 บาท'];                                        // วันที่หลุดกรอบ
    const ok = CFSlipRules.evaluate(lines, { total: 80, ref: '016268115425CPP10873', bankCode: '004',
        qrAt: AT(25, '11:53'), scannedAt: AT(25, '11:55') });
    assert.strictEqual(ok.checks.date, 'PASS');
    assert.match(ok.dateText, /จากเลขอ้างอิง/);
    const old = CFSlipRules.evaluate(lines, { total: 80, ref: '016260192624BPM06689', bankCode: '004',
        scannedAt: AT(25, '11:55') });
    assert.strictEqual(old.checks.date, 'FAIL');                                  // 17 ก.ย. ไม่ใช่วันนี้
});

/* ── ช่วงเวลาเทียบกับตอนร้านออก QR ─────────────────────────────────────── */
test('สลิปที่โอนก่อนร้านออก QR → FAIL (สลิปของการจ่ายอื่น)', () => {
    const r = CFSlipRules.evaluate(['25 ก.ย. 2569 11:40', 'จำนวน', '80.00 บาท'],
        { total: 80, orderAt: AT(25, '11:48'), qrAt: AT(25, '11:50'), scannedAt: AT(25, '11:52') });
    assert.strictEqual(r.checks.date, 'FAIL');
    assert.match(r.notes[1], /ก่อนร้านออก QR/);
});

test('ลูกค้าโอนช้าหลัง QR หมดเวลา (นับถอยหลังจบ 11:52:30 แต่โอน 11:55) → ยังผ่าน', () => {
    const r = CFSlipRules.evaluate(['25 ก.ย. 2569 11:55', 'จำนวน', '80.00 บาท'],
        { total: 80, orderAt: AT(25, '11:49'), qrAt: AT(25, '11:50'), scannedAt: AT(25, '11:56') });
    assert.strictEqual(r.checks.date, 'PASS');
});

/* ── กรุงไทย ถ่ายจอมือถือ (ภาพเอียง มีแสง) ─────────────────────────────── */
test('กรุงไทยถ่ายจากจอ: "22 n.8. 2565 - 2359" (ย เป็น 8, เวลาไม่มี :) → 22 ก.ย. 23:59', () => {
    assert.deepStrictEqual(CFSlipRules.findDate(['22 n.8. 2565 - 2359']), { y: 2022, m: 9, d: 22, hh: 23, mm: 59 });
    // เวลาไม่มี ":" ยอมเฉพาะหลังขีด — เลขที่ต่อท้ายด้วยเว้นวรรคธรรมดาไม่นับเป็นเวลา
    assert.strictEqual(CFSlipRules.findDate(['22 ก.ย. 2565 2359']), null);
});

test('โอน 23:59 แล้วสแกนตอน 00:00 วันถัดไป → ยังผ่าน (ข้ามเที่ยงคืน)', () => {
    const lines = ['22 ก.ย. 2565 - 23:59', 'จำนวนเงิน', '3,199.47 บาท'];
    const r = CFSlipRules.evaluate(lines, { total: 3199.47, qrAt: new Date('2022-09-22T16:58:00Z'),
        scannedAt: new Date('2022-09-22T17:00:30Z') });                        // 23:58 ออก QR · 00:00:30 สแกน
    assert.strictEqual(r.checks.date, 'PASS');
});

/* ── จากชุดทดสอบ 57 ใบ (09/10/2569) — โมเดลอ่านถูก แต่กฎแยกข้อมูลไม่รองรับรูปแบบ ── */

test('วันที่กับเวลาอยู่คนละบรรทัด (ออมสิน / กรุงไทย)', () => {
    const gsb = ['20.00', '0.00 ค่ารรรมเนียม', '18 มี.ค.2569', '16:35'];
    assert.deepStrictEqual(CFSlipRules.findDate(gsb), { y: 2026, m: 3, d: 18, hh: 16, mm: 35 });
    const ktb = ['80.00 บาn', '0.00 บาท', '18 มี.ค. 2569', '-16:35'];
    assert.deepStrictEqual(CFSlipRules.findDate(ktb), { y: 2026, m: 3, d: 18, hh: 16, mm: 35 });
    const ktb2 = ['348.00 บาท', 'จำนวนเงิน', 'วันที่ทำรายการ 18 มี.ค. 2569', '16:35'];
    assert.deepStrictEqual(CFSlipRules.findDate(ktb2), { y: 2026, m: 3, d: 18, hh: 16, mm: 35 });
});

test('วันอยู่ท้ายบรรทัดก่อน เดือนมี colon ("วันที่21" | "มี.ค: 69 11:04 น.")', () => {
    const lines = ['บัญชี xxx-x-×0436-× จำนวนเงิน 360.00 บาท วันที่21', 'มี.ค: 69 11:04 น.', 'ธ.กสิกรไทย'];
    assert.deepStrictEqual(CFSlipRules.findDate(lines), { y: 2026, m: 3, d: 21, hh: 11, mm: 4 });
});

test('ยอดใช้จุดคั่นหลักพัน "3.000.00 บาท"', () => {
    const lines = ['ชำระเงินสำเร็จ', 'K+', '18 มี.ค. 69 16:35 น.', 'เลขที่รายการ:', '016077163539AQR05819',
        'จำนวน:', '3.000.00 บาท', 'ค่าธรรมเนียม:', '0.00 บาท'];
    assert.strictEqual(CFSlipRules.findAmount(lines), 3000);
    assert.strictEqual(CFSlipRules.findAmount(['จำนวนเงิน', '1.250.50 บาท', '0.00 บาท']), 1250.5);
    // ยอดปกติแบบจุลภาคยังเหมือนเดิม
    assert.strictEqual(CFSlipRules.findAmount(['จำนวนเงิน', '1,000.00 บาก']), 1000);
});

test('บรรทัดเดี่ยวยังมาก่อนคู่บรรทัด — ไม่หยิบวันที่ผิดจากการต่อบรรทัด', () => {
    const lines = ['โอนเงินสำเร็จ', '25 ก.ย. 69 11:54 น.', 'นาย ก', '12 บาท', '2569 10:00'];
    assert.deepStrictEqual(CFSlipRules.findDate(lines), { y: 2026, m: 9, d: 25, hh: 11, mm: 54 });
});

test('แถบแจ้งเตือนมือถือเด้งทับหัวสลิป — ไม่นับเลขบัญชี/ยอดในแถบ', () => {
    // ภาพจริง 09/10/2569: แอปธนาคารอื่นเด้ง "รับเงินสำเร็จ" ทับ K PLUS → เดิมได้คนโอน "ตอนนี้ · 1181" ผู้รับเลื่อนผิด
    const lines = ['15:37', 'แร62', 'รับเงินสำเร็จ', 'ได้รับ +1.00 บาท เข้าพร้อมเพย์ จากบัญซี กสิกรไทย', 'ตอนนี้',
        'XXX-X-XX118-1', 'เอนเงนสาเรจ', '9 ต.ค. 69 15:37 น.', 'K+', 'นาย อนุวัฒน์ จ', 'ธ.กสิกรไทย', 'xxx-x-x3118-x',
        'นายอนุวัฒน์ จันทร์รัศมี', 'รหัสพร้อมเพย์', 'XxX-xxx-8987', 'จำนวน:', '1.00 บาท', 'คาธรรมเนียม:', '0.00 บาท'];
    const r = CFSlipRules.evaluate(lines, {
        total: 1, orderAt: '2026-10-09T08:30:00Z', scannedAt: '2026-10-09T08:38:00Z', qrAt: '2026-10-09T08:35:00Z',
        shop: { name: '', accounts: ['0801868987'] },
    });
    assert.strictEqual(r.sender.tail, '3118');
    assert.strictEqual(r.receiver.tail, '8987');
    assert.strictEqual(r.checks.receiver, 'PASS');
    assert.strictEqual(r.verdict, 'PASS');
    // สลิปที่ไม่มีแถบ — ไม่ตัดอะไร (คำว่า "จากบัญชี" ในเนื้อสลิปเองต้องอยู่ครบ)
    const plain = ['โอนเงินสำเร็จ', 'โอนจากบัญชี', 'นาย ก', 'xxx-x-x1234-x'];
    assert.deepStrictEqual(CFSlipRules.stripBanner(plain), plain);
});
