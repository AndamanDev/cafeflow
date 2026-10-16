/** CafeFlow — จอครัว KDS (§20, §21) */
const KdsPage = {

    state: { station: 'BAR' },

    render() {
        const e = CFApp.esc;
        const s = CFStore.settings();
        const counts = CFKpi.stationCounts();

        /* ── แท็บสถานี (เดิมเป็นแถบซ้าย) — ตัวเลขบนแท็บ = ตั๋วค้าง ── */
        const st = this.state.station;
        document.getElementById('stationTabs').innerHTML = Object.keys(CF_STATIONS).map((k) => `
            <button type="button" class="cf-kds-tab ${k === st ? 'active' : ''}" onclick="KdsPage.setStation('${k}')">
                <i data-lucide="${CF_STATIONS[k].icon}" class="icon-sm"></i> ${e(CF_STATIONS[k].label)}
                <span class="cf-kds-tab-n ${counts[k] ? 'has' : ''}">${counts[k]}</span>
            </button>`).join('');

        const queue = CFKpi.queueFor(st);
        const late = queue.filter((o) => CFApp.elapsedMin((o.ts && o.ts.sentAt) || o.createdAt) >= s.kdsDangerMin).length;
        document.getElementById('stSummary').innerHTML = queue.length
            ? `<b>${queue.length}</b> ใบรอทำ${late ? ` · <span class="cf-kds-late">เกิน ${s.kdsDangerMin} นาที ${late} ใบ</span>` : ''}`
            : '';
        document.getElementById('stClock').textContent = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        this.paintFocusBtn();

        /* ── บอร์ดตั๋ว ── */
        const board = document.getElementById('board');
        const itemsOf = (o) => CFOrders.items(o.id).filter((i) => i.station === st && i.itemStatus !== 'VOID');
        this.trackChanges(queue, itemsOf);
        this.renderAllDay(queue, itemsOf);

        if (!queue.length) {
            board.innerHTML = `<div class="ds-empty-state" style="grid-column:1/-1">
                <div class="ds-empty-state-icon"><i data-lucide="coffee"></i></div>
                <div class="ds-empty-state-title">ไม่มีตั๋วค้างที่สถานีนี้</div>
                <div class="ds-empty-state-desc">ตั๋วใหม่จะขึ้นเองเมื่อแคชเชียร์รับชำระเงิน</div>
            </div>`;
            refreshIcons();
            return;
        }

        const now = Date.now();
        board.innerHTML = queue.map((o) => {
            const items = itemsOf(o);
            const since = (o.ts && o.ts.sentAt) || o.createdAt;
            const done = this.doneSet(o.id);

            // สถานีอื่นที่ยังไม่พร้อม — §21 ต้องเห็นว่ารออะไรอยู่
            const pending = Object.keys(o.stationStatus || {})
                .filter((x) => x !== st && o.stationStatus[x] !== 'READY');

            const pend = this._pending && this._pending[o.id];
            const flash = this._flash && this._flash[o.id];
            const isFlash = flash && flash.until > now;
            return `<div class="cf-kds-card ${pend ? 'is-pending' : ''} ${isFlash ? 'is-flash' : ''}" data-age-target>
                <div class="cf-kds-top">
                    <div class="cf-kds-no">${e(o.orderNo)}
                        ${isFlash ? `<span class="cf-kds-new">${flash.kind === 'changed' ? 'แก้ไข' : 'ใหม่'}</span>` : ''}</div>
                    <div class="cf-kds-timer" data-since="${since}">--:--</div>
                </div>
                ${o.diningOption === 'TAKE_AWAY'
                    ? `<div class="cf-kds-dining">${CFApp.diningLabel('TAKE_AWAY')}</div>` : ''}

                <!-- แตะรายการ = ทำแก้วนั้นเสร็จ (ติ๊กในเครื่องนี้) · ครบทุกแก้ว = กดพร้อมเสิร์ฟให้เอง (ยังย้อนได้ 5 วิ) -->
                <ul class="cf-kds-items">
                    ${items.map((i) => `<li class="cf-kds-li ${done.has(i.id) ? 'is-done' : ''}" ${pend ? '' : `onclick="KdsPage.tick('${o.id}','${i.id}')"`}>
                        <span class="cf-kds-check"><i data-lucide="check" class="icon-sm"></i></span>
                        <div>
                            <div class="cf-kds-item">${i.qty} × ${e(i.nameSnapshot)}${e(CFApp.serveSuffix(i.serveType))}</div>
                            ${(i.mods || []).map((m) => `<div class="cf-kds-mods">• ${e(m.label)}</div>`).join('')}
                        </div>
                    </li>`).join('')}
                </ul>

                <div class="cf-kds-meta">รับออเดอร์ ${CFApp.time(o.createdAt)}${items.length > 1 ? ` · ทำแล้ว ${[...done].filter((id) => items.some((i) => i.id === id)).length}/${items.length}` : ''}</div>
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

    /**
     * รวมที่ต้องทำทั้งสถานี (แบบ Square "All Day count") — นับเฉพาะแก้วที่ยังไม่ติ๊ก
     * เมนูเดียวกันแบบเสิร์ฟเดียวกันรวมเป็นแถวเดียว (ตัวเลือกต่างกันยังรวม — ดูรายละเอียดในตั๋ว)
     */
    renderAllDay(queue, itemsOf) {
        const el = document.getElementById('allDay');
        const acc = new Map();
        queue.forEach((o) => {
            if (this._pending && this._pending[o.id]) return;          // กำลังส่งพร้อมเสิร์ฟ = ทำเสร็จแล้ว
            const done = this.doneSet(o.id);
            itemsOf(o).forEach((i) => {
                if (done.has(i.id)) return;
                const k = i.nameSnapshot + CFApp.serveSuffix(i.serveType);
                acc.set(k, (acc.get(k) || 0) + i.qty);
            });
        });
        const rows = [...acc.entries()].sort((a, b) => b[1] - a[1]);
        el.hidden = !rows.length;
        el.innerHTML = rows.length ? `<span class="cf-kds-allday-label">ต้องทำรวม</span>` +
            rows.map(([name, n]) => `<span class="cf-kds-allday-chip"><b>${n}</b> ${CFApp.esc(name)}</span>`).join('') : '';
    },

    /**
     * ตั๋วใหม่ / ตั๋วที่ถูกแก้ → กะพริบ + ป้าย "ใหม่"/"แก้ไข" 8 วิ (แบบ Toast) · ครั้งแรกที่เปิดหน้าไม่กะพริบทั้งบอร์ด
     * ลายเซ็นตั๋ว = รายการ + จำนวน + ตัวเลือก — เปลี่ยนเมื่อแคชเชียร์แก้/ยกเลิกบางรายการ
     */
    FLASH_MS: 8000,
    trackChanges(queue, itemsOf) {
        this._seen = this._seen || new Map();
        this._seenSt = this._seenSt || new Set();
        this._flash = this._flash || {};
        // จำแยกต่อสถานี — สลับไปแท็บที่ยังไม่เคยเปิด ตั๋วที่ค้างอยู่แล้วต้องไม่ขึ้น "ใหม่" ทั้งบอร์ด
        const st = this.state.station;
        const first = !this._seenSt.has(st);
        const now = Date.now();
        queue.forEach((o) => {
            const sig = itemsOf(o).map((i) => i.id + ':' + i.qty + ':' + (i.mods || []).map((m) => m.label).join('|')).join(',');
            const key = st + ':' + o.id;
            const prev = this._seen.get(key);
            if (!first && prev !== sig) {
                this._flash[o.id] = { kind: prev == null ? 'new' : 'changed', until: now + this.FLASH_MS };
                clearTimeout(this._flashT);
                this._flashT = setTimeout(() => this.render(), this.FLASH_MS + 100);   // เอาป้ายออกเมื่อหมดเวลา
            }
            this._seen.set(key, sig);
        });
        this._seenSt.add(st);
    },

    /* ── ติ๊กทีละรายการ — เก็บในเครื่องนี้ (localStorage) ไม่ส่งเซิร์ฟเวอร์ · ตั๋วจบแล้วล้างทิ้งเอง ── */
    DONE_KEY: 'cf.kds.done',
    loadDone() {
        if (this._done) return this._done;
        try { this._done = JSON.parse(localStorage.getItem(this.DONE_KEY) || '{}') || {}; } catch { this._done = {}; }
        return this._done;
    },
    saveDone() {
        try { localStorage.setItem(this.DONE_KEY, JSON.stringify(this._done || {})); } catch { /* โหมดส่วนตัว — ติ๊กได้แต่ไม่จำ */ }
    },
    doneSet(orderId) { return new Set(this.loadDone()[orderId] || []); },
    tick(orderId, itemId) {
        const all = this.loadDone();
        const set = new Set(all[orderId] || []);
        if (set.has(itemId)) set.delete(itemId); else set.add(itemId);
        all[orderId] = [...set];
        this.saveDone();
        // ครบทุกแก้วของสถานีนี้ → กดพร้อมเสิร์ฟให้เอง (มีปุ่มย้อนกลับ 5 วิ เหมือนกดเอง)
        const items = CFOrders.items(orderId).filter((i) => i.station === this.state.station && i.itemStatus !== 'VOID');
        if (items.length && items.every((i) => set.has(i.id))) { this.ready(orderId); return; }
        this.render();
    },
    /** ล้างติ๊กของตั๋วที่ไม่อยู่บนบอร์ดแล้ว — กันข้อมูลในเครื่องโตเรื่อย ๆ */
    pruneDone() {
        const all = this.loadDone();
        const live = new Set(Object.keys(CF_STATIONS).flatMap((k) => CFKpi.queueFor(k).map((o) => o.id)));
        let changed = false;
        Object.keys(all).forEach((id) => { if (!live.has(id)) { delete all[id]; changed = true; } });
        if (changed) this.saveDone();
    },

    setStation(st) { this.state.station = st; this.render(); },

    /**
     * โหมดจอครัว — ซ่อนแถบเมนูแอดมิน (กดพลาดไปหน้าอื่นไม่ได้) ตั๋วใหญ่อ่านได้จากระยะไกล
     * จำต่อเครื่อง · ยังไม่เคยตั้ง = เปิดเองสำหรับบัญชีครัว
     */
    FOCUS_KEY: 'cf.kds.focus',
    focusOn() {
        let v = null;
        try { v = localStorage.getItem(this.FOCUS_KEY); } catch { /* โหมดส่วนตัว — ใช้ค่าเริ่มต้น */ }
        return v == null ? CFAuth.getRole() === 'KITCHEN' : v === '1';
    },
    toggleFocus() {
        const on = !document.body.classList.contains('cf-kitchen-mode');
        try { localStorage.setItem(this.FOCUS_KEY, on ? '1' : '0'); } catch { /* ไม่เป็นไร */ }
        document.body.classList.toggle('cf-kitchen-mode', on);
        this.paintFocusBtn();
        refreshIcons();
    },
    paintFocusBtn() {
        const on = document.body.classList.contains('cf-kitchen-mode');
        const b = document.getElementById('focusBtn');
        if (!b) return;
        b.innerHTML = on ? '<i data-lucide="minimize-2" class="icon-sm"></i> ออกจากโหมดจอครัว'
                         : '<i data-lucide="maximize-2" class="icon-sm"></i> โหมดจอครัว';
        b.title = on ? 'แสดงแถบเมนูกลับมา' : 'ซ่อนแถบเมนู ตั๋วใหญ่ขึ้น — สำหรับจอที่ตั้งในครัว';
    },

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
        document.body.classList.toggle('cf-kitchen-mode', this.focusOn());

        this.render();
        // นาฬิกาบนแถบ — นาทีละครั้งพอ (ตัวจับเวลาตั๋วเดินแยกอยู่แล้ว)
        setInterval(() => {
            const c = document.getElementById('stClock');
            if (c) c.textContent = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        }, 20000);
        CFStore.subscribe(() => { this.pruneDone(); this.render(); });

        // ตัวจับเวลาเดินแยกจากการ render — เขียนแค่ textContent ไม่ rebuild บอร์ดทุกวินาที
        CFApp.startTickers();
    },
};

window.KdsPage = KdsPage;
CFBoot.ready(() => KdsPage.boot());
