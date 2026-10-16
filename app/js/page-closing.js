/** CafeFlow — ปิดรอบ / ปิดวัน (§27, §28) */

/* ออเดอร์ที่ยังไม่จบ แบ่งตามสิ่งที่ทำได้ตอนปิดรอบ */
const CLOSE_UNPAID = ['DRAFT', 'ORDER_CONFIRMED', 'WAITING_CASH', 'WAITING_PAYMENT',
                      'PAYMENT_TIMEOUT', 'PAYMENT_FAILED'];          // ยังไม่มีเงินเข้า → ยกเลิกได้
const CLOSE_REVIEW = ['PAYMENT_REVIEW'];                            // อาจมีเงินเข้าแล้ว → ต้องตรวจสลิปที่แคชเชียร์ก่อน
const CLOSE_PAID   = ['PAID', 'SENT_TO_KITCHEN', 'PREPARING', 'READY', 'SERVED'];   // จ่ายแล้ว → ปิดรายการ
/** ทางเดินไป COMPLETED ตามผังสถานะ — ขั้นหลังชำระไม่มีการพิมพ์ เดินผ่านได้ไม่มีผลข้างเคียง */
const CLOSE_NEXT = { PAID: 'SENT_TO_KITCHEN', SENT_TO_KITCHEN: 'READY', PREPARING: 'READY',
                     READY: 'SERVED', SERVED: 'COMPLETED' };
const CLOSE_CANCEL_REASON = 'ค้างไม่ได้ชำระ — เคลียร์ตอนปิดรอบ';

const ClosingPage = {

    state: { actual: null, busy: false },

    /** ออเดอร์ที่ยังไม่จบทั้งหมด ไม่จำกัดรอบ — ของที่ค้างจากวันก่อนผูกอยู่กับรอบที่ปิดไปแล้ว */
    pendingOrders() {
        const open = CLOSE_UNPAID.concat(CLOSE_REVIEW, CLOSE_PAID);
        return CFStore.where('orders', (o) => open.includes(o.status))
            .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    },

    /**
     * ขั้น 1 — สรุปเป็น 3 กลุ่มตามสิ่งที่ต้องทำ แต่ละกลุ่มมีปุ่มจัดการทั้งกลุ่ม (เดิมตาราง 17 แถวดันขั้นอื่นตกจอ)
     * ตารางรายใบยังมี แต่พับไว้ — กด "ดูรายการ" เมื่ออยากจัดการทีละใบ
     */
    renderPending() {
        const e = CFApp.esc;
        const list = this.pendingOrders();
        const body = document.getElementById('pendingBody');
        if (!body) return;
        const done = !list.length;
        document.getElementById('step1').classList.toggle('is-done', done);
        document.getElementById('step1State').innerHTML = done
            ? '<span class="sip-chip sip-chip-success">เรียบร้อย</span>'
            : `<span class="sip-chip sip-chip-danger">ค้าง ${list.length} ใบ</span>`;
        if (done) {
            body.innerHTML = '<div class="cf-cl-ok"><i data-lucide="check-circle" class="icon-sm"></i> ไม่มีออเดอร์ค้าง — ไปขั้นที่ 2 ได้เลย</div>';
            return;
        }

        const dis = this.state.busy ? 'disabled' : '';
        const sum = (l) => CFApp.baht(l.reduce((a, o) => a + o.total, 0));
        const unpaid = list.filter((o) => CLOSE_UNPAID.includes(o.status));
        const paid = list.filter((o) => CLOSE_PAID.includes(o.status));
        const review = list.filter((o) => CLOSE_REVIEW.includes(o.status));
        const group = (l, icon, tone, title, sub, btn) => l.length ? `
            <div class="cf-cl-group ${tone}">
                <span class="cf-cl-group-ico"><i data-lucide="${icon}" class="icon-sm"></i></span>
                <div class="cf-cl-group-body">
                    <div class="cf-cl-group-title">${title} <b>${l.length} ใบ</b> · ${sum(l)}</div>
                    <div class="cf-cl-group-sub">${sub}</div>
                </div>
                ${btn}
            </div>` : '';

        const rows = list.map((o) => {
            const act = CLOSE_UNPAID.includes(o.status)
                ? `<button class="btn btn-outline btn-sm" ${dis} onclick="ClosingPage.cancelOne('${o.id}')">ยกเลิก</button>`
                : CLOSE_PAID.includes(o.status)
                    ? `<button class="btn btn-outline btn-sm" ${dis} onclick="ClosingPage.finishOne('${o.id}')">ปิดรายการ</button>`
                    : '<a class="btn btn-outline btn-sm" href="cashier.html">ตรวจที่แคชเชียร์</a>';
            return `<tr>
                <td class="td-name">${e(o.orderNo)}</td>
                <td class="cf-nowrap td-sub">${CFApp.dateTime(o.createdAt)}</td>
                <td>${CFApp.statusChip(o.status)}</td>
                <td class="cf-right cf-money">${CFApp.money(o.total)}</td>
                <td class="cf-right cf-nowrap">${act}</td>
            </tr>`;
        }).join('');

        body.innerHTML =
            group(unpaid, 'circle-slash', 'warn', 'ยังไม่ได้รับเงิน', 'ลูกค้าไม่ได้จ่าย / ออเดอร์ทดสอบ → ยกเลิก',
                `<button class="btn btn-outline btn-sm" ${dis} onclick="ClosingPage.clearGroup('unpaid')">ยกเลิกทั้งหมด</button>`) +
            group(paid, 'package-check', 'info', 'จ่ายแล้ว ยังไม่ปิดรายการ', 'ลูกค้ารับของไปแล้ว → ปิดรายการ',
                `<button class="btn btn-outline btn-sm" ${dis} onclick="ClosingPage.clearGroup('paid')">ปิดรายการทั้งหมด</button>`) +
            group(review, 'scan-text', 'danger', 'รอตรวจสลิป', 'อาจมีเงินเข้าแล้ว — ต้องดูสลิปแล้วยืนยัน/ปฏิเสธที่หน้าแคชเชียร์',
                '<a class="btn btn-outline btn-sm" href="cashier.html">ไปตรวจ <i data-lucide="arrow-right" class="icon-sm"></i></a>') +
            `<details class="cf-cl-details" ${this.state.listOpen ? 'open' : ''} ontoggle="ClosingPage.state.listOpen = this.open">
                <summary>ดูรายการทีละใบ (${list.length})</summary>
                <div class="table-responsive"><table class="data-table compact">
                    <thead><tr><th>ออเดอร์</th><th>สั่งเมื่อ</th><th>สถานะ</th><th class="cf-right">ยอด</th><th></th></tr></thead>
                    <tbody>${rows}</tbody>
                </table></div>
            </details>`;
    },

    async cancelOne(id) {
        const o = CFStore.byId('orders', id);
        if (!o) return;
        const ok = await Drawer.confirm({
            title: 'ยกเลิกออเดอร์ #' + o.orderNo + '?',
            message: CFApp.statusLabel(o.status) + ' · ' + CFApp.baht(o.total),
            note: 'เหตุผล: ' + CLOSE_CANCEL_REASON,
            confirmText: 'ยกเลิกออเดอร์', danger: true,
        });
        if (!ok) return;
        await this.run(() => CFOrders.transition(id, 'CANCELLED', { reason: CLOSE_CANCEL_REASON }));
    },

    async finishOne(id) {
        await this.run(() => this.walkToCompleted(id));
    },

    /** เดินทีละขั้นจนถึง COMPLETED — CFStore.cmd รอ snapshot ใหม่ทุกครั้ง สถานะในเครื่องจึงตรงก่อนขั้นถัดไป */
    async walkToCompleted(id) {
        let o = CFStore.byId('orders', id);
        while (o && CLOSE_NEXT[o.status]) {
            if (!(await CFOrders.transition(id, CLOSE_NEXT[o.status]))) return false;
            o = CFStore.byId('orders', id);
        }
        return true;
    },

    /** จัดการทั้งกลุ่ม — unpaid = ยกเลิก · paid = เดินไปจนปิดรายการ (กลุ่มรอตรวจสลิปต้องไปตรวจที่แคชเชียร์) */
    async clearGroup(kind) {
        const list = this.pendingOrders().filter((o) => (kind === 'unpaid' ? CLOSE_UNPAID : CLOSE_PAID).includes(o.status));
        if (!list.length) return;
        const ok = await Drawer.confirm({
            title: kind === 'unpaid' ? 'ยกเลิกออเดอร์ที่ยังไม่ได้รับเงิน?' : 'ปิดรายการออเดอร์ที่จ่ายแล้ว?',
            message: list.length + ' ใบ · ' + CFApp.baht(list.reduce((a, o) => a + o.total, 0)),
            lines: list.slice(0, 8).map((o) => o.orderNo + ' · ' + CFApp.statusLabel(o.status) + ' · ' + CFApp.baht(o.total))
                .concat(list.length > 8 ? ['และอีก ' + (list.length - 8) + ' ใบ'] : []),
            note: kind === 'unpaid' ? 'ยกเลิกด้วยเหตุผล "' + CLOSE_CANCEL_REASON + '" — ย้อนกลับไม่ได้'
                : 'ใช้เมื่อลูกค้ารับของไปแล้ว — ยอดขายยังนับตามเดิม',
            confirmText: kind === 'unpaid' ? 'ยกเลิกทั้งหมด' : 'ปิดรายการทั้งหมด', danger: kind === 'unpaid',
        });
        if (!ok) return;
        await this.run(async () => {
            let fail = 0;
            for (const o of list) {
                const r = kind === 'unpaid'
                    ? await CFOrders.transition(o.id, 'CANCELLED', { reason: CLOSE_CANCEL_REASON })
                    : await this.walkToCompleted(o.id);
                if (!r) fail++;
            }
            showToast(fail ? 'ทำไม่สำเร็จ ' + fail + ' ใบ' : 'เรียบร้อย ' + list.length + ' ใบ', fail ? 'error' : 'success', 4000);
        });
    },

    /** กันกดซ้ำระหว่างที่กำลังเดินสถานะ */
    async run(fn) {
        if (this.state.busy) return;
        this.state.busy = true;
        this.renderPending();
        try { await fn(); } finally { this.state.busy = false; this.render(); }
    },

    render() {
        const e = CFApp.esc;
        const open = CFStore.openShift();
        CFApp.staleShiftToast(true);
        document.getElementById('openShiftCard').hidden = !!open;
        document.getElementById('closeLayout').hidden = !open;
        if (!open) {
            const last = CFStore.all('shifts').slice(-1)[0];
            document.getElementById('shiftLine').textContent = last && last.closedAt
                ? 'รอบล่าสุดปิดเมื่อ ' + CFApp.dateTime(last.closedAt) : 'ยังไม่มีรอบการขาย';
            refreshIcons();
            return;
        }
        const shift = open;
        const k = CFKpi.summary(shift.id);
        const cc = CFKpi.cashControl(shift.id);

        // เวลาเปิด + คนเปิด ไม่ใช่รหัสรอบ (รหัสอยู่บนใบปิดรอบ)
        document.getElementById('shiftLine').textContent =
            'รอบเปิดตั้งแต่ ' + CFApp.dateTime(shift.openedAt) + ' · โดย ' + CFApp.actorName(shift.openedBy);

        this.renderPending();
        const pending = this.pendingOrders().length;

        /* ── ขั้น 2: นับเงิน ── */
        const actual = this.state.actual != null ? this.state.actual : cc.actual;
        const diff = actual == null ? null : actual - cc.expected;
        document.getElementById('cashExpect').innerHTML = `
            <div class="cf-cl-expect-label">เงินสดที่ควรมีในลิ้นชัก</div>
            <div class="cf-cl-expect-value">${CFApp.baht(cc.expected)}</div>
            <div class="td-sub">เงินตั้งต้น ${CFApp.baht(cc.opening)} + ขายเงินสด ${CFApp.baht(cc.cashSales)}</div>`;
        document.getElementById('diffBox').innerHTML = diff == null ? ''
            : diff === 0
                ? '<div class="sip-banner sip-banner-success"><i data-lucide="check-circle" class="icon-sm"></i> เงินสดตรงพอดี</div>'
                : `<div class="sip-banner ${diff < 0 ? 'sip-banner-danger' : 'sip-banner-warning'}">
                     <i data-lucide="${diff < 0 ? 'alert-circle' : 'alert-triangle'}" class="icon-sm"></i>
                     ${diff < 0 ? 'เงินสดขาด' : 'เงินสดเกิน'} ${CFApp.baht(Math.abs(diff))} — นับซ้ำอีกรอบก่อนปิด</div>`;
        // เงินไม่ตรง → ช่องหมายเหตุเด่นขึ้น ชวนบอกเหตุผล (ไม่บังคับ — บางทีหาสาเหตุไม่เจอจริง ๆ)
        const off = diff != null && diff !== 0;
        document.getElementById('noteField').classList.toggle('cf-cl-note-ask', off);
        document.getElementById('noteLabel').textContent = off
            ? 'เงิน' + (diff < 0 ? 'ขาด' : 'เกิน') + ' — บอกสาเหตุไว้ให้ผู้จัดการ (ถ้ารู้)' : 'หมายเหตุ (ถ้ามี)';
        document.getElementById('step2').classList.toggle('is-done', actual != null);
        document.getElementById('step2State').innerHTML = actual != null
            ? '<span class="sip-chip sip-chip-success">นับแล้ว</span>' : '';

        /* ── ขั้น 3: พร้อมไหม — บอกสิ่งที่ยังขาดตรงปุ่ม ── */
        const missing = [
            pending ? 'เคลียร์ออเดอร์ค้าง ' + pending + ' ใบ (ขั้นที่ 1)' : '',
            actual == null ? 'กรอกเงินที่นับได้ (ขั้นที่ 2)' : '',
        ].filter(Boolean);
        document.getElementById('readyHint').innerHTML = missing.length
            ? '<i data-lucide="info" class="icon-sm"></i> ยังต้อง: ' + missing.map(e).join(' · ') : '';

        /* ── ด้านขวา: สรุปรอบนี้ ── */
        const line = (label, value, cls) => `<div class="cf-cl-line ${cls || ''}"><span>${label}</span><b>${value}</b></div>`;
        document.getElementById('summary').innerHTML =
            line('ยอดขายรวม', CFApp.baht(k.sales), 'big') +
            line('จำนวนบิล', CFApp.int(k.orderCount) + ' บิล · เฉลี่ย ' + CFApp.baht(k.avgOrder)) +
            line('เงินสด', CFApp.baht(k.cash)) +
            line('QR / โอน', CFApp.baht(k.qr)) +
            (k.cancelledCount ? line('ยกเลิก', k.cancelledCount + ' บิล · ' + CFApp.baht(k.cancelledAmount), 'muted') : '') +
            (k.refundedCount ? line('คืนเงิน', k.refundedCount + ' บิล · ' + CFApp.baht(k.refundedAmount), 'muted') : '');

        const top = CFKpi.topProducts(shift.id, 5);
        document.getElementById('topList').innerHTML = top.length ? top.map((t, i) => `
            <div class="cf-top-row"><span class="cf-top-rank">${i + 1}</span>
                <span class="cf-top-name">${e(t.name)}</span>
                <span class="cf-top-val"><b>${t.qty}</b> · ${CFApp.baht(t.amount)}</span></div>`).join('')
            : '<div class="ds-empty-sm">ยังไม่มียอดขาย</div>';

        document.getElementById('csvLinks').innerHTML = [
            ['orders.csv', 'orders', 'ออเดอร์'], ['order_items.csv', 'orderItems', 'รายการสินค้า'],
            ['payments.csv', 'payments', 'การชำระเงิน'], ['daily_closing.csv', 'dailyClosing', 'สรุปปิดรอบ'],
        ].map(([name, fn, th]) => `
            <a href="#" onclick="ClosingPage.one('${name}','${fn}');return false">
                <i data-lucide="file-down" class="icon-sm"></i> ${th} <span class="td-sub">${name}</span></a>`).join('');

        CFApp.applyRoleGate();
        refreshIcons();
    },

    one(name, fn) {
        const shift = CFStore.openShift();
        CFExport.download(name, CFExport[fn](shift && shift.id));
    },

    onCash(v) {
        const n = parseFloat(v);
        this.state.actual = isNaN(n) ? null : n;
        this.render();
        // render() วาด input ใหม่ไม่ได้ (input อยู่นอก container ที่ถูกเขียนทับ)
        // จึงคืนค่าที่พิมพ์กลับไปเองเพื่อไม่ให้ cursor เด้ง
        const el = document.getElementById('actualCash');
        if (el && el.value !== v) el.value = v;
    },

    async preview() {
        const shift = CFStore.openShift() || CFStore.all('shifts').slice(-1)[0];
        if (!shift) { showToast('ยังไม่มีรอบการขาย', 'error'); return; }
        // เขียนยอดที่นับได้ลงรอบก่อน เพื่อให้ใบพิมพ์ตรงกับที่เห็นบนจอ
        // ต้องรอให้เสร็จ — พรีวิววาดที่เซิร์ฟเวอร์ ถ้ายิงพร้อมกันอาจได้ยอดนับเก่า
        if (this.state.actual != null && shift.status === 'OPEN') {
            await CFStore.cmd('patch', '/api/shifts/' + encodeURIComponent(shift.id),
                { actualCash: this.state.actual })
                .catch((err) => console.warn('[Closing] บันทึกยอดนับไม่สำเร็จ', err));
        }
        CFDocs.previewClosing(shift.id);
    },

    toggleReopen() {
        this.state.reopen = !this.state.reopen;
        document.getElementById('reopenToggle').classList.toggle('is-on', this.state.reopen);
    },

    /** เปิดรอบ — ทุกเช้าก่อนขาย (ปิดรอบแบบปิดร้านแล้วระบบไม่เปิดรอบใหม่ให้) */
    async openShift() {
        const el = document.getElementById('openingCash');
        const v = el.value.trim();
        const cash = Number(v);
        if (v === '' || !isFinite(cash) || cash < 0) {
            showToast('กรุณากรอกเงินตั้งต้นในลิ้นชัก (ไม่มีให้ใส่ 0)', 'error');
            el.focus();
            return;
        }
        const btn = document.getElementById('openShiftBtn');
        btn.disabled = true;
        try {
            const res = await CFStore.cmd('post', '/api/shifts/open', { openingCash: cash });
            el.value = '';
            showToast('เปิดรอบ ' + res.shiftId + ' แล้ว — คีออสก์รับออเดอร์ได้' +
                      (res.carriedOver ? ' · ยกออเดอร์ค้างเข้ารอบนี้ ' + res.carriedOver + ' ออเดอร์' : ''), 'success', 4000);
        } catch (err) {
            showToast(err.message || 'เปิดรอบไม่สำเร็จ', 'error', 5000);
        } finally {
            btn.disabled = false;
        }
    },

    async closeShift() {
        const shift = CFStore.openShift();
        if (!shift) { showToast('ไม่มีรอบที่เปิดอยู่', 'error'); return; }

        const k = CFKpi.summary(shift.id);
        const cc = CFKpi.cashControl(shift.id);
        const actual = this.state.actual;

        // ยังมีออเดอร์ไม่จบ → ปิดรอบไม่ได้ (เซิร์ฟเวอร์ก็ปฏิเสธเช่นกัน) บอกว่าค้างอะไรบ้าง แล้วพาไปที่รายการ
        const pending = this.pendingOrders();
        if (pending.length) {
            const count = (list) => pending.filter((o) => list.includes(o.status)).length;
            const unpaid = count(CLOSE_UNPAID), review = count(CLOSE_REVIEW), paid = count(CLOSE_PAID);
            const go = await Drawer.confirm({
                title: 'ยังปิดรอบไม่ได้',
                message: 'มีออเดอร์ที่ยังไม่จบ ' + pending.length + ' ออเดอร์ — จัดการให้เสร็จก่อน',
                lines: [
                    unpaid ? 'ยังไม่ได้ชำระ ' + unpaid + ' ออเดอร์ → รับเงิน หรือกด "ยกเลิก"' : '',
                    review ? 'รอตรวจสลิป ' + review + ' ออเดอร์ → ยืนยัน/ปฏิเสธที่หน้าแคชเชียร์' : '',
                    paid ? 'ชำระแล้วแต่ยังไม่ส่งมอบ ' + paid + ' ออเดอร์ → ส่งมอบ หรือกด "ปิดรายการ"' : '',
                ],
                note: 'ขั้นที่ 1 มีปุ่ม "ยกเลิกทั้งหมด" / "ปิดรายการทั้งหมด" ทำทีเดียวทั้งกลุ่มได้ (ยกเว้นที่รอตรวจสลิป)',
                cancelText: 'ปิด', confirmText: 'ไปที่รายการค้าง', danger: false,
            });
            const card = document.getElementById('step1');
            if (go && card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }

        if (actual == null) {
            showToast('กรุณากรอกยอดเงินสดที่นับได้จริงก่อนปิดรอบ', 'error');
            const el = document.getElementById('actualCash');
            if (el) { el.focus(); el.classList.add('ds-miss'); setTimeout(() => el.classList.remove('ds-miss'), 2500); }
            return;
        }

        const diff = actual - cc.expected;
        const note = (document.getElementById('closeNote').value || '').trim();
        const ok = await Drawer.confirm({
            title: 'ปิดรอบการขาย?',
            message: 'รอบเปิดตั้งแต่ ' + CFApp.dateTime(shift.openedAt),
            lines: [
                'ยอดขายรวม ' + CFApp.baht(k.sales) + ' · ' + k.orderCount + ' บิล',
                'เงินสดที่ควรมี ' + CFApp.baht(cc.expected),
                'นับได้จริง ' + CFApp.baht(actual),
                (diff === 0 ? 'เงินสดตรงพอดี' : (diff < 0 ? 'ขาด ' : 'เกิน ') + CFApp.baht(Math.abs(diff))),
                note ? 'หมายเหตุ: ' + note : '',
            ].filter(Boolean),
            note: this.state.reopen
                ? 'เปลี่ยนกะ — ระบบเปิดรอบใหม่ให้ทันที เงินตั้งต้น ' + CFApp.baht(actual)
                : 'ปิดร้าน — คีออสก์จะไม่รับออเดอร์จนกว่าจะกด "เปิดรอบ" อีกครั้ง',
            confirmText: 'ปิดรอบ', danger: true,
        });
        if (!ok) return;

        // เปลี่ยนกะ: ปิดรอบ + เปิดรอบใหม่ อยู่ในทรานแซกชันเดียวกันฝั่งเซิร์ฟเวอร์
        // ★ ล็อกปุ่มระหว่างรอ — กดซ้ำตอนจอยังไม่อัปเดต = ปิดรอบใหม่ที่ระบบเพิ่งเปิดให้ทันที (รอบว่างซ้อนหลายรอบ)
        if (this._closing) return;
        this._closing = true;
        const btns = ['closeBtn'].map((id) => document.getElementById(id)).filter(Boolean);
        btns.forEach((b) => { b.disabled = true; });
        try {
            const res = await CFStore.cmd('post',
                '/api/shifts/' + encodeURIComponent(shift.id) + '/close',
                { actualCash: actual, reopen: !!this.state.reopen, note });
            this.state.actual = null;
            const el2 = document.getElementById('actualCash');
            if (el2) el2.value = '';
            document.getElementById('closeNote').value = '';
            this.state.reopen = false;
            document.getElementById('reopenToggle').classList.remove('is-on');
            showToast(res.nextShift
                ? 'ปิดรอบเรียบร้อย — เปิดรอบ ' + res.nextShift + ' ให้แล้ว'
                : 'ปิดรอบเรียบร้อย — คีออสก์หยุดรับออเดอร์ · พรุ่งนี้กด "เปิดรอบ" ก่อนขาย', 'success', 5000);
        } catch (err) {
            showToast(err.message || 'ปิดรอบไม่สำเร็จ', 'error', 5000);
        } finally {
            this._closing = false;
            btns.forEach((b) => { b.disabled = false; });
        }
    },

    boot() {
        CFApp.boot({ page: 'closing' });
        this.render();
        CFStore.subscribe(() => this.render());
    },
};

window.ClosingPage = ClosingPage;
CFBoot.ready(() => ClosingPage.boot());
