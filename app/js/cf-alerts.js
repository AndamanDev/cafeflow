/**
 * CafeFlow — เสียงแจ้งเตือนหน้าพนักงาน (แคชเชียร์ · ครัว)
 * ══════════════════════════════════════════════════════════════════
 * หน้าพนักงานอัปเดตข้อมูลเองอยู่แล้ว แต่ "เงียบ" — พนักงานที่ไม่ได้มองจอพลาด
 * ตัวนี้ดูการเปลี่ยนแปลงของข้อมูล แล้วส่งเสียง + ป้าย + ตัวเลขบนแท็บ
 *
 * เตือนเฉพาะเรื่องที่ต้องมีคนลุกไปทำ — เตือนทุกเรื่องแล้วคนจะชินจนไม่สนใจ
 *   แคชเชียร์  🔔 รอจ่ายเงินสด · ส่งสลิปแล้ว
 *              🚨 ลูกค้าเรียกพนักงาน · สลิปไม่ตรง · เครื่องพิมพ์พิมพ์ไม่ออก
 *   ครัว       🛎 ออเดอร์ใหม่เข้าครัว
 *
 * เสียงสร้างในเบราว์เซอร์ (Web Audio) ไม่มีไฟล์เสียง ไม่ใช้เน็ต
 * ⚠️ เบราว์เซอร์ไม่ยอมเล่นเสียงจนกว่าจะมีคนแตะหน้านั้น 1 ครั้ง — จึงมีปุ่ม "แตะเพื่อเปิดเสียง"
 * เปิด/ปิดเสียงจำแยกต่อเครื่อง (แคชเชียร์เครื่องที่สองปิดได้ ไม่ดังซ้ำ)
 */
const CFAlerts = {
    ctx: null,
    unseen: 0,
    baseTitle: document.title,

    get muted() {
        try { return localStorage.getItem('cafeflow.sound') === 'off'; } catch (e) { return false; }
    },
    set muted(v) {
        try { localStorage.setItem('cafeflow.sound', v ? 'off' : 'on'); } catch (e) { /* โหมดส่วนตัว */ }
    },

    /* ── เสียง ─────────────────────────────────────────── */
    audio() {
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            this.ctx = new AC();
        }
        return this.ctx;
    },

    tone(freq, start, dur, { type = 'sine', gain = 0.25, decay = false } = {}) {
        const ctx = this.ctx;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type;
        o.frequency.value = freq;
        const t = ctx.currentTime + start;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur * (decay ? 1 : 0.9));
        o.connect(g).connect(ctx.destination);
        o.start(t);
        o.stop(t + dur + 0.05);
    },

    play(kind) {
        if (this.muted) return;
        const ctx = this.audio();
        if (!ctx || ctx.state !== 'running') return;
        if (kind === 'urgent') {
            // สามจังหวะสองรอบ — ต่างจากเสียงปกติชัดเจน ได้ยินแล้วรู้ว่าต้องไปดู
            [0, 0.2, 0.4, 0.9, 1.1, 1.3].forEach((s) => this.tone(1040, s, 0.13, { type: 'triangle', gain: 0.35 }));
        } else if (kind === 'bell') {
            // กริ่งครัว — เสียงโลหะก้องยาว
            [[1568, 0.3], [2349, 0.12], [3136, 0.08]].forEach(([f, g]) =>
                this.tone(f, 0, 1.4, { gain: g, decay: true }));
        } else {
            // ติ๊ง-ต่อง สั้น ๆ สุภาพ
            this.tone(880, 0, 0.18, { gain: 0.22 });
            this.tone(1320, 0.16, 0.28, { gain: 0.22 });
        }
    },

    /* ── ปุ่มเปิด/ปิดเสียง ─────────────────────────────── */
    mountToggle() {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'cf-sound-toggle';
        document.body.appendChild(b);
        const paint = () => {
            const ctx = this.ctx;
            const locked = !ctx || ctx.state !== 'running';
            b.classList.toggle('is-locked', locked && !this.muted);
            b.classList.toggle('is-off', this.muted);
            b.textContent = this.muted ? '🔕 ปิดเสียงเตือนอยู่'
                : locked ? '🔔 แตะเพื่อเปิดเสียงเตือน' : '🔔 เสียงเตือนเปิดอยู่';
        };
        // แตะตรงไหนของหน้าก็ได้ ปลดล็อกเสียงของเบราว์เซอร์
        const unlock = () => {
            const ctx = this.audio();
            if (ctx && ctx.state !== 'running') ctx.resume().then(paint).catch(() => {});
        };
        document.addEventListener('pointerdown', unlock, { capture: true });
        b.onclick = (ev) => {
            ev.stopPropagation();
            const ctx = this.audio();
            if (ctx && ctx.state !== 'running') { ctx.resume().then(() => { paint(); this.play('chime'); }); return; }
            this.muted = !this.muted;
            paint();
            if (!this.muted) this.play('chime');
        };
        paint();
    },

    /* ── แจ้งเตือนหนึ่งเรื่อง ──────────────────────────── */
    notify(kind, text) {
        this.play(kind);
        if (window.showToast) showToast(text, kind === 'urgent' ? 'error' : 'info', kind === 'urgent' ? 8000 : 4000);
        // สลับไปแท็บอื่นอยู่ → ตัวเลขบนชื่อแท็บบอกว่ามีเรื่องรอ
        if (document.hidden) {
            this.unseen++;
            document.title = '(' + this.unseen + ') ' + this.baseTitle;
        }
    },

    start(page) {
        this.baseTitle = document.title;
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) { this.unseen = 0; document.title = this.baseTitle; }
        });
        this.mountToggle();
        if (page === 'cashier') this.watchCashier();
        if (page === 'kds') this.watchKitchen();
    },

    /**
     * เทียบสถานะออเดอร์กับรอบก่อน — รอบแรกเป็นแค่ฐาน ไม่เตือน
     * (ไม่งั้นเปิดหน้ามาแล้วดังรัวทุกออเดอร์ที่ค้างอยู่)
     */
    diffOrders(onChange) {
        let prev = null;
        const run = () => {
            const now = {};
            CFStore.all('orders').forEach((o) => { now[o.id] = o.status; });
            if (prev) {
                CFStore.all('orders').forEach((o) => {
                    if (prev[o.id] !== o.status) onChange(o, prev[o.id] || null);
                });
            }
            prev = now;
        };
        run();
        CFStore.subscribe(run);
    },

    watchCashier() {
        const money = (o) => '฿' + CFApp.money(o.total);
        const slipOf = (id) => CFStore.where('slips', (s) => s.orderId === id).slice(-1)[0] || null;

        this.diffOrders((o) => {
            if (o.status === 'WAITING_CASH') {
                this.notify('chime', o.orderNo + ' รอจ่ายเงินสด ' + money(o));
            } else if (o.status === 'PAYMENT_REVIEW') {
                // ไม่มีสลิป = ลูกค้ากด "แจ้งพนักงาน" ที่คีออสก์ — มีคนยืนรออยู่
                if (slipOf(o.id)) this.notify('chime', o.orderNo + ' ส่งสลิปแล้ว รอตรวจ ' + money(o));
                else this.notify('urgent', 'ลูกค้าที่คีออสก์เรียกพนักงาน · ' + o.orderNo + ' ' + money(o));
            }
        });

        // ผลอ่านสลิปมาทีหลัง ~5 วิ — สลิปที่เพิ่งกลายเป็น "ไม่ตรง" ต้องดังเตือน
        let seenFail = null;
        const slips = () => {
            const fails = CFStore.all('slips').filter((s) => s.verdict === 'FAIL');
            if (seenFail) {
                fails.filter((s) => !seenFail.has(s.id)).forEach((s) => {
                    const o = CFStore.byId('orders', s.orderId);
                    const why = ((s.ocr && s.ocr.notes) || []).filter((n, i) =>
                        (i === 0 && s.ocr.checks.amount === 'FAIL') || (i === 1 && s.ocr.checks.date === 'FAIL'));
                    this.notify('urgent', 'สลิปไม่ตรง · ' + (o ? o.orderNo : '') + (why.length ? ' — ' + why.join(' · ') : ''));
                });
            }
            seenFail = new Set(fails.map((s) => s.id));
        };
        slips();
        CFStore.subscribe(slips);

        // เครื่องพิมพ์พิมพ์ไม่ออก (กระดาษหมด/สายหลุด) — ถามคิวพิมพ์ทุก 20 วิ
        let seenJobs = null;
        const jobs = () => CFApi.get('/api/print/queue').then((r) => {
            const failed = r.failed || [];
            if (seenJobs) {
                failed.filter((j) => !seenJobs.has(String(j.id))).forEach((j) => {
                    const o = j.order_id ? CFStore.byId('orders', j.order_id) : null;
                    this.notify('urgent', 'เครื่องพิมพ์พิมพ์ไม่ออก' + (o ? ' · ' + o.orderNo : '') +
                        (j.last_error ? ' — ' + j.last_error : ''));
                });
            }
            seenJobs = new Set(failed.map((j) => String(j.id)));
        }).catch(() => {});
        jobs();
        setInterval(jobs, 20000);
    },

    watchKitchen() {
        this.diffOrders((o, before) => {
            if (o.status === 'SENT_TO_KITCHEN' && before !== 'SENT_TO_KITCHEN') {
                const n = CFOrders.items(o.id).filter((i) => i.itemStatus !== 'VOID').length;
                this.notify('bell', 'ออเดอร์ใหม่ ' + o.orderNo + ' · ' + n + ' รายการ');
            }
        });
    },
};

window.CFAlerts = CFAlerts;
