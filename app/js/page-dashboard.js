/** CafeFlow — ภาพรวมผู้จัดการ (§25, §26, §30) */
const DashPage = {

    state: {},

    /* ══════════════════════════════════════════════════════
       RENDER — idempotent, ไม่อ่านค่าจาก DOM
       ══════════════════════════════════════════════════════ */
    render() {
        const e = CFApp.esc;
        const k = CFKpi.summary();
        const shift = CFStore.openShift();

        document.getElementById('shiftLine').textContent =
            shift
                ? 'รอบ ' + shift.id + ' · เปิดเมื่อ ' + CFApp.time(shift.openedAt) + ' · ' + CFApp.dateFull(shift.openedAt)
                : 'ยังไม่มีรอบการขายที่เปิดอยู่';

        /* ── ยอดขาย ── */
        const kpi = (icon, value, label, critical) => `
            <div class="sip-kpi ${critical ? 'critical' : ''}">
                <i data-lucide="${icon}" class="sip-kpi-icon icon-lg"></i>
                <div class="sip-kpi-value">${value}</div>
                <div class="sip-kpi-label">${label}</div>
            </div>`;

        document.getElementById('kpiSales').innerHTML =
            kpi('wallet',   CFApp.baht(k.sales),    'ยอดขายรอบนี้') +
            kpi('receipt',  CFApp.int(k.orderCount),'จำนวนออเดอร์') +
            kpi('calculator', CFApp.baht(k.avgOrder), 'เฉลี่ยต่อบิล') +
            kpi('banknote', CFApp.baht(k.cash),     'เงินสด') +
            kpi('qr-code',  CFApp.baht(k.qr),       'QR / โอน');

        /* ── การปฏิบัติงาน ── */
        document.getElementById('kpiOps').innerHTML =
            kpi('hourglass', CFApp.int(k.waitingPay), 'รอชำระเงิน', k.waitingPay > 4) +
            kpi('chef-hat',  CFApp.int(k.preparing),  'กำลังจัดเตรียม') +
            kpi('bell-ring', CFApp.int(k.ready),      'พร้อมรับ') +
            kpi('timer',     CFKpi.fmtSec(k.avgWaitSec), 'เวลารอชำระเฉลี่ย') +
            kpi('flame',     CFKpi.fmtSec(k.avgPrepSec), 'เวลาจัดเตรียมเฉลี่ย') +
            kpi('trending-up', k.throughput.toFixed(1), 'ออเดอร์ / ชม.');

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

        document.getElementById('activity').innerHTML = CFStore.all('auditLogs').slice(0, 14).map((a) => {
            const o = a.orderId ? CFStore.byId('orders', a.orderId) : null;
            const isBad = ['CANCELLED', 'VOIDED', 'REFUNDED', 'PAYMENT_FAILED'].includes(a.newStatus);
            const v = isBad ? 'danger' : (a.newStatus === 'READY' ? 'success' : variant(a.eventType));
            const head = a.newStatus
                ? (o ? o.orderNo + ' → ' : '') + CFApp.statusLabel(a.newStatus)
                : (o ? o.orderNo + ' · ' : '') + this.eventLabel(a.eventType);
            return `<div class="ds-timeline-item ${v}">
                        <div class="flex flex-between gap-md">
                            <strong>${e(head)}</strong>
                            <span class="ds-timeline-time">${CFApp.timeSec(a.ts)}</span>
                        </div>
                        <div class="text-muted">${e(CFApp.actorName(a.actor))}${a.reason ? ' · ' + e(a.reason) : ''}</div>
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
        }[ev] || ev;
    },

    /* ══════════════════════════════════════════════════════
       DRAWER — อุปกรณ์ (§30)
       ══════════════════════════════════════════════════════ */
    openDevices() {
        const e = CFApp.esc;
        const api = CFStore.mode === 'api';
        const rows = CFStore.all('devices').map((d) => {
            const online = d.status === 'ONLINE';
            // จับคู่ได้เฉพาะเครื่องที่รับออเดอร์/แสดงผล — เครื่องพิมพ์ไม่ได้เปิดเบราว์เซอร์
            const pairable = api && ['KIOSK', 'KDS', 'DISPLAY'].includes(d.type);
            return `<tr>
                <td>
                    <div class="td-name">${e(d.name)}</div>
                    <div class="td-sub">${e(d.id)} · ${e(d.ip)}</div>
                </td>
                <td>${d.assignedStation ? CFApp.stationChip(d.assignedStation) : '<span class="text-muted">—</span>'}</td>
                <td class="cf-nowrap">${CFApp.time(d.lastSeen)}</td>
                <td><span class="status-badge ${online ? 'active' : 'danger'}">${online ? 'ออนไลน์' : 'ออฟไลน์'}</span></td>
                <td class="cf-nowrap">${pairable ? `
                    <button class="btn btn-outline btn-sm" onclick="DashPage.pairDevice('${d.id}')">
                        <i data-lucide="link" class="icon-sm"></i> จับคู่
                    </button>` : '<span class="text-muted">—</span>'}</td>
            </tr>`;
        }).join('');

        Drawer.open({
            title: 'อุปกรณ์ในเครือข่าย',
            width: '620px',
            contentHtml: `
                <div class="sip-banner sip-banner-info" style="margin-bottom:12px">
                    <i data-lucide="info" class="icon-sm"></i>
                    อุปกรณ์ส่งสัญญาณทุก 10–30 วินาที · ไม่ได้ยินเกิน 60 วินาทีถือว่าออฟไลน์
                </div>
                <div class="table-responsive">
                    <table class="data-table compact">
                        <thead><tr><th>อุปกรณ์</th><th>สถานี</th><th>ล่าสุด</th><th>สถานะ</th><th></th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`,
            footerHtml: '<button class="btn btn-outline" onclick="Drawer.close()">ปิด</button>',
            onOpen: () => refreshIcons(),
        });
    },

    /**
     * ขอรหัสจับคู่ให้อุปกรณ์หนึ่งเครื่อง (§30)
     * รหัสแสดงครั้งเดียว — ในฐานเก็บแต่ hash ย้อนดูไม่ได้ ถ้าปิดไปก่อนต้องขอใหม่
     */
    async pairDevice(id) {
        try {
            const r = await CFApi.post('/api/devices/' + encodeURIComponent(id) + '/pair-code', {});
            await Drawer.confirm({
                title: 'รหัสจับคู่ — ' + CFApp.esc(r.name),
                message: r.code,
                lines: [
                    'ไปที่เครื่อง ' + r.deviceId + ' แล้วกรอกรหัสนี้',
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

        if (CFStore.mode === 'api') {
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
            return;
        }

        CFStore.mutate((db) => {
            Object.assign(db.settings, d);
            delete db.settings.kioskDiningStep;
        }, 'settings:kiosk');
        Drawer.close();
        showToast('บันทึกการตั้งค่าคีออสก์แล้ว', 'success');
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

        const users = CFStore.all('users').map((u) => `<tr>
                <td><div class="td-name">${e(u.name)}</div><div class="td-sub">${e(u.username)}</div></td>
                <td><span class="sip-chip sip-chip-muted">${e(CF_ROLE_LABEL[u.role])}</span></td>
                <td>${u.overrideLimit == null ? 'ไม่จำกัด' : CFApp.baht(u.overrideLimit)}</td>
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
                        <thead><tr><th>ชื่อ</th><th>บทบาท</th><th>เพดานยืนยันแทน</th></tr></thead>
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

    boot() {
        CFApp.boot({ page: 'dashboard' });
        this.render();
        CFStore.subscribe(() => this.render());

        // เปิด sub-view จาก query param ของเมนูตั้งค่า
        const q = new URLSearchParams(location.search);
        if (q.get('devices') === '1') setTimeout(() => this.openDevices(), 250);
        if (q.get('users') === '1')   setTimeout(() => this.openUsers(), 250);
        if (q.get('kiosk') === '1')   setTimeout(() => this.openKioskSettings(), 250);
    },
};

window.DashPage = DashPage;
CFBoot.ready(() => DashPage.boot());
