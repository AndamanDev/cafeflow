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

    /* ══════════════════════════════════════════════════════
       พิมพ์ผ่านเซิร์ฟเวอร์
       ------------------------------------------------------
       พรีวิวเป็นภาพที่เซิร์ฟเวอร์วาด = บิตแมปชุดเดียวกับที่ส่งเข้าเครื่องพิมพ์
       กด "พิมพ์" แล้วออกที่เครื่องพิมพ์เลย ไม่ผ่านหน้าต่างพิมพ์ของเบราว์เซอร์
       ความกว้างกระดาษมาจากเครื่องพิมพ์จริง จึงไม่มีปุ่มสลับขนาด

       opts: { title, previewPath, printPath, printBody, fallback }
         fallback = ตัวเลือกของ preview() เดิม — ใช้เมื่อยังไม่ได้ตั้งเครื่องพิมพ์
       ══════════════════════════════════════════════════════ */
    previewServer(opts) {
        this._server = opts;
        Drawer.open({
            title: CFApp.esc(opts.title),
            width: '460px',
            contentHtml: '<div class="ds-empty-sm">กำลังสร้างภาพตัวอย่าง…</div>',
            footerHtml: '<button class="btn btn-outline" onclick="Drawer.close()">ปิด</button>',
        });

        CFApi.get(opts.previewPath).then((r) => {
            if (this._server !== opts) return;              // เปิดใบอื่นไปแล้ว
            // ทางสำรองผ่านเบราว์เซอร์ก็ต้องใช้ขนาดของเครื่องพิมพ์จริง ไม่ใช่ค่าตั้งเก่าใน settings
            if (opts.fallback && CF_PAPER[r.width]) {
                opts.fallback.size = r.width;
                opts.fallback.sizes = null;
            }
            const p = r.printer;
            const ready = p && p.ready;
            const panel = document.querySelector('#drawerRoot .drawer-panel');
            // 1 จุดของเครื่องพิมพ์ = 1 พิกเซลบนจอ — ไม่ย่อไม่ขยาย ตัวอักษรจะได้คมเท่าของจริง
            if (panel) panel.style.width = (r.dots + 84) + 'px';

            Drawer.setTitle(CFApp.esc(opts.title) +
                ' <span class="sip-chip sip-chip-muted">' + (CF_PAPER[r.width] || {}).label + '</span>');
            Drawer.setContent(`
                <div class="ds-paper-viewport is-roll">
                    <img src="${r.image}" alt="ตัวอย่างงานพิมพ์" width="${r.dots}"
                         style="display:block;margin:0 auto;max-width:100%;image-rendering:pixelated;
                                background:#fff;box-shadow:0 0 0 0.8px #DFDFDF">
                </div>`);
            Drawer.setFooter(`
                <span class="ds-hint" style="flex:1">${ready
                    ? 'พิมพ์ที่ <strong>' + CFApp.esc(p.name) + '</strong> · ' + (p.conn === 'USB' ? 'USB' : 'LAN')
                    : '<span style="color:var(--danger,#D92D20)">ยังไม่ได้ตั้งเครื่องพิมพ์ของส่วนนี้</span>'}</span>
                <button class="btn btn-outline" onclick="Drawer.close()">ปิด</button>
                ${ready
                    ? `<button class="btn btn-primary" onclick="CFPrint.runServer()">
                           <i data-lucide="printer" class="icon-sm"></i> พิมพ์</button>`
                    : `<button class="btn btn-outline" onclick="CFPrint.browserFallback()">พิมพ์ผ่านเบราว์เซอร์</button>`}`);
            refreshIcons();
        }).catch((err) => {
            if (this._server !== opts) return;
            Drawer.setContent('<div class="ds-empty-sm">' + CFApp.esc(err.message || 'สร้างภาพตัวอย่างไม่สำเร็จ') + '</div>');
        });
    },

    /** ยังไม่มีเครื่องพิมพ์ — กลับไปใช้หน้าต่างพิมพ์ของเบราว์เซอร์แบบเดิม */
    browserFallback() {
        const o = this._server;
        if (o && o.fallback) this.preview(o.fallback);
    },

    async runServer() {
        const o = this._server;
        if (!o) return;
        let r;
        try {
            r = await CFApi.post(o.printPath, o.printBody || {});
        } catch (err) {
            showToast(err.message || 'สั่งพิมพ์ไม่สำเร็จ', 'error', 5000);
            return;
        }
        Drawer.close();
        const where = r.printer ? r.printer.name : 'เครื่องพิมพ์';
        showToast('ส่งไปที่ ' + where + ' แล้ว', 'success');
        this._watchJob(r.jobId, where);
    },

    /**
     * ถามสถานะงานต่ออีกครู่ — ถ้าพิมพ์ไม่ออก (สายหลุด/เครื่องปิด) ต้องบอกคนกด
     * ไม่งั้นเขาจะคิดว่าออกแล้วและไม่มีใครรู้จนลูกค้ามาทวง
     * ⚠️ DONE แปลว่าส่งถึงเครื่องแล้ว ไม่ได้แปลว่ากระดาษออก (กระดาษหมดก็ DONE)
     */
    _watchJob(jobId, where) {
        if (!jobId) return;
        const t0 = Date.now();
        const tick = () => {
            CFApi.get('/api/print/jobs/' + jobId).then((j) => {
                if (j.status === 'FAILED') {
                    showToast('พิมพ์ไม่ออกที่ ' + where + ': ' + (j.last_error || 'ไม่ทราบสาเหตุ'), 'error', 8000);
                } else if (j.status === 'DONE') {
                    if (j.last_error) showToast(where + ' ใช้ไม่ได้ — ' + j.last_error, 'warning', 6000);
                } else if (Date.now() - t0 < 30000) {
                    setTimeout(tick, 1500);
                }
            }).catch(() => { /* ถามไม่ได้ไม่เป็นไร งานยังอยู่ในคิว */ });
        };
        setTimeout(tick, 1200);
    },

    _logPrint(ref, size) {
        try {
            CFOrders.logPrint(ref.orderId || null, ref.type, size, ref.station || null);
        } catch (e) { console.warn('[CFPrint] บันทึกประวัติการพิมพ์ไม่สำเร็จ', e); }
    },
};

window.CF_PAPER = CF_PAPER;
window.CFPrint = CFPrint;
