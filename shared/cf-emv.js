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

    /* ══════════════════════════════════════════════════════════════
       QR รับเงินที่ร้านอัปโหลดจากแอปธนาคาร (16/10/2569)
       บัญชีร้านไม่มีพร้อมเพย์ → ใช้ QR ร้านค้าของธนาคาร (Thai QR ชำระบิล) เป็นแม่แบบ แล้วใส่ยอดทีละบิล
       ══════════════════════════════════════════════════════════════ */
    const AID_PROMPTPAY = 'A000000677010111';     // tag 29 — โอนเข้าพร้อมเพย์
    const AID_BILLPAY   = 'A000000677010112';     // tag 30 — ชำระบิล / QR ร้านค้า (K SHOP · แม่มณี · ถุงเงิน ฯลฯ)

    /** CRC ท้าย payload ตรงไหม — QR ที่ CRC ผิด ธนาคารปฏิเสธ ห้ามใช้เป็นแม่แบบ */
    function crcOk(payload) {
        if (typeof payload !== 'string' || payload.length < 20) return false;
        const head = payload.slice(0, -4);
        return head.endsWith('6304') && crc16(head) === payload.slice(-4).toUpperCase();
    }

    /** แยก TLV แบบรักษาลำดับ — withAmount ต้องประกอบกลับตามลำดับเดิม */
    function parseList(s) {
        const out = [];
        let i = 0;
        while (i < s.length) {
            if (i + 4 > s.length) return null;
            const tag = s.slice(i, i + 2);
            const len = parseInt(s.slice(i + 2, i + 4), 10);
            if (!Number.isInteger(len) || i + 4 + len > s.length) return null;
            out.push([tag, s.slice(i + 4, i + 4 + len)]);
            i += 4 + len;
        }
        return out;
    }

    /**
     * QR นี้คืออะไร — ใช้ตอนร้านอัปโหลดภาพ QR รับเงิน
     *   { kind:'promptpay', id }                         QR "รับเงิน" ส่วนตัว → ใช้ทางพร้อมเพย์เดิม
     *   { kind:'billpay', billerId, ref1, ref2, name }  QR ร้านค้าของธนาคาร → เก็บเป็นแม่แบบ
     *   { kind:'unknown', reason }                       ใช้ไม่ได้ (CRC ผิด · QR ต่างประเทศ · ลิงก์เว็บ ฯลฯ)
     */
    function classify(payload) {
        if (!crcOk(payload)) return { kind: 'unknown', reason: 'ไม่ใช่ QR รับเงินของธนาคารไทย (หรือ QR เสีย)' };
        const f = parseTLV(payload);
        if (!f || f['00'] !== '01') return { kind: 'unknown', reason: 'รูปแบบ QR ไม่ถูกต้อง' };
        const name = f['59'] || '';

        const pp = f['29'] && parseTLV(f['29']);
        if (pp && pp['00'] === AID_PROMPTPAY) {
            // 01 เบอร์โทร เก็บเป็น 0066 + เบอร์ไม่มีเลข 0 นำหน้า (ยาว 13) · 02 เลข 13 หลัก · 03 e-wallet 15 หลัก
            if (pp['01']) return { kind: 'promptpay', id: '0' + pp['01'].replace(/^0+66/, ''), type: 'phone', name };
            if (pp['02']) return { kind: 'promptpay', id: pp['02'], type: 'id', name };
            if (pp['03']) return { kind: 'promptpay', id: pp['03'], type: 'ewallet', name };
        }
        const bp = f['30'] && parseTLV(f['30']);
        if (bp && bp['00'] === AID_BILLPAY && bp['01']) {
            return { kind: 'billpay', billerId: bp['01'], ref1: bp['02'] || '', ref2: bp['03'] || '', name };
        }
        return { kind: 'unknown', reason: 'QR นี้ไม่ใช่ QR รับเงินของธนาคารไทย (พร้อมเพย์ / QR ร้านค้า)' };
    }

    /**
     * ใส่ยอดลงแม่แบบ → QR ใช้ครั้งเดียว ล็อกยอด (ลูกค้าไม่ต้องพิมพ์ยอด)
     *   01 = 12 (dynamic) · 54 = ยอด 2 ตำแหน่ง ต่อจาก 53 · ตัด 63 เดิม แล้วคำนวณ CRC ใหม่
     *   แม่แบบที่มียอดอยู่แล้ว → แทนที่ ไม่ซ้อน · tag อื่น (รหัสร้าน/ref ใน 30) ไม่แตะ
     */
    function withAmount(template, amount) {
        if (!crcOk(template)) throw new Error('แม่แบบ QR ไม่ถูกต้อง (CRC ไม่ตรง)');
        const list = parseList(template.slice(0, -8));            // ตัด "6304" + CRC 4 ตัวท้าย
        if (!list) throw new Error('แม่แบบ QR ไม่ถูกต้อง');
        const amt = Number(amount).toFixed(2);
        const rows = list.filter(([t]) => t !== '63' && t !== '54');
        const i01 = rows.findIndex(([t]) => t === '01');
        if (i01 >= 0) rows[i01] = ['01', '12'];
        else rows.splice(rows.findIndex(([t]) => t === '00') + 1, 0, ['01', '12']);
        const i53 = rows.findIndex(([t]) => t === '53');
        const i58 = rows.findIndex(([t]) => t === '58');
        rows.splice(i53 >= 0 ? i53 + 1 : (i58 >= 0 ? i58 : rows.length), 0, ['54', amt]);
        const body = rows.map(([t, v]) => t + String(v.length).padStart(2, '0') + v).join('') + '6304';
        return body + crc16(body);
    }

    return { CFEmv: { crc16, parseTLV, verify, classify, withAmount, crcOk } };
});
