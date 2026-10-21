/**
 * CafeFlow — รายงาน (ผู้จัดการ + แอดมิน)
 * เลือกช่วงวันทำการ → ดึง /api/reports/days ครั้งเดียว แล้ววาดรายงานที่เลือกจากก้อนนั้น
 * (ใบเสร็จรับเงินดึงแยกเป็นหน้า ๆ จาก /api/reports/receipts — เดือนหนึ่งหลายพันใบ)
 * กราฟเป็นแถบ CSS ธรรมดา (ไม่ลงไลบรารีกราฟ — ร้านต้องใช้ได้แม้เน็ตหลุด และหน้าเบา)
 *
 * รายงาน 9 แบบตามที่ผู้ใช้กำหนด 16/10/2569 — ทุกแบบประกอบจาก table() ตัวเดียว
 * ตารางเดียวกันใช้ทั้งวาดหน้าจอและส่งออก CSV จึงไม่มีนิยามคอลัมน์สองที่
 */
// รายชื่อรายงานทั้งหมดอยู่ใน cf-nav.js (CF_REPORTS) — หน้าตั้งค่าเมนูใช้ร่วม · ลำดับ/ซ่อนตาม CFMenuLayout (21/10/2569)
const RP_LIST = CF_REPORTS;

const PAY_LABEL = { CASH: 'เงินสด', QR: 'QR พร้อมเพย์' };

const ReportsPage = {

    state: { range: 'today', from: null, to: null, data: null, loading: false,
             report: 'summary', rcpt: null, rcptOffset: 0 },

    RANGES: [
        ['today', 'วันนี้'], ['yesterday', 'เมื่อวาน'], ['7d', '7 วัน'],
        ['30d', '30 วัน'], ['month', 'เดือนนี้'], ['custom', 'เลือกวัน'],
    ],
    RCPT_PAGE: 100,

    /** วันทำการวันนี้ตามเวลาเริ่มวันของร้าน — ตรงกับเลข A001 และหน้าประวัติบิล */
    today() { return CFDay.businessDate(Date.now(), CFDay.startHourOf(CFStore.settings())); },
    shift(ymd, days) {
        const d = new Date(ymd + 'T12:00:00Z');
        d.setUTCDate(d.getUTCDate() + days);
        return d.toISOString().slice(0, 10);
    },
    dayText(ymd) { return CFApp.date(ymd + 'T12:00:00+07:00'); },
    days() { return Math.round((new Date(this.state.to) - new Date(this.state.from)) / 86400000) + 1; },

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
        this.state.rcpt = null; this.state.rcptOffset = 0;            // ช่วงเปลี่ยน → ใบเสร็จต้องโหลดใหม่
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

    /** เลือกรายงาน — จำไว้ใน #hash เปิดลิงก์/รีเฟรชแล้วกลับมาที่เดิม */
    open(key) {
        if (!this.list().some((r) => r[0] === key)) key = this.list()[0][0];
        this.state.report = key;
        if (location.hash !== '#' + key) history.pushState(null, '', '#' + key);    // ย้อนกลับได้ทีละรายงาน
        this.render();
    },

    renderSeg() {
        document.getElementById('rangeSeg').innerHTML = this.RANGES.map(([k, l]) =>
            `<button type="button" class="ds-seg ${k === this.state.range ? 'active' : ''}"
                     onclick="ReportsPage.setRange('${k}')">${l}</button>`).join('');
    },

    renderNav() {
        document.getElementById('rpNav').innerHTML = this.list().map(([k, icon, label]) =>
            `<button type="button" class="cf-rp-link ${k === this.state.report ? 'active' : ''}"
                     onclick="ReportsPage.open('${k}')"><i data-lucide="${icon}" class="icon-sm"></i>${label}</button>`).join('');
    },

    render() {
        const { from, to } = this.state;
        const days = this.days();
        document.getElementById('rangeLine').textContent = from === to
            ? 'วันทำการ ' + this.dayText(from)
            : this.dayText(from) + ' – ' + this.dayText(to) + ' (' + days + ' วัน)';
        this.renderNav();

        const body = document.getElementById('rpBody');
        const meta = RP_LIST.find((r) => r[0] === this.state.report);
        if (this.state.report === 'slips') { this.renderSlips(body, meta[2]); return; }
        const d = this.state.data;
        if (!d) {
            body.innerHTML = this.head(meta[2], false) +
                `<div class="clinical-card"><div class="ds-empty-sm">${this.state.loading ? 'กำลังโหลด…' : 'ไม่มีข้อมูล'}</div></div>`;
            refreshIcons();
            return;
        }
        this._tables = {};                     // ตารางของรายงานนี้ — ปุ่มส่งออกอ่านจากที่นี่
        body.innerHTML = this.head(meta[2], this.state.report !== 'receipts' || !!this.state.rcpt) +
            this['r_' + this.state.report](d);
        refreshIcons();
        // ตารางรายงานเป็น DataTables (21/10/2569) — ใบเสร็จแบ่งหน้าจากเซิร์ฟเวอร์อยู่แล้ว ไม่แบ่งซ้ำ ·
        // ตัวเลือกสินค้าโชว์ชื่อกลุ่มแค่แถวแรกของกลุ่ม กดเรียงแล้วกลุ่มจะกระจาย จึงปิดการเรียง
        Object.keys(this._tables).forEach((key) => {
            const t = this._tables[key];
            if (!t.rows.length) return;
            CFTable.mount('rpt-' + key, Object.assign(
                key === 'receipts' ? { paging: false, info: false } : key === 'modifiers' ? { ordering: false } : {},
                { language: Object.assign({}, CFTable.TH, { emptyTable: t.opts.empty || 'ไม่มีข้อมูลในช่วงนี้' }) }));
        });
    },

    /* ══════════════════════════════════════════════════════════
       ความแม่นของการตรวจสลิป — ระบบเดา vs แคชเชียร์ตัดสินจริง
       ย้ายมาจากเมนู ⚙ ของหน้าภาพรวม (ผู้ใช้: "เป็นข้อมูลไว้ปรับระบบ ไม่ใช่การตั้งค่า" · 21/10/2569)
       ข้อมูลมาจาก /api/reports/slip-accuracy?days=N (N วันล่าสุดถึงวันนี้) — ไม่ใช่ /api/reports/days
       ช่วงที่เลือก → N = วันแรกของช่วงถึงวันนี้ (สูงสุด 90 วัน ตามที่เซิร์ฟเวอร์รับ)
       ══════════════════════════════════════════════════════════ */
    slipDays() {
        const n = Math.round((new Date(this.today()) - new Date(this.state.from)) / 86400000) + 1;
        return Math.min(Math.max(n, 1), 90);
    },

    async renderSlips(body, title) {
        const days = this.slipDays();
        const key = days;
        if (!this._slip || this._slip.key !== key) {
            body.innerHTML = this.head(title, false) + '<div class="clinical-card"><div class="ds-empty-sm">กำลังโหลด…</div></div>';
            try {
                this._slip = { key, data: await CFApi.get('/api/reports/slip-accuracy?days=' + days) };
            } catch (err) {
                body.innerHTML = this.head(title, false) +
                    `<div class="clinical-card"><div class="ds-empty-sm">${CFApp.esc(err.message || 'ดึงรายงานไม่สำเร็จ')}</div></div>`;
                return;
            }
            if (this.state.report !== 'slips') return;           // เปลี่ยนรายงานไประหว่างรอ
        }
        body.innerHTML = this.head(title, false) + this.slipsHtml(this._slip.data);
        refreshIcons();
    },

    /** ตัวเลขสรุป 4 ช่อง → แถบ % ที่อ่านได้ → ตาราง 2×2 ระบบ vs แคชเชียร์ → แถบตามธนาคาร · ไม่มีสลิป = ข้อความเดียว */
    slipsHtml(r) {
        const e = CFApp.esc;
        const pctN = (n, d) => (d ? Math.round((n / d) * 100) : null);
        const o = r.outcome;
        const right = o.truePass + o.trueCatch;
        const decided = right + o.falseAlarm + o.missed;
        const unsure = o.unsureConfirmed + o.unsureRejected;

        const tile = (label, value, sub, tone) => `<div class="cf-sa-kpi ${tone || ''}">
            <div class="cf-sa-kpi-v">${value}</div><div class="cf-sa-kpi-l">${label}</div>
            ${sub ? `<div class="cf-sa-kpi-s">${sub}</div>` : ''}</div>`;
        const bar = (label, n, d, note) => {
            const p = pctN(n, d);
            return `<div class="cf-sa-bar">
                <div class="cf-sa-bar-head"><span>${label}</span><b>${p == null ? '—' : p + '%'}</b></div>
                <div class="cf-sa-track"><span style="width:${p || 0}%" class="${p == null ? '' : p >= 90 ? 'ok' : p >= 70 ? 'mid' : 'low'}"></span></div>
                <div class="cf-sa-bar-note">${note}</div></div>`;
        };
        const cell = (n, label, tone) => `<div class="cf-sa-cell ${tone}"><b>${n}</b><span>${label}</span></div>`;
        const card = (title, inner, hint) => `<div class="clinical-card cf-sa-card"><div class="card-title">${title}</div>
            ${hint ? `<div class="ds-note">${hint}</div>` : ''}${inner}</div>`;

        if (!r.scanned) {
            return `<div class="clinical-card"><div class="ds-empty-state">
                <div class="ds-empty-state-icon"><i data-lucide="scan-text"></i></div>
                <div class="ds-empty-state-title">ยังไม่มีสลิปที่ลูกค้าสแกนใน ${r.days} วันล่าสุด</div>
                <div class="ds-empty-state-desc">ตัวเลขจะขึ้นเมื่อลูกค้าจ่ายด้วย QR แล้วสแกนสลิปที่คีออสก์${r.days < 90 ? ' · ลองเลือกช่วงที่ยาวขึ้น' : ''}</div>
            </div></div>`;
        }
        return `<div class="ds-note">สแกน ${r.scanned} ใบ · แคชเชียร์ตัดสินแล้ว ${r.judged} ใบ · ${r.days} วันล่าสุด</div>
            <div class="cf-sa-kpis">
                ${tile('อ่านยอดเงินได้', pctN(r.fields.amount, r.read) == null ? '—' : pctN(r.fields.amount, r.read) + '%', `${r.fields.amount} จาก ${r.read} ใบ`)}
                ${tile('ระบบตัดสินตรงกับแคชเชียร์', pctN(right, decided) == null ? '—' : pctN(right, decided) + '%', `${right} จาก ${decided} ใบ`, 'ok')}
                ${tile('เตือนผิด', o.falseAlarm, 'ระบบเตือนแดง แต่เงินเข้าจริง', o.falseAlarm ? 'warn' : '')}
                ${tile('ปล่อยหลุด', o.missed, 'ระบบบอกผ่าน แต่ไม่มีเงินเข้า', o.missed ? 'bad' : '')}
            </div>` +
            card('อ่านข้อมูลจากภาพสลิปได้', `
                ${bar('ยอดเงิน', r.fields.amount, r.read, r.fields.amount + ' ใบ')}
                ${bar('วันที่', r.fields.date, r.read, r.fields.date + ' ใบ · รวมที่ได้จากเลขอ้างอิง')}
                ${bar('ผู้รับเงิน', r.fields.receiver, r.read, r.fields.receiver + ' ใบ · นับเฉพาะเมื่อตั้งบัญชีร้านไว้ที่ "ข้อมูลร้าน"')}`,
                `${r.read} จาก ${r.scanned} ใบที่สแกนอ่านได้`) +
            card('ระบบเทียบกับที่แคชเชียร์ตัดสิน', r.judged ? `
                <div class="cf-sa-matrix">
                    <span></span><span class="cf-sa-mh">แคชเชียร์ยืนยัน</span><span class="cf-sa-mh">แคชเชียร์ปฏิเสธ</span>
                    <span class="cf-sa-mh cf-sa-mr">ระบบบอกผ่าน</span>
                    ${cell(o.truePass, 'ถูก', 'ok')}${cell(o.missed, 'ปล่อยหลุด', o.missed ? 'bad' : 'zero')}
                    <span class="cf-sa-mh cf-sa-mr">ระบบเตือนแดง</span>
                    ${cell(o.falseAlarm, 'เตือนผิด', o.falseAlarm ? 'warn' : 'zero')}${cell(o.trueCatch, 'จับได้ถูก', 'ok')}
                </div>
                ${unsure ? `<div class="ds-note">อ่านไม่ครบ (สีเทา) ${unsure} ใบ — แคชเชียร์ยืนยัน ${o.unsureConfirmed} · ปฏิเสธ ${o.unsureRejected}</div>` : ''}
                ${r.disagree.length ? `<div class="ds-note">ใบที่ระบบกับแคชเชียร์เห็นต่างกัน:
                    ${r.disagree.map((x) => `<span class="sip-chip sip-chip-muted">${e(x.orderNo)}</span>`).join(' ')}</div>` : ''}`
                : '<div class="ds-empty-sm">แคชเชียร์ยังไม่ได้ตัดสินสลิปใบไหนในช่วงนี้</div>',
                'เตือนผิดเยอะ = คนจะเลิกเชื่อคำเตือน · ปล่อยหลุด = เสียเงินจริง') +
            (Object.keys(r.byBank).length ? card('แยกตามธนาคารคนโอน',
                Object.entries(r.byBank).sort((a, b) => b[1].n - a[1].n)
                    .map(([b, x]) => bar(e(b), x.amount, x.n, `${x.n} ใบ · อ่านยอดได้ ${x.amount} ใบ`)).join(''),
                'แถบ = อ่านยอดเงินได้กี่ % ของสลิปธนาคารนั้น') : '');
    },

    /** รายงานที่แสดงในแถบซ้าย — ลำดับและการซ่อนตาม "ตั้งค่าเมนู" (แอดมิน) */
    list() {
        const vis = CFMenuLayout.visible('reports');
        const out = vis.map((k) => RP_LIST.find((r) => r[0] === k)).filter(Boolean);
        return out.length ? out : [RP_LIST[0]];
    },

    head(title, canExport) {

        return `<div class="cf-rp-head"><div class="cf-rp-title">${CFApp.esc(title)}</div>
            ${canExport ? `<button class="btn btn-outline btn-sm" onclick="ReportsPage.exportCsv()">
                <i data-lucide="download" class="icon-sm"></i> ส่งออก CSV</button>` : ''}</div>`;
    },

    /* ══════════════════════════════════════════════════════════
       ตัวช่วยวาด
       ══════════════════════════════════════════════════════════ */

    kpis(list) {
        return `<div class="ds-kpi-grid">${list.map(([icon, value, label, sub]) => `
            <div class="sip-kpi">
                <i data-lucide="${icon}" class="sip-kpi-icon icon-lg"></i>
                <div class="sip-kpi-value">${value}</div>
                <div class="sip-kpi-label">${label}${sub ? `<div class="td-sub">${sub}</div>` : ''}</div>
            </div>`).join('')}</div>`;
    },

    card(title, inner, note) {
        return `<div class="clinical-card">${title ? `<div class="card-title">${title}</div>` : ''}${inner}
            ${note ? `<div class="ds-note" style="margin-top:10px">${note}</div>` : ''}</div>`;
    },

    /**
     * ตาราง — cols: [{ label, v:(row)=>ค่าดิบ, f?:(ค่า,row)=>HTML, r?:ชิดขวา, sum?:true }]
     * ค่าดิบ (v) ใช้ทั้งรวมท้ายตารางและ CSV · f ใช้วาดหน้าจออย่างเดียว
     * key = ชื่อตารางในรายงานนี้ (ใช้ตั้งชื่อไฟล์ CSV) · ตารางแรกของรายงานคือตัวที่ส่งออก
     */
    table(key, cols, rows, opts = {}) {
        this._tables[key] = { cols, rows, opts };
        if (!rows.length) return `<div class="ds-empty-sm">${opts.empty || 'ไม่มีข้อมูลในช่วงนี้'}</div>`;
        const e = CFApp.esc;
        const cell = (c, row) => {
            const v = c.v(row);
            return c.f ? c.f(v, row) : (v == null ? '—' : typeof v === 'number' ? CFApp.int(v) : e(v));
        };
        const sums = cols.some((c) => c.sum) && rows.length > 1;
        // data-order = ค่าดิบ — DataTables เรียงตัวเลขถูก แม้หน้าจอแสดงเป็น ฿1,234.00 / 12%
        const ord = (c, row) => { const v = c.v(row); return v == null ? '' : ` data-order="${e(v)}"`; };
        return `<div class="table-responsive"><table class="data-table compact cf-rp-table" id="rpt-${key}">
            <thead><tr>${cols.map((c) => `<th class="${c.r ? 'r' : ''}">${c.label}</th>`).join('')}</tr></thead>
            <tbody>${rows.map((row) => `<tr${opts.click ? ` class="click" onclick="${opts.click(row)}"` : ''}>
                ${cols.map((c) => `<td class="${c.r ? 'r' : ''}"${ord(c, row)}>${cell(c, row)}</td>`).join('')}</tr>`).join('')}</tbody>
            ${sums ? `<tfoot><tr>${cols.map((c, i) => {
                if (!c.sum) return `<td>${i === 0 ? 'รวม' : ''}</td>`;
                const vals = rows.map((r) => c.v(r));
                const total = vals.some((v) => v == null) ? null : vals.reduce((a, v) => a + v, 0);
                return `<td class="${c.r ? 'r' : ''}">${c.f ? c.f(total, null) : CFApp.int(total)}</td>`;
            }).join('')}</tr></tfoot>` : ''}
        </table></div>`;
    },

    baht(v) { return v == null ? '<span class="text-light">—</span>' : CFApp.baht(v); },
    pct(part, whole) { return whole ? Math.round(part / whole * 100) : 0; },
    profitChip(p) {
        if (p == null) return '—';
        return `<span class="sip-chip ${p < 30 ? 'sip-chip-danger' : p < 50 ? 'sip-chip-amber' : 'sip-chip-success'}">${p}%</span>`;
    },

    /** แถบแนวนอน (อันดับ / สัดส่วน) */
    bars(list, label, value, text) {
        const max = Math.max(1, ...list.map(value));
        return `<div class="cf-rp-bars">${list.map((x, i) => `
            <div class="cf-load-row">
                <div class="cf-load-name" title="${CFApp.esc(label(x))}">${i + 1}. ${CFApp.esc(label(x))}</div>
                <div class="cf-load-track"><div class="cf-load-fill" style="width:${Math.max(3, value(x) / max * 100)}%"></div></div>
                <div class="cf-load-val">${text(x)}</div>
            </div>`).join('')}</div>`;
    },

    /** กราฟแท่งแนวตั้ง — รายชั่วโมงตัดหัว/ท้ายที่ไม่มีขาย (ร้านไม่ได้เปิด 24 ชม.) */
    hourChart(d) {
        const hrs = d.byHour;
        let a = hrs.findIndex((h) => h.orders), b = 23 - [...hrs].reverse().findIndex((h) => h.orders);
        if (a < 0) return '<div class="ds-empty-sm">ไม่มียอดขายในช่วงนี้</div>';
        const shown = hrs.slice(a, b + 1);
        const maxH = Math.max(1, ...shown.map((h) => h.sales));
        const peak = shown.reduce((m, h) => (h.sales > m.sales ? h : m), shown[0]);
        const hh = (h) => String(h).padStart(2, '0');
        return `<div class="cf-vbars">${shown.map((h) => `
                <div class="cf-vbar ${h === peak && h.sales ? 'peak' : ''}" title="${hh(h.hour)}:00 · ${h.orders} บิล · ${CFApp.baht(h.sales)}">
                    <span class="cf-vbar-val">${h.sales ? CFApp.int(Math.round(h.sales)) : ''}</span>
                    <span class="cf-vbar-fill" style="height:${h.sales ? Math.max(3, h.sales / maxH * 100) : 0}%"></span>
                    <span class="cf-vbar-lbl">${hh(h.hour)}</span>
                </div>`).join('')}</div>
            <div class="ds-note" style="margin-top:8px">ขายดีสุดช่วง <b>${hh(peak.hour)}:00–${hh(peak.hour + 1)}:00</b>
                · ${peak.orders} บิล · ${CFApp.baht(peak.sales)}${this.days() > 1 ? ' (รวมทุกวันในช่วง)' : ''}</div>`;
    },

    dayChart(d) {
        const days = this.days();
        const map = new Map(d.byDay.map((x) => [x.day, x]));
        const all = Array.from({ length: days }, (_, i) => map.get(this.shift(this.state.from, i)) ||
            { day: this.shift(this.state.from, i), orders: 0, sales: 0 });
        const maxD = Math.max(1, ...all.map((x) => x.sales));
        return `<div class="cf-vbars ${days > 14 ? 'dense' : ''}">${all.map((x) => `
            <div class="cf-vbar" title="${CFApp.esc(this.dayText(x.day))} · ${x.orders} บิล · ${CFApp.baht(x.sales)}">
                <span class="cf-vbar-val">${days <= 14 && x.sales ? CFApp.int(Math.round(x.sales)) : ''}</span>
                <span class="cf-vbar-fill" style="height:${x.sales ? Math.max(3, x.sales / maxD * 100) : 0}%"></span>
                <span class="cf-vbar-lbl">${Number(x.day.slice(8))}</span>
            </div>`).join('')}</div>`;
    },

    /* ══════════════════════════════════════════════════════════
       รายงานแต่ละแบบ (r_<key>)
       ══════════════════════════════════════════════════════════ */

    /** 1. สรุปยอดขาย — รวม → คืนเงิน → ส่วนลด → สุทธิ → ต้นทุน → กำไรขั้นต้น */
    r_summary(d) {
        const t = d.daily.reduce((a, x) => ({
            gross: a.gross + x.gross, refunds: a.refunds + x.refunds, discounts: a.discounts + x.discounts,
            net: a.net + x.net, cost: a.cost == null || x.cost == null ? null : a.cost + x.cost,
        }), { gross: 0, refunds: 0, discounts: 0, net: 0, cost: 0 });
        const profit = t.cost == null || !d.daily.length ? null : t.net - t.cost;
        const b = (v) => this.baht(v);
        return this.kpis([
            ['wallet', CFApp.baht(t.gross), 'ยอดขายรวม', CFApp.int(d.summary.orderCount) + ' บิล · เฉลี่ย ' + CFApp.baht(d.summary.avgOrder)],
            ['undo-2', CFApp.baht(t.refunds), 'คืนเงิน', d.summary.refundedCount ? d.summary.refundedCount + ' บิล' : ''],
            ['percent', CFApp.baht(t.discounts), 'ส่วนลด', ''],
            ['banknote', CFApp.baht(t.net), 'ยอดขายสุทธิ', 'เงินสด ' + CFApp.baht(d.summary.cash) + ' · QR ' + CFApp.baht(d.summary.qr)],
            ['coins', profit == null ? '—' : CFApp.baht(profit), 'กำไรขั้นต้น',
                profit == null ? 'บางเมนูยังไม่ได้ใส่ต้นทุน' : this.pct(profit, t.net) + '% ของยอดสุทธิ'],
        ]) +
        (this.days() > 1 ? this.card('ยอดขายรายวัน', this.dayChart(d)) : '') +
        this.card('ยอดขายรายชั่วโมง', this.hourChart(d)) +
        this.card('รายวัน', this.table('summary', [
            { label: 'วันทำการ', v: (r) => r.day, f: (v) => (v ? CFApp.esc(this.dayText(v)) : '') },
            { label: 'บิล', v: (r) => r.orders, r: true, sum: true },
            { label: 'ยอดขายรวม', v: (r) => r.gross, f: b, r: true, sum: true },
            { label: 'คืนเงิน', v: (r) => r.refunds, f: b, r: true, sum: true },
            { label: 'ส่วนลด', v: (r) => r.discounts, f: b, r: true, sum: true },
            { label: 'ยอดขายสุทธิ', v: (r) => r.net, f: (v) => `<b>${b(v)}</b>`, r: true, sum: true },
            { label: 'ต้นทุน', v: (r) => r.cost, f: b, r: true, sum: true },
            { label: 'กำไรขั้นต้น', v: (r) => r.profit, f: b, r: true, sum: true },
        ], d.daily.slice().reverse()),
        'คืนเงินนับเข้าวันทำการของบิลนั้น (ไม่ใช่วันที่คืน) · ต้นทุนใช้ค่า ณ วันที่ขาย ยังไม่รวมต้นทุนท็อปปิ้ง · ' +
        'วันที่มีบางเมนูยังไม่ใส่ต้นทุน แสดง — แทนการเดากำไร');
    },

    /** 2. ยอดขายตามสินค้า */
    r_items(d) {
        const b = (v) => this.baht(v);
        const total = d.products.reduce((a, p) => a + p.amount, 0);
        return this.card('ขายดี 10 อันดับ (ตามจำนวน)', d.products.length
            ? this.bars(d.products.slice(0, 10), (p) => p.name, (p) => p.qty, (p) => `${p.qty} แก้ว · ${CFApp.baht(p.amount)}`)
            : '<div class="ds-empty-sm">ยังไม่มีการขาย</div>') +
        this.card('', this.table('items', [
            { label: 'สินค้า', v: (r) => r.name },
            { label: 'หมวดหมู่', v: (r) => r.category, f: (v) => (v ? `<span class="td-sub">${CFApp.esc(v)}</span>` : '') },
            { label: 'จำนวน', v: (r) => r.qty, r: true, sum: true },
            { label: 'ยอดขาย', v: (r) => r.amount, f: b, r: true, sum: true },
            { label: '% ของยอด', v: (r) => this.pct(r.amount, total), f: (v, r) => (r ? v + '%' : ''), r: true },
            { label: 'ต้นทุน', v: (r) => r.cost, f: b, r: true, sum: true },
            { label: 'กำไร', v: (r) => (r.cost == null ? null : r.amount - r.cost), f: (v) => `<b>${b(v)}</b>`, r: true, sum: true },
            { label: '% กำไร', v: (r) => (r.cost == null || !r.amount ? null : this.pct(r.amount - r.cost, r.amount)),
              f: (v, r) => (r ? this.profitChip(v) : ''), r: true },
        ], d.products),
        'ยอดขายรวมราคาตัวเลือกเพิ่มเติมแล้ว · ต้นทุนยังไม่รวมท็อปปิ้ง เมนูที่ขายท็อปปิ้งเสริมเยอะจะแสดงกำไรสูงกว่าจริงเล็กน้อย · ' +
        'ตั้งต้นทุนได้ที่หน้าเมนูและสินค้า');
    },

    /** 3. ยอดขายตามหมวดหมู่ (หมวดปัจจุบันของสินค้า) */
    r_categories(d) {
        const b = (v) => this.baht(v);
        const total = d.categories.reduce((a, c) => a + c.amount, 0);
        return this.card('สัดส่วนยอดขาย', d.categories.length
            ? this.bars(d.categories, (c) => c.name, (c) => c.amount, (c) => `${CFApp.baht(c.amount)} · ${this.pct(c.amount, total)}%`)
            : '<div class="ds-empty-sm">ยังไม่มีการขาย</div>') +
        this.card('', this.table('categories', [
            { label: 'หมวดหมู่', v: (r) => r.name },
            { label: 'เมนูที่ขาย', v: (r) => r.items, r: true, sum: true },
            { label: 'จำนวน', v: (r) => r.qty, r: true, sum: true },
            { label: 'ยอดขาย', v: (r) => r.amount, f: b, r: true, sum: true },
            { label: '% ของยอด', v: (r) => this.pct(r.amount, total), f: (v, r) => (r ? v + '%' : ''), r: true },
            { label: 'ต้นทุน', v: (r) => r.cost, f: b, r: true, sum: true },
            { label: 'กำไร', v: (r) => (r.cost == null ? null : r.amount - r.cost), f: (v) => `<b>${b(v)}</b>`, r: true, sum: true },
        ], d.categories), 'จัดหมวดตามหมวดปัจจุบันของสินค้า — ย้ายหมวดทีหลัง ยอดย้อนหลังย้ายตาม');
    },

    /** 4. ยอดขายตามพนักงาน — ผูกกับคนที่กดรับเงิน */
    r_staff(d) {
        const b = (v) => this.baht(v);
        return this.card('', this.table('staff', [
            { label: 'พนักงาน', v: (r) => r.name, f: (v, r) => (r ? `<div class="td-name">${CFApp.esc(v)}</div>
                <div class="td-sub">${r.role ? CFApp.esc(CF_ROLE_LABEL[r.role] || r.role) : 'ไม่มีพนักงานกด — ระบบปิดบิลเอง'}${r.active ? '' : ' · ปิดใช้งาน'}</div>` : '') },
            { label: 'บิลที่รับเงิน', v: (r) => r.orders, r: true, sum: true },
            { label: 'ยอดขาย', v: (r) => r.sales, f: (v) => `<b>${b(v)}</b>`, r: true, sum: true },
            { label: 'เฉลี่ย/บิล', v: (r) => (r.orders ? r.sales / r.orders : 0), f: (v, r) => (r ? b(v) : ''), r: true },
            { label: 'เงินสด', v: (r) => r.cash, f: b, r: true, sum: true },
            { label: 'QR', v: (r) => r.qr, f: b, r: true, sum: true },
            { label: 'ยืนยันแทน', v: (r) => r.overrides, r: true, sum: true },
            { label: 'ยกเลิก/คืน', v: (r) => r.cancelled + r.voided + r.refunded, r: true, sum: true },
        ], d.staff), 'บิลผูกกับพนักงานที่กดรับเงิน · "ยืนยันแทน" = ยืนยันการชำระแทนระบบ (ไม่มีสลิปที่ตรวจผ่าน)');
    },

    /** 5. ยอดขายตามประเภทการชำระเงิน */
    r_payments(d) {
        const b = (v) => this.baht(v);
        const total = d.payments.reduce((a, p) => a + p.net, 0);
        return this.card('สัดส่วน', d.payments.length
            ? this.bars(d.payments, (p) => PAY_LABEL[p.method] || p.method, (p) => p.net,
                (p) => `${CFApp.baht(p.net)} · ${this.pct(p.net, total)}%`)
            : '<div class="ds-empty-sm">ยังไม่มีการขาย</div>') +
        this.card('', this.table('payments', [
            { label: 'ประเภทการชำระ', v: (r) => PAY_LABEL[r.method] || r.method },
            { label: 'บิล', v: (r) => r.orders + r.refundOrders, r: true, sum: true },
            { label: 'ยอดชำระ', v: (r) => r.gross, f: b, r: true, sum: true },
            { label: 'บิลคืนเงิน', v: (r) => r.refundOrders, r: true, sum: true },
            { label: 'คืนเงิน', v: (r) => r.refunds, f: b, r: true, sum: true },
            { label: 'ยอดสุทธิ', v: (r) => r.net, f: (v) => `<b>${b(v)}</b>`, r: true, sum: true },
        ], d.payments));
    },

    /** 6. ใบเสร็จรับเงิน — แบ่งหน้า · คลิกแถวเปิดบิลในหน้าจัดการออเดอร์ */
    r_receipts() {
        const st = this.state;
        if (!st.rcpt) { this.loadReceipts(); return this.card('', '<div class="ds-empty-sm">กำลังโหลด…</div>'); }
        const r = st.rcpt;
        const e = CFApp.esc;
        const from = r.total ? r.offset + 1 : 0, to = r.offset + r.receipts.length;
        return this.card('', this.table('receipts', [
            { label: 'เลขที่', v: (x) => x.id, f: (v, x) => `<div class="td-name">${e(x.orderNo)}</div><div class="td-sub">${e(v)}</div>` },
            { label: 'วันเวลา', v: (x) => CFApp.date(x.paidAt) + ' ' + CFApp.time(x.paidAt) },
            { label: 'พนักงาน', v: (x) => x.cashier },
            { label: 'ชำระ', v: (x) => PAY_LABEL[x.paymentMethod] || x.paymentMethod },
            { label: 'ชิ้น', v: (x) => x.itemQty, r: true },
            { label: 'ยอด', v: (x) => x.total, f: (v) => `<b>${CFApp.baht(v)}</b>`, r: true },
            { label: 'สถานะ', v: (x) => (x.status === 'REFUNDED' ? 'คืนเงิน' : 'ขายแล้ว'),
              f: (v) => (v === 'คืนเงิน' ? '<span class="sip-chip sip-chip-danger">คืนเงิน</span>' : '<span class="text-light">ขายแล้ว</span>') },
        ], r.receipts, { click: (x) => `location.href='orders.html?order=${encodeURIComponent(x.id)}'`,
                         empty: 'ไม่มีใบเสร็จในช่วงนี้' }) +
        (r.total > this.RCPT_PAGE ? `<div class="cf-rp-pager">
            <span>${CFApp.int(from)}–${CFApp.int(to)} จาก ${CFApp.int(r.total)} ใบ</span>
            <button class="btn btn-outline btn-sm" ${r.offset ? '' : 'disabled'} onclick="ReportsPage.rcptPage(-1)">
                <i data-lucide="chevron-left" class="icon-sm"></i></button>
            <button class="btn btn-outline btn-sm" ${to < r.total ? '' : 'disabled'} onclick="ReportsPage.rcptPage(1)">
                <i data-lucide="chevron-right" class="icon-sm"></i></button>
        </div>` : ''), 'บิลที่รับเงินแล้ว (รวมบิลที่คืนเงินภายหลัง) ใหม่สุดก่อน · คลิกแถวเพื่อดูรายละเอียดบิล · ส่งออก CSV ได้ทั้งช่วง ไม่ใช่แค่หน้านี้');
    },

    async loadReceipts() {
        const { from, to, rcptOffset } = this.state;
        const want = from + to + rcptOffset;
        if (this._rcptWant === want) return;          // render ซ้ำระหว่างรอ — ไม่ยิงซ้ำ
        this._rcptWant = want;
        try {
            const r = await CFApi.get(`/api/reports/receipts?from=${from}&to=${to}&limit=${this.RCPT_PAGE}&offset=${rcptOffset}`);
            if (this.state.from !== from || this.state.to !== to) return;
            this.state.rcpt = r;
        } catch (err) {
            showToast(err.message || 'โหลดใบเสร็จไม่สำเร็จ', 'error', 5000);
            this.state.rcpt = { total: 0, offset: 0, receipts: [] };
        }
        this._rcptWant = null;
        if (this.state.report === 'receipts') this.render();
    },

    rcptPage(dir) {
        this.state.rcptOffset = Math.max(0, this.state.rcptOffset + dir * this.RCPT_PAGE);
        this.state.rcpt = null;
        this.render();
    },

    /** 7. ยอดขายตามตัวเลือกเพิ่มเติม — นับเป็นจำนวนแก้วที่เลือกตัวเลือกนั้น */
    r_modifiers(d) {
        const groups = [...new Set(d.modifiers.map((m) => m.group))];
        return this.card('', this.table('modifiers', [
            { label: 'กลุ่มตัวเลือก', v: (r) => r.group, f: (v, r) => (r && d.modifiers.find((m) => m.group === v) === r
                ? `<b>${CFApp.esc(v)}</b>` : '') },
            { label: 'ตัวเลือก', v: (r) => r.label },
            { label: 'จำนวน', v: (r) => r.qty, r: true },
            { label: '% ในกลุ่ม', v: (r) => this.pct(r.qty, d.modifiers.filter((m) => m.group === r.group).reduce((a, m) => a + m.qty, 0)),
              f: (v) => v + '%', r: true },
            { label: 'ยอดขาย (ราคาเพิ่ม)', v: (r) => r.amount, f: (v) => this.baht(v), r: true },
        ], d.modifiers, { empty: 'ไม่มีการเลือกตัวเลือกเพิ่มเติมในช่วงนี้' }),
        `${groups.length} กลุ่ม · จำนวน = แก้วที่เลือกตัวเลือกนั้น · ยอดขาย = ราคาที่บวกเพิ่มจากตัวเลือก (ตัวเลือกที่ไม่บวกราคาเป็น ฿0)`);
    },

    /** 8. ส่วนลด */
    r_discounts(d) {
        const total = d.daily.reduce((a, x) => a + x.discounts, 0);
        const count = d.daily.reduce((a, x) => a + x.discountOrders, 0);
        const rows = d.daily.filter((x) => x.discounts > 0).reverse();
        return this.kpis([
            ['percent', CFApp.baht(total), 'ยอดส่วนลด', ''],
            ['receipt', CFApp.int(count), 'บิลที่มีส่วนลด', ''],
        ]) +
        this.card('', this.table('discounts', [
            { label: 'วันทำการ', v: (r) => r.day, f: (v) => (v ? CFApp.esc(this.dayText(v)) : '') },
            { label: 'บิลที่มีส่วนลด', v: (r) => r.discountOrders, r: true, sum: true },
            { label: 'ยอดส่วนลด', v: (r) => r.discounts, f: (v) => this.baht(v), r: true, sum: true },
            { label: 'ยอดขายรวม', v: (r) => r.gross, f: (v) => this.baht(v), r: true, sum: true },
        ], rows, { empty: 'ไม่มีส่วนลดในช่วงนี้' }),
        'ระบบยังไม่มีปุ่มให้ส่วนลดที่หน้าขาย — เมื่อเพิ่มฟีเจอร์ส่วนลด ยอดจะขึ้นที่รายงานนี้เอง');
    },

    /** 9. ภาษี — ราคาขายรวม VAT แล้ว (สูตรเดียวกับใบเสร็จ) */
    r_tax(d) {
        const tx = d.tax;
        const b = (v) => this.baht(v);
        const sum = (k) => tx.days.reduce((a, x) => a + x[k], 0);
        const warn = tx.registered ? '' : `<div class="ds-warn" style="margin-bottom:14px">
            <b>ร้านยังไม่ได้จดภาษีมูลค่าเพิ่ม (VAT)</b> — ใบเสร็จไม่แสดงภาษี และไม่มีภาษีขายต้องนำส่ง ·
            ตัวเลขด้านล่างเป็น<b>ประมาณการ</b>ถ้าคิด VAT ${tx.rate}% จากยอดสุทธิ</div>`;
        return warn + this.kpis([
            ['banknote', CFApp.baht(sum('net')), 'ยอดขายสุทธิ (รวม VAT)', ''],
            ['file-text', CFApp.baht(sum('beforeVat')), 'มูลค่าก่อนภาษี', ''],
            ['landmark', CFApp.baht(sum('vat')), `ภาษีขาย ${tx.rate}%${tx.registered ? '' : ' (ประมาณการ)'}`, ''],
        ]) +
        this.card('', this.table('tax', [
            { label: 'วันทำการ', v: (r) => r.day, f: (v) => (v ? CFApp.esc(this.dayText(v)) : '') },
            { label: 'ยอดขายสุทธิ', v: (r) => r.net, f: b, r: true, sum: true },
            { label: 'มูลค่าก่อนภาษี', v: (r) => r.beforeVat, f: b, r: true, sum: true },
            { label: `ภาษีขาย ${tx.rate}%`, v: (r) => r.vat, f: (v) => `<b>${b(v)}</b>`, r: true, sum: true },
        ], tx.days.slice().reverse()), 'ราคาขายในร้านรวม VAT แล้ว: ภาษี = ยอด − ยอด ÷ (1 + อัตรา) · สูตรเดียวกับที่พิมพ์บนใบเสร็จ');
    },

    /* ══════════════════════════════════════════════════════════
       ส่งออก CSV — ตารางแรกของรายงานที่เปิดอยู่ · ค่าดิบ (ตัวเลขไม่ใส่ ฿/คอมมา) Excel คำนวณต่อได้
       ══════════════════════════════════════════════════════════ */
    async exportCsv() {
        const key = this.state.report;
        let t = this._tables && this._tables[key];
        if (key === 'receipts') {
            // ใบเสร็จ: ทั้งช่วง ไม่ใช่แค่หน้าที่เห็น
            try {
                const all = await CFApi.get(`/api/reports/receipts?from=${this.state.from}&to=${this.state.to}&all=1`);
                t = { ...t, rows: all.receipts };
            } catch (err) { showToast(err.message || 'ส่งออกไม่สำเร็จ', 'error', 5000); return; }
        }
        if (!t || !t.rows.length) { showToast('ไม่มีข้อมูลให้ส่งออก', 'warning'); return; }
        const raw = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
        const csv = CFExport.toCsv(t.cols.map((c) => c.label), t.rows.map((r) => t.cols.map((c) => raw(c.v(r)))));
        const range = this.state.from === this.state.to ? this.state.from : this.state.from + '_' + this.state.to;
        CFExport.download(`cafeflow-${key}-${range}.csv`, csv);
    },

    boot() {
        CFApp.boot({ page: 'reports' });
        this.state.report = (location.hash || '').slice(1) || 'summary';
        if (!this.list().some((r) => r[0] === this.state.report)) this.state.report = this.list()[0][0];
        // แอดมินเปลี่ยน "ตั้งค่าเมนู" จากอีกเครื่อง → แถบรายงานซ้ายเปลี่ยนตาม · รายงานที่เปิดอยู่ถูกซ่อน → ไปรายงานแรกที่ยังแสดง
        CFStore.subscribe(() => {
            if (!this.list().some((r) => r[0] === this.state.report)) this.open(this.list()[0][0]);
            else this.renderNav();
        });
        // ปุ่มย้อนกลับ / แก้ #hash เอง — เปลี่ยนรายงานโดยไม่โหลดหน้าใหม่
        window.addEventListener('hashchange', () => {
            const k = location.hash.slice(1);
            if (k && k !== this.state.report) this.open(k);
        });
        this.setRange('today');
    },
};

window.ReportsPage = ReportsPage;
CFBoot.ready(() => ReportsPage.boot());
