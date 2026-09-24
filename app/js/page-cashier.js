/** CafeFlow — แคชเชียร์ (§12, §16, §24) */
const CashierPage = {

    // view state เท่านั้น — ไม่เก็บข้อมูล เพื่อให้ remote change re-render ได้โดยไม่เสีย tab/คำค้น
    state: { tab: 'cash', q: '', status: '' },

    /* ══════════════════════════════════════════════════════
       RENDER
       ══════════════════════════════════════════════════════ */
    render() {
        this.refreshSlipOcr();
        const k = CFKpi.summary();
        const shift = CFStore.openShift();
        const me = CFAuth.getUser();

        document.getElementById('cashierSub').textContent =
            (me ? me.full_name + ' · ' : '') + (shift ? 'รอบ ' + shift.id : 'ยังไม่เปิดรอบ');

        const kpi = (icon, value, label, critical) => `
            <div class="sip-kpi ${critical ? 'critical' : ''}">
                <i data-lucide="${icon}" class="sip-kpi-icon icon-lg"></i>
                <div class="sip-kpi-value">${value}</div>
                <div class="sip-kpi-label">${label}</div>
            </div>`;

        document.getElementById('kpiStrip').innerHTML =
            kpi('banknote', CFApp.int(k.waitingCash), 'รอรับเงินสด', k.waitingCash > 3) +
            kpi('search-check', CFApp.int(k.paymentReview), 'รอตรวจสอบการชำระ', k.paymentReview > 0) +
            kpi('bell-ring', CFApp.int(k.ready), 'พร้อมรับ') +
            kpi('wallet', CFApp.baht(k.cash), 'เงินสดรอบนี้');

        document.getElementById('cntCash').textContent   = k.waitingCash;
        document.getElementById('cntReview').textContent = k.paymentReview;
        document.getElementById('cntReady').textContent  = k.ready;

        // แท็บ
        document.querySelectorAll('#tabs .ds-tab').forEach((b, i) => {
            b.classList.toggle('active', ['cash', 'review', 'ready', 'search'][i] === this.state.tab);
        });
        document.getElementById('searchBar').style.display = this.state.tab === 'search' ? '' : 'none';

        this.renderList();
        CFApp.applyRoleGate();
        refreshIcons();
    },

    currentOrders() {
        const all = CFStore.all('orders');
        if (this.state.tab === 'cash')   return all.filter((o) => o.status === 'WAITING_CASH');
        if (this.state.tab === 'review') return all.filter((o) => ['PAYMENT_REVIEW', 'PAYMENT_TIMEOUT'].includes(o.status));
        if (this.state.tab === 'ready')  return all.filter((o) => o.status === 'READY');

        const q = this.state.q.trim().toLowerCase();
        return all.filter((o) => {
            if (this.state.status && o.status !== this.state.status) return false;
            if (!q) return true;
            return o.orderNo.toLowerCase().includes(q) || o.kioskId.toLowerCase().includes(q);
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 40);
    },

    renderList() {
        const e = CFApp.esc;
        const orders = this.currentOrders();
        const area = document.getElementById('orderArea');

        if (!orders.length) {
            area.innerHTML = `<div class="ds-empty">
                <i data-lucide="inbox" class="icon-lg"></i>
                <div style="margin-top:8px">${this.state.tab === 'search' ? 'ไม่พบออเดอร์ที่ค้นหา' : 'ไม่มีรายการในแท็บนี้'}</div>
            </div>`;
            return;
        }

        area.innerHTML = '<div class="cf-order-grid">' + orders.map((o) => {
            const items = CFOrders.items(o.id);
            const lines = items.slice(0, 3).map((i) =>
                `<div class="td-sub">${i.qty} × ${e(i.nameSnapshot)}</div>`).join('');
            const more = items.length > 3 ? `<div class="td-sub">และอีก ${items.length - 3} รายการ</div>` : '';

            return `<div class="sip-card sip-card-hover" onclick="CashierPage.open('${o.id}')">
                <div class="flex flex-between gap-md" style="align-items:flex-start">
                    <div>
                        <div style="font-size:20px;font-weight:800">${e(o.orderNo)}</div>
                        <div class="td-sub">${e(o.kioskId)} · ${CFApp.time(o.createdAt)}</div>
                    </div>
                    <div class="flex gap-sm" style="align-items:center">
                        ${CFApp.diningChip(o.diningOption)}
                        ${CFApp.statusChip(o.status)}
                    </div>
                </div>
                <div style="margin:10px 0">${lines}${more}</div>
                <div class="flex flex-between" style="align-items:baseline">
                    <span class="sip-chip ${o.paymentMethod === 'CASH' ? 'sip-chip-amber' : 'sip-chip-progress'}">
                        ${o.paymentMethod === 'CASH' ? 'เงินสด' : 'QR'}
                    </span>
                    <span class="cf-amount-big" style="font-size:22px">${CFApp.baht(o.total)}</span>
                </div>
            </div>`;
        }).join('') + '</div>';
    },

    setTab(tab) { this.state.tab = tab; this.render(); },
    onSearch(v) { this.state.q = v; this.renderList(); refreshIcons(); },
    onStatus(v) { this.state.status = v; this.renderList(); refreshIcons(); },

    /* ══════════════════════════════════════════════════════
       เปิดออเดอร์ — เลือก drawer ตามสถานะ
       ══════════════════════════════════════════════════════ */
    open(orderId) {
        const o = CFStore.byId('orders', orderId);
        if (!o) return;
        if (o.status === 'WAITING_CASH') return this.openReceiveCash(orderId);
        if (['PAYMENT_REVIEW', 'PAYMENT_TIMEOUT'].includes(o.status)) return this.openReview(orderId);
        return this.openDetail(orderId);
    },

    _itemsHtml(orderId) {
        const e = CFApp.esc;
        return CFOrders.items(orderId).map((i) => `
            <div class="flex flex-between gap-md" style="padding:6px 0;border-bottom:1px solid var(--border-light)">
                <div>
                    <div style="font-weight:600">${i.qty} × ${e(i.nameSnapshot)}${e(CFApp.serveSuffix(i.serveType))}</div>
                    ${i.mods && i.mods.length ? `<div class="td-sub">${e(CFApp.modsText(i))}</div>` : ''}
                </div>
                <div class="cf-money">${CFApp.money(i.unitPrice * i.qty)}</div>
            </div>`).join('');
    },

    /* ── §12 รับเงินสด ─────────────────────────────────── */
    openReceiveCash(orderId) {
        const o = CFStore.byId('orders', orderId);
        this._cash = { orderId, received: null };

        Drawer.open({
            title: 'รับชำระเงินสด — ' + CFApp.esc(o.orderNo),
            width: '520px',
            contentHtml: `
                <div class="ds-section-label">รายการ</div>
                ${this._itemsHtml(orderId)}

                <div class="flex flex-between" style="margin:14px 0 4px;align-items:baseline">
                    <span class="sip-label" style="margin:0">ยอดที่ต้องชำระ</span>
                    <span class="cf-amount-big">${CFApp.baht(o.total)}</span>
                </div>

                <div class="ds-section-label" style="margin-top:16px">รับเงินมา</div>
                <input class="sip-input" id="cashIn" type="number" inputmode="decimal" min="0" step="1"
                       placeholder="0.00" oninput="CashierPage.onCashInput()">
                <div class="cf-quick-cash">
                    ${[o.total, 100, 500, 1000].filter((v, i, a) => a.indexOf(v) === i).map((v) =>
                        `<button type="button" class="ds-chip-toggle" onclick="CashierPage.quickCash(${v})">${CFApp.money(v)}</button>`
                    ).join('')}
                </div>

                <div class="flex flex-between" style="margin-top:16px;align-items:baseline">
                    <span class="sip-label" style="margin:0">เงินทอน</span>
                    <span class="cf-amount-big" id="changeOut" style="font-size:26px">—</span>
                </div>
                <div id="cashWarn"></div>`,
            footerHtml: `
                <button class="btn btn-outline" onclick="Drawer.close()">ยกเลิก</button>
                <button class="btn btn-primary" id="btnTakeCash" onclick="CashierPage.takeCash()" disabled>
                    <i data-lucide="check" class="icon-sm"></i> รับชำระ
                </button>`,
            onOpen: (body) => {
                refreshIcons();
                const el = body.querySelector('#cashIn');
                if (el) el.focus();
            },
        });
    },

    quickCash(v) {
        const el = document.getElementById('cashIn');
        el.value = v;
        this.onCashInput();
    },

    onCashInput() {
        const o = CFStore.byId('orders', this._cash.orderId);
        const v = parseFloat(document.getElementById('cashIn').value);
        const out = document.getElementById('changeOut');
        const warn = document.getElementById('cashWarn');
        const btn = document.getElementById('btnTakeCash');

        this._cash.received = isNaN(v) ? null : v;

        if (isNaN(v)) { out.textContent = '—'; warn.innerHTML = ''; btn.disabled = true; return; }
        if (v < o.total) {
            out.textContent = '—';
            warn.innerHTML = '<div class="ds-block"><i data-lucide="alert-circle" class="icon-sm"></i> เงินที่รับมาน้อยกว่ายอดที่ต้องชำระ</div>';
            btn.disabled = true;
            refreshIcons();
            return;
        }
        out.textContent = CFApp.baht(v - o.total);
        warn.innerHTML = '';
        btn.disabled = false;
    },

    async takeCash() {
        const { orderId, received } = this._cash;
        const o = CFStore.byId('orders', orderId);
        if (received == null || received < o.total) return;

        // blur ก่อน เพราะ Drawer.confirm resolve true เมื่อกด Enter
        if (document.activeElement) document.activeElement.blur();

        const ok = await Drawer.confirm({
            title: 'ยืนยันการรับเงินสด',
            message: 'ออเดอร์ ' + o.orderNo,
            lines: ['ยอดชำระ ' + CFApp.baht(o.total), 'รับเงิน ' + CFApp.baht(received), 'เงินทอน ' + CFApp.baht(received - o.total)],
            confirmText: 'รับชำระ', danger: false,
        });
        if (!ok) return;

        // เซิร์ฟเวอร์สร้าง Payment แล้ว chain SENT_TO_KITCHEN ให้เอง
        // → ตั๋วไปโผล่ที่ KDS ทุกจอผ่าน SSE
        if (await CFOrders.transition(orderId, 'PAID', { received })) {
            Drawer.close();
            showToast('รับชำระ ' + o.orderNo + ' แล้ว — ส่งเข้าครัวอัตโนมัติ', 'success');
        }
    },

    /* ── §16 ตรวจสอบ / ยืนยันการชำระแทน ────────────────── */
    /** ผล OCR มาถึงหลังเปิด drawer ไปแล้ว ~6 วิ — เติมเฉพาะกล่องผลตรวจ */
    refreshSlipOcr() {
        const el = document.getElementById('slipOcrBox');
        if (!el || !this._review) return;
        const slip = CFStore.where('slips', (s) => s.orderId === this._review.orderId).slice(-1)[0] || null;
        const html = CFApp.slipOcrHtml(slip);
        if (el.innerHTML !== html) { el.innerHTML = html; refreshIcons(); }
    },

    openReview(orderId) {
        const e = CFApp.esc;
        const o = CFStore.byId('orders', orderId);
        // สลิปที่ลูกค้าสแกนที่คีออสก์ (ใบล่าสุด) — ไม่มี = ลูกค้ากดแจ้งพนักงานโดยไม่ได้สแกน
        const slip = CFStore.where('slips', (s) => s.orderId === orderId).slice(-1)[0] || null;
        const limit = CFAuth.overrideLimit();
        const overLimit = limit != null && o.total > limit;

        this._review = { orderId, reason: '' };

        Drawer.open({
            title: 'ตรวจสอบการชำระ — ' + e(o.orderNo),
            width: '560px',
            contentHtml: `
                <div class="sip-banner sip-banner-warning" style="margin-bottom:12px">
                    <i data-lucide="alert-triangle" class="icon-sm"></i>
                    ${slip
                        ? 'ลูกค้าสแกนสลิปที่คีออสก์แล้ว — <strong>ดูแจ้งเตือนเงินเข้าของร้าน</strong> ว่ามียอด ฿' +
                          CFApp.money(o.total) + ' เข้ามาจริงก่อนยืนยัน'
                        : 'ลูกค้าแจ้งพนักงานโดยไม่ได้สแกนสลิป — ขอดูสลิปจากมือถือลูกค้า และเช็กเงินเข้าก่อนยืนยัน'}
                </div>

                <div class="ds-section-label">ข้อมูลการชำระ</div>
                <table class="ds-table-grid">
                    <tr><th class="l" style="width:35%">ยอดที่ต้องได้รับ</th><td class="r"><strong>${CFApp.money(o.total)}</strong></td></tr>
                    <tr><th class="l">สลิป</th><td class="l">${slip ? 'สแกนแล้ว ' + CFApp.time(slip.createdAt) : 'ไม่มี'}</td></tr>
                    <tr><th class="l">ธนาคารผู้โอน</th><td class="l">${slip ? e(slip.bankName || slip.bankCode || '—') : '—'}</td></tr>
                    <tr><th class="l">เลขอ้างอิง</th><td class="l">${slip ? e(slip.ref) : '—'}</td></tr>
                    <tr><th class="l">สลิปซ้ำ</th><td class="l">${slip ? 'ไม่ซ้ำ — ยังไม่เคยใช้กับออเดอร์อื่น' : '—'}</td></tr>
                </table>
                <div id="slipOcrBox">${CFApp.slipOcrHtml(slip)}</div>
                ${slip && slip.hasImage ? `
                <div class="ds-section-label" style="margin-top:12px">ภาพสลิปที่กล้องคีออสก์ถ่ายไว้</div>
                <a href="/api/slips/${e(slip.id)}/image" target="_blank" rel="noopener" title="เปิดภาพเต็ม">
                    <img src="/api/slips/${e(slip.id)}/image" alt="ภาพสลิป"
                         style="display:block;width:100%;max-height:360px;object-fit:contain;
                                background:#111;border-radius:8px">
                </a>` : ''}
                ${slip ? `<div class="ds-note" style="margin-top:6px">
                    QR บนสลิปบอกได้แค่เลขอ้างอิง ไม่มียอดเงินหรือบัญชีปลายทาง
                    — ระบบยังไม่ได้ตรวจกับธนาคาร จึงต้องดูเงินเข้าจริงก่อนทุกครั้ง
                </div>` : ''}

                <div class="ds-section-label">รายการ</div>
                ${this._itemsHtml(orderId)}

                <div class="ds-section-label" style="margin-top:14px">เหตุผลในการยืนยันแทนระบบ (บังคับ)</div>
                <textarea class="sip-textarea" id="ovReason" rows="2"
                          placeholder="เช่น ตรวจสลิปจากแอปธนาคารของลูกค้าแล้ว ยอดและเวลาตรงกัน"
                          oninput="CashierPage.onReason(this.value)"></textarea>
                <div class="ds-chips">
                    ${['เงินเข้าบัญชีร้านแล้ว ยอดตรง', 'ตรวจสลิปจากมือถือลูกค้าแล้ว ยอดตรง', 'ลูกค้าชำระเงินสดแทน']
                        .map((r) => `<button type="button" class="ds-chip-suggest"
                            onclick="CashierPage.setReason('${e(r)}')">${e(r)}</button>`).join('')}
                </div>

                ${overLimit ? `<div class="ds-block" style="margin-top:12px">
                    <i data-lucide="shield-alert" class="icon-sm"></i>
                    ยอดนี้ (${CFApp.baht(o.total)}) เกินเพดานการยืนยันแทนของคุณ (${CFApp.baht(limit)})
                    — ต้องให้ผู้จัดการเป็นผู้ยืนยัน
                </div>` : ''}

                <div class="ds-note" style="margin-top:12px">
                    ระบบจะบันทึกผู้ยืนยัน เหตุผล และเวลา ลงในประวัติของออเดอร์นี้
                </div>`,
            footerHtml: `
                <button class="btn btn-danger" onclick="CashierPage.failPayment()">ชำระไม่สำเร็จ</button>
                <button class="btn btn-primary" id="btnOverride" ${overLimit ? 'disabled' : ''}
                        onclick="CashierPage.confirmOverride()" disabled>
                    <i data-lucide="check" class="icon-sm"></i> ยืนยันการชำระ
                </button>`,
            onOpen: () => refreshIcons(),
        });
    },

    onReason(v) {
        this._review.reason = v;
        const btn = document.getElementById('btnOverride');
        const o = CFStore.byId('orders', this._review.orderId);
        const limit = CFAuth.overrideLimit();
        const overLimit = limit != null && o.total > limit;
        if (btn) btn.disabled = overLimit || !v.trim();
    },

    setReason(r) {
        const el = document.getElementById('ovReason');
        el.value = r;
        this.onReason(r);
    },

    async confirmOverride() {
        const { orderId, reason } = this._review;
        if (!reason.trim()) return;
        if (document.activeElement) document.activeElement.blur();

        const o = CFStore.byId('orders', orderId);
        const ok = await Drawer.confirm({
            title: 'ยืนยันการชำระแทนระบบ?',
            message: 'ออเดอร์ ' + o.orderNo + ' · ' + CFApp.baht(o.total),
            lines: [reason],
            note: 'ชื่อของคุณจะถูกบันทึกเป็นผู้ยืนยัน',
            confirmText: 'ยืนยัน', danger: true,
        });
        if (!ok) return;

        if (await CFOrders.transition(orderId, 'PAID', { reason, override: true })) {
            Drawer.close();
            showToast('ยืนยันการชำระ ' + o.orderNo + ' แล้ว', 'success');
        }
    },

    async failPayment() {
        const { orderId, reason } = this._review;
        if (!reason.trim()) { showToast('ต้องระบุเหตุผลก่อน', 'error'); return; }
        if (document.activeElement) document.activeElement.blur();

        const o = CFStore.byId('orders', orderId);
        const ok = await Drawer.confirm({
            title: 'บันทึกว่าชำระไม่สำเร็จ?',
            message: 'ออเดอร์ ' + o.orderNo,
            lines: [reason], confirmText: 'บันทึก', danger: true,
        });
        if (!ok) return;

        if (await CFOrders.transition(orderId, 'PAYMENT_FAILED', { reason })) {
            Drawer.close();
            showToast('บันทึกแล้ว — ออเดอร์กลับไปรอชำระใหม่ได้', 'warning');
        }
    },

    /* ── ดูรายละเอียด / ส่งมอบ ─────────────────────────── */
    openDetail(orderId) {
        const e = CFApp.esc;
        const o = CFStore.byId('orders', orderId);
        const next = CFOrders.nextStates(o);

        Drawer.open({
            title: 'ออเดอร์ ' + e(o.orderNo),
            width: '480px',
            contentHtml: `
                <div class="flex flex-between gap-md" style="margin-bottom:12px">
                    ${CFApp.statusChip(o.status)}
                    <span class="cf-amount-big" style="font-size:24px">${CFApp.baht(o.total)}</span>
                </div>
                <div class="td-sub" style="margin-bottom:10px">${e(o.kioskId)} · ${CFApp.dateTime(o.createdAt)}</div>
                ${this._itemsHtml(orderId)}`,
            footerHtml: `
                <button class="btn btn-outline" onclick="CFDocs.previewReceipt('${o.id}')">
                    <i data-lucide="printer" class="icon-sm"></i> ใบเสร็จ
                </button>
                ${next.includes('SERVED') ? `<button class="btn btn-primary" onclick="CashierPage.serve('${o.id}')">
                    <i data-lucide="hand-platter" class="icon-sm"></i> ส่งมอบลูกค้า</button>` : ''}`,
            onOpen: () => refreshIcons(),
        });
    },

    async serve(orderId) {
        // ต้องรอ SERVED สำเร็จก่อน — ยิง COMPLETED ตามไปทันทีจะถูกปฏิเสธเพราะสถานะยังไม่ขยับ
        if (await CFOrders.transition(orderId, 'SERVED')) {
            await CFOrders.transition(orderId, 'COMPLETED');
            Drawer.close();
            showToast('ส่งมอบเรียบร้อย', 'success');
        }
    },

    boot() {
        CFApp.boot({ page: 'cashier' });

        // เติมตัวเลือกสถานะในช่องค้นหา
        document.getElementById('searchStatus').innerHTML +=
            Object.keys(CF_STATUS).map((s) => `<option value="${s}">${CF_STATUS[s].label}</option>`).join('');

        this.render();
        CFStore.subscribe(() => this.render());
    },
};

window.CashierPage = CashierPage;
CFBoot.ready(() => CashierPage.boot());
