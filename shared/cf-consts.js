/**
 * CafeFlow — ค่าคงที่ที่ใช้ร่วมทั้งระบบ
 * ------------------------------------------------------------
 * ⚠️ ไฟล์ในโฟลเดอร์ shared/ ถูกโหลดสองที่: เบราว์เซอร์ (<script>)
 *    และเซิร์ฟเวอร์ Node (require)
 *    จึงต้องเป็น "ตรรกะบริสุทธิ์" เท่านั้น — ห้ามอ้าง window, document,
 *    CFStore, fetch, localStorage หรือ process
 *
 * เดิมค่าเหล่านี้อยู่ใน cf-data.js ย้ายออกมาเพื่อให้เซิร์ฟเวอร์ใช้ชุดเดียวกัน
 */
(function (root, factory) {
    const m = factory();
    if (typeof module === 'object' && module.exports) module.exports = m;
    else Object.keys(m).forEach((k) => { root[k] = m[k]; });
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /** สถานีผลิต — สินค้าทุกตัวต้องผูกกับสถานีเสมอ (§18) */
    const CF_STATIONS = {
        BAR:     { label: 'บาร์เครื่องดื่ม', icon: 'cup-soda' },
        KITCHEN: { label: 'ครัวอาหาร',      icon: 'utensils' },
        BAKERY:  { label: 'เบเกอรี่',        icon: 'croissant' },
        DESSERT: { label: 'ของหวาน',         icon: 'cake-slice' },
    };

    /**
     * แบบเสิร์ฟ — แกนที่กำหนด "ราคา" ของสินค้า
     * ป้ายหน้าร้านมีสามคอลัมน์ ร้อน/เย็น/ปั่น และช่องที่เป็น '–' คือไม่มีขาย
     * STD ใช้กับของที่ไม่มีแกนนี้ (อาหาร เบเกอรี่ ของหวาน)
     */
    const CF_SERVE = {
        HOT:    { label: 'ร้อน', short: 'ร้อน', icon: 'flame' },
        ICED:   { label: 'เย็น', short: 'เย็น', icon: 'snowflake' },
        FRAPPE: { label: 'ปั่น', short: 'ปั่น', icon: 'blend' },
        STD:    { label: 'ปกติ', short: '',     icon: 'utensils' },
    };
    const CF_SERVE_ORDER = ['HOT', 'ICED', 'FRAPPE', 'STD'];

    /**
     * กลุ่มสถานะ — คำที่พนักงานพูดกันหน้าร้าน (6 คำ) · สีชิปตามกลุ่ม ไม่ใช่ตามสถานะย่อย
     * สถานะจริงในระบบยังมีครบ 16 ตัว (CF_FLOW) แต่ทุกหน้าจอขึ้นต้นด้วยชื่อกลุ่มเสมอ
     * พนักงานพูด "A012 กำลังทำ" ผู้จัดการเปิดดูเห็น "กำลังทำ · กำลังเตรียม" — คำแรกตรงกันทุกครั้ง
     */
    const CF_STATUS_GROUPS = [
        { key: 'pay',    label: 'รอจ่าย',    chip: 'sip-chip-active',   statuses: ['DRAFT', 'ORDER_CONFIRMED', 'WAITING_CASH', 'WAITING_PAYMENT'] },
        { key: 'check',  label: 'เช็กสลิป',   chip: 'sip-chip-danger',   statuses: ['PAYMENT_REVIEW', 'PAYMENT_TIMEOUT', 'PAYMENT_FAILED'] },
        { key: 'making', label: 'กำลังทำ',    chip: 'sip-chip-progress', statuses: ['PAID', 'SENT_TO_KITCHEN', 'PREPARING'] },
        { key: 'ready',  label: 'พร้อมรับ',   chip: 'sip-chip-success',  statuses: ['READY'] },
        { key: 'done',   label: 'เสร็จ',      chip: 'sip-chip-muted',    statuses: ['SERVED', 'COMPLETED'] },
        { key: 'void',   label: 'ยกเลิก',     chip: 'sip-chip-danger',   statuses: ['CANCELLED', 'VOIDED', 'REFUNDED'] },
    ];

    /** รายละเอียดต่อท้ายชื่อกลุ่ม ('' = ชื่อกลุ่มอย่างเดียวพอ) */
    const CF_STATUS_SUB = {
        DRAFT:           'ร่าง',
        ORDER_CONFIRMED: 'เพิ่งสั่ง',
        WAITING_CASH:    'เงินสด',
        WAITING_PAYMENT: 'QR',
        PAYMENT_REVIEW:  'รอตรวจ',
        PAYMENT_TIMEOUT: 'QR หมดเวลา',
        PAYMENT_FAILED:  'ไม่ผ่าน',
        PAID:            'รับเงินแล้ว',
        SENT_TO_KITCHEN: 'ยังไม่เริ่ม',
        PREPARING:       'กำลังเตรียม',
        READY:           '',
        SERVED:          'ส่งมอบแล้ว',
        COMPLETED:       '',
        CANCELLED:       'ไม่ได้รับเงิน',
        VOIDED:          'บิลผิด/ซ้ำ',
        REFUNDED:        'คืนเงินแล้ว',
    };

    /** ป้ายสถานะ: label = "กลุ่ม · รายละเอียด" · group = ชื่อกลุ่มอย่างเดียว (ที่แคบ) · chip = สีของกลุ่ม */
    const CF_STATUS = {};
    CF_STATUS_GROUPS.forEach((g) => g.statuses.forEach((s) => {
        const sub = CF_STATUS_SUB[s];
        CF_STATUS[s] = { label: sub ? g.label + ' · ' + sub : g.label, group: g.label, groupKey: g.key, sub, chip: g.chip };
    }));

    /** รูปแบบการรับสินค้า — ป้าย/ภาพอยู่ที่เดียว หน้าอื่นจะได้ไม่เขียนสตริงซ้ำ */
    const CF_DINING = {
        DINE_IN:   { label: 'กินที่ร้าน', en: 'Dine in',   icon: 'store', art: 'dinein',   tint: 'C-FOOD' },
        TAKE_AWAY: { label: 'กลับบ้าน',   en: 'Take away', icon: 'cart',  art: 'takeaway', tint: 'C-BAKERY' },
    };
    /** โหมดที่ตั้งได้จากหลังบ้าน — ร้านกลับบ้านอย่างเดียวไม่ต้องให้ลูกค้าตอบคำถามที่มีคำตอบเดียว */
    const CF_DINING_MODES = [
        { v: 'ASK',       label: 'ให้ลูกค้าเลือก' },
        { v: 'DINE_IN',   label: 'กินที่ร้านอย่างเดียว' },
        { v: 'TAKE_AWAY', label: 'กลับบ้านอย่างเดียว' },
    ];

    /**
     * อ่านโหมดจาก settings พร้อมรองรับฐานข้อมูลรุ่นก่อน — ทางเดียวที่ควรอ่านค่านี้
     * เครื่องที่บันทึก kioskDiningStep:false ไว้ เคยได้พฤติกรรม "บังคับกินที่ร้าน"
     * จึงต้องแปลงเป็น DINE_IN ไม่ใช่ ASK ไม่งั้นค่าที่ผู้จัดการตั้งไว้เปลี่ยนเองเงียบ ๆ
     * (ด้วยเหตุนี้ kioskDiningMode จึงห้ามอยู่ใน CF_KIOSK_DEFAULTS — ค่า default
     *  จะถูก merge ทับจนแยกไม่ออกว่า "ตั้งเป็น ASK" กับ "ยังไม่เคยตั้ง" ต่างกันตรงไหน)
     */
    function CF_DINING_MODE(s) {
        if (s && CF_DINING_MODES.some((m) => m.v === s.kioskDiningMode)) return s.kioskDiningMode;
        if (s && s.kioskDiningStep === false) return 'DINE_IN';
        return 'ASK';
    }

    /**
     * ค่าเริ่มต้นของคีออสก์ — ประกาศที่เดียว ใช้ทั้งหน้าคีออสก์และหน้าตั้งค่าหลังบ้าน
     * อ่านผ่านตัว merge เสมอ ฐานข้อมูลเก่าที่ยังไม่มีคีย์จึงไม่พัง
     */
    /**
     * วันทำการ ไม่ใช่วันปฏิทิน — ร้านปิดหลังเที่ยงคืนได้ ออเดอร์ตี 1 จึงยังเป็นยอดของ "เมื่อวาน"
     * ร้านตั้งเวลาเริ่มวันเองได้ (ค่า dayStartHour 0–12) · เลขออเดอร์ A001 เริ่มใหม่ทุกวันทำการ
     * คิดตามเวลาไทยเสมอ ไม่ขึ้นกับนาฬิกาของเครื่องที่เรียก
     */
    const CF_DAY_START_DEFAULT = 4;
    const CFDay = {
        startHourOf(settings) {
            const h = settings ? Number(settings.dayStartHour) : NaN;
            return Number.isInteger(h) && h >= 0 && h <= 12 ? h : CF_DAY_START_DEFAULT;
        },
        /**
         * ขายช่วงเวลานี้อยู่ไหม — from/to เป็น "HH:MM" (เวลาไทย) · ไม่ตั้ง = ขายทั้งวัน
         * from > to = ข้ามเที่ยงคืน (เช่น 20:00–02:00)
         */
        inWindow(from, to, now) {
            if (!from || !to) return true;
            const m = (s) => { const [h, mi] = String(s).split(':').map(Number); return h * 60 + (mi || 0); };
            const local = new Date(new Date(now || Date.now()).getTime() + 7 * 3600 * 1000);
            const cur = local.getUTCHours() * 60 + local.getUTCMinutes();
            const a = m(from), b = m(to);
            return a <= b ? cur >= a && cur < b : cur >= a || cur < b;
        },
        businessDate(now, startHour) {
            const h = startHour == null ? CF_DAY_START_DEFAULT : startHour;
            const local = new Date(new Date(now || Date.now()).getTime() + 7 * 3600 * 1000);   // Asia/Bangkok
            if (local.getUTCHours() < h) local.setUTCDate(local.getUTCDate() - 1);
            return local.toISOString().slice(0, 10);
        },
    };

    const CF_KIOSK_DEFAULTS = {
        kioskOrientation: 'PORTRAIT',   // PORTRAIT | LANDSCAPE
        kioskScale: 1,                  // จอ 21" ใช้ 1.25 · 32" ใช้ 0.95
        kioskFrame: true,
        // ⚠️ kioskDiningMode ไม่อยู่ในนี้โดยตั้งใจ — ดูเหตุผลที่ CF_DINING_MODE()
        kioskUpsell: true,
        kioskImages: true,
        // ภาพกล้องสแกนสลิปแบบกระจก — ปิดไว้: กลับด้านแล้วตัวหนังสือบนสลิปกลับด้าน ลูกค้าอ่านแล้วงง
        kioskCamMirror: false,
        // กล้องบางรุ่นกลับภาพมาเอง (ตัวหนังสือกลับด้าน) — เปิดเพื่อพลิกคืนทั้งภาพบนจอและภาพที่ส่งไปอ่านยอด
        kioskCamFlip: false,
        kioskIdleSec: 90,               // ค่าสำรองของรุ่นเก่า — หน้าที่ไม่มีค่าของตัวเองใช้ค่านี้
        // เวลาแต่ละหน้า (วินาที) — ไม่มีใครแตะจอจนครบ = ถามว่ายังสั่งอยู่ไหม แล้วกลับหน้าแรก
        kioskSecDining: 60,
        kioskSecMenu: 120,
        kioskSecItem: 90,
        kioskSecCart: 90,
        kioskSecUpsell: 45,
        kioskSecPay: 60,
        kioskSecQrExpired: 60,
        kioskWarnSec: 15,               // เหลือเท่านี้ขึ้นกล่อง "ยังสั่งอยู่ไหม?"
        kioskSlipScanSec: 90,           // หน้าสแกนสลิป — หมดเวลาส่งให้พนักงานดูแทน
        kioskDoneSec: 12,
    };
    /** ค่าเริ่มต้นของจอแสดงคิว (ทีวี) — ตั้งจากปุ่ม ⚙ ในแถวจอคิวของตารางอุปกรณ์ */
    const CF_DISPLAY_DEFAULTS = {
        displayTheme: 'light',          // 'light' | 'dark' · บันทึกแล้วจอเปลี่ยนตามเอง
        displayHighlights: true,        // ช่องเมนูแนะนำด้านขวา · ปิด = คิวเต็มจอ
        displayHighlightSec: 7,         // วินาทีต่อเมนูแนะนำ (3–60)
        displaySound: true,             // เสียงเรียกคิวเมื่อคิวพร้อม
        displayTicker: '',              // ข้อความประกาศด้านล่างจอ · ว่าง = ไม่แสดง (≤ 200 ตัว)
    };
    /** พรีเซ็ตขนาดจอ — พิกเซลเท่ากันแต่ขนาดกายภาพต่างกันเกือบ 1.5 เท่า */
    const CF_KIOSK_SIZES = [
        { in: '21"', scale: 1.25 }, { in: '24"', scale: 1.1 },
        { in: '27"', scale: 1.0 },  { in: '32"', scale: 0.95 },
    ];

    return {
        CF_STATIONS, CF_SERVE, CF_SERVE_ORDER, CF_STATUS, CF_STATUS_GROUPS,
        CF_DINING, CF_DINING_MODES, CF_DINING_MODE,
        CF_KIOSK_DEFAULTS, CF_KIOSK_SIZES, CF_DISPLAY_DEFAULTS,
        CF_DAY_START_DEFAULT, CFDay,
    };
});
