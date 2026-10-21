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

// เมนู ⚙ จัดใหม่ 21/10/2569 — ไอคอนไม่ซ้ำกันทุกรายการ (เดิมจอ monitor ซ้ำ 3 ตัว)
Object.assign(CF_ICONS, {
    tablet:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="11" y1="18" x2="13" y2="18"/></svg>',
    tv:        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="13" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>',
    wifi:      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.6a10 10 0 0 1 14 0"/><path d="M8.5 16.1a5 5 0 0 1 7 0"/><path d="M2 9a15 15 0 0 1 20 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>',
    scanCheck: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="m8 12 3 3 5-6"/></svg>',
    folder:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>',
    sliders:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>',
    play:      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><polygon points="10 8 16 12 10 16 10 8"/></svg>',
});

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
            // ป้าย "Live" ภาษาอังกฤษเอาออก · "ครัว (KDS)" → "จอครัว" (21/10/2569 — คำที่พนักงานเข้าใจ)
            { href: 'cashier.html', label: 'แคชเชียร์', icon: 'banknote', roles: 'ADMIN MANAGER CASHIER' },
            { href: 'kds.html',     label: 'จอครัว',    icon: 'chefHat',  roles: 'ADMIN MANAGER KITCHEN' },
            { href: 'orders.html',  label: 'ประวัติบิล', icon: 'receipt' },
            // ไม่มีเส้นคั่น — sep ของ DS ไม่รองรับ roles ครัวจะเห็นเส้นลอยท้ายเมนู
            { href: 'closing.html', label: 'ปิดรอบ / ปิดวัน', icon: 'fileText', roles: 'ADMIN MANAGER CASHIER' },
        ],
    },

    { link: 'reports.html', label: 'รายงาน', icon: 'fileText', roles: 'ADMIN MANAGER' },

    // เดิมเป็น dropdown 3 รายการ (รายการสินค้า · หมวดหมู่ · กลุ่มตัวเลือก) ซ้ำกับปุ่มในหน้าเมนู → ลิงก์เดียว (21/10/2569)
    { link: 'menu.html', label: 'เมนูและสินค้า', icon: 'coffee', roles: 'ADMIN MANAGER' },

    {
        group: 'settings', label: '', icon: 'settings', alignRight: true,
        title: 'ตั้งค่าระบบ', roles: 'ADMIN MANAGER',
        items: [
            // จัดกลุ่มใหม่ 21/10/2569: ร้าน · อุปกรณ์หน้าร้าน
            // "ความแม่นการตรวจสลิป" ย้ายไปหน้ารายงาน (ข้อมูลไว้ปรับระบบ ไม่ใช่การตั้งค่า) · "เปิดโหมดคีออสก์" เอาออก (เปิดด้วย screen-edge.bat)
            // ผู้ใช้และสิทธิ์ / ตั้งค่าเมนู (ADMIN) อยู่คู่กับข้อมูลร้าน — หัวข้อไม่ลอยว่างตอน MANAGER เปิด
            { section: 'ร้าน' },
            { href: 'dashboard.html?shop=1',     label: 'ข้อมูลร้าน',          icon: 'store' },
            { href: 'dashboard.html?users=1',    label: 'ผู้ใช้และสิทธิ์',      icon: 'users', roles: 'ADMIN' },
            { href: 'dashboard.html?menus=1',    label: 'ตั้งค่าเมนู',          icon: 'sliders', roles: 'ADMIN' },
            { section: 'อุปกรณ์หน้าร้าน' },
            { href: 'dashboard.html?kiosk=1',    label: 'ตั้งค่าคีออสก์',      icon: 'tablet' },
            { href: 'dashboard.html?display=1',  label: 'ตั้งค่าจอแสดงคิว',    icon: 'tv' },
            { href: 'dashboard.html?printers=1', label: 'เครื่องพิมพ์',        icon: 'printer' },
            { href: 'dashboard.html?devices=1',  label: 'อุปกรณ์ในเครือข่าย',  icon: 'wifi' },
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
    // DS ไฮไลต์ทุกรายการที่ไฟล์ตรงกับหน้าปัจจุบัน — รายการที่มี ?xxx / #xxx คือ "เปิดแผงตั้งค่า" ไม่ใช่หน้า
    // อยู่หน้าภาพรวมแล้วรายการตั้งค่าเขียวหมดทั้งเมนู (21/10/2569) → ไฮไลต์เฉพาะลิงก์หน้าจริง
    document.querySelectorAll('.mc-navbar .mc-dd-item.active').forEach((a) => {
        if (/[?#]/.test(a.getAttribute('href') || '')) a.classList.remove('active');
    });
    const gear = document.querySelector('.mc-navbar .mc-nav-dropdown[data-group="settings"]');
    if (gear) gear.classList.remove('active');
});

/* ══════════════════════════════════════════════════════════
   ตั้งค่าเมนู — แสดง/ซ่อน · ลำดับ (ผู้ใช้ขอ 21/10/2569 · แอดมินตั้งได้คนเดียว — เซิร์ฟเวอร์ตรวจที่ saveSettings)
   เก็บใน settings.menuLayout = { nav:[{key,hidden}], ops:[…], reports:[…] } — ลำดับในอาร์เรย์ = ลำดับที่แสดง
   รายการใหม่ที่ยังไม่อยู่ในค่าที่บันทึก → ต่อท้าย ตามค่าเริ่มต้น (รายงานส่วนลด/ภาษีซ่อนไว้ก่อน)
   เมนู ⚙ และบัญชีไม่ให้ซ่อน — ไม่งั้นแอดมินซ่อนทางกลับมาตั้งค่าเอง
   ══════════════════════════════════════════════════════════ */
const CF_REPORTS = [
    ['summary',   'chart-column',       'สรุปยอดขาย'],
    ['items',     'package',            'ยอดขายตามสินค้า'],
    ['categories','layers',             'ยอดขายตามหมวดหมู่'],
    ['staff',     'users',              'ยอดขายตามพนักงาน'],
    ['payments',  'credit-card',        'ยอดขายตามประเภทการชำระเงิน'],
    ['receipts',  'receipt',            'ใบเสร็จรับเงิน'],
    ['modifiers', 'sliders-horizontal', 'ยอดขายตามตัวเลือกเพิ่มเติม'],
    ['slips',     'scan-text',          'ความแม่นการตรวจสลิป'],
    ['discounts', 'percent',            'ส่วนลด'],
    ['tax',       'landmark',           'ภาษี'],
];

const CFMenuLayout = {
    // รายการที่ตั้งค่าได้ — [key, ป้าย] ตามลำดับเริ่มต้น
    LISTS: {
        nav: [['dashboard', 'ภาพรวม'], ['ops', 'หน้าร้าน'], ['reports', 'รายงาน'], ['menu', 'เมนูและสินค้า']],
        ops: [['cashier', 'แคชเชียร์'], ['kds', 'จอครัว'], ['orders', 'ประวัติบิล'], ['closing', 'ปิดรอบ / ปิดวัน']],
        reports: CF_REPORTS.map(([k, , l]) => [k, l]),
    },
    // ร้านไม่มีหน้าใส่ส่วนลด และไม่ได้จด VAT — มีรายงานไว้ แต่ซ่อนจนกว่าแอดมินจะเปิด
    DEFAULT_HIDDEN: { reports: ['discounts', 'tax'] },

    stored(list) {
        const s = window.CFStore && CFStore.db && CFStore.settings();
        const m = s && s.menuLayout;
        return m && Array.isArray(m[list]) ? m[list] : null;
    },

    /** [{key, label, hidden}] ตามลำดับที่ตั้งไว้ — รวมรายการใหม่ที่ยังไม่เคยบันทึก */
    resolve(list, override) {
        const all = this.LISTS[list];
        const keys = all.map(([k]) => k);
        const label = (k) => (all.find(([x]) => x === k) || [])[1];
        const st = override || this.stored(list) || [];
        const out = [];
        st.forEach((x) => { if (keys.includes(x.key) && !out.some((o) => o.key === x.key)) out.push({ key: x.key, hidden: !!x.hidden }); });
        keys.forEach((k) => { if (!out.some((o) => o.key === k)) out.push({ key: k, hidden: (this.DEFAULT_HIDDEN[list] || []).includes(k) }); });
        return out.map((o) => Object.assign(o, { label: label(o.key) }));
    },
    visible(list) { return this.resolve(list).filter((o) => !o.hidden).map((o) => o.key); },

    /** จัดแถบเมนูบนตามค่าที่ตั้ง — เรียกหลังโหลดข้อมูลและทุกครั้งที่ค่าตั้งเปลี่ยน */
    applyNav() {
        const left = document.querySelector('.mc-navbar .mc-nav-left');
        if (!left) return;
        const topOf = (k) => left.querySelector(`:scope > .mc-nav-link[data-slug="${k}"], :scope > .mc-nav-dropdown[data-group="${k}"]`);
        const tail = left.querySelector(':scope > .mc-nav-dropdown[data-group="settings"], :scope > .mc-nav-dropdown[data-group="account"]');
        this.resolve('nav').forEach((o) => {
            const el = topOf(o.key);
            if (!el) return;
            el.classList.toggle('cf-menu-hidden', o.hidden);
            left.insertBefore(el, tail);               // tail = null → ต่อท้าย (⚙/บัญชีถูกย้ายไปขวาแล้ว)
        });
        const menu = left.querySelector(':scope > .mc-nav-dropdown[data-group="ops"] .mc-dd-menu');
        if (menu) this.resolve('ops').forEach((o) => {
            const a = menu.querySelector(`.mc-dd-item[href="${o.key}.html"]`);
            if (!a) return;
            a.classList.toggle('cf-menu-hidden', o.hidden);
            menu.appendChild(a);
        });
    },
};
window.CFMenuLayout = CFMenuLayout;
window.CF_REPORTS = CF_REPORTS;

// จัดแถบเมนูหลังข้อมูลพร้อม + เมื่อแอดมินเปลี่ยนค่าตั้ง (หน้าที่ไม่ได้บูตผ่าน CFBoot ก็ไม่เป็นไร — ใช้ลำดับเริ่มต้น)
if (window.CFBoot) CFBoot.ready(() => {
    CFMenuLayout.applyNav();
    if (window.CFStore && CFStore.subscribe) CFStore.subscribe(() => CFMenuLayout.applyNav());
});
