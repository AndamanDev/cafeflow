/* ============================================================
   CafeFlow Design System (ต้นแบบจาก MediCore) — ICONS
   ------------------------------------------------------------
   ระบบไอคอน = Lucide เท่านั้น  ·  ห้ามใช้ emoji ใน UI
   (ยกเว้นเนื้อหาที่ผู้ใช้พิมพ์เอง เช่น ช่องข้อความ)

   วิธีใช้ใน HTML:
     <i data-lucide="pill" class="mi"></i>        ← ขนาดตามฟอนต์รอบข้าง
     <i data-lucide="pill" class="icon-md"></i>   ← ขนาดคงที่ 16px

   ⚠️ หลัง render เนื้อหาใหม่ด้วย innerHTML ต้องเรียก refreshIcons() เสมอ
      ไม่งั้นไอคอนที่เพิ่งใส่จะไม่ถูกแปลงเป็น SVG

   วิธีใช้ใน JS:
     el.innerHTML = DSIcons.html('pill', { cls: 'icon-lg icon-amber' });
     refreshIcons();
   ============================================================ */

(function () {
    // Lucide เก็บในเครื่องที่ app/vendor/lucide.min.js (ทุกหน้าพนักงานโหลดเองก่อนไฟล์นี้อยู่แล้ว) — ห้ามดึง CDN: ร้านไม่มีเน็ตไอคอนหาย
    // สำเนาใน design-system-2/vendor ลบแล้ว 21/10/2569 (ซ้ำกัน ไม่มีหน้าไหนโหลด) — ตัวนี้เป็นทางสำรองเผื่อหน้าใหม่ลืมใส่ <script>
    const SELF = document.currentScript && document.currentScript.src;
    const CDN = SELF ? new URL('../../app/vendor/lucide.min.js', SELF).href : '/app/vendor/lucide.min.js';
    let loading = null;

    /** โหลด Lucide จาก CDN ถ้ายังไม่มี (คืน Promise) */
    function load() {
        if (window.lucide) return Promise.resolve(window.lucide);
        if (loading) return loading;
        loading = new Promise((resolve) => {
            const existing = document.querySelector(`script[src="${CDN}"]`);
            if (existing) {
                existing.addEventListener('load', () => resolve(window.lucide));
                return;
            }
            const s = document.createElement('script');
            s.src = CDN;
            s.onload = () => resolve(window.lucide);
            s.onerror = () => {
                console.warn('[DSIcons] โหลด Lucide ไม่สำเร็จ — ไอคอนจะไม่แสดง (navbar ยังใช้ inline SVG จึงยังปกติ)');
                resolve(null);
            };
            document.head.appendChild(s);
        });
        return loading;
    }

    /** แปลง <i data-lucide> ทั้งหมดในหน้าให้เป็น SVG */
    function render() {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
            return true;
        }
        return false;
    }

    /** โหลด (ถ้าจำเป็น) แล้ว render */
    function refresh() {
        if (render()) return Promise.resolve(true);
        return load().then(() => render());
    }

    /** สร้าง markup ไอคอนสำหรับต่อสตริง HTML */
    function html(name, opts = {}) {
        const cls = opts.cls || opts.class || 'mi';
        const size = opts.size ? ` style="width:${opts.size}px;height:${opts.size}px"` : '';
        const title = opts.title ? ` title="${String(opts.title).replace(/"/g, '&quot;')}"` : '';
        return `<i data-lucide="${name}" class="${cls}"${size}${title}></i>`;
    }

    window.DSIcons = { load, render, refresh, html };
    window.refreshIcons = refresh;

    document.addEventListener('DOMContentLoaded', () => refresh());
})();
