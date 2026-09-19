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

Object.assign(DS_ICONS, CF_ICONS);   // DS_ICONS เป็น object ธรรมดา แก้ไขได้

/* ══════════════════════════════════════════════════════════
   เมนู — roles อิงตาราง §29
   ══════════════════════════════════════════════════════════ */
const CF_MENU = [
    { link: 'dashboard.html', label: 'ภาพรวม', icon: 'chart' },

    {
        group: 'ops', label: 'หน้างาน', icon: 'listChecks',
        items: [
            { section: 'ปฏิบัติการวันนี้' },
            { href: 'orders.html',  label: 'จัดการออเดอร์', icon: 'receipt' },
            { href: 'cashier.html', label: 'แคชเชียร์',     icon: 'banknote',
              roles: 'ADMIN MANAGER CASHIER', badge: { text: 'Live', type: 'live' } },
            { href: 'kds.html',     label: 'ครัว (KDS)',    icon: 'chefHat',
              roles: 'ADMIN MANAGER KITCHEN', badge: { text: 'Live', type: 'live' } },
        ],
    },

    {
        group: 'catalog', label: 'เมนูและสินค้า', icon: 'coffee', roles: 'ADMIN MANAGER',
        items: [
            { href: 'menu.html', label: 'รายการสินค้า', icon: 'coffee' },
            { sep: true },
            { section: 'ข้อมูลอ้างอิง' },
            { href: 'menu.html#groups', label: 'กลุ่มตัวเลือก (Modifier)', icon: 'listChecks' },
        ],
    },

    { link: 'closing.html', label: 'ปิดรอบ / ปิดวัน', icon: 'fileText', roles: 'ADMIN MANAGER CASHIER' },

    {
        group: 'settings', label: '', icon: 'settings', alignRight: true,
        title: 'ตั้งค่าระบบ', roles: 'ADMIN MANAGER',
        items: [
            { section: 'ตั้งค่าระบบ' },
            { href: 'kiosk.html',               label: 'เปิดโหมดคีออสก์',      icon: 'monitor' },
            { href: 'dashboard.html?kiosk=1',   label: 'ตั้งค่าคีออสก์',        icon: 'settings' },
            { href: 'dashboard.html?devices=1', label: 'อุปกรณ์และเครื่องพิมพ์', icon: 'printer' },
            { href: 'dashboard.html?users=1',   label: 'ผู้ใช้และสิทธิ์',        icon: 'users', roles: 'ADMIN' },
            { sep: 'strong' },
            { href: 'dashboard.html?reset=1',   label: 'รีเซ็ตข้อมูลตัวอย่าง',  icon: 'refresh' },
        ],
    },
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
