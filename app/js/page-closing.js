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

    renderPending() {
        const e = CFApp.esc;
        const list = this.pendingOrders();
        const card = document.getElementById('pendingCard');
        if (!card) return;
        card.hidden = !list.length;
        if (!list.length) return;

        document.getElementById('pendingCount').textContent = '(' + list.length + ')';
        const dis = this.state.busy ? 'disabled' : '';
        document.getElementById('pendingRows').innerHTML = list.map((o) => {
            const old = CFApp.elapsedMin(o.createdAt) > 12 * 60;
            const act = CLOSE_UNPAID.includes(o.status)
                ? `<button class="btn btn-outline btn-sm" ${dis} onclick="ClosingPage.cancelOne('${o.id}')">ยกเลิก</button>`
                : CLOSE_PAID.includes(o.status)
                    ? `<button class="btn btn-outline btn-sm" ${dis} onclick="ClosingPage.finishOne('${o.id}')">ปิดรายการ</button>`
                    : '<span class="text-muted">ตรวจสลิปที่หน้าแคชเชียร์</span>';
            return `<tr>
                <td class="td-name">#${e(o.orderNo)}</td>
                <td class="cf-nowrap">${CFApp.dateTime(o.createdAt)}
                    ${old ? '<span class="status-badge danger">ค้างจากวันก่อน</span>' : ''}</td>
                <td>${CFApp.statusChip(o.status)}</td>
                <td class="cf-right cf-money">${CFApp.money(o.total)}</td>
                <td class="cf-right cf-nowrap">${act}</td>
            </tr>`;
        }).join('');

        document.getElementById('pendingNote').textContent =
            'ต้องจัดการให้หมดก่อนจึงจะปิดรอบได้ · ยกเลิก = ออเดอร์ที่ยังไม่ได้รับเงิน ' +
            '· ปิดรายการ = จ่ายแล้วและลูกค้ารับของไปแล้ว · รอตรวจสลิป = ยืนยัน/ปฏิเสธที่หน้าแคชเชียร์';
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

    async clearAll() {
        const list = this.pendingOrders();
        const unpaid = list.filter((o) => CLOSE_UNPAID.includes(o.status));
        const paid = list.filter((o) => CLOSE_PAID.includes(o.status));
        const review = list.filter((o) => CLOSE_REVIEW.includes(o.status));
        if (!unpaid.length && !paid.length) {
            showToast('เหลือแต่ออเดอร์ที่รอตรวจสลิป — ตรวจที่หน้าแคชเชียร์ก่อน', 'error', 4000);
            return;
        }
        const ok = await Drawer.confirm({
            title: 'เคลียร์ออเดอร์ที่ยังไม่จบ?',
            message: list.length + ' ออเดอร์',
            lines: [
                unpaid.length ? 'ยกเลิก ' + unpaid.length + ' ออเดอร์ที่ยังไม่ได้ชำระ' : '',
                paid.length ? 'ปิดรายการ ' + paid.length + ' ออเดอร์ที่ชำระแล้ว' : '',
                review.length ? 'ข้าม ' + review.length + ' ออเดอร์ที่รอตรวจสลิป' : '',
            ].filter(Boolean),
            note: 'ยกเลิกด้วยเหตุผล "' + CLOSE_CANCEL_REASON + '" — ย้อนกลับไม่ได้',
            confirmText: 'เคลียร์', danger: true,
        });
        if (!ok) return;

        await this.run(async () => {
            let fail = 0;
            for (const o of unpaid) {
                if (!(await CFOrders.transition(o.id, 'CANCELLED', { reason: CLOSE_CANCEL_REASON }))) fail++;
            }
            for (const o of paid) {
                if (!(await this.walkToCompleted(o.id))) fail++;
            }
            showToast(fail ? 'เคลียร์ไม่สำเร็จ ' + fail + ' ออเดอร์' : 'เคลียร์เรียบร้อย',
                      fail ? 'error' : 'success', 4000);
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
        document.getElementById('openShiftCard').hidden = !!open;
        document.getElementById('closeBtn').hidden = !open;
        document.getElementById('closeBtn2').hidden = !open;
        const shift = open || CFStore.all('shifts').slice(-1)[0];
        if (!shift) {
            document.getElementById('shiftLine').textContent = 'ยังไม่มีรอบการขาย';
            this.renderPending();
            refreshIcons();
            return;
        }

        const k = CFKpi.summary(shift.id);
        const cc = CFKpi.cashControl(shift.id);

        document.getElementById('shiftLine').textContent =
            'รอบ ' + shift.id + ' · เปิด ' + CFApp.time(shift.openedAt) +
            (shift.closedAt ? ' · ปิด ' + CFApp.time(shift.closedAt) : ' · ยังไม่ปิดรอบ') +
            ' · ผู้เปิดรอบ ' + CFApp.actorName(shift.openedBy);

        const kpi = (icon, value, label, critical) => `
            <div class="sip-kpi ${critical ? 'critical' : ''}">
                <i data-lucide="${icon}" class="sip-kpi-icon icon-lg"></i>
                <div class="sip-kpi-value">${value}</div>
                <div class="sip-kpi-label">${label}</div>
            </div>`;

        document.getElementById('kpiStrip').innerHTML =
            kpi('wallet',  CFApp.baht(k.sales), 'ยอดขายรวม') +
            kpi('receipt', CFApp.int(k.orderCount), 'จำนวนบิล') +
            kpi('x-circle', CFApp.int(k.cancelledCount), 'ยกเลิก', k.cancelledCount > 0) +
            kpi('undo-2',  CFApp.int(k.refundedCount), 'คืนเงิน', k.refundedCount > 0);

        /* ── สรุปยอดขาย ── */
        const row = (label, count, amount, strong) => `<tr>
            <td class="l">${strong ? '<b>' + label + '</b>' : label}</td>
            <td class="c">${count}</td>
            <td class="r">${strong ? '<b>' + amount + '</b>' : amount}</td></tr>`;

        document.getElementById('salesTable').innerHTML = `
            <tr><th class="l">รายการ</th><th style="width:20%">จำนวน</th><th style="width:30%">บาท</th></tr>
            ${row('ยอดขายเงินสด', '—', CFApp.money(k.cash))}
            ${row('ยอดขาย QR / โอน', '—', CFApp.money(k.qr))}
            ${row('ยอดขายรวม', k.orderCount, CFApp.money(k.sales), true)}
            ${row('ยกเลิก', k.cancelledCount, CFApp.money(k.cancelledAmount))}
            ${row('คืนเงิน', k.refundedCount, CFApp.money(k.refundedAmount))}
            ${row('เฉลี่ยต่อบิล', '—', CFApp.money(k.avgOrder))}`;

        /* ── การควบคุมเงินสด ── */
        const actual = this.state.actual != null ? this.state.actual : cc.actual;
        const diff = actual == null ? null : actual - cc.expected;

        document.getElementById('cashTable').innerHTML = `
            <tr><td class="l">เงินตั้งต้น</td><td class="r">${CFApp.money(cc.opening)}</td></tr>
            <tr><td class="l">ยอดขายเงินสด</td><td class="r">${CFApp.money(cc.cashSales)}</td></tr>
            <tr><td class="l"><b>เงินสดที่ควรมี</b></td><td class="r"><b>${CFApp.money(cc.expected)}</b></td></tr>`;

        document.getElementById('diffBox').innerHTML = diff == null
            ? '<div class="ds-note">กรอกยอดเงินสดที่นับได้จริงเพื่อคำนวณผลต่าง</div>'
            : diff === 0
                ? '<div class="sip-banner sip-banner-success"><i data-lucide="check-circle" class="icon-sm"></i> เงินสดตรงพอดี</div>'
                : `<div class="sip-banner ${diff < 0 ? 'sip-banner-danger' : 'sip-banner-warning'}">
                     <i data-lucide="${diff < 0 ? 'alert-circle' : 'alert-triangle'}" class="icon-sm"></i>
                     ${diff < 0 ? 'เงินสดขาด' : 'เงินสดเกิน'} ${CFApp.baht(Math.abs(diff))}
                   </div>`;

        this.renderPending();

        /* ── สินค้าขายดี ── */
        const top = CFKpi.topProducts(shift.id, 10);
        // ต้นทุน/กำไร — เซิร์ฟเวอร์ส่งมาเฉพาะคนที่แก้ราคาได้ · cost null = บางแบบยังไม่ได้ใส่ต้นทุน (ไม่เดา)
        const withCost = top.some((t) => 'cost' in t);
        document.getElementById('topHead').innerHTML = `<tr><th>#</th><th>สินค้า</th><th class="cf-right">จำนวน</th>
            <th class="cf-right">ยอดเงิน</th>${withCost ? '<th class="cf-right">ต้นทุน</th><th class="cf-right">กำไรขั้นต้น</th>' : ''}</tr>`;
        const cols = withCost ? 6 : 4;
        let gp = 0, gpMissing = false;
        document.getElementById('topRows').innerHTML = top.length ? top.map((t, i) => {
            const known = withCost && t.cost != null;
            if (withCost) { if (known) gp += t.amount - t.cost; else gpMissing = true; }
            return `<tr>
                <td>${i + 1}</td>
                <td class="td-name">${e(t.name)}</td>
                <td class="cf-right">${t.qty}</td>
                <td class="cf-right cf-money">${CFApp.money(t.amount)}</td>
                ${withCost ? `<td class="cf-right cf-money">${known ? CFApp.money(t.cost) : '<span class="text-light" title="ยังไม่ได้ใส่ต้นทุน">—</span>'}</td>
                <td class="cf-right cf-money" style="font-weight:700">${known
                    ? CFApp.money(t.amount - t.cost) + ` <small class="text-muted">${t.amount ? Math.round((t.amount - t.cost) / t.amount * 100) : 0}%</small>`
                    : '<span class="text-light">—</span>'}</td>` : ''}
            </tr>`;
        }).join('') + (withCost ? `<tr><td colspan="5" class="cf-right td-name">กำไรขั้นต้นรวม (สินค้าที่แสดง${gpMissing ? ' · ไม่นับรายการที่ยังไม่ใส่ต้นทุน' : ''})</td>
            <td class="cf-right cf-money td-name">${CFApp.money(gp)}</td></tr>` : '')
            : `<tr><td colspan="${cols}"><div class="ds-empty-sm">ยังไม่มียอดขาย</div></td></tr>`;

        /* ── ลิงก์ส่งออกทีละไฟล์ ── */
        document.getElementById('csvLinks').innerHTML = [
            ['orders.csv', 'orders'], ['order_items.csv', 'orderItems'],
            ['payments.csv', 'payments'], ['daily_closing.csv', 'dailyClosing'],
        ].map(([name, fn]) => `
            <a class="ds-quick-link" href="#" onclick="ClosingPage.one('${name}','${fn}');return false">
                <i data-lucide="file-down" class="icon-sm"></i> ${name}
            </a>`).join('');

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
                note: 'ออเดอร์ทดสอบ/ค้างนาน กด "เคลียร์ทั้งหมด" ได้ในครั้งเดียว (ยกเว้นที่รอตรวจสลิป)',
                cancelText: 'ปิด', confirmText: 'ไปที่รายการค้าง', danger: false,
            });
            const card = document.getElementById('pendingCard');
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
        const ok = await Drawer.confirm({
            title: 'ปิดรอบการขาย?',
            message: shift.id,
            lines: [
                'ยอดขายรวม ' + CFApp.baht(k.sales) + ' · ' + k.orderCount + ' บิล',
                'เงินสดที่ควรมี ' + CFApp.baht(cc.expected),
                'นับได้จริง ' + CFApp.baht(actual),
                (diff === 0 ? 'เงินสดตรงพอดี' : (diff < 0 ? 'ขาด ' : 'เกิน ') + CFApp.baht(Math.abs(diff))),
            ],
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
        // ปุ่มปิดรอบมีสองที่ (หัวหน้า + ท้ายการ์ดนับเงิน) — ล็อกพร้อมกัน
        const btns = ['closeBtn', 'closeBtn2'].map((id) => document.getElementById(id)).filter(Boolean);
        btns.forEach((b) => { b.disabled = true; });
        try {
            const res = await CFStore.cmd('post',
                '/api/shifts/' + encodeURIComponent(shift.id) + '/close',
                { actualCash: actual, reopen: !!this.state.reopen });
            this.state.actual = null;
            const el2 = document.getElementById('actualCash');
            if (el2) el2.value = '';
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
