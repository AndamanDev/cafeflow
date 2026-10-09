/** CafeFlow — แคชเชียร์ (§12, §16, §24) */

/** เหตุผลที่แปลว่ารับเป็นเงินสด — ส่ง method: 'CASH' ไปด้วย */
const CASH_INSTEAD_REASON = 'ลูกค้าชำระเงินสดแทน';

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
        this.renderShiftAlert(shift);
        const me = CFAuth.getUser();

        document.getElementById('cashierSub').textContent =
            (me ? me.full_name + ' · ' : '') + (shift ? 'รอบ ' + shift.id : 'ยังไม่เปิดรอบ');

        this._autoTab(k);

        // การ์ดตัวเลขกดแล้วไปแท็บนั้น — ไม่งั้นซ้ำกับตัวเลขบนแท็บเฉย ๆ
        const kpi = (icon, value, label, critical, tab) => `
            <div class="sip-kpi ${critical ? 'critical' : ''}"
                 ${tab ? `role="button" tabindex="0" onclick="CashierPage.setTab('${tab}')"
                    onkeydown="if(event.key==='Enter')CashierPage.setTab('${tab}')"
                    style="cursor:pointer;${this.state.tab === tab ? 'outline:2px solid var(--primary);outline-offset:-2px' : ''}"` : ''}>
                <i data-lucide="${icon}" class="sip-kpi-icon icon-lg"></i>
                <div class="sip-kpi-value">${value}</div>
                <div class="sip-kpi-label">${label}</div>
            </div>`;

        document.getElementById('kpiStrip').innerHTML =
            kpi('banknote', CFApp.int(k.waitingCash), 'รอรับเงินสด', k.waitingCash > 3, 'cash') +
            kpi('search-check', CFApp.int(k.paymentReview), 'รอตรวจสอบการชำระ', k.paymentReview > 0, 'review') +
            kpi('bell-ring', CFApp.int(k.ready), 'พร้อมรับ', false, 'ready') +
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

            // การ์ดเรียบแบบเดียวกับรายการหน้าจัดการออเดอร์: เลขคิว + ยอด · จุดสีสถานะ + เวลา · รายละเอียดตัวเล็ก
            // — เดิมมีป้ายสี 4 อันต่อใบ (สถานะ · กินที่ร้าน · หมายเหตุ · QR) ดูรก
            const st = CF_STATUS[o.status] || { label: o.status, chip: 'sip-chip-muted' };
            const tone = { 'sip-chip-danger': 'danger', 'sip-chip-active': 'warn', 'sip-chip-success': 'ok',
                           'sip-chip-progress': 'info' }[st.chip] || 'muted';
            return `<div class="sip-card sip-card-hover cf-order-card" onclick="CashierPage.open('${o.id}')">
                <div class="cf-oc-head">
                    <span class="cf-oc-no">${e(o.orderNo)}</span>
                    <span class="cf-oc-amt">${CFApp.baht(o.total)}</span>
                </div>
                <div class="cf-oc-meta">
                    <span class="cf-lc-status ${tone}"><i></i>${e(st.label)}</span>
                    <span class="cf-lc-time">${CFApp.time(o.createdAt)}</span>
                </div>
                <div class="cf-oc-sub">
                    ${e(o.kioskId || '—')} · ${e((CF_DINING[o.diningOption] || CF_DINING.DINE_IN).label)} ·
                    ${o.paymentMethod === 'CASH' ? 'เงินสด' : 'QR / โอน'}
                </div>
                ${this._reviewBadge(o)}
                <div class="cf-oc-items">${lines}${more}</div>
            </div>`;
        }).join('') + '</div>';
    },

    /**
     * ออเดอร์ในแท็บตรวจสอบมีสองกรณีที่ต่างกันมาก — บอกให้เห็นตั้งแต่การ์ด
     *   มีสลิป = ลูกค้าจ่ายแล้วแน่ ๆ รอดูเงินเข้า · ไม่มีสลิป + QR หมดเวลา = อาจยังไม่ได้จ่ายเลย
     */
    _reviewBadge(o) {
        if (!['PAYMENT_REVIEW', 'PAYMENT_TIMEOUT'].includes(o.status)) return '';
        const slip = CFStore.where('slips', (s) => s.orderId === o.id).slice(-1)[0];
        // หมายเหตุเป็นบรรทัดข้อความมีไอคอน (พื้นอ่อนตามสี) ไม่ใช่ป้ายแคปซูลอีกอัน
        const note = (cls, icon, text) =>
            `<div class="cf-oc-note ${cls}"><i data-lucide="${icon}" class="icon-sm"></i><span>${text}</span></div>`;
        if (slip) {
            const bad = slip.verdict === 'FAIL';
            return bad ? note('danger', 'alert-octagon', 'มีสลิป — ยอดหรือวันที่ไม่ตรง')
                       : note('ok', 'receipt', 'มีสลิปแล้ว — รอดูเงินเข้า');
        }
        return o.status === 'PAYMENT_TIMEOUT'
            ? note('muted', 'timer-off', 'QR หมดเวลา — ไม่มีสลิป อาจยังไม่ได้จ่าย')
            : note('warn', 'hand', 'ลูกค้าแจ้งพนักงาน — ไม่มีสลิป');
    },

    /**
     * ไปแท็บที่มีงานค้างให้เอง — ตอนเปิดหน้า และเมื่อแท็บที่ดูอยู่ว่าง
     * ลำดับ: ตรวจสอบการชำระ (ลูกค้ายืนรอ + เสี่ยงเงินไม่เข้า) → เงินสด → พร้อมรับ
     * ไม่ย้ายเมื่อ: อยู่แท็บค้นหา · เปิด drawer อยู่ · เพิ่งกดเลือกแท็บเองไม่ถึง 20 วิ (ตั้งใจดูแท็บว่าง)
     */
    _autoTab(k) {
        const counts = { review: k.paymentReview, cash: k.waitingCash, ready: k.ready };
        const tab = this.state.tab;
        if (tab === 'search' || counts[tab] > 0) return;
        if (window.Drawer && Drawer.isOpen && Drawer.isOpen()) return;
        if (this._pickedAt && Date.now() - this._pickedAt < 20000) return;
        const next = ['review', 'cash', 'ready'].find((t) => counts[t] > 0);
        if (next) this.state.tab = next;
    },

    setTab(tab) { this.state.tab = tab; this._pickedAt = Date.now(); this.render(); },
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
                       placeholder="0.00" oninput="CashierPage.onCashInput()"
                       onkeydown="if(event.key==='Enter'){event.preventDefault();CashierPage.takeCash();}">
                <div class="cf-quick-cash">
                    ${this._cashOptions(o.total).map((v) =>
                        `<button type="button" class="ds-chip-toggle" onclick="CashierPage.quickCash(${v})">${CFApp.money(v)}</button>`
                    ).join('')}
                </div>

                <div class="flex flex-between" style="margin-top:16px;align-items:baseline">
                    <span class="sip-label" style="margin:0">เงินทอน</span>
                    <span class="cf-amount-big" id="changeOut" style="font-size:32px">—</span>
                </div>
                <div class="ds-note" style="margin-top:6px">ใส่เงินที่รับมาแล้วกด Enter หรือปุ่ม "รับชำระ"</div>
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

    /**
     * ปุ่มเงินด่วน — ยอดพอดี + ปัดขึ้นเป็นเงินที่ลูกค้ามักยื่นมา (หลัก 50/100/500/1000)
     * ไม่แสดงค่าที่น้อยกว่ายอด (กดแล้วขึ้นเตือนเงินไม่พอ ทำให้งง)
     */
    _cashOptions(total) {
        const up = (n) => Math.ceil(total / n) * n;
        return [total, up(50), up(100), up(500), up(1000)]
            .filter((v) => v >= total)
            .filter((v, i, a) => a.indexOf(v) === i)
            .sort((a, b) => a - b)
            .slice(0, 5);
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
        if (received == null || received < o.total || this._cash.busy) return;

        // ยืนยันชั้นเดียว — หน้านี้โชว์ยอด รับเงิน และเงินทอนตัวใหญ่ครบแล้ว หน้าถามซ้ำแค่ทำให้ช้าตอนคนเยอะ
        // กันกดรัว / Enter ซ้ำ ระหว่างรอเซิร์ฟเวอร์
        this._cash.busy = true;
        const btn = document.getElementById('btnTakeCash');
        if (btn) btn.disabled = true;
        try {
            // เซิร์ฟเวอร์สร้าง Payment แล้ว chain SENT_TO_KITCHEN ให้เอง
            // → ตั๋วไปโผล่ที่ KDS ทุกจอผ่าน SSE
            if (await CFOrders.transition(orderId, 'PAID', { received })) {
                Drawer.close();
                showToast('รับชำระ ' + o.orderNo + ' แล้ว · ทอน ' + CFApp.baht(received - o.total) +
                          ' — ส่งเข้าครัวอัตโนมัติ', 'success', 5000);
            }
        } finally {
            this._cash.busy = false;
            if (btn && document.body.contains(btn)) btn.disabled = false;
        }
    },

    /**
     * แถบเตือนยังไม่เปิดรอบ — ปิดรอบตอนปิดร้านแล้วระบบไม่เปิดรอบใหม่ให้
     * ลืมกดเปิดตอนเช้า = คีออสก์รับออเดอร์ไม่ได้ทั้งร้าน จึงต้องเห็นชัดตั้งแต่เปิดหน้า
     */
    renderShiftAlert(shift) {
        const el = document.getElementById('shiftAlert');
        if (!el) return;
        el.hidden = !!shift;
        if (shift) return;
        el.innerHTML = `<div class="sip-banner sip-banner-warning" style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
            <i data-lucide="lock" class="icon-sm"></i>
            <span style="flex:1"><strong>ยังไม่ได้เปิดรอบการขาย</strong> — คีออสก์ยังไม่รับออเดอร์ · นับเงินทอนในลิ้นชักแล้วกดเปิดรอบ</span>
            <button class="btn btn-primary btn-sm" onclick="location.href='closing.html'">
                <i data-lucide="unlock" class="icon-sm"></i> เปิดรอบ</button>
        </div>`;
    },

    /* ── §16 ตรวจสอบ / ยืนยันการชำระแทน ────────────────── */
    /** แถบแดงบนหน้าแคชเชียร์ — มีงานที่พิมพ์ไม่ออกค้างอยู่ กดเพื่อพิมพ์ซ้ำ */
    async refreshPrintAlert() {
        const el = document.getElementById('printAlert');
        if (!el) return;
        const n = (await CFPrint.failedJobs()).length;
        el.hidden = !n;
        if (n) {
            el.innerHTML = `<div class="sip-banner sip-banner-danger cf-print-alert" style="display:flex;align-items:center;gap:10px">
                <i data-lucide="printer" class="icon-sm"></i>
                <span>เครื่องพิมพ์พิมพ์ไม่ออก <strong>${n}</strong> ใบ</span>
                <button class="btn btn-outline btn-sm" onclick="CFPrint.openFailed()">ดูและพิมพ์ซ้ำ</button>
            </div>`;
            refreshIcons();
        }
    },

    /** ผล OCR มาถึงหลังเปิด drawer ไปแล้ว ~6 วิ — เติมเฉพาะกล่องผลตรวจ */
    refreshSlipOcr() {
        const el = document.getElementById('slipOcrBox');
        if (!el || !this._review) return;
        const slip = CFStore.where('slips', (s) => s.orderId === this._review.orderId).slice(-1)[0] || null;
        // สลิปใบใหม่เข้ามา (แคชเชียร์เพิ่งสแกน หรือลูกค้าสแกนที่คีออสก์ระหว่างเปิดดู) — วาดกล่องข้อมูลสลิปใหม่ทั้งกล่อง
        const id = slip ? String(slip.id) : null;
        if (id !== this._review.slipId) {
            this._review.slipId = id;
            const box = document.getElementById('slipInfoBox');
            const o = CFStore.byId('orders', this._review.orderId);
            if (box && o) { box.innerHTML = this._slipInfoHtml(o, slip); refreshIcons(); }
            return;
        }
        const html = CFApp.slipOcrHtml(slip);
        if (el.innerHTML !== html) { el.innerHTML = html; refreshIcons(); }
    },

    openReview(orderId) {
        const e = CFApp.esc;
        const o = CFStore.byId('orders', orderId);
        // สลิปใบล่าสุด (คีออสก์หรือเคาน์เตอร์สแกน) — ไม่มี = ลูกค้ากดแจ้งพนักงานโดยไม่ได้สแกน / QR หมดเวลา
        const slip = CFStore.where('slips', (s) => s.orderId === orderId).slice(-1)[0] || null;
        const limit = CFAuth.overrideLimit();
        const overLimit = limit != null && o.total > limit;
        const items = CFOrders.items(orderId);

        this._review = { orderId, reason: '', slipId: slip ? String(slip.id) : null, overLimit };

        // เรียงตามที่พนักงานคิดจริง: ยอดเท่าไร → มีหลักฐานไหม → ตัดสินใจ → รายละเอียด (พับไว้)
        Drawer.open({
            title: 'ตรวจสอบการชำระ — ' + e(o.orderNo),
            width: '560px',
            contentHtml: `
                <div id="slipInfoBox">${this._slipInfoHtml(o, slip)}</div>

                ${slip
                    ? `<details style="margin-top:12px"><summary class="ds-section-label" style="cursor:pointer">สแกนสลิปใหม่</summary>${this._slipScanHtml()}</details>`
                    : this._slipScanHtml()}

                <div class="ds-section-label" style="margin-top:16px">ตัดสินใจ — เลือกเหตุผล 1 ข้อ</div>
                <div class="ds-chips" id="ovChips">
                    ${['เงินเข้าบัญชีร้านแล้ว ยอดตรง', 'ตรวจสลิปจากมือถือลูกค้าแล้ว ยอดตรง', CASH_INSTEAD_REASON]
                        .map((r) => `<button type="button" class="ds-chip-suggest"
                            onclick="CashierPage.setReason('${e(r)}')">${e(r)}</button>`).join('')}
                </div>
                <textarea class="sip-textarea" id="ovReason" rows="2" style="margin-top:6px"
                          placeholder="หรือพิมพ์เหตุผลเอง เช่น ลูกค้าโอนผิดยอด ขอคืนเงินแล้ว"
                          oninput="CashierPage.onReason(this.value)"></textarea>

                ${overLimit ? `<div class="ds-block" style="margin-top:12px">
                    <i data-lucide="shield-alert" class="icon-sm"></i>
                    ยอดนี้ (${CFApp.baht(o.total)}) เกินเพดานการยืนยันแทนของคุณ (${CFApp.baht(limit)})
                    — ต้องให้ผู้จัดการเป็นผู้ยืนยัน
                </div>` : ''}

                <details style="margin-top:14px">
                    <summary class="ds-section-label" style="cursor:pointer">รายการอาหาร (${items.length} รายการ)</summary>
                    ${this._itemsHtml(orderId)}
                </details>

                <div class="ds-note" style="margin-top:12px">
                    ระบบจะบันทึกผู้ยืนยัน เหตุผล และเวลา ลงในประวัติของออเดอร์นี้
                </div>`,
            footerHtml: `
                <span class="ds-note" id="ovHint" style="margin:0 auto 0 0">
                    ${overLimit ? 'เกินเพดาน — ให้ผู้จัดการยืนยัน' : 'เลือกเหตุผลก่อน จึงจะกดยืนยันได้'}
                </span>
                <button class="btn btn-danger" onclick="CashierPage.failPayment()">ชำระไม่สำเร็จ</button>
                <button class="btn btn-primary" id="btnOverride" disabled
                        onclick="CashierPage.confirmOverride()">
                    <i data-lucide="check" class="icon-sm"></i> ยืนยันการชำระ
                </button>`,
            onOpen: () => refreshIcons(),
            onClose: () => { this.stopSlipCam(); },
        });
    },

    /**
     * ส่วนบนของหน้าตรวจสอบ — ยอดตัวใหญ่ + สถานะหลักฐาน + ผลอ่านสลิป + ภาพ
     * วาดใหม่ทั้งกล่องเมื่อมีสลิปใบใหม่ (refreshSlipOcr)
     */
    _slipInfoHtml(o, slip) {
        const e = CFApp.esc;
        const status = slip
            ? `<span class="sip-chip sip-chip-success"><i data-lucide="receipt" class="icon-sm"></i>
                มีสลิป · สแกน ${CFApp.time(slip.createdAt)} · ${e(slip.bankName || slip.bankCode || 'ไม่ทราบธนาคาร')}</span>`
            : o.status === 'PAYMENT_TIMEOUT'
                ? `<span class="sip-chip sip-chip-muted"><i data-lucide="timer-off" class="icon-sm"></i>
                    QR หมดเวลา — ไม่มีสลิป ลูกค้าอาจยังไม่ได้จ่าย</span>`
                : `<span class="sip-chip sip-chip-amber"><i data-lucide="hand" class="icon-sm"></i>
                    ลูกค้าแจ้งพนักงาน — ยังไม่มีสลิป</span>`;
        return `
                <div class="sip-card" style="padding:14px 16px">
                    <div class="flex flex-between" style="align-items:baseline">
                        <span class="sip-label" style="margin:0">ยอดที่ต้องได้รับ</span>
                        <span class="cf-amount-big">${CFApp.baht(o.total)}</span>
                    </div>
                    <div style="margin-top:8px">${status}</div>
                    <div class="ds-note" style="margin-top:8px">
                        <strong>ดูแจ้งเตือนเงินเข้าบัญชีร้าน</strong> ว่ามียอด ${CFApp.baht(o.total)} เข้ามาจริง
                        ${slip ? '' : '— ไม่มีสลิป ให้สแกนสลิปจากมือถือลูกค้าด้านล่าง หรือขอดูสลิป'}
                    </div>
                </div>
                <div id="slipOcrBox">${CFApp.slipOcrHtml(slip)}</div>
                ${slip && slip.hasImage ? `
                <button type="button" class="cf-slip-thumb" title="ดูภาพเต็ม" style="margin-top:8px"
                        onclick="CFApp.showImage('/api/slips/${e(slip.id)}/image', 'สลิป ${e(o.orderNo)}')">
                    <img src="/api/slips/${e(slip.id)}/image" alt="ภาพสลิป"
                         style="display:block;width:100%;max-height:240px;object-fit:contain;
                                background:#111;border-radius:8px">
                </button>` : ''}
                ${slip ? `<details style="margin-top:8px">
                    <summary class="ds-note" style="cursor:pointer">รายละเอียดสลิป</summary>
                    <table class="ds-table-grid" style="margin-top:6px">
                        <tr><th class="l" style="width:35%">เลขอ้างอิง</th><td class="l">${e(slip.ref)}</td></tr>
                        <tr><th class="l">สลิปซ้ำ</th><td class="l">ไม่ซ้ำ — ยังไม่เคยใช้กับออเดอร์อื่น</td></tr>
                    </table>
                    <div class="ds-note" style="margin-top:6px">
                        QR บนสลิปบอกได้แค่เลขอ้างอิง ไม่มียอดเงินหรือบัญชีปลายทาง
                        — ระบบยังไม่ได้ตรวจกับธนาคาร จึงต้องดูเงินเข้าจริงก่อนทุกครั้ง
                    </div>
                </details>` : ''}`;
    },

    /* ── สแกนสลิปที่เคาน์เตอร์ — คีออสก์สแกนไม่ติด หรือลูกค้าส่งรูปสลิปมาให้ ──
       ส่งเข้า POST /api/orders/:id/slip ตัวเดียวกับคีออสก์ จึงได้การกันสลิปซ้ำและ OCR ครบเหมือนกัน */
    _slipScanHtml() {
        return `
                <div class="ds-section-label" style="margin-top:12px">สแกนสลิปที่เคาน์เตอร์</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                    <button type="button" class="btn btn-outline btn-sm" id="btnSlipCam"
                            onclick="CashierPage.toggleSlipCam()">
                        <i data-lucide="camera" class="icon-sm"></i> <span>เปิดกล้องสแกน</span>
                    </button>
                    <button type="button" class="btn btn-outline btn-sm"
                            onclick="document.getElementById('slipFile').click()">
                        <i data-lucide="image" class="icon-sm"></i> เลือกรูปสลิป
                    </button>
                    <input type="file" id="slipFile" accept="image/*" hidden
                           onchange="CashierPage.scanSlipFile(this)">
                </div>
                <div id="slipCamWrap" hidden style="margin-top:8px">
                    <video id="slipCamVideo" playsinline muted
                           style="display:block;width:100%;max-height:300px;object-fit:contain;
                                  background:#111;border-radius:8px;
                                  ${this.slipCamMirror() ? 'transform:scaleX(-1)' : ''}"></video>
                </div>
                <div class="ds-note" id="slipScanMsg" style="margin-top:6px">
                    หันจอมือถือลูกค้า (หน้าสลิป) เข้าหากล้องของเครื่องนี้ หรือเลือกรูปสลิปที่ลูกค้าส่งมา
                </div>`;
    },

    slipScanMsg(text, bad) {
        const el = document.getElementById('slipScanMsg');
        if (!el) return;
        el.textContent = text;
        el.style.color = bad ? 'var(--danger, #c0392b)' : '';
    },

    /**
     * ภาพกล้องบนจอแบบกระจกไหม — ใช้ค่าเดียวกับคีออสก์ (kioskCamMirror) สองจอจึงเหมือนกันเสมอ
     * มีผลแค่ภาพบนจอ ภาพหลักฐานเป็นภาพจริงเสมอ (ตัวหนังสือไม่กลับด้าน OCR อ่านยอดได้)
     */
    slipCamMirror() {
        return Object.assign({}, CF_KIOSK_DEFAULTS, CFStore.settings()).kioskCamMirror === true;
    },

    /** วาดภาพ (video หรือ img) ลง canvas ย่อให้ด้านยาวไม่เกิน max */
    _slipCanvas(src, max) {
        const w0 = src.videoWidth || src.naturalWidth, h0 = src.videoHeight || src.naturalHeight;
        const s = Math.min(1, max / Math.max(w0, h0));
        const c = document.createElement('canvas');
        c.width = Math.round(w0 * s); c.height = Math.round(h0 * s);
        c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0, c.width, c.height);
        return c;
    },

    _decodeQr(canvas) {
        const img = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
        return code && code.data ? code.data : null;
    },

    toggleSlipCam() {
        if (this._slipCam) { this.stopSlipCam(); this.slipScanMsg('ปิดกล้องแล้ว'); return; }
        this.startSlipCam();
    },

    async startSlipCam() {
        this.stopSlipCam();
        const video = document.getElementById('slipCamVideo');
        if (!video) return;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.slipScanMsg('เบราว์เซอร์นี้เปิดกล้องไม่ได้ — ใช้ "เลือกรูปสลิป" แทน', true);
            return;
        }
        try {
            this._slipCam = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
            });
        } catch (err) {
            console.warn('[cashier] เปิดกล้องไม่ได้', err);
            this.slipScanMsg('เปิดกล้องไม่ได้ — ตรวจว่ามีกล้องต่ออยู่และอนุญาตให้เว็บนี้ใช้กล้อง', true);
            return;
        }
        if (!document.getElementById('slipCamVideo')) { this.stopSlipCam(); return; }   // ปิด drawer ไประหว่างรอ
        video.srcObject = this._slipCam;
        await video.play().catch(() => {});
        document.getElementById('slipCamWrap').hidden = false;
        const label = document.querySelector('#btnSlipCam span');
        if (label) label.textContent = 'ปิดกล้อง';
        this.slipScanMsg('กำลังมองหา QR บนสลิป…');

        this._slipScan = setInterval(() => {
            if (this._slipBusy || !video.videoWidth) return;
            // jsQR อ่าน QR ที่กลับด้านได้เอง — เว็บแคมที่กลับภาพมาก็สแกนติด
            const payload = this._decodeQr(this._slipCanvas(video, 800));
            if (!payload) return;
            if (!CFSlip.parse(payload).ok) {
                this.slipScanMsg('QR นี้ไม่ใช่สลิป — ให้ลูกค้าเปิดหน้าสลิปหลังโอนเงินสำเร็จ', true);
                return;
            }
            // ภาพหลักฐานพลิกคืนตามที่ตั้งไว้ ตัวหนังสือจึงไม่กลับด้าน (OCR อ่านยอดได้)
            const image = this._slipCanvas(video, 1600).toDataURL('image/jpeg', 0.85);
            this.stopSlipCam();
            this.sendSlip(payload, image);
        }, 200);
    },

    stopSlipCam() {
        clearInterval(this._slipScan);
        this._slipScan = null;
        if (this._slipCam) {
            this._slipCam.getTracks().forEach((t) => t.stop());
            this._slipCam = null;
        }
        const wrap = document.getElementById('slipCamWrap');
        if (wrap) wrap.hidden = true;
        const label = document.querySelector('#btnSlipCam span');
        if (label) label.textContent = 'เปิดกล้องสแกน';
    },

    /** รูปสลิปจากไฟล์ (ลูกค้าส่งทาง LINE / ภาพหน้าจอ) — ลองหลายขนาด */
    async scanSlipFile(input) {
        const file = input.files && input.files[0];
        input.value = '';                       // เลือกไฟล์เดิมซ้ำได้
        if (!file) return;
        this.stopSlipCam();
        this.slipScanMsg('กำลังอ่านรูป…');
        const url = URL.createObjectURL(file);
        try {
            const img = new Image();
            await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = url; });
            let payload = null;
            // QR บนภาพหน้าจอมือถือเล็กเมื่อเทียบกับทั้งภาพ — ลองขนาดใหญ่ก่อน แล้วค่อยย่อ
            for (const max of [1600, 1000, 2400]) {
                payload = this._decodeQr(this._slipCanvas(img, max));
                if (payload) break;
            }
            if (!payload) {
                this.slipScanMsg('หา QR ในรูปนี้ไม่เจอ — ใช้รูปสลิปเต็มใบที่เห็น QR ชัด ๆ', true);
                return;
            }
            if (!CFSlip.parse(payload).ok) {
                this.slipScanMsg('QR ในรูปนี้ไม่ใช่สลิปโอนเงิน', true);
                return;
            }
            this.sendSlip(payload, this._slipCanvas(img, 1600).toDataURL('image/jpeg', 0.85));
        } catch (err) {
            this.slipScanMsg('เปิดรูปนี้ไม่ได้ — ลองเป็นไฟล์ JPG หรือ PNG', true);
        } finally {
            URL.revokeObjectURL(url);
        }
    },

    async sendSlip(payload, image) {
        if (this._slipBusy || !this._review) return;
        this._slipBusy = true;
        this.slipScanMsg('กำลังส่งสลิปให้ระบบตรวจ…');
        try {
            await CFApi.post('/api/orders/' + encodeURIComponent(this._review.orderId) + '/slip', { payload, image }, { timeout: 60000 });
            // ข้อมูลสลิปกับผลอ่านยอดจะตามมาทางสายข้อมูล (refreshSlipOcr วาดกล่องใหม่ให้เอง)
            this.slipScanMsg('รับสลิปแล้ว — ระบบกำลังอ่านยอดเงินจากภาพ ดูผลด้านบน');
            showToast('รับสลิปแล้ว', 'success');
        } catch (err) {
            this.slipScanMsg(err.message || 'ส่งสลิปไม่สำเร็จ', true);
        } finally {
            this._slipBusy = false;
        }
    },

    onReason(v) {
        this._review.reason = v;
        // เลือก "ลูกค้าชำระเงินสดแทน" = รับเงินสดเข้าลิ้นชัก → ต้องบันทึกเป็นเงินสด ไม่ใช่ QR
        this._review.method = v.trim() === CASH_INSTEAD_REASON ? 'CASH' : null;
        const { overLimit } = this._review;
        const ready = !!v.trim();
        const btn = document.getElementById('btnOverride');
        if (btn) btn.disabled = overLimit || !ready;
        const hint = document.getElementById('ovHint');
        if (hint) hint.textContent = overLimit ? 'เกินเพดาน — ให้ผู้จัดการยืนยัน'
                                   : ready ? '' : 'เลือกเหตุผลก่อน จึงจะกดยืนยันได้';
        // ไฮไลต์ชิปที่ตรงกับข้อความ — เห็นว่าเลือกข้อไหนอยู่
        document.querySelectorAll('#ovChips .ds-chip-suggest').forEach((b) =>
            b.classList.toggle('is-active', b.textContent.trim() === v.trim()));
    },

    setReason(r) {
        const el = document.getElementById('ovReason');
        el.value = r;
        this.onReason(r);
    },

    async confirmOverride() {
        const { orderId, reason, method } = this._review;
        if (!reason.trim()) return;
        if (document.activeElement) document.activeElement.blur();
        this.stopSlipCam();                     // drawer ยืนยันซ้อนทับ — กล้องค้างไว้ข้างใต้ไม่มีประโยชน์

        const o = CFStore.byId('orders', orderId);
        const ok = await Drawer.confirm({
            title: 'ยืนยันการชำระแทนระบบ?',
            message: 'ออเดอร์ ' + o.orderNo + ' · ' + CFApp.baht(o.total),
            lines: [reason, method === 'CASH' ? 'บันทึกเป็นเงินสด — นับรวมใน "เงินสดที่ควรมี" ตอนปิดรอบ' : ''],
            note: 'ชื่อของคุณจะถูกบันทึกเป็นผู้ยืนยัน',
            confirmText: 'ยืนยัน', danger: true,
        });
        if (!ok) return;

        const opts = method ? { reason, override: true, method } : { reason, override: true };
        if (await CFOrders.transition(orderId, 'PAID', opts)) {
            Drawer.close();
            showToast('ยืนยันการชำระ ' + o.orderNo + ' แล้ว', 'success');
        }
    },

    async failPayment() {
        const { orderId, reason } = this._review;
        if (!reason.trim()) { showToast('ต้องระบุเหตุผลก่อน', 'error'); return; }
        if (document.activeElement) document.activeElement.blur();
        this.stopSlipCam();                     // drawer ยืนยันซ้อนทับ — กล้องค้างไว้ข้างใต้ไม่มีประโยชน์

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
        CFAlerts.start('cashier');
        this.refreshPrintAlert();
        setInterval(() => this.refreshPrintAlert(), 15000);

        // เติมตัวเลือกสถานะในช่องค้นหา
        document.getElementById('searchStatus').innerHTML +=
            Object.keys(CF_STATUS).map((s) => `<option value="${s}">${CF_STATUS[s].label}</option>`).join('');

        this.render();
        CFStore.subscribe(() => this.render());
    },
};

window.CashierPage = CashierPage;
CFBoot.ready(() => CashierPage.boot());
