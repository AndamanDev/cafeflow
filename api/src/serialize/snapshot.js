/**
 * CafeFlow — ประกอบข้อมูลจาก PostgreSQL กลับเป็นรูปทรงที่หน้าเว็บรู้จัก
 * ══════════════════════════════════════════════════════════════════
 * นี่คือไฟล์ที่ทำให้ "ไม่ต้องรื้อหน้าเว็บ 9 หน้า" เป็นจริง
 *
 * ฐานข้อมูล normalize (ราคาแยกแถว · เวลาแยกคอลัมน์ · สถานีแยกตาราง)
 * แต่หน้าเว็บอ่านผ่าน CFStore.all()/byId()/where() แบบ synchronous
 * บนโครงเดิมของฐานข้อมูลในเบราว์เซอร์ (ยุคต้นแบบ) มา 9 หน้า ~132 จุด
 *
 * เราจึง denormalize กลับที่นี่ที่เดียว แลกกับการไม่ต้องแตะ 132 จุดนั้น
 * ถ้าไฟล์นี้คืนรูปทรงเพี้ยนเมื่อไหร่ หน้าเว็บจะพังเงียบ ๆ — จึงมีเทสต์คุมไว้
 *
 * ⚠️ กฎที่ห้ามพลาด
 *    1. product.prices เป็น sparse map — คีย์ที่ไม่มี = ไม่ขายแบบนั้น
 *       ห้ามเติมคีย์ที่ไม่มีแถวใน product_price เป็น 0 เด็ดขาด
 *    2. order.ts ต้องไม่มีคีย์ที่เป็น null (โค้ดเดิมเช็ค `o.ts.paidAt` ตรง ๆ)
 *    3. auditLog.actor รวม USER/SYSTEM/KIOSK กลับเป็นค่าเดียวเหมือนเดิม
 */
'use strict';

/** ตัดคีย์ที่เป็น null/undefined ออก ให้เหมือน object ที่ฝั่ง client เคยสร้างเอง */
function compact(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) if (v != null) out[k] = v;
    return out;
}

const iso = (d) => (d instanceof Date ? d.toISOString() : d || null);
const num = (v) => (v == null ? null : Number(v));
// คอลัมน์ date — pg คืนเป็น Date เที่ยงคืนตามเวลาเครื่อง ต้องอ่านแบบ local ไม่งั้นวันเลื่อนไปหนึ่งวัน
const ymd = (d) => (d instanceof Date
    ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    : d || null);

/* ── แปลงทีละแถว ───────────────────────────────────────────── */

function toUser(r) {
    return {
        id: r.id, username: r.username, name: r.name_th, role: r.role,
        active: r.active,
        // ★ ห้ามส่ง password_hash ออกไปเด็ดขาด — snapshot นี้ไปถึงเบราว์เซอร์ทุกเครื่อง
        overrideLimit: r.override_limit == null ? null : Number(r.override_limit),
    };
}

/** สลิปที่ลูกค้าสแกน — แคชเชียร์ใช้เทียบกับแจ้งเตือนเงินเข้า */
function toSlip(r) {
    const { CFSlip } = require('../../../shared/cf-slip.js');
    return {
        id: String(r.id), orderId: r.order_id, ref: r.parsed_ref, bankCode: r.parsed_bank,
        bankName: CFSlip.BANKS[r.parsed_bank] || null,
        source: r.parsed_source, checks: r.checks, verdict: r.verdict, hasImage: !!r.image_path,
        // ผลอ่านภาพ: QUEUED/RUNNING = กำลังอ่าน · DONE = มีผลใน ocr · ERROR = อ่านไม่ได้
        ocrStatus: r.image_path ? r.ocr_status : null,
        amount: r.parsed_amount == null ? null : Number(r.parsed_amount),
        txAt: iso(r.parsed_tx_at),
        ocr: (r.checks && r.checks.ocr) || null,
        createdAt: iso(r.created_at),
    };
}

function toDevice(r, onlineCutoffMs) {
    // สถานะมาจาก heartbeat จริง ไม่ใช่คอลัมน์ที่ใครไปตั้งค้างไว้
    const seen = r.last_seen_at ? new Date(r.last_seen_at).getTime() : 0;
    const online = seen > 0 && Date.now() - seen < onlineCutoffMs;
    const out = {
        id: r.id, type: r.kind, name: r.name_th, ip: r.ip,
        assignedStation: r.assigned_station, assignedCashier: r.assigned_cashier,
        lastSeen: iso(r.last_seen_at),
        status: online ? 'ONLINE' : 'OFFLINE',
        // จับคู่อยู่หรือไม่ — แยก "ปิดเครื่อง" ออกจาก "หลุดการจับคู่" บนหน้าภาพรวม (ไม่ส่ง hash ออกไป)
        paired: !!r.pairing_token_hash, pairedAt: iso(r.paired_at),
    };
    // เครื่องพิมพ์ไม่ส่ง heartbeat (TCP 9100/USB ตอบกลับไม่ได้) — ส่งค่าตั้งไปแทน
    if (r.kind === 'PRINTER') {
        Object.assign(out, {
            conn: r.printer_conn || 'NETWORK',
            printerHost: r.printer_host, printerPort: r.printer_port, printerUsb: r.printer_usb,
            paperWidth: r.paper_width, printDots: r.print_dots, fallbackId: r.fallback_printer_id,
            kioskId: r.serves_kiosk,
            active: r.active,
        });
    }
    return out;
}

function toCategory(r) {
    return { id: r.id, nameTh: r.name_th, nameEn: r.name_en, sort: r.sort, active: r.active };
}

/**
 * สินค้า + ราคา
 * prices มาจาก jsonb_object_agg ฝั่ง SQL แล้ว — แถวที่ไม่มีก็คือคีย์ที่ไม่มี
 */
function toProduct(r, withCost) {
    const prices = {};
    for (const [k, v] of Object.entries(r.prices || {})) prices[k] = Number(v);
    const p = {
        id: r.id, groupTh: r.group_th, nameTh: r.name_th, nameEn: r.name_en,
        categoryId: r.category_id, prices, station: r.station,
        active: r.active, soldOut: r.sold_out, sort: r.sort,
        stockQty: r.stock_qty == null ? null : Number(r.stock_qty),
    };
    if (r.description_th) p.descriptionTh = r.description_th;
    if (r.description_en) p.descriptionEn = r.description_en;
    // ช่วงเวลาขาย "HH:MM" (เวลาไทย) — ไม่มี = ขายทั้งวัน
    if (r.avail_from_s && r.avail_to_s) { p.availFrom = r.avail_from_s; p.availTo = r.avail_to_s; }
    if (withCost) {
        p.costs = {};
        for (const [k, v] of Object.entries(r.costs || {})) p.costs[k] = Number(v);
    }
    if (r.recommended) p.recommended = true;      // โค้ดเดิมเช็คด้วย truthiness
    if (r.image_url) p.imageUrl = r.image_url;
    if (r.art_key) p.artKey = r.art_key;
    return p;
}

function toGroup(r) {
    return { id: r.id, nameTh: r.name_th, nameEn: r.name_en, type: r.type, required: r.required,
             maxSelect: r.max_select == null ? null : Number(r.max_select), sort: r.sort, active: r.active };
}
function toOption(r) {
    return {
        id: r.id, groupId: r.group_id, nameTh: r.name_th, nameEn: r.name_en, shortLabel: r.short_label,
        priceDelta: Number(r.price_delta), isDefault: r.is_default, sort: r.sort, active: r.active,
    };
}
function toRule(r) {
    return compact({
        id: r.id, serveType: r.serve_type, categoryId: r.category_id,
        groupId: r.group_id, sort: r.sort,
    });
}

function toShift(r) {
    return {
        id: r.id, openedAt: iso(r.opened_at), closedAt: iso(r.closed_at),
        openedBy: r.opened_by, closedBy: r.closed_by,
        openingCash: num(r.opening_cash), actualCash: num(r.actual_cash),
        status: r.status,
    };
}

/** ออเดอร์ — เวลา 10 คอลัมน์ยุบกลับเป็น ts map และสถานีกลับเป็น stationStatus map */
function toOrder(r) {
    return {
        id: r.id, orderNo: r.order_no, shiftId: r.shift_id, businessDate: ymd(r.business_date),
        createdAt: iso(r.created_at), kioskId: r.kiosk_id, cashierId: r.cashier_id,
        diningOption: r.dining_option, status: r.status, prevStatus: r.prev_status,
        paymentMethod: r.payment_method,
        subtotal: num(r.subtotal), discount: num(r.discount), total: num(r.total),
        stationStatus: r.station_status || {},
        reprintCount: r.reprint_count,
        ts: compact({
            createdAt: iso(r.created_at), paidAt: iso(r.paid_at), sentAt: iso(r.sent_at),
            preparingAt: iso(r.preparing_at), readyAt: iso(r.ready_at),
            servedAt: iso(r.served_at), completedAt: iso(r.completed_at),
            cancelledAt: iso(r.cancelled_at), voidedAt: iso(r.voided_at),
            refundedAt: iso(r.refunded_at),
        }),
        cancelReason: r.cancel_reason,
    };
}

function toOrderItem(r) {
    return {
        id: r.id, orderId: r.order_id, productId: r.product_id,
        nameSnapshot: r.name_snapshot, serveType: r.serve_type, qty: r.qty,
        unitPrice: num(r.unit_price), station: r.station,
        mods: (r.mods || []).map((m) => ({
            groupId: m.groupId, optionId: m.optionId, label: m.label,
            shortLabel: m.shortLabel, priceDelta: Number(m.priceDelta || 0),
        })),
        itemStatus: r.item_status,
    };
}

function toPayment(r) {
    return {
        id: r.id, orderId: r.order_id, method: r.method, amount: num(r.amount),
        received: num(r.received), change: num(r.change_amount),
        ref: r.ref, bank: r.bank, txAt: iso(r.tx_at),
        verifiedBy: r.verified_by,
        overrideBy: r.override_by, overrideReason: r.override_reason,
        overrideAt: iso(r.override_at),
        status: r.status, createdAt: iso(r.created_at),
    };
}

/** audit — รวม actor_kind กับ actor_user_id กลับเป็นค่าเดียวที่หน้าเว็บคาดหวัง */
function toAudit(r) {
    return {
        id: 'AU-' + r.id, ts: iso(r.ts), eventType: r.event_type, orderId: r.order_id,
        oldStatus: r.old_status, newStatus: r.new_status,
        actor: r.actor_kind === 'USER' ? r.actor_user_id : r.actor_kind,
        device: r.device_id, reason: r.reason, sourceIp: r.source_ip,
    };
}

module.exports = {
    compact, iso, num,
    toUser, toDevice, toCategory, toProduct, toGroup, toOption, toRule,
    toShift, toOrder, toOrderItem, toPayment, toSlip, toAudit,
};
