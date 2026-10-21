/**
 * CafeFlow — ตารางแบบ DataTables (ค้นหา · กดหัวคอลัมน์เรียง · แบ่งหน้า)
 * ------------------------------------------------------------
 * ผู้ใช้ขอ 21/10/2569: "พวกที่ใช้ table ปรับให้ใช้ datatable jquery"
 * ไลบรารีเก็บในเครื่อง app/vendor/datatables/ (ร้านต้องใช้ได้ตอนเน็ตหลุด) — ต้องโหลดหลัง jQuery + DataTables
 *
 * วิธีใช้: วาด <table id="..."> ด้วย HTML string เหมือนเดิม แล้วเรียก
 *     CFTable.mount('tableId', { ...ตัวเลือก DataTables เพิ่มเติม })
 *   - เรียกซ้ำได้ทุกครั้งที่วาดใหม่ (store เปลี่ยน) — ตัวเก่าถูกทิ้ง และหน้า/คำค้น/การเรียงเดิมกลับมาเอง
 *   - th ที่มี class "no-sort" (ปุ่ม · ที่จับลาก) กดเรียงไม่ได้
 *   - แถวไม่เกิน 10 → ซ่อนช่องค้นหา/แบ่งหน้า (ยังกดเรียงได้) · ส่ง { small: false } ถ้าต้องการช่องค้นหาเสมอ
 *   - ห้ามมีแถว colspan ใน tbody (DataTables นับคอลัมน์ไม่ตรงแล้วเตือน) — ตารางว่างใช้ language.emptyTable แทน
 *
 * ⚠️ drawer ย้อนหน้าด้วย innerHTML (ds-drawer.js) — ตารางที่เคย mount กลับมาเป็นซาก HTML ที่ไม่มีตัวจัดการ
 *    observer ด้านล่างเจอซากใน #drawerRoot แล้วแทนด้วย HTML ต้นฉบับและ mount ใหม่ให้เอง
 */
const CFTable = (() => {
    const TH = {
        search: '', searchPlaceholder: 'ค้นหา…',
        lengthMenu: 'แสดง _MENU_ รายการ',
        info: '_START_–_END_ จาก _TOTAL_ รายการ',
        infoEmpty: 'ไม่มีรายการ',
        infoFiltered: '(ค้นจาก _MAX_ รายการ)',
        zeroRecords: 'ไม่พบรายการที่ค้นหา',
        emptyTable: 'ยังไม่มีข้อมูล',
        paginate: { first: '«', previous: '‹', next: '›', last: '»' },
        aria: { orderable: 'กดเพื่อเรียง', orderableReverse: 'กดเพื่อเรียงกลับ', orderableRemove: 'กดเพื่อยกเลิกการเรียง' },
    };
    const SMALL = 10;
    const live = new Map();       // id → instance ที่ยังใช้อยู่
    const state = new Map();      // id → { page, len, search, order } — คงไว้ข้ามการวาดใหม่
    const origin = new Map();     // id → { html, opts } — HTML ก่อน mount ไว้ซ่อมหลัง drawer restore

    // ตารางผิดรูปไม่ควรเด้ง alert ใส่พนักงาน — เขียนลง console พอ
    if (window.DataTable) DataTable.ext.errMode = (s, tn, msg) => console.warn('[CFTable]', msg);

    function mount(idOrEl, opts) {
        const table = typeof idOrEl === 'string' ? document.getElementById(idOrEl) : idOrEl;
        if (!table || !window.DataTable) return null;
        const id = table.id;
        opts = opts || {};

        const old = id && live.get(id);
        if (old) { try { old.destroy(); } catch (e) { /* ตารางเก่าถูกถอดจากหน้าไปแล้ว */ } live.delete(id); }
        if (id) origin.set(id, { html: table.outerHTML, opts });

        const rows = table.tBodies[0] ? table.tBodies[0].rows.length : 0;
        const small = opts.small !== false && rows <= SMALL;
        const saved = id && state.get(id);
        const { small: _s, onDraw, ...dtOpts } = opts;

        const dt = new DataTable(table, Object.assign({
            language: TH,
            autoWidth: false,
            order: saved ? saved.order : [],          // ไม่ใส่ = คงลำดับที่ส่งมา (เช่นลำดับบนคีออสก์)
            search: { search: saved ? saved.search : '' },
            pageLength: saved ? saved.len : 20,
            lengthMenu: [20, 50, 100],
            displayStart: saved ? saved.page * saved.len : 0,
            paging: !small, searching: !small, info: !small,
            // ตารางเล็ก: ไม่วาดแถวค้นหา/แบ่งหน้าเลย (ไม่งั้นเหลือแถบว่างเหนือและใต้ตาราง)
            ...(small ? { layout: { topStart: null, topEnd: null, bottomStart: null, bottomEnd: null } } : {}),
            columnDefs: [{ targets: 'no-sort', orderable: false }],
        }, dtOpts));

        if (id) {
            live.set(id, dt);
            dt.on('draw', () => {
                const info = dt.page.info();
                state.set(id, { page: info.page, len: info.length > 0 ? info.length : 20, search: dt.search(), order: dt.order() });
                if (onDraw) onDraw(dt);
            });
        }
        if (onDraw) onDraw(dt);
        return dt;
    }

    /** ลืมหน้า/คำค้น/การเรียงที่จำไว้ — เปิดลิ้นชักใหม่ทั้งชุดควรเริ่มที่หน้าแรก */
    function reset(id) { state.delete(id); }
    /** กลับหน้าแรกในการวาดครั้งถัดไป (คำค้น/การเรียงยังอยู่) — ใช้ตอนชุดข้อมูลเปลี่ยน เช่นเปลี่ยนหมวด */
    function firstPage(id) { const st = state.get(id); if (st) st.page = 0; }
    function get(id) { return live.get(id) || null; }

    /** ซ่อมตารางที่ drawer เอากลับมาเป็นซาก HTML (wrapper .dt-container ที่ไม่มีตัวจัดการแล้ว) */
    function repair(root) {
        root.querySelectorAll('.dt-container').forEach((box) => {
            const t = box.querySelector('table[id]');
            if (!t || DataTable.isDataTable(t)) return;
            const o = origin.get(t.id);
            if (!o) return;
            const tmp = document.createElement('div');
            tmp.innerHTML = o.html;
            const fresh = tmp.firstElementChild;
            live.delete(t.id);
            box.replaceWith(fresh);
            mount(fresh, o.opts);
        });
    }
    let fixing = false;
    function watchDrawer() {
        const root = document.getElementById('drawerRoot');
        if (!root) return false;
        new MutationObserver(() => {
            if (fixing) return;
            fixing = true;
            try { repair(root); } finally { fixing = false; }
        }).observe(root, { childList: true, subtree: true });
        return true;
    }
    // #drawerRoot ถูกสร้างตอนเปิด drawer ครั้งแรก — รอจนกว่าจะมี
    if (!watchDrawer()) {
        const wait = new MutationObserver(() => { if (watchDrawer()) wait.disconnect(); });
        const start = () => wait.observe(document.body, { childList: true });
        if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
    }

    return { mount, reset, firstPage, get, TH };
})();

window.CFTable = CFTable;
