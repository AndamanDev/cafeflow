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

    /** CFAuth.login คืน Promise บนหลังบ้าน api และคืนค่าตรง ๆ บน local — รับได้ทั้งสองแบบ */
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

    submit(ev) {
        ev.preventDefault();
        this.attempt(document.getElementById('loginUser').value,
                     document.getElementById('loginPass').value);
    },

    /** เติมฟอร์มแล้วส่งเลย — ปุ่มบัญชีตัวอย่าง */
    use(username) {
        document.getElementById('loginUser').value = username;
        document.getElementById('loginPass').value = 'demo';
        this.attempt(username, 'demo');
    },

    /**
     * ปุ่มบัญชีตัวอย่าง — มีเฉพาะโหมดเดโม
     * ข้อมูลจริงไม่ส่งรหัสผ่านมาให้เบราว์เซอร์ และไม่ควรมีปุ่มลัดเข้าทุกบัญชีอยู่แล้ว
     */
    renderDemoRow() {
        const row = document.getElementById('demoRow');
        const wrap = row.closest('.cf-demo-wrap') || row.parentElement;
        if (CFStore.mode === 'api') {
            if (wrap) wrap.style.display = 'none';
            return;
        }
        row.innerHTML = CFStore.all('users')
            .filter((u) => u.active)
            .map((u) => `<button type="button" class="cf-demo-btn"
                            onclick="LoginPage.use('${u.username}')"
                            title="${CF_ROLE_LABEL[u.role]} — ${u.name}">${u.username}</button>`)
            .join('');
    },

    boot() {
        this.renderDemoRow();
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
