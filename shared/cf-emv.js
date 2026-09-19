/**
 * CafeFlow — ตรวจสอบ payload ของ QR พร้อมเพย์ (มาตรฐาน EMVCo)
 * ══════════════════════════════════════════════════════════════════
 * ทำไมต้องมีตัวตรวจ ทั้งที่ใช้ไลบรารีสร้าง:
 *   QR ที่ CRC ผิดจะ "สแกนติด" แต่แอปธนาคารปฏิเสธ — อาการเหมือนแอปมีปัญหา
 *   ไม่เหมือนโค้ดเราผิด เป็นบั๊กที่หาสาเหตุยากที่สุดแบบหนึ่ง
 *   ตรวจตั้งแต่ตอนสร้าง (และในเทสต์) จึงคุ้มกว่ารอให้ลูกค้าเจอหน้าร้าน
 *
 * ตรวจสามชั้น: โครง TLV ถูกต้อง · ฟิลด์บังคับครบและตรงค่าที่ควรเป็น · CRC ตรง
 *
 * ⚠️ ตรรกะบริสุทธิ์ — ห้ามอ้าง window / require ไลบรารีภายนอก
 */
(function (root, factory) {
    const m = factory();
    if (typeof module === 'object' && module.exports) module.exports = m;
    else Object.keys(m).forEach((k) => { root[k] = m[k]; });
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /**
     * CRC-16/CCITT-FALSE — poly 0x1021, init 0xFFFF, ไม่กลับบิต
     * มาตรฐาน EMVCo บังคับตัวนี้ ใช้ตัวอื่นแล้วธนาคารไม่รับ
     */
    function crc16(str) {
        let crc = 0xFFFF;
        for (let i = 0; i < str.length; i++) {
            crc ^= str.charCodeAt(i) << 8;
            for (let b = 0; b < 8; b++) {
                crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
            }
        }
        return crc.toString(16).toUpperCase().padStart(4, '0');
    }

    /** แยก payload เป็น tag/length/value — คืน null ถ้าโครงพัง */
    function parseTLV(s) {
        const out = {};
        let i = 0;
        while (i < s.length) {
            if (i + 4 > s.length) return null;
            const tag = s.slice(i, i + 2);
            const len = parseInt(s.slice(i + 2, i + 4), 10);
            if (!Number.isInteger(len) || i + 4 + len > s.length) return null;
            out[tag] = s.slice(i + 4, i + 4 + len);
            i += 4 + len;
        }
        return out;
    }

    /**
     * ตรวจว่า payload ใช้ได้จริงและตรงกับยอดที่ตั้งใจ
     * คืน { ok, problems[], fields }
     */
    function verify(payload, expect) {
        const problems = [];
        expect = expect || {};

        if (typeof payload !== 'string' || payload.length < 20) {
            return { ok: false, problems: ['payload สั้นเกินกว่าจะเป็น QR ที่ใช้ได้'], fields: {} };
        }

        // CRC คือ 4 ตัวท้าย และคำนวณจากทุกอย่างก่อนหน้า "รวม" หัว 6304
        const head = payload.slice(0, -4);
        if (!head.endsWith('6304')) problems.push('ไม่พบฟิลด์ CRC (63) ที่ท้าย payload');
        const want = crc16(head);
        const got = payload.slice(-4).toUpperCase();
        if (want !== got) problems.push(`CRC ไม่ตรง (คำนวณได้ ${want} แต่ใน payload เป็น ${got})`);

        const f = parseTLV(payload);
        if (!f) {
            problems.push('โครง TLV ไม่ถูกต้อง');
            return { ok: false, problems, fields: {} };
        }

        if (f['00'] !== '01') problems.push('Payload Format Indicator ต้องเป็น 01');
        if (f['58'] !== 'TH') problems.push('รหัสประเทศต้องเป็น TH');
        if (f['53'] !== '764') problems.push('สกุลเงินต้องเป็น 764 (บาท)');

        // 01 = Point of Initiation: 11 = ใช้ซ้ำได้, 12 = ใช้ครั้งเดียว (ผูกยอด)
        if (expect.amount != null) {
            if (f['54'] == null) {
                problems.push('QR นี้ไม่ได้ผูกยอด — ลูกค้าจะต้องพิมพ์ยอดเอง');
            } else if (Math.abs(parseFloat(f['54']) - Number(expect.amount)) > 0.001) {
                problems.push(`ยอดใน QR (${f['54']}) ไม่ตรงกับยอดที่ต้องชำระ (${expect.amount})`);
            }
        }

        return { ok: problems.length === 0, problems, fields: f };
    }

    return { CFEmv: { crc16, parseTLV, verify } };
});
