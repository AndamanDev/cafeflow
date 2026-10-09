/** CafeFlow — ภาพรวมผู้จัดการ (§25, §26, §30) */
const DashPage = {

    state: {},

    /* ══════════════════════════════════════════════════════
       RENDER — idempotent, ไม่อ่านค่าจาก DOM
       ══════════════════════════════════════════════════════ */
    render() {
        const e = CFApp.esc;
        const k = CFKpi.summary();

        // ลิ้นชักอุปกรณ์เปิดอยู่ → วาดตารางใหม่ (จับคู่ / heartbeat แล้วสถานะต้องเปลี่ยนเอง ไม่ต้องปิดเปิดใหม่)
        const devRows = document.getElementById('devRows');
        if (devRows) { devRows.innerHTML = this.deviceRows() + this.unknownWaitRows(); refreshIcons(); }
        this.renderDevWaits();
        const shift = CFStore.openShift();

        // ไม่มีรอบเปิด = คีออสก์ไม่รับออเดอร์ — ชี้ทางไปเปิดรอบ
        document.getElementById('shiftLine').innerHTML =
            shift
                ? '<span class="cf-pill cf-pill-on">เปิดขายอยู่</span> ' +
                  e('รอบ ' + shift.id + ' · เปิดเมื่อ ' + CFApp.time(shift.openedAt) + ' · ' + CFApp.dateFull(shift.openedAt))
                : '<span class="cf-pill cf-pill-off">ยังไม่เปิดรอบ</span> คีออสก์ยังไม่รับออเดอร์ · <a href="closing.html">ไปเปิดรอบ</a>';

        /* ── ยอดขาย — ตัวเลขหลักใหญ่ แยกช่องทางชำระเป็นแถบสัดส่วน ── */
        const total = k.cash + k.qr;
        const cashPct = total ? Math.round(k.cash / total * 100) : 0;
        document.getElementById('kpiSales').innerHTML = `
            <div class="cf-sales-hero">
                <div class="cf-sales-label"><i data-lucide="wallet" class="icon-sm"></i> ยอดขายรอบนี้</div>
                <div class="cf-sales-value">${CFApp.baht(k.sales)}</div>
                <div class="cf-sales-sub">
                    <span><b>${CFApp.int(k.orderCount)}</b> ออเดอร์</span>
                    <span>เฉลี่ย <b>${CFApp.baht(k.avgOrder)}</b> / บิล</span>
                </div>
            </div>
            <div class="cf-sales-split">
                <div class="cf-sales-label">ช่องทางชำระ</div>
                <div class="cf-split-row"><span><i data-lucide="banknote" class="icon-sm"></i> เงินสด</span><b>${CFApp.baht(k.cash)}</b></div>
                <div class="cf-split-row"><span><i data-lucide="qr-code" class="icon-sm"></i> QR / โอน</span><b>${CFApp.baht(k.qr)}</b></div>
                <div class="cf-split-bar" title="เงินสด ${cashPct}% · QR ${total ? 100 - cashPct : 0}%">
                    <div class="cf-split-cash" style="width:${cashPct}%"></div>
                    <div class="cf-split-qr" style="width:${total ? 100 - cashPct : 0}%"></div>
                </div>
            </div>`;

        /* ── ตอนนี้ในร้าน — งานค้าง (กดไปหน้าที่จัดการได้) + ความเร็ว ── */
        const tile = (icon, value, label, tone, href) => `
            <a class="cf-op-tile ${tone || ''}" ${href ? `href="${href}"` : ''}>
                <span class="cf-op-ico"><i data-lucide="${icon}"></i></span>
                <span class="cf-op-text"><span class="cf-op-value">${value}</span><span class="cf-op-label">${label}</span></span>
            </a>`;
        const stat = (icon, value, label) => `
            <div class="cf-op-stat"><i data-lucide="${icon}" class="icon-sm"></i>
                <span class="cf-op-label">${label}</span><b>${value}</b></div>`;
        document.getElementById('kpiOps').innerHTML = `
            <div class="cf-op-tiles">
                ${tile('hourglass', CFApp.int(k.waitingPay), 'รอชำระเงิน', k.waitingPay > 4 ? 'danger' : k.waitingPay ? 'warn' : '', 'cashier.html')}
                ${tile('chef-hat', CFApp.int(k.preparing), 'กำลังจัดเตรียม', k.preparing ? 'info' : '', 'kds.html')}
                ${tile('bell-ring', CFApp.int(k.ready), 'พร้อมรับ', k.ready ? 'ok' : '', 'cashier.html')}
            </div>
            <div class="cf-op-stats">
                ${stat('timer', CFKpi.fmtSec(k.avgWaitSec), 'รอชำระเฉลี่ย')}
                ${stat('flame', CFKpi.fmtSec(k.avgPrepSec), 'จัดเตรียมเฉลี่ย')}
                ${stat('trending-up', k.throughput.toFixed(1), 'ออเดอร์ / ชม.')}
            </div>`;

        /* ── ภาระงานสถานี (§25) ── */
        document.getElementById('stationLoad').innerHTML = CFKpi.stationLoad().map((s) => {
            const cls = s.count >= 6 ? 'danger' : s.count >= 3 ? 'warn' : '';
            return `<div class="cf-load-row">
                        <div class="cf-load-name">${e(CFApp.stationLabel(s.station))}</div>
                        <div class="cf-load-track"><div class="cf-load-fill ${cls}" style="width:${s.count ? Math.max(6, s.pct) : 0}%"></div></div>
                        <div class="cf-load-val">${s.count} ใบ</div>
                    </div>`;
        }).join('');

        /* ── สินค้าหมด ── */
        const so = CFKpi.soldOutProducts();
        document.getElementById('soldOut').innerHTML = so.length
            ? '<div class="ds-chips">' + so.map((p) =>
                `<span class="sip-chip sip-chip-danger">${e(p.nameTh)}</span>`).join('') + '</div>' +
              `<div class="ds-note" style="margin-top:10px">แก้ได้ที่หน้า
                 <a href="menu.html">เมนูและสินค้า</a> — ปิดสวิตช์ "สินค้าหมดวันนี้"</div>`
            : '<div class="ds-empty-sm">ไม่มีสินค้าที่ปิดขายวันนี้</div>';

        /* ── กิจกรรมล่าสุด ── */
        const variant = (ev) => ({
            ORDER_CREATED: 'info', PAYMENT_RECEIVED: 'success', PAYMENT_VERIFIED: 'success',
            STATION_READY: 'info', PRINT: 'warning', PAYMENT_OVERRIDE: 'warning',
            PAYMENT_TIMEOUT: 'warning',
        }[ev] || 'info');

        // 10 รายการล่าสุดพอ — ดูย้อนหลังที่หน้าจัดการออเดอร์ › ประวัติ
        document.getElementById('activity').innerHTML = CFStore.all('auditLogs').slice(0, 10).map((a) => {
            const o = a.orderId ? CFStore.byId('orders', a.orderId) : null;
            const isBad = ['CANCELLED', 'VOIDED', 'REFUNDED', 'PAYMENT_FAILED'].includes(a.newStatus);
            const v = isBad ? 'danger' : (a.newStatus === 'READY' ? 'success' : variant(a.eventType));
            const head = a.newStatus
                ? (o ? o.orderNo + ' → ' : '') + CFApp.statusLabel(a.newStatus)
                : (o ? o.orderNo + ' · ' : '') + this.eventLabel(a.eventType);
            return `<div class="cf-act ${v}">
                        <span class="cf-act-dot"></span>
                        <div class="cf-act-body">
                            <div class="cf-act-head">${e(head)}</div>
                            <div class="cf-act-sub">${e(CFApp.actorName(a.actor))}${a.reason ? ' · ' + e(a.reason) : ''}</div>
                        </div>
                        <span class="cf-act-time">${CFApp.time(a.ts)}</span>
                    </div>`;
        }).join('') || '<div class="ds-empty-sm">ยังไม่มีกิจกรรม</div>';

        CFApp.applyRoleGate();
        refreshIcons();
    },

    eventLabel(ev) {
        return {
            ORDER_CREATED: 'สร้างออเดอร์', PAYMENT_RECEIVED: 'รับชำระเงินสด',
            PAYMENT_VERIFIED: 'ยืนยันการชำระ', PAYMENT_OVERRIDE: 'ยืนยันโดยพนักงาน',
            PAYMENT_TIMEOUT: 'หมดเวลาชำระ', STATION_READY: 'สถานีพร้อม',
            PRINT: 'พิมพ์เอกสาร', STATUS_CHANGE: 'เปลี่ยนสถานะ',
            PRODUCT_UPDATE: 'แก้ไขสินค้า', SHIFT_CLOSE: 'ปิดรอบ',
            DEVICE_UPDATE: 'ตั้งค่าอุปกรณ์', QR_ISSUED: 'ออก QR ชำระเงิน', SHIFT_OPEN: 'เปิดรอบ',
            SETTINGS_UPDATE: 'แก้ค่าตั้ง', SLIP_REJECTED: 'ปฏิเสธสลิป', USER_PASSWORD: 'เปลี่ยนรหัสผ่าน',
        }[ev] || ev;
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
                    <div class="td-sub">${e(d.id)} · ${e(d.ip)}</div>
                </td>
                <td>${d.assignedStation ? CFApp.stationChip(d.assignedStation) : '<span class="text-muted">—</span>'}</td>
                <td class="cf-nowrap">${CFApp.time(d.lastSeen)}</td>
                <td>${pairable ? this.pairStateHtml(d) : `<span class="status-badge ${online ? 'active' : 'danger'}">${online ? 'ออนไลน์' : 'ออฟไลน์'}</span>`}</td>
                <td class="cf-nowrap">${pairable ? `
                    <button class="btn btn-outline btn-sm" onclick="DashPage.pairDevice('${d.id}')">
                        <i data-lucide="link" class="icon-sm"></i> จับคู่
                    </button>
                    ${d.type === 'DISPLAY' ? `<button class="btn btn-outline btn-sm" title="ตั้งค่าจอแสดงคิว"
                        onclick="DashPage.openDisplaySettings()"><i data-lucide="settings" class="icon-sm"></i></button>` : ''}
                    <a class="btn btn-outline btn-sm" href="${page}" target="_blank" rel="noopener"
                       title="เปิดหน้า ${page} ในแท็บใหม่">
                        <i data-lucide="external-link" class="icon-sm"></i> เปิดหน้า
                    </a>` : '<span class="text-muted">—</span>'}</td>
            </tr>`;
        }).join('');
    },

    /** เครื่องที่ค้างหน้าขอรหัสแต่เดาไม่ได้ว่าเป็นอุปกรณ์ตัวไหน — ต่อท้ายตารางให้เห็น */
    unknownWaitRows() {
        const e = CFApp.esc;
        return CFStore.all('deviceWaits').filter((w) => !w.deviceId).map((w) => `<tr>
                <td>
                    <div class="td-name">เครื่องที่ยังไม่รู้จัก</div>
                    <div class="td-sub">${e(w.ip)} · เปิดหน้า ${e(w.page)}</div>
                </td>
                <td><span class="text-muted">—</span></td>
                <td class="cf-nowrap">${CFApp.time(w.at)}</td>
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

    /** แถบเตือนบนหน้าภาพรวม — มีเครื่องค้างหน้าขอรหัสอยู่ */
    renderDevWaits() {
        const el = document.getElementById('devWaitBanner');
        if (!el) return;
        const waits = CFAuth.can('MENU_EDIT') ? CFStore.all('deviceWaits') : [];
        if (!waits.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
        const e = CFApp.esc;
        el.style.display = '';
        el.innerHTML = waits.map((w) => {
            const d = w.deviceId && CFStore.byId('devices', w.deviceId);
            const who = d ? `<strong>${e(d.name)}</strong> (${e(d.id)})` : `<strong>เครื่องที่ IP ${e(w.ip)}</strong>`;
            const btn = d
                ? `<button class="btn btn-outline btn-sm" style="margin-left:8px" onclick="DashPage.pairDevice('${d.id}')">ขอรหัสใหม่</button>`
                : `<button class="btn btn-outline btn-sm" style="margin-left:8px" onclick="DashPage.openDevices()">เลือกอุปกรณ์</button>`;
            return `<div class="ds-warn" style="margin-bottom:6px">
                ${who} หลุดการจับคู่ — ${d ? 'เครื่องที่ IP ' + e(w.ip) : 'เปิดหน้า ' + e(w.page)} ค้างหน้าขอรหัสตั้งแต่ ${CFApp.time(w.since)}
                (${w.reason === 'REVOKED' ? 'สิทธิ์ถูกแทนที่หรือถูกยกเลิก' : 'ข้อมูลในเบราว์เซอร์หาย หรือเปิดคนละที่อยู่'})
                ${btn}
            </div>`;
        }).join('');
    },

    openDevices() {
        Drawer.open({
            title: 'อุปกรณ์ในเครือข่าย',
            width: '880px',
            contentHtml: `
                <div class="sip-banner sip-banner-info" style="margin-bottom:12px">
                    <i data-lucide="info" class="icon-sm"></i>
                    อุปกรณ์ส่งสัญญาณทุก 10–30 วินาที · ไม่ได้ยินเกิน 60 วินาทีถือว่าออฟไลน์
                </div>
                <div class="table-responsive">
                    <table class="data-table compact">
                        <thead><tr><th>อุปกรณ์</th><th>สถานี</th><th>ล่าสุด</th><th>สถานะ</th><th></th></tr></thead>
                        <tbody id="devRows">${this.deviceRows()}${this.unknownWaitRows()}</tbody>
                    </table>
                </div>`,
            footerHtml: '<button class="btn btn-outline" onclick="Drawer.close()">ปิด</button>',
            onOpen: () => refreshIcons(),
        });
    },

    /* ══════════════════════════════════════════════════════
       DRAWER — ตั้งค่าจอแสดงคิว (เปิดจากปุ่ม ⚙ ในแถวจอคิวของตารางอุปกรณ์)
       ค่านี้ใช้ร่วมกันทุกจอคิวของร้าน — ไม่ได้แยกต่อเครื่อง
       ══════════════════════════════════════════════════════ */
    openDisplaySettings() {
        this._dd = Object.assign({}, CF_DISPLAY_DEFAULTS, CFStore.settings());
        const d = this._dd;
        const e = CFApp.esc;
        const tg = (key, label, note) => `
            <div class="sip-field">
                <button type="button" class="ds-toggle ${d[key] !== false ? 'is-on' : ''}"
                        id="dt-${key}" onclick="DashPage.dToggle('${key}')">
                    <span class="ds-toggle-track"><span class="ds-toggle-knob"></span></span> ${label}
                </button>
                ${note ? `<div class="ds-note" style="margin-top:4px">${note}</div>` : ''}
            </div>`;
        Drawer.open({
            title: 'ตั้งค่าจอแสดงคิว',
            width: '520px',
            contentHtml: `
                <div class="ds-section-label">หน้าตา</div>
                <div class="sip-field">
                    <label class="sip-label">โทนสีจอ</label>
                    <div class="ds-segbar" id="dTheme">
                        <button type="button" class="ds-seg ${d.displayTheme !== 'dark' ? 'active' : ''}"
                                onclick="DashPage.dTheme('light')">พื้นสว่าง</button>
                        <button type="button" class="ds-seg ${d.displayTheme === 'dark' ? 'active' : ''}"
                                onclick="DashPage.dTheme('dark')">พื้นเข้ม</button>
                    </div>
                    <div class="ds-note" style="margin-top:6px">
                        พื้นเข้มอ่านง่ายจากไกลและไม่แสบตาในร้านที่ไฟสลัว · พื้นสว่างเหมาะกับร้านที่สว่างหรือมีแดดส่อง
                    </div>
                </div>

                <div class="ds-section-label">เมนูแนะนำ</div>
                ${tg('displayHighlights', 'แสดงเมนูแนะนำด้านขวาของจอ',
                     'ปิดแล้วคิวเต็มจอ เลขคิวใหญ่ขึ้น — เหมาะช่วงคนเยอะ')}
                <div class="sip-field">
                    <label class="sip-label">สลับเมนูทุก (วินาที)</label>
                    <input class="sip-input" id="dHiSec" type="number" min="3" max="60" step="1"
                           value="${Number(d.displayHighlightSec) || 7}">
                </div>

                <div class="ds-section-label">เสียง</div>
                ${tg('displaySound', 'เสียงเรียกคิวเมื่อคิวพร้อมรับ',
                     'ทีวีต้องกดปุ่ม "เปิดเสียงเรียกคิว" บนจอหนึ่งครั้งตอนติดตั้ง (เบราว์เซอร์บังคับ)')}

                <div class="ds-section-label">ข้อความประกาศ</div>
                <div class="sip-field">
                    <label class="sip-label">ข้อความด้านล่างจอ</label>
                    <input class="sip-input" id="dTicker" maxlength="200"
                           placeholder="เช่น Wi-Fi: cafe1234 · ว่างไว้ = ไม่แสดง"
                           value="${e(d.displayTicker || '')}">
                    <div class="ds-note" style="margin-top:6px">ข้อความวิ่งจากขวาไปซ้ายตลอด · ไม่เกิน 200 ตัวอักษร</div>
                </div>

                <div class="ds-note" style="margin-top:14px">
                    <i data-lucide="info" class="icon-sm"></i>
                    ใช้กับจอแสดงคิวทุกจอของร้าน · บันทึกแล้วทีวีเปลี่ยนเองภายในไม่กี่วินาที ไม่ต้องรีเฟรช
                </div>`,
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
        document.querySelectorAll('#dTheme .ds-seg').forEach((b, i) => {
            b.classList.toggle('active', ['light', 'dark'][i] === v);
        });
    },
    dToggle(key) {
        this._dd[key] = this._dd[key] === false;
        document.getElementById('dt-' + key).classList.toggle('is-on', this._dd[key] !== false);
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
    async toggleAutoReceipt() {
        const on = CFStore.settings().autoPrintReceipt === false;     // ตอนนี้ปิดอยู่ → เปิด
        try {
            await CFStore.cmd('PATCH', '/api/settings', { autoPrintReceipt: on });
            document.getElementById('autoReceipt')?.classList.toggle('is-on', on);
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
                   <button class="btn btn-outline btn-sm" style="margin-left:8px" onclick="DashPage.editPrinter(null, '${e(k.id)}')">
                       <i data-lucide="plus" class="icon-sm"></i> ตั้งเครื่องพิมพ์ให้ตู้นี้</button>`;
            return `<tr>
                <td><span class="sip-chip sip-chip-muted">ใบรับออเดอร์ · ${e(k.name)}</span></td>
                <td>${where}</td>
            </tr>`;
        }).join('');

        const list = this.printers().map((p) => `<tr class="${p.active === false ? 'text-muted' : ''}">
                <td>
                    <div class="td-name">${e(p.name)}${p.active === false ? ' (ปิดใช้งาน)' : ''}</div>
                    <div class="td-sub">${e(this.printerConnText(p))}</div>
                </td>
                <td>${p.kioskId ? `<span class="sip-chip sip-chip-muted">${e(this.kioskName(p.kioskId))}</span>`
                     : p.assignedStation ? CFApp.stationChip(p.assignedStation) : '<span class="text-muted">เคาน์เตอร์</span>'}</td>
                <td class="cf-nowrap">${e(p.paperWidth || '80mm')}</td>
                <td class="cf-nowrap">
                    <button class="btn btn-outline btn-sm" onclick="DashPage.editPrinter('${e(p.id)}')">
                        <i data-lucide="pencil" class="icon-sm"></i> แก้ไข
                    </button>
                </td>
            </tr>`).join('') ||
            '<tr><td colspan="4"><div class="ds-empty-sm">ยังไม่มีเครื่องพิมพ์</div></td></tr>';

        Drawer.open({
            title: 'เครื่องพิมพ์',
            width: '640px',
            contentHtml: `
                <div class="sip-field">
                    <button type="button" class="ds-toggle ${CFStore.settings().autoPrintReceipt !== false ? 'is-on' : ''}"
                            id="autoReceipt" onclick="DashPage.toggleAutoReceipt()">
                        <span class="ds-toggle-track"><span class="ds-toggle-knob"></span></span>
                        พิมพ์ใบเสร็จอัตโนมัติเมื่อชำระเงินแล้ว
                    </button>
                    <div class="ds-note" style="margin-top:4px">
                        ออกที่เครื่องเคาน์เตอร์ทันทีที่รับเงินสดหรือยืนยันสลิป · เงินสดเปิดลิ้นชักให้ด้วย
                    </div>
                </div>

                <button type="button" class="btn btn-outline btn-sm" style="margin-bottom:12px"
                        onclick="CFPrint.openFailed()">
                    <i data-lucide="alert-triangle" class="icon-sm"></i> งานที่พิมพ์ไม่ออก / พิมพ์ซ้ำ
                </button>

                <div class="ds-section-label">แต่ละส่วนพิมพ์ที่ไหน</div>
                <div class="table-responsive">
                    <table class="data-table compact">
                        <thead><tr><th>ส่วน</th><th>พิมพ์ออกที่</th></tr></thead>
                        <tbody>${mapRows}</tbody>
                    </table>
                </div>
                <div class="ds-note" style="margin:6px 0 16px">
                    ส่วนที่ไม่มีเครื่องของตัวเองจะพิมพ์ออกที่เครื่องเคาน์เตอร์
                    · เปลี่ยนได้ที่ช่อง "ใช้พิมพ์ของส่วน" ของแต่ละเครื่อง
                </div>

                <div class="ds-section-label">รายการเครื่องพิมพ์</div>
                <div class="table-responsive">
                    <table class="data-table compact">
                        <thead><tr><th>เครื่อง</th><th>ส่วน</th><th>กระดาษ</th><th></th></tr></thead>
                        <tbody>${list}</tbody>
                    </table>
                </div>`,
            footerHtml: `
                <button class="btn btn-outline" onclick="Drawer.close()">ปิด</button>
                <button class="btn btn-primary" onclick="DashPage.editPrinter()">
                    <i data-lucide="plus" class="icon-sm"></i> เพิ่มเครื่องพิมพ์
                </button>`,
            onOpen: () => refreshIcons(),
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
            width: '560px',
            contentHtml: `
                <div class="sip-field">
                    <label class="sip-label">ชื่อเครื่องพิมพ์</label>
                    <input class="sip-input" id="pName" placeholder="เช่น เครื่องพิมพ์บาร์"
                           value="${e(p ? p.name : forKiosk ? 'เครื่องพิมพ์บัตรคิว ' + this.kioskName(forKiosk) : '')}">
                </div>

                <div class="sip-field">
                    <label class="sip-label">การเชื่อมต่อ</label>
                    <div class="ds-segbar" id="pConn">
                        <button type="button" class="ds-seg" onclick="DashPage.pConn('NETWORK')">LAN / IP</button>
                        <button type="button" class="ds-seg" onclick="DashPage.pConn('USB')">USB</button>
                    </div>
                </div>

                <div id="pNet">
                    <div class="sip-field">
                        <label class="sip-label">IP ของเครื่องพิมพ์</label>
                        <input class="sip-input" id="pHost" inputmode="decimal" placeholder="192.168.1.50"
                               value="${e(p && p.printerHost ? p.printerHost : '')}">
                    </div>
                    <div class="sip-field">
                        <label class="sip-label">พอร์ต</label>
                        <input class="sip-input" id="pPort" type="number" min="1" max="65535"
                               value="${p && p.printerPort ? p.printerPort : 9100}">
                        <div class="ds-note" style="margin-top:4px">เครื่องพิมพ์ใบเสร็จแทบทุกรุ่นใช้ 9100</div>
                    </div>
                </div>

                <div id="pUsb">
                    <div class="ds-note" id="pUsbKiosk" style="display:none;margin-bottom:12px">
                        เสียบเครื่องพิมพ์ที่ <strong>ตัวตู้คีออสก์</strong> แล้วตั้งให้เป็นเครื่องพิมพ์หลัก (Default) ของ Windows ที่ตู้
                        · เปิดตู้ด้วย <code>kiosk-edge.bat</code> ตัวใหม่ (มี --kiosk-printing) ตู้จะพิมพ์บัตรคิวเองโดยไม่ถาม
                    </div>
                    <div class="sip-field" id="pUsbServer">
                        <label class="sip-label">เลือกเครื่องพิมพ์ USB</label>
                        <div class="flex gap-md">
                            <select class="sip-select" id="pUsbSel" style="flex:1"
                                    onchange="DashPage._pd.usb = this.value"></select>
                            <button type="button" class="btn btn-outline" onclick="DashPage.loadUsb()">
                                <i data-lucide="refresh-cw" class="icon-sm"></i> รีเฟรช
                            </button>
                        </div>
                        <div class="ds-note" style="margin-top:6px">
                            ต้องเสียบที่ <strong>เครื่องเซิร์ฟเวอร์ของร้าน</strong> (เครื่องที่รันระบบ) เท่านั้น
                            และลงไดรเวอร์ให้ Windows เห็นเครื่องพิมพ์ก่อน
                            · ถ้าจะพิมพ์ที่จุดอื่นในร้าน ให้ใช้เครื่องพิมพ์แบบ LAN
                        </div>
                    </div>
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

                <div class="sip-field">
                    <label class="sip-label">ขนาดกระดาษ</label>
                    <select class="sip-select" id="pPaper">
                        <option value="80mm" ${paper === '80mm' ? 'selected' : ''}>80 มม.</option>
                        <option value="58mm" ${paper === '58mm' ? 'selected' : ''}>58 มม.</option>
                    </select>
                </div>

                <div class="sip-field">
                    <label class="sip-label">ความละเอียดเครื่องพิมพ์</label>
                    <select class="sip-select" id="pDots">
                        <option value="" ${dots ? '' : 'selected'}>203 dpi — มาตรฐาน (58 มม. = 384 จุด · 80 มม. = 576 จุด)</option>
                        <option value="180" ${dots === 512 || dots === 360 ? 'selected' : ''}>180 dpi — Epson TM-T88 ทุกรุ่น (58 มม. = 360 จุด · 80 มม. = 512 จุด)</option>
                    </select>
                    <div class="ds-note" style="margin-top:4px">
                        ถ้าพิมพ์ออกมาแล้วขอบขวาขาด ให้เปลี่ยนเป็น 180 dpi
                        · ดูได้จากสเปกเครื่องหรือใบทดสอบที่เครื่องพิมพ์ออกเอง (กดปุ่ม Feed ค้างตอนเปิดเครื่อง)
                    </div>
                </div>

                <div class="sip-field">
                    <label class="sip-label">เครื่องสำรองเมื่อเครื่องนี้พิมพ์ไม่ออก</label>
                    <select class="sip-select" id="pFallback">
                        <option value="">ไม่มี</option>
                        ${others.map((x) => `<option value="${e(x.id)}" ${p && p.fallbackId === x.id ? 'selected' : ''}>
                            ${e(x.name)}</option>`).join('')}
                    </select>
                </div>

                ${p ? `<div class="sip-field">
                    <button type="button" class="ds-toggle ${this._pd.active ? 'is-on' : ''}" id="pActive"
                            onclick="DashPage.pActive()">
                        <span class="ds-toggle-track"><span class="ds-toggle-knob"></span></span> เปิดใช้งาน
                    </button>
                    <div class="ds-note" style="margin-top:4px">
                        ปิดแทนการลบ — ประวัติงานพิมพ์เก่ายังอ้างถึงเครื่องนี้อยู่
                    </div>
                </div>` : ''}`,
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
        document.querySelectorAll('#pConn .ds-seg').forEach((b, i) => {
            b.classList.toggle('active', ['NETWORK', 'USB'][i] === v);
        });
        document.getElementById('pNet').style.display = v === 'NETWORK' ? '' : 'none';
        document.getElementById('pUsb').style.display = v === 'USB' ? '' : 'none';
        // USB + คีออสก์ = เสียบที่ตัวตู้ ไม่ต้องเลือกเครื่องจากเซิร์ฟเวอร์
        const atKiosk = /^KIOSK:/.test((document.getElementById('pStation') || {}).value || '');
        document.getElementById('pUsbKiosk').style.display = atKiosk ? '' : 'none';
        document.getElementById('pUsbServer').style.display = atKiosk ? 'none' : '';
        if (atKiosk) return;
        if (v === 'USB' && this._pd.usbList === null) this.loadUsb();
        else this.renderUsb();
    },

    pActive() {
        this._pd.active = !this._pd.active;
        document.getElementById('pActive').classList.toggle('is-on', this._pd.active);
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
            width: '580px',
            contentHtml: this.kioskSettingsHtml(),
            footerHtml: `
                <button class="btn btn-outline" onclick="Drawer.close()">ยกเลิก</button>
                <button class="btn btn-primary" onclick="DashPage.saveKioskSettings()">
                    <i data-lucide="save" class="icon-sm"></i> บันทึก
                </button>`,
            onOpen: () => { refreshIcons(); CFApp.applyRoleGate(); },
        });
    },

    kioskSettingsHtml() {
        const d = this._kd;
        const tg = (key, label, note) => `
            <div class="sip-field">
                <button type="button" class="ds-toggle ${d[key] !== false ? 'is-on' : ''}"
                        id="kt-${key}" onclick="DashPage.kToggle('${key}')">
                    <span class="ds-toggle-track"><span class="ds-toggle-knob"></span></span> ${label}
                </button>
                ${note ? `<div class="ds-note" style="margin-top:4px">${note}</div>` : ''}
            </div>`;
        const num = (key, label) => `
            <div class="sip-field">
                <label class="sip-label">${label}</label>
                <input class="sip-input" id="kn-${key}" type="number" min="5" step="5" value="${d[key]}">
            </div>`;

        return `
            <div class="ds-section-label">การวางจอ</div>
            <div class="sip-field">
                <label class="sip-label">แนวการติดตั้ง</label>
                <div class="ds-segbar" id="kOri">
                    <button type="button" class="ds-seg ${d.kioskOrientation !== 'LANDSCAPE' ? 'active' : ''}"
                            onclick="DashPage.kOri('PORTRAIT')">แนวตั้ง 9:16</button>
                    <button type="button" class="ds-seg ${d.kioskOrientation === 'LANDSCAPE' ? 'active' : ''}"
                            onclick="DashPage.kOri('LANDSCAPE')">แนวนอน 16:9</button>
                </div>
                <div class="ds-note" style="margin-top:6px">
                    คีออสก์ร้านอาหารส่วนใหญ่ติดตั้งแนวตั้ง — แนวนอนเหมาะกับจอที่วางบนเคาน์เตอร์
                </div>
            </div>

            <div class="sip-field">
                <label class="sip-label">ขนาดจอ (Full HD ทุกขนาด)</label>
                <div class="ds-segbar" id="kSize">
                    ${CF_KIOSK_SIZES.map((z) => `<button type="button"
                        class="ds-seg ${Math.abs((d.kioskScale || 1) - z.scale) < 0.02 ? 'active' : ''}"
                        onclick="DashPage.kScale(${z.scale})">${z.in}</button>`).join('')}
                </div>
                <div class="ds-note" style="margin-top:6px">
                    ทุกขนาดใช้ความละเอียดเดียวกัน แต่จอเล็กกว่าทำให้พิกเซลเล็กลงในเชิงกายภาพ
                    จึงต้องขยายตัวอักษรขึ้นให้ยังกดและอ่านได้สบายจากระยะยืน
                </div>
            </div>

            ${tg('kioskFrame', 'แสดงกรอบจำลองเมื่อเปิดบนจอคอมพิวเตอร์',
                 'ปิดเมื่อใช้กับจอคีออสก์จริงที่หมุนเป็นแนวตั้งแล้ว')}

            <div class="ds-section-label">หน้าแรกของลูกค้า</div>
            <div class="sip-field">
                <label class="sip-label">รูปแบบการรับสินค้า</label>
                <div class="ds-segbar" id="kDine">
                    ${CF_DINING_MODES.map((m) => `<button type="button"
                        class="ds-seg ${CF_DINING_MODE(d) === m.v ? 'active' : ''}"
                        onclick="DashPage.kDine('${m.v}')">${m.label}</button>`).join('')}
                </div>
                <div class="ds-note" style="margin-top:6px">
                    ร้านที่ขายกลับบ้านอย่างเดียวเลือก "กลับบ้านอย่างเดียว" ได้เลย —
                    คีออสก์จะข้ามหน้าคำถามไปที่เมนูทันที และบันทึกทุกออเดอร์เป็นกลับบ้านให้เอง
                </div>
            </div>

            <div class="ds-section-label">ประสบการณ์ลูกค้า</div>
            ${tg('kioskUpsell', 'แนะนำเมนูเพิ่มก่อนชำระเงิน',
                 'แสดงครั้งเดียวต่อออเดอร์ ไม่เด้งทุกครั้งที่เพิ่มของ')}
            ${tg('kioskImages', 'แสดงรูปภาพสินค้า')}
            ${tg('kioskCamMirror', 'ภาพกล้องสแกนสลิปบนจอแบบกระจก',
                 'เปิด = ขยับมือถือไปทางไหนภาพไปทางนั้น (แต่ตัวหนังสือบนจอกลับด้าน) · ปิด = ตัวหนังสืออ่านได้ แต่ขยับแล้วภาพไปอีกทาง — ใช้ทั้งคีออสก์และหน้าตรวจสอบการชำระ มีผลแค่ภาพบนจอ')}
            ${tg('kioskCamFlip', 'กล้องกลับภาพมาเอง — พลิกภาพคืน',
                 'เปิดเมื่อภาพสลิปที่บันทึกไว้ (ดูที่หน้าตรวจสอบการชำระ) ตัวหนังสือกลับด้าน — เป็นที่ตัวกล้อง ระบบจะพลิกคืนให้อ่านยอดเงินได้')}

            <div class="ds-section-label">การชำระเงิน</div>
            <div class="sip-field">
                <label class="sip-label">พร้อมเพย์ของร้าน</label>
                <input class="sip-input" id="kPromptpay" inputmode="numeric"
                       placeholder="เบอร์โทร 10 หลัก หรือเลขประจำตัวผู้เสียภาษี 13 หลัก"
                       value="${CFApp.esc(d.promptpayId || '')}">
                <div class="ds-note" style="margin-top:6px">
                    ใช้สร้าง QR ตามยอดที่ต้องชำระ — ลูกค้าสแกนแล้วแอปธนาคารขึ้นยอดให้เอง
                    ไม่ต้องพิมพ์ยอด จึงไม่มีทางโอนผิดจำนวน · ยังไม่ตั้งค่าจะออก QR ไม่ได้
                </div>
            </div>

            <div class="ds-section-label">เวลา</div>
            ${num('kioskIdleSec', 'กลับหน้าแรกเมื่อไม่มีการใช้งาน (วินาที)')}
            ${num('kioskDoneSec', 'ปิดหน้าสรุปออเดอร์อัตโนมัติ (วินาที)')}
            ${num('qrTimeoutSec', 'หมดเวลาสแกน QR (วินาที)')}

            <div class="ds-note" style="margin-top:14px">
                <i data-lucide="info" class="icon-sm"></i>
                บันทึกแล้วเครื่องคีออสก์ที่เปิดอยู่จะปรับตามเองภายในไม่กี่วินาที ไม่ต้องรีเฟรช
            </div>`;
    },

    kToggle(key) {
        this._kd[key] = this._kd[key] === false;
        document.getElementById('kt-' + key).classList.toggle('is-on', this._kd[key] !== false);
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

    saveKioskSettings() {
        const d = this._kd;
        ['kioskIdleSec', 'kioskDoneSec', 'qrTimeoutSec'].forEach((k) => {
            const el = document.getElementById('kn-' + k);
            if (el) { const n = parseInt(el.value, 10); if (!isNaN(n) && n > 0) d[k] = n; }
        });
        // ฐานข้อมูลที่เปิดค้างมาจากรุ่นก่อนอาจมี kioskDiningStep อยู่ — ลบทิ้งทั้งสองที่
        // ไม่งั้นค่าเก่ายังนั่งอยู่ในฐานข้อมูลและไปโผล่ในตัวแปลงค่าเวลาคีย์ใหม่หาย
        d.kioskDiningMode = CF_DINING_MODE(d);
        delete d.kioskDiningStep;

        const pp = document.getElementById('kPromptpay');
        if (pp) {
            const v = pp.value.replace(/[^0-9]/g, '');
            if (v && v.length !== 10 && v.length !== 13) {
                showToast('พร้อมเพย์ต้องเป็นเบอร์โทร 10 หลัก หรือเลขผู้เสียภาษี 13 หลัก', 'error', 4000);
                pp.focus();
                return;
            }
            d.promptpayId = v;
        }

        // ส่งเฉพาะคีย์ของคีออสก์ ไม่เหวี่ยง settings ทั้งก้อนกลับไป
        // ไม่งั้นค่าที่คนอื่นเพิ่งแก้จากอีกเครื่องจะถูกทับด้วยค่าเก่าที่เราโหลดมาตอนเปิด drawer
        const keys = Object.keys(CF_KIOSK_DEFAULTS)
            .concat(['kioskDiningMode', 'qrTimeoutSec', 'promptpayId']);
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
        const mark = (v) => v === true ? '<span style="color:var(--status-success)">✓</span>'
                          : v === 'LIMITED' ? '<span class="sip-chip sip-chip-amber">จำกัด</span>'
                          : '<span class="text-light">—</span>';

        const weak = new Set((this._weak || []).map((w) => w.id));
        const users = CFStore.all('users').map((u) => `<tr>
                <td><div class="td-name">${e(u.name)}</div><div class="td-sub">${e(u.username)}</div></td>
                <td><span class="sip-chip sip-chip-muted">${e(CF_ROLE_LABEL[u.role])}</span></td>
                <td>${u.overrideLimit == null ? 'ไม่จำกัด' : CFApp.baht(u.overrideLimit)}</td>
                <td class="cf-nowrap">
                    ${weak.has(u.id) ? '<span class="status-badge danger">รหัสตั้งต้น</span>' : ''}
                    <button class="btn btn-outline btn-sm" onclick="DashPage.resetPassword('${e(u.id)}')">
                        ตั้งรหัสผ่านใหม่
                    </button>
                </td>
            </tr>`).join('');

        const matrix = Object.keys(CF_PERMS).map((role) => `<tr>
                <td class="l">${e(CF_ROLE_LABEL[role])}</td>
                ${keys.map(([k]) => `<td class="c">${mark(CF_PERMS[role][k])}</td>`).join('')}
            </tr>`).join('');

        Drawer.open({
            title: 'ผู้ใช้และสิทธิ์',
            width: '720px',
            contentHtml: `
                <div class="ds-section-label">บัญชีผู้ใช้</div>
                <div class="table-responsive">
                    <table class="data-table compact">
                        <thead><tr><th>ชื่อ</th><th>บทบาท</th><th>เพดานยืนยันแทน</th><th></th></tr></thead>
                        <tbody>${users}</tbody>
                    </table>
                </div>

                <div class="ds-section-label" style="margin-top:18px">ตารางสิทธิ์ตามบทบาท</div>
                <div class="table-responsive">
                    <table class="ds-table-grid">
                        <tr><th class="l">บทบาท</th>${keys.map(([, l]) => `<th>${l}</th>`).join('')}</tr>
                        ${matrix}
                    </table>
                </div>
                <div class="ds-warn">
                    <i data-lucide="shield-alert" class="icon-sm"></i>
                    ตารางนี้บังคับใช้ที่หน้าจอเท่านั้น — ระบบจริงต้องตรวจสิทธิ์ซ้ำที่เซิร์ฟเวอร์
                </div>`,
            footerHtml: '<button class="btn btn-outline" onclick="Drawer.close()">ปิด</button>',
            onOpen: () => refreshIcons(),
        });
    },

    /* ══════════════════════════════════════════════════════
       รหัสผ่านของพนักงาน (แอดมิน)
       ══════════════════════════════════════════════════════ */
    async loadWeak() {
        if (!CFAuth.can('USER_MANAGE')) return;
        try {
            this._weak = (await CFApi.get('/api/users/weak-passwords')).users || [];
        } catch (err) { this._weak = []; }
        const el = document.getElementById('weakPwBanner');
        if (!el) return;
        if (!this._weak.length) { el.style.display = 'none'; return; }
        el.style.display = '';
        el.innerHTML = `<div class="ds-warn">
            <strong>ยังมี ${this._weak.length} บัญชีที่ใช้รหัสผ่านตั้งต้น</strong>
            (${this._weak.map((w) => CFApp.esc(w.username)).join(', ')})
            — ใครที่อยู่ใน Wi‑Fi ร้านก็เข้าได้ ตั้งรหัสใหม่ก่อนเปิดร้าน
            <button class="btn btn-outline btn-sm" style="margin-left:8px" onclick="DashPage.openUsers()">ตั้งรหัสผ่าน</button>
        </div>`;
    },

    resetPassword(id) {
        const u = CFStore.byId('users', id);
        if (!u) return;
        const e = CFApp.esc;
        Drawer.open({
            title: 'ตั้งรหัสผ่านใหม่ — ' + e(u.name),
            width: '440px',
            contentHtml: `
                <div class="ds-note" style="margin-bottom:12px">
                    บัญชี <strong>${e(u.username)}</strong> จะถูกออกจากระบบทุกเครื่อง แล้วต้องเข้าใหม่ด้วยรหัสนี้
                </div>
                <div class="sip-field">
                    <label class="sip-label">รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)</label>
                    <input class="sip-input" id="rpNew" type="password" autocomplete="new-password">
                </div>
                <div class="sip-field">
                    <label class="sip-label">พิมพ์อีกครั้ง</label>
                    <input class="sip-input" id="rpNew2" type="password" autocomplete="new-password">
                </div>`,
            footerHtml: `
                <button class="btn btn-outline" onclick="DashPage.openUsers()">กลับ</button>
                <button class="btn btn-primary" onclick="DashPage.saveResetPassword('${e(id)}')">บันทึก</button>`,
            onOpen: () => setTimeout(() => document.getElementById('rpNew')?.focus(), 50),
        });
    },

    async saveResetPassword(id) {
        const a = document.getElementById('rpNew').value;
        if (a !== document.getElementById('rpNew2').value) { showToast('รหัสผ่านสองช่องไม่ตรงกัน', 'error'); return; }
        try {
            await CFApi.post('/api/users/' + encodeURIComponent(id) + '/password', { next: a });
            // ตั้งให้ตัวเอง → เลิกบังคับเปลี่ยนในเครื่องนี้ด้วย
            if (CFAuth.session() && CFAuth.session().userId === id) CFAuth.clearMustChange();
            showToast('ตั้งรหัสผ่านใหม่แล้ว', 'success');
            await this.loadWeak();
            this.openUsers();
        } catch (err) {
            showToast(err.message || 'ตั้งรหัสผ่านไม่สำเร็จ', 'error', 4000);
        }
    },

    /* ══════════════════════════════════════════════════════
       ความแม่นของการตรวจสลิป — ระบบเดา vs แคชเชียร์ตัดสินจริง
       ══════════════════════════════════════════════════════ */
    async openSlipAccuracy(days) {
        days = days || 7;
        let r;
        try { r = await CFApi.get('/api/reports/slip-accuracy?days=' + days); }
        catch (err) { showToast(err.message || 'ดึงรายงานไม่สำเร็จ', 'error', 4000); return; }
        const e = CFApp.esc;
        const pct = (n, d) => (d ? Math.round((n / d) * 100) + '%' : '—');
        const o = r.outcome;
        const row = (label, n, note, cls) => `<tr><th class="l">${label}</th>
            <td class="r ${cls || ''}"><strong>${n}</strong></td><td class="l text-muted">${note}</td></tr>`;
        Drawer.open({
            title: 'ความแม่นของการตรวจสลิป',
            width: '600px',
            contentHtml: `
                <div class="ds-segbar" style="margin-bottom:12px">
                    ${[7, 30, 90].map((d) => `<button type="button" class="ds-seg ${d === r.days ? 'active' : ''}"
                        onclick="DashPage.openSlipAccuracy(${d})">${d} วัน</button>`).join('')}
                </div>
                <div class="ds-section-label">อ่านข้อมูลจากภาพได้ (${r.read} จาก ${r.scanned} ใบที่สแกน)</div>
                <table class="ds-table-grid">
                    ${row('ยอดเงิน', pct(r.fields.amount, r.read), r.fields.amount + ' ใบ')}
                    ${row('วันที่', pct(r.fields.date, r.read), r.fields.date + ' ใบ · รวมที่ได้จากเลขอ้างอิง')}
                    ${row('ผู้รับเงิน', pct(r.fields.receiver, r.read), r.fields.receiver + ' ใบ · นับเฉพาะเมื่อตั้งบัญชีร้านไว้')}
                </table>
                <div class="ds-section-label" style="margin-top:14px">เทียบกับที่แคชเชียร์ตัดสิน (${r.judged} ใบ)</div>
                <table class="ds-table-grid">
                    ${row('ผ่าน และแคชเชียร์ยืนยัน', o.truePass, 'ระบบถูก')}
                    ${row('ไม่ผ่าน และแคชเชียร์ปฏิเสธ', o.trueCatch, 'ระบบจับได้ถูก')}
                    ${row('เตือนแดง แต่แคชเชียร์ยืนยัน', o.falseAlarm, 'เตือนผิด — ถ้าเยอะ คนจะเลิกเชื่อคำเตือน', o.falseAlarm ? 'text-danger' : '')}
                    ${row('ผ่าน แต่แคชเชียร์ปฏิเสธ', o.missed, 'ระบบปล่อยหลุด', o.missed ? 'text-danger' : '')}
                    ${row('อ่านไม่ครบ (เทา)', o.unsureConfirmed + o.unsureRejected, 'ยืนยัน ' + o.unsureConfirmed + ' · ปฏิเสธ ' + o.unsureRejected)}
                </table>
                ${r.disagree.length ? `<div class="ds-note" style="margin-top:10px">
                    ใบที่ระบบกับแคชเชียร์เห็นต่างกัน (ใช้ปรับกฎ): ${r.disagree.map((x) => e(x.orderNo)).join(', ')}
                </div>` : ''}
                <div class="ds-section-label" style="margin-top:14px">แยกตามธนาคารคนโอน</div>
                <table class="ds-table-grid">
                    ${Object.entries(r.byBank).map(([b, x]) => row(e(b), x.n + ' ใบ', 'อ่านยอดได้ ' + pct(x.amount, x.n))).join('') ||
                      '<tr><td class="l text-muted">ยังไม่มีข้อมูล</td></tr>'}
                </table>`,
            footerHtml: '<button class="btn btn-outline" onclick="Drawer.close()">ปิด</button>',
            onOpen: () => refreshIcons(),
        });
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
            width: '520px',
            contentHtml: `
                ${field('shName', 'ชื่อร้าน', s.shopName)}
                <div class="sip-field">
                    <label class="sip-label">ที่อยู่</label>
                    <textarea class="sip-textarea" id="shAddr" rows="3">${e(s.address || '')}</textarea>
                </div>
                ${field('shTax', 'เลขประจำตัวผู้เสียภาษี (13 หลัก · ไม่มีเว้นว่างได้)', s.taxId, 'inputmode="numeric"')}
                ${field('shPp', 'พร้อมเพย์ของร้าน (เบอร์โทร 10 หลัก หรือเลข 13 หลัก)', s.promptpayId, 'inputmode="numeric"')}
                <div class="sip-field">
                    <label class="sip-label">เริ่มนับเลขออเดอร์ใหม่ (A001) ทุกวัน เวลา</label>
                    <select class="sip-select" id="shDayStart">
                        ${Array.from({ length: 13 }, (_, h) => `<option value="${h}" ${CFDay.startHourOf(s) === h ? 'selected' : ''}>
                            ${String(h).padStart(2, '0')}:00 น.${h === CF_DAY_START_DEFAULT ? ' (ค่าเริ่มต้น)' : ''}</option>`).join('')}
                    </select>
                    <div class="ds-note" style="margin-top:4px">
                        ออเดอร์ก่อนเวลานี้นับเป็นยอดของเมื่อวาน (ร้านปิดหลังเที่ยงคืนได้) · หน้าจัดการออเดอร์แสดงตามวันทำการนี้
                        · มีผลตั้งแต่ออเดอร์ถัดไป — ถ้าเปลี่ยนระหว่างวัน เลขออเดอร์อาจนับต่อจากวันก่อน
                    </div>
                </div>
                <div class="ds-section-label" style="margin-top:8px">บัญชีที่รับเงิน — ใช้ตรวจว่าสลิปโอนเข้าร้านจริง</div>
                ${field('shAccName', 'ชื่อบัญชีผู้รับเงิน (ตามที่ขึ้นบนสลิป เช่น ชื่อร้าน หรือชื่อเจ้าของบัญชี)', s.shopAccountName)}
                ${field('shAccNos', 'เลขบัญชีธนาคารอื่นที่รับเงิน (ถ้ามี คั่นด้วยจุลภาค)', s.shopAccountNos, 'inputmode="numeric"')}
                <div class="ds-note" style="margin-bottom:10px">
                    พร้อมเพย์ด้านบนนับเป็นบัญชีร้านอยู่แล้ว · สลิปที่ผู้รับไม่ตรงชื่อหรือเลขเหล่านี้จะขึ้นแดง "ไม่ใช่บัญชีร้าน"
                </div>
                <div class="ds-note">
                    ชื่อร้าน ที่อยู่ และเลขผู้เสียภาษีพิมพ์บนใบเสร็จ · พร้อมเพย์ใช้สร้าง QR ที่คีออสก์
                    — ตรวจเลขพร้อมเพย์ให้ดี ผิดหนึ่งตัวเงินลูกค้าจะเข้าบัญชีคนอื่น
                </div>`,
            footerHtml: `
                <button class="btn btn-outline" onclick="Drawer.close()">ยกเลิก</button>
                <button class="btn btn-primary" onclick="DashPage.saveShop()">บันทึก</button>`,
        });
    },

    async saveShop() {
        const v = (id) => (document.getElementById(id).value || '').trim();
        const digits = (x) => x.replace(/[^0-9]/g, '');
        const body = { shopName: v('shName'), address: v('shAddr'),
                       taxId: digits(v('shTax')), promptpayId: digits(v('shPp')),
                       shopAccountName: v('shAccName'),
                       shopAccountNos: v('shAccNos').split(',').map(digits).filter(Boolean).join(', '),
                       dayStartHour: parseInt(v('shDayStart'), 10) };
        if (!body.shopName) { showToast('ต้องใส่ชื่อร้าน', 'error'); return; }
        if (body.taxId && body.taxId.length !== 13) { showToast('เลขผู้เสียภาษีต้องมี 13 หลัก', 'error'); return; }
        if (body.promptpayId && ![10, 13].includes(body.promptpayId.length)) {
            showToast('พร้อมเพย์ต้องเป็นเบอร์โทร 10 หลัก หรือเลข 13 หลัก', 'error'); return;
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
    },
};

window.DashPage = DashPage;
CFBoot.ready(() => DashPage.boot());
