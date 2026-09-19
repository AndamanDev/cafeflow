/** CafeFlow — จัดการออเดอร์ (3-pane) */
const OrdersPage = {

    state: { filter: 'all', q: '', group: 'recent', selectedId: null, tab: 'items', slipStation: null },

    FILTERS: [
        { key: 'all',     label: 'ทั้งหมด',  test: () => true },
        { key: 'waiting', label: 'รอชำระ',   test: (o) => CF_WAITING_PAY.includes(o.status) },
        { key: 'making',  label: 'กำลังทำ',  test: (o) => CF_IN_PROGRESS.includes(o.status) },
        { key: 'ready',   label: 'พร้อมรับ', test: (o) => o.status === 'READY' },
        { key: 'done',    label: 'เสร็จสิ้น', test: (o) => ['SERVED', 'COMPLETED'].includes(o.status) },
        { key: 'void',    label: 'ยกเลิก',   test: (o) => ['CANCELLED', 'VOIDED', 'REFUNDED'].includes(o.status) },
    ],

    /* ══════════════════════════════════════════════════════
       LIST
       ══════════════════════════════════════════════════════ */
    filtered() {
        const f = this.FILTERS.find((x) => x.key === this.state.filter) || this.FILTERS[0];
        const q = this.state.q.trim().toLowerCase();

        // ผลค้นจากเซิร์ฟเวอร์ (มีเฉพาะตอนพิมพ์คำค้น) ครอบคลุมย้อนหลังเกินหน้าต่าง cache
        const base = this.state.found ? this.state.found : CFStore.all('orders');

        let list = base.filter((o) =>
            f.test(o) && (!q || this.state.found ||
                o.orderNo.toLowerCase().includes(q) || (o.kioskId || '').toLowerCase().includes(q))
        );
        if (this.state.group === 'amount')      list.sort((a, b) => b.total - a.total);
        else if (this.state.group === 'oldest') list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        else                                    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return list;
    },

    /**
     * ค้นย้อนหลังที่เซิร์ฟเวอร์
     * cache ในเบราว์เซอร์มีแค่ 24 ชั่วโมง + ใบที่ยังไม่จบ — ค้นของเมื่อวานจึงไม่เจอ
     * ถ้าไม่ผ่านทางนี้ (โหมดเดโมไม่มีเซิร์ฟเวอร์ ก็ค้นในหน่วยความจำเหมือนเดิม)
     */
    async searchServer() {
        const q = this.state.q.trim();
        if (CFStore.mode !== 'api' || q.length < 2) {
            this.state.found = null;
            this.state.searchNote = '';
            this.render();
            return;
        }
        this.state.searchNote = 'กำลังค้น…';
        this.render();
        try {
            const res = await CFApi.get('/api/orders/search?limit=100&q=' + encodeURIComponent(q));
            this.state.found = res.orders;
            this.state.searchNote = res.total > res.orders.length
                ? `พบ ${res.total} รายการ · แสดง ${res.orders.length} รายการแรก`
                : `พบ ${res.total} รายการ (ค้นย้อนหลังทั้งหมด)`;
        } catch (err) {
            // ค้นไม่ได้ต้องไม่ทำให้หน้าใช้ไม่ได้ — ถอยไปค้นในที่ที่มีอยู่
            this.state.found = null;
            this.state.searchNote = 'ค้นย้อนหลังไม่ได้ — แสดงเฉพาะที่โหลดไว้';
        }
        this.render();
    },

    render() {
        const e = CFApp.esc;
        const all = CFStore.all('orders');
        const list = this.filtered();

        document.getElementById('listCount').textContent =
            this.state.searchNote || (list.length + ' รายการ');

        document.getElementById('pillTabs').innerHTML = this.FILTERS.map((f) => `
            <button class="ds-pilltab ${f.key === this.state.filter ? 'active' : ''}"
                    data-filter="${f.key}" onclick="OrdersPage.setFilter('${f.key}')">
                ${f.label} <span class="tab-count">${all.filter(f.test).length}</span>
            </button>`).join('');

        document.getElementById('listContainer').innerHTML = list.length ? list.map((o) => `
            <div class="ds-list-card ${o.id === this.state.selectedId ? 'active' : ''}"
                 onclick="OrdersPage.select('${o.id}')">
                <div class="ds-list-card-top">
                    <span class="ds-list-card-name">${e(o.orderNo)}</span>
                    <span class="flex gap-sm" style="align-items:center">
                        ${CFApp.diningChip(o.diningOption)}
                        ${CFApp.statusChip(o.status)}
                    </span>
                </div>
                <div class="ds-list-card-detail">
                    ${e(o.kioskId || '—')} ·
                    ${o.itemCount != null ? o.itemCount : CFOrders.items(o.id).length} รายการ ·
                    ${CFApp.baht(o.total)} · ${CFApp.time(o.createdAt)}
                </div>
            </div>`).join('') : '<div class="ds-empty-sm">ไม่พบออเดอร์</div>';

        this.renderDetail();
        CFApp.applyRoleGate();
        refreshIcons();
    },

    setFilter(k) { this.state.filter = k; this.render(); },
    setQuery(v) {
        this.state.q = v;
        this.state.found = null;          // ผลเก่าใช้ไม่ได้แล้ว ต้องไม่ค้างให้เห็น
        this.render();                    // วาดทันทีจากที่มีอยู่ ไม่ให้ช่องค้นหาหน่วง
        // หน่วงก่อนยิงเซิร์ฟเวอร์ ไม่งั้นพิมพ์ "อเมริกาโน" ยิงไป 9 ครั้ง
        clearTimeout(this._qTimer);
        this._qTimer = setTimeout(() => this.searchServer(), 350);
    },
    setGroup(v)  { this.state.group = v; this.render(); },
    toggleLeft() { document.getElementById('shell').classList.toggle('left-collapsed'); },

    select(id) {
        this.state.selectedId = id;
        this.state.slipStation = null;
        this.render();

        // ออเดอร์ที่ค้นเจอจากเซิร์ฟเวอร์อาจอยู่นอกหน้าต่าง cache — ต้องดึงรายละเอียดมาก่อน
        // ไม่งั้นกดแล้วแผงขวาว่างเปล่าโดยไม่บอกอะไร
        if (CFStore.mode === 'api' && !CFStore.byId('orders', id)) {
            CFApi.get('/api/orders/' + encodeURIComponent(id))
                .then((patch) => {
                    CFStore.hydrate(patch);
                    if (this.state.selectedId === id) this.render();
                })
                .catch(() => showToast('โหลดรายละเอียดออเดอร์ไม่สำเร็จ', 'error'));
        }
    },

    setTab(tab) {
        this.state.tab = tab;
        document.querySelectorAll('.ds-tabs .ds-tab').forEach((b, i) => {
            b.classList.toggle('active', ['items', 'payment', 'audit'][i] === tab);
        });
        ['items', 'payment', 'audit'].forEach((t) => {
            document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1))
                .classList.toggle('active', t === tab);
        });
    },

    /* ══════════════════════════════════════════════════════
       DETAIL
       ══════════════════════════════════════════════════════ */
    renderDetail() {
        const e = CFApp.esc;
        const id = this.state.selectedId;
        const o = id ? CFStore.byId('orders', id) : null;

        document.getElementById('emptyState').style.display = o ? 'none' : '';
        document.getElementById('detailWrap').style.display = o ? '' : 'none';

        if (!o) {
            document.getElementById('actionPane').innerHTML = '<div class="ds-empty-sm">ยังไม่ได้เลือกออเดอร์</div>';
            return;
        }

        /* ── context bar ── */
        document.getElementById('ctxAvatar').textContent = o.orderNo.charAt(0);
        document.getElementById('ctxNo').textContent = o.orderNo;
        document.getElementById('ctxChip').innerHTML = CFApp.statusChip(o.status);
        document.getElementById('ctxKiosk').textContent = o.kioskId;
        document.getElementById('ctxTime').textContent = CFApp.dateTime(o.createdAt);
        document.getElementById('ctxTotal').textContent = CFApp.baht(o.total);
        document.getElementById('ctxMethod').textContent = o.paymentMethod === 'CASH' ? 'เงินสด' : 'QR / โอน';

        // การ์ดเตือนโผล่เฉพาะตอนที่การชำระมีปัญหา
        const alertNeeded = ['PAYMENT_REVIEW', 'PAYMENT_TIMEOUT', 'PAYMENT_FAILED'].includes(o.status);
        document.getElementById('ctxAside').innerHTML = alertNeeded ? `
            <div class="ds-alert-card" onclick="location.href='cashier.html'">
                <i data-lucide="alert-triangle" class="ac-ico"></i>
                <div class="ac-body">
                    <span class="ac-label">ต้องตรวจสอบ</span>
                    <strong>${e(CFApp.statusLabel(o.status))}</strong>
                </div>
                <i data-lucide="chevron-right" class="ac-view"></i>
            </div>` : '';

        /* ── §7 stepper ──
           สถานะย่อยของการชำระ (รอเงินสด / รอ QR / หมดเวลา / รอตรวจสอบ) ยุบเป็นขั้นเดียว
           ไม่งั้นออเดอร์ที่รอชำระอยู่จะไม่มีขั้นไหน active เลย */
        const STEPS = [
            { label: 'ยืนยันออเดอร์', states: ['ORDER_CONFIRMED'] },
            { label: 'ชำระเงิน',      states: ['WAITING_CASH', 'WAITING_PAYMENT', 'PAYMENT_TIMEOUT', 'PAYMENT_REVIEW', 'PAYMENT_FAILED', 'PAID'] },
            { label: 'ส่งเข้าครัว',   states: ['SENT_TO_KITCHEN'] },
            { label: 'กำลังจัดเตรียม', states: ['PREPARING'] },
            { label: 'พร้อมรับ',      states: ['READY'] },
            { label: 'ส่งมอบแล้ว',    states: ['SERVED'] },
            { label: 'เสร็จสิ้น',     states: ['COMPLETED'] },
        ];
        const dead = ['CANCELLED', 'VOIDED', 'REFUNDED'];
        const pos = STEPS.findIndex((s) => s.states.includes(o.status));

        document.getElementById('stepper').innerHTML = dead.includes(o.status)
            ? `<span class="ds-step" style="color:var(--status-danger);font-weight:700">
                 <i data-lucide="x-circle" class="icon-sm"></i> ${e(CFApp.statusLabel(o.status))}</span>`
            : STEPS.map((s, i) => {
                const cls = pos < 0 ? '' : i < pos ? 'completed' : i === pos ? 'active' : '';
                return `<span class="ds-step ${cls}">${e(s.label)}</span>`;
            }).join('');

        this.renderItems(o);
        this.renderPayment(o);
        this.renderAudit(o);
        this.renderActions(o);
    },

    renderItems(o) {
        const e = CFApp.esc;
        const items = CFOrders.items(o.id);

        const rollup = Object.keys(o.stationStatus || {}).map((st) => {
            const ready = o.stationStatus[st] === 'READY';
            return `<span class="sip-chip ${ready ? 'sip-chip-success' : 'sip-chip-progress'}">
                        ${e(CFApp.stationLabel(st))} · ${ready ? 'พร้อม' : 'กำลังทำ'}</span>`;
        }).join(' ');

        document.getElementById('tabItems').innerHTML = `
            ${rollup ? `<div class="ds-chips" style="margin-bottom:12px">${rollup}</div>` : ''}
            <div class="table-responsive">
                <table class="data-table compact">
                    <thead><tr>
                        <th>สินค้า</th><th>ตัวเลือก</th><th>จำนวน</th>
                        <th class="cf-right">ราคา/หน่วย</th><th>สถานี</th><th class="cf-right">รวม</th>
                    </tr></thead>
                    <tbody>
                        ${items.map((i) => `<tr>
                            <td class="td-name">${e(i.nameSnapshot)}${e(CFApp.serveSuffix(i.serveType))}</td>
                            <td class="td-sub">${e(CFApp.modsText(i)) || '—'}</td>
                            <td>${i.qty}</td>
                            <td class="cf-right cf-money">${CFApp.money(i.unitPrice)}</td>
                            <td>${CFApp.stationChip(i.station)}</td>
                            <td class="cf-right cf-money">${CFApp.money(i.unitPrice * i.qty)}</td>
                        </tr>`).join('')}
                        <tr>
                            <td colspan="5" class="cf-right td-name">ยอดสุทธิ</td>
                            <td class="cf-right td-name cf-money">${CFApp.money(o.total)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>`;
    },

    renderPayment(o) {
        const e = CFApp.esc;
        const p = CFOrders.payment(o.id);
        if (!p) {
            document.getElementById('tabPayment').innerHTML =
                '<div class="ds-empty-sm">ยังไม่มีรายการชำระเงินสำหรับออเดอร์นี้</div>';
            return;
        }
        const row = (label, value) => `<tr><th class="l" style="width:30%">${label}</th><td class="l">${value}</td></tr>`;
        document.getElementById('tabPayment').innerHTML = `
            <table class="ds-table-grid">
                ${row('วิธีชำระ', p.method === 'CASH' ? 'เงินสด' : 'QR / โอน')}
                ${row('ยอดชำระ', CFApp.baht(p.amount))}
                ${p.method === 'CASH' ? row('รับเงิน', p.received != null ? CFApp.baht(p.received) : '—') : ''}
                ${p.method === 'CASH' ? row('เงินทอน', p.change != null ? CFApp.baht(p.change) : '—') : ''}
                ${p.method === 'QR' ? row('ธนาคาร', e(p.bank || '—')) : ''}
                ${p.method === 'QR' ? row('เลขอ้างอิง', e(p.ref || '—')) : ''}
                ${p.method === 'QR' ? row('เวลาทำรายการ', p.txAt ? CFApp.dateTime(p.txAt) : '—') : ''}
                ${row('ผู้ยืนยัน', e(CFApp.actorName(p.verifiedBy)))}
                ${p.overrideBy ? row('ยืนยันแทนระบบโดย', e(CFApp.actorName(p.overrideBy))) : ''}
                ${p.overrideBy ? row('เหตุผล', e(p.overrideReason || '—')) : ''}
                ${p.overrideBy ? row('เวลาที่ยืนยันแทน', CFApp.dateTime(p.overrideAt)) : ''}
                ${row('สถานะ', e(p.status))}
            </table>
            ${o.cancelReason ? `<div class="sip-banner sip-banner-danger">
                <i data-lucide="info" class="icon-sm"></i> ${e(o.cancelReason)}</div>` : ''}`;
    },

    renderAudit(o) {
        const e = CFApp.esc;
        const logs = CFOrders.historyOf(o.id);
        document.getElementById('auditBadge').textContent = logs.length;

        const variant = (a) => {
            if (['CANCELLED', 'VOIDED', 'REFUNDED', 'PAYMENT_FAILED'].includes(a.newStatus)) return 'danger';
            if (['PAID', 'READY', 'COMPLETED'].includes(a.newStatus)) return 'success';
            if (['PRINT', 'PAYMENT_OVERRIDE', 'PAYMENT_TIMEOUT'].includes(a.eventType)) return 'warning';
            return 'info';
        };

        document.getElementById('auditList').innerHTML = logs.length ? logs.map((a) => `
            <div class="ds-timeline-item ${variant(a)}">
                <div class="flex flex-between gap-md">
                    <strong>${e(a.newStatus ? CFApp.statusLabel(a.newStatus) : DashLabel(a.eventType))}</strong>
                    <span class="ds-timeline-time">${CFApp.timeSec(a.ts)}</span>
                </div>
                <div class="text-muted">
                    ${e(CFApp.actorName(a.actor))} · ${e(a.device || '')}${a.reason ? ' · ' + e(a.reason) : ''}
                </div>
            </div>`).join('') : '<div class="ds-empty-sm">ยังไม่มีประวัติ</div>';
    },

    /* ══════════════════════════════════════════════════════
       ACTIONS (แผงขวา)
       ══════════════════════════════════════════════════════ */
    renderActions(o) {
        const e = CFApp.esc;
        const stations = Object.keys(o.stationStatus || {});
        const station = this.state.slipStation && stations.includes(this.state.slipStation)
            ? this.state.slipStation : stations[0];

        // ปุ่มสร้างจาก CF_FLOW เท่านั้น — ปุ่มที่กดแล้วพังจึงไม่มีทางโผล่
        const nexts = CFOrders.nextStates(o).filter((s) => !CF_REASON_REQUIRED.includes(s));
        const destructive = CFOrders.nextStates(o).filter((s) => CF_REASON_REQUIRED.includes(s));

        document.getElementById('actionPane').innerHTML = `
            <div class="ds-section-label" style="padding:0 16px">เอกสาร</div>
            <div class="ds-actions cf-stack">
                <button class="btn btn-outline" onclick="CFDocs.previewReceipt('${o.id}')">
                    <i data-lucide="receipt" class="icon-sm"></i> ใบเสร็จรับเงิน
                    ${o.reprintCount ? `<span class="sip-chip sip-chip-amber">พิมพ์แล้ว ${o.reprintCount}</span>` : ''}
                </button>
                ${stations.length ? `
                <select class="sip-select" onchange="OrdersPage.setSlipStation(this.value)">
                    ${stations.map((st) => `<option value="${st}" ${st === station ? 'selected' : ''}>
                        สลิปครัว — ${e(CFApp.stationLabel(st))}</option>`).join('')}
                </select>
                <button class="btn btn-outline" onclick="CFDocs.previewKitchenSlip('${o.id}','${station}')">
                    <i data-lucide="printer" class="icon-sm"></i> สลิปครัว
                </button>` : ''}
            </div>

            <div class="ds-section-label" style="padding:0 16px">เปลี่ยนสถานะ</div>
            <div class="ds-actions cf-stack">
                ${nexts.length ? nexts.map((s) => `
                    <button class="btn ${s === 'PAID' ? 'btn-primary' : 'btn-outline'}"
                            onclick="OrdersPage.go('${s}')">${e(CF_ACTION_LABEL[s] || s)}</button>`).join('')
                  : '<div class="ds-empty-sm">ออเดอร์นี้สิ้นสุดแล้ว</div>'}
            </div>

            ${destructive.length ? `
            <div data-role-gate="ADMIN MANAGER">
                <div class="ds-section-label" style="padding:0 16px">จัดการพิเศษ</div>
                <div class="ds-actions cf-stack">
                    ${destructive.map((s) => `
                        <button class="btn btn-danger" onclick="OrdersPage.openReason('${s}')">
                            ${e(CF_ACTION_LABEL[s] || s)}</button>`).join('')}
                </div>
                <div class="ds-note" style="margin:0 16px">
                    ทุกรายการต้องระบุเหตุผล และจะถูกบันทึกไว้ในประวัติ
                </div>
            </div>` : ''}`;

        CFApp.applyRoleGate(document.getElementById('actionPane'));
    },

    setSlipStation(st) { this.state.slipStation = st; },

    go(status) {
        if (CFOrders.transition(this.state.selectedId, status)) {
            showToast('เปลี่ยนสถานะเป็น "' + CFApp.statusLabel(status) + '" แล้ว', 'success');
        }
    },

    /* ── drawer เหตุผล: เก็บเหตุผลก่อน แล้วค่อย confirm ──
       ทำสลับกันไม่ได้ เพราะ Drawer.confirm resolve true เมื่อกด Enter */
    openReason(status) {
        const e = CFApp.esc;
        const o = CFStore.byId('orders', this.state.selectedId);
        this._reason = { status, text: '' };

        const presets = {
            CANCELLED: ['ลูกค้ายกเลิก', 'รอนานเกินไป', 'สั่งผิดรายการ', 'สินค้าหมด'],
            VOIDED:    ['กดผิด', 'ออเดอร์ซ้ำ', 'ทดสอบระบบ'],
            REFUNDED:  ['ชงผิดรายการ', 'สินค้าไม่ได้คุณภาพ', 'ลูกค้าขอคืนเงิน'],
            PAYMENT_FAILED: ['สลิปไม่ถูกต้อง', 'ยอดไม่ตรง', 'ไม่พบรายการเข้าบัญชี'],
        }[status] || [];

        Drawer.open({
            title: (CF_ACTION_LABEL[status] || status) + ' — ' + e(o.orderNo),
            width: '480px',
            contentHtml: `
                <div class="sip-banner sip-banner-warning" style="margin-bottom:12px">
                    <i data-lucide="alert-triangle" class="icon-sm"></i>
                    การกระทำนี้ย้อนกลับไม่ได้ และจะถูกบันทึกพร้อมชื่อผู้ทำรายการ
                </div>
                <div class="ds-section-label">เหตุผล (บังคับ)</div>
                <textarea class="sip-textarea" id="rsText" rows="3"
                          placeholder="ระบุเหตุผล" oninput="OrdersPage.onReasonInput(this.value)"></textarea>
                <div class="ds-chips">
                    ${presets.map((r) => `<button type="button" class="ds-chip-suggest"
                        onclick="OrdersPage.pickReason('${e(r)}')">${e(r)}</button>`).join('')}
                </div>
                <div class="ds-note" style="margin-top:12px">
                    ออเดอร์ ${e(o.orderNo)} · ${CFApp.baht(o.total)} · ${e(o.kioskId)}
                </div>`,
            footerHtml: `
                <button class="btn btn-outline" onclick="Drawer.close()">ยกเลิก</button>
                <button class="btn btn-danger" id="btnReason" disabled onclick="OrdersPage.commitReason()">
                    ${e(CF_ACTION_LABEL[status] || status)}
                </button>`,
            onOpen: () => refreshIcons(),
        });
    },

    onReasonInput(v) {
        this._reason.text = v;
        const b = document.getElementById('btnReason');
        if (b) b.disabled = !v.trim();
    },

    pickReason(r) {
        document.getElementById('rsText').value = r;
        this.onReasonInput(r);
    },

    async commitReason() {
        const { status, text } = this._reason;
        if (!text.trim()) return;
        if (document.activeElement) document.activeElement.blur();

        const o = CFStore.byId('orders', this.state.selectedId);
        const ok = await Drawer.confirm({
            title: (CF_ACTION_LABEL[status] || status) + '?',
            message: 'ออเดอร์ ' + o.orderNo + ' · ' + CFApp.baht(o.total),
            lines: [text],
            confirmText: CF_ACTION_LABEL[status] || 'ยืนยัน', danger: true,
        });
        if (!ok) return;

        if (CFOrders.transition(this.state.selectedId, status, { reason: text })) {
            Drawer.close();
            showToast('บันทึกแล้ว', 'success');
        }
    },

    boot() {
        CFApp.boot({ page: 'orders' });
        const first = CFStore.all('orders')[0];
        if (first) this.state.selectedId = first.id;
        this.render();
        CFStore.subscribe(() => this.render());
    },
};

/** ป้ายชื่อเหตุการณ์ — ใช้ร่วมกับ dashboard */
function DashLabel(ev) {
    return (window.DashPage && DashPage.eventLabel) ? DashPage.eventLabel(ev) : ({
        ORDER_CREATED: 'สร้างออเดอร์', PAYMENT_RECEIVED: 'รับชำระเงินสด',
        PAYMENT_VERIFIED: 'ยืนยันการชำระ', PAYMENT_OVERRIDE: 'ยืนยันโดยพนักงาน',
        PAYMENT_TIMEOUT: 'หมดเวลาชำระ', STATION_READY: 'สถานีพร้อม',
        PRINT: 'พิมพ์เอกสาร', STATUS_CHANGE: 'เปลี่ยนสถานะ',
        PRODUCT_UPDATE: 'แก้ไขสินค้า', SHIFT_CLOSE: 'ปิดรอบ',
    }[ev] || ev);
}

window.OrdersPage = OrdersPage;
CFBoot.ready(() => OrdersPage.boot());
