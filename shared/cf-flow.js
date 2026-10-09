/**
 * CafeFlow — ผังสถานะออเดอร์ (§7)
 * ------------------------------------------------------------
 * แหล่งความจริงเพียงที่เดียวของ state machine — ใช้ร่วมกันสองที่:
 * เบราว์เซอร์ (สร้างปุ่ม) และเซิร์ฟเวอร์ (ตัดสินจริงในทรานแซกชัน)
 *
 * ⚠️ ตรรกะบริสุทธิ์เท่านั้น — ห้ามอ้าง window / CFStore / showToast / fetch
 */
(function (root, factory) {
    const m = factory();
    if (typeof module === 'object' && module.exports) module.exports = m;
    else Object.keys(m).forEach((k) => { root[k] = m[k]; });
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /** key = สถานะปัจจุบัน, value = ไปต่อได้ที่ไหนบ้าง */
    const CF_FLOW = {
        DRAFT:           ['ORDER_CONFIRMED', 'CANCELLED'],
        ORDER_CONFIRMED: ['WAITING_CASH', 'WAITING_PAYMENT', 'CANCELLED'],
        WAITING_CASH:    ['PAID', 'CANCELLED'],
        // → WAITING_CASH = ลูกค้าเปลี่ยนใจจ่ายเงินสด (ไม่มีแอปธนาคาร/เน็ตมือถือ) — เซิร์ฟเวอร์ปิด QR และเปลี่ยนวิธีจ่ายให้
        WAITING_PAYMENT: ['PAID', 'PAYMENT_REVIEW', 'PAYMENT_TIMEOUT', 'WAITING_CASH', 'CANCELLED'],
        // หมดเวลาแล้วลูกค้าขอ QR ใหม่ที่คีออสก์ → กลับไปรอชำระ (ไม่ค้างในแท็บรอตรวจของแคชเชียร์)
        // → PAID / PAYMENT_FAILED = แคชเชียร์ตัดสินจากแผงตรวจสอบ (ลูกค้ามาเคาน์เตอร์โดยไม่มีสลิปให้สแกน) — ต้องมีเหตุผล + ติดเพดานยืนยันแทน
        PAYMENT_TIMEOUT: ['WAITING_PAYMENT', 'PAYMENT_REVIEW', 'WAITING_CASH', 'PAID', 'PAYMENT_FAILED', 'CANCELLED'],
        PAYMENT_REVIEW:  ['PAID', 'PAYMENT_FAILED', 'CANCELLED'],
        PAYMENT_FAILED:  ['WAITING_PAYMENT', 'CANCELLED'],
        PAID:            ['SENT_TO_KITCHEN', 'VOIDED', 'REFUNDED'],
        SENT_TO_KITCHEN: ['PREPARING', 'READY', 'VOIDED'],
        PREPARING:       ['READY', 'VOIDED'],
        READY:           ['SERVED'],
        SERVED:          ['COMPLETED'],
        COMPLETED:       ['REFUNDED'],
        CANCELLED: [], VOIDED: [], REFUNDED: [],
    };

    /** สถานะที่ต้องมีเหตุผลกำกับเสมอ — ระบบตรวจสอบย้อนหลังได้ */
    const CF_REASON_REQUIRED = ['CANCELLED', 'VOIDED', 'REFUNDED', 'PAYMENT_FAILED'];

    /** ป้ายปุ่มภาษาไทยของแต่ละสถานะปลายทาง */
    const CF_ACTION_LABEL = {
        ORDER_CONFIRMED: 'ยืนยันออเดอร์',
        WAITING_CASH:    'ส่งไปรอเงินสด',
        WAITING_PAYMENT: 'ออก QR ชำระเงิน',
        PAID:            'ยืนยันการชำระ',
        PAYMENT_REVIEW:  'ส่งไปเช็กสลิป',
        PAYMENT_TIMEOUT: 'QR หมดเวลา',
        PAYMENT_FAILED:  'สลิปไม่ผ่าน',
        SENT_TO_KITCHEN: 'ส่งเข้าครัว',
        PREPARING:       'เริ่มจัดเตรียม',
        READY:           'พร้อมรับ',
        SERVED:          'ส่งมอบลูกค้า',
        COMPLETED:       'ปิดเป็น "เสร็จ"',
        // ยกเลิก 3 แบบ — ชื่อปุ่มบอกผลกับเงินให้ชัด พนักงานไม่ต้องรู้ศัพท์ void/refund
        CANCELLED:       'ยกเลิก (ยังไม่ได้รับเงิน)',
        VOIDED:          'ยกเลิกบิลผิด/ซ้ำ',
        REFUNDED:        'ยกเลิก + คืนเงินลูกค้า',
    };

    /**
     * สถานะ → ชื่อช่องเวลาที่ต้องปั๊ม
     * ฝั่งเบราว์เซอร์ลงใน order.ts[...] · ฝั่งเซิร์ฟเวอร์เป็นชื่อคอลัมน์ (snake_case)
     */
    const CF_STAMP = {
        PAID: 'paidAt', SENT_TO_KITCHEN: 'sentAt', PREPARING: 'preparingAt',
        READY: 'readyAt', SERVED: 'servedAt', COMPLETED: 'completedAt',
        CANCELLED: 'cancelledAt', VOIDED: 'voidedAt', REFUNDED: 'refundedAt',
    };

    /** สถานะถัดไปที่ถูกกฎ — ใช้ generate ปุ่ม จึงไม่มีปุ่มที่กดแล้วพัง */
    function nextStates(status) { return CF_FLOW[status] || []; }
    function canGo(status, to) { return nextStates(status).indexOf(to) !== -1; }
    function needsReason(status) { return CF_REASON_REQUIRED.indexOf(status) !== -1; }
    function stampFor(status) { return CF_STAMP[status] || null; }

    /** สถานะที่ถือว่าจบแล้ว ไม่มีทางไปต่อ */
    function isTerminal(status) { return nextStates(status).length === 0; }

    // ค่าคงที่ขึ้นต้น CF_ ปล่อยเป็น global ได้ (ชื่อเฉพาะพอ) ส่วนฟังก์ชันรวมเป็น CFFlow
    return {
        CF_FLOW, CF_REASON_REQUIRED, CF_ACTION_LABEL, CF_STAMP,
        CFFlow: { nextStates, canGo, needsReason, stampFor, isTerminal },
    };
});
