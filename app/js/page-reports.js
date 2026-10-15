/**
 * CafeFlow — รายงาน (ผู้จัดการ + แอดมิน)
 * เลือกช่วงวันทำการ → ดึง /api/reports/days ครั้งเดียว แล้ววาดทุกส่วนจากก้อนนั้น
 * กราฟเป็นแถบ CSS ธรรมดา (ไม่ลงไลบรารีกราฟ — ร้านต้องใช้ได้แม้เน็ตหลุด และหน้าเบา)
 */
const ReportsPage = {

    state: { range: 'today', from: null, to: null, data: null, loading: false },

    RANGES: [
        ['today', 'วันนี้'], ['yesterday', 'เมื่อวาน'], ['7d', '7 วัน'],
        ['30d', '30 วัน'], ['month', 'เดือนนี้'], ['custom', 'เลือกวัน'],
    ],

    /** วันทำการวันนี้ตามเวลาเริ่มวันของร้าน — ตรงกับเลข A001 และหน้าประวัติบิล */
    today() { return CFDay.businessDate(Date.now(), CFDay.startHourOf(CFStore.settings())); },
    shift(ymd, days) {
        const d = new Date(ymd + 'T12:00:00Z');
        d.setUTCDate(d.getUTCDate() + days);
        return d.toISOString().slice(0, 10);
    },
    dayText(ymd) { return CFApp.date(ymd + 'T12:00:00+07:00'); },

    setRange(key) {
        this.state.range = key;
        const t = this.today();
        document.getElementById('customBox').hidden = key !== 'custom';
        if (key === 'custom') {
            const f = document.getElementById('dFrom'), to = document.getElementById('dTo');
            f.max = to.max = t;
            if (!f.value) f.value = this.shift(t, -6);
            if (!to.value) to.value = t;
            this.renderSeg();
            return this.custom();
        }
        const r = {
            today: [t, t], yesterday: [this.shift(t, -1), this.shift(t, -1)],
            '7d': [this.shift(t, -6), t], '30d': [this.shift(t, -29), t], month: [t.slice(0, 8) + '01', t],
        }[key];
        this.load(r[0], r[1]);
    },

    custom() {
        const f = document.getElementById('dFrom').value, t = document.getElementById('dTo').value;
        if (!f || !t) return;
        if (f > t) { showToast('วันเริ่มต้องไม่หลังวันสิ้นสุด', 'error'); return; }
        this.load(f, t);
    },

    async load(from, to) {
        this.state.from = from; this.state.to = to; this.state.loading = true;
        this.renderSeg();
        document.getElementById('rangeLine').textContent = 'กำลังโหลด…';
        try {
            const d = await CFApi.get(`/api/reports/days?from=${from}&to=${to}`);
            if (this.state.from !== from || this.state.to !== to) return;        // เปลี่ยนช่วงไปแล้วระหว่างรอ
            this.state.data = d;
        } catch (err) {
            showToast(err.message || 'โหลดรายงานไม่สำเร็จ', 'error', 5000);
            this.state.data = null;
        }
        this.state.loading = false;
        this.render();
    },

    renderSeg() {
        document.getElementById('rangeSeg').innerHTML = this.RANGES.map(([k, l]) =>
            `<button type="button" class="ds-seg ${k === this.state.range ? 'active' : ''}"
                     onclick="ReportsPage.setRange('${k}')">${l}</button>`).join('');
    },

    render() {
        const e = CFApp.esc, d = this.state.data;
        const { from, to } = this.state;
        const days = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
        document.getElementById('rangeLine').textContent = from === to
            ? 'วันทำการ ' + this.dayText(from)
            : this.dayText(from) + ' – ' + this.dayText(to) + ' (' + days + ' วัน)';
        if (!d) { ['kpis', 'hourChart', 'topList', 'staffTable', 'profitTable'].forEach((id) => {
            document.getElementById(id).innerHTML = '<div class="ds-empty-sm">ไม่มีข้อมูล</div>'; }); return; }

        const s = d.summary;
        const known = d.products.filter((p) => p.cost != null);
        const profit = known.reduce((a, p) => a + (p.amount - p.cost), 0);
        const knownSales = known.reduce((a, p) => a + p.amount, 0);
        const kpi = (icon, value, label, sub) => `
            <div class="sip-kpi">
                <i data-lucide="${icon}" class="sip-kpi-icon icon-lg"></i>
                <div class="sip-kpi-value">${value}</div>
                <div class="sip-kpi-label">${label}${sub ? `<div class="td-sub">${sub}</div>` : ''}</div>
            </div>`;
        document.getElementById('kpis').innerHTML =
            kpi('wallet', CFApp.baht(s.sales), 'ยอดขาย', 'เงินสด ' + CFApp.baht(s.cash) + ' · QR ' + CFApp.baht(s.qr)) +
            kpi('receipt', CFApp.int(s.orderCount), 'บิล', 'เฉลี่ย ' + CFApp.baht(s.avgOrder) + ' / บิล') +
            kpi('coins', known.length ? CFApp.baht(profit) : '—', 'กำไรขั้นต้น',
                known.length ? (knownSales ? Math.round(profit / knownSales * 100) : 0) + '% ของยอดที่มีต้นทุน' : 'ยังไม่ได้ใส่ต้นทุนเมนู') +
            kpi('x-circle', CFApp.int(s.cancelledCount + s.refundedCount), 'ยกเลิก / คืนเงิน',
                CFApp.baht(s.cancelledAmount + s.refundedAmount));

        /* ── รายชั่วโมง — ตัดชั่วโมงหัว/ท้ายที่ไม่มีขายออก (ร้านไม่ได้เปิด 24 ชม.) ── */
        const hrs = d.byHour;
        let a = hrs.findIndex((h) => h.orders), b = 23 - [...hrs].reverse().findIndex((h) => h.orders);
        if (a < 0) { a = 7; b = 20; }
        const shown = hrs.slice(a, b + 1);
        const maxH = Math.max(1, ...shown.map((h) => h.sales));
        const peak = shown.reduce((m, h) => (h.sales > m.sales ? h : m), shown[0]);
        document.getElementById('hourChart').innerHTML = s.orderCount ? `
            <div class="cf-vbars">${shown.map((h) => `
                <div class="cf-vbar ${h === peak && h.sales ? 'peak' : ''}" title="${String(h.hour).padStart(2, '0')}:00 · ${h.orders} บิล · ${CFApp.baht(h.sales)}">
                    <span class="cf-vbar-val">${h.sales ? CFApp.int(Math.round(h.sales)) : ''}</span>
                    <span class="cf-vbar-fill" style="height:${h.sales ? Math.max(3, h.sales / maxH * 100) : 0}%"></span>
                    <span class="cf-vbar-lbl">${String(h.hour).padStart(2, '0')}</span>
                </div>`).join('')}</div>
            <div class="ds-note" style="margin-top:8px">ขายดีสุดช่วง <b>${String(peak.hour).padStart(2, '0')}:00–${String(peak.hour + 1).padStart(2, '0')}:00</b>
                · ${peak.orders} บิล · ${CFApp.baht(peak.sales)}${days > 1 ? ' (รวมทุกวันในช่วง)' : ''}</div>`
            : '<div class="ds-empty-sm">ไม่มียอดขายในช่วงนี้</div>';

        /* ── รายวัน — เฉพาะช่วงหลายวัน ── */
        document.getElementById('dayCard').hidden = days < 2;
        if (days >= 2) {
            const map = new Map(d.byDay.map((x) => [x.day, x]));
            const all = Array.from({ length: days }, (_, i) => map.get(this.shift(from, i)) || { day: this.shift(from, i), orders: 0, sales: 0 });
            const maxD = Math.max(1, ...all.map((x) => x.sales));
            document.getElementById('dayChart').innerHTML = `<div class="cf-vbars ${days > 14 ? 'dense' : ''}">${all.map((x) => `
                <div class="cf-vbar" title="${e(this.dayText(x.day))} · ${x.orders} บิล · ${CFApp.baht(x.sales)}">
                    <span class="cf-vbar-val">${days <= 14 && x.sales ? CFApp.int(Math.round(x.sales)) : ''}</span>
                    <span class="cf-vbar-fill" style="height:${x.sales ? Math.max(3, x.sales / maxD * 100) : 0}%"></span>
                    <span class="cf-vbar-lbl">${Number(x.day.slice(8))}</span>
                </div>`).join('')}</div>`;
        }

        /* ── สินค้าขายดี 10 อันดับ (ตามจำนวน) ── */
        const top = d.products.slice(0, 10);
        const maxQ = Math.max(1, ...top.map((p) => p.qty));
        document.getElementById('topList').innerHTML = top.length ? top.map((p, i) => `
            <div class="cf-load-row">
                <div class="cf-load-name" title="${e(p.name)}">${i + 1}. ${e(p.name)}</div>
                <div class="cf-load-track"><div class="cf-load-fill" style="width:${Math.max(4, p.qty / maxQ * 100)}%"></div></div>
                <div class="cf-load-val">${p.qty} แก้ว · ${CFApp.baht(p.amount)}</div>
            </div>`).join('') : '<div class="ds-empty-sm">ยังไม่มีการขาย</div>';

        /* ── พนักงาน ── */
        document.getElementById('staffTable').innerHTML = d.staff.length ? `
            <div class="table-responsive"><table class="data-table compact">
                <thead><tr><th>พนักงาน</th><th class="r">บิลที่รับเงิน</th><th class="r">ยอด</th>
                    <th class="r" title="ยืนยันการชำระแทนระบบ">ยืนยันแทน</th><th class="r">ยกเลิก/คืน</th></tr></thead>
                <tbody>${d.staff.map((x) => `<tr>
                    <td><div class="td-name">${e(x.name)}</div>
                        <div class="td-sub">${x.role ? e(CF_ROLE_LABEL[x.role] || x.role) : 'ไม่มีพนักงานกด — ระบบปิดบิลเอง'}${x.active ? '' : ' · ปิดใช้งาน'}</div></td>
                    <td class="r">${CFApp.int(x.orders)}</td>
                    <td class="r">${CFApp.baht(x.sales)}<div class="td-sub">สด ${CFApp.baht(x.cash)} · QR ${CFApp.baht(x.qr)}</div></td>
                    <td class="r">${x.overrides || '—'}</td>
                    <td class="r">${x.cancelled + x.voided + x.refunded || '—'}</td>
                </tr>`).join('')}</tbody>
            </table></div>` : '<div class="ds-empty-sm">ยังไม่มีข้อมูล</div>';

        /* ── กำไรต่อเมนู (เรียงตามกำไร · ใบที่ยังไม่มีต้นทุนไว้ท้าย) ── */
        const rows = d.products.slice().sort((x, y) =>
            (y.cost != null) - (x.cost != null) || ((y.amount - (y.cost || 0)) - (x.amount - (x.cost || 0))));
        document.getElementById('profitTable').innerHTML = rows.length ? `
            <div class="table-responsive"><table class="data-table compact">
                <thead><tr><th>เมนู</th><th class="r">จำนวน</th><th class="r">ยอดขาย</th><th class="r">ต้นทุน</th>
                    <th class="r">กำไร</th><th class="r">% กำไร</th></tr></thead>
                <tbody>${rows.map((p) => {
                    const has = p.cost != null, gp = has ? p.amount - p.cost : null;
                    const pct = has && p.amount ? Math.round(gp / p.amount * 100) : null;
                    return `<tr>
                        <td>${e(p.name)}</td><td class="r">${p.qty}</td><td class="r">${CFApp.baht(p.amount)}</td>
                        <td class="r">${has ? CFApp.baht(p.cost) : '<span class="text-light">ยังไม่ใส่</span>'}</td>
                        <td class="r"><b>${has ? CFApp.baht(gp) : '—'}</b></td>
                        <td class="r">${pct == null ? '—' : `<span class="sip-chip ${pct < 30 ? 'sip-chip-danger' : pct < 50 ? 'sip-chip-amber' : 'sip-chip-success'}">${pct}%</span>`}</td>
                    </tr>`;
                }).join('')}</tbody>
            </table></div>` : '<div class="ds-empty-sm">ยังไม่มีการขาย</div>';

        refreshIcons();
    },

    boot() {
        CFApp.boot({ page: 'reports' });
        this.setRange('today');
    },
};

window.ReportsPage = ReportsPage;
CFBoot.ready(() => ReportsPage.boot());
