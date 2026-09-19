/**
 * CafeFlow — PRINT PREVIEW DRAWER
 * ------------------------------------------------------------
 * จำลองหน้ากระดาษใน drawer ก่อนเสมอ แล้วค่อยสั่งพิมพ์
 * รองรับ 3 ขนาด: 58mm · 80mm (กระดาษม้วนความร้อน) · A4 (เอกสาร)
 *
 * วิธีใช้:
 *   CFPrint.preview({
 *     title: 'ใบเสร็จรับเงิน',
 *     size: '80mm',
 *     sizes: ['58mm','80mm'],          // มีปุ่มสลับความกว้างในหัว drawer
 *     build: (size) => '<div>...</div>',
 *     docRef: { type:'receipt', orderId:'O-A105' },
 *   });
 */

const CF_PAPER = {
    '58mm': { cls: 'ds-paper-58', drawer: '420px', label: '58 มม.', roll: true,
              page: '@page { size: 58mm auto; margin: 2mm 2mm 4mm; }' },
    '80mm': { cls: 'ds-paper-80', drawer: '520px', label: '80 มม.', roll: true,
              page: '@page { size: 80mm auto; margin: 3mm 3mm 5mm; }' },
    'A4':   { cls: '',            drawer: 'min(96vw, 900px)', label: 'A4', roll: false,
              page: '@page { size: A4 portrait; margin: 12mm 12mm 18mm; }' },
};

const CFPrint = {

    _current: null,   // { title, size, sizes, build, docRef }

    preview(opts) {
        const size = CF_PAPER[opts.size] ? opts.size : 'A4';
        this._current = {
            title: opts.title || 'เอกสาร',
            size,
            sizes: opts.sizes || null,
            build: opts.build,
            docRef: opts.docRef || null,
        };

        Drawer.open({
            title: this._headerHtml(),
            width: CF_PAPER[size].drawer,
            contentHtml: this._bodyHtml(),
            footerHtml: this._footerHtml(),
            onOpen: () => refreshIcons(),
        });
    },

    /** สลับความกว้างในที่เดิม ไม่ต้องปิด-เปิด drawer ใหม่ เพื่อให้เทียบได้ทันที */
    setSize(size) {
        if (!this._current || !CF_PAPER[size]) return;
        this._current.size = size;

        const panel = document.querySelector('#drawerRoot .drawer-panel');
        if (panel) panel.style.width = CF_PAPER[size].drawer;

        Drawer.setTitle(this._headerHtml());
        Drawer.setContent(this._bodyHtml());
        Drawer.setFooter(this._footerHtml());
        refreshIcons();
    },

    _headerHtml() {
        const c = this._current;
        return CFApp.esc(c.title) + ' <span class="sip-chip sip-chip-muted">' + CF_PAPER[c.size].label + '</span>';
    },

    _bodyHtml() {
        const c = this._current;
        const p = CF_PAPER[c.size];
        let html = '';
        try { html = c.build(c.size); }
        catch (e) { console.error(e); html = '<div class="ds-empty">สร้างเอกสารไม่สำเร็จ</div>'; }

        return `
            ${c.sizes && c.sizes.length > 1 ? `
            <div class="ds-toolbar" style="justify-content:space-between">
                <span class="ds-hint">ความกว้างกระดาษ</span>
                <div class="ds-segbar">
                    ${c.sizes.map((s) => `<button class="ds-seg ${s === c.size ? 'active' : ''}"
                        onclick="CFPrint.setSize('${s}')">${CF_PAPER[s].label}</button>`).join('')}
                </div>
            </div>` : ''}
            <div class="ds-paper-viewport${p.roll ? ' is-roll' : ''}">
                <div class="ds-paper ${p.cls}" id="cfPaper">${html}</div>
            </div>`;
    },

    _footerHtml() {
        const c = this._current;
        const hint = CF_PAPER[c.size].roll
            ? 'เครื่องพิมพ์ความร้อน ' + CF_PAPER[c.size].label
            : 'กระดาษ A4 แนวตั้ง';
        return `<span class="ds-hint" style="flex:1">${hint}</span>
                <button class="btn btn-outline" onclick="Drawer.close()">ปิด</button>
                <button class="btn btn-primary" onclick="CFPrint.run()">
                    <i data-lucide="printer" class="icon-sm"></i> พิมพ์
                </button>`;
    },

    /* ══════════════════════════════════════════════════════
       การพิมพ์จริง
       ------------------------------------------------------
       ใช้ "สูตร A" ของ ds-print.css (#dsPrintStage)
       พิมพ์ทั้งที่ drawer เปิดอยู่ได้ปลอดภัย เพราะ
         1. body.ds-printing * {visibility:hidden} ซ่อน drawer ไปด้วย
         2. สูตร B ซึ่ง apply เสมอ มี .drawer-root{display:none} อยู่แล้ว
       ข้อ 2 คือเหตุผลที่ต้อง "คัดลอก" outerHTML ไม่ใช่ย้าย node
       ══════════════════════════════════════════════════════ */
    run() {
        const c = this._current;
        if (!c) return;
        const paper = document.getElementById('cfPaper');
        const stage = document.getElementById('dsPrintStage');
        if (!paper || !stage) { showToast('ไม่พบพื้นที่สำหรับพิมพ์', 'error'); return; }

        stage.innerHTML = paper.outerHTML;
        document.body.classList.add('ds-printing');
        if (CF_PAPER[c.size].roll) {
            document.body.classList.add('print-roll');
            document.body.classList.add(c.size === '58mm' ? 'print-58' : 'print-80');
        }
        this._injectPage(c.size);

        const cleanup = () => {
            document.body.classList.remove('ds-printing', 'print-roll', 'print-58', 'print-80');
            stage.innerHTML = '';
            const s = document.getElementById('cfPageStyle');
            if (s) s.remove();
            window.removeEventListener('afterprint', cleanup);
            clearTimeout(this._safety);
        };
        window.addEventListener('afterprint', cleanup);
        // onafterprint ไม่การันตี (Safari เก่า, บาง cancel path)
        // ถ้าไม่มีตาข่ายนี้ #dsPrintStage และ @page จะค้าง ทำให้พิมพ์ครั้งถัดไปเพี้ยน
        this._safety = setTimeout(cleanup, 20000);

        if (c.docRef) this._logPrint(c.docRef, c.size);
        setTimeout(() => window.print(), 60);   // รอ layout นิ่งก่อน
    },

    /**
     * @page เลือกด้วย body class ไม่ได้ (page context ไม่มี element ให้ select)
     * และ named pages (@page receipt) Firefox ยังไม่รองรับ
     * → ใส่ <style> ต่อท้าย document.head ซึ่งชนะ @page ของ ds-print.css ด้วย source order
     *
     * หมายเหตุ: ds-print.css ประกาศ @page ไว้สองที่ และทั้งคู่ active เสมอ
     * ของจริงที่มีผลคือสูตร B (A4 14mm) จึงต้อง inject ทับแม้ในสาขา A4
     */
    _injectPage(size) {
        const old = document.getElementById('cfPageStyle');
        if (old) old.remove();                      // ห้ามเหลือสองอัน
        const el = document.createElement('style');
        el.id = 'cfPageStyle';
        el.textContent = CF_PAPER[size].page;
        document.head.appendChild(el);
    },

    _logPrint(ref, size) {
        try {
            CFOrders.logPrint(ref.orderId || null, ref.type, size, ref.station || null);
        } catch (e) { console.warn('[CFPrint] บันทึกประวัติการพิมพ์ไม่สำเร็จ', e); }
    },
};

window.CF_PAPER = CF_PAPER;
window.CFPrint = CFPrint;
