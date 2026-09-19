/** CafeFlow — ปิดรอบ / ปิดวัน (§27, §28) */
const ClosingPage = {

    state: { actual: null },

    render() {
        const e = CFApp.esc;
        const shift = CFStore.openShift() || CFStore.all('shifts').slice(-1)[0];
        if (!shift) return;

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

        /* ── สินค้าขายดี ── */
        const top = CFKpi.topProducts(shift.id, 10);
        document.getElementById('topRows').innerHTML = top.length ? top.map((t, i) => `<tr>
                <td>${i + 1}</td>
                <td class="td-name">${e(t.name)}</td>
                <td class="cf-right">${t.qty}</td>
                <td class="cf-right cf-money">${CFApp.money(t.amount)}</td>
            </tr>`).join('') : '<tr><td colspan="4"><div class="ds-empty-sm">ยังไม่มียอดขาย</div></td></tr>';

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

    preview() {
        const shift = CFStore.openShift() || CFStore.all('shifts').slice(-1)[0];
        // เขียนยอดที่นับได้ลงรอบก่อน เพื่อให้ใบพิมพ์ตรงกับที่เห็นบนจอ
        if (this.state.actual != null) {
            CFStore.mutate((db) => {
                const s = db.shifts.find((x) => x.id === shift.id);
                s.actualCash = this.state.actual;
            }, 'cash-count');
        }
        CFDocs.previewClosing(shift.id);
    },

    async closeShift() {
        const shift = CFStore.openShift();
        if (!shift) { showToast('ไม่มีรอบที่เปิดอยู่', 'error'); return; }

        const k = CFKpi.summary(shift.id);
        const cc = CFKpi.cashControl(shift.id);
        const actual = this.state.actual;

        if (actual == null) {
            showToast('กรุณากรอกยอดเงินสดที่นับได้จริงก่อนปิดรอบ', 'error');
            const el = document.getElementById('actualCash');
            if (el) { el.focus(); el.classList.add('ds-miss'); setTimeout(() => el.classList.remove('ds-miss'), 2500); }
            return;
        }

        const diff = actual - cc.expected;
        const pending = CFStore.all('orders').filter((o) =>
            o.shiftId === shift.id && (CF_WAITING_PAY.includes(o.status) || CF_IN_PROGRESS.includes(o.status)));

        const ok = await Drawer.confirm({
            title: 'ปิดรอบการขาย?',
            message: shift.id,
            lines: [
                'ยอดขายรวม ' + CFApp.baht(k.sales) + ' · ' + k.orderCount + ' บิล',
                'เงินสดที่ควรมี ' + CFApp.baht(cc.expected),
                'นับได้จริง ' + CFApp.baht(actual),
                (diff === 0 ? 'เงินสดตรงพอดี' : (diff < 0 ? 'ขาด ' : 'เกิน ') + CFApp.baht(Math.abs(diff))),
            ],
            note: pending.length
                ? 'ยังมี ' + pending.length + ' ออเดอร์ที่ยังไม่จบ — จะถูกยกไปรอบถัดไป'
                : 'ระบบจะเปิดรอบใหม่ให้อัตโนมัติ',
            confirmText: 'ปิดรอบ', danger: true,
        });
        if (!ok) return;

        const me = (CFAuth.getUser() || {}).id;
        const nowIso = new Date().toISOString();

        CFStore.mutate((db) => {
            const s = db.shifts.find((x) => x.id === shift.id);
            s.closedAt = nowIso;
            s.closedBy = me;
            s.actualCash = actual;
            s.status = 'CLOSED';

            // เปิดรอบใหม่ทันที เงินตั้งต้นของรอบใหม่คือเงินที่นับได้จริง
            const seq = db.shifts.length + 1;
            db.shifts.push({
                id: 'SH-' + nowIso.slice(0, 10).replace(/-/g, '') + '-' + String(seq).padStart(2, '0'),
                openedAt: nowIso, closedAt: null,
                openedBy: me, closedBy: null,
                openingCash: actual, actualCash: null,
                status: 'OPEN',
            });

            CFOrders._audit(db, null, 'SHIFT_CLOSE', null, null, me,
                'ปิดรอบ ' + shift.id + ' · ผลต่าง ' + diff.toFixed(2));
        }, 'shift-close');

        this.state.actual = null;
        const el = document.getElementById('actualCash');
        if (el) el.value = '';
        showToast('ปิดรอบเรียบร้อย — เปิดรอบใหม่ให้แล้ว', 'success');
    },

    boot() {
        CFApp.boot({ page: 'closing' });
        this.render();
        CFStore.subscribe(() => this.render());
    },
};

window.ClosingPage = ClosingPage;
document.addEventListener('DOMContentLoaded', () => ClosingPage.boot());
