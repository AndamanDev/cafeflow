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

    /** ป้ายสถานะภาษาไทย + สีชิปของ design system */
    const CF_STATUS = {
        DRAFT:           { label: 'ร่าง',            chip: 'sip-chip-muted' },
        ORDER_CONFIRMED: { label: 'ยืนยันออเดอร์',    chip: 'sip-chip-muted' },
        WAITING_CASH:    { label: 'รอชำระเงินสด',     chip: 'sip-chip-active' },
        WAITING_PAYMENT: { label: 'รอชำระ QR',        chip: 'sip-chip-active' },
        PAYMENT_TIMEOUT: { label: 'QR หมดเวลา',       chip: 'sip-chip-danger' },
        PAYMENT_REVIEW:  { label: 'รอตรวจสอบการชำระ', chip: 'sip-chip-danger' },
        PAYMENT_FAILED:  { label: 'ชำระไม่สำเร็จ',    chip: 'sip-chip-danger' },
        PAID:            { label: 'ชำระแล้ว',         chip: 'sip-chip-success' },
        SENT_TO_KITCHEN: { label: 'ส่งเข้าครัวแล้ว',  chip: 'sip-chip-progress' },
        PREPARING:       { label: 'กำลังจัดเตรียม',   chip: 'sip-chip-progress' },
        READY:           { label: 'พร้อมรับ',         chip: 'sip-chip-success' },
        SERVED:          { label: 'ส่งมอบแล้ว',       chip: 'sip-chip-success' },
        COMPLETED:       { label: 'เสร็จสิ้น',        chip: 'sip-chip-muted' },
        CANCELLED:       { label: 'ยกเลิก',           chip: 'sip-chip-danger' },
        VOIDED:          { label: 'ยกเลิกบิล',        chip: 'sip-chip-danger' },
        REFUNDED:        { label: 'คืนเงิน',          chip: 'sip-chip-danger' },
    };

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
    const CF_KIOSK_DEFAULTS = {
        kioskOrientation: 'PORTRAIT',   // PORTRAIT | LANDSCAPE
        kioskScale: 1,                  // จอ 21" ใช้ 1.25 · 32" ใช้ 0.95
        kioskFrame: true,
        // ⚠️ kioskDiningMode ไม่อยู่ในนี้โดยตั้งใจ — ดูเหตุผลที่ CF_DINING_MODE()
        kioskUpsell: true,
        kioskImages: true,
        kioskIdleSec: 90,
        kioskDoneSec: 12,
    };
    /** พรีเซ็ตขนาดจอ — พิกเซลเท่ากันแต่ขนาดกายภาพต่างกันเกือบ 1.5 เท่า */
    const CF_KIOSK_SIZES = [
        { in: '21"', scale: 1.25 }, { in: '24"', scale: 1.1 },
        { in: '27"', scale: 1.0 },  { in: '32"', scale: 0.95 },
    ];

    return {
        CF_STATIONS, CF_SERVE, CF_SERVE_ORDER, CF_STATUS,
        CF_DINING, CF_DINING_MODES, CF_DINING_MODE,
        CF_KIOSK_DEFAULTS, CF_KIOSK_SIZES,
    };
});
