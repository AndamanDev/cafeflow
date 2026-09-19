/**
 * CafeFlow — AUTH
 * ------------------------------------------------------------
 * session เดโมบน localStorage (ไม่ใช่ sessionStorage โดยตั้งใจ
 * เพื่อให้แท็บ KDS กับแท็บ Cashier ใช้การล็อกอินเดียวกัน)
 *
 * ⚠️ นี่คือด่านระดับ UX เท่านั้น — ระบบจริงต้องตรวจสิทธิ์ที่ server
 *
 * ตารางสิทธิ์แปลงตรงจาก §29 ของสเปก
 */
(function () {
    const K_SESSION = 'cafeflow.session.v1';

    /* ── §29 Permission matrix ────────────────────────────────
       true = ทำได้ · 'LIMITED' = ทำได้ในขอบเขต · false = ไม่ได้ */
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

    const ROLE_LABEL = {
        ADMIN: 'ผู้ดูแลระบบ', MANAGER: 'ผู้จัดการร้าน',
        CASHIER: 'แคชเชียร์', KITCHEN: 'ครัว', VIEWER: 'ผู้ชมข้อมูล',
    };

    function read() {
        try {
            const raw = localStorage.getItem(K_SESSION);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }
    function write(s) {
        try { localStorage.setItem(K_SESSION, JSON.stringify(s)); } catch (e) { /* โหมดอ่านอย่างเดียว */ }
    }

    window.CF_PERMS = CF_PERMS;
    window.CF_ROLE_LABEL = ROLE_LABEL;

    const isApi = () => window.CFStore && CFStore.mode === 'api';

    window.CFAuth = {
        /**
         * คืน {ok:true} หรือ {ok:false, error:'ข้อความ'}
         * หลังบ้าน api เป็น async — หน้าล็อกอินต้อง await
         * (หลังบ้าน local ยังคืนค่าทันทีเหมือนเดิม เพื่อไม่ให้เดโมพัง)
         */
        login(username, password) {
            if (isApi()) {
                return CFApi.post('/api/auth/login', { username, password })
                    .then((res) => {
                        // เก็บเฉพาะข้อมูลแสดงผล — ตัวตนจริงอยู่ใน cookie httpOnly
                        // ที่ JavaScript แตะไม่ได้ และเซิร์ฟเวอร์ตรวจทุก request
                        write({ userId: res.user.id, name: res.user.name, role: res.user.role,
                                at: new Date().toISOString() });
                        return { ok: true, user: res.user };
                    })
                    .catch((err) => ({
                        ok: false,
                        error: err.offline ? 'ติดต่อเซิร์ฟเวอร์ของร้านไม่ได้'
                                           : (err.message || 'เข้าสู่ระบบไม่สำเร็จ'),
                    }));
            }

            if (!CFStore.db) CFStore.init();
            const u = CFStore.all('users').find(
                (x) => x.username === String(username || '').trim().toLowerCase()
            );
            if (!u || u.password !== password) return { ok: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
            if (!u.active) return { ok: false, error: 'บัญชีนี้ถูกปิดการใช้งาน' };

            write({ userId: u.id, name: u.name, role: u.role, at: new Date().toISOString() });
            return { ok: true, user: u };
        },

        logout() {
            const done = () => {
                try { localStorage.removeItem(K_SESSION); } catch (e) { /* ไม่เป็นไร */ }
                location.href = 'login.html';
            };
            // ต้องเพิกถอน session ที่เซิร์ฟเวอร์ด้วย ไม่ใช่แค่ลืมมันที่ฝั่งเบราว์เซอร์
            if (isApi()) CFApi.post('/api/auth/logout', {}).catch(() => {}).then(done);
            else done();
        },

        session()   { return read(); },
        isLoggedIn(){ return !!read(); },
        getRole()   { const s = read(); return s ? s.role : null; },
        roleLabel() { return ROLE_LABEL[this.getRole()] || ''; },

        /**
         * รูปแบบที่ DSNavbar.loadUser() อ่าน — ต้องเป็น
         * full_name / active_role / role_label ตามสัญญาของ ds-navbar.js
         * (DS_ROLE_LABEL ของ DS เป็นตำแหน่งโรงพยาบาล จึงส่ง role_label มาเองเสมอ)
         */
        getUser() {
            const s = read();
            if (!s) return null;
            return {
                id: s.userId,
                full_name: s.name,
                active_role: s.role,
                role_label: ROLE_LABEL[s.role] || s.role,
            };
        },

        /** ผู้ใช้เต็มจากฐานข้อมูล (มี overrideLimit ด้วย) */
        getUserRecord() {
            const s = read();
            return s ? CFStore.byId('users', s.userId) : null;
        },

        /** true / false / 'LIMITED' */
        permission(key) {
            const r = this.getRole();
            if (!r || !CF_PERMS[r]) return false;
            return CF_PERMS[r][key] === undefined ? false : CF_PERMS[r][key];
        },

        /** ทำได้ไหม (LIMITED นับว่าทำได้ — ตัวจำกัดวงเงินเช็คแยก) */
        can(key) { return this.permission(key) !== false; },

        /** เพดานการ override ของผู้ใช้คนนี้ (null = ไม่จำกัด) */
        overrideLimit() {
            if (this.permission('PAY_OVERRIDE') !== 'LIMITED') return null;
            const u = this.getUserRecord();
            const s = CFStore.db ? CFStore.db.settings : null;
            if (u && u.overrideLimit != null) return u.overrideLimit;
            return s ? s.cashierOverrideLimit : 0;
        },

        /**
         * ด่านหน้าเพจ — เรียกใน <head> ก่อน first paint
         * ไม่มี session → ไปหน้า login
         * มี session แต่ไม่มีสิทธิ์ → ไป dashboard พร้อมเหตุผลใน query
         */
        guard(permKey) {
            if (!this.isLoggedIn()) {
                location.replace('login.html?next=' + encodeURIComponent(location.pathname.split('/').pop()));
                return false;
            }
            if (permKey && !this.can(permKey)) {
                location.replace('dashboard.html?denied=' + encodeURIComponent(permKey));
                return false;
            }
            return true;
        },
    };
})();
