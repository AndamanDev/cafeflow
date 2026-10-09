/**
 * CafeFlow — วาดเอกสารลงบิตแมปสำหรับเครื่องพิมพ์ความร้อน
 * ══════════════════════════════════════════════════════════════════
 * ที่ 203 dpi (มาตรฐานของเครื่องพิมพ์ใบเสร็จ):
 *   กระดาษ 58 มม. → พิมพ์ได้จริงราว 48 มม. = 384 จุด
 *   กระดาษ 80 มม. → พิมพ์ได้จริงราว 72 มม. = 576 จุด
 *
 * ★ 58 มม. ไม่ใช่ 80 มม. ที่ย่อลง — พื้นที่แคบกว่าจนต้องจัดบรรทัดคนละแบบ
 *   ชื่อสินค้าต้องขึ้นบรรทัดของตัวเอง และใช้ตัวย่อของตัวเลือก
 *   **ยกเว้นสลิปครัว ที่ต้องสะกดเต็มคำเสมอ** เพราะครัวใช้ตัดสินใจผลิต
 *   อ่านผิดหนึ่งคำแปลว่าทำผิดหนึ่งแก้ว
 */
'use strict';
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const WIDTH = { '58mm': 384, '80mm': 576 };

/** ฟอนต์ไทยที่ใช้ได้ เรียงตามความชอบ — เลือกตัวแรกที่เครื่องมีจริง */
const THAI_FONTS = ['Leelawadee UI', 'TH SarabunPSK', 'Tahoma', 'Leelawadee', 'Angsana New'];
let FONT = null;
function fontFamily() {
    if (FONT) return FONT;
    const have = new Set(GlobalFonts.families.map((f) => f.family));
    FONT = THAI_FONTS.find((f) => have.has(f)) || 'sans-serif';
    if (FONT === 'sans-serif') {
        console.warn('[print] ไม่พบฟอนต์ไทยในเครื่อง — ใบเสร็จอาจเป็นสี่เหลี่ยม');
    }
    return FONT;
}

/**
 * ตัวช่วยวาดแบบไหลลงทีละบรรทัด
 * วาดสองรอบ: รอบแรกวัดความสูงที่ต้องใช้ รอบสองวาดจริง
 * เพราะกระดาษม้วนไม่มีความสูงตายตัว ต้องรู้ก่อนว่าจะยาวเท่าไหร่
 */
const SEGMENTER = new Intl.Segmenter('th', { granularity: 'word' });
const GRAPHEMES = new Intl.Segmenter('th', { granularity: 'grapheme' });

function createSheet(widthDots) {
    const measure = createCanvas(1, 1).getContext('2d');    // วัดความกว้างตอนจัดบรรทัด
    let y = 0;
    const ops = [];
    const pad = Math.round(widthDots * 0.03);
    const inner = widthDots - pad * 2;

    const api = {
        get y() { return y; },
        gap(px) { y += px; return api; },

        line(text, o = {}) {
            const size = o.size || 22;
            const weight = o.bold ? '700 ' : '';
            const align = o.align || 'left';
            ops.push({ t: 'text', text: String(text), size, weight, align, y, pad, inner });
            y += Math.round(size * (o.lh || 1.45));
            return api;
        },

        /**
         * ข้อความยาวที่ต้องอ่านครบทุกคำ — ตัดขึ้นบรรทัดใหม่แทนการตัดทิ้ง
         * ตัดตามคำไทย (Intl.Segmenter) ไม่ตัดกลางคำหรือแยกสระ/วรรณยุกต์ออกจากพยัญชนะ
         * hang = ระยะเยื้องของบรรทัดต่อ ๆ ไป เช่นให้ชื่อเมนูบรรทัดสองตรงกับตัวแรกหลัง "1 × "
         */
        wrap(text, o = {}) {
            const size = o.size || 22;
            const weight = o.bold ? '700 ' : '';
            const indent = o.indent || 0;
            measure.font = `${weight}${size}px "${fontFamily()}"`;
            const hang = typeof o.hang === 'string' ? measure.measureText(o.hang).width : (o.hang || 0);
            // right = ข้อความชิดขวาบนบรรทัดแรก (เช่น ราคา) — บรรทัดแรกเว้นที่ให้มัน ชื่อยาวขึ้นบรรทัดใหม่ ไม่ทับราคา
            const right = o.right != null ? String(o.right) : null;
            const reserve = right ? measure.measureText(right).width + 14 : 0;

            const words = [...SEGMENTER.segment(String(text))].map((x) => x.segment);
            const lines = [];
            let cur = '';
            const room = () => inner - indent - (lines.length ? hang : reserve);
            for (const w of words) {
                if (!cur && !w.trim()) continue;                   // ไม่ขึ้นบรรทัดด้วยช่องว่าง
                if (measure.measureText(cur + w).width <= room()) { cur += w; continue; }
                if (cur) { lines.push(cur.trimEnd()); cur = ''; if (!w.trim()) continue; }
                // คำเดียวยาวเกินบรรทัด — ค่อยตัดทีละตัวอักษร (ยังไม่แยกสระออกจากพยัญชนะ)
                for (const g of [...GRAPHEMES.segment(w)].map((x) => x.segment)) {
                    if (cur && measure.measureText(cur + g).width > room()) { lines.push(cur); cur = ''; }
                    cur += g;
                }
            }
            if (cur.trim()) lines.push(cur.trimEnd());

            lines.forEach((ln, i) => {
                const off = indent + (i ? hang : 0);
                if (i === 0 && right) {
                    ops.push({ t: 'row', left: ln, right, size, weight, y, pad: pad + off, inner: inner - off });
                } else {
                    ops.push({ t: 'text', text: ln, size, weight, align: o.align || 'left', y,
                               pad: pad + off, inner: inner - off });
                }
                y += Math.round(size * (o.lh || 1.3));
            });
            if (lines.length) y += Math.round(size * ((o.lh || 1.45) - (o.lh || 1.3)));
            return api;
        },

        /** ซ้าย-ขวาในบรรทัดเดียว เช่น ชื่อรายการกับราคา */
        row(left, right, o = {}) {
            const size = o.size || 22;
            ops.push({ t: 'row', left: String(left), right: String(right),
                       size, weight: o.bold ? '700 ' : '', y, pad, inner });
            y += Math.round(size * (o.lh || 1.45));
            return api;
        },

        rule(o = {}) {
            ops.push({ t: 'rule', y, pad, inner, dashed: !!o.dashed, thick: !!o.thick });
            y += o.thick ? 16 : 14;
            return api;
        },

        /**
         * แถบดำตัวขาว — สิ่งที่ห้ามพลาดบนสลิป เช่น "กลับบ้าน" ชื่อสถานี หรือสถานะการจ่าย
         * มองจากระยะแขนเห็นทันที (มาตรฐานสลิปครัวของ POS ทั่วไป)
         */
        banner(text, o = {}) {
            const size = o.size || 24;
            const h = Math.round(size * 1.55);
            ops.push({ t: 'banner', text: String(text), size, weight: o.bold === false ? '' : '700 ', y, h, pad, inner });
            y += h + (o.after != null ? o.after : 8);
            return api;
        },

        render() {
            const height = Math.max(8, y + pad);
            // ปัดความสูงขึ้นให้ลงตัว เผื่อการซอยแถบของ GS v 0
            const canvas = createCanvas(widthDots, height);
            const c = canvas.getContext('2d');
            c.fillStyle = '#fff';
            c.fillRect(0, 0, widthDots, height);
            c.fillStyle = '#000';
            c.textBaseline = 'top';
            const fam = fontFamily();

            for (const op of ops) {
                if (op.t === 'banner') {
                    c.fillStyle = '#000';
                    c.fillRect(op.pad, op.y, op.inner, op.h);
                    c.fillStyle = '#fff';
                    c.font = `${op.weight}${op.size}px "${fam}"`;
                    const w = c.measureText(op.text).width;
                    c.fillText(op.text, op.pad + (op.inner - w) / 2, op.y + (op.h - op.size * 1.12) / 2);
                    c.fillStyle = '#000';
                    continue;
                }
                if (op.t === 'rule') {
                    c.save();
                    if (op.dashed) c.setLineDash([4, 4]);
                    c.strokeStyle = '#000';
                    c.lineWidth = op.thick ? 4 : 2;
                    c.beginPath();
                    c.moveTo(op.pad, op.y + 6);
                    c.lineTo(op.pad + op.inner, op.y + 6);
                    c.stroke();
                    c.restore();
                    continue;
                }
                c.font = `${op.weight}${op.size}px "${fam}"`;
                if (op.t === 'text') {
                    const w = c.measureText(op.text).width;
                    const x = op.align === 'center' ? op.pad + (op.inner - w) / 2
                            : op.align === 'right' ? op.pad + op.inner - w : op.pad;
                    c.fillText(op.text, x, op.y);
                } else {
                    const rw = c.measureText(op.right).width;
                    // ชื่อยาวเกินต้องถูกตัด ไม่ใช่ทับราคา — ราคาคือสิ่งที่ห้ามอ่านผิด
                    let left = op.left;
                    const room = op.inner - rw - 10;
                    while (left.length > 1 && c.measureText(left).width > room) {
                        left = left.slice(0, -1);
                    }
                    if (left !== op.left) left = left.slice(0, -1) + '…';
                    c.fillText(left, op.pad, op.y);
                    c.fillText(op.right, op.pad + op.inner - rw, op.y);
                }
            }
            return { canvas, width: widthDots, height };
        },
    };
    return api;
}

/**
 * แปลงภาพเป็นบิตแมป 1 บิต (1 = จุดดำ)
 * ใช้เกณฑ์ตัดง่าย ๆ ไม่ทำ dithering เพราะเอกสารเป็นตัวอักษรล้วน
 * dithering จะทำให้ตัวหนังสือเล็กอ่านยากขึ้นแทนที่จะดีขึ้น
 */
function toBits(canvas, width, height) {
    const data = canvas.getContext('2d').getImageData(0, 0, width, height).data;
    const bytesPerRow = width / 8;
    const out = Buffer.alloc(bytesPerRow * height, 0);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            // ถ่วงน้ำหนักตามการรับรู้ความสว่างของตา
            const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            // เกณฑ์ 200 ไม่ใช่ 128 — สระ/วรรณยุกต์ของตัวเล็ก (17–18px) เป็นเส้นบางที่ขอบเทา ๆ
            // ตัดที่ 128 แล้ว ำ ี ่ หายจริงบนใบพิมพ์ (ประจำ→ประจา, วันที่→วันที) · 200 ยังคมและหนาขึ้นบนกระดาษความร้อน
            if (lum < 200) out[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
        }
    }
    return out;
}

/**
 * แถวจากฐานเป็น snake_case ส่วนรูปทรงที่หน้าเว็บใช้เป็น camelCase
 * ตัวช่วยนี้รับได้ทั้งสองแบบ — เคยพลาดตรงนี้จนเลขออเดอร์บนสลิปครัวเป็น
 * "undefined" ซึ่งเป็นสิ่งเดียวที่ครัวใช้จับคู่ตั๋วกับลูกค้า
 */
const pick = (o, ...keys) => {
    for (const k of keys) if (o && o[k] != null && o[k] !== '') return o[k];
    return null;
};

const money = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2,
                                                             maximumFractionDigits: 2 });
const clock = (d) => new Date(d).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit',
                                                               second: '2-digit', hour12: false });
const dateTime = (d) => new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

/* ══════════════════════════════════════════════════════════════════
   แบบใบพิมพ์ — ยึดหน้าตามาตรฐาน POS ร้านกาแฟทั่วไป (Loyverse / Ocha / FoodStory)
   · ชื่อเมนูกับตัวเลือกสะกดเต็มคำเสมอ (ไม่ใช้ตัวย่อ) · ยาวก็ตัดบรรทัด ไม่ตัดทิ้ง
   · ตัวเลือกขึ้นบรรทัดของตัวเอง นำด้วย "-" เยื้องใต้ชื่อเมนู
   · ราคาชิดขวาตรงกันทุกบรรทัด
   ══════════════════════════════════════════════════════════════════ */
const SERVE_TH = { HOT: 'ร้อน', ICED: 'เย็น', FRAPPE: 'ปั่น' };
const itemName = (it) => {
    const serve = SERVE_TH[pick(it, 'serveType', 'serve_type')];
    return pick(it, 'nameSnapshot', 'name_snapshot') + (serve ? ` (${serve})` : '');
};
const modsOf = (it) => (it.mods || []).map((m) => ({
    label: pick(m, 'label', 'shortLabel', 'short_label'),
    delta: Number(pick(m, 'priceDelta', 'price_delta') || 0),
})).filter((m) => m.label);
const whole = (n) => (Number(n) % 1 ? money(n) : String(Number(n)));     // +20 ไม่ใช่ +20.00 ในวงเล็บตัวเลือก
const diningTh = (o) => (pick(o, 'diningOption', 'dining_option') === 'TAKE_AWAY' ? 'กลับบ้าน' : 'กินที่ร้าน');

/* ══════════════════════════════════════════════════════════════════
   สลิปครัว (§19) — ครัวอ่านจากระยะแขน: สถานีแถบดำ · เลขคิวตัวใหญ่ · "กลับบ้าน" แถบดำ
   ไม่มีราคา (ครัวไม่ต้องรู้) · สะกดเต็มคำเสมอ ไม่ว่ากระดาษจะแคบแค่ไหน
   ══════════════════════════════════════════════════════════════════ */
function kitchenSlip({ order, items, station, stationLabel, width = '58mm', dots }) {
    const W = dots || WIDTH[width] || WIDTH['58mm'];
    const narrow = W < 500;
    const s = createSheet(W);
    const big = narrow ? 26 : 30;
    const when = pick(order, 'sentAt', 'sent_at', 'createdAt', 'created_at') || Date.now();
    const kiosk = pick(order, 'kioskId', 'kiosk_id');

    s.banner(stationLabel || station, { size: narrow ? 22 : 24 });
    s.line('คิว ' + (pick(order, 'orderNo', 'order_no') || '—'),
           { size: narrow ? 46 : 56, bold: true, align: 'center', lh: 1.2 });
    if (diningTh(order) === 'กลับบ้าน') s.banner('กลับบ้าน', { size: big });
    else s.line('กินที่ร้าน', { size: big - 4, bold: true, align: 'center' });
    s.row(kiosk ? 'สั่งที่ ' + kiosk : '', 'เวลา ' + clock(when), { size: 18 });
    s.rule({ thick: true });

    let count = 0;
    items.forEach((it, i) => {
        const qty = `${it.qty} x `;
        count += Number(it.qty) || 0;
        s.wrap(qty + itemName(it), { size: big, bold: true, hang: qty, lh: 1.25 });
        for (const m of modsOf(it)) {
            s.wrap('- ' + m.label, { size: narrow ? 21 : 23, indent: Math.round(big * 1.2), hang: '- ', lh: 1.3 });
        }
        if (i < items.length - 1) { s.gap(2); s.rule({ dashed: true }); }
    });

    s.rule({ thick: true });
    s.row(`รวม ${count} รายการ`, 'พิมพ์ ' + clock(Date.now()), { size: 18 });
    const { canvas, height } = s.render();
    return { bitmap: toBits(canvas, W, height), width: W, height, canvas };
}

/** หัวร้าน — ชื่อ · ที่อยู่ · โทร · เลขผู้เสียภาษี (บรรทัดที่ไม่มีข้อมูลไม่พิมพ์) */
function shopHeader(s, branch, settings, narrow) {
    s.wrap(branch.name_th || '', { size: narrow ? 28 : 32, bold: true, align: 'center', lh: 1.3 });
    if (branch.address) s.wrap(branch.address, { size: narrow ? 16 : 18, align: 'center', lh: 1.25 });
    if (settings && settings.shopPhone) s.line('โทร ' + settings.shopPhone, { size: narrow ? 16 : 18, align: 'center', lh: 1.35 });
    if (branch.tax_id) s.line('เลขประจำตัวผู้เสียภาษี ' + branch.tax_id, { size: narrow ? 16 : 17, align: 'center', lh: 1.35 });
}

/** ท้ายใบ — ขอบคุณ + ข้อความที่ร้านตั้ง (Wi-Fi / LINE / IG) */
function shopFooter(s, settings, narrow) {
    s.line('ขอบคุณที่ใช้บริการ', { size: narrow ? 21 : 23, bold: true, align: 'center' });
    const foot = String((settings && settings.receiptFooter) || '').trim();
    for (const ln of foot.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 4)) {
        s.wrap(ln, { size: narrow ? 16 : 18, align: 'center', lh: 1.3 });
    }
}

/* ══════════════════════════════════════════════════════════════════
   ใบเสร็จรับเงิน
   บรรทัดภาษีพิมพ์เฉพาะสาขาที่จด VAT (branch.vat_registered)
   ร้านที่ไม่ได้จดแต่ออกใบที่แสดงยอดภาษี = เรียกเก็บภาษีโดยไม่มีสิทธิ์
   ⚠️ แม่แบบเดียวกับ CFDocs.receiptRoll (ทางสำรองผ่านเบราว์เซอร์) — แก้ที่หนึ่งต้องแก้อีกที่
   ══════════════════════════════════════════════════════════════════ */
function receipt({ order, items, payment, branch, width = '80mm', cashier, dots, settings }) {
    const W = dots || WIDTH[width] || WIDTH['80mm'];
    const narrow = W < 500;           // 58 มม. (360–384 จุด) — 80 มม. ที่ 180 dpi ได้ 512 ยังนับเป็นกว้าง
    const s = createSheet(W);
    const base = narrow ? 20 : 22;
    const vat = !!branch.vat_registered;

    shopHeader(s, branch, settings, narrow);
    s.gap(4);
    s.line(vat ? 'ใบเสร็จรับเงิน/ใบกำกับภาษีอย่างย่อ' : 'ใบเสร็จรับเงิน',
           { size: base + 2, bold: true, align: 'center' });
    s.rule();

    s.row('เลขที่', pick(order, 'id') || '—', { size: base - 2 });
    s.row('วันที่', dateTime(pick(order, 'paidAt', 'paid_at', 'createdAt', 'created_at')), { size: base - 2 });
    s.row('คิว', (pick(order, 'orderNo', 'order_no') || '—') + ' · ' + diningTh(order), { size: base - 2 });
    if (cashier) s.row('พนักงาน', cashier, { size: base - 2 });
    s.rule({ dashed: true });

    let count = 0;
    for (const it of items) {
        const qty = `${it.qty} x `;
        count += Number(it.qty) || 0;
        s.wrap(qty + itemName(it), { size: base, hang: qty, right: money(it.qty * pick(it, 'unitPrice', 'unit_price')), lh: 1.3 });
        for (const m of modsOf(it)) {
            s.wrap('- ' + m.label + (m.delta ? ` (+${whole(m.delta)})` : ''),
                   { size: narrow ? 16 : 18, indent: Math.round(base * 1.4), hang: '- ', lh: 1.3 });
        }
    }
    s.rule({ dashed: true });

    const subtotal = Number(pick(order, 'subtotal') != null ? order.subtotal : order.total);
    const discount = Number(pick(order, 'discount') || 0);
    s.row(`รวม ${count} รายการ`, money(subtotal), { size: base });
    if (discount > 0) s.row('ส่วนลด', '-' + money(discount), { size: base });
    if (vat) {
        // ?? ไม่ใช่ || — ร้านที่ตั้ง 0% (อัตราศูนย์) ต้องพิมพ์ 0% ไม่ใช่ 7%
        const rate = Number(branch.vat_percent ?? 7);
        const v = Number(order.total) - Number(order.total) / (1 + rate / 100);
        s.row(`มูลค่าก่อนภาษี`, money(Number(order.total) - v), { size: narrow ? 17 : 18 });
        s.row(`ภาษีมูลค่าเพิ่ม ${rate}%`, money(v), { size: narrow ? 17 : 18 });
    }
    s.rule();
    s.row('ยอดสุทธิ', '฿' + money(order.total), { size: base + 8, bold: true, lh: 1.4 });
    s.rule();

    if (payment) {
        s.row(payment.method === 'CASH' ? 'ชำระด้วยเงินสด' : 'ชำระด้วย QR พร้อมเพย์', money(payment.amount), { size: base });
        if (payment.received != null) {
            s.row('รับเงิน', money(payment.received), { size: base });
            s.row('เงินทอน', money(pick(payment, 'change', 'change_amount')), { size: base, bold: true });
        }
        if (payment.ref) s.line('อ้างอิง ' + payment.ref, { size: 16 });
        s.rule({ dashed: true });
    }

    shopFooter(s, settings, narrow);
    const rp = pick(order, 'reprintCount', 'reprint_count');
    if (rp > 0) s.line(`สำเนา — พิมพ์ซ้ำครั้งที่ ${rp}`, { size: 16, align: 'center' });
    s.gap(4);

    const { canvas, height } = s.render();
    return { bitmap: toBits(canvas, W, height), width: W, height, canvas };
}

/* ══════════════════════════════════════════════════════════════════
   บัตรคิว (§12 Mode B) — พิมพ์ที่คีออสก์ทันทีที่ลูกค้าสั่งเสร็จ
   เลขคิวต้องใหญ่ที่สุดในใบ: ลูกค้าใช้มันจับคู่กับจอเรียกคิว
   สถานะการจ่ายเป็นแถบดำ — "ยังไม่ได้จ่าย" ห้ามมองข้าม
   ══════════════════════════════════════════════════════════════════ */
const TICKET_STATUS = {
    CASH:    ['กรุณาชำระเงินที่เคาน์เตอร์', 'แสดงบัตรนี้กับพนักงาน'],
    REVIEW:  ['ส่งสลิปแล้ว รอพนักงานตรวจสอบ', 'ตรวจเสร็จแล้วส่งเข้าครัวทันที'],
    TIMEOUT: ['กรุณาติดต่อพนักงานที่เคาน์เตอร์', 'แสดงบัตรนี้กับพนักงาน'],
    PAID:    ['ชำระเงินแล้ว', 'รอเรียกหมายเลขที่จอ'],
};

function kioskTicket({ order, items, branch, kind, width = '80mm', dots, settings, copy }) {
    const W = dots || WIDTH[width] || WIDTH['80mm'];
    const narrow = W < 500;
    const s = createSheet(W);
    const base = narrow ? 20 : 22;

    s.wrap(branch.name_th || '', { size: narrow ? 26 : 30, bold: true, align: 'center', lh: 1.3 });
    s.line(copy ? 'บัตรคิว (สำเนา)' : 'บัตรคิว', { size: base, align: 'center', bold: !!copy });
    s.rule();
    s.line('หมายเลขคิว', { size: base, align: 'center' });
    s.line(pick(order, 'orderNo', 'order_no') || '—', { size: narrow ? 80 : 104, bold: true, align: 'center', lh: 1.12 });
    s.line(diningTh(order) + ' · ' + dateTime(pick(order, 'createdAt', 'created_at') || Date.now()),
           { size: 18, align: 'center' });
    s.rule({ dashed: true });

    for (const it of items) {
        const qty = `${it.qty} x `;
        s.wrap(qty + itemName(it), { size: base, hang: qty, right: money(it.qty * pick(it, 'unitPrice', 'unit_price')), lh: 1.3 });
        for (const m of modsOf(it)) {
            s.wrap('- ' + m.label, { size: narrow ? 16 : 17, indent: Math.round(base * 1.4), hang: '- ', lh: 1.25 });
        }
    }
    s.rule();
    s.row('ยอดรวม', '฿' + money(order.total), { size: base + 6, bold: true, lh: 1.4 });
    s.gap(6);
    const [head, sub] = TICKET_STATUS[kind] || TICKET_STATUS.CASH;
    s.banner(head, { size: narrow ? 20 : 22 });
    s.line(sub, { size: 18, align: 'center' });
    const foot = String((settings && settings.receiptFooter) || '').trim().split(/\r?\n/)[0];
    if (foot) { s.gap(4); s.wrap(foot, { size: 16, align: 'center' }); }
    s.gap(4);

    const { canvas, height } = s.render();
    return { bitmap: toBits(canvas, W, height), width: W, height, canvas };
}

/* ══════════════════════════════════════════════════════════════════
   ใบสรุปปิดรอบ (§27) — ฉบับกระดาษม้วน
   ตัดตารางสินค้าขายดีและ KPI ออก (ฉบับเต็มอยู่ใน A4 ของเบราว์เซอร์)
   ⚠️ แม่แบบเดียวกับ CFDocs.closingRoll — แก้ที่หนึ่งต้องแก้อีกที่
   ══════════════════════════════════════════════════════════════════ */
function closingSlip({ shift, summary: k, cash: cc, branch, staff, width = '80mm', dots }) {
    const W = dots || WIDTH[width] || WIDTH['80mm'];
    const narrow = W < 500;
    const s = createSheet(W);
    const base = narrow ? 21 : 23;
    const blank = '________';

    s.line(branch.name_th, { size: narrow ? 26 : 30, bold: true, align: 'center' });
    s.line('ใบสรุปปิดรอบการขาย', { size: base, align: 'center' });
    if (shift.status === 'OPEN') s.line('(ยังไม่ปิดรอบ — ฉบับตัวอย่าง)', { size: 17, align: 'center' });
    s.rule();

    s.row('รหัสรอบ', shift.id, { size: base });
    s.row('เปิดรอบ', dateTime(shift.opened_at), { size: base });
    s.row('ปิดรอบ', shift.closed_at ? dateTime(shift.closed_at) : '—', { size: base });
    s.row('ผู้รับผิดชอบ', staff || '—', { size: base });
    s.rule({ dashed: true });

    s.row('ยอดขายเงินสด', money(k.cash), { size: base });
    s.row('ยอดขาย QR', money(k.qr), { size: base });
    s.row('จำนวนบิล', String(k.orderCount), { size: base });
    s.row('ยอดขายรวม', '฿' + money(k.sales), { size: base + 4, bold: true });
    s.rule({ dashed: true });

    s.row(`ยกเลิก (${k.cancelledCount})`, money(k.cancelledAmount), { size: base });
    s.row(`คืนเงิน (${k.refundedCount})`, money(k.refundedAmount), { size: base });
    s.rule({ dashed: true });

    s.line('การควบคุมเงินสด', { size: base, bold: true });
    s.row('เงินตั้งต้น', money(cc.opening), { size: base });
    s.row('ขายเงินสด', money(cc.cashSales), { size: base });
    s.row('ควรมี', money(cc.expected), { size: base + 2, bold: true });
    s.row('นับได้จริง', cc.actual == null ? blank : money(cc.actual), { size: base });
    s.row('ผลต่าง', cc.difference == null ? blank : money(cc.difference), { size: base + 2, bold: true });
    s.rule();

    s.gap(10);
    s.line('ลงชื่อผู้ปิดรอบ', { size: 18 });
    s.gap(28);
    s.rule({ dashed: true });
    s.line('พิมพ์ ' + dateTime(Date.now()), { size: 17, align: 'center' });

    const { canvas, height } = s.render();
    return { bitmap: toBits(canvas, W, height), width: W, height, canvas };
}

/**
 * บิตแมป 1 บิตที่จะส่งเข้าเครื่องพิมพ์ → PNG สำหรับพรีวิวบนจอ
 * ต้องวาดจาก "บิตแมป" ไม่ใช่จาก canvas ต้นฉบับ — พรีวิวจะได้เห็นเหมือนกระดาษจริง
 * รวมถึงเส้นขอบตัวอักษรที่หยักหลังตัดเป็นขาวดำ
 */
function bitsToPng(bits, width, height) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(width, height);
    const bytesPerRow = width / 8;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const on = bits[y * bytesPerRow + (x >> 3)] & (0x80 >> (x & 7));
            const i = (y * width + x) * 4;
            const v = on ? 0 : 255;
            img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toBuffer('image/png');
}

/* ══════════════════════════════════════════════════════════════════
   ใบทดสอบเครื่องพิมพ์ — ตอนติดตั้ง ไม่ต้องสั่งออเดอร์จริง
   กรอบรอบใบ = ความกว้างที่ตั้งไว้พอดี ดูกรอบก็รู้ว่าตั้งขนาดกระดาษ/ความละเอียดถูกไหม
   ไม้บรรทัดด้านบนขีดละ 1 มม. ไว้วัดว่าขาด/เกินไปกี่มม.
   ══════════════════════════════════════════════════════════════════ */
function testPage({ name, conn, width = '80mm', dots }) {
    const W = dots || WIDTH[width] || WIDTH['80mm'];
    const narrow = W < 500;
    const dpi = (W === 512 || W === 360) ? 180 : 203;
    const base = narrow ? 19 : 22;
    const s = createSheet(W);

    s.gap(46);                                               // ที่ของไม้บรรทัด
    s.line('ทดสอบเครื่องพิมพ์', { size: narrow ? 26 : 30, bold: true, align: 'center' });
    s.line(name || '—', { size: base, align: 'center' });
    s.rule();
    s.row('กระดาษ', width === '58mm' ? '58 มม.' : '80 มม.', { size: base });
    s.row('ความละเอียด', `${dpi} dpi · ${W} จุด`, { size: base });
    s.row('ต่อแบบ', conn || '—', { size: base });
    s.rule({ dashed: true });
    s.wrap('ดูกรอบสี่เหลี่ยมรอบใบนี้', { size: base, bold: true });
    s.wrap('ถูก: เห็นเส้นกรอบครบทั้งซ้ายและขวา ห่างขอบกระดาษไม่เกิน 4 มม.', { size: base - 2, hang: 'ถูก: ' });
    s.wrap('ผิด: เส้นกรอบด้านขวาขาดหาย = ตั้งกว้างเกิน เลือกความละเอียด 180 dpi (หรือกระดาษ 58 มม.)',
           { size: base - 2, hang: 'ผิด: ' });
    s.wrap('ผิด: นอกกรอบเหลือที่ว่างเกิน 4 มม. = ตั้งแคบไป เลือก 203 dpi (หรือกระดาษ 80 มม.)',
           { size: base - 2, hang: 'ผิด: ' });
    s.rule({ dashed: true });
    s.wrap('ภาษาไทยต้องอ่านออก สระและวรรณยุกต์ไม่หลุด: น้ำแข็ง ผู้ใหญ่ กิ่งก้าน ฤๅษี', { size: base - 2 });
    s.line('0123456789 ฿1,234.50', { size: base, bold: true });
    s.line(dateTime(Date.now()), { size: 16, align: 'center' });
    s.gap(6);

    const { canvas, height } = s.render();
    const c = canvas.getContext('2d');
    c.fillStyle = '#000';
    // กรอบหนา 3 จุด ชิดขอบภาพพอดี — ขาดด้านไหนแปลว่าเกินหัวพิมพ์ด้านนั้น
    c.fillRect(0, 0, W, 3); c.fillRect(0, height - 3, W, 3);
    c.fillRect(0, 0, 3, height); c.fillRect(W - 3, 0, 3, height);
    // ไม้บรรทัด: ขีดสั้นทุก 1 มม. ยาวทุก 5 มม. ตัวเลขทุก 10 มม.
    const perMm = dpi / 25.4;
    c.font = `14px "${fontFamily()}"`;
    for (let mm = 0; mm * perMm < W; mm++) {
        const x = Math.round(mm * perMm);
        const h = mm % 10 === 0 ? 22 : mm % 5 === 0 ? 15 : 8;
        c.fillRect(x, 3, 2, h);
        if (mm % 10 === 0 && mm && x + 26 < W) c.fillText(String(mm), x + 3, 24);   // เลขที่ล้นขอบไม่วาด
    }
    return { bitmap: toBits(canvas, W, height), width: W, height, canvas };
}

module.exports = { WIDTH, createSheet, toBits, bitsToPng, kitchenSlip, receipt, kioskTicket, testPage,
                   closingSlip, fontFamily };
