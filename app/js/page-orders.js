/**
 * CafeFlow — ประวัติบิล (3-pane)
 * แบ่งแบบ POS ทั่วไป (Loyverse "Receipts" · Ocha/FoodStory "ประวัติบิล" · Square "Completed"):
 *   หน้าแคชเชียร์ = ทุกออเดอร์ที่ยังไม่จบ · หน้านี้ = บิลที่จบแล้ว (พิมพ์ซ้ำ · ยกเลิก · คืนเงิน · ดูย้อนหลัง)
 * ออเดอร์ที่ยังไม่จบไม่ขึ้นในรายการ แต่ค้นเจอ และเปิดจากแคชเชียร์ได้ (?order=…) เพื่อจัดการพิเศษ (ยกเลิก ฯลฯ)
 */
const OrdersPage = {

    // day = null คือวันทำการปัจจุบัน · ใส่ 'YYYY-MM-DD' = ดูวันก่อน (ดึงจากเซิร์ฟเวอร์ไว้ใน dayList)
    state: { filter: 'all', q: '', group: 'recent', selectedId: null, tab: 'items', slipStation: null,
             day: null, dayList: null, dayNote: '' },

    /** บิลที่จบแล้ว — กลุ่ม "เสร็จ" + "ยกเลิก" ของ CF_STATUS_GROUPS (ที่เหลือคืองานของหน้าแคชเชียร์) */
    HISTORY: CF_STATUS_GROUPS.filter((g) => ['done', 'void'].includes(g.key)).flatMap((g) => g.statuses),

    FILTERS: [
        { key: 'all', label: 'ทั้งหมด', test: () => true },
        // แท็บ = กลุ่มสถานะเดียวกับป้าย (CF_STATUS_GROUPS) — คำบนแท็บกับคำบนป้ายตรงกันเสมอ
        ...CF_STATUS_GROUPS.filter((g) => ['done', 'void'].includes(g.key))
            .map((g) => ({ key: g.key, label: g.label, test: (o) => g.statuses.includes(o.status) })),
    ],

    /* ══════════════════════════════════════════════════════
       LIST
       ══════════════════════════════════════════════════════ */
    /* ── วันทำการ — เวลาเริ่มวันตั้งที่ หน้าภาพรวม › ข้อมูลร้าน (คิดแบบเดียวกับเซิร์ฟเวอร์ผ่าน CFDay) ── */
    startHour() { return CFDay.startHourOf(CFStore.settings()); },
    today() { return CFDay.businessDate(Date.now(), this.startHour()); },
    dayText(ymd) { return CFApp.date(ymd + 'T12:00:00+07:00'); },

    /**
     * บิลที่หน้านี้ดูอยู่ — เฉพาะที่จบแล้วของวันทำการที่เลือก
     * ใบที่ยังไม่จบ (รวมที่ค้างจากวันก่อน) อยู่หน้าแคชเชียร์ ไม่ซ้ำกันสองหน้า
     * ไม่ใช่ "24 ชม.ล่าสุด" — ไม่งั้น A001 ของเมื่อวานกับวันนี้ปนกัน
     */
    base() {
        // ผลค้นจากเซิร์ฟเวอร์ (มีเฉพาะตอนพิมพ์คำค้น) ครอบคลุมย้อนหลังทุกวัน และทุกสถานะ — หาใบที่ยังไม่จบก็เจอ
        if (this.state.found) return this.state.found;
        const done = (o) => this.HISTORY.includes(o.status);
        if (this.state.day) return (this.state.dayList || []).filter(done);
        const today = this.today();
        return CFStore.all('orders').filter((o) => (!o.businessDate || o.businessDate === today) && done(o));
    },

    setDay(v) {
        this.state.pinned = false;
        const pick = document.getElementById('dayPick');
        pick.style.display = v === 'pick' ? '' : 'none';
        if (v === 'today') {
            this.state.day = null; this.state.dayList = null; this.state.dayNote = '';
            this.render();
        } else if (v === 'yesterday') {
            const d = new Date(this.today() + 'T12:00:00Z');
            d.setUTCDate(d.getUTCDate() - 1);
            this.loadDay(d.toISOString().slice(0, 10));
        } else {
            pick.max = this.today();
            if (pick.value) this.loadDay(pick.value);
        }
    },

    async loadDay(day) {
        if (!day) return;
        if (day === this.today()) { document.getElementById('daySelect').value = 'today'; this.setDay('today'); return; }
        this.state.day = day;
        this.state.pinned = false;
        document.getElementById('dayPick').value = day;      // เดิมช่องวันที่ขึ้น mm/dd/yyyy ว่าง ทั้งที่โหลดวันนั้นอยู่
        this.state.dayList = null;
        this.state.dayNote = 'กำลังโหลด…';
        this.render();
        try {
            const res = await CFApi.get('/api/orders/search?limit=1000&day=' + encodeURIComponent(day));
            if (this.state.day !== day) return;          // เปลี่ยนวันไปแล้วระหว่างรอ
            // กรองซ้ำที่หน้าจอ — API รุ่นเก่า (ยังไม่รีสตาร์ทหลังอัปเดต) ไม่รู้จัก day= แล้วส่งออเดอร์ล่าสุดมาทั้งหมด
            // ไม่มีออเดอร์ของวันนั้น ต้องขึ้นว่างจริง ไม่ใช่โชว์ออเดอร์วันนี้ให้เข้าใจผิด
            this.state.dayList = res.orders.filter((o) => o.businessDate === day);
            this.state.dayNote = res.total > res.orders.length
                ? `${res.total} รายการ · แสดง ${res.orders.length} รายการแรก` : '';
        } catch (err) {
            if (this.state.day !== day) return;
            this.state.dayList = [];
            this.state.dayNote = 'โหลดออเดอร์ของวันนั้นไม่ได้';
        }
        this.render();
    },

    filtered() {
        const f = this.FILTERS.find((x) => x.key === this.state.filter) || this.FILTERS[0];
        const q = this.state.q.trim().toLowerCase();
        const base = this.base();

        let list = base.filter((o) =>
            f.test(o) && (!q || this.state.found ||
                o.orderNo.toLowerCase().includes(q) || (o.kioskId || '').toLowerCase().includes(q))
        );
        if (this.state.group === 'amount')      list.sort((a, b) => b.total - a.total);
        else if (this.state.group === 'oldest') list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        else                                    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return list;
    },

    /**
     * ค้นย้อนหลังที่เซิร์ฟเวอร์
     * cache ในเบราว์เซอร์มีแค่ 24 ชั่วโมง + ใบที่ยังไม่จบ — ค้นของเมื่อวานจึงไม่เจอ
     * คำค้นสั้นกว่า 2 ตัวอักษรค้นเฉพาะใน cache (ยิงทุกตัวอักษรเปลืองเซิร์ฟเวอร์เปล่า ๆ)
     */
    async searchServer() {
        const q = this.state.q.trim();
        if (q.length < 2) {
            this.state.found = null;
            this.state.searchNote = '';
            this.render();
            return;
        }
        this.state.searchNote = 'กำลังค้น…';
        this.render();
        try {
            const res = await CFApi.get('/api/orders/search?limit=100&q=' + encodeURIComponent(q));
            this.state.found = res.orders;
            this.state.searchNote = res.total > res.orders.length
                ? `พบ ${res.total} รายการ · แสดง ${res.orders.length} รายการแรก`
                : `พบ ${res.total} รายการ (ค้นย้อนหลังทั้งหมด)`;
        } catch (err) {
            // ค้นไม่ได้ต้องไม่ทำให้หน้าใช้ไม่ได้ — ถอยไปค้นในที่ที่มีอยู่
            this.state.found = null;
            this.state.searchNote = 'ค้นย้อนหลังไม่ได้ — แสดงเฉพาะที่โหลดไว้';
        }
        this.render();
    },

    render() {
        const e = CFApp.esc;
        const all = this.base();
        const list = this.filtered();
        const today = this.today();

        // เปิดมาเลือกใบแรกให้เลย — เดิมตรงกลาง/ขวาว่างจนกว่าจะคลิก ดูเหมือนหน้าเสีย (ปรับ 16/10/2569)
        // ใบที่เลือกไว้หลุดจากรายการ (เปลี่ยนวัน/ตัวกรอง) ก็ย้ายไปใบแรกของรายการใหม่
        // pinned = เลือกเอง/เปิดจากลิงก์ (?order=) — ใบนั้นอาจไม่อยู่ในรายการ (ยังไม่จบ) ต้องไม่ถูกย้ายทับ
        if (!this.state.pinned && !list.some((o) => o.id === this.state.selectedId)) {
            this.state.selectedId = list.length ? list[0].id : null;
            if (list.length) this.ensureDetail(list[0].id);
        }

        document.getElementById('listCount').textContent =
            this.state.searchNote || this.state.dayNote || (list.length + ' รายการ');
        const hh = String(this.startHour()).padStart(2, '0') + ':00';
        document.getElementById('dayInfo').textContent = this.state.found
            ? 'ผลค้นหาจากทุกวัน'
            : `วันทำการ ${this.dayText(this.state.day || today)} · เริ่ม ${hh} น.`;

        document.getElementById('pillTabs').innerHTML = this.FILTERS.map((f) => `
            <button class="ds-pilltab ${f.key === this.state.filter ? 'active' : ''}"
                    data-filter="${f.key}" onclick="OrdersPage.setFilter('${f.key}')">
                ${f.label} <span class="tab-count">${all.filter(f.test).length}</span>
            </button>`).join('');

        // การ์ดเรียบ: เลขคิว + ยอดเงิน · จุดสีสถานะ + เวลา · รายละเอียดตัวเล็ก — เดิมมีป้ายสี 3 อันต่อใบ ดูรก
        // ใบที่ค้างจากวันก่อนใช้แถบเหลืองด้านซ้าย + ข้อความเล็ก แทนป้ายอีกอัน
        const TONE = { 'sip-chip-danger': 'danger', 'sip-chip-active': 'warn', 'sip-chip-success': 'ok',
                       'sip-chip-progress': 'info', 'sip-chip-muted': 'muted' };
        document.getElementById('listContainer').innerHTML = list.length ? list.map((o) => {
            const st = CF_STATUS[o.status] || { label: o.status, chip: 'sip-chip-muted' };
            const carried = !this.state.day && !this.state.found && o.businessDate && o.businessDate < today;
            const n = o.itemCount != null ? o.itemCount : CFOrders.items(o.id).length;
            return `<div class="cf-lc ${o.id === this.state.selectedId ? 'active' : ''} ${carried ? 'carried' : ''}"
                         onclick="OrdersPage.select('${o.id}')">
                <div class="cf-lc-r1">
                    <span class="cf-lc-no">${e(o.orderNo)}</span>
                    <span class="cf-lc-amt">${CFApp.baht(o.total)}</span>
                </div>
                <div class="cf-lc-r2">
                    <span class="cf-lc-status ${TONE[st.chip] || 'muted'}"><i></i>${e(st.label)}</span>
                    ${carried
                        ? `<span class="cf-lc-time carry" title="ค้างจากวันก่อน — ยังไม่จบ">${e(this.dayText(o.businessDate))} ${CFApp.time(o.createdAt)}</span>`
                        : `<span class="cf-lc-time">${CFApp.time(o.createdAt)}</span>`}
                </div>
                <div class="cf-lc-r3">
                    ${n} รายการ${o.diningOption === 'TAKE_AWAY' ? ' · กลับบ้าน' : ''}
                </div>
            </div>`;
        }).join('') : this.emptyListHtml();

        this.renderDetail();
        CFApp.applyRoleGate();
        refreshIcons();
    },

    /** รายการว่าง — บอกเหตุผล + ทางไปต่อ (วันนี้ยังไม่มีบิล → ดูเมื่อวาน) แทน "ไม่พบออเดอร์" เฉย ๆ */
    emptyListHtml() {
        if (this.state.q.trim()) return '<div class="cf-ol-empty">ไม่พบบิลที่ตรงกับคำค้น</div>';
        if (this.state.filter !== 'all') {
            return `<div class="cf-ol-empty">ไม่มีบิลในกลุ่มนี้
                <button class="btn btn-outline btn-sm" onclick="OrdersPage.setFilter('all')">ดูทั้งหมด</button></div>`;
        }
        if (!this.state.day) {
            return `<div class="cf-ol-empty"><i data-lucide="coffee" class="icon-lg"></i>
                ยังไม่มีบิลที่จบแล้ววันนี้
                <button class="btn btn-outline btn-sm" onclick="document.getElementById('daySelect').value='yesterday';OrdersPage.setDay('yesterday')">
                    ดูบิลเมื่อวาน</button></div>`;
        }
        return this.state.dayList ? '<div class="cf-ol-empty">ไม่มีบิลในวันนั้น</div>' : '';
    },

    /** ใบที่ไม่อยู่ใน cache (ผลค้น/วันเก่า) — ดึงรายละเอียดมาก่อน ไม่งั้นแผงกลางว่างโดยไม่บอกอะไร */
    ensureDetail(id) {
        if (CFStore.byId('orders', id)) return;
        CFApi.get('/api/orders/' + encodeURIComponent(id))
            .then((patch) => {
                CFStore.hydrate(patch);
                if (this.state.selectedId === id) this.render();
            })
            .catch(() => showToast('โหลดรายละเอียดออเดอร์ไม่สำเร็จ', 'error'));
    },

    setFilter(k) { this.state.filter = k; this.state.pinned = false; this.render(); },
    setQuery(v) {
        this.state.q = v;
        this.state.pinned = false;
        this.state.found = null;          // ผลเก่าใช้ไม่ได้แล้ว ต้องไม่ค้างให้เห็น
        this.render();                    // วาดทันทีจากที่มีอยู่ ไม่ให้ช่องค้นหาหน่วง
        // หน่วงก่อนยิงเซิร์ฟเวอร์ ไม่งั้นพิมพ์ "อเมริกาโน" ยิงไป 9 ครั้ง
        clearTimeout(this._qTimer);
        this._qTimer = setTimeout(() => this.searchServer(), 350);
    },
    setGroup(v)  { this.state.group = v; this.render(); },
    toggleLeft() { document.getElementById('shell').classList.toggle('left-collapsed'); },

    select(id) {
        this.state.selectedId = id;
        this.state.pinned = true;
        this.state.slipStation = null;
        this.render();
        // ออเดอร์ที่ค้นเจอจากเซิร์ฟเวอร์อาจอยู่นอกหน้าต่าง cache
        this.ensureDetail(id);
    },

    /**
     * รับเงินสด / ตรวจสลิป / สแกนสลิปที่เคาน์เตอร์ — เปิด drawer ตัวเดียวกับหน้าแคชเชียร์ ในหน้านี้เลย
     * (page-cashier.js โหลดมาแต่ไม่บูตหน้าแคชเชียร์) · ไม่มีไฟล์นั้นค่อยถอยไปเปิดหน้าแคชเชียร์
     */
    toCashier(id) {
        if (window.CashierPage && CashierPage.open) {
            const o = CFStore.byId('orders', id);
            // รอจ่าย QR (ยังไม่หมดเวลา) ก็สแกนสลิปที่เคาน์เตอร์ได้ — open() ปกติพาไปหน้ารายละเอียด
            if (o && o.status === 'WAITING_PAYMENT') CashierPage.openReview(id); else CashierPage.open(id);
            return;
        }
        location.href = 'cashier.html?order=' + encodeURIComponent(id);
    },

    /** "18 ชม." / "5 นาที" / "2 วัน" — บอกว่าออเดอร์ค้างมานานแค่ไหน */
    ago(iso) {
        const m = Math.max(0, Math.floor(CFApp.elapsedMin(iso)));
        if (m < 60) return m + ' นาที';
        if (m < 60 * 24) return Math.floor(m / 60) + ' ชม.';
        return Math.floor(m / 60 / 24) + ' วัน';
    },

    /* ══════════════════════════════════════════════════════
       DETAIL
       ══════════════════════════════════════════════════════ */
    renderDetail() {
        const e = CFApp.esc;
        const id = this.state.selectedId;
        const o = id ? CFStore.byId('orders', id) : null;

        document.getElementById('emptyState').style.display = o ? 'none' : '';
        document.getElementById('detailWrap').style.display = o ? '' : 'none';
        // ยังไม่มีใบให้ดู → ซ่อนแผง "การดำเนินการ" (ว่างทั้งแผงดูเหมือนหน้าเสีย) · cols-2 ของ DS ซ่อนแผงขวาให้
        const shell = document.getElementById('shell');
        shell.classList.toggle('cols-3', !!o);
        shell.classList.toggle('cols-2', !o);

        if (!o) {
            document.getElementById('actionPane').innerHTML = '<div class="ds-empty-sm">ยังไม่ได้เลือกออเดอร์</div>';
            // ไม่มีใบให้เลือกเลย — อย่าบอกให้ "เลือกจากรายการทางซ้าย"
            const none = !this.filtered().length;
            document.getElementById('emptyState').innerHTML = `
                <div class="ds-empty-state-icon"><i data-lucide="receipt-text"></i></div>
                <div class="ds-empty-state-title">${none ? 'ยังไม่มีบิลให้ดู' : 'เลือกบิลจากรายการทางซ้าย'}</div>
                <div class="ds-empty-state-desc">${none
                    ? 'บิลที่จบแล้ว (ส่งมอบ / ยกเลิก / คืนเงิน) จะขึ้นที่นี่ · บิลที่ยังไม่จบอยู่หน้าแคชเชียร์'
                    : 'เพื่อดูรายการสินค้า การชำระเงิน และประวัติการทำงาน'}</div>`;
            return;
        }

        /* ── context bar ── */
        // ไอคอนบอกกินที่ร้าน/กลับบ้าน — เดิมเป็นตัวแรกของเลขออเดอร์ ซึ่งเป็น "A" ทุกใบ ไม่ได้บอกอะไร
        const away = o.diningOption === 'TAKE_AWAY';
        const av = document.getElementById('ctxAvatar');
        av.classList.toggle('cf-av-away', away);
        av.title = away ? 'กลับบ้าน' : 'กินที่ร้าน';
        av.innerHTML = `<i data-lucide="${away ? 'shopping-bag' : 'coffee'}"></i>`;
        document.getElementById('ctxNo').textContent = o.orderNo;
        document.getElementById('ctxChip').innerHTML = CFApp.statusChip(o.status);
        // ข้อมูลหลักเป็นช่องสั้น ๆ มีหัวข้อกำกับ — เดิมเป็นตัวเทาเล็กเรียงติดกันบรรทัดเดียว อ่านยาก
        const ended = ['COMPLETED', 'CANCELLED', 'VOIDED', 'REFUNDED'].includes(o.status);
        const fact = (label, value, cls) => `<span class="cf-fact ${cls || ''}"><small>${label}</small><b>${value}</b></span>`;
        document.getElementById('ctxFacts').innerHTML =
            fact('ยอด', CFApp.baht(o.total), 'big') +
            fact('จ่ายด้วย', o.paymentMethod === 'CASH' ? 'เงินสด' : 'QR / โอน') +
            fact('ตู้', e(o.kioskId || '—')) +
            fact('สั่งเมื่อ', e(CFApp.dateTime(o.createdAt)) +
                 (ended ? '' : ` <em>· ผ่านไป ${this.ago(o.createdAt)}</em>`));

        // การ์ดเตือนโผล่เฉพาะตอนที่การชำระมีปัญหา
        // คนที่รับเงินได้มีปุ่ม "ตรวจสลิป" ในแผงขวาอยู่แล้ว — การ์ดแดงซ้ำกัน แสดงเฉพาะคนที่กดไม่ได้ (ให้รู้ว่าต้องตามใคร)
        // ยกเว้นชำระไม่สำเร็จ ที่ไม่มีปุ่มตรวจสลิป
        const alertNeeded = o.status === 'PAYMENT_FAILED' ||
            (['PAYMENT_REVIEW', 'PAYMENT_TIMEOUT'].includes(o.status) && !CFAuth.can('PAY_RECEIVE'));
        document.getElementById('ctxAside').innerHTML = alertNeeded ? `
            <div class="ds-alert-card" onclick="OrdersPage.toCashier('${o.id}')">
                <i data-lucide="alert-triangle" class="ac-ico"></i>
                <div class="ac-body">
                    <span class="ac-label">ต้องตรวจสอบ</span>
                    <strong>${e(CFApp.statusLabel(o.status))}</strong>
                </div>
                <i data-lucide="chevron-right" class="ac-view"></i>
            </div>` : '';

        /* ── §7 stepper ──
           สถานะย่อยของการชำระ (รอเงินสด / รอ QR / หมดเวลา / รอตรวจสอบ) ยุบเป็นขั้นเดียว
           ไม่งั้นออเดอร์ที่รอชำระอยู่จะไม่มีขั้นไหน active เลย */
        // at = เวลาที่ผ่านขั้นนั้น (จาก order.ts) แสดงใต้ขั้น — ดูปราดเดียวรู้ว่าค้างขั้นไหนมานานเท่าไร
        const STEPS = [
            // ชื่อขั้นใช้คำเดียวกับป้ายสถานะ (CF_STATUS) — "กำลังเตรียม" บนแถบ = "กำลังทำ · กำลังเตรียม" บนป้าย
            { label: 'สั่ง',          states: ['ORDER_CONFIRMED'], at: 'createdAt' },
            { label: 'รับเงิน',       states: ['WAITING_CASH', 'WAITING_PAYMENT', 'PAYMENT_TIMEOUT', 'PAYMENT_REVIEW', 'PAYMENT_FAILED', 'PAID'], at: 'paidAt' },
            { label: 'เข้าครัว',      states: ['SENT_TO_KITCHEN'], at: 'sentAt' },
            { label: 'กำลังเตรียม',   states: ['PREPARING'], at: 'preparingAt' },
            { label: 'พร้อมรับ',      states: ['READY'], at: 'readyAt' },
            { label: 'ส่งมอบ',        states: ['SERVED'], at: 'servedAt' },
            { label: 'เสร็จ',         states: ['COMPLETED'], at: 'completedAt' },
        ];
        const dead = ['CANCELLED', 'VOIDED', 'REFUNDED'];
        const pos = STEPS.findIndex((s) => s.states.includes(o.status));

        const ts = o.ts || {};
        // ขั้นชำระเงินที่มีปัญหา (หมดเวลา/รอตรวจ/ไม่สำเร็จ) เป็นสีเตือน ไม่ใช่สีปกติ
        const trouble = ['PAYMENT_TIMEOUT', 'PAYMENT_REVIEW', 'PAYMENT_FAILED'].includes(o.status);
        document.getElementById('stepper').innerHTML = dead.includes(o.status)
            ? `<div class="cf-steps-dead"><i data-lucide="x-circle" class="icon-sm"></i>
                 ${e(CFApp.statusLabel(o.status))}${o.cancelReason ? ' — ' + e(o.cancelReason) : ''}</div>`
            : STEPS.map((s, i) => {
                // เสร็จสิ้นแล้ว = ทุกขั้นผ่าน (ไม่มีขั้นไหนค้าง)
                const done = pos >= 0 && (i < pos || (i === pos && o.status === 'COMPLETED'));
                const cur = i === pos && !done;
                const at = ts[s.at] || (i === 0 ? o.createdAt : null);
                const cls = done ? 'done' : cur ? (trouble ? 'cur warn' : 'cur') : '';
                return `<div class="cf-step ${cls}">
                    <span class="cf-step-dot">${done ? '<i data-lucide="check"></i>' : i + 1}</span>
                    <span class="cf-step-label">${e(s.label)}</span>
                    <span class="cf-step-time">${done && at ? CFApp.time(at) : cur ? (trouble ? e(CFApp.statusLabel(o.status)) : 'ตอนนี้') : ''}</span>
                </div>`;
            }).join('');

        this.renderItems(o);
        this.renderPayment(o);
        this.renderAudit(o);
        this.renderActions(o);
    },

    renderItems(o) {
        const e = CFApp.esc;
        const items = CFOrders.items(o.id);

        const rollup = Object.keys(o.stationStatus || {}).map((st) => {
            const ready = o.stationStatus[st] === 'READY';
            return `<span class="sip-chip ${ready ? 'sip-chip-success' : 'sip-chip-progress'}">
                        ${e(CFApp.stationLabel(st))} · ${ready ? 'พร้อม' : 'กำลังทำ'}</span>`;
        }).join(' ');

        document.getElementById('tabItems').innerHTML = `
            ${rollup ? `<div class="ds-chips" style="margin-bottom:12px">${rollup}</div>` : ''}
            <div class="table-responsive">
                <table class="data-table compact" id="odItems">
                    <thead><tr>
                        <th>สินค้า</th><th>ตัวเลือก</th><th>จำนวน</th>
                        <th class="cf-right">ราคา/หน่วย</th><th>สถานี</th><th class="cf-right">รวม</th>
                    </tr></thead>
                    <tbody>
                        ${items.map((i) => `<tr>
                            <td class="td-name">${e(i.nameSnapshot)}${e(CFApp.serveSuffix(i.serveType))}</td>
                            <td class="td-sub">${e(CFApp.modsText(i)) || '—'}</td>
                            <td>${i.qty}</td>
                            <td class="cf-right cf-money">${CFApp.money(i.unitPrice)}</td>
                            <td>${CFApp.stationChip(i.station)}</td>
                            <td class="cf-right cf-money">${CFApp.money(i.unitPrice * i.qty)}</td>
                        </tr>`).join('')}
                    </tbody>
                    <!-- ยอดสุทธิอยู่ใน tfoot — ถ้าอยู่ใน tbody DataTables จะเรียง/ค้นหามันเป็นสินค้าตัวหนึ่ง (21/10/2569) -->
                    <tfoot><tr>
                        <td colspan="5" class="cf-right td-name">ยอดสุทธิ</td>
                        <td class="cf-right td-name cf-money">${CFApp.money(o.total)}</td>
                    </tr></tfoot>
                </table>
            </div>`;
        CFTable.mount('odItems');
    },

    /**
     * สลิปที่ลูกค้าสแกนที่คีออสก์ — ย้อนดูได้ตลอด ไม่ใช่แค่ตอนแคชเชียร์ตรวจ
     * (ลูกค้ามาโต้แย้งทีหลัง / เจ้าของร้านตรวจย้อนหลังว่ามีใครเอาสลิปร้านอื่นมาใช้)
     * ภาพเป็นข้อมูลส่วนตัวของลูกค้า — เซิร์ฟเวอร์ให้ดูเฉพาะคนที่รับเงินได้ จึงซ่อนจากคนอื่นด้วย
     */
    slipHtml(o) {
        const e = CFApp.esc;
        const slips = CFStore.where('slips', (s) => s.orderId === o.id);
        if (!slips.length) return '';
        const canSee = CFAuth.can('PAY_RECEIVE');
        return `
            <div class="ds-section-label" style="margin-top:16px">สลิปที่ลูกค้าสแกน (${slips.length})</div>
            ${slips.map((s) => `
                <table class="ds-table-grid" style="margin-bottom:8px">
                    <tr><th class="l" style="width:30%">สแกนเมื่อ</th><td class="l">${CFApp.dateTime(s.createdAt)}</td></tr>
                    <tr><th class="l">ธนาคารผู้โอน</th><td class="l">${e(s.bankName || s.bankCode || '—')}</td></tr>
                    <tr><th class="l">เลขอ้างอิง</th><td class="l">${e(s.ref || '—')}</td></tr>
                </table>
                ${CFApp.slipOcrHtml(s)}
                ${s.hasImage && canSee ? `
                <button type="button" class="cf-slip-thumb" title="ดูภาพเต็ม"
                        onclick="CFApp.showImage('/api/slips/${e(s.id)}/image', 'สลิป ${e(o.orderNo)}')">
                    <img src="/api/slips/${e(s.id)}/image" alt="ภาพสลิป"
                         style="display:block;width:100%;max-height:420px;object-fit:contain;
                                background:#111;border-radius:8px;margin-bottom:12px">
                </button>` : `<div class="ds-note" style="margin-bottom:12px">${s.hasImage
                    ? 'มีภาพสลิป — ดูได้เฉพาะพนักงานที่รับเงินได้'
                    : 'ไม่มีภาพสลิป'}</div>`}`).join('')}`;
    },

    renderPayment(o) {
        const e = CFApp.esc;
        const p = CFOrders.payment(o.id);
        if (!p) {
            document.getElementById('tabPayment').innerHTML =
                `<div class="ds-empty-sm">ยังไม่ได้รับชำระ${CF_WAITING_PAY.includes(o.status) || ['PAYMENT_REVIEW', 'PAYMENT_TIMEOUT'].includes(o.status)
                    ? ' — ตรวจ/รับเงินได้ที่ปุ่มด้านขวา' : ''}</div>` + this.slipHtml(o);
            return;
        }
        const row = (label, value) => `<tr><th class="l" style="width:30%">${label}</th><td class="l">${value}</td></tr>`;
        document.getElementById('tabPayment').innerHTML = `
            <table class="ds-table-grid">
                ${row('วิธีชำระ', p.method === 'CASH' ? 'เงินสด' : 'QR / โอน')}
                ${row('ยอดชำระ', CFApp.baht(p.amount))}
                ${p.method === 'CASH' ? row('รับเงิน', p.received != null ? CFApp.baht(p.received) : '—') : ''}
                ${p.method === 'CASH' ? row('เงินทอน', p.change != null ? CFApp.baht(p.change) : '—') : ''}
                ${p.method === 'QR' ? row('ธนาคาร', e(p.bank || '—')) : ''}
                ${p.method === 'QR' ? row('เลขอ้างอิง', e(p.ref || '—')) : ''}
                ${p.method === 'QR' ? row('เวลาทำรายการ', p.txAt ? CFApp.dateTime(p.txAt) : '—') : ''}
                ${row('ผู้ยืนยัน', e(CFApp.actorName(p.verifiedBy)))}
                ${p.overrideBy ? row('ยืนยันแทนระบบโดย', e(CFApp.actorName(p.overrideBy))) : ''}
                ${p.overrideBy ? row('เหตุผล', e(p.overrideReason || '—')) : ''}
                ${p.overrideBy ? row('เวลาที่ยืนยันแทน', CFApp.dateTime(p.overrideAt)) : ''}
                ${row('สถานะ', e({ PAID: 'รับเงินแล้ว', REFUNDED: 'คืนเงินแล้ว', PENDING: 'รอรับเงิน' }[p.status] || p.status))}
            </table>
            ${o.cancelReason ? `<div class="sip-banner sip-banner-danger">
                <i data-lucide="info" class="icon-sm"></i> ${e(o.cancelReason)}</div>` : ''}
            ${this.slipHtml(o)}`;
    },

    renderAudit(o) {
        const e = CFApp.esc;
        const logs = CFOrders.historyOf(o.id);
        document.getElementById('auditBadge').textContent = logs.length;

        const variant = (a) => {
            if (['CANCELLED', 'VOIDED', 'REFUNDED', 'PAYMENT_FAILED'].includes(a.newStatus)) return 'danger';
            if (['PAID', 'READY', 'COMPLETED'].includes(a.newStatus)) return 'success';
            if (['PRINT', 'PAYMENT_OVERRIDE', 'PAYMENT_TIMEOUT'].includes(a.eventType)) return 'warning';
            return 'info';
        };

        document.getElementById('auditList').innerHTML = logs.length ? logs.map((a) => `
            <div class="ds-timeline-item ${variant(a)}">
                <div class="flex flex-between gap-md">
                    <strong>${e(a.newStatus ? CFApp.statusLabel(a.newStatus) : DashLabel(a.eventType))}</strong>
                    <span class="ds-timeline-time">${CFApp.timeSec(a.ts)}</span>
                </div>
                <div class="text-muted">
                    ${[CFApp.actorName(a.actor), a.device, a.reason].filter(Boolean).map(e).join(' · ')}
                </div>
            </div>`).join('') : '<div class="ds-empty-sm">ยังไม่มีประวัติ</div>';
    },

    /* ══════════════════════════════════════════════════════
       ACTIONS (แผงขวา)
       ══════════════════════════════════════════════════════ */
    renderActions(o) {
        const e = CFApp.esc;
        const stations = Object.keys(o.stationStatus || {});
        const station = this.state.slipStation && stations.includes(this.state.slipStation)
            ? this.state.slipStation : stations[0];

        // ปุ่มสร้างจาก CF_FLOW เท่านั้น — ปุ่มที่กดแล้วพังจึงไม่มีทางโผล่
        let nexts = CFOrders.nextStates(o).filter((s) => !CF_REASON_REQUIRED.includes(s));
        const destructive = CFOrders.nextStates(o).filter((s) => CF_REASON_REQUIRED.includes(s));

        // ลูกค้าสแกนสลิปที่ตู้ไม่ติด / QR หมดเวลา / รอรับเงินสด → เปิด drawer รับเงิน/ตรวจสลิปในหน้านี้
        // (กล้องสแกนสลิปจากมือถือลูกค้า + ตรวจยอด + รับเงินสด) — โค้ดเดียวกับหน้าแคชเชียร์ ไม่ทำซ้ำ
        const payAct = CFAuth.can('PAY_RECEIVE') && {
            PAYMENT_REVIEW:  ['scan-line', 'ตรวจสลิป / สแกนสลิปที่เคาน์เตอร์'],
            PAYMENT_TIMEOUT: ['scan-line', 'สแกนสลิปที่เคาน์เตอร์'],
            WAITING_PAYMENT: ['scan-line', 'สแกนสลิปที่เคาน์เตอร์'],
            WAITING_CASH:    ['banknote', 'รับเงินสด'],
        }[o.status];

        // มีปุ่มรับเงิน/ตรวจสลิปแล้ว ไม่ต้องมี "ยืนยันการชำระ" แบบกดเดียวอีกปุ่ม — ยืนยันในแผงตรวจสลิป (ต้องเลือกเหตุผล)
        if (payAct) nexts = nexts.filter((s) => s !== 'PAID');

        document.getElementById('actionPane').innerHTML = `
            ${payAct ? `
            <div class="ds-section-label" style="padding:0 16px">การชำระเงิน</div>
            <div class="ds-actions cf-stack">
                <button class="btn btn-primary" onclick="OrdersPage.toCashier('${o.id}')">
                    <i data-lucide="${payAct[0]}" class="icon-sm"></i> ${payAct[1]}</button>
                <div class="ds-note">${o.status === 'WAITING_CASH'
                    ? 'กรอกเงินที่รับ ระบบคิดเงินทอนให้'
                    : 'สแกนสลิปจากมือถือลูกค้า แล้วยืนยัน'}</div>
            </div>` : ''}
            <div class="ds-section-label" style="padding:0 16px">เอกสาร</div>
            <div class="ds-actions cf-stack">
                ${CFAuth.can('PAY_RECEIVE') ? `<button class="btn btn-outline" onclick="CashierPage.reprintTicket('${o.id}')">
                    <i data-lucide="ticket" class="icon-sm"></i> พิมพ์บัตรคิวซ้ำ</button>` : ''}
                ${CFDocs.canReceipt(o) ? `<button class="btn btn-outline" onclick="CFDocs.previewReceipt('${o.id}')">
                    <i data-lucide="receipt" class="icon-sm"></i> ใบเสร็จรับเงิน
                    ${o.reprintCount ? `<span class="sip-chip sip-chip-amber">พิมพ์แล้ว ${o.reprintCount}</span>` : ''}
                </button>` : ''}
                ${stations.length ? `
                <select class="sip-select" onchange="OrdersPage.setSlipStation(this.value)">
                    ${stations.map((st) => `<option value="${st}" ${st === station ? 'selected' : ''}>
                        สลิปครัว — ${e(CFApp.stationLabel(st))}</option>`).join('')}
                </select>
                <button class="btn btn-outline" onclick="CFDocs.previewKitchenSlip('${o.id}','${station}')">
                    <i data-lucide="printer" class="icon-sm"></i> สลิปครัว
                </button>` : ''}
            </div>

            ${nexts.length || !payAct ? `
            <div class="ds-section-label" style="padding:0 16px">เปลี่ยนสถานะ</div>
            <div class="ds-actions cf-stack">
                ${nexts.length ? nexts.map((s) => `
                    <button class="btn ${s === 'PAID' && !payAct ? 'btn-primary' : 'btn-outline'}"
                            onclick="OrdersPage.go('${s}')">${e(CF_ACTION_LABEL[s] || s)}</button>`).join('')
                  : '<div class="ds-empty-sm">ออเดอร์นี้สิ้นสุดแล้ว</div>'}
            </div>` : ''}

            ${destructive.length ? `
            <div data-role-gate="ADMIN MANAGER">
                <div class="ds-section-label" style="padding:0 16px">จัดการพิเศษ</div>
                <div class="ds-actions cf-stack">
                    ${destructive.map((s) => `
                        <button class="btn btn-danger" onclick="OrdersPage.openReason('${s}')">
                            ${e(CF_ACTION_LABEL[s] || s)}</button>`).join('')}
                </div>
                <div class="ds-note cf-mx-16">ต้องระบุเหตุผล · บันทึกในประวัติ</div>
            </div>` : ''}`;

        CFApp.applyRoleGate(document.getElementById('actionPane'));
    },

    setSlipStation(st) { this.state.slipStation = st; },

    /** เปลี่ยนสถานะ — ถามก่อนทุกครั้ง กดพลาดแล้วย้อนไม่ได้ (เช่น ยืนยันการชำระแล้วออเดอร์เข้าครัวทันที) */
    async go(status) {
        const o = CFStore.byId('orders', this.state.selectedId);
        if (!o) return;
        // ผลที่ตามมาของแต่ละสถานะ — บอกให้ชัดก่อนกด
        const effect = {
            PAID: 'บันทึกว่าได้รับเงินแล้ว · ออเดอร์เข้าครัว · พิมพ์ใบเสร็จ',
            WAITING_CASH: 'เปลี่ยนเป็นรอรับเงินสดที่เคาน์เตอร์',
            SENT_TO_KITCHEN: 'ส่งออเดอร์เข้าครัว',
            PREPARING: 'ครัวเริ่มทำ',
            READY: 'ขึ้นจอเรียกคิวให้ลูกค้ามารับ',
            SERVED: 'บันทึกว่าส่งมอบให้ลูกค้าแล้ว',
            COMPLETED: 'ปิดรายการ — ออเดอร์จบ ไม่ขึ้นในรายการค้าง',
        }[status];
        const ok = await Drawer.confirm({
            title: (CF_ACTION_LABEL[status] || CFApp.statusLabel(status)) + '?',
            message: o.orderNo + ' · ' + CFApp.baht(o.total),
            lines: [CFApp.statusLabel(o.status) + '  →  ' + CFApp.statusLabel(status), effect],
            note: 'ย้อนกลับไม่ได้ — ตรวจเลขออเดอร์ให้ถูกก่อนกด',
            confirmText: CF_ACTION_LABEL[status] || 'ยืนยัน', cancelText: 'ยกเลิก', danger: false,
        });
        if (!ok) return;
        if (await CFOrders.transition(this.state.selectedId, status)) {
            showToast('เปลี่ยนสถานะเป็น "' + CFApp.statusLabel(status) + '" แล้ว', 'success');
        }
    },

    /* ── drawer เหตุผล: เก็บเหตุผลก่อน แล้วค่อย confirm ──
       ทำสลับกันไม่ได้ เพราะ Drawer.confirm resolve true เมื่อกด Enter */
    openReason(status) {
        const e = CFApp.esc;
        const o = CFStore.byId('orders', this.state.selectedId);
        this._reason = { status, text: '' };

        const presets = {
            CANCELLED: ['ลูกค้ายกเลิก', 'รอนานเกินไป', 'สั่งผิดรายการ', 'สินค้าหมด'],
            VOIDED:    ['กดผิด', 'ออเดอร์ซ้ำ', 'ทดสอบระบบ'],
            REFUNDED:  ['ชงผิดรายการ', 'สินค้าไม่ได้คุณภาพ', 'ลูกค้าขอคืนเงิน'],
            PAYMENT_FAILED: ['สลิปไม่ถูกต้อง', 'ยอดไม่ตรง', 'ไม่พบรายการเข้าบัญชี'],
        }[status] || [];

        Drawer.open({
            title: (CF_ACTION_LABEL[status] || status) + ' — ' + e(o.orderNo),
            width: CFApp.DRAWER_W,
            // จัดใหม่ 21/10/2569: การ์ดแบบเดียวกับทุก drawer · เหตุผลสำเร็จรูปเป็นกล่องเลือก (ตัวที่เลือกมีกรอบเขียว)
            contentHtml: `
                <div class="ds-warn"><i data-lucide="alert-triangle" class="icon-sm"></i>
                    การกระทำนี้ย้อนกลับไม่ได้ และจะถูกบันทึกพร้อมชื่อผู้ทำรายการ</div>` +
                CFApp.card('เหตุผล (บังคับ)', `
                ${presets.length ? CFApp.boxSel('rsPresets', presets.map((r) => [r, e(r)]), null, 'OrdersPage.pickReason($)') : ''}
                <div class="sip-field cf-mt-10">
                    <textarea class="sip-textarea" id="rsText" rows="3"
                              placeholder="เลือกด้านบน หรือพิมพ์เหตุผลเอง" oninput="OrdersPage.onReasonInput(this.value)"></textarea>
                </div>`, { hint: `ออเดอร์ ${e(o.orderNo)} · ${CFApp.baht(o.total)} · ${e(o.kioskId)}` }),
            footerHtml: `
                <button class="btn btn-outline" onclick="Drawer.close()">ยกเลิก</button>
                <button class="btn btn-danger" id="btnReason" disabled onclick="OrdersPage.commitReason()">
                    ${e(CF_ACTION_LABEL[status] || status)}
                </button>`,
            onOpen: () => refreshIcons(),
        });
    },

    onReasonInput(v) {
        this._reason.text = v;
        const b = document.getElementById('btnReason');
        if (b) b.disabled = !v.trim();
    },

    pickReason(r) {
        document.getElementById('rsText').value = r;
        CFApp.markBox('rsPresets', r);
        this.onReasonInput(r);
    },

    async commitReason() {
        const { status, text } = this._reason;
        if (!text.trim()) return;
        if (document.activeElement) document.activeElement.blur();

        const o = CFStore.byId('orders', this.state.selectedId);
        const ok = await Drawer.confirm({
            title: (CF_ACTION_LABEL[status] || status) + '?',
            message: 'ออเดอร์ ' + o.orderNo + ' · ' + CFApp.baht(o.total),
            lines: [text],
            confirmText: CF_ACTION_LABEL[status] || 'ยืนยัน', danger: true,
        });
        if (!ok) return;

        if (await CFOrders.transition(this.state.selectedId, status, { reason: text })) {
            Drawer.close();
            showToast('บันทึกแล้ว', 'success');
        }
    },

    boot() {
        CFApp.boot({ page: 'orders' });
        // มาจากหน้าแคชเชียร์ "จัดการเพิ่มเติม" (?order=…) — เปิดใบนั้นเลย แม้ยังไม่จบ (ไม่อยู่ในรายการ)
        const want = new URLSearchParams(location.search).get('order');
        if (want) {
            history.replaceState(null, '', location.pathname);
            this.select(want);
        }
        this.render();                     // ไม่มีลิงก์ → render เลือกใบแรกให้เอง
        CFStore.subscribe(() => this.render());
        // เปิดหน้าค้างข้ามเวลาเริ่มวัน (เช่น ตี 4) — สลับไปวันทำการใหม่เอง
        this._day = this.today();
        setInterval(() => {
            const t = this.today();
            if (t !== this._day) { this._day = t; if (!this.state.day) this.render(); }
        }, 60000);
    },
};

/** ป้ายชื่อเหตุการณ์ — ที่เดียวกับหน้าภาพรวม (CFApp.eventLabel) */
function DashLabel(ev) { return CFApp.eventLabel(ev); }

window.OrdersPage = OrdersPage;
CFBoot.ready(() => OrdersPage.boot());
