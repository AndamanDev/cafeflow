/**
 * CafeFlow — ตีความข้อความที่ OCR อ่านได้จากภาพสลิป (§14 §17)
 * ══════════════════════════════════════════════════════════════════
 * OCR คืนมาเป็นบรรทัดข้อความเฉย ๆ และ "เพี้ยนเสมอ" — สระหาย เดือนอ่านผิด
 * ตัวอักษรไทยกลายเป็นอังกฤษ ไฟล์นี้จึงดึงเฉพาะของที่เชื่อได้:
 *   · ยอดเงิน  — ตัวเลขรูปแบบ 1,234.56 (ตัวเลขอ่านแม่นกว่าตัวหนังสือมาก)
 *   · วันเวลา  — วัน + ปี + เวลา (เดือนอ่านไม่ออกก็ยังเทียบวันกับปีได้)
 *
 * ★ กติกา: อ่านไม่ออก = "ไม่รู้" ห้ามเดา และห้ามขึ้นเตือนแดง
 *   เตือนผิดบ่อย ๆ แคชเชียร์จะเลิกเชื่อคำเตือน ซึ่งแย่กว่าไม่มีคำเตือนเลย
 * ★ ผลนี้แค่ "ช่วยแคชเชียร์" — ห้ามใช้ตั้งออเดอร์เป็น PAID เอง
 *
 * ⚠️ ตรรกะบริสุทธิ์ — ใช้ได้ทั้งเซิร์ฟเวอร์ (ตัดสิน) และหน้าเว็บ (แสดงผล)
 */
(function (root, factory) {
    const m = factory();
    if (typeof module === 'object' && module.exports) module.exports = m;
    else Object.keys(m).forEach((k) => { root[k] = m[k]; });
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const TZ_OFFSET_MIN = 7 * 60;          // ร้านอยู่ไทย — สลิปพิมพ์เวลาไทยเสมอ

    // ตัวย่อเดือน (ตัดจุด/ช่องว่างออกก่อนเทียบ) · ไทยและอังกฤษ
    const MONTHS = [
        ['มค', 'มกราคม', 'jan'], ['กพ', 'กุมภาพันธ์', 'feb'], ['มีค', 'มีนาคม', 'mar'],
        ['เมย', 'เมษายน', 'apr'], ['พค', 'พฤษภาคม', 'may'], ['มิย', 'มิถุนายน', 'jun'],
        ['กค', 'กรกฎาคม', 'jul'], ['สค', 'สิงหาคม', 'aug'], ['กย', 'กันยายน', 'sep'],
        ['ตค', 'ตุลาคม', 'oct'], ['พย', 'พฤศจิกายน', 'nov'], ['ธค', 'ธันวาคม', 'dec'],
    ];
    const MONTH_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

    function monthOf(token) {
        // OCR ชอบอ่าน "ก" เป็นตัว n ภาษาอังกฤษ (เจอจริงในสลิปกรุงไทย: "16 n.ย. 2569")
        const t = String(token || '').toLowerCase().replace(/[\s.]/g, '').replace(/^n(?=[ก-๙])/, 'ก');
        if (!t) return null;
        const i = MONTHS.findIndex((m) => m.some((x) => x === t || (x.length > 3 && t.startsWith(x.slice(0, 3)))));
        return i >= 0 ? i + 1 : null;
    }

    /** ปีบนสลิป → ค.ศ. · 2569 (พ.ศ.) · 69 (พ.ศ. ย่อ) · 2026 (ค.ศ.) */
    function yearOf(s) {
        const n = parseInt(s, 10);
        if (s.length === 4) return n > 2400 ? n - 543 : n;
        if (s.length === 2) return 2500 + n - 543;
        return null;
    }

    /** "ตอนนี้" ตามเวลาไทย → { y, m, d } */
    function bkkParts(date) {
        const t = new Date(new Date(date).getTime() + TZ_OFFSET_MIN * 60000);
        return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
    }

    /** ยอดเงินในสลิป — ตัวแรกที่ไม่ใช่ 0.00 (0.00 คือค่าธรรมเนียม) · หลังคำว่า "จำนวน" ถ้าหาเจอ */
    function findAmount(lines) {
        const MONEY = /(?:^|[^\d.,])((?:\d{1,3}(?:,\d{3})+|\d{1,7})\.\d{2})(?![\d])/g;
        const found = [];
        lines.forEach((ln, i) => {
            let m;
            MONEY.lastIndex = 0;
            while ((m = MONEY.exec(' ' + ln)) !== null) {
                const v = Number(m[1].replace(/,/g, ''));
                if (v > 0) found.push({ v, i });
            }
        });
        if (!found.length) return null;
        // "จำนวน" มักอ่านเพี้ยน (จ้านวน / จํานวน) — จับแค่ท้ายคำ "นวน" หรือ Amount
        const k = lines.findIndex((ln) => /นวน|amount/i.test(ln));
        const after = k >= 0 ? found.find((f) => f.i >= k) : null;
        return (after || found[0]).v;
    }

    /** วันเวลาในสลิป — { y, m (null = อ่านเดือนไม่ออก), d, hh, mm } */
    function findDate(lines) {
        // บางธนาคารคั่นปีกับเวลาด้วยขีด/จุลภาค (กรุงไทย: "16 ก.ย. 2569 - 19:03")
        const RE = /(?:^|\D)(\d{1,2})\s*([^\d\s]{1,10}?)\s*(\d{4}|\d{2})\s*[-,]?\s+(\d{1,2})[:.](\d{2})(?!\d)/;
        for (const ln of lines) {
            const m = RE.exec(ln);
            if (!m) continue;
            const d = parseInt(m[1], 10), hh = parseInt(m[4], 10), mi = parseInt(m[5], 10);
            const y = yearOf(m[3]);
            if (d < 1 || d > 31 || hh > 23 || mi > 59 || !y || y < 2020 || y > 2100) continue;
            return { y, m: monthOf(m[2]), d, hh, mm: mi };
        }
        return null;
    }

    const money = (n) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pad = (n) => String(n).padStart(2, '0');

    /**
     * เทียบข้อความจาก OCR กับออเดอร์
     *   lines     [{ text }] หรือ [string] จาก OCR
     *   expect    { total, scannedAt, orderAt }
     * คืน { amount, date, dateText, checks: { amount, date }, notes[], verdict }
     *   checks.* = 'PASS' | 'FAIL' | 'UNKNOWN' · verdict = PASS | WARN | FAIL
     */
    function evaluate(lines, expect) {
        const txt = (lines || []).map((l) => (typeof l === 'string' ? l : l.text || ''))
            .map((s) => s.normalize('NFC').replace(/ํา/g, 'ำ'));   // ํา → ำ
        const notes = [];
        const checks = { amount: 'UNKNOWN', date: 'UNKNOWN' };

        const amount = findAmount(txt);
        if (amount != null && expect.total != null) {
            if (Math.abs(amount - Number(expect.total)) < 0.005) {
                checks.amount = 'PASS';
                notes.push('ยอดในสลิป ' + money(amount) + ' ตรงกับออเดอร์');
            } else {
                checks.amount = 'FAIL';
                notes.push('ยอดในสลิป ' + money(amount) + ' ไม่ตรงกับยอดออเดอร์ ' + money(expect.total));
            }
        } else {
            notes.push('อ่านยอดเงินในสลิปไม่ออก — ดูจากภาพเอง');
        }

        const dt = findDate(txt);
        let dateText = null;
        if (dt && expect.scannedAt) {
            const now = bkkParts(expect.scannedAt);
            dateText = dt.d + ' ' + (dt.m ? MONTH_TH[dt.m - 1] : '?') + ' ' + (dt.y + 543) +
                       ' ' + pad(dt.hh) + ':' + pad(dt.mm);
            const sameDay = dt.d === now.d && dt.y === now.y && (dt.m == null || dt.m === now.m);
            if (!sameDay) {
                checks.date = 'FAIL';
                notes.push('สลิปลงวันที่ ' + dateText + ' ไม่ใช่วันนี้');
            } else {
                // วันเดียวกัน → เวลาในสลิปต้องอยู่ระหว่างตอนสั่งออเดอร์ (เผื่อ 10 นาที) ถึงตอนสแกน (เผื่อ 3 นาที)
                const slipMin = dt.hh * 60 + dt.mm;
                const toMin = (t) => { const x = new Date(new Date(t).getTime() + TZ_OFFSET_MIN * 60000); return x.getUTCHours() * 60 + x.getUTCMinutes(); };
                const lo = expect.orderAt ? toMin(expect.orderAt) - 10 : -Infinity;
                const hi = toMin(expect.scannedAt) + 3;
                if (slipMin < lo || slipMin > hi) {
                    checks.date = 'FAIL';
                    notes.push('สลิปเวลา ' + pad(dt.hh) + ':' + pad(dt.mm) + ' ไม่ตรงกับช่วงที่สั่งออเดอร์นี้');
                } else {
                    checks.date = 'PASS';
                    notes.push('สลิปลงวันที่วันนี้ ' + pad(dt.hh) + ':' + pad(dt.mm));
                }
            }
        } else {
            notes.push('อ่านวันที่ในสลิปไม่ออก — ดูจากภาพเอง');
        }

        const verdict = checks.amount === 'FAIL' || checks.date === 'FAIL' ? 'FAIL'
            : checks.amount === 'PASS' && checks.date === 'PASS' ? 'PASS' : 'WARN';
        let txAt = null;
        if (dt && dt.m) {
            txAt = new Date(Date.UTC(dt.y, dt.m - 1, dt.d, dt.hh, dt.mm) - TZ_OFFSET_MIN * 60000).toISOString();
        }
        return { amount, txAt, dateText, checks, notes, verdict };
    }

    return { CFSlipRules: { evaluate, findAmount, findDate } };
});
