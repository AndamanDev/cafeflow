/* ============================================================
   MediCore Design System — TOAST
   ------------------------------------------------------------
   ข้อความแจ้งเตือนสั้น ๆ แบบ pill กลางล่างจอ

   หน้าควรมี  <div id="toastContainer" class="toast-container"></div>
   (ถ้าไม่มี จะสร้างให้อัตโนมัติ)

   วิธีใช้:
     showToast('บันทึกแล้ว');
     showToast('บันทึกไม่สำเร็จ', 'error');
     showToast('ตรวจสอบข้อมูลอีกครั้ง', 'warning', 5000);

   type: success (ค่าเริ่มต้น) | error | warning | info
   ============================================================ */

(function () {
    const CONTAINER_ID = 'toastContainer';
    const DEFAULT_MS = 2800;

    function container() {
        let el = document.getElementById(CONTAINER_ID);
        if (el) return el;
        el = document.createElement('div');
        el.id = CONTAINER_ID;
        el.className = 'toast-container';
        document.body.appendChild(el);
        return el;
    }

    function show(msg, type = 'success', duration = DEFAULT_MS) {
        const c = container();
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        t.textContent = msg;                 // textContent = ปลอดภัยจาก XSS โดยปริยาย
        t.setAttribute('role', type === 'error' ? 'alert' : 'status');
        c.appendChild(t);

        const remove = () => {
            t.classList.add('fade-out');
            setTimeout(() => t.remove(), 300);
        };
        const timer = setTimeout(remove, duration);

        // คลิกเพื่อปิดก่อนเวลา
        t.addEventListener('click', () => { clearTimeout(timer); remove(); });
        return t;
    }

    window.showToast = show;
    window.DSToast = {
        show,
        success: (m, d) => show(m, 'success', d),
        error:   (m, d) => show(m, 'error',   d),
        warning: (m, d) => show(m, 'warning', d),
        info:    (m, d) => show(m, 'info',    d),
    };
})();
