/**
 * CafeFlow — อ่าน QR บนสลิปโอนเงิน (§14 §17)
 * ══════════════════════════════════════════════════════════════════
 * สลิปจากแอปธนาคารไทยมี QR เล็กที่มุมสลิป (มาตรฐาน Slip Verification)
 * เก็บ "เลขอ้างอิงรายการ" กับรหัสธนาคารผู้โอน โครงเป็น TLV แบบเดียวกับ QR พร้อมเพย์:
 *
 *   00 ── 00 รหัส API  = "000001"
 *      ├─ 01 ธนาคารผู้โอน (3 หลัก เช่น 004 = กสิกร)
 *      └─ 02 เลขอ้างอิงรายการ
 *   51 ประเทศ = "TH"
 *   91 CRC-16 (4 ตัว)
 *
 * ★ QR นี้ "ไม่มียอดเงินและไม่มีบัญชีปลายทาง" — มีแค่เลขอ้างอิง
 *   อ่านได้แปลว่าเป็นสลิปจริงของธนาคารในเชิงรูปแบบเท่านั้น ไม่ได้พิสูจน์ว่าเงินเข้าร้าน
 *   ในร้าน (ไม่ใช้เน็ต) ใช้ได้แค่กันสลิปใบเดิมถูกใช้ซ้ำ ส่วนยืนยันเงินเข้ายังเป็นหน้าที่แคชเชียร์
 *   จนกว่าจะต่อบริการตรวจสลิปกับธนาคาร
 *
 * ⚠️ ตรรกะบริสุทธิ์ — ใช้ได้ทั้งหน้าเว็บ (คีออสก์กรองก่อนส่ง) และเซิร์ฟเวอร์ (ตัดสินจริง)
 */
(function (root, factory) {
    const emv = typeof module === 'object' && module.exports ? require('./cf-emv.js').CFEmv : root.CFEmv;
    const m = factory(emv);
    if (typeof module === 'object' && module.exports) module.exports = m;
    else Object.keys(m).forEach((k) => { root[k] = m[k]; });
})(typeof self !== 'undefined' ? self : this, function (CFEmv) {
    'use strict';

    const BANKS = {
        '002': 'กรุงเทพ', '004': 'กสิกรไทย', '006': 'กรุงไทย', '011': 'ทีทีบี',
        '014': 'ไทยพาณิชย์', '022': 'ซีไอเอ็มบี', '024': 'ยูโอบี', '025': 'กรุงศรี',
        '030': 'ออมสิน', '033': 'อาคารสงเคราะห์', '034': 'ธ.ก.ส.', '067': 'ทิสโก้',
        '069': 'เกียรตินาคินภัทร', '073': 'แลนด์ แอนด์ เฮ้าส์',
    };

    /**
     * แยก payload ของ QR บนสลิป
     * คืน { ok:true, ref, bankCode, bankName, crcOk } หรือ { ok:false, reason }
     *
     * CRC ผิดไม่ถือว่าเป็นสลิปปลอม (บางธนาคารคำนวณต่างออกไป) แต่ส่งผลไปให้แคชเชียร์เห็น
     */
    function parse(payload) {
        const s = String(payload || '').trim();
        const f = CFEmv.parseTLV(s);
        if (!f || !f['00']) return { ok: false, reason: 'ไม่ใช่ QR ของสลิปโอนเงิน' };

        const sub = CFEmv.parseTLV(f['00']);
        if (!sub || sub['00'] !== '000001') {
            // QR พร้อมเพย์ที่ร้านแสดงก็ขึ้นต้นด้วย 00 เหมือนกัน — ลูกค้ายกจอคีออสก์มาสแกนก็เจอเคสนี้
            return { ok: false, reason: 'ไม่ใช่ QR ของสลิปโอนเงิน' };
        }
        const ref = sub['02'];
        if (!ref || !/^[0-9A-Za-z]{6,40}$/.test(ref)) return { ok: false, reason: 'ไม่พบเลขอ้างอิงในสลิป' };
        if (f['51'] && f['51'] !== 'TH') return { ok: false, reason: 'สลิปนี้ไม่ใช่ของธนาคารในไทย' };

        let crcOk = null;
        if (f['91'] && s.endsWith(f['91'])) {
            crcOk = CFEmv.crc16(s.slice(0, -4)) === f['91'].toUpperCase();
        }
        const bankCode = sub['01'] || null;
        return { ok: true, ref, bankCode, bankName: BANKS[bankCode] || null, crcOk };
    }

    return { CFSlip: { parse, BANKS } };
});
