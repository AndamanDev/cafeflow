/**
 * MediCore Design System — NAVBAR
 * ------------------------------------------------------------
 * แถบเมนูบนใช้ร่วมทุกหน้า — หน้าต้องมี <nav id="appNavbar"></nav>
 * (ถ้าไม่มี จะ prepend เข้า <body> ให้เอง)
 *
 * แก้เมนูที่ DS_MENU ด้านล่าง "ที่เดียวจบ"
 * — active highlight derive จาก DS_MENU เอง ไม่ต้องแก้ตารางแยกอีกที่
 *
 * ผูกผู้ใช้/สิทธิ์:
 *   DSNavbar.configure({ getUser, getRole, onLogout, brand })
 *   ถ้าไม่ configure จะอ่าน window.Auth ถ้ามี — ไม่มีก็ใช้ demo user
 *   (ทำให้ showcase.html เปิดด้วย file:// ได้โดยไม่ต้องมี backend)
 *
 * ไอคอนเป็น inline SVG (ไม่พึ่ง Lucide CDN) — navbar จึงไม่พังถ้า CDN ล่ม
 */

/* ══════════════════════════════════════════════════════════
   1. ICON SET — เพิ่มไอคอนใหม่ได้ที่นี่ (16×16 stroke, currentColor)
   ══════════════════════════════════════════════════════════ */
const DS_ICONS = {
    logo:        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M12 11v4"/><path d="M10 13h4"/><path d="M7.5 18.5h2l1-2 1.5 3 1-1.5h3.5"/></svg>',
    clipboard:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>',
    userPlus:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>',
    users:       '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
    search:      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    calendar:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    stethoscope: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.8 2.3A.3.3 0 105 2H4a2 2 0 00-2 2v5a6 6 0 0012 0V4a2 2 0 00-2-2h-1a.2.2 0 10.3.3"/><path d="M8 15v1a6 6 0 006 6 6 6 0 006-6v-4"/><circle cx="20" cy="10" r="2"/></svg>',
    heartPulse:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 12.572l-7.5 7.428-7.5-7.428A5 5 0 1112 6.006a5 5 0 017.5 6.572"/><path d="M12 6v4l2 2h4"/></svg>',
    bed:         '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 012 2v10"/><path d="M2 17h20"/><path d="M6 8v-2a2 2 0 012-2h0a2 2 0 012 2v2"/></svg>',
    hospital:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6v4"/><path d="M14 8h-4"/><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M4 22h16"/><path d="M9 22v-4h6v4"/></svg>',
    heart:       '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0016.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 002 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
    edit:        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    zap:         '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    syringe:     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2l4 4"/><path d="M17 7l3-3"/><path d="M19 9l-8.7 8.7c-.4.4-1 .4-1.4 0L5.3 14.1a1 1 0 010-1.4L14 4"/><path d="M5 14l-2 2"/><path d="M7 17l-3 3"/><path d="M11 10l2 2"/></svg>',
    checkSquare: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>',
    refresh:     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 019-9 9.75 9.75 0 017 3.18"/><path d="M21 3v6h-6"/><path d="M21 12a9 9 0 01-9 9 9.75 9.75 0 01-7-3.18"/><path d="M3 21v-6h6"/></svg>',
    fileText:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    ambulance:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 10H6"/><path d="M14 18V6a2 2 0 00-2-2H4a2 2 0 00-2 2v11a1 1 0 001 1h2"/><path d="M19 18h2a1 1 0 001-1v-3.28a1 1 0 00-.684-.948l-1.923-.641a1 1 0 01-.578-.502l-1.539-3.076A1 1 0 0016.382 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>',
    alertCircle: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    alertTri:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    pill:        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 1.5l-8 8a5.657 5.657 0 008 8l8-8a5.657 5.657 0 00-8-8z"/><path d="M6.5 13.5l5-5"/></svg>',
    droplet:     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/></svg>',
    clock:       '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    listChecks:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6h11"/><path d="M10 12h11"/><path d="M10 18h11"/><polyline points="3 6 4 7 6 5"/><polyline points="3 12 4 13 6 11"/><polyline points="3 18 4 19 6 17"/></svg>',
    settings:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
    bell:        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 003.4 0"/></svg>',
    home:        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    chart:       '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    box:         '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
};


/* ══════════════════════════════════════════════════════════
   2. MENU CONFIG — ⭐ แก้เมนูที่นี่ที่เดียว

   รูปแบบกลุ่ม dropdown:
     { group:'ipd', label:'IPD', icon:'bed', roles:'ADMIN', alignRight:false,
       items:[ ... ] }

   รูปแบบ item ในเมนู:
     { href:'x.html', label:'ชื่อเมนู', icon:'pill', roles:'DOCTOR NURSE',
       badge:{ text:'Live', type:'live' } }     // type: live | new
     { section:'หัวข้อคั่น' }
     { sep:true }  หรือ  { sep:'strong' }

   รูปแบบลิงก์เดี่ยว (ไม่มี dropdown):
     { link:'portal.html', label:'Portal', icon:'home', roles:'DOCTOR ADMIN' }

   roles: เว้นว่าง = ทุกคนเห็น · คั่นด้วยช่องว่าง/จุลภาค
   ⚠️ role gate นี้เป็นแค่ UX — ด่านจริงต้องอยู่ที่ server
   ══════════════════════════════════════════════════════════ */
const DS_MENU = [
    { link: 'index.html', label: 'หน้าแรก', icon: 'home' },

    {
        group: 'records', label: 'ข้อมูลหลัก', icon: 'clipboard',
        items: [
            { section: 'ข้อมูล' },
            { href: 'records.html',        label: 'ภาพรวม',        icon: 'clipboard' },
            { href: 'records-search.html', label: 'ค้นหา',          icon: 'search' },
            { href: 'records-new.html',    label: 'เพิ่มรายการใหม่', icon: 'userPlus', roles: 'ADMIN' },
            { sep: true },
            { section: 'รายงาน' },
            { href: 'reports.html', label: 'รายงานสรุป', icon: 'chart', badge: { text: 'New', type: 'new' } },
        ],
    },

    {
        group: 'work', label: 'งานประจำวัน', icon: 'listChecks',
        items: [
            { href: 'tasks.html',    label: 'ตารางงาน',   icon: 'checkSquare', badge: { text: 'Live', type: 'live' } },
            { href: 'calendar.html', label: 'ปฏิทินนัด',  icon: 'calendar' },
            { sep: 'strong' },
            { href: 'inbox.html',    label: 'กล่องข้อความ', icon: 'bell' },
        ],
    },

    {
        group: 'settings', label: '', icon: 'settings', alignRight: true,
        title: 'ตั้งค่าระบบ', roles: 'ADMIN',
        items: [
            { section: 'ตั้งค่าระบบ' },
            { href: 'settings-general.html', label: 'ตั้งค่าทั่วไป',  icon: 'settings' },
            { href: 'settings-users.html',   label: 'ผู้ใช้และสิทธิ์', icon: 'users' },
        ],
    },
];

/* ป้ายตำแหน่งภาษาไทย — แก้ให้ตรงกับ role ของโปรเจคใหม่ */
const DS_ROLE_LABEL = {
    ADMIN:      'ผู้ดูแลระบบ',
    DOCTOR:     'แพทย์',
    NURSE:      'พยาบาล',
    PHARMACIST: 'เภสัชกร',
};


/* ══════════════════════════════════════════════════════════
   3. COMPONENT
   ══════════════════════════════════════════════════════════ */
const DSNavbar = {

    /* ── ปรับแต่งได้จากหน้า (เรียกก่อน DOMContentLoaded) ── */
    opts: {
        brand:    'MediCore',
        brandSub: 'Design System',
        homeHref: 'index.html',
        menu:     null,          // null = ใช้ DS_MENU
        getUser:  null,          // () => ({ full_name, active_role, role_label })
        getRole:  null,          // () => 'ADMIN'
        onLogout: null,          // () => void
        showClock: true,
    },

    configure(o) { Object.assign(this.opts, o || {}); return this; },

    init() {
        if (this._inited) return;
        this._inited = true;
        this.render();
        this.wireDropdowns();
        this.applyRoleGate();
        this.highlightActive();
        this.loadUser();
        if (this.opts.showClock) this.startClock();
    },

    /* ── ผู้ใช้ / สิทธิ์ — ใช้ adapter ถ้ามี, ไม่มีก็ window.Auth, ไม่มีอีกก็ demo ── */
    _user() {
        if (typeof this.opts.getUser === 'function') return this.opts.getUser();
        if (window.Auth && typeof Auth.getUser === 'function') return Auth.getUser();
        return { full_name: 'ผู้ใช้ตัวอย่าง', active_role: 'ADMIN' };
    },
    _role() {
        if (typeof this.opts.getRole === 'function') return (this.opts.getRole() || '').toUpperCase();
        if (window.Auth && typeof Auth.getRole === 'function') return (Auth.getRole() || '').toUpperCase();
        const u = this._user();
        return ((u && u.active_role) || '').toUpperCase();
    },

    /* ── สร้าง HTML ── */
    render() {
        const menu = this.opts.menu || DS_MENU;
        const nav = document.createElement('nav');
        nav.className = 'mc-navbar';
        nav.innerHTML = `
            <div class="mc-nav-left">
                <a class="mc-nav-logo" href="${this.opts.homeHref}">
                    <div class="mc-logo-mark">${DS_ICONS.logo}</div>
                    <div>
                        <div class="mc-logo-text">${dsEsc(this.opts.brand)}</div>
                        <span class="mc-logo-sub">${dsEsc(this.opts.brandSub)}</span>
                    </div>
                </a>
                <div class="mc-nav-sep"></div>
                ${menu.map(e => this._entryHtml(e)).join('\n')}
            </div>
            <div class="mc-nav-right">
                ${this.opts.showClock ? '<span class="mc-nav-clock" id="dsNavClock">--:--:--</span>' : ''}
                <div class="mc-nav-user-chip">
                    <div class="mc-nav-avatar" id="dsNavAvatar">?</div>
                    <div class="mc-nav-user-meta">
                        <span class="mc-nav-username" id="dsNavUsername">—</span>
                        <span class="mc-nav-userrole" id="dsNavUserrole">—</span>
                    </div>
                </div>
                <button class="mc-btn-logout" id="dsNavLogout">ออกจากระบบ</button>
            </div>
        `;

        const mount = document.getElementById('appNavbar');
        if (mount) { mount.replaceWith(nav); nav.id = 'appNavbar'; }
        else       { document.body.prepend(nav); }

        const out = document.getElementById('dsNavLogout');
        if (out) out.addEventListener('click', () => this._logout());
    },

    _entryHtml(e) {
        // ลิงก์เดี่ยว
        if (e.link) {
            return `<a class="mc-nav-link" href="${e.link}" data-slug="${dsSlug(e.link)}"
                       ${dsGate(e.roles)} ${e.title ? `title="${dsEsc(e.title)}"` : ''}>
                        ${DS_ICONS[e.icon] || ''}<span>${dsEsc(e.label)}</span>
                        ${e.badge ? `<span class="mc-di-badge ${e.badge.type || 'new'}">${dsEsc(e.badge.text)}</span>` : ''}
                    </a>`;
        }
        // กลุ่ม dropdown
        const items = (e.items || []).map(it => {
            if (it.section) return `<div class="mc-dd-section">${dsEsc(it.section)}</div>`;
            if (it.sep)     return `<div class="mc-dd-sep${it.sep === 'strong' ? ' mc-dd-sep-strong' : ''}"></div>`;
            return `<a class="mc-dd-item" href="${it.href}" ${dsGate(it.roles)}>
                        <span class="mc-di-icon">${DS_ICONS[it.icon] || ''}</span> ${dsEsc(it.label)}
                        ${it.badge ? `<span class="mc-di-badge ${it.badge.type || 'new'}">${dsEsc(it.badge.text)}</span>` : ''}
                    </a>`;
        }).join('\n');

        return `<div class="mc-nav-dropdown" data-group="${e.group}" ${dsGate(e.roles)}>
                    <button class="mc-nav-dd-btn" ${e.title ? `title="${dsEsc(e.title)}"` : ''}>
                        <span class="mc-nav-ic">${DS_ICONS[e.icon] || ''}</span>
                        ${e.label ? dsEsc(e.label) : ''}
                        <span class="mc-caret">▼</span>
                    </button>
                    <div class="mc-dd-menu${e.alignRight ? ' mc-dd-menu-right' : ''}">${items}</div>
                </div>`;
    },

    /**
     * พฤติกรรม dropdown — ตั้งใจไม่ใช้ CSS :hover
     *   hover ปุ่ม        → เปิด (ปิดตัวอื่น)
     *   เมาส์ออก         → หน่วง 400ms ค่อยปิด (มีเวลาเลื่อนไปที่เมนู)
     *   คลิกปุ่ม          → ปักหมุดเปิดค้าง (รองรับ touch)
     *   คลิกรายการ/นอกเมนู/Esc → ปิด
     */
    wireDropdowns() {
        const CLOSE_DELAY = 400;
        const dropdowns = Array.from(document.querySelectorAll('.mc-nav-dropdown'));
        let closeTimer = null;

        const closeAll = (except) => {
            dropdowns.forEach(d => { if (d !== except) d.classList.remove('open'); });
        };

        dropdowns.forEach(dd => {
            const btn = dd.querySelector('.mc-nav-dd-btn');

            dd.addEventListener('mouseenter', () => {
                clearTimeout(closeTimer);
                closeAll(dd);
                dd.classList.add('open');
            });
            dd.addEventListener('mouseleave', () => {
                clearTimeout(closeTimer);
                closeTimer = setTimeout(() => dd.classList.remove('open'), CLOSE_DELAY);
            });
            if (btn) {
                btn.addEventListener('click', (ev) => {
                    ev.preventDefault(); ev.stopPropagation();
                    clearTimeout(closeTimer);
                    const isOpen = dd.classList.contains('open');
                    closeAll();
                    if (!isOpen) dd.classList.add('open');
                });
            }
            dd.querySelectorAll('.mc-dd-item').forEach(a => {
                a.addEventListener('click', () => closeAll());
            });
        });

        document.addEventListener('click', (ev) => {
            if (!ev.target.closest('.mc-nav-dropdown')) closeAll();
        });
        document.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape') { clearTimeout(closeTimer); closeAll(); }
        });
    },

    /* ── ซ่อนเมนูที่ role ปัจจุบันไม่มีสิทธิ์ ── */
    applyRoleGate() {
        const role = this._role();
        document.querySelectorAll('.mc-navbar [data-role-gate]').forEach(el => {
            const allowed = (el.getAttribute('data-role-gate') || '')
                .split(/[\s,|]+/).filter(Boolean).map(s => s.toUpperCase());
            if (!allowed.length) return;
            el.style.display = (role && allowed.includes(role)) ? '' : 'none';
        });
    },

    /**
     * ไฮไลต์เมนูที่กำลังเปิดอยู่
     * อ่าน <body data-page="..."> ก่อน แล้ว fallback ไปชื่อไฟล์จาก URL
     * — group derive จาก DS_MENU เอง จึงไม่มีตาราง map แยกให้ลืมอัปเดต
     */
    highlightActive() {
        const menu = this.opts.menu || DS_MENU;
        const slug = document.body.getAttribute('data-page')
                  || dsSlug(location.pathname.split('/').pop() || 'index.html');
        const pageFile = `${slug}.html`;

        // หา group จากโครงเมนู
        let group = null;
        for (const e of menu) {
            if (e.link && dsSlug(e.link) === slug) { group = null; break; }
            if (e.items && e.items.some(it => it.href && dsSlug(it.href) === slug)) {
                group = e.group; break;
            }
        }
        if (group) {
            const dd = document.querySelector(`.mc-nav-dropdown[data-group="${group}"]`);
            if (dd) dd.classList.add('active');
        }

        // ไฮไลต์รายการที่ตรงพอดี
        document.querySelectorAll('.mc-dd-item, .mc-nav-link').forEach(a => {
            const href = a.getAttribute('href');
            if (!href) return;
            if (href.split('#')[0].split('?')[0] === pageFile) a.classList.add('active');
        });
    },

    startClock() {
        const tick = () => {
            const el = document.getElementById('dsNavClock');
            if (el) el.textContent = new Date().toLocaleTimeString('th-TH', { hour12: false });
        };
        tick();
        this._clock = setInterval(tick, 1000);
    },

    loadUser() {
        try {
            const user = this._user();
            if (!user) return;
            const fullName = user.full_name || user.fullName || '';
            const roleKey  = (user.active_role || user.role || '').toUpperCase();
            const nameEl   = document.getElementById('dsNavUsername');
            const avatarEl = document.getElementById('dsNavAvatar');
            const roleEl   = document.getElementById('dsNavUserrole');
            if (nameEl && fullName)   nameEl.textContent   = fullName;
            if (avatarEl && fullName) avatarEl.textContent = fullName.charAt(0);
            if (roleEl && roleKey)    roleEl.textContent   = user.role_label || DS_ROLE_LABEL[roleKey] || roleKey;
        } catch (e) { /* ไม่มีข้อมูลผู้ใช้ก็ปล่อยค่าเริ่มต้น */ }
    },

    _logout() {
        if (typeof this.opts.onLogout === 'function') return this.opts.onLogout();
        if (window.Auth && typeof Auth.logout === 'function') return Auth.logout();
        location.href = this.opts.homeHref;
    },
};

/* ── helper (ตั้งชื่อ ds* กันชนกับ dsEsc() ที่หน้า app นิยมประกาศเอง) ── */
function dsEsc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function dsGate(roles) {
    return roles ? `data-role-gate="${dsEsc(roles)}"` : '';
}
function dsSlug(href) {
    return String(href || '').split('/').pop().split('#')[0].split('?')[0].replace(/\.html$/, '');
}

window.DSNavbar = DSNavbar;
window.DS_ICONS = DS_ICONS;

document.addEventListener('DOMContentLoaded', () => DSNavbar.init());
