/* ============================================================
   MediCore Design System — DRAWER
   ------------------------------------------------------------
   แผงเลื่อนจากขวา ใช้แทน modal กลางจอในงานที่มีฟอร์ม
   รองรับ drawer ซ้อน drawer (stack) และกล่องยืนยันแบบ Promise

   วิธีใช้:
     Drawer.open({
       title: 'หัวข้อ',
       width: '560px',            // ไม่ใส่ = 480px
       contentHtml: '<div>…</div>',
       footerHtml: '<button class="btn btn-primary">บันทึก</button>',
       onOpen:  (bodyEl) => {},   // เรียกหลัง DOM commit — ผูก event ที่นี่
       onClose: () => {},         // return false = ยับยั้งการปิด
       closeOnOverlay: true,
       closeOnEsc: true
     });
     Drawer.close();
     Drawer.setContent(html);  Drawer.setFooter(html);  Drawer.setTitle(text);
     Drawer.isOpen();

     const ok = await Drawer.confirm({
       title: 'ลบรายการนี้?', message: 'ลบแล้วกู้คืนไม่ได้',
       lines: ['รายการ A'], confirmText: 'ลบ', danger: true
     });
   ============================================================ */

(function () {
    const ROOT_ID = 'drawerRoot';
    const CONFIRM_ID = 'dsConfirmRoot';
    const STACK = [];

    function ensureRoot() {
        let root = document.getElementById(ROOT_ID);
        if (root) return root;
        root = document.createElement('div');
        root.id = ROOT_ID;
        root.className = 'drawer-root hidden';
        root.innerHTML = `
            <div class="drawer-overlay" data-drawer-close></div>
            <aside class="drawer-panel" role="dialog" aria-modal="true">
                <header class="drawer-header">
                    <h3 class="drawer-title"></h3>
                    <button class="drawer-close" data-drawer-close aria-label="ปิด">✕</button>
                </header>
                <div class="drawer-body"></div>
                <footer class="drawer-footer"></footer>
            </aside>`;
        document.body.appendChild(root);
        return root;
    }

    function getEls() {
        const root = ensureRoot();
        return {
            root,
            panel:  root.querySelector('.drawer-panel'),
            title:  root.querySelector('.drawer-title'),
            body:   root.querySelector('.drawer-body'),
            footer: root.querySelector('.drawer-footer'),
        };
    }

    function snapshot() {
        const { title, body, footer, panel } = getEls();
        return {
            title: title.innerHTML,
            body: body.innerHTML,
            footer: footer.innerHTML,
            width: panel.style.width,
            opts: window.Drawer._currentOpts,
        };
    }

    function restore(snap) {
        const { title, body, footer, panel } = getEls();
        title.innerHTML  = snap.title;
        body.innerHTML   = snap.body;
        footer.innerHTML = snap.footer;
        panel.style.width = snap.width;
        window.Drawer._currentOpts = snap.opts;
    }

    function onKey(e) {
        if (e.key !== 'Escape') return;
        const opts = window.Drawer._currentOpts;
        if (opts && opts.closeOnEsc === false) return;
        window.Drawer.close();
    }

    function bindClose() {
        const { root } = getEls();
        root.addEventListener('click', (e) => {
            if (!e.target.matches('[data-drawer-close]')) return;
            const opts = window.Drawer._currentOpts;
            if (e.target.classList.contains('drawer-overlay') && opts && opts.closeOnOverlay === false) return;
            window.Drawer.close();
        });
    }

    function ensureConfirmRoot() {
        let root = document.getElementById(CONFIRM_ID);
        if (root) return root;
        root = document.createElement('div');
        root.id = CONFIRM_ID;
        root.className = 'mc-confirm-root hidden';
        root.innerHTML = '<div class="mc-confirm-overlay"></div>'
                       + '<div class="mc-confirm-box" role="alertdialog" aria-modal="true"></div>';
        document.body.appendChild(root);
        return root;
    }

    window.Drawer = {
        _currentOpts: null,
        _bound: false,

        open(opts = {}) {
            const { root, panel, title, body, footer } = getEls();
            if (!this._bound) { bindClose(); this._bound = true; }

            // drawer เปิดอยู่แล้ว → ดันของเดิมเข้า stack (drawer ซ้อน drawer)
            if (root.classList.contains('open')) STACK.push(snapshot());

            panel.style.width  = opts.width || '';
            title.innerHTML    = opts.title || '';
            body.innerHTML     = opts.contentHtml || '';
            footer.innerHTML   = opts.footerHtml || '';
            footer.style.display = opts.footerHtml ? '' : 'none';

            this._currentOpts = opts;
            root.classList.remove('hidden');
            void panel.offsetWidth;              // force reflow ให้ transition ทำงาน
            root.classList.add('open');
            document.body.classList.add('drawer-locked');
            document.addEventListener('keydown', onKey);

            if (typeof opts.onOpen === 'function') {
                setTimeout(() => opts.onOpen(body), 0);   // รอ DOM commit ก่อนผูก handler
            }
        },

        close() {
            const { root, body, footer, title, panel } = getEls();
            const opts = this._currentOpts;
            if (typeof (opts && opts.onClose) === 'function') {
                // onClose คืน false = ยับยั้งการปิด (เช่น ยังมีรายการที่ยังไม่บันทึก)
                try { if (opts.onClose() === false) return; }
                catch (e) { console.warn('Drawer onClose threw', e); }
            }

            // ถ้ามี drawer ก่อนหน้าใน stack → คืนค่ากลับแทนการปิดจริง
            if (STACK.length > 0) { restore(STACK.pop()); return; }

            root.classList.remove('open');
            document.body.classList.remove('drawer-locked');
            document.removeEventListener('keydown', onKey);
            setTimeout(() => {
                if (!root.classList.contains('open')) {
                    root.classList.add('hidden');
                    title.innerHTML = '';
                    body.innerHTML = '';
                    footer.innerHTML = '';
                    panel.style.width = '';
                    this._currentOpts = null;
                }
            }, 280);
        },

        setContent(html) { getEls().body.innerHTML = html || ''; },
        setTitle(text)   { getEls().title.innerHTML = text || ''; },
        setFooter(html)  {
            const { footer } = getEls();
            footer.innerHTML = html || '';
            footer.style.display = html ? '' : 'none';
        },
        isOpen() { return ensureRoot().classList.contains('open'); },

        /**
         * กล่องยืนยันในแอป (แทน window.confirm) — คืน Promise<boolean>
         * ใช้ root แยกที่ z-index สูงกว่า drawer จึงซ้อนบน drawer ที่เปิดอยู่ได้
         *
         * เหตุผลที่ไม่ใช้ window.confirm: เบราว์เซอร์ปิดกล่อง native ได้
         * (ติ๊ก "ไม่ต้องแสดงอีก") ซึ่งจะกลายเป็น "ยืนยันเงียบ" กับงานสำคัญ
         */
        confirm(opts = {}) {
            const root = ensureConfirmRoot();
            const esc = (s) => String(s == null ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const lines = (opts.lines || []).filter(Boolean);
            const danger = opts.danger !== false;

            root.querySelector('.mc-confirm-box').innerHTML = `
                <div class="mc-confirm-head ${danger ? 'is-danger' : ''}">${esc(opts.title || 'ยืนยันการทำรายการ')}</div>
                <div class="mc-confirm-body">
                    ${opts.message ? `<div class="mc-confirm-msg">${esc(opts.message)}</div>` : ''}
                    ${lines.length ? `<ul class="mc-confirm-list">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
                    ${opts.note ? `<div class="mc-confirm-note">${esc(opts.note)}</div>` : ''}
                </div>
                <div class="mc-confirm-foot">
                    <button type="button" class="btn btn-outline btn-sm" data-confirm="0">${esc(opts.cancelText || 'ยกเลิก')}</button>
                    <button type="button" class="btn btn-sm ${danger ? 'mc-confirm-danger' : 'btn-primary'}" data-confirm="1">${esc(opts.confirmText || 'ยืนยัน')}</button>
                </div>`;
            root.classList.remove('hidden');

            return new Promise((resolve) => {
                let done = false;
                const finish = (val) => {
                    if (done) return;
                    done = true;
                    root.classList.add('hidden');
                    root.removeEventListener('click', onClick);
                    document.removeEventListener('keydown', onKeyDown, true);
                    resolve(val);
                };
                const onClick = (e) => {
                    const btn = e.target.closest('[data-confirm]');
                    if (btn) { finish(btn.getAttribute('data-confirm') === '1'); return; }
                    if (e.target.classList.contains('mc-confirm-overlay')) finish(false);
                };
                const onKeyDown = (e) => {
                    if (e.key === 'Escape')      { e.stopPropagation(); finish(false); }
                    else if (e.key === 'Enter')  { e.stopPropagation(); finish(true); }
                };
                root.addEventListener('click', onClick);
                // capture: กัน Esc ไปถึง handler ของ drawer ข้างล่าง (จะปิด drawer ทิ้งไปด้วย)
                document.addEventListener('keydown', onKeyDown, true);
                setTimeout(() => {
                    const ok = root.querySelector('[data-confirm="1"]');
                    if (ok) ok.focus();
                }, 0);
            });
        },
    };
})();
