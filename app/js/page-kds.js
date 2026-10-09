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
        // ไอคอนของสถานี — เดิมเป็นตัวแรกของรหัส ("B") ไม่ได้บอกอะไร
        document.getElementById('stIcon').innerHTML = `<i data-lucide="${CF_STATIONS[st].icon}"></i>`;
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

            const pend = this._pending && this._pending[o.id];
            return `<div class="cf-kds-card ${pend ? 'is-pending' : ''}" data-age-target>
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

                ${pend ? `
                <div class="cf-kds-undo">
                    <span><i data-lucide="check" class="icon-sm"></i> พร้อมเสิร์ฟใน <b id="kdsUndo-${o.id}">${this.pendLeft(o.id)}</b></span>
                    <button class="btn btn-outline btn-sm" onclick="KdsPage.undo('${o.id}')">
                        <i data-lucide="undo-2" class="icon-sm"></i> ย้อนกลับ</button>
                </div>` : `
                <div class="flex gap-sm">
                    <button class="btn btn-outline btn-sm" onclick="CFDocs.previewKitchenSlip('${o.id}','${st}')">
                        <i data-lucide="printer" class="icon-sm"></i> สลิป
                    </button>
                    <button class="btn btn-primary btn-sm" style="flex:1;justify-content:center"
                            onclick="KdsPage.ready('${o.id}')">
                        <i data-lucide="check" class="icon-sm"></i> พร้อมเสิร์ฟ
                    </button>
                </div>`}
            </div>`;
        }).join('');

        CFApp.tickNow();   // ให้ตัวเลขเวลาขึ้นทันที ไม่ต้องรอ tick ถัดไป
        refreshIcons();
    },

    setStation(st) { this.state.station = st; this.render(); },

    toggleLeft() { document.getElementById('shell').classList.toggle('left-collapsed'); },

    /**
     * พร้อมเสิร์ฟ — หน่วง 5 วิก่อนส่งจริง กดพลาดกด "ย้อนกลับ" ได้ (ไม่ต้องถามยืนยันทุกครั้ง ชั่วโมงเร่งด่วนครัวช้าลง)
     * ส่งจริงแล้วลูกค้าเห็นเลขบนจอเรียกคิว — ย้อนหลังจากนั้นไม่ได้ จึงหน่วงไว้ฝั่งหน้าจอแทน
     */
    UNDO_SEC: 5,
    ready(orderId) {
        this._pending = this._pending || {};
        if (this._pending[orderId]) return;
        const station = this.state.station;
        this._pending[orderId] = {
            until: Date.now() + this.UNDO_SEC * 1000,
            timer: setTimeout(() => {
                delete this._pending[orderId];
                CFOrders.setStationReady(orderId, station);
                this.render();
            }, this.UNDO_SEC * 1000),
        };
        this.startUndoTick();
        this.render();
    },
    undo(orderId) {
        const p = this._pending && this._pending[orderId];
        if (!p) return;
        clearTimeout(p.timer);
        delete this._pending[orderId];
        this.render();
    },
    pendLeft(orderId) {
        const p = this._pending && this._pending[orderId];
        return p ? Math.max(0, Math.ceil((p.until - Date.now()) / 1000)) : 0;
    },
    startUndoTick() {
        if (this._undoT) return;
        this._undoT = setInterval(() => {
            const ids = Object.keys(this._pending || {});
            if (!ids.length) { clearInterval(this._undoT); this._undoT = null; return; }
            ids.forEach((id) => { const el = document.getElementById('kdsUndo-' + id); if (el) el.textContent = this.pendLeft(id); });
        }, 250);
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
