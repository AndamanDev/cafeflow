/** CafeFlow — จอครัว KDS (§20, §21) */
const KdsPage = {

    state: { station: 'BAR' },

    render() {
        const e = CFApp.esc;
        const s = CFStore.settings();
        const counts = CFKpi.stationCounts();
        const total = Object.values(counts).reduce((a, b) => a + b, 0);

        document.getElementById('totalCount').textContent = total + ' ใบ';

        /* ── รายการสถานีทางซ้าย ── */
        document.getElementById('stationList').innerHTML = Object.keys(CF_STATIONS).map((st) => `
            <div class="cf-station-item ${st === this.state.station ? 'active' : ''}"
                 onclick="KdsPage.setStation('${st}')">
                <span><i data-lucide="${CF_STATIONS[st].icon}" class="icon-sm"></i>
                      ${e(CF_STATIONS[st].label)}</span>
                <span class="sip-chip ${counts[st] ? 'sip-chip-progress' : 'sip-chip-muted'}">${counts[st]}</span>
            </div>`).join('');

        /* ── หัวสถานีที่เลือก ── */
        const st = this.state.station;
        document.getElementById('stIcon').textContent = st.charAt(0);
        document.getElementById('stName').textContent = CF_STATIONS[st].label;
        document.getElementById('stChip').textContent = counts[st] + ' ใบ';
        document.getElementById('stWarn').textContent =
            'เตือนที่ ' + s.kdsWarnMin + ' นาที · เร่งด่วนที่ ' + s.kdsDangerMin + ' นาที';
        document.getElementById('stClock').textContent = CFApp.dateFull(new Date().toISOString());

        /* ── บอร์ดตั๋ว ── */
        const queue = CFKpi.queueFor(st);
        const board = document.getElementById('board');

        if (!queue.length) {
            board.innerHTML = `<div class="ds-empty-state" style="grid-column:1/-1">
                <div class="ds-empty-state-icon"><i data-lucide="coffee"></i></div>
                <div class="ds-empty-state-title">ไม่มีตั๋วค้างที่สถานีนี้</div>
                <div class="ds-empty-state-desc">ตั๋วใหม่จะขึ้นเองเมื่อแคชเชียร์รับชำระเงิน</div>
            </div>`;
            refreshIcons();
            return;
        }

        board.innerHTML = queue.map((o) => {
            const items = CFOrders.items(o.id).filter((i) => i.station === st && i.itemStatus !== 'VOID');
            const since = (o.ts && o.ts.sentAt) || o.createdAt;

            // สถานีอื่นที่ยังไม่พร้อม — §21 ต้องเห็นว่ารออะไรอยู่
            const pending = Object.keys(o.stationStatus || {})
                .filter((x) => x !== st && o.stationStatus[x] !== 'READY');

            return `<div class="cf-kds-card" data-age-target>
                <div class="cf-kds-top">
                    <div class="cf-kds-no">${e(o.orderNo)}</div>
                    <div class="cf-kds-timer" data-since="${since}">--:--</div>
                </div>
                ${o.diningOption === 'TAKE_AWAY'
                    ? `<div class="cf-kds-dining">${CFApp.diningLabel('TAKE_AWAY')}</div>` : ''}

                <ul class="cf-kds-items">
                    ${items.map((i) => `<li>
                        <div class="cf-kds-item">${i.qty} × ${e(i.nameSnapshot)}${e(CFApp.serveSuffix(i.serveType))}</div>
                        ${(i.mods || []).map((m) => `<div class="cf-kds-mods">• ${e(m.label)}</div>`).join('')}
                    </li>`).join('')}
                </ul>

                <div class="cf-kds-meta">${e(o.kioskId)} · รับออเดอร์ ${CFApp.time(o.createdAt)}</div>
                ${pending.length ? `<div class="sip-chip sip-chip-active" style="align-self:flex-start">
                    รออีก ${pending.length} สถานี: ${pending.map((x) => e(CFApp.stationLabel(x))).join(', ')}
                </div>` : ''}

                <div class="flex gap-sm">
                    <button class="btn btn-outline btn-sm" onclick="CFDocs.previewKitchenSlip('${o.id}','${st}')">
                        <i data-lucide="printer" class="icon-sm"></i> สลิป
                    </button>
                    <button class="btn btn-primary btn-sm" style="flex:1;justify-content:center"
                            onclick="KdsPage.ready('${o.id}')">
                        <i data-lucide="check" class="icon-sm"></i> พร้อมเสิร์ฟ
                    </button>
                </div>
            </div>`;
        }).join('');

        CFApp.tickNow();   // ให้ตัวเลขเวลาขึ้นทันที ไม่ต้องรอ tick ถัดไป
        refreshIcons();
    },

    setStation(st) { this.state.station = st; this.render(); },

    toggleLeft() { document.getElementById('shell').classList.toggle('left-collapsed'); },

    ready(orderId) {
        CFOrders.setStationReady(orderId, this.state.station);
    },

    boot() {
        CFApp.boot({ page: 'kds' });
        CFAlerts.start('kds');

        // สถานีเริ่มต้นจากอุปกรณ์ที่ผูกไว้ (§30) — จอบาร์ควรเปิดมาที่บาร์เลย
        const dev = CFStore.byId('devices', CFApp.deviceId());
        if (dev && dev.assignedStation) this.state.station = dev.assignedStation;

        this.render();
        CFStore.subscribe(() => this.render());

        // ตัวจับเวลาเดินแยกจากการ render — เขียนแค่ textContent ไม่ rebuild บอร์ดทุกวินาที
        CFApp.startTickers();
    },
};

window.KdsPage = KdsPage;
CFBoot.ready(() => KdsPage.boot());
