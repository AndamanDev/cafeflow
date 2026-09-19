/**
 * CafeFlow — ผังสถานะออเดอร์ (§7)
 * ------------------------------------------------------------
 * แหล่งความจริงเพียงที่เดียวของ state machine — ใช้ร่วมกันสามที่:
 * เบราว์เซอร์ (สร้างปุ่ม), เซิร์ฟเวอร์ (ตัดสินจริงในทรานแซกชัน), อาร์ติแฟกต์คีออสก์
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
        WAITING_PAYMENT: ['PAID', 'PAYMENT_REVIEW', 'PAYMENT_TIMEOUT', 'CANCELLED'],
        PAYMENT_TIMEOUT: ['PAYMENT_REVIEW', 'CANCELLED'],
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
        PAYMENT_REVIEW:  'ส่งตรวจสอบการชำระ',
        PAYMENT_TIMEOUT: 'หมดเวลาชำระ',
        PAYMENT_FAILED:  'ชำระไม่สำเร็จ',
        SENT_TO_KITCHEN: 'ส่งเข้าครัว',
        PREPARING:       'เริ่มจัดเตรียม',
        READY:           'พร้อมรับ',
        SERVED:          'ส่งมอบลูกค้า',
        COMPLETED:       'ปิดรายการ',
        CANCELLED:       'ยกเลิกออเดอร์',
        VOIDED:          'ยกเลิกบิล',
        REFUNDED:        'คืนเงิน',
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
