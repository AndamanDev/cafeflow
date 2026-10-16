/**
 * CafeFlow — NAVIGATION
 * ------------------------------------------------------------
 * แทนที่ DS_MENU ของ MediCore (ซึ่งเป็นเมนูโรงพยาบาล) ด้วยเมนู CafeFlow
 *
 * ⚠️ ไฟล์นี้เรียก DSNavbar.configure() ที่ top level โดยตั้งใจ
 *    ds-navbar.js ลงทะเบียน init() ไว้กับ DOMContentLoaded ตั้งแต่ตอนโหลดไฟล์แล้ว
 *    อะไรที่ลงทะเบียนทีหลังจะ configure ไม่ทัน
 *
 * ต้องโหลด "หลัง" ds-navbar.js
 */

/* ══════════════════════════════════════════════════════════
   ไอคอนเพิ่มของ CafeFlow — inline SVG 16x16 currentColor
   ------------------------------------------------------------
   DS_ICONS ใช้กับ navbar เท่านั้น เป็น inline SVG เพื่อให้ navbar
   ไม่พังเวลา Lucide CDN ล่ม — ในเนื้อหน้าใช้ <i data-lucide="..."> ตามปกติ
   ══════════════════════════════════════════════════════════ */
const CF_ICONS = {
    // โลโก้แบรนด์ (20x20, stroke ขาว เหมือนของเดิม) — แก้วกาแฟแทนคลิปบอร์ด
    logo: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>',

    coffee:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>',
    cup:      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h14l-1.2 16.1A2 2 0 0 1 15.8 21H8.2a2 2 0 0 1-2-1.9L5 3Z"/><path d="M5.5 9h13"/></svg>',
    banknote: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01"/><path d="M18 12h.01"/></svg>',
    receipt:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2.5-1.5L9 22l2.5-1.5L14 22l2.5-1.5L19 22V2l-2.5 1.5L14 2l-2.5 1.5L9 2 6.5 3.5 4 2Z"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/></svg>',
    chefHat:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 13.9A4 4 0 0 1 7.4 6a5.1 5.1 0 0 1 1.1-1.5 5 5 0 0 1 7 0A5.1 5.1 0 0 1 16.6 6 4 4 0 0 1 18 13.9V21H6Z"/><line x1="6" y1="17" x2="18" y2="17"/></svg>',
    printer:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>',
    monitor:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
    qr:       '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM19 19h2v2h-2zM14 19h2v2h-2zM19 14h2v2h-2z"/></svg>',
};

// แถบเมนูจัดใหม่ 16/10/2569 — ไอคอนกลุ่ม "หน้าร้าน" / บัญชี / ออกจากระบบ / เสียงเตือน
Object.assign(CF_ICONS, {
    store:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v2a3 3 0 01-6 0 3 3 0 01-6 0 3 3 0 01-6 0z"/><path d="M5 13v8h14v-8"/><path d="M10 21v-5h4v5"/></svg>',
    user:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0112 0v1"/></svg>',
    key:     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2"/><path d="M16 7l3 3"/><path d="M19 4l2 2"/></svg>',
    logout:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    bellOff: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.7 21a2 2 0 01-3.4 0"/><path d="M18.6 13A17.9 17.9 0 0118 8"/><path d="M6.3 6.3A6 6 0 006 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 00-9.3-5"/><line x1="2" y1="2" x2="22" y2="22"/></svg>',
});

Object.assign(DS_ICONS, CF_ICONS);   // DS_ICONS เป็น object ธรรมดา แก้ไขได้

/* ══════════════════════════════════════════════════════════
   เมนู — roles อิงตาราง §29
   ══════════════════════════════════════════════════════════ */
/*
 * จัดใหม่ 16/10/2569 (ผู้ใช้: พนักงานใหม่ดูแล้วต้องเข้าใจทันที) — เดิม 7 ปุ่ม + ปุ่ม ⚙/👤 ไม่มีชื่อ
 *   หน้าร้าน  = งานขายทั้งวัน (แคชเชียร์ · ครัว · ประวัติบิล · ปิดรอบ) — ทุกตำแหน่งที่ขายของเห็นกลุ่มนี้
 *   จัดการร้าน = งานผู้จัดการ (ภาพรวมอยู่ปุ่มแรก · รายงาน · เมนู)
 *   บัญชี     = ชื่อผู้ใช้เป็นปุ่ม เปิดแล้วเจอเปลี่ยนรหัส/ออกจากระบบ (แทนชิปชื่อ + ปุ่มออกจากระบบของ DS ที่ซ่อนด้วย CSS)
 */
const CF_MENU = [
    { link: 'dashboard.html', label: 'ภาพรวม', icon: 'chart' },

    {
        group: 'ops', label: 'หน้าร้าน', icon: 'store',
        items: [
            { section: 'งานขายวันนี้' },
            { href: 'cashier.html', label: 'แคชเชียร์',     icon: 'banknote',
              roles: 'ADMIN MANAGER CASHIER', badge: { text: 'Live', type: 'live' } },
            { href: 'kds.html',     label: 'ครัว (KDS)',    icon: 'chefHat',
              roles: 'ADMIN MANAGER KITCHEN', badge: { text: 'Live', type: 'live' } },
            { href: 'orders.html',  label: 'ประวัติบิล', icon: 'receipt' },
            // ไม่มีเส้นคั่น — sep ของ DS ไม่รองรับ roles ครัวจะเห็นเส้นลอยท้ายเมนู
            { href: 'closing.html', label: 'ปิดรอบ / ปิดวัน', icon: 'fileText', roles: 'ADMIN MANAGER CASHIER' },
        ],
    },

    { link: 'reports.html', label: 'รายงาน', icon: 'fileText', roles: 'ADMIN MANAGER' },

    {
        group: 'catalog', label: 'เมนูและสินค้า', icon: 'coffee', roles: 'ADMIN MANAGER',
        items: [
            { href: 'menu.html', label: 'รายการสินค้า', icon: 'coffee' },
            { sep: true },
            { section: 'ข้อมูลอ้างอิง' },
            { href: 'menu.html#categories', label: 'หมวดหมู่', icon: 'listChecks' },
            { href: 'menu.html#groups', label: 'กลุ่มตัวเลือก (Modifier)', icon: 'listChecks' },
        ],
    },

    {
        group: 'settings', label: '', icon: 'settings', alignRight: true,
        title: 'ตั้งค่าระบบ', roles: 'ADMIN MANAGER',
        items: [
            { section: 'ตั้งค่าระบบ' },
            { href: 'kiosk.html',               label: 'เปิดโหมดคีออสก์',      icon: 'monitor' },
            { href: 'dashboard.html?shop=1',    label: 'ข้อมูลร้าน',            icon: 'fileText' },
            { href: 'dashboard.html?kiosk=1',   label: 'ตั้งค่าคีออสก์',        icon: 'settings' },
            { href: 'dashboard.html?display=1', label: 'ตั้งค่าจอแสดงคิว',      icon: 'monitor' },
            { href: 'dashboard.html?devices=1', label: 'อุปกรณ์ในเครือข่าย',    icon: 'monitor' },
            { href: 'dashboard.html?printers=1', label: 'เครื่องพิมพ์',          icon: 'printer' },
            // เดิมอยู่ในกล่อง "ตั้งค่าร้าน" บนหน้าภาพรวม (เอากล่องออก 16/10/2569 — ซ้ำกับเมนูนี้)
            { href: 'dashboard.html?slip=1',    label: 'ความแม่นการตรวจสลิป',   icon: 'qr' },
            { href: 'dashboard.html?users=1',   label: 'ผู้ใช้และสิทธิ์',        icon: 'users', roles: 'ADMIN' },
        ],
    },

    // บัญชี — ปุ่มคือชื่อผู้ใช้ (อ่าน session ตอนโหลดไฟล์ — cf-auth.js โหลดใน <head> ก่อนแล้ว)
    // ทุกบทบาทต้องเปลี่ยนรหัสของตัวเองได้ — ครัวกับแคชเชียร์เข้าเมนูตั้งค่าไม่ได้
    (() => {
        const u = (window.CFAuth && CFAuth.getUser()) || {};
        return {
            group: 'account', label: u.full_name || 'บัญชี', icon: 'user', alignRight: true, title: 'บัญชีของฉัน',
            items: [
                { section: u.role_label || 'บัญชีของฉัน' },
                { href: 'javascript:CFApp.changePassword()', label: 'เปลี่ยนรหัสผ่าน', icon: 'key' },
                { sep: true },
                { href: 'javascript:CFAuth.logout()', label: 'ออกจากระบบ', icon: 'logout' },
            ],
        };
    })(),
];

DSNavbar.configure({
    brand: 'CafeFlow',
    brandSub: 'AndamanTech Smart Operations',
    homeHref: 'dashboard.html',
    menu: CF_MENU,
    showClock: true,
    getUser: () => CFAuth.getUser(),
    getRole: () => CFAuth.getRole(),
    onLogout: () => CFAuth.logout(),
});

// ตั้งค่า ⚙ + บัญชี ไปชิดขวา (ต่อจากนาฬิกา) แบบเว็บทั่วไป — DS วางทุกเมนูไว้ฝั่งซ้าย
// ลงทะเบียนหลัง ds-navbar.js จึงรันหลัง DSNavbar.init() · ย้าย element เดิม listener ของ dropdown ติดไปด้วย
document.addEventListener('DOMContentLoaded', () => {
    const right = document.querySelector('.mc-navbar .mc-nav-right');
    if (!right) return;
    ['settings', 'account'].forEach((g) => {
        const dd = document.querySelector(`.mc-navbar .mc-nav-dropdown[data-group="${g}"]`);
        if (dd) right.appendChild(dd);
    });
});
