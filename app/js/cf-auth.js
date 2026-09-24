/**
 * CafeFlow — AUTH
 * ------------------------------------------------------------
 * ตัวตนจริงอยู่ใน cookie httpOnly ที่เซิร์ฟเวอร์ออกให้ตอนล็อกอิน
 * ที่ localStorage เก็บแค่ข้อมูลแสดงผล (ชื่อ บทบาท) ไว้ซ่อนปุ่ม/วาด navbar
 * (localStorage ไม่ใช่ sessionStorage โดยตั้งใจ เพื่อให้แท็บ KDS กับแท็บ Cashier
 * เห็นการล็อกอินเดียวกัน)
 *
 * ⚠️ นี่คือด่านระดับ UX เท่านั้น — เซิร์ฟเวอร์ตรวจสิทธิ์ทุก endpoint เอง
 *
 * ตารางสิทธิ์แปลงตรงจาก §29 ของสเปก
 */
(function () {
    const K_SESSION = 'cafeflow.session.v1';

    /* ── §29 Permission matrix + ป้ายบทบาท ──────────────────
       ย้ายไป shared/cf-perms.js แล้ว เพราะเซิร์ฟเวอร์ต้องตรวจด้วยตารางเดียวกัน
       ที่นี่ตรวจเพื่อซ่อนปุ่ม (UX) ส่วนที่นั่นตรวจเพื่อปฏิเสธจริง (ความปลอดภัย) */
    const ROLE_LABEL = CF_ROLE_LABEL;


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

    window.CFAuth = {
        /**
         * คืน Promise ของ {ok:true, user} หรือ {ok:false, error:'ข้อความ'} — ไม่ reject
         */
        login(username, password) {
            return CFApi.post('/api/auth/login', { username, password })
                .then((res) => {
                    // เก็บเฉพาะข้อมูลแสดงผล — ตัวตนจริงอยู่ใน cookie httpOnly
                    // ที่ JavaScript แตะไม่ได้ และเซิร์ฟเวอร์ตรวจทุก request
                    write({ userId: res.user.id, name: res.user.name, role: res.user.role,
                            at: new Date().toISOString(),
                            // ล็อกอินด้วยรหัสตั้งต้น — ทุกหน้าจะเปิดหน้าต่างเปลี่ยนรหัสจนกว่าจะเปลี่ยน
                            mustChangePassword: !!res.mustChangePassword });
                    return { ok: true, user: res.user };
                })
                .catch((err) => ({
                    ok: false,
                    error: err.offline ? 'ติดต่อเซิร์ฟเวอร์ของร้านไม่ได้'
                                       : (err.message || 'เข้าสู่ระบบไม่สำเร็จ'),
                }));
        },

        logout() {
            const done = () => {
                try { localStorage.removeItem(K_SESSION); } catch (e) { /* ไม่เป็นไร */ }
                location.href = 'login.html';
            };
            // ต้องเพิกถอน session ที่เซิร์ฟเวอร์ด้วย ไม่ใช่แค่ลืมมันที่ฝั่งเบราว์เซอร์
            CFApi.post('/api/auth/logout', {}).catch(() => {}).then(done);
        },

        /**
         * ไปหน้าล็อกอินแล้วกลับมาหน้านี้หลังล็อกอินเสร็จ
         * ล้าง session ฝั่งเบราว์เซอร์ด้วย — ใช้ตอนเซิร์ฟเวอร์ตอบ 401
         * (cookie หมดอายุ/ถูกเพิกถอน แต่ localStorage ยังคิดว่าล็อกอินอยู่)
         */
        toLogin() {
            try { localStorage.removeItem(K_SESSION); } catch (e) { /* ไม่เป็นไร */ }
            location.replace('login.html?next=' + encodeURIComponent(location.pathname.split('/').pop()));
        },

        /** เปลี่ยนรหัสสำเร็จแล้ว — เลิกบังคับ */
        clearMustChange() {
            const s = read();
            if (s) { delete s.mustChangePassword; write(s); }
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
                this.toLogin();
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
