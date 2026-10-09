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
        // "ก" อ่านเพี้ยนเป็นตัว n (กรุงไทย "16 n.ย.") หรือเลข 0 (K PLUS "250ย." = 25 ก.ย.)
        // "ย" อ่านเป็นเลข 8 (กรุงไทยถ่ายจากจอ: "22 n.8. 2565" = 22 ก.ย.)
        // ตัด : , ด้วย — OCR อ่านจุดท้ายตัวย่อเป็น colon ("21 มี.ค: 69")
        const t = String(token || '').toLowerCase().replace(/[\s.:,]/g, '').replace(/8/g, 'ย').replace(/^[n0](?=[ก-๙])/, 'ก');
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

    /**
     * ยอดเงินในสลิป — ตัวแรกที่ไม่ใช่ 0 (0 คือค่าธรรมเนียม) · หลังคำว่า "จำนวน" ถ้าหาเจอ
     * รับสองรูปแบบ: มีทศนิยม "135.00" · ไม่มีทศนิยมแต่มีคำว่าบาทกำกับ "55 บาท" (บางแอป เช่นพร้อมเพย์กรุงไทย)
     * ตัวเลขเปล่า ๆ ที่ไม่มีบาทกำกับ (เลขบัญชี "5706" เลขที่รายการ) ห้ามนับ
     */
    /**
     * OCR ตัดยอดเงินเป็นสองกล่อง "80" | ".00 นาท" — ต่อกลับเป็นบรรทัดเดียวก่อนหา
     * (เจอจริงในสลิป K PLUS ที่ถ่ายเอียง 2 ใบจาก 16)
     */
    function joinSplitAmounts(lines) {
        const out = [];
        for (let i = 0; i < lines.length; i++) {
            const a = String(lines[i]), b = lines[i + 1] != null ? String(lines[i + 1]) : '';
            if (/^\s*\d{1,3}(?:,\d{3})*\s*$|^\s*\d{1,7}\s*$/.test(a) && /^\s*[.,]\d{2}(?!\d)/.test(b)) {
                out.push(a.trim() + b.trim().replace(/^,/, '.'));
                i++;
            } else out.push(a);
        }
        return out;
    }

    /**
     * ยอดที่ใช้จุดคั่นหลักพัน "3.000.00 บาท" (OCR อ่านจุลภาคเป็นจุด — เจอในสลิป K PLUS ชำระบิล)
     * → "3,000.00" · ต้องเป็นกลุ่มละ 3 หลักเป๊ะและปิดท้ายด้วย .ทศนิยม 2 หลัก วันที่/เวลาจึงไม่โดน
     */
    function dotThousands(ln) {
        return String(ln).replace(/(^|[^\d.,])(\d{1,3}(?:\.\d{3})+)\.(\d{2})(?!\d)/g,
            (m, pre, int, dec) => pre + int.replace(/\./g, ',') + '.' + dec);
    }

    function findAmount(lines) {
        lines = joinSplitAmounts(lines.map(dotThousands));
        const MONEY = /(?:^|[^\d.,])((?:\d{1,3}(?:,\d{3})+|\d{1,7})\.\d{2})(?![\d])/g;
        // "บาท" อ่านเพี้ยนบ่อย (บาn บาก) — จับแค่ "บา" ตามด้วยอะไรก็ได้ 0–1 ตัว
        // "บาท" อ่านเพี้ยนเป็น บาn บาก นาท — จับ บา / นาท / THB
        const BAHT = /^\s*(?:บา|นาท|thb)/i;
        const INT_BAHT = /(?:^|[^\d.,])((?:\d{1,3}(?:,\d{3})+|\d{1,7}))\s*(?:บา|นาท|thb)/gi;
        const found = [];
        lines.forEach((ln, i) => {
            let m;
            MONEY.lastIndex = 0;
            while ((m = MONEY.exec(' ' + ln)) !== null) {
                const v = Number(m[1].replace(/,/g, ''));
                if (v > 0) found.push({ v, i });
            }
            if (MONEY.test(' ' + ln)) return;
            INT_BAHT.lastIndex = 0;
            while ((m = INT_BAHT.exec(' ' + ln)) !== null) {
                const v = Number(m[1].replace(/,/g, ''));
                if (v > 0) found.push({ v, i });
            }
            // OCR แยก "55" กับ "บาท" เป็นคนละบรรทัด
            const bare = /^\s*((?:\d{1,3}(?:,\d{3})+|\d{1,7}))\s*$/.exec(ln);
            if (bare && lines[i + 1] && BAHT.test(lines[i + 1])) {
                const v = Number(bare[1].replace(/,/g, ''));
                if (v > 0) found.push({ v, i });
            }
        });
        if (!found.length) return null;
        // "จำนวน" มักอ่านเพี้ยน (จ้านวน / จํานวน) — จับแค่ท้ายคำ "นวน" หรือ Amount
        const k = lines.findIndex((ln) => /นวน|amount/i.test(ln));
        const after = k >= 0 ? found.find((f) => f.i >= k) : null;
        return (after || found[0]).v;
    }

    /**
     * วันที่จากเลขอ้างอิงใน QR ของสลิปกสิกร (ไม่ต้องอ่านภาพ) — ใช้เมื่อ OCR หาวันที่ไม่เจอ
     *   K PLUS  016 + วันที่ของปี 3 หลัก + HHMM   เช่น 016 268 1154… = วันที่ 268 (25 ก.ย.) 11:54
     *   make    046 + วันที่ของปี 3 หลัก            (เวลาไม่ได้อยู่ในเลข)
     * ยืนยันกับสลิปจริงแล้ว 6 ใบ (K PLUS 3 · make 3) — ธนาคารอื่นเลขเป็นแบบสุ่ม ใช้ไม่ได้
     */
    function refDate(ref, bankCode) {
        const m = /^0(1|4)6(\d{3})(\d{4})?/.exec(String(ref || ''));
        if (!m || (bankCode && bankCode !== '004')) return null;
        const doy = parseInt(m[2], 10);
        if (doy < 1 || doy > 366) return null;
        const out = { doy };
        if (m[1] === '1' && m[3]) {
            const hh = parseInt(m[3].slice(0, 2), 10), mm = parseInt(m[3].slice(2), 10);
            if (hh < 24 && mm < 60) { out.hh = hh; out.mm = mm; }
        }
        return out;
    }

    /** วันเวลาในสลิป — { y, m (null = อ่านเดือนไม่ออก), d, hh, mm } */
    function findDate(lines) {
        // บางธนาคารคั่นปีกับเวลาด้วยขีด/จุลภาค (กรุงไทย: "16 ก.ย. 2569 - 19:03")
        // ถ่ายจากจอ OCR ทำ ":" ในเวลาหาย ("- 2359") — ยอมเฉพาะเมื่อคั่นด้วยขีด ไม่งั้นเลขอื่นปนเป็นเวลาได้
        const RE = /(?:^|\D)(\d{1,2})\s*(0?[^\d\s](?:[^\d\s]|8){0,9}?)\s*(\d{4}|\d{2})(?:\s*[-,]\s*(\d{1,2})[:.]?(\d{2})|\s+(\d{1,2})[:.](\d{2}))(?!\d)/;
        // วันที่กับเวลาอยู่คนละกล่อง — ออมสิน/กรุงไทย "18 มี.ค.2569" | "16:35" · กสิกร "…วันที่21" | "มี.ค: 69 11:04 น."
        // ลองทีละบรรทัดก่อน ไม่เจอค่อยลองต่อบรรทัดที่ติดกันเป็นคู่ (ยังต้องผ่านเงื่อนไขวัน/ปี/เวลาเหมือนเดิม)
        const cands = lines.map(String);
        for (let i = 0; i + 1 < lines.length; i++) cands.push(lines[i] + ' ' + lines[i + 1]);
        for (const ln of cands) {
            const m = RE.exec(ln);
            if (!m) continue;
            const d = parseInt(m[1], 10), hh = parseInt(m[4] || m[6], 10), mi = parseInt(m[5] || m[7], 10);
            const y = yearOf(m[3]);
            if (d < 1 || d > 31 || hh > 23 || mi > 59 || !y || y < 2020 || y > 2100) continue;
            return { y, m: monthOf(m[2]), d, hh, mm: mi };
        }
        return null;
    }


    /* ══════════════════════════════════════════════════════════════
       คนโอน / ผู้รับ — ชื่อ · ธนาคาร · เลขท้ายบัญชี
       ══════════════════════════════════════════════════════════════
       สลิปไทยมีสองแบบ (ดูจากสลิปจริง):
         ก. make / K PLUS   ชื่อ → เลขบัญชีปิดบางหลัก  คู่แรก = คนโอน · คู่ที่สอง = ผู้รับ
         ข. SCB / กรุงไทย   มีคำว่า "จาก" / "ไปยัง" กำกับ · บางใบชื่อผู้รับอยู่ "หลัง" เลขบัญชี
       เลขบัญชีเชื่อได้กว่าชื่อ (ตัวเลขอ่านแม่นกว่าอักษรไทย) — ใช้เลขเป็นหลักตอนเทียบกับบัญชีร้าน */

    const BANK_NAMES = [
        ['กสิกรไทย', 'กสิกร', 'kbank', 'k plus', 'make'], ['กรุงไทย', 'krungthai', 'ktb'],
        ['ไทยพาณิชย์', 'scb'], ['กรุงเทพ', 'bangkok bank', 'bbl'], ['กรุงศรี', 'krungsri'],
        ['ทีทีบี', 'ttb'], ['ออมสิน', 'gsb', 'mymo'], ['ธ.ก.ส.', 'baac'], ['ซีไอเอ็มบี', 'cimb'],
        ['ยูโอบี', 'uob'], ['เกียรตินาคินภัทร', 'kkp'], ['แลนด์ แอนด์ เฮ้าส์', 'lh bank'],
        ['พร้อมเพย์', 'promptpay', 'prompt'], ['ทรูมันนี่', 'truemoney'],
    ];
    // วรรณยุกต์/สระบนล่างหายหรือผิดบ่อยใน OCR — ตัดทิ้งก่อนเทียบคำ
    const bare = (s) => String(s || '').toLowerCase().replace(/[\u0e31\u0e34-\u0e3a\u0e47-\u0e4e.\s]/g, '');
    const BANK_BARE = BANK_NAMES.map((names) => ({ name: names[0], keys: names.map(bare).filter((k) => k.length >= 3) }));

    function bankOf(line) {
        const b = bare(line).replace(/^ธ/, '');
        if (b.length < 3) return null;
        const hit = BANK_BARE.find((x) => x.keys.some((k) => b === k || (b.includes(k) && b.length <= k.length + 4)));
        return hit ? hit.name : null;
    }

    /** เลขบัญชี/พร้อมเพย์ที่ปิดบางหลัก เช่น xxx-x-x8204-x · XXX-X-X2811-x · ****** 5706 */
    const MASKED = /[xX×*]{2,}|(?:[xX×*][-\s]?){3,}/;
    function tailOf(line) {
        if (!MASKED.test(line)) return null;
        const d = String(line).replace(/\D/g, '');
        return d.length >= 3 && d.length <= 6 ? d : null;
    }

    const NAME_PREFIX = /^(นาย|นางสาว|นาง|น\.ส\.?|ด\.ช\.|ด\.ญ\.|บจก\.?|บริษัท|หจก\.?|ร้าน)/;
    const NOT_NAME = /สำเร็จ|รายการ|จำนวน|ค่าธรรม|บันทึก|สแกน|อ้างอิง|พร้อมเพย์|biller|รหัส|เลขที่|by kbank|ตรวจสอบ|แชร์|บาท|จาก|ไปยัง|ผู้รับเงิน/i;

    /** บรรทัดนี้หน้าตาเป็นชื่อคน/ร้านไหม — มีอักษรไทย ≥3 ตัว ไม่ใช่ป้ายหรือชื่อธนาคาร */
    function nameish(line) {
        const s = String(line || '').trim();
        if (!s || NOT_NAME.test(s) || bankOf(s) || tailOf(s)) return false;
        if (/\d{3,}/.test(s)) return false;
        return (s.match(/[\u0e01-\u0e2e]/g) || []).length >= 3;
    }
    const cleanName = (s) => String(s || '').replace(/\s*[*•]+\s*$/, '').replace(/\s+/g, ' ').trim();

    /** หาชื่อที่ใกล้เลขบัญชีที่สุด — ให้ชื่อที่มีคำนำหน้า (นาย/น.ส./ร้าน) ก่อน · ห้ามข้ามเส้นแบ่ง */
    function nameNear(txt, i, lo, hi) {
        let best = null;
        for (let k = i - 1; k >= Math.max(lo, i - 5); k--) {
            if (!nameish(txt[k])) continue;
            if (NAME_PREFIX.test(txt[k].trim())) return cleanName(txt[k]);
            if (!best) best = cleanName(txt[k]);
        }
        if (best) return best;
        for (let k = i + 1; k <= Math.min(hi, i + 2); k++) if (nameish(txt[k])) return cleanName(txt[k]);
        return null;
    }

    function bankNear(txt, lo, hi) {
        for (let k = lo; k <= hi; k++) { const b = bankOf(txt[k]); if (b) return b; }
        return null;
    }

    function findParties(txt) {
        const n = txt.length;
        const iFrom = txt.findIndex((l) => /^จาก\b|^จาก$|^from$/i.test(String(l).trim()));
        const iTo = txt.findIndex((l) => /^ไปยัง|^ไป$|^to$/i.test(String(l).trim()));
        const party = (lo, hi) => {
            let tail = null, tailAt = -1;
            for (let k = lo; k <= hi; k++) { const t = tailOf(txt[k]); if (t) { tail = t; tailAt = k; break; } }
            let name = null;
            if (tailAt >= 0) name = nameNear(txt, tailAt, lo, hi);
            if (!name) for (let k = lo; k <= hi; k++) if (nameish(txt[k])) { name = cleanName(txt[k]); break; }
            if (!name && !tail) return null;
            return { name, tail, bank: bankNear(txt, lo, hi) };
        };

        // แบบ ข. — มีป้าย จาก / ไปยัง
        if (iFrom >= 0 && iTo > iFrom) {
            return { sender: party(iFrom + 1, iTo - 1), receiver: party(iTo + 1, Math.min(n - 1, iTo + 5)) };
        }

        // แบบ ก. — จับคู่ชื่อกับเลขบัญชีตามลำดับ
        const tails = [];
        txt.forEach((l, i) => { if (tailOf(l)) tails.push(i); });
        const at = (ti, prev, next) => {
            const lo = prev == null ? Math.max(0, ti - 5) : prev + 1;
            const hi = next == null ? Math.min(n - 1, ti + 2) : next - 1;
            return { name: nameNear(txt, ti, lo, hi), tail: tailOf(txt[ti]), bank: bankNear(txt, lo, ti + 1) };
        };
        if (tails.length >= 2) {
            return { sender: at(tails[0], null, tails[1]), receiver: at(tails[1], tails[0], null) };
        }
        if (tails.length === 1) {
            // เจอคู่เดียว (อีกฝั่งหลุดกรอบ) — ถ้าอยู่หลังป้าย "จาก" คือคนโอน ไม่งั้นถือว่าเป็นผู้รับ
            const p = at(tails[0], null, null);
            return iFrom >= 0 && iFrom < tails[0] ? { sender: p, receiver: null } : { sender: null, receiver: p };
        }
        return { sender: null, receiver: null };
    }

    /** เทียบชื่อแบบยอมให้ OCR เพี้ยน — ตัดคำนำหน้า วรรณยุกต์ แล้วดูว่าขึ้นต้นตรงกันหรือต่างกันน้อย */
    function nameMatch(a, b) {
        const norm = (s) => bare(String(s || '').replace(NAME_PREFIX, ''));
        const x = norm(a), y = norm(b);
        if (x.length < 3 || y.length < 3) return false;
        if (x.includes(y) || y.includes(x)) return true;
        if (x.length >= 4 && y.startsWith(x.slice(0, Math.max(4, x.length - 1)))) return true;   // ชื่อถูกปิดท้าย "รัชฎา น"
        if (y.length >= 4 && x.startsWith(y.slice(0, Math.max(4, y.length - 1)))) return true;
        // ระยะแก้ไข ≤ 20% ของความยาว
        const d = Array.from({ length: x.length + 1 }, (_, i) => [i]);
        for (let j = 1; j <= y.length; j++) d[0][j] = j;
        for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) {
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
        }
        return d[x.length][y.length] <= Math.max(1, Math.floor(Math.max(x.length, y.length) * 0.2));
    }

    /**
     * ผู้รับเงินคือร้านเราไหม
     *   shop = { name, accounts: ['0801865706', '1234582045'] }  (ไม่ได้ตั้งไว้ → SKIP)
     * เลขท้ายบัญชีตรง = ผ่าน · เลขมีแต่ไม่ตรงทุกบัญชี = ไม่ผ่าน (ตัวเลขเชื่อได้)
     * ไม่มีเลข → ใช้ชื่อ: ตรง = ผ่าน · อ่านชื่อได้แต่ไม่ตรง = ไม่ผ่าน · ไม่เห็นผู้รับ = ไม่รู้
     */
    function receiverCheck(receiver, shop) {
        const accounts = ((shop && shop.accounts) || []).map((a) => String(a).replace(/\D/g, '')).filter((a) => a.length >= 4);
        const shopName = shop && shop.name ? String(shop.name).trim() : '';
        if (!accounts.length && !shopName) return 'SKIP';
        if (!receiver || (!receiver.name && !receiver.tail)) return 'UNKNOWN';
        if (receiver.tail && accounts.length) {
            if (accounts.some((a) => a.includes(receiver.tail))) return 'PASS';
            if (!shopName || !receiver.name || !nameMatch(receiver.name, shopName)) return 'FAIL';
            return 'PASS';
        }
        if (receiver.name && shopName) return nameMatch(receiver.name, shopName) ? 'PASS' : 'FAIL';
        return 'UNKNOWN';
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

        let dt = findDate(txt);
        let dateText = null, dateFromRef = false;
        // OCR หาวันที่ไม่เจอ → ลองจากเลขอ้างอิงใน QR (สลิปกสิกร) ซึ่งแม่นกว่าอ่านภาพ
        if (!dt && expect.ref && expect.scannedAt) {
            const rd = refDate(expect.ref, expect.bankCode);
            if (rd) {
                const now = bkkParts(expect.scannedAt);
                const jan1 = Date.UTC(now.y, 0, 1);
                let y = now.y;
                if (rd.doy > Math.floor((Date.UTC(now.y, now.m - 1, now.d) - jan1) / 86400000) + 1) y--;   // ปลายปีเก่า
                const day = new Date(Date.UTC(y, 0, 1) + (rd.doy - 1) * 86400000);
                dt = { y, m: day.getUTCMonth() + 1, d: day.getUTCDate(),
                       hh: rd.hh != null ? rd.hh : null, mm: rd.mm != null ? rd.mm : null };
                dateFromRef = true;
            }
        }
        if (dt && expect.scannedAt) {
            const now = bkkParts(expect.scannedAt);
            dateText = dt.d + ' ' + (dt.m ? MONTH_TH[dt.m - 1] : '?') + ' ' + (dt.y + 543) +
                       (dt.hh != null ? ' ' + pad(dt.hh) + ':' + pad(dt.mm) : '') +
                       (dateFromRef ? ' (จากเลขอ้างอิง)' : '');
            const sameDay = dt.d === now.d && dt.y === now.y && (dt.m == null || dt.m === now.m);
            if (dt.hh == null) {
                // เลขอ้างอิงของ make บอกแค่วัน ไม่บอกเวลา — วันเดียวกันถือว่าผ่าน
                checks.date = sameDay ? 'PASS' : 'FAIL';
                notes.push(sameDay ? 'สลิปลงวันที่วันนี้' + (dateFromRef ? ' (จากเลขอ้างอิง)' : '')
                                   : 'สลิปลงวันที่ ' + dateText + ' ไม่ใช่วันนี้');
            } else {
                // เวลาในสลิปต้อง "หลังร้านออก QR" (เผื่อนาฬิกาคลาด 2 นาที) ถึงตอนสแกน (เผื่อ 3 นาที)
                // ★ ขอบบนคือเวลาสแกน ไม่ใช่เวลาที่ QR หมดอายุ — QR พร้อมเพย์ไม่มีวันหมดอายุในระบบธนาคาร
                //   ลูกค้าที่โอนช้ากว่าเวลานับถอยหลังก็ยังเป็นการจ่ายจริง ต้องผ่าน
                // เทียบเป็นเวลาเต็ม ไม่ใช่นาทีของวัน — โอน 23:59 สแกน 00:00 ต้องผ่าน
                const MIN = 60000;
                const slipAt = Date.UTC(dt.y, (dt.m || now.m) - 1, dt.d, dt.hh, dt.mm) - TZ_OFFSET_MIN * MIN;
                const ms = (t) => new Date(t).getTime();
                const lo = expect.qrAt ? ms(expect.qrAt) - 2 * MIN
                    : expect.orderAt ? ms(expect.orderAt) - 10 * MIN : null;
                const hi = ms(expect.scannedAt) + 3 * MIN;
                const inWindow = slipAt <= hi && (lo != null ? slipAt >= lo : sameDay);
                if (inWindow) {
                    checks.date = 'PASS';
                    notes.push('สลิปลงวันที่ ' + (sameDay ? 'วันนี้ ' + pad(dt.hh) + ':' + pad(dt.mm) : dateText) +
                               (dateFromRef && sameDay ? ' (จากเลขอ้างอิง)' : ''));
                } else if (!sameDay && Math.abs(slipAt - ms(expect.scannedAt)) > 60 * MIN) {
                    checks.date = 'FAIL';
                    notes.push('สลิปลงวันที่ ' + dateText + ' ไม่ใช่วันนี้');
                } else {
                    checks.date = 'FAIL';
                    notes.push('สลิปเวลา ' + pad(dt.hh) + ':' + pad(dt.mm) + (lo != null && slipAt < lo && expect.qrAt
                        ? ' ก่อนร้านออก QR ให้ออเดอร์นี้ — ไม่ใช่การจ่ายของออเดอร์นี้'
                        : ' ไม่ตรงกับช่วงที่สั่งออเดอร์นี้'));
                }
            }
        } else {
            notes.push('อ่านวันที่ในสลิปไม่ออก — ดูจากภาพเอง');
        }

        // คนโอน / ผู้รับ — notes[2] เสมอ (หน้าจอหยิบข้อความตามตำแหน่ง: 0 ยอด · 1 วันที่ · 2 ผู้รับ)
        const parties = findParties(txt);
        checks.receiver = receiverCheck(parties.receiver, expect.shop);
        const rv = parties.receiver || {};
        const who = [rv.name, rv.tail ? 'บัญชีลงท้าย ' + rv.tail : null].filter(Boolean).join(' · ');
        notes.push(checks.receiver === 'PASS' ? 'โอนเข้าบัญชีร้าน (' + who + ')'
            : checks.receiver === 'FAIL' ? 'ผู้รับเงินคือ ' + who + ' — ไม่ใช่บัญชีร้าน'
            : checks.receiver === 'UNKNOWN' ? 'ไม่เห็นชื่อผู้รับเงิน — ดูจากภาพเอง' : '');

        const all = [checks.amount, checks.date, checks.receiver];
        const verdict = all.includes('FAIL') ? 'FAIL'
            : checks.amount === 'PASS' && checks.date === 'PASS' && ['PASS', 'SKIP'].includes(checks.receiver) ? 'PASS' : 'WARN';
        let txAt = null;
        if (dt && dt.m && dt.hh != null) {
            txAt = new Date(Date.UTC(dt.y, dt.m - 1, dt.d, dt.hh, dt.mm) - TZ_OFFSET_MIN * 60000).toISOString();
        }
        return { amount, txAt, dateText, checks, notes, verdict,
                 sender: parties.sender, receiver: parties.receiver };
    }

    return { CFSlipRules: { evaluate, findAmount, findDate, findParties, receiverCheck, nameMatch, bankOf, refDate } };
});
