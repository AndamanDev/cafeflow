/**
 * CafeFlow — ตารางสิทธิ์ (§29)
 * ══════════════════════════════════════════════════════════════════
 * ชุดเดียวกันทั้งหน้าจอและเซิร์ฟเวอร์ — แต่บังคับใช้คนละความหมาย
 *
 *   หน้าจอ     ใช้ซ่อนปุ่มที่กดไปก็ไม่ได้ผล (เรื่องของ UX)
 *   เซิร์ฟเวอร์ ใช้ปฏิเสธจริง (เรื่องของความปลอดภัย)
 *
 * ถ้าสองฝั่งถือตารางคนละชุด วันหนึ่งปุ่มจะโผล่ให้กดแต่เซิร์ฟเวอร์ปฏิเสธ
 * หรือแย่กว่านั้นคือปุ่มถูกซ่อนแต่ยิง API ตรงได้
 *
 * ⚠️ ตรรกะบริสุทธิ์ — ห้ามอ้าง window / CFStore / req
 */
(function (root, factory) {
    const m = factory();
    if (typeof module === 'object' && module.exports) module.exports = m;
    else Object.keys(m).forEach((k) => { root[k] = m[k]; });
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /* true = ทำได้ · 'LIMITED' = ทำได้ในขอบเขต · false = ไม่ได้ */
    const CF_PERMS = {
        ADMIN: {
            MENU_EDIT: true, PRICE_EDIT: true, PAY_RECEIVE: true, PAY_OVERRIDE: true,
            KITCHEN: true, REPORT: true, SHIFT_CLOSE: true, USER_MANAGE: true,
        },
        MANAGER: {
            MENU_EDIT: true, PRICE_EDIT: true, PAY_RECEIVE: true, PAY_OVERRIDE: true,
            KITCHEN: true, REPORT: true, SHIFT_CLOSE: true, USER_MANAGE: false,
        },
        CASHIER: {
            MENU_EDIT: false, PRICE_EDIT: false, PAY_RECEIVE: true, PAY_OVERRIDE: 'LIMITED',
            KITCHEN: false, REPORT: 'LIMITED', SHIFT_CLOSE: true, USER_MANAGE: false,
        },
        KITCHEN: {
            MENU_EDIT: false, PRICE_EDIT: false, PAY_RECEIVE: false, PAY_OVERRIDE: false,
            KITCHEN: true, REPORT: false, SHIFT_CLOSE: false, USER_MANAGE: false,
        },
        VIEWER: {
            MENU_EDIT: false, PRICE_EDIT: false, PAY_RECEIVE: false, PAY_OVERRIDE: false,
            KITCHEN: false, REPORT: 'LIMITED', SHIFT_CLOSE: false, USER_MANAGE: false,
        },
    };

    const CF_ROLE_LABEL = {
        ADMIN: 'ผู้ดูแลระบบ', MANAGER: 'ผู้จัดการร้าน',
        CASHIER: 'แคชเชียร์', KITCHEN: 'ครัว', VIEWER: 'ผู้ชมข้อมูล',
    };

    /** สิทธิ์ดิบ: true | 'LIMITED' | false */
    function permission(role, key) {
        const row = CF_PERMS[role];
        return row ? !!row[key] || row[key] : false;
    }

    /** ทำได้ไหม — 'LIMITED' นับว่าทำได้ ส่วนขอบเขตไปวัดที่ overrideLimitFor() */
    function can(role, key) {
        const v = CF_PERMS[role] ? CF_PERMS[role][key] : false;
        return v === true || v === 'LIMITED';
    }

    /**
     * เพดานเงินที่ยืนยันการชำระแทนได้
     * null = ไม่จำกัด · ตัวเลข = เกินกว่านี้ต้องให้ผู้จัดการมากด
     */
    function overrideLimitFor(user, settings) {
        if (!user) return 0;
        if (CF_PERMS[user.role] && CF_PERMS[user.role].PAY_OVERRIDE !== 'LIMITED') {
            return can(user.role, 'PAY_OVERRIDE') ? null : 0;
        }
        if (user.overrideLimit != null) return Number(user.overrideLimit);
        return settings && settings.cashierOverrideLimit != null
            ? Number(settings.cashierOverrideLimit) : 0;
    }

    return { CF_PERMS, CF_ROLE_LABEL, CFPerms: { permission, can, overrideLimitFor } };
});
