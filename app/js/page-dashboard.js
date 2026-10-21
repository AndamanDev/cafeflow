/** CafeFlow — ภาพรวมผู้จัดการ (§25, §26, §30) */
const DashPage = {

    state: {},

    /* ══════════════════════════════════════════════════════
       RENDER — idempotent, ไม่อ่านค่าจาก DOM
       จัดใหม่ 16/10/2569: วันนี้ขายเท่าไร → มีอะไรต้องจัดการ → ร้านเป็นยังไงตอนนี้
       ตัวเลขทุกกล่อง = วันทำการนี้ (เดิมปนกันระหว่างวันนี้/รอบ/ค้างทั้งหมด จนยอด ฿0 แต่รอชำระขึ้นแดง 13)
       ══════════════════════════════════════════════════════ */
    render() {
        // ลิ้นชักอุปกรณ์เปิดอยู่ → วาดตารางใหม่ (จับคู่ / heartbeat แล้วสถานะต้องเปลี่ยนเอง ไม่ต้องปิดเปิดใหม่)
        // วาดทั้งตารางแล้ว mount ใหม่ — เขียน tbody ตรง ๆ ใต้ DataTables จะค้างข้อมูลเก่า (CFTable จำหน้า/คำค้นไว้)
        const devHost = document.getElementById('devHost');
        if (devHost) { devHost.innerHTML = this.devTableHtml(); refreshIcons(); CFTable.mount('devTable'); }

        const day = CFDay.businessDate(Date.now(), CFDay.startHourOf(CFStore.settings()));
        if (this._ydayFor !== day) this.loadYesterday(day);           // ข้ามวันขณะเปิดหน้าค้าง → เทียบวันใหม่
        const todays = CFStore.all('orders').filter((o) => o.businessDate === day);

        this.renderHeader(day);
        this.renderKpis();
        this.renderAttention(day);
        this.renderHours(todays);
        this.renderTop(todays);
        this.renderLive(todays);
        this.renderRecent(todays);

        CFApp.applyRoleGate();
        refreshIcons();
    },

    renderHeader(day) {
        const shift = CFStore.openShift();
        document.getElementById('dayLine').textContent = 'วันทำการ ' + CFApp.date(day + 'T12:00:00+07:00');
        document.getElementById('shiftLine').innerHTML = shift
            ? `<span class="status-badge active">เปิดขายอยู่</span>
               <span class="td-sub">รอบตั้งแต่ ${CFApp.esc(CFApp.date(shift.openedAt) + ' ' + CFApp.time(shift.openedAt))}</span>`
            : '<span class="status-badge danger">ยังไม่เปิดรอบ</span>';
    },

    /** ยอดเมื่อวานไว้เทียบ — รายงานดูได้เฉพาะผู้จัดการ/แอดมิน (คนอื่นไม่โชว์บรรทัดเทียบ) */
    async loadYesterday(day) {
        this._ydayFor = day;
        this._yday = null;
        if (!['ADMIN', 'MANAGER'].includes(CFAuth.getRole())) return;
        const d = new Date(day + 'T12:00:00Z');
        d.setUTCDate(d.getUTCDate() - 1);
        const y = d.toISOString().slice(0, 10);
        try {
            const r = await CFApi.get(`/api/reports/days?from=${y}&to=${y}`);
            if (this._ydayFor === day) { this._yday = r.summary; this.renderKpis(); refreshIcons(); }
        } catch { /* ไม่มีบรรทัดเทียบก็ได้ — ไม่ใช่เรื่องที่ต้องเตือน */ }
    },

    renderKpis() {
        const t = CFKpi.today();
        const y = this._yday;
        const vs = (now, before) => {
            if (!y) return '';
            if (!before) return now ? 'เมื่อวานไม่มีขาย' : 'เมื่อวานก็ไม่มีขาย';
            const pct = Math.round((now - before) / before * 100);
            const cls = pct > 0 ? 'cf-up' : pct < 0 ? 'cf-down' : '';
            return `<span class="${cls}">${pct > 0 ? '▲' : pct < 0 ? '▼' : ''} ${Math.abs(pct)}%</span> จากเมื่อวาน`;
        };
        // กดการ์ดแล้วไปรายงานที่ตรงกันของวันนี้ (แบบ Square: แตะตัวเลข → ดูรายละเอียด) — รายงานดูได้เฉพาะผู้จัดการ/แอดมิน
        const canReport = ['ADMIN', 'MANAGER'].includes(CFAuth.getRole());
        const kpi = (icon, value, label, sub, report) => {
            const link = canReport && report;
            return `<div class="sip-kpi ${link ? 'cf-kpi-link' : ''}" ${link ? `role="link" tabindex="0" title="ดูรายงาน"
                    onclick="location.href='reports.html#${report}'" onkeydown="if(event.key==='Enter')this.click()"` : ''}>
                <i data-lucide="${icon}" class="sip-kpi-icon icon-lg"></i>
                <div class="sip-kpi-value">${value}</div>
                <div class="sip-kpi-label">${label}${sub ? `<div class="td-sub">${sub}</div>` : ''}</div>
                ${link ? '<i data-lucide="chevron-right" class="cf-kpi-go"></i>' : ''}
            </div>`;
        };
        const bad = t.cancelledCount + t.refundedCount;
        document.getElementById('kpis').innerHTML =
            kpi('wallet', CFApp.baht(t.sales), 'ยอดขายสุทธิ วันนี้', vs(t.sales, y && y.sales), 'summary') +
            kpi('receipt', CFApp.int(t.orderCount), 'บิล วันนี้', bad ? 'ยกเลิก/คืนเงิน ' + bad : vs(t.orderCount, y && y.orderCount), 'receipts') +
            kpi('calculator', CFApp.baht(t.avgOrder), 'เฉลี่ยต่อบิล', '', 'summary') +
            kpi('banknote', CFApp.baht(t.cash), 'เงินสด วันนี้', '', 'payments') +
            kpi('qr-code', CFApp.baht(t.qr), 'QR พร้อมเพย์ วันนี้', '', 'payments');
    },

    /**
     * ต้องจัดการ — ทุกเรื่องที่รอคนทำ รวมไว้ที่เดียว แต่ละบรรทัดมีปุ่มพาไปจัดการ
     * (เดิมกระจายเป็นแถบเตือน · toast · กล่องแดง คนละที่)
     */
    renderAttention(day) {
        const e = CFApp.esc;
        const items = [];
        const add = (tone, icon, text, sub, btn) => items.push({ tone, icon, text, sub, btn });
        const go = (label, href) => `<a class="btn btn-outline btn-sm" href="${href}">${label} <i data-lucide="arrow-right" class="icon-sm"></i></a>`;
        const canShift = CFAuth.can('SHIFT_CLOSE');

        const shift = CFStore.openShift();
        if (!shift) {
            add('danger', 'lock', 'ยังไม่เปิดรอบการขาย', 'คีออสก์ยังไม่รับออเดอร์ · นับเงินทอนในลิ้นชักแล้วเปิดรอบ',
                canShift ? go('ไปเปิดรอบ', 'closing.html') : '');
        }
        const st = CFApp.staleShiftInfo();
        if (st) {
            add('warn', 'clock-alert', `รอบเปิดค้าง ${st.days} วัน (ตั้งแต่ ${CFApp.date(st.shift.openedAt)})`,
                'นับเงินในลิ้นชักแล้วปิดรอบ ยอดเงินสดของรอบจะได้ไม่ปนข้ามวัน', canShift ? go('ไปปิดรอบ', 'closing.html') : '');
        }

        // ออเดอร์ที่ยังไม่จบจากวันก่อน — ปิดรอบไม่ได้จนกว่าจะเคลียร์
        const stale = CFStore.all('orders').filter((o) => o.businessDate < day && !CFFlow.isTerminal(o.status));
        if (stale.length) {
            const by = {};
            stale.forEach((o) => { by[o.status] = (by[o.status] || 0) + 1; });
            add('warn', 'history', `ออเดอร์ค้างจากวันก่อน ${stale.length} ใบ`,
                // ชื่อสถานะบางตัวมี " · " อยู่แล้ว (เช็กสลิป · รอตรวจ) — คั่นรายการด้วยจุลภาคจะได้ไม่ปนกัน
                Object.entries(by).map(([s, n]) => `${CFApp.statusLabel(s)} (${n})`).join(', ') + ' — ต้องจบหรือยกเลิกก่อนปิดรอบ',
                go('จัดการ', 'orders.html'));
        }

        const review = CFStore.all('orders').filter((o) => o.businessDate === day && o.status === 'PAYMENT_REVIEW').length;
        if (review && CFAuth.can('PAY_RECEIVE')) {
            add('warn', 'scan-text', `การชำระรอตรวจ ${review} ใบ`, 'สลิปที่ระบบตรวจไม่ผ่านหรืออ่านไม่ออก — ให้แคชเชียร์ตัดสิน',
                go('ไปตรวจ', 'cashier.html'));
        }

        // เครื่องหลุดการจับคู่ (ค้างหน้าขอรหัส)
        if (CFAuth.can('MENU_EDIT')) {
            CFStore.all('deviceWaits').forEach((w) => {
                const d = w.deviceId && CFStore.byId('devices', w.deviceId);
                add('danger', 'unplug', `${d ? d.name : 'เครื่องที่ IP ' + w.ip} หลุดการจับคู่`,
                    `ค้างหน้าขอรหัสตั้งแต่ ${CFApp.time(w.since)} · ${w.reason === 'REVOKED' ? 'สิทธิ์ถูกแทนที่หรือถูกยกเลิก' : 'ข้อมูลในเบราว์เซอร์หาย หรือเปิดคนละที่อยู่'}`,
                    d ? `<button class="btn btn-outline btn-sm" onclick="DashPage.pairDevice('${d.id}')">ขอรหัสใหม่</button>`
                      : '<button class="btn btn-outline btn-sm" onclick="DashPage.openDevices()">เลือกอุปกรณ์</button>');
            });
        }

        const b = this._backup;
        if (b) {
            const age = b.lastAt ? (Date.now() - new Date(b.lastAt).getTime()) / 3600000 : Infinity;
            if (age >= 48) {
                add('warn', 'hard-drive', `ไม่ได้สำรองข้อมูล${b.lastAt ? 'มา ' + Math.floor(age / 24) + ' วัน' : 'เลย'}`,
                    'ถ้าเครื่องเสีย ยอดขายและเมนูจะหาย · ระบบสำรองเองทุกคืน 23:30 — ถ้ายังขึ้นเตือนอยู่ ให้เปิดไอคอน CafeFlow บนเครื่องเซิร์ฟเวอร์ แล้วเลือก "สำรองข้อมูลตอนนี้" หรือแจ้งผู้ดูแลระบบ', '');
            }
        }

        const so = CFKpi.soldOutProducts();
        if (so.length) {
            add('info', 'ban', `สินค้าหมดวันนี้ ${so.length} รายการ`,
                so.slice(0, 6).map((p) => p.nameTh).join(', ') + (so.length > 6 ? ' …' : ''),
                CFAuth.can('MENU_EDIT') ? go('เมนูและสินค้า', 'menu.html') : '');
        }

        const el = document.getElementById('attn');
        el.hidden = !items.length;
        el.innerHTML = items.length ? `
            <div class="cf-attn-head"><i data-lucide="bell" class="icon-sm"></i> ต้องจัดการ <span class="ds-pane-count">${items.length}</span></div>
            ${items.map((x) => `<div class="cf-attn-row ${x.tone}">
                <span class="cf-attn-ico"><i data-lucide="${x.icon}" class="icon-sm"></i></span>
                <div class="cf-attn-body"><div class="cf-attn-text">${e(x.text)}</div><div class="cf-attn-sub">${e(x.sub)}</div></div>
                ${x.btn}
            </div>`).join('')}` : '';
    },

    /** ยอดรายชั่วโมงของวันนี้ (คิดจาก cache — ออเดอร์วันนี้อยู่ในหน้าต่าง 24 ชม. ครบ) */
    renderHours(todays) {
        const sold = todays.filter((o) => CF_SOLD.includes(o.status));
        const el = document.getElementById('hourChart');
        if (!sold.length) { el.innerHTML = '<div class="ds-empty-sm">ยังไม่มียอดขายวันนี้</div>'; return; }
        const hrs = Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: 0, sales: 0 }));
        sold.forEach((o) => { const h = new Date(o.createdAt).getHours(); hrs[h].orders++; hrs[h].sales += o.total; });
        let a = hrs.findIndex((h) => h.orders), b = 23 - [...hrs].reverse().findIndex((h) => h.orders);
        a = Math.min(a, 8);                                           // เห็นตั้งแต่ช่วงเปิดร้านถึงตอนนี้
        b = Math.max(b, Math.min(23, new Date().getHours()));
        const shown = hrs.slice(a, b + 1);
        const max = Math.max(1, ...shown.map((h) => h.sales));
        const hh = (h) => String(h).padStart(2, '0');
        el.innerHTML = `<div class="cf-vbars">${shown.map((h) => `
            <div class="cf-vbar" title="${hh(h.hour)}:00 · ${h.orders} บิล · ${CFApp.baht(h.sales)}">
                <span class="cf-vbar-val">${h.sales ? CFApp.int(Math.round(h.sales)) : ''}</span>
                <span class="cf-vbar-fill" style="height:${h.sales ? Math.max(3, h.sales / max * 100) : 0}%"></span>
                <span class="cf-vbar-lbl">${hh(h.hour)}</span>
            </div>`).join('')}</div>`;
    },

    renderTop(todays) {
        const ids = new Set(todays.filter((o) => CF_SOLD.includes(o.status)).map((o) => o.id));
        const acc = {};
        CFStore.all('orderItems').filter((i) => ids.has(i.orderId) && i.itemStatus !== 'VOID').forEach((i) => {
            const k = acc[i.productId] || (acc[i.productId] = { name: i.nameSnapshot, qty: 0, amount: 0 });
            k.qty += i.qty;
            k.amount += i.qty * i.unitPrice;
        });
        const top = Object.values(acc).sort((a, b) => b.qty - a.qty || b.amount - a.amount).slice(0, 5);
        const e = CFApp.esc;
        document.getElementById('topToday').innerHTML = top.length ? top.map((p, i) => `
            <div class="cf-top-row"><span class="cf-top-rank">${i + 1}</span>
                <span class="cf-top-name">${e(p.name)}</span>
                <span class="cf-top-val"><b>${p.qty}</b> แก้ว · ${CFApp.baht(p.amount)}</span></div>`).join('')
            : '<div class="ds-empty-sm">ยังไม่มีการขายวันนี้</div>';
    },

    /** งานที่กำลังเดินของวันนี้ — กดไปหน้าที่ทำงานนั้น */
    renderLive(todays) {
        const n = (list) => todays.filter((o) => list.includes(o.status)).length;
        const tile = (icon, value, label, href, tone) => `
            <a class="cf-live ${value ? tone : ''}" href="${href}">
                <i data-lucide="${icon}" class="icon-sm"></i><b>${value}</b><span>${label}</span></a>`;
        document.getElementById('liveOps').innerHTML = `<div class="cf-live-row">
            ${tile('hourglass', n(CF_WAITING_PAY), 'รอชำระ', 'cashier.html', 'warn')}
            ${tile('chef-hat', n(CF_IN_PROGRESS), 'กำลังทำ', 'kds.html', 'info')}
            ${tile('bell-ring', n(['READY']), 'พร้อมรับ', 'cashier.html', 'ok')}
        </div>`;
    },

    /** บิลล่าสุด — เฉพาะบิลที่รับเงินแล้ว (รวมที่ยกเลิก/คืนเงินทีหลัง) ไม่ใช่ log ระบบ */
    renderRecent(todays) {
        const e = CFApp.esc;
        const paid = todays.filter((o) => o.ts && o.ts.paidAt)
            .sort((a, b) => new Date(b.ts.paidAt) - new Date(a.ts.paidAt)).slice(0, 8);
        const PAY = { CASH: 'เงินสด', QR: 'QR' };
        document.getElementById('recent').innerHTML = paid.length ? paid.map((o) => {
            const off = ['VOIDED', 'REFUNDED'].includes(o.status);
            return `<a class="cf-bill ${off ? 'off' : ''}" href="orders.html?order=${encodeURIComponent(o.id)}">
                <b>${e(o.orderNo)}</b>
                <span class="cf-bill-meta">${PAY[o.paymentMethod] || ''}${off ? ' · ' + e(CFApp.statusLabel(o.status)) : ''}</span>
                <span class="cf-bill-amt">${CFApp.baht(o.total)}</span>
                <span class="cf-bill-time">${CFApp.time(o.ts.paidAt)}</span></a>`;
        }).join('') : '<div class="ds-empty-sm">ยังไม่มีบิลวันนี้</div>';
    },

    /* ══════════════════════════════════════════════════════
       DRAWER — อุปกรณ์ (§30)
       ══════════════════════════════════════════════════════ */
    /** แถวตารางอุปกรณ์ — render() เรียกซ้ำทุกครั้งที่ store เปลี่ยน สถานะจึงอัปเดตเองตอนลิ้นชักเปิดค้าง */
    deviceRows() {
        const e = CFApp.esc;
        return CFStore.all('devices').map((d) => {
            const online = d.status === 'ONLINE';
            // จับคู่ได้เฉพาะเครื่องที่รับออเดอร์/แสดงผล — เครื่องพิมพ์ไม่ได้เปิดเบราว์เซอร์
            const page = this.devicePage(d.type);
            const pairable = !!page;
            return `<tr>
                <td>
                    <div class="td-name">${e(d.name)}</div>
                    <div class="td-sub">${e(d.id)} · ${e(d.ip)}${d.lastSeen ? ' · ล่าสุด ' + CFApp.time(d.lastSeen) : ''}</div>
                </td>
                <td>${d.assignedStation ? CFApp.stationChip(d.assignedStation) : '<span class="text-muted">—</span>'}</td>
                <td>${pairable ? this.pairStateHtml(d) : `<span class="status-badge ${online ? 'active' : 'danger'}">${online ? 'ออนไลน์' : 'ออฟไลน์'}</span>`}</td>
                <td>${pairable ? `<div class="cf-dev-acts">
                    <button class="btn btn-outline btn-sm" onclick="DashPage.pairDevice('${d.id}')">
                        <i data-lucide="link" class="icon-sm"></i> จับคู่
                    </button>
                    ${d.type === 'DISPLAY' ? `<button class="btn btn-outline btn-sm" title="ตั้งค่าจอแสดงคิว"
                        onclick="DashPage.openDisplaySettings()"><i data-lucide="settings" class="icon-sm"></i></button>` : ''}
                    <a class="btn btn-outline btn-sm" href="${page}" target="_blank" rel="noopener"
                       title="เปิดหน้า ${page} ในแท็บใหม่">
                        <i data-lucide="external-link" class="icon-sm"></i>
                    </a></div>` : '<span class="text-muted">—</span>'}</td>
            </tr>`;
        }).join('');
    },

    /** เครื่องที่ค้างหน้าขอรหัสแต่เดาไม่ได้ว่าเป็นอุปกรณ์ตัวไหน — ต่อท้ายตารางให้เห็น */
    unknownWaitRows() {
        const e = CFApp.esc;
        return CFStore.all('deviceWaits').filter((w) => !w.deviceId).map((w) => `<tr>
                <td>
                    <div class="td-name">เครื่องที่ยังไม่รู้จัก</div>
                    <div class="td-sub">${e(w.ip)} · เปิดหน้า ${e(w.page)} · ล่าสุด ${CFApp.time(w.at)}</div>
                </td>
                <td><span class="text-muted">—</span></td>
                <td><span class="status-badge waiting">รอรหัสจับคู่</span>
                    <div class="td-sub">ตั้งแต่ ${CFApp.time(w.since)}</div></td>
                <td class="td-sub">กด "จับคู่" ที่อุปกรณ์ที่ต้องการให้เครื่องนี้เป็น</td>
            </tr>`).join('');
    },

    /**
     * สถานะการจับคู่ของเครื่องที่เปิดเบราว์เซอร์ (คีออสก์ / จอคิว / KDS)
     * แยก "ปิดเครื่อง" ออกจาก "เปิดอยู่แต่หลุดการจับคู่" — สองอย่างนี้แก้คนละวิธี
     */
    pairStateHtml(d) {
        const w = CFStore.all('deviceWaits').find((x) => x.deviceId === d.id);
        const badge = (cls, label, sub) =>
            `<span class="status-badge ${cls}">${label}</span>${sub ? `<div class="td-sub">${sub}</div>` : ''}`;
        if (w) {
            return badge('waiting', 'หลุดการจับคู่ · รอรหัส',
                'ค้างตั้งแต่ ' + CFApp.time(w.since) + (w.reason === 'REVOKED' ? ' · สิทธิ์ถูกแทนที่/ยกเลิก' : ' · ข้อมูลเบราว์เซอร์หาย'));
        }
        if (!d.paired) return badge('inactive', 'ยังไม่จับคู่');
        if (d.status === 'ONLINE') return badge('active', 'ใช้งานอยู่');
        const mins = d.lastSeen ? Math.floor(CFApp.elapsedMin(d.lastSeen)) : null;
        return badge('danger', 'ปิดเครื่อง / ไม่ส่งสัญญาณ',
            mins == null ? 'ยังไม่เคยส่งสัญญาณ' : 'เงียบไป ' + (mins < 60 ? mins + ' นาที' : Math.floor(mins / 60) + ' ชม.'));
    },

    openDevices() {
        Drawer.open({
            title: 'อุปกรณ์ในเครือข่าย',
            width: CFApp.DRAWER_W,
            contentHtml: `
                <!-- ที่อยู่เครื่องเซิร์ฟเวอร์ — ตั้งเครื่องใหม่ต้องกรอกในไฟล์เปิดจอ (ops/screen-edge.bat) · 19/10/2569 -->
                <div class="cf-srv" id="srvAddr"><span class="td-sub">กำลังอ่านที่อยู่เครื่องเซิร์ฟเวอร์…</span></div>
                ${CFApp.card('อุปกรณ์', `<div id="devHost">${this.devTableHtml()}</div>`,
                    { flush: true, hint: 'ออฟไลน์ = ไม่ได้ติดต่อเกิน 1 นาที (ปิดเครื่อง · หลุด Wi-Fi)' })}`,
            footerHtml: '<button class="btn btn-outline" onclick="Drawer.close()">ปิด</button>',
            onOpen: () => { refreshIcons(); CFTable.mount('devTable'); this.loadServerAddress(); },
        });
    },

    devTableHtml() {
        return `<table class="data-table compact" id="devTable">
            <thead><tr><th>อุปกรณ์</th><th>สถานี</th><th>สถานะ</th><th class="no-sort"></th></tr></thead>
            <tbody>${this.deviceRows()}${this.unknownWaitRows()}</tbody>
        </table>`;
    },

    /**
     * ที่อยู่เครื่องเซิร์ฟเวอร์ (IP:พอร์ต) — เครื่องอื่นในร้านต้องเปิดที่อยู่นี้
     * IP เปลี่ยนได้ถ้ายังไม่ได้ล็อกที่เราเตอร์ → เครื่องที่ตั้งไว้แล้วจะต่อไม่ติด ต้องแก้ไฟล์เปิดจอให้ตรง
     */
    async loadServerAddress() {
        const el = document.getElementById('srvAddr');
        if (!el) return;
        const e = CFApp.esc;
        try {
            const r = await CFApi.get('/api/server-address');
            const list = r.addresses || [];
            if (!list.length) { el.innerHTML = '<span class="td-sub">เครื่องนี้ยังไม่ได้ต่อ Wi-Fi/LAN ของร้าน</span>'; return; }
            const main = list[0];
            el.innerHTML = `
                <div class="cf-srv-label"><i data-lucide="server" class="icon-sm"></i> ที่อยู่เครื่องเซิร์ฟเวอร์ — ใช้ตั้งเครื่องใหม่ (คีออสก์ · แคชเชียร์ · ครัว · จอคิว)</div>
                <div class="cf-srv-row">
                    <code class="cf-srv-url">${e(main.url)}</code>
                    <button type="button" class="btn btn-outline btn-sm" onclick="DashPage.copyText('${e(main.url)}')">
                        <i data-lucide="copy" class="icon-sm"></i> คัดลอก</button>
                </div>
                <div class="td-sub">IP <b>${e(main.ip)}</b> (${e(main.adapter)})
                    ${list.length > 1 ? ' · อื่น ๆ: ' + list.slice(1).map((x) => e(x.ip) + ' (' + e(x.adapter) + ')').join(', ') : ''}
                    — ใช้ที่อยู่นี้ตอนตั้งเครื่องใหม่ (คีออสก์ · ครัว · จอคิว) ครั้งแรก ·
                    ถ้าเครื่องที่เคยตั้งไว้ต่อไม่ติด อาจเป็นเพราะที่อยู่นี้เปลี่ยน ให้กรอกใหม่</div>`;
            refreshIcons();
        } catch (err) {
            el.innerHTML = '<span class="td-sub">อ่านที่อยู่เครื่องเซิร์ฟเวอร์ไม่ได้ — ' + e(err.message || '') + '</span>';
        }
    },

    copyText(t) {
        const done = () => showToast('คัดลอก ' + t + ' แล้ว', 'success');
        if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(t).then(done, () => prompt('คัดลอกที่อยู่นี้', t)); return; }
        prompt('คัดลอกที่อยู่นี้', t);     // http บน LAN ใช้ clipboard API ไม่ได้ — ให้คัดลอกจากกล่อง
    },

    /* ══════════════════════════════════════════════════════
       DRAWER — ตั้งค่าจอแสดงคิว (เปิดจากปุ่ม ⚙ ในแถวจอคิวของตารางอุปกรณ์)
       ค่านี้ใช้ร่วมกันทุกจอคิวของร้าน — ไม่ได้แยกต่อเครื่อง
       ══════════════════════════════════════════════════════ */
    openDisplaySettings() {
        this._dd = Object.assign({}, CF_DISPLAY_DEFAULTS, CFStore.settings());
        const d = this._dd;
        const e = CFApp.esc;
        // จัดใหม่ 21/10/2569: การ์ด + แถวตั้งค่า + กล่อง เปิด|ปิด แบบเดียวกับตั้งค่าคีออสก์
        Drawer.open({
            title: 'ตั้งค่าจอแสดงคิว',
            width: CFApp.DRAWER_W,
            contentHtml: CFApp.card('หน้าตา',
                    CFApp.row('โทนสีจอ', 'พื้นเข้มอ่านง่ายจากไกล ไม่แสบตาในร้านไฟสลัว · พื้นสว่างเหมาะกับร้านที่สว่าง',
                        CFApp.boxSel('dTheme', [['light', 'พื้นสว่าง'], ['dark', 'พื้นเข้ม']],
                            d.displayTheme === 'dark' ? 'dark' : 'light', 'DashPage.dTheme($)')), { flush: true }) +
                CFApp.card('เมนูแนะนำ',
                    CFApp.row('แสดงเมนูแนะนำด้านขวาของจอ', 'ปิดแล้วคิวเต็มจอ เลขคิวใหญ่ขึ้น — เหมาะช่วงคนเยอะ',
                        CFApp.onOff('dt-displayHighlights', d.displayHighlights !== false, "DashPage.dSet('displayHighlights', $)")) +
                    `<label class="cf-set-row cf-set-num">
                        <span class="cf-set-title">สลับเมนูทุก</span>
                        <span class="cf-sec"><input class="sip-input" id="dHiSec" type="number" min="3" max="60" step="1"
                               value="${Number(d.displayHighlightSec) || 7}"> วิ</span>
                    </label>`, { flush: true }) +
                CFApp.card('เสียง',
                    CFApp.row('เสียงเรียกคิวเมื่อคิวพร้อมรับ', 'ทีวีต้องกด "เปิดเสียงเรียกคิว" บนจอหนึ่งครั้งตอนติดตั้ง (เบราว์เซอร์บังคับ)',
                        CFApp.onOff('dt-displaySound', d.displaySound !== false, "DashPage.dSet('displaySound', $)")), { flush: true }) +
                CFApp.card('ข้อความประกาศ', `
                    <div class="sip-field">
                        <label class="sip-label">ข้อความวิ่งด้านล่างจอ</label>
                        <input class="sip-input" id="dTicker" maxlength="200"
                               placeholder="เช่น Wi-Fi: cafe1234 · ว่างไว้ = ไม่แสดง"
                               value="${e(d.displayTicker || '')}">
                        <div class="ds-note">วิ่งจากขวาไปซ้ายตลอด · ไม่เกิน 200 ตัวอักษร</div>
                    </div>`) +
                '<div class="ds-note">ใช้กับจอแสดงคิวทุกจอของร้าน · บันทึกแล้วทีวีเปลี่ยนเองภายในไม่กี่วินาที ไม่ต้องรีเฟรช</div>',
            footerHtml: `
                <button class="btn btn-outline" onclick="Drawer.close()">ยกเลิก</button>
                <button class="btn btn-primary" onclick="DashPage.saveDisplaySettings()">
                    <i data-lucide="save" class="icon-sm"></i> บันทึก
                </button>`,
            onOpen: () => refreshIcons(),
        });
    },

    dTheme(v) {
        this._dd.displayTheme = v;
        CFApp.markBox('dTheme', v);
    },
    /** ตั้งค่า (ไม่ใช่สลับ) — กดกล่องที่เลือกอยู่แล้วซ้ำต้องไม่เปลี่ยนค่า */
    dSet(key, on) {
        this._dd[key] = on;
        CFApp.markBox('dt-' + key, on);
    },

    saveDisplaySettings() {
        const d = this._dd;
        const sec = parseInt((document.getElementById('dHiSec') || {}).value, 10);
        if (!(sec >= 3 && sec <= 60)) { showToast('เวลาสลับเมนูแนะนำต้องเป็น 3–60 วินาที', 'error'); return; }
        d.displayHighlightSec = sec;
        d.displayTicker = ((document.getElementById('dTicker') || {}).value || '').trim();
        d.displayHighlights = d.displayHighlights !== false;
        d.displaySound = d.displaySound !== false;

        // ส่งเฉพาะคีย์ของจอคิว — ไม่ทับค่าตั้งอื่นที่อาจเพิ่งถูกแก้จากอีกเครื่อง
        const patch = {};
        Object.keys(CF_DISPLAY_DEFAULTS).forEach((k) => { patch[k] = d[k]; });
        CFStore.cmd('patch', '/api/settings', patch)
            .then(() => {
                Drawer.close();
                showToast('บันทึกการตั้งค่าจอแสดงคิวแล้ว', 'success');
            })
            .catch((err) => showToast(err.message || 'บันทึกไม่สำเร็จ', 'error', 4000));
    },

    /** หน้าที่อุปกรณ์แต่ละชนิดต้องเปิด — null = ไม่ต้องจับคู่ (เช่นเครื่องพิมพ์) */
    devicePage(type) {
        return { KIOSK: 'kiosk.html', KDS: 'kds.html', DISPLAY: 'display.html' }[type] || null;
    },

    /**
     * ขอรหัสจับคู่ให้อุปกรณ์หนึ่งเครื่อง (§30)
     * รหัสแสดงครั้งเดียว — ในฐานเก็บแต่ hash ย้อนดูไม่ได้ ถ้าปิดไปก่อนต้องขอใหม่
     */
    async pairDevice(id) {
        // เครื่องเดิมยังใช้งานอยู่ — ออกรหัสใหม่แล้วไปกรอกที่อื่น เครื่องเดิมจะหลุดทันที (อาจกำลังรับออเดอร์อยู่)
        const cur = CFStore.byId('devices', id);
        const waiting = CFStore.all('deviceWaits').some((w) => w.deviceId === id);
        if (cur && cur.paired && cur.status === 'ONLINE' && !waiting) {
            const go = await Drawer.confirm({
                title: 'จับคู่ ' + CFApp.esc(cur.name) + ' ใหม่?',
                message: 'เครื่องนี้ยังใช้งานอยู่',
                lines: [
                    'ส่งสัญญาณล่าสุด ' + CFApp.time(cur.lastSeen) + (cur.ip ? ' จาก IP ' + cur.ip : ''),
                    'ถ้านำรหัสใหม่ไปกรอกที่เครื่องอื่น เครื่องเดิมจะหลุดการจับคู่ทันที',
                ],
                note: 'ทำต่อเฉพาะเมื่อตั้งใจย้ายหรือเปลี่ยนเครื่องจริง ๆ',
                confirmText: 'ขอรหัสใหม่', danger: true,
            });
            if (!go) return;
        }
        try {
            const r = await CFApi.post('/api/devices/' + encodeURIComponent(id) + '/pair-code', {});
            const dev = CFStore.all('devices').find((d) => d.id === id);
            const page = dev && this.devicePage(dev.type);
            await Drawer.confirm({
                title: 'รหัสจับคู่ — ' + CFApp.esc(r.name),
                message: r.code,
                lines: [
                    'ไปที่เครื่อง ' + r.deviceId + ' แล้วกรอกรหัสนี้',
                    page ? 'เปิดหน้า ' + new URL(page, location.href).href : '',
                    'รหัสใช้ได้ ' + r.expiresInMin + ' นาที และใช้ได้ครั้งเดียว',
                ],
                note: 'รหัสนี้แสดงครั้งเดียว — ปิดหน้าต่างนี้แล้วต้องขอใหม่',
                confirmText: 'เรียบร้อย',
            });
        } catch (err) {
            showToast(err.message || 'ขอรหัสจับคู่ไม่สำเร็จ', 'error', 4000);
        }
    },

    /* ══════════════════════════════════════════════════════
       DRAWER — เครื่องพิมพ์ (§19)
       ที่เดียวของทั้งร้าน: เซิร์ฟเวอร์เป็นคนพิมพ์ให้ทุกส่วน
       จึงไม่ใส่ไว้ในหน้าครัว/แคชเชียร์ที่พนักงานทั่วไปเข้าได้
       ══════════════════════════════════════════════════════ */
    printers() {
        return CFStore.all('devices').filter((d) => d.type === 'PRINTER');
    },

    /** ตั้งค่าครบพอให้ส่งงานได้ไหม — ตรงกับ targetOf() ใน api/src/print/worker.js */
    /** บันทึกทันทีที่กด — ตั้งเป็นค่าที่กด (กดกล่องที่เลือกอยู่แล้วซ้ำ = ไม่ทำอะไร ไม่ใช่สลับกลับ) */
    async setAutoReceipt(on) {
        if ((CFStore.settings().autoPrintReceipt !== false) === on) return;
        try {
            await CFStore.cmd('PATCH', '/api/settings', { autoPrintReceipt: on });
            CFApp.markBox('autoReceipt', on);
            showToast(on ? 'เปิดพิมพ์ใบเสร็จอัตโนมัติแล้ว' : 'ปิดพิมพ์ใบเสร็จอัตโนมัติแล้ว', 'success');
        } catch (err) {
            showToast(err.message || 'บันทึกไม่สำเร็จ', 'error', 4000);
        }
    },

    kiosks() { return CFStore.all('devices').filter((d) => d.type === 'KIOSK'); },
    kioskName(id) { const k = CFStore.byId('devices', id); return k ? k.name : id; },

    printerReady(p) {
        if (p.conn === 'USB' && p.kioskId) return true;     // เสียบที่ตู้ — ตู้พิมพ์เอง
        return p.conn === 'USB' ? !!p.printerUsb : !!p.printerHost;
    },

    printerConnText(p) {
        if (p.conn === 'USB' && p.kioskId) return 'USB · เสียบที่ตู้คีออสก์';
        if (p.conn === 'USB') return 'USB · ' + (p.printerUsb || 'ยังไม่ได้เลือก');
        return p.printerHost ? 'LAN · ' + p.printerHost + ':' + (p.printerPort || 9100) : 'LAN · ยังไม่ได้ใส่ IP';
    },

    /**
     * เครื่องที่ส่วนนี้จะพิมพ์ออกจริง — กฎเดียวกับ printerFor() ฝั่งเซิร์ฟเวอร์
     * station = null คือใบเสร็จ/เคาน์เตอร์
     */
    printerForStation(station) {
        // เครื่องที่ผูกคีออสก์ไม่รับงานของส่วนอื่น — ตรงกับ printerFor() ฝั่งเซิร์ฟเวอร์
        const act = this.printers().filter((p) => p.active !== false && !p.kioskId)
            .sort((a, b) => (a.id < b.id ? -1 : 1));
        if (station) {
            return act.find((p) => p.assignedStation === station)
                || act.find((p) => !p.assignedStation) || null;
        }
        return act.find((p) => !p.assignedStation) || act[0] || null;
    },

    openPrinters() {
        const e = CFApp.esc;
        const sections = [null].concat(Object.keys(CF_STATIONS));

        const mapRows = sections.map((st) => {
            const p = this.printerForStation(st);
            const own = p && (p.assignedStation || null) === st;
            let where;
            if (!p) where = '<span class="status-badge danger">ไม่มีเครื่องพิมพ์</span>';
            else {
                where = `<div class="td-name">${e(p.name)}</div>` +
                    `<div class="td-sub">${e(this.printerConnText(p))}${own ? '' : ' · ใช้เครื่องเคาน์เตอร์แทน'}</div>`;
                if (!this.printerReady(p)) where += '<span class="status-badge danger">ตั้งค่าไม่ครบ</span>';
            }
            return `<tr>
                <td>${st ? CFApp.stationChip(st) : '<span class="sip-chip sip-chip-muted">ใบเสร็จ / เคาน์เตอร์</span>'}</td>
                <td>${where}</td>
            </tr>`;
        }).join('') + this.kiosks().map((k) => {
            // ใบรับออเดอร์ไม่บังคับ — ไม่มีเครื่องก็แค่ไม่พิมพ์ จึงเป็นสีเทา ไม่ใช่แดง
            const p = this.printers().find((x) => x.kioskId === k.id && x.active !== false);
            const where = p
                ? `<div class="td-name">${e(p.name)}</div><div class="td-sub">${e(this.printerConnText(p))}</div>` +
                  (this.printerReady(p) ? '' : '<span class="status-badge danger">ตั้งค่าไม่ครบ</span>')
                : `<span class="text-muted">ยังไม่ได้ตั้งเครื่องพิมพ์บัตรคิว</span>
                   <button class="btn btn-outline btn-sm cf-ml-8" onclick="DashPage.editPrinter(null, '${e(k.id)}')">
                       <i data-lucide="plus" class="icon-sm"></i> ตั้งเครื่องพิมพ์ให้ตู้นี้</button>`;
            return `<tr>
                <td><span class="sip-chip sip-chip-muted">ใบรับออเดอร์ · ${e(k.name)}</span></td>
                <td>${where}</td>
            </tr>`;
        }).join('');

        const list = this.printers().map((p) => `<tr>
                <td>
                    <div class="td-name">${e(p.name)}</div>
                    <div class="td-sub">${e(this.printerConnText(p))}</div>
                </td>
                <td>${p.kioskId ? `<span class="sip-chip sip-chip-muted">${e(this.kioskName(p.kioskId))}</span>`
                     : p.assignedStation ? CFApp.stationChip(p.assignedStation) : '<span class="sip-chip sip-chip-muted">เคาน์เตอร์</span>'}</td>
                <td class="cf-nowrap">${e(p.paperWidth || '80mm')}</td>
                <td>${p.active === false ? '<span class="status-badge inactive">ปิดใช้งาน</span>'
                     : this.printerReady(p) ? '<span class="status-badge active">ใช้งาน</span>'
                     : '<span class="status-badge danger">ตั้งค่าไม่ครบ</span>'}</td>
                <td class="cf-nowrap cf-right">
                    <button class="ds-icon-btn edit" title="แก้ไข" onclick="DashPage.editPrinter('${e(p.id)}')"><i data-lucide="pencil"></i></button>
                </td>
            </tr>`).join('');

        // จัดใหม่ 21/10/2569: การ์ด 3 ใบ · สวิตช์เป็นกล่อง เปิด|ปิด · ตาราง DataTables
        Drawer.open({
            title: 'เครื่องพิมพ์',
            width: CFApp.DRAWER_W,
            contentHtml: CFApp.card('การพิมพ์', `
                <div class="cf-set-row">
                    <div class="cf-set-text"><div class="cf-set-title">พิมพ์ใบเสร็จอัตโนมัติเมื่อชำระเงินแล้ว</div>
                        <div class="cf-set-desc">ออกที่เครื่องเคาน์เตอร์ทันทีที่รับเงินสดหรือยืนยันสลิป · เงินสดเปิดลิ้นชักให้ด้วย</div></div>
                    <div class="cf-set-ctl">${CFApp.onOff('autoReceipt', CFStore.settings().autoPrintReceipt !== false, 'DashPage.setAutoReceipt($)')}</div>
                </div>
                <div class="cf-set-row">
                    <div class="cf-set-text"><div class="cf-set-title">งานที่พิมพ์ไม่ออก</div>
                        <div class="cf-set-desc">ดูงานที่ค้าง · สั่งพิมพ์ซ้ำ หรือย้ายไปเครื่องอื่น</div></div>
                    <div class="cf-set-ctl"><button type="button" class="btn btn-outline btn-sm" onclick="CFPrint.openFailed()">
                        <i data-lucide="alert-triangle" class="icon-sm"></i> เปิดดู</button></div>
                </div>`, { flush: true }) +
                CFApp.card('แต่ละส่วนพิมพ์ที่ไหน', `
                    <table class="data-table compact" id="prnMap">
                        <thead><tr><th>ส่วน</th><th class="no-sort">พิมพ์ออกที่</th></tr></thead>
                        <tbody>${mapRows}</tbody>
                    </table>`, { flush: true, hint: 'ส่วนที่ไม่มีเครื่องของตัวเองพิมพ์ออกที่เครื่องเคาน์เตอร์ · เปลี่ยนได้ที่ "ใช้พิมพ์ของส่วน" ของแต่ละเครื่อง' }) +
                CFApp.card('รายการเครื่องพิมพ์', `
                    <table class="data-table compact" id="prnList">
                        <thead><tr><th>เครื่อง</th><th>ส่วน</th><th>กระดาษ</th><th>สถานะ</th><th class="no-sort"></th></tr></thead>
                        <tbody>${list}</tbody>
                    </table>`, { flush: true }),
            footerHtml: `
                <button class="btn btn-outline" onclick="Drawer.close()">ปิด</button>
                <button class="btn btn-primary" onclick="DashPage.editPrinter()">
                    <i data-lucide="plus" class="icon-sm"></i> เพิ่มเครื่องพิมพ์
                </button>`,
            onOpen: () => {
                refreshIcons();
                CFTable.mount('prnMap');
                CFTable.mount('prnList', { language: Object.assign({}, CFTable.TH, { emptyTable: 'ยังไม่มีเครื่องพิมพ์ — กด "เพิ่มเครื่องพิมพ์"' }) });
            },
        });
    },

    /** ฟอร์มเพิ่ม (ไม่ส่ง id) หรือแก้ไขเครื่องพิมพ์ */
    /** forKiosk = เพิ่มเครื่องพิมพ์บัตรคิวให้ตู้นั้น (ปุ่มลัดในแถวของตู้) — เลือกตู้และ USB ไว้ให้ */
    editPrinter(id, forKiosk) {
        const p = id ? this.printers().find((x) => x.id === id) : null;
        if (id && !p) { showToast('ไม่พบเครื่องพิมพ์', 'error'); return; }
        this._pd = {
            id: p ? p.id : null,
            conn: p ? (p.conn || 'NETWORK') : forKiosk ? 'USB' : 'NETWORK',
            usb: p ? p.printerUsb || '' : '',
            usbList: null,            // null = ยังไม่ได้โหลด
            active: p ? p.active !== false : true,
        };
        const e = CFApp.esc;
        // เครื่องของคีออสก์เป็นเครื่องสำรองไม่ได้ — ไม่งั้นสลิปครัวไปโผล่ที่ตู้หน้าร้าน
        const others = this.printers().filter((x) => x.id !== (p && p.id) && x.active !== false && !x.kioskId);
        const station = p && !p.kioskId ? p.assignedStation || '' : '';
        const paper = p ? p.paperWidth || '80mm' : '80mm';
        const dots = p ? p.printDots || null : null;

        Drawer.open({
            title: p ? 'แก้ไขเครื่องพิมพ์' : 'เพิ่มเครื่องพิมพ์',
            width: CFApp.DRAWER_W,
            // จัดใหม่ 21/10/2569: การ์ด 4 ใบ · การเชื่อมต่อ/เปิดใช้งานเป็นกล่องเลือก · id ทุกช่องเหมือนเดิม
            contentHtml: CFApp.card('เครื่อง', `
                <div class="form-row">
                    <div class="sip-field">
                        <label class="sip-label">ชื่อเครื่องพิมพ์</label>
                        <input class="sip-input" id="pName" placeholder="เช่น เครื่องพิมพ์บาร์"
                               value="${e(p ? p.name : forKiosk ? 'เครื่องพิมพ์บัตรคิว ' + this.kioskName(forKiosk) : '')}">
                    </div>
                    <div class="sip-field">
                        <label class="sip-label">ใช้พิมพ์ของส่วน</label>
                        <select class="sip-select" id="pStation" onchange="DashPage.pConn(DashPage._pd.conn)">
                            <option value="" ${station || forKiosk ? '' : 'selected'}>ใบเสร็จ / เคาน์เตอร์ (และส่วนที่ไม่มีเครื่องของตัวเอง)</option>
                            ${Object.keys(CF_STATIONS).map((st) => `<option value="${st}" ${station === st ? 'selected' : ''}>
                                ${e(CFApp.stationLabel(st))}</option>`).join('')}
                            ${this.kiosks().length ? `<optgroup label="บัตรคิวของคีออสก์">
                                ${this.kiosks().map((k) => `<option value="KIOSK:${e(k.id)}" ${(p ? p.kioskId : forKiosk) === k.id ? 'selected' : ''}>
                                    ${e(k.name)} (${e(k.id)})</option>`).join('')}
                            </optgroup>` : ''}
                        </select>
                    </div>
                </div>`) +
                CFApp.card('การเชื่อมต่อ', `
                <div class="sip-field">
                    ${CFApp.boxSel('pConn', [['NETWORK', 'LAN / IP'], ['USB', 'USB']], this._pd.conn, 'DashPage.pConn($)')}
                </div>
                <div id="pNet">
                    <div class="form-row">
                        <div class="sip-field">
                            <label class="sip-label">IP ของเครื่องพิมพ์</label>
                            <input class="sip-input" id="pHost" inputmode="decimal" placeholder="192.168.1.50"
                                   value="${e(p && p.printerHost ? p.printerHost : '')}">
                        </div>
                        <div class="sip-field">
                            <label class="sip-label">พอร์ต</label>
                            <input class="sip-input" id="pPort" type="number" min="1" max="65535"
                                   value="${p && p.printerPort ? p.printerPort : 9100}">
                            <div class="ds-note">ปกติไม่ต้องแก้</div>
                        </div>
                    </div>
                </div>
                <div id="pUsb">
                    <div class="ds-note" id="pUsbKiosk" hidden>
                        เสียบเครื่องพิมพ์ที่ <strong>ตัวตู้คีออสก์</strong> แล้วตั้งเป็นเครื่องพิมพ์หลักของเครื่องตู้นั้น
                        · ตู้จะพิมพ์บัตรคิวเองโดยไม่ต้องกดอะไร
                    </div>
                    <div class="sip-field" id="pUsbServer">
                        <label class="sip-label">เลือกเครื่องพิมพ์ USB</label>
                        <div class="cf-inline">
                            <select class="sip-select" id="pUsbSel" onchange="DashPage._pd.usb = this.value"></select>
                            <button type="button" class="btn btn-outline" onclick="DashPage.loadUsb()">
                                <i data-lucide="refresh-cw" class="icon-sm"></i> รีเฟรช
                            </button>
                        </div>
                        <div class="ds-note">
                            ต้องเสียบที่ <strong>เครื่องเซิร์ฟเวอร์ของร้าน</strong> และลงไดรเวอร์ให้ Windows เห็นก่อน
                            · ถ้าจะพิมพ์ที่จุดอื่นในร้าน ให้ใช้เครื่องพิมพ์แบบ LAN
                        </div>
                    </div>
                </div>`) +
                CFApp.card('กระดาษและเครื่องสำรอง', `
                <div class="form-row">
                    <div class="sip-field">
                        <label class="sip-label">ขนาดกระดาษ</label>
                        <select class="sip-select" id="pPaper">
                            <option value="80mm" ${paper === '80mm' ? 'selected' : ''}>80 มม.</option>
                            <option value="58mm" ${paper === '58mm' ? 'selected' : ''}>58 มม.</option>
                        </select>
                    </div>
                    <div class="sip-field">
                        <label class="sip-label">เครื่องสำรองเมื่อเครื่องนี้พิมพ์ไม่ออก</label>
                        <select class="sip-select" id="pFallback">
                            <option value="">ไม่มี</option>
                            ${others.map((x) => `<option value="${e(x.id)}" ${p && p.fallbackId === x.id ? 'selected' : ''}>
                                ${e(x.name)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="sip-field">
                    <label class="sip-label">แบบเครื่องพิมพ์</label>
                    <select class="sip-select" id="pDots">
                        <option value="" ${dots ? '' : 'selected'}>แบบที่ 1 — มาตรฐาน (เครื่องส่วนใหญ่)</option>
                        <option value="180" ${dots === 512 || dots === 360 ? 'selected' : ''}>แบบที่ 2 — เครื่อง Epson รุ่นใหญ่</option>
                    </select>
                    <div class="ds-note">
                        ถ้าพิมพ์ออกมาแล้วขอบขวาขาด ให้เลือกแบบที่ 2 แล้วกด "พิมพ์ทดสอบ" อีกครั้ง
                    </div>
                </div>`) +
                (p ? CFApp.card('สถานะ', CFApp.row('ใช้งานเครื่องนี้', 'ปิดแทนการลบ — ประวัติงานพิมพ์เก่ายังอ้างถึงเครื่องนี้อยู่',
                    CFApp.onOff('pActive', this._pd.active, 'DashPage.pSetActive($)')), { flush: true }) : ''),
            footerHtml: `
                <button class="btn btn-outline" onclick="DashPage.openPrinters()">กลับ</button>
                <button class="btn btn-outline" id="pTestBtn" onclick="DashPage.testPrinter()">
                    <i data-lucide="printer" class="icon-sm"></i> พิมพ์ทดสอบ
                </button>
                <button class="btn btn-primary" onclick="DashPage.savePrinter()">
                    <i data-lucide="save" class="icon-sm"></i> บันทึก
                </button>`,
            onOpen: () => { this.pConn(this._pd.conn); refreshIcons(); },
        });
    },

    pConn(v) {
        this._pd.conn = v;
        CFApp.markBox('pConn', v);
        document.getElementById('pNet').hidden = v !== 'NETWORK';
        document.getElementById('pUsb').hidden = v !== 'USB';
        // USB + คีออสก์ = เสียบที่ตัวตู้ ไม่ต้องเลือกเครื่องจากเซิร์ฟเวอร์
        const atKiosk = /^KIOSK:/.test((document.getElementById('pStation') || {}).value || '');
        document.getElementById('pUsbKiosk').hidden = !atKiosk;
        document.getElementById('pUsbServer').hidden = atKiosk;
        if (atKiosk) return;
        if (v === 'USB' && this._pd.usbList === null) this.loadUsb();
        else this.renderUsb();
    },

    pSetActive(on) {
        this._pd.active = on;
        CFApp.markBox('pActive', on);
    },

    async loadUsb() {
        const sel = document.getElementById('pUsbSel');
        if (sel) sel.innerHTML = '<option>กำลังค้นหาเครื่องพิมพ์…</option>';
        try {
            const r = await CFApi.get('/api/printers/usb');
            this._pd.usbList = r.printers || [];
        } catch (err) {
            this._pd.usbList = [];
            showToast(err.message || 'อ่านรายชื่อเครื่องพิมพ์ไม่ได้', 'error', 4000);
        }
        this.renderUsb();
    },

    renderUsb() {
        const sel = document.getElementById('pUsbSel');
        if (!sel || this._pd.usbList === null) return;
        const e = CFApp.esc;
        // เครื่องที่ต่อ USB จริงขึ้นก่อน — Windows มีเครื่องพิมพ์เสมือน (PDF, OneNote) ปนมาด้วยเสมอ
        const list = this._pd.usbList.slice().sort((a, b) => (b.usb ? 1 : 0) - (a.usb ? 1 : 0));
        const cur = this._pd.usb;
        if (cur && !list.some((x) => x.id === cur)) list.unshift({ id: cur, label: cur + ' (ไม่พบตอนนี้)' });
        sel.innerHTML = '<option value="">— เลือกเครื่องพิมพ์ —</option>' +
            list.map((x) => `<option value="${e(x.id)}" ${x.id === cur ? 'selected' : ''}>${e(x.label)}</option>`).join('');
        if (!this._pd.usbList.length) {
            sel.innerHTML = '<option value="">ไม่พบเครื่องพิมพ์ในเครื่องเซิร์ฟเวอร์</option>';
        }
    },

    /**
     * พิมพ์ทดสอบด้วยค่าในฟอร์มตอนนี้ (ยังไม่ต้องบันทึก) — ใบทดสอบมีกรอบเต็มความกว้างที่ตั้งไว้
     * ดูกรอบแล้วปรับความละเอียด/กระดาษ กดซ้ำได้จนตรง ค่อยบันทึก
     */
    async testPrinter() {
        const body = this.printerBody();
        if (!body) return;
        const btn = document.getElementById('pTestBtn');
        btn.disabled = true;
        try {
            await CFApi.post('/api/printers/test', body);
            showToast('ส่งใบทดสอบแล้ว — ดูกรอบรอบใบ: ต้องเห็นครบทั้งซ้ายและขวา', 'success', 6000);
        } catch (err) {
            showToast(err.message || 'พิมพ์ทดสอบไม่สำเร็จ', 'error', 6000);
        } finally {
            btn.disabled = false;
        }
    },

    async savePrinter() {
        const body = this.printerBody();
        if (!body) return;
        try {
            if (this._pd.id) await CFStore.cmd('PATCH', '/api/printers/' + encodeURIComponent(this._pd.id), body);
            else await CFStore.cmd('POST', '/api/printers', body);
            showToast('บันทึกเครื่องพิมพ์แล้ว', 'success');
            this.openPrinters();
        } catch (err) {
            showToast(err.message || 'บันทึกไม่สำเร็จ', 'error', 4000);
        }
    },

    /** อ่านฟอร์มเครื่องพิมพ์ — null = กรอกไม่ครบ (แจ้งแล้ว) · ใช้ทั้งบันทึกและพิมพ์ทดสอบ */
    printerBody() {
        const d = this._pd;
        const val = (id) => (document.getElementById(id) || {}).value;
        const body = {
            name: (val('pName') || '').trim(),
            conn: d.conn,
            // ค่าในช่องเดียวกันเป็นได้ทั้งสถานี (BAR) และคีออสก์ (KIOSK:KIOSK-01)
            station: /^KIOSK:/.test(val('pStation') || '') ? null : (val('pStation') || null),
            kiosk: /^KIOSK:/.test(val('pStation') || '') ? val('pStation').slice(6) : null,
            paperWidth: val('pPaper'),
            // 180 dpi: จำนวนจุดขึ้นกับกระดาษ — เก็บเป็นจุดเพื่อให้ตัววาดใช้ได้ตรง ๆ
            dots: val('pDots') === '180' ? (val('pPaper') === '58mm' ? 360 : 512) : null,
            fallbackId: val('pFallback') || null,
            active: d.active,
        };
        if (!body.name) { showToast('ต้องตั้งชื่อเครื่องพิมพ์', 'error'); return null; }
        if (d.conn === 'NETWORK') {
            body.host = (val('pHost') || '').trim();
            body.port = parseInt(val('pPort'), 10) || 9100;
            if (!body.host) { showToast('ต้องใส่ IP ของเครื่องพิมพ์', 'error'); return null; }
        } else if (!body.kiosk) {
            body.usb = d.usb;
            if (!body.usb) { showToast('ต้องเลือกเครื่องพิมพ์ USB', 'error'); return null; }
        }
        return body;
    },

    /* ══════════════════════════════════════════════════════
       DRAWER — ตั้งค่าเครื่องคีออสก์
       ══════════════════════════════════════════════════════ */
    openKioskSettings() {
        this._kd = Object.assign({}, CF_KIOSK_DEFAULTS, CFStore.settings());
        Drawer.open({
            title: 'ตั้งค่าเครื่องคีออสก์',
            width: CFApp.DRAWER_W,
            contentHtml: this.kioskSettingsHtml(),
            footerHtml: `
                <button class="btn btn-outline" onclick="Drawer.close()">ยกเลิก</button>
                <button class="btn btn-primary" onclick="DashPage.saveKioskSettings()">
                    <i data-lucide="save" class="icon-sm"></i> บันทึก
                </button>`,
            onOpen: () => { refreshIcons(); CFApp.applyRoleGate(); },
        });
    },

    /**
     * จัดใหม่ 21/10/2569 (ผู้ใช้: "หน้าตั้งค่าคีออส ลายตามาก") — การ์ดแบบหน้าตั้งค่ามือถือ
     * ชื่อ + คำอธิบายสั้นซ้าย · ปุ่ม/ช่องขวา · เวลาเป็นแถวเล็ก 2 คอลัมน์ · id ทุกตัวเหมือนเดิม (save อ่านจาก kn-/kt-)
     * สวิตช์และปุ่มแคปซูลเป็น "ปุ่มกล่อง" แยกทีละตัว (.cf-boxsel — ผู้ใช้ขอ 21/10/2569) · เปิด/ปิด = กล่อง 2 ใบ
     */
    kioskSettingsHtml() {
        const d = this._kd;
        const row = (title, desc, ctl, stack) => `
            <div class="cf-set-row ${stack ? 'is-stack' : ''}">
                <div class="cf-set-text"><div class="cf-set-title">${title}</div>${desc ? `<div class="cf-set-desc">${desc}</div>` : ''}</div>
                <div class="cf-set-ctl">${ctl}</div>
            </div>`;
        const tg = (key, title, desc) => row(title, desc, `
            <div class="cf-boxsel" id="kt-${key}" role="group" aria-label="${title}">
                <button type="button" class="ds-seg ${d[key] !== false ? 'active' : ''}" onclick="DashPage.kSet('${key}', true)">เปิด</button>
                <button type="button" class="ds-seg ${d[key] === false ? 'active' : ''}" onclick="DashPage.kSet('${key}', false)">ปิด</button>
            </div>`);
        const num = (key, title) => `
            <label class="cf-set-row cf-set-num">
                <span class="cf-set-title">${title}</span>
                <span class="cf-sec"><input class="sip-input" id="kn-${key}" type="number" min="5" step="5" value="${d[key]}"> วิ</span>
            </label>`;
        const seg = (id, items) => `<div class="cf-boxsel" id="${id}">${items.join('')}</div>`;

        return `
            <div class="cf-set-card">
                <div class="cf-set-head">จอ</div>
                ${row('แนวการติดตั้ง', 'ส่วนใหญ่ติดแนวตั้ง · แนวนอนเหมาะกับจอบนเคาน์เตอร์', seg('kOri', [
                    `<button type="button" class="ds-seg ${d.kioskOrientation !== 'LANDSCAPE' ? 'active' : ''}"
                            onclick="DashPage.kOri('PORTRAIT')">แนวตั้ง 9:16</button>`,
                    `<button type="button" class="ds-seg ${d.kioskOrientation === 'LANDSCAPE' ? 'active' : ''}"
                            onclick="DashPage.kOri('LANDSCAPE')">แนวนอน 16:9</button>`]))}
                ${row('ขนาดจอ', 'จอเล็กตัวอักษรใหญ่ขึ้น ให้กดและอ่านสบายจากระยะยืน', seg('kSize',
                    CF_KIOSK_SIZES.map((z) => `<button type="button"
                        class="ds-seg ${Math.abs((d.kioskScale || 1) - z.scale) < 0.02 ? 'active' : ''}"
                        onclick="DashPage.kScale(${z.scale})">${z.in}</button>`)))}
                ${tg('kioskFrame', 'กรอบจำลองบนจอคอมพิวเตอร์', 'ปิดเมื่อใช้กับจอคีออสก์จริงที่หมุนแนวตั้งแล้ว')}
            </div>

            <div class="cf-set-card">
                <div class="cf-set-head">ลูกค้า</div>
                ${row('รูปแบบการรับสินค้า', 'เลือกแบบเดียว = คีออสก์ข้ามหน้าคำถาม ไปที่เมนูเลย', seg('kDine',
                    CF_DINING_MODES.map((m) => `<button type="button"
                        class="ds-seg ${CF_DINING_MODE(d) === m.v ? 'active' : ''}"
                        onclick="DashPage.kDine('${m.v}')">${m.label}</button>`)))}
                ${tg('kioskUpsell', 'แนะนำเมนูเพิ่มก่อนชำระเงิน', 'ขึ้นครั้งเดียวต่อออเดอร์')}
                ${tg('kioskImages', 'แสดงรูปภาพสินค้า')}
                ${row('QR รับเงิน', 'พร้อมเพย์ / QR ร้านค้า ตั้งที่ข้อมูลร้าน',
                    `<button type="button" class="btn btn-outline btn-sm"
                        onclick="Drawer.close();setTimeout(()=>DashPage.openShop(),200)">ไปที่ข้อมูลร้าน <i data-lucide="chevron-right" class="icon-sm"></i></button>`)}
            </div>

            <div class="cf-set-card">
                <div class="cf-set-head">เวลาแต่ละหน้า
                    <small>ไม่มีใครแตะจอจนหมดเวลา → ถาม "ยังสั่งอยู่ไหม?" แล้วกลับหน้าแรก</small></div>
                <div class="cf-set-grid">
                    ${num('kioskSecDining', 'กินที่ร้าน/กลับบ้าน')}
                    ${num('kioskSecMenu', 'เลือกเมนู')}
                    ${num('kioskSecItem', 'ตัวเลือกสินค้า')}
                    ${num('kioskSecCart', 'ตะกร้า')}
                    ${num('kioskSecUpsell', 'เมนูแนะนำเพิ่ม')}
                    ${num('kioskSecPay', 'เลือกวิธีชำระ')}
                    ${num('kioskSecQrExpired', 'หน้า QR หมดเวลา')}
                    ${num('kioskWarnSec', 'เตือนก่อนหมด')}
                </div>
            </div>

            <div class="cf-set-card">
                <div class="cf-set-head">เวลาตอนจ่ายเงิน
                    <small>ไม่ถามว่ายังอยู่ไหม — QR หมดเวลาไปหน้า "โอนแล้วหรือยัง?" · สลิปส่งพนักงานตรวจ</small></div>
                <div class="cf-set-grid">
                    ${num('qrTimeoutSec', 'สแกน QR จ่ายเงิน')}
                    ${num('kioskSlipScanSec', 'สแกนสลิป')}
                    ${num('kioskDoneSec', 'หน้าบัตรคิว')}
                </div>
            </div>

            <div class="ds-note">บันทึกแล้วคีออสก์ที่เปิดอยู่ปรับตามเองในไม่กี่วินาที ไม่ต้องรีเฟรช</div>`;
    },

    kSet(key, on) {
        this._kd[key] = on;
        document.querySelectorAll('#kt-' + key + ' .ds-seg').forEach((b, i) => b.classList.toggle('active', (i === 0) === on));
    },
    kOri(v) {
        this._kd.kioskOrientation = v;
        document.querySelectorAll('#kOri .ds-seg').forEach((b, i) => {
            b.classList.toggle('active', ['PORTRAIT', 'LANDSCAPE'][i] === v);
        });
    },
    kScale(v) {
        this._kd.kioskScale = v;
        document.querySelectorAll('#kSize .ds-seg').forEach((b, i) => {
            b.classList.toggle('active', Math.abs(CF_KIOSK_SIZES[i].scale - v) < 0.02);
        });
    },
    kDine(v) {
        this._kd.kioskDiningMode = v;
        delete this._kd.kioskDiningStep;    // คีย์รุ่นก่อน ปล่อยค้างไว้จะขัดกับค่าใหม่
        document.querySelectorAll('#kDine .ds-seg').forEach((b, i) => {
            b.classList.toggle('active', CF_DINING_MODES[i].v === v);
        });
    },

    /**
     * อ่านเลขพร้อมเพย์จากภาพ QR "รับเงิน" ในแอปธนาคาร (ในเครื่อง ไม่ส่งภาพออกไปไหน) → เติมลงช่องพร้อมเพย์
     * เลิกโหมด "ใช้ QR ที่อัปโหลดที่คีออสก์" แล้ว (ผู้ใช้สั่ง 21/10/2569) — คีออสก์ใช้พร้อมเพย์อย่างเดียว
     */
    readPromptpayQr(file) {
        if (!file) return;
        const out = document.getElementById('kQrResult');
        const say = (cls, icon, text) => {
            out.innerHTML = `<div class="cf-qr-msg ${cls}"><i data-lucide="${icon}" class="icon-sm"></i> ${text}</div>`;
            refreshIcons();
        };
        if (typeof jsQR !== 'function') { say('bad', 'alert-circle', 'ตัวอ่าน QR ไม่พร้อม — รีเฟรชหน้าแล้วลองใหม่'); return; }
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            // ภาพหน้าจอมือถือใหญ่มาก — ย่อก่อนอ่าน · ไม่เจอลองขนาดเต็มอีกรอบ (QR เล็กในภาพใหญ่)
            const scan = (max) => {
                const s = Math.min(1, max / Math.max(img.width, img.height));
                const c = document.createElement('canvas');
                c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
                const ctx = c.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(img, 0, 0, c.width, c.height);
                const d = ctx.getImageData(0, 0, c.width, c.height);
                const code = jsQR(d.data, d.width, d.height, { inversionAttempts: 'attemptBoth' });
                return code && code.data;
            };
            const data = scan(1200) || scan(2400);
            if (!data) { say('bad', 'scan-line', 'อ่าน QR ในภาพไม่ได้ — ใช้ภาพหน้าจอที่เห็น QR ชัด ๆ เต็มกรอบ'); return; }
            const k = CFEmv.classify(data);
            if (k.kind !== 'promptpay') {
                say('bad', 'alert-circle', k.kind === 'billpay'
                    ? 'QR นี้เป็น QR ร้านค้าของธนาคาร ไม่มีเลขพร้อมเพย์ — ใส่เบอร์โทรหรือเลขบัตรที่ผูกพร้อมเพย์เอง'
                    : CFApp.esc(k.reason || 'QR นี้ไม่ใช่พร้อมเพย์'));
                return;
            }
            document.getElementById('kPromptpay').value = k.id;
            say('ok', 'check-circle', `พบพร้อมเพย์ <b>${CFApp.esc(k.id)}</b>${k.name ? ' (' + CFApp.esc(k.name) + ')' : ''} — ใส่ในช่องให้แล้ว กดบันทึกเพื่อใช้`);
        };
        img.onerror = () => { URL.revokeObjectURL(url); say('bad', 'alert-circle', 'เปิดไฟล์ภาพไม่ได้'); };
        img.src = url;
    },

    saveKioskSettings() {
        const d = this._kd;
        ['kioskIdleSec', 'kioskDoneSec', 'qrTimeoutSec', 'kioskSecDining', 'kioskSecMenu', 'kioskSecItem', 'kioskSecCart',
         'kioskSecUpsell', 'kioskSecPay', 'kioskSecQrExpired', 'kioskWarnSec', 'kioskSlipScanSec'].forEach((k) => {
            const el = document.getElementById('kn-' + k);
            if (el) { const n = parseInt(el.value, 10); if (!isNaN(n) && n > 0) d[k] = n; }
        });
        // ฐานข้อมูลที่เปิดค้างมาจากรุ่นก่อนอาจมี kioskDiningStep อยู่ — ลบทิ้งทั้งสองที่
        // ไม่งั้นค่าเก่ายังนั่งอยู่ในฐานข้อมูลและไปโผล่ในตัวแปลงค่าเวลาคีย์ใหม่หาย
        d.kioskDiningMode = CF_DINING_MODE(d);
        delete d.kioskDiningStep;

        // ส่งเฉพาะคีย์ของคีออสก์ ไม่เหวี่ยง settings ทั้งก้อนกลับไป
        // ไม่งั้นค่าที่คนอื่นเพิ่งแก้จากอีกเครื่องจะถูกทับด้วยค่าเก่าที่เราโหลดมาตอนเปิด drawer
        const keys = Object.keys(CF_KIOSK_DEFAULTS)
            .concat(['kioskDiningMode', 'qrTimeoutSec']);      // ช่องทางรับเงินอยู่ที่ข้อมูลร้าน (saveShop)
        const patch = {};
        keys.forEach((k) => { if (d[k] !== undefined) patch[k] = d[k]; });
        CFStore.cmd('patch', '/api/settings', patch)
            .then(() => {
                Drawer.close();
                showToast('บันทึกการตั้งค่าคีออสก์แล้ว', 'success');
            })
            .catch((err) => showToast(err.message || 'บันทึกไม่สำเร็จ', 'error', 4000));
    },

    /* ══════════════════════════════════════════════════════
       DRAWER — ผู้ใช้และสิทธิ์ (§29)
       ══════════════════════════════════════════════════════ */
    openUsers() {
        const e = CFApp.esc;
        const keys = [
            ['MENU_EDIT', 'เมนู'], ['PRICE_EDIT', 'ราคา'], ['PAY_RECEIVE', 'รับชำระ'],
            ['PAY_OVERRIDE', 'ยืนยันแทน'], ['KITCHEN', 'ครัว'], ['REPORT', 'รายงาน'],
            ['SHIFT_CLOSE', 'ปิดรอบ'], ['USER_MANAGE', 'ผู้ใช้'],
        ];
        const mark = (v) => v === true ? '<span class="cf-perm-yes" title="ได้">✓</span>'
                          : v === 'LIMITED' ? '<span class="sip-chip sip-chip-amber">จำกัด</span>'
                          : '<span class="cf-perm-no">—</span>';

        const weak = new Set((this._weak || []).map((w) => w.id));
        // เพดานยืนยันแทนมีผลเฉพาะแคชเชียร์ (CFPerms.overrideLimitFor) — บทบาทอื่นไม่ต้องโชว์ตัวเลข
        const limitText = (u) => u.role === 'ADMIN' || u.role === 'MANAGER' ? 'ไม่จำกัด'
            : u.role !== 'CASHIER' ? '—'
            : u.overrideLimit == null ? 'ตามค่าร้าน' : CFApp.baht(u.overrideLimit);
        // ใช้งานอยู่ขึ้นก่อน · ปิดใช้งานไว้ท้าย (ลบจริงไม่ได้ — ประวัติขายยังอ้างอยู่) · จัดใหม่ 21/10/2569: ตาราง DataTables
        const list = CFStore.all('users').slice().sort((a, b) => (b.active - a.active) || a.username.localeCompare(b.username));
        const users = list.map((u) => `<tr>
                <td><div class="td-name">${e(u.name)}</div><div class="td-sub">${e(u.username)}</div></td>
                <td><span class="sip-chip sip-chip-muted">${e(CF_ROLE_LABEL[u.role])}</span></td>
                <td>${limitText(u)}</td>
                <td class="cf-center">${!u.active ? '<span class="status-badge inactive">ปิดใช้งาน</span>'
                    : weak.has(u.id) ? '<span class="status-badge danger" title="ยังใช้รหัสผ่านตั้งต้น — ควรตั้งใหม่">รหัสตั้งต้น</span>'
                    : '<span class="status-badge active">ใช้งาน</span>'}</td>
                <td class="cf-nowrap cf-right">
                    <button class="ds-icon-btn edit" title="แก้ไข" onclick="DashPage.editUser('${e(u.id)}')"><i data-lucide="pencil"></i></button>
                    ${u.active ? `<button class="ds-icon-btn edit" title="ตั้งรหัสผ่านใหม่" onclick="DashPage.resetPassword('${e(u.id)}')"><i data-lucide="key-round"></i></button>` : ''}
                </td>
            </tr>`).join('');

        const matrix = Object.keys(CF_PERMS).map((role) => `<tr>
                <td>${e(CF_ROLE_LABEL[role])}</td>
                ${keys.map(([k]) => `<td>${mark(CF_PERMS[role][k])}</td>`).join('')}
            </tr>`).join('');

        Drawer.open({
            title: 'ผู้ใช้และสิทธิ์',
            width: CFApp.DRAWER_W,
            contentHtml: CFApp.card('บัญชีผู้ใช้', `
                    <table class="data-table compact" id="usersTable">
                        <thead><tr><th>ชื่อ</th><th>บทบาท</th><th>เพดานยืนยันแทน</th><th class="cf-center">สถานะ</th><th class="no-sort"></th></tr></thead>
                        <tbody>${users}</tbody>
                    </table>`, { flush: true, hint: 'ลบบัญชีไม่ได้ (ประวัติขายอ้างอยู่) — ปิดใช้งานแทน' }) +
                CFApp.card('สิทธิ์ตามบทบาท', `
                    <div class="table-responsive"><table class="cf-perm">
                        <thead><tr><th>บทบาท</th>${keys.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead>
                        <tbody>${matrix}</tbody>
                    </table></div>`, { flush: true }),
            // เดิมมีคำเตือน "บังคับใช้ที่หน้าจอเท่านั้น" — ไม่จริง เซิร์ฟเวอร์ตรวจสิทธิ์ทุกคำขอ (requirePerm) · ลบ 21/10/2569
            footerHtml: `
                <button class="btn btn-outline" onclick="Drawer.close()">ปิด</button>
                <button class="btn btn-primary" onclick="DashPage.editUser(null)">
                    <i data-lucide="user-plus" class="icon-sm"></i> เพิ่มผู้ใช้</button>`,
            onOpen: () => { CFTable.mount('usersTable'); refreshIcons(); },
        });
    },

    /**
     * เพิ่ม / แก้ไขผู้ใช้ (แอดมิน) — id = null คือเพิ่มใหม่
     * ชื่อผู้ใช้ตั้งแล้วแก้ไม่ได้ (ใช้ล็อกอิน + อยู่ในประวัติ) · ลบไม่ได้ ปิดใช้งานแทน
     * กันพลาดที่เซิร์ฟเวอร์: แอดมินคนสุดท้าย · ลดสิทธิ์/ปิดบัญชีตัวเอง
     * สถานะเก็บใน _ud (เดิมอ่านช่องติ๊กจาก DOM) — กล่อง เปิด|ปิด แบบเดียวกับทุกฟอร์ม
     */
    editUser(id) {
        const e = CFApp.esc;
        const u = id ? CFStore.byId('users', id) : null;
        if (id && !u) return;
        const me = CFAuth.session() && CFAuth.session().userId;
        const self = u && u.id === me;
        const role = u ? u.role : 'CASHIER';
        this._ud = { active: u ? !!u.active : true, self: !!self };
        const roleOpts = Object.keys(CF_PERMS).map((r) =>
            `<option value="${r}" ${r === role ? 'selected' : ''}>${e(CF_ROLE_LABEL[r])}</option>`).join('');
        Drawer.open({
            title: u ? 'แก้ไขผู้ใช้ — ' + e(u.name) : 'เพิ่มผู้ใช้',
            width: CFApp.DRAWER_W,
            contentHtml: CFApp.card('บัญชี', `
                <div class="form-row">
                    <div class="sip-field">
                        <label class="sip-label">ชื่อผู้ใช้ (ใช้ล็อกอิน)</label>
                        ${u ? `<input class="sip-input" value="${e(u.username)}" disabled>
                               <div class="ds-note">ตั้งแล้วเปลี่ยนไม่ได้</div>`
                            : `<input class="sip-input" id="ufUser" autocomplete="off" placeholder="เช่น somchai"
                                      oninput="this.value=this.value.toLowerCase()">
                               <div class="ds-note">3–30 ตัว · a-z 0-9 . _ -</div>`}
                    </div>
                    <div class="sip-field">
                        <label class="sip-label">ชื่อที่แสดง</label>
                        <input class="sip-input" id="ufName" value="${u ? e(u.name) : ''}" placeholder="เช่น สมชาย ใจดี">
                    </div>
                </div>`) +
                CFApp.card('บทบาท', `
                <div class="form-row">
                    <div class="sip-field">
                        <label class="sip-label">บทบาท</label>
                        <select class="sip-select" id="ufRole" ${self ? 'disabled' : ''}
                                onchange="document.getElementById('ufLimitBox').hidden = this.value !== 'CASHIER'">${roleOpts}</select>
                        ${self ? '<div class="ds-note">เปลี่ยนบทบาทของตัวเองไม่ได้ — ให้แอดมินอีกคนทำ</div>' : ''}
                    </div>
                    <div class="sip-field" id="ufLimitBox" ${role === 'CASHIER' ? '' : 'hidden'}>
                        <label class="sip-label">เพดานยืนยันแทน (บาท)</label>
                        <input class="sip-input" id="ufLimit" type="number" min="0" step="1"
                               value="${u && u.overrideLimit != null ? e(u.overrideLimit) : ''}" placeholder="ว่าง = ใช้ค่าตั้งของร้าน">
                        <div class="ds-note">ยอดสูงสุดที่แคชเชียร์คนนี้กดยืนยันการชำระแทนระบบได้</div>
                    </div>
                </div>`, { hint: 'แต่ละบทบาททำอะไรได้ ดูที่ "สิทธิ์ตามบทบาท" หน้าก่อน' }) +
                (u ? CFApp.card('สถานะบัญชี', `
                <div class="cf-set-row">
                    <div class="cf-set-text"><div class="cf-set-title">ใช้งานบัญชีนี้</div>
                        <div class="cf-set-desc">${self ? 'ปิดบัญชีของตัวเองไม่ได้' : 'ปิด = เข้าระบบไม่ได้ทันที ประวัติยังอยู่ครบ'}</div></div>
                    <div class="cf-set-ctl">${CFApp.onOff('ufActive', this._ud.active, "DashPage.uSet('active', $)", { disabled: self })}</div>
                </div>`, { flush: true }) : CFApp.card('รหัสผ่านเริ่มต้น', `
                <div class="form-row">
                    <div class="sip-field">
                        <label class="sip-label">รหัสผ่าน (อย่างน้อย 6 ตัว)</label>
                        <input class="sip-input" id="ufPw" type="password" autocomplete="new-password">
                    </div>
                    <div class="sip-field">
                        <label class="sip-label">พิมพ์อีกครั้ง</label>
                        <input class="sip-input" id="ufPw2" type="password" autocomplete="new-password">
                    </div>
                </div>`)) +
                '<div class="ds-note">เปลี่ยนบทบาทหรือปิดใช้งาน → คนนั้นถูกออกจากระบบทุกเครื่องทันที</div>',
            footerHtml: `
                <button class="btn btn-outline" onclick="DashPage.openUsers()">กลับ</button>
                <button class="btn btn-primary" id="ufSave" onclick="DashPage.saveUser(${u ? `'${e(u.id)}'` : 'null'})">
                    <i data-lucide="save" class="icon-sm"></i> บันทึก</button>`,
            onOpen: () => { refreshIcons(); setTimeout(() => document.getElementById(u ? 'ufName' : 'ufUser')?.focus(), 50); },
        });
    },
    uSet(k, v) {
        if (this._ud.self && k === 'active') return;
        this._ud[k] = v;
        CFApp.markBox('uf' + k[0].toUpperCase() + k.slice(1), v);
    },

    async saveUser(id) {
        const v = (x) => { const el = document.getElementById(x); return el ? el.value : undefined; };
        const body = { name: v('ufName'), role: v('ufRole'), overrideLimit: v('ufLimit') };
        if (id) {
            if (!this._ud.self) body.active = this._ud.active;
        } else {
            body.username = v('ufUser');
            body.password = v('ufPw');
            if (body.password !== v('ufPw2')) { showToast('รหัสผ่านสองช่องไม่ตรงกัน', 'error'); return; }
        }
        const btn = document.getElementById('ufSave');
        btn.disabled = true;
        try {
            const res = id ? await CFStore.cmd('patch', '/api/users/' + encodeURIComponent(id), body)
                           : await CFStore.cmd('post', '/api/users', body);
            showToast(id ? 'บันทึกแล้ว' + (res && res.kicked ? ' — คนนั้นถูกออกจากระบบ ต้องเข้าใหม่' : '')
                         : 'เพิ่มผู้ใช้ ' + body.username + ' แล้ว', 'success', 4000);
            await this.loadWeak();
            this.openUsers();
        } catch (err) {
            showToast(err.message || 'บันทึกไม่สำเร็จ', 'error', 5000);
            btn.disabled = false;
        }
    },

    /* ══════════════════════════════════════════════════════
       รหัสผ่านของพนักงาน (แอดมิน)
       ══════════════════════════════════════════════════════ */
    /** สำรองข้อมูลล่าสุดนานเกิน 2 วัน / ยังไม่เคย → แถบเตือน (ฮาร์ดดิสก์เสีย = ยอดขายหายหมด) */
    async loadBackup() {
        if (!CFAuth.can('SHIFT_CLOSE')) return;
        try { this._backup = await CFApi.get('/api/backup/status'); } catch { this._backup = null; }
        this.render();
    },
    async loadWeak() {
        if (!CFAuth.can('USER_MANAGE')) return;
        try {
            this._weak = (await CFApi.get('/api/users/weak-passwords')).users || [];
        } catch (err) { this._weak = []; }
        // ไม่เตือน (ผู้ใช้เลือก 16/10/2569) — ใช้แค่ป้าย "รหัสตั้งต้น" ในรายชื่อผู้ใช้
    },

    resetPassword(id) {
        const u = CFStore.byId('users', id);
        if (!u) return;
        const e = CFApp.esc;
        Drawer.open({
            title: 'ตั้งรหัสผ่านใหม่ — ' + e(u.name),
            width: CFApp.DRAWER_W,
            contentHtml: CFApp.card('รหัสผ่านใหม่', `
                <div class="form-row">
                    <div class="sip-field">
                        <label class="sip-label">รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)</label>
                        <input class="sip-input" id="rpNew" type="password" autocomplete="new-password">
                    </div>
                    <div class="sip-field">
                        <label class="sip-label">พิมพ์อีกครั้ง</label>
                        <input class="sip-input" id="rpNew2" type="password" autocomplete="new-password">
                    </div>
                </div>`, { hint: `บัญชี ${e(u.username)} จะถูกออกจากระบบทุกเครื่อง แล้วต้องเข้าใหม่ด้วยรหัสนี้` }),
            footerHtml: `
                <button class="btn btn-outline" onclick="DashPage.openUsers()">กลับ</button>
                <button class="btn btn-primary" onclick="DashPage.saveResetPassword('${e(id)}')">
                    <i data-lucide="save" class="icon-sm"></i> บันทึก</button>`,
            onOpen: () => { refreshIcons(); setTimeout(() => document.getElementById('rpNew')?.focus(), 50); },
        });
    },

    async saveResetPassword(id) {
        const a = document.getElementById('rpNew').value;
        if (a !== document.getElementById('rpNew2').value) { showToast('รหัสผ่านสองช่องไม่ตรงกัน', 'error'); return; }
        try {
            await CFApi.post('/api/users/' + encodeURIComponent(id) + '/password', { next: a });
            showToast('ตั้งรหัสผ่านใหม่แล้ว', 'success');
            await this.loadWeak();
            this.openUsers();
        } catch (err) {
            showToast(err.message || 'ตั้งรหัสผ่านไม่สำเร็จ', 'error', 4000);
        }
    },

    /* ══════════════════════════════════════════════════════
       ตั้งค่าเมนู — แสดง/ซ่อน · จัดลำดับ (แอดมินคนเดียว · ผู้ใช้ขอ 21/10/2569)
       ความแม่นการตรวจสลิปย้ายไปหน้ารายงานแล้ว (reports.html#slips) — ลิงก์เก่า ?slip=1 ส่งไปที่นั่น
       ══════════════════════════════════════════════════════ */
    openMenuSettings() {
        if (CFAuth.getRole() !== 'ADMIN') { showToast('ตั้งค่าเมนูได้เฉพาะผู้ดูแลระบบ', 'error'); return; }
        // draft แยกจากค่าที่บันทึก — กดยกเลิกแล้วไม่มีอะไรเปลี่ยน
        this._md = {};
        Object.keys(CFMenuLayout.LISTS).forEach((l) => {
            this._md[l] = CFMenuLayout.resolve(l).map(({ key, hidden }) => ({ key, hidden }));
        });
        Drawer.open({
            title: 'ตั้งค่าเมนู',
            width: CFApp.DRAWER_W,
            contentHtml: '<div id="mdHost"></div>',
            footerHtml: `
                <button class="btn btn-outline" onclick="Drawer.close()">ยกเลิก</button>
                <button class="btn btn-primary" onclick="DashPage.saveMenuSettings()">
                    <i data-lucide="save" class="icon-sm"></i> บันทึก</button>`,
            onOpen: () => this.renderMenuSettings(),
        });
    },

    renderMenuSettings() {
        const host = document.getElementById('mdHost');
        if (!host) return;
        const e = CFApp.esc;
        const list = (l) => {
            const rows = CFMenuLayout.resolve(l, this._md[l]);
            return `<div class="cf-mlist">${rows.map((o) => `
                <div class="cf-mrow ${o.hidden ? 'is-off' : ''}" data-sort-id="${e(o.key)}"
                     onpointerdown="CFApp.dragSort(event, (ids) => DashPage.mdOrder('${l}', ids))">
                    <span class="cf-grip" title="กดค้างแล้วลากเพื่อเรียงลำดับ"><i data-lucide="grip-vertical"></i></span>
                    <div class="cf-mrow-main"><div class="cf-mrow-title">${e(o.label)}</div></div>
                    ${CFApp.onOff('md-' + l + '-' + o.key, !o.hidden, `DashPage.mdShow('${l}', '${e(o.key)}', $)`, { labels: ['แสดง', 'ซ่อน'] })}
                </div>`).join('')}
            </div>`;
        };
        host.innerHTML =
            CFApp.card('แถบเมนูบน', list('nav'), { hint: 'กดค้างแล้วลากเพื่อเรียงลำดับ · เมนู ⚙ และชื่อบัญชีอยู่ขวาเสมอ ซ่อนไม่ได้' }) +
            CFApp.card('เมนูในกลุ่ม "หน้าร้าน"', list('ops')) +
            CFApp.card('รายงาน', list('reports'), { hint: 'ลำดับและรายงานที่แสดงในแถบซ้ายของหน้ารายงาน' }) +
            '<div class="ds-note">ซ่อนแค่ในเมนู — คนที่มีสิทธิ์ยังเปิดหน้าตรงได้ · มีผลกับทุกเครื่องทันทีที่บันทึก</div>';
        refreshIcons();
    },
    mdShow(l, key, on) {
        const o = this._md[l].find((x) => x.key === key);
        if (o) o.hidden = !on;
        this.renderMenuSettings();
    },
    mdOrder(l, ids) {
        const byKey = Object.fromEntries(this._md[l].map((o) => [o.key, o]));
        this._md[l] = ids.map((k) => byKey[k]).filter(Boolean);
        this.renderMenuSettings();
    },
    async saveMenuSettings() {
        // หน้าภาพรวมต้องเปิดได้เสมอ — ซ่อนทุกอย่างแล้วแอดมินจะหาทางกลับไม่เจอ
        if (!this._md.nav.some((o) => !o.hidden)) { showToast('ต้องแสดงเมนูบนอย่างน้อย 1 รายการ', 'error'); return; }
        if (!this._md.reports.some((o) => !o.hidden)) { showToast('ต้องแสดงรายงานอย่างน้อย 1 รายการ', 'error'); return; }
        try {
            await CFStore.cmd('patch', '/api/settings', { menuLayout: this._md });
            Drawer.close();
            showToast('บันทึกการตั้งค่าเมนูแล้ว', 'success');
        } catch (err) {
            showToast(err.message || 'บันทึกไม่สำเร็จ', 'error', 4000);
        }
    },

    /* ══════════════════════════════════════════════════════
       ข้อมูลร้าน — พิมพ์บนใบเสร็จและจอคิวลูกค้า
       ══════════════════════════════════════════════════════ */
    openShop() {
        const s = CFStore.settings();
        const e = CFApp.esc;
        const field = (id, label, value, extra) => `
            <div class="sip-field">
                <label class="sip-label">${label}</label>
                <input class="sip-input" id="${id}" value="${e(value || '')}" ${extra || ''}>
            </div>`;
        Drawer.open({
            title: 'ข้อมูลร้าน',
            width: CFApp.DRAWER_W,
            onOpen: () => refreshIcons(),
            // จัดใหม่ 21/10/2569: การ์ดแบบเดียวกับทุกฟอร์ม · ช่องสั้นจับคู่กัน · คำอธิบายเป็น .ds-note ใต้ช่อง
            contentHtml: CFApp.card('ร้านและใบเสร็จ', `
                ${field('shName', 'ชื่อร้าน', s.shopName)}
                <div class="form-row">
                    ${field('shPhone', 'เบอร์โทรร้าน', s.shopPhone, 'inputmode="tel" placeholder="076-123-456 (ไม่มีเว้นว่าง)"')}
                    ${field('shTax', 'เลขผู้เสียภาษี (13 หลัก)', s.taxId, 'inputmode="numeric" placeholder="ไม่มีเว้นว่าง"')}
                </div>
                <div class="form-row">
                    <div class="sip-field">
                        <label class="sip-label">ที่อยู่</label>
                        <textarea class="sip-textarea" id="shAddr" rows="3">${e(s.address || '')}</textarea>
                    </div>
                    <div class="sip-field">
                        <label class="sip-label">ข้อความท้ายใบเสร็จ (≤ 4 บรรทัด)</label>
                        <textarea class="sip-textarea" id="shFooter" rows="3" maxlength="200"
                                  placeholder="Wi-Fi: CafeFlow รหัส 12345678&#10;LINE @cafeflow">${e(s.receiptFooter || '')}</textarea>
                    </div>
                </div>`, { hint: 'ชื่อร้าน เบอร์โทร ที่อยู่ และเลขผู้เสียภาษีพิมพ์บนหัวใบเสร็จ' }) +
                CFApp.card('วันทำการ', `
                <div class="sip-field">
                    <label class="sip-label">เริ่มนับเลขออเดอร์ใหม่ (A001) ทุกวัน เวลา</label>
                    <select class="sip-select cf-w-260" id="shDayStart">
                        ${Array.from({ length: 13 }, (_, h) => `<option value="${h}" ${CFDay.startHourOf(s) === h ? 'selected' : ''}>
                            ${String(h).padStart(2, '0')}:00 น.${h === CF_DAY_START_DEFAULT ? ' (ค่าเริ่มต้น)' : ''}</option>`).join('')}
                    </select>
                    <div class="ds-note">ออเดอร์ก่อนเวลานี้นับเป็นยอดของเมื่อวาน (ร้านปิดหลังเที่ยงคืนได้) · มีผลตั้งแต่ออเดอร์ถัดไป</div>
                </div>`) +
                // คีออสก์ใช้พร้อมเพย์อย่างเดียว — เลิกโหมด QR ที่อัปโหลดจากธนาคาร (ผู้ใช้สั่ง 21/10/2569)
                CFApp.card('การรับเงิน', `
                <div class="sip-field">
                    <label class="sip-label">พร้อมเพย์ของร้าน</label>
                    <input class="sip-input" id="kPromptpay" inputmode="numeric"
                           placeholder="เช่น 0812345678" value="${e(s.promptpayId || '')}">
                    <div class="ds-note">เบอร์โทร 10 หลัก · เลขบัตร 13 หลัก · e-wallet 15 หลัก —
                        <b>ตรวจให้ดี ผิดหนึ่งตัวเงินลูกค้าเข้าบัญชีคนอื่น</b></div>
                    <button type="button" class="cf-linkbtn" onclick="document.getElementById('kQrFile').click()">
                        ไม่รู้เลข? อ่านจากภาพ QR "รับเงิน" ในแอปธนาคาร</button>
                    <div id="kQrResult" class="cf-qr-result"></div>
                </div>
                <input type="file" id="kQrFile" accept="image/*" hidden onchange="DashPage.readPromptpayQr(this.files[0]); this.value=''">`,
                { hint: 'คีออสก์สร้าง QR พร้อมเพย์ใส่ยอดของแต่ละบิลให้ลูกค้าสแกนจ่าย' }) +
                CFApp.card('ตรวจสลิป', `
                <div class="form-row">
                    ${field('shAccName', 'ชื่อบัญชีผู้รับเงิน (ตามสลิป)', s.shopAccountName, 'placeholder="ชื่อร้าน หรือชื่อเจ้าของบัญชี"')}
                    ${field('shAccNos', 'เลขบัญชีธนาคารที่รับเงิน', s.shopAccountNos, 'inputmode="numeric" placeholder="เต็ม หรือ 4 ตัวท้าย · คั่นด้วยจุลภาค"')}
                </div>
                <div class="ds-note">บางธนาคารพิมพ์เลขบัญชีจริงบนสลิป (เช่น xxx-x-x3118-x) แทนเบอร์พร้อมเพย์ —
                    ใส่เลขนั้น (4 ตัวท้ายก็ได้) ระบบจะรู้ว่าเป็นบัญชีร้าน</div>`,
                { hint: 'สลิปที่ผู้รับไม่ตรงชื่อ/เลขบัญชีนี้จะขึ้นแดง "ไม่ใช่บัญชีร้าน"' }),
            footerHtml: `
                <button class="btn btn-outline" onclick="Drawer.close()">ยกเลิก</button>
                <button class="btn btn-primary" onclick="DashPage.saveShop()">
                    <i data-lucide="save" class="icon-sm"></i> บันทึก</button>`,
        });
    },

    async saveShop() {
        const v = (id) => (document.getElementById(id).value || '').trim();
        const digits = (x) => x.replace(/[^0-9]/g, '');
        const body = { shopName: v('shName'), address: v('shAddr'),
                       taxId: digits(v('shTax')), promptpayId: digits(v('kPromptpay')),
                       shopAccountName: v('shAccName'),
                       shopPhone: v('shPhone'), receiptFooter: v('shFooter'),
                       shopAccountNos: v('shAccNos').split(',').map(digits).filter(Boolean).join(', '),
                       dayStartHour: parseInt(v('shDayStart'), 10) };
        if (!body.shopName) { showToast('ต้องใส่ชื่อร้าน', 'error'); return; }
        if (body.taxId && body.taxId.length !== 13) { showToast('เลขผู้เสียภาษีต้องมี 13 หลัก', 'error'); return; }
        if (body.promptpayId && ![10, 13, 15].includes(body.promptpayId.length)) {
            showToast('พร้อมเพย์ต้องเป็นเบอร์โทร 10 หลัก เลข 13 หลัก หรือ e-wallet 15 หลัก', 'error'); return;
        }
        try {
            await CFStore.cmd('PATCH', '/api/settings', body);
            Drawer.close();
            showToast('บันทึกข้อมูลร้านแล้ว', 'success');
        } catch (err) {
            showToast(err.message || 'บันทึกไม่สำเร็จ', 'error', 4000);
        }
    },

    boot() {
        CFApp.boot({ page: 'dashboard' });
        this.loadWeak();
        this.loadBackup();
        this.render();
        CFStore.subscribe(() => this.render());

        // เปิด sub-view จาก query param ของเมนูตั้งค่า
        const q = new URLSearchParams(location.search);
        if (q.get('devices') === '1') setTimeout(() => this.openDevices(), 250);
        if (q.get('printers') === '1') setTimeout(() => this.openPrinters(), 250);

        if (q.get('users') === '1')   setTimeout(() => this.openUsers(), 250);
        if (q.get('kiosk') === '1')   setTimeout(() => this.openKioskSettings(), 250);
        if (q.get('display') === '1') setTimeout(() => this.openDisplaySettings(), 250);
        if (q.get('shop') === '1')    setTimeout(() => this.openShop(), 250);
        if (q.get('menus') === '1')   setTimeout(() => this.openMenuSettings(), 250);
        if (q.get('slip') === '1')    location.replace('reports.html#slips');       // ลิงก์เก่า — ย้ายไปหน้ารายงานแล้ว
    },
};

window.DashPage = DashPage;
CFBoot.ready(() => DashPage.boot());
