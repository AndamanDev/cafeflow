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

            const words = [...SEGMENTER.segment(String(text))].map((x) => x.segment);
            const lines = [];
            let cur = '';
            const room = () => inner - indent - (lines.length ? hang : 0);
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
                ops.push({ t: 'text', text: ln, size, weight, align: 'left', y,
                           pad: pad + off, inner: inner - off });
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
            ops.push({ t: 'rule', y, pad, inner, dashed: !!o.dashed });
            y += 14;
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
                if (op.t === 'rule') {
                    c.save();
                    if (op.dashed) c.setLineDash([4, 4]);
                    c.strokeStyle = '#000';
                    c.lineWidth = 2;
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
            if (lum < 128) out[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
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
   สลิปครัว (§19) — สะกดเต็มคำเสมอ ไม่ว่ากระดาษจะแคบแค่ไหน
   ══════════════════════════════════════════════════════════════════ */
function kitchenSlip({ order, items, station, stationLabel, width = '58mm', dots }) {
    const W = dots || WIDTH[width] || WIDTH['58mm'];
    const s = createSheet(W);
    const big = W >= 576 ? 30 : 26;

    s.line(stationLabel || station, { size: big, bold: true, align: 'center' });
    s.rule();
    s.row(pick(order, 'orderNo', 'order_no') || '—',
          clock(pick(order, 'sentAt', 'sent_at', 'createdAt', 'created_at') || Date.now()),
          { size: big + 6, bold: true });
    const dining = pick(order, 'diningOption', 'dining_option');
    const kiosk = pick(order, 'kioskId', 'kiosk_id');
    s.line((dining === 'TAKE_AWAY' ? 'กลับบ้าน' : 'กินที่ร้าน') +
           (kiosk ? ' · ' + kiosk : ''), { size: 20 });
    s.rule({ dashed: true });

    for (const it of items) {
        // ชื่อเมนูยาวต้องขึ้นบรรทัดใหม่ ไม่ใช่ถูกตัดเป็น "…" — ครัวอ่านผิดหนึ่งคำคือทำผิดหนึ่งแก้ว
        const qty = `${it.qty} × `;
        s.wrap(qty + pick(it, 'nameSnapshot', 'name_snapshot'), { size: big, bold: true, hang: qty });
        const serve = { HOT: 'ร้อน', ICED: 'เย็น', FRAPPE: 'ปั่น' }[pick(it, 'serveType', 'serve_type')];
        const ind = Math.round(big * 0.9);
        if (serve) s.wrap('แบบ: ' + serve, { size: 21, indent: ind });
        for (const m of it.mods || []) s.wrap('• ' + m.label, { size: 21, indent: ind, hang: '• ' });  // เต็มคำเสมอ
        s.gap(6);
    }

    s.rule();
    s.line('พิมพ์ ' + clock(Date.now()), { size: 18, align: 'center' });
    const { canvas, height } = s.render();
    return { bitmap: toBits(canvas, W, height), width: W, height, canvas };
}

/* ══════════════════════════════════════════════════════════════════
   ใบเสร็จรับเงิน — ร้านยังไม่จด VAT จึงไม่มีบรรทัดภาษี
   ══════════════════════════════════════════════════════════════════ */
function receipt({ order, items, payment, branch, width = '80mm', cashier, dots }) {
    const W = dots || WIDTH[width] || WIDTH['80mm'];
    const narrow = W < 500;           // 58 มม. (360–384 จุด) — 80 มม. ที่ 180 dpi ได้ 512 ยังนับเป็นกว้าง
    const s = createSheet(W);
    const base = narrow ? 21 : 23;

    s.line(branch.name_th, { size: narrow ? 26 : 30, bold: true, align: 'center' });
    if (branch.address && !narrow) s.line(branch.address, { size: 18, align: 'center', lh: 1.3 });
    if (branch.tax_id) s.line('เลขประจำตัวผู้เสียภาษี ' + branch.tax_id, { size: 17, align: 'center' });
    s.gap(6);
    s.line('ใบเสร็จรับเงิน', { size: base, align: 'center' });
    s.rule();

    s.row('เลขที่', pick(order, 'orderNo', 'order_no') || '—', { size: base });
    s.row('วันที่', dateTime(pick(order, 'paidAt', 'paid_at', 'createdAt', 'created_at')), { size: base });
    if (cashier) s.row('พนักงาน', cashier, { size: base });
    s.row('รับที่', pick(order, 'diningOption', 'dining_option') === 'TAKE_AWAY'
                    ? 'กลับบ้าน' : 'กินที่ร้าน', { size: base });
    s.rule({ dashed: true });

    for (const it of items) {
        const serve = { HOT: 'ร้อน', ICED: 'เย็น', FRAPPE: 'ปั่น' }[pick(it, 'serveType', 'serve_type')];
        const name = pick(it, 'nameSnapshot', 'name_snapshot') + (serve ? ` (${serve})` : '');
        if (narrow) {
            // 58 มม. มีที่ราว 22 ตัวอักษร — ชื่อต้องได้บรรทัดของตัวเอง
            s.line(name, { size: base });
            s.row(`  ${it.qty} × ${money(it.unit_price)}`, money(it.qty * it.unit_price), { size: base });
        } else {
            s.row(`${name}  ×${it.qty}`, money(it.qty * it.unit_price), { size: base });
        }
        // ใบเสร็จใช้ตัวย่อได้ ต่างจากสลิปครัว
        const mods = (it.mods || []).map((m) => pick(m, 'shortLabel', 'short_label', 'label')).filter(Boolean);
        if (mods.length) s.line('  ' + mods.join(' · '), { size: narrow ? 17 : 18 });
    }

    s.rule();
    s.row('รวมทั้งสิ้น', '฿' + money(order.total), { size: base + 6, bold: true });
    if (payment) {
        s.gap(4);
        s.row(payment.method === 'CASH' ? 'เงินสด' : 'QR พร้อมเพย์', '฿' + money(payment.amount), { size: base });
        if (payment.received != null) {
            s.row('รับมา', '฿' + money(payment.received), { size: base });
            s.row('เงินทอน', '฿' + money(pick(payment, 'change', 'change_amount')), { size: base, bold: true });
        }
        if (payment.ref) s.line('อ้างอิง ' + payment.ref, { size: 17 });
    }
    s.rule({ dashed: true });
    s.line('ขอบคุณที่ใช้บริการ', { size: base, align: 'center' });
    const rp = pick(order, 'reprintCount', 'reprint_count');
    if (rp > 0) {
        s.line(`(พิมพ์ซ้ำครั้งที่ ${rp})`, { size: 17, align: 'center' });
    }

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

module.exports = { WIDTH, createSheet, toBits, bitsToPng, kitchenSlip, receipt, fontFamily };
