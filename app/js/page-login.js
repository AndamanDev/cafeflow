/** CafeFlow — หน้าเข้าสู่ระบบ */
const LoginPage = {

    /** หน้าปลายทางหลังล็อกอิน: เคารพ ?next= ถ้าผู้ใช้ถูกเด้งมาจากหน้าอื่น */
    landingFor(role) {
        const next = new URLSearchParams(location.search).get('next');
        if (next && /^[a-z-]+\.html$/.test(next)) return next;
        if (role === 'KITCHEN') return 'kds.html';
        if (role === 'CASHIER') return 'cashier.html';
        return 'dashboard.html';
    },

    /** CFAuth.login ไม่ reject — ผลลัพธ์บอกเองว่าผ่านหรือไม่ พร้อมข้อความภาษาคน */
    async attempt(username, password) {
        const err = document.getElementById('loginError');
        const btn = document.getElementById('loginBtn');
        if (btn) btn.disabled = true;
        try {
            const res = await CFAuth.login(username, password);
            if (!res.ok) {
                err.textContent = res.error;
                err.style.display = 'block';
                return;
            }
            err.style.display = 'none';
            location.href = this.landingFor(res.user.role);
        } finally {
            if (btn) btn.disabled = false;
        }
    },

    /** ดู/ซ่อนรหัสผ่าน — พิมพ์บนจอสัมผัสพลาดง่าย ให้ตรวจก่อนกดได้ */
    togglePw() {
        const el = document.getElementById('loginPass');
        const btn = document.getElementById('pwEye');
        const show = el.type === 'password';
        el.type = show ? 'text' : 'password';
        btn.textContent = show ? 'ซ่อน' : 'แสดง';
        btn.setAttribute('aria-label', show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน');
        el.focus();
    },

    /** เตือนเมื่อ Caps Lock เปิด — สาเหตุอันดับหนึ่งของ "รหัสผ่านผิด" ทั้งที่จำถูก */
    caps(ev) {
        const on = ev.getModifierState && ev.getModifierState('CapsLock');
        document.getElementById('capsHint').hidden = !on;
    },

    submit(ev) {
        ev.preventDefault();
        this.attempt(document.getElementById('loginUser').value,
                     document.getElementById('loginPass').value);
    },

    boot() {
        // หมดเวลาเข้าสู่ระบบระหว่างเปิดหน้าค้าง (CFAuth.toLogin('expired')) — ล็อกอินแล้วกลับหน้าเดิม
        if (new URLSearchParams(location.search).get('reason') === 'expired') {
            const err = document.getElementById('loginError');
            err.textContent = 'หมดเวลาเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่';
            err.style.display = 'block';
        }
        // ถูกเด้งมาเพราะสิทธิ์ไม่พอ ต้องบอกเหตุผล ไม่ใช่เงียบ ๆ
        const denied = new URLSearchParams(location.search).get('denied');
        if (denied) {
            const err = document.getElementById('loginError');
            err.textContent = 'บัญชีก่อนหน้าไม่มีสิทธิ์เข้าหน้านั้น กรุณาเข้าสู่ระบบด้วยบัญชีที่มีสิทธิ์';
            err.style.display = 'block';
        }
    },
};

window.LoginPage = LoginPage;
CFBoot.ready(() => LoginPage.boot());
