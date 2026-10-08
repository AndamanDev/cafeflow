/**
 * CafeFlow — จอแสดงคิวลูกค้า (§22, §36)
 * ══════════════════════════════════════════════════════════════════
 * ข้อจำกัดที่ต่างจากหน้าอื่นทั้งหมด:
 *   · ไม่มีคนกด — ทุกอย่างต้องหมุนเองและกู้ตัวเองได้
 *   · อ่านจากระยะ 3–8 เมตร — เลขคิวต้องใหญ่กว่าทุกอย่างในระบบ
 *   · เสียบทิ้งไว้เป็นเดือน — ห้ามมี memory leak และต้องรอดเมื่อเน็ตสะดุด
 *
 * ไม่ใช้ CFStore เพราะจอนี้ไม่ควรถือข้อมูลทั้งร้าน (ดูเหตุผลใน api/src/routes/display.js)
 * ดึงเฉพาะ /api/display แล้ววาด
 */
const DisplayPage = {

    state: { preparing: [], ready: [], highlights: [], shopName: '', hi: 0, lastReady: null,
             cfg: { highlights: true, highlightSec: 7, sound: true, ticker: '' } },

    POLL_MS: 4000,          // สำรองเมื่อ SSE หลุด
    FLASH_MS: 8000,         // ไฮไลต์คิวที่เพิ่งพร้อม

    /* ══════════════════════════════════════════════════════
       BOOT
       ══════════════════════════════════════════════════════ */
    async boot() {
        // ใช้ธีมที่จำไว้ก่อน — หน้ากำลังเชื่อมต่อ/จับคู่จะได้ไม่กระพริบสีผิดตอนเปิด
        try { this.applyTheme(localStorage.getItem('cfdTheme')); } catch { /* ไม่มี storage ก็ใช้โทนสว่าง */ }
        try {
            await this.refresh();
            this.loadHighlights();
            this.start();
        } catch (err) {
            if (err.status === 401) { this.showPair(); return; }
            this.showBoot('เชื่อมต่อไม่ได้', err.message || 'ติดต่อเซิร์ฟเวอร์ของร้านไม่ได้');
            setTimeout(() => this.boot(), 5000);   // ไม่มีคนกดปุ่มลองใหม่ ต้องลองเอง
        }
    },

    start() {
        // SSE เป็นตัวหลัก · poll เป็นตัวกันเหนียวเมื่อสายหลุดเงียบ ๆ
        this._stopStream = CFApi.stream(
            () => this.refresh().catch(() => {}),
            (s) => document.body.classList.toggle('cfd-offline', s !== 'online'));

        clearInterval(this._poll);
        this._poll = setInterval(() => this.refresh().catch(() => {}), this.POLL_MS);

        this.startRotate();

        // เมนูแนะนำเปลี่ยนไม่บ่อย ดึงชั่วโมงละครั้งพอ
        clearInterval(this._hiTimer);
        this._hiTimer = setInterval(() => this.loadHighlights(), 3600 * 1000);

        // นาฬิกาบนจอ
        clearInterval(this._clock);
        this._clock = setInterval(() => this.renderClock(), 1000);

        // จอที่จับคู่แล้วต้องรายงานตัว ไม่งั้นหน้าภาพรวมจะขึ้นว่าออฟไลน์ตลอด
        clearInterval(this._beat);
        CFApi.heartbeat().catch(() => {});
        this._beat = setInterval(() => CFApi.heartbeat().catch(() => {}), 20000);
        // ทีวีแขวนผนัง ไม่มีใครกด F5 ให้ — มีเวอร์ชันใหม่ก็โหลดใหม่เลย
        if (!this._ver) this._ver = CFApi.watchVersion(() => location.reload());
    },

    /** สลับเมนูแนะนำ — ความเร็วมาจากหน้าตั้งค่า (displayHighlightSec) */
    startRotate() {
        clearInterval(this._rotate);
        this._rotate = setInterval(() => {
            if (this.state.highlights.length > 1) {
                this.state.hi = (this.state.hi + 1) % this.state.highlights.length;
                this.renderHighlight();
            }
        }, (this.state.cfg.highlightSec || 7) * 1000);
    },

    /**
     * ค่าตั้งของจอคิวจากหน้าตั้งค่า (ตั้งค่าจอแสดงคิว) — มากับ /api/display ทุกครั้ง
     * บันทึกแล้ว SSE ปลุก refresh() จอจึงเปลี่ยนตามเองภายในไม่กี่วินาที
     */
    applyConfig(c) {
        c = c || {};
        this.applyTheme(c.theme);
        const prevSec = this.state.cfg.highlightSec;
        this.state.cfg = {
            highlights: c.highlights !== false,
            highlightSec: c.highlightSec || 7,
            sound: c.sound !== false,
            ticker: c.ticker || '',
        };
        document.body.classList.toggle('cfd-noad', !this.state.cfg.highlights);
        if (this._rotate && prevSec !== this.state.cfg.highlightSec) this.startRotate();
        this.renderTicker();
    },

    /**
     * แถบข้อความประกาศล่างจอ — อยู่นอก #cfdStage เพราะ render() เขียนทับ stage ทุก 4 วิ
     * ถ้าอยู่ข้างใน ตัววิ่งจะเริ่มใหม่ทุกครั้งที่ refresh
     */
    renderTicker() {
        const text = this.state.cfg.ticker;
        let bar = document.getElementById('cfdTicker');
        if (!text) { if (bar) bar.hidden = true; return; }
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'cfdTicker';
            bar.className = 'cfd-ticker';
            bar.innerHTML = '<span></span>';
            document.body.appendChild(bar);
        }
        bar.hidden = false;
        const span = bar.firstElementChild;
        if (span.textContent === text) return;       // เหมือนเดิม — ไม่แตะ ตัววิ่งจะได้ไม่สะดุด
        span.textContent = text;
        // วิ่งจากขวาไปซ้ายเสมอ — วัดความกว้างก่อนใส่คลาส (คลาสเติมระยะเริ่มต้นนอกจอ)
        // ระยะทาง = ความกว้างข้อความ + ความกว้างจอ หารความเร็วคงที่ ข้อความสั้นยาวจึงวิ่งเร็วเท่ากัน
        bar.classList.remove('is-scroll');
        const px = span.offsetWidth + bar.clientWidth;
        bar.style.setProperty('--dur', Math.max(8, Math.round(px / 120)) + 's');
        void bar.offsetWidth;                         // ให้ animation เริ่มใหม่เมื่อเปลี่ยนข้อความ
        bar.classList.add('is-scroll');
    },

    /** ธีมมาจากหน้าตั้งค่า (displayTheme) — บันทึกแล้ว SSE ปลุก refresh() จอเปลี่ยนเองภายในไม่กี่วินาที */
    applyTheme(theme) {
        const dark = theme === 'dark';
        document.body.classList.toggle('cfd-dark', dark);
        try { localStorage.setItem('cfdTheme', dark ? 'dark' : 'light'); } catch { /* ไม่เป็นไร */ }
    },

    async refresh() {
        const d = await CFApi.get('/api/display');
        const prevReady = new Set(this.state.ready.map((x) => x.orderNo));

        this.state.shopName = d.shopName;
        this.applyConfig(d.display || { theme: d.displayTheme });
        this.state.preparing = d.preparing;
        this.state.ready = d.ready;

        // คิวที่เพิ่งย้ายมาอยู่ "พร้อมรับ" — ต้องสะดุดตาและมีเสียงเรียก (§22, §31)
        const fresh = d.ready.filter((x) => !prevReady.has(x.orderNo));
        this.render();
        if (fresh.length && this._booted) {
            fresh.forEach((x) => this.flash(x.orderNo));
            this.ding();
        }
        this._booted = true;
    },

    async loadHighlights() {
        try {
            const r = await CFApi.get('/api/display/highlights');
            this.state.highlights = r.items || [];
            this.state.hi = 0;
            this.renderHighlight();
        } catch { /* ไม่มีเมนูแนะนำก็แค่ไม่มีอะไรขึ้นในช่องนั้น */ }
    },

    /* ══════════════════════════════════════════════════════
       เสียงและไฮไลต์
       ══════════════════════════════════════════════════════ */

    /**
     * เสียงเรียกคิว — สังเคราะห์ด้วย WebAudio ไม่ใช้ไฟล์เสียง
     * เพราะจอนี้ต้องทำงานได้แม้ไม่มีเน็ต และไฟล์เสียงคืออีกหนึ่งอย่างที่โหลดพลาดได้
     *
     * ⚠️ เบราว์เซอร์บล็อกเสียงจนกว่าจะมีการโต้ตอบจากคน — ทีวีที่ไม่มีใครแตะ
     *    จะเงียบตลอด จึงต้องมีปุ่ม "เปิดเสียง" ให้กดครั้งเดียวตอนติดตั้ง
     */
    ding() {
        if (!this.state.cfg.sound) return;          // ร้านปิดเสียงไว้ในหน้าตั้งค่า
        const ctx = this._audio;
        if (!ctx || ctx.state !== 'running') return;
        const now = ctx.currentTime;
        [880, 660].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, now + i * 0.18);
            gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.18 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.45);
            osc.connect(gain).connect(ctx.destination);
            osc.start(now + i * 0.18);
            osc.stop(now + i * 0.18 + 0.5);
        });
    },

    async enableSound() {
        try {
            this._audio = this._audio || new (window.AudioContext || window.webkitAudioContext)();
            await this._audio.resume();
            this.ding();
            this.render();
        } catch { /* เครื่องไม่รองรับเสียงก็ยังแสดงคิวได้ */ }
    },

    flash(orderNo) {
        const el = document.querySelector('[data-no="' + CSS.escape(orderNo) + '"]');
        if (!el) return;
        el.classList.add('is-new');
        setTimeout(() => el.classList.remove('is-new'), this.FLASH_MS);
    },

    /* ══════════════════════════════════════════════════════
       RENDER
       ══════════════════════════════════════════════════════ */
    esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },

    render() {
        const s = this.state;
        const soundOn = this._audio && this._audio.state === 'running';

        // หัวคอลัมน์มีภาษาอังกฤษด้วย — ลูกค้าต่างชาติอ่านเลขคิวได้แต่ไม่รู้ว่าอยู่ฝั่งไหน
        const col = (title, en, list, cls, empty) => `
            <section class="cfd-col ${cls}">
                <h2 class="cfd-col-head">
                    <span class="cfd-col-title"><i class="cfd-dot"></i>${title}<small>${en}</small></span>
                    <span class="cfd-col-count">${list.length}</span></h2>
                <div class="cfd-nums">${
                    list.length
                        ? list.map((x) => `<div class="cfd-num" data-no="${this.esc(x.orderNo)}">
                                ${this.esc(x.orderNo)}
                                ${x.takeAway ? '<span class="cfd-away">กลับบ้าน</span>' : ''}
                            </div>`).join('')
                        : `<div class="cfd-empty">${empty}</div>`
                }</div>
            </section>`;

        document.getElementById('cfdStage').innerHTML = `
            <header class="cfd-top">
                <div class="cfd-brand">${this.esc(s.shopName)}</div>
                <div class="cfd-right">
                    ${soundOn || !s.cfg.sound ? '' : `<button class="cfd-sound" onclick="DisplayPage.enableSound()">
                        🔔 เปิดเสียงเรียกคิว</button>`}
                    <div class="cfd-clock" id="cfdClock"></div>
                </div>
            </header>

            <div class="cfd-body">
                <div class="cfd-queue">
                    ${col('กำลังจัดเตรียม', 'Preparing', s.preparing, 'is-prep', 'ยังไม่มีคิว')}
                    ${col('พร้อมรับที่เคาน์เตอร์', 'Ready for pickup', s.ready, 'is-ready', 'รอสักครู่นะคะ')}
                </div>
                <aside class="cfd-ad" id="cfdAd"></aside>
            </div>

            <div class="cfd-offline-bar">การเชื่อมต่อขัดข้อง — ข้อมูลอาจไม่เป็นปัจจุบัน</div>`;

        this.renderClock();
        this.renderHighlight();
    },

    renderClock() {
        const el = document.getElementById('cfdClock');
        if (el) {
            el.textContent = new Date().toLocaleTimeString('th-TH',
                { hour: '2-digit', minute: '2-digit', hour12: false });
        }
    },

    renderHighlight() {
        const box = document.getElementById('cfdAd');
        if (!box) return;
        const items = this.state.highlights;
        if (!items.length) {
            box.innerHTML = `<div class="cfd-ad-fallback">
                <div class="cfd-ad-mark">${this.esc(this.state.shopName)}</div>
                <div class="cfd-ad-sub">ขอบคุณที่ใช้บริการ</div>
            </div>`;
            return;
        }
        const it = items[this.state.hi % items.length];
        box.innerHTML = `
            <div class="cfd-ad-label">เมนูแนะนำ</div>
            <div class="cfd-ad-media">
                ${it.imageUrl
                    ? `<img src="${this.esc(it.imageUrl)}" alt="">`
                    : '<div class="cfd-ad-noimg">☕</div>'}
            </div>
            <div class="cfd-ad-name">${this.esc(it.nameTh)}</div>
            ${it.nameEn ? `<div class="cfd-ad-en">${this.esc(it.nameEn)}</div>` : ''}
            ${it.fromPrice != null
                ? `<div class="cfd-ad-price">เริ่ม ฿${it.fromPrice.toFixed(2)}</div>` : ''}
            <div class="cfd-ad-dots">${items.map((_, i) =>
                `<span class="${i === this.state.hi % items.length ? 'on' : ''}"></span>`).join('')}</div>`;
    },

    /* ══════════════════════════════════════════════════════
       หน้าจอก่อนพร้อมใช้งาน
       ══════════════════════════════════════════════════════ */
    showBoot(title, msg, actionHtml) {
        document.getElementById('cfdStage').innerHTML = `
            <div class="cfd-boot"><div class="cfd-boot-card">
                <h2>${this.esc(title)}</h2>
                <p>${this.esc(msg)}</p>
                <div>${actionHtml || ''}</div>
            </div></div>`;
    },

    showPair(msg) {
        const why = CFApi.pairReasonText(this._me);
        CFApi.keepWaiting('display');
        this.showBoot('จอนี้ยังไม่ได้จับคู่',
            (why ? why + ' — ' : '') + 'ขอรหัสจับคู่ 6 หลักจากผู้จัดการ (หน้าภาพรวม › อุปกรณ์ในเครือข่าย)',
            `<div class="cfd-pair">
                <input id="cfdCode" maxlength="6" autocomplete="off" placeholder="ABC123"
                       oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9]/g,'')"
                       onkeydown="if(event.key==='Enter')DisplayPage.submitPair()">
                <button onclick="DisplayPage.submitPair()">จับคู่จอนี้</button>
                <div class="cfd-pair-msg" id="cfdPairMsg">${msg ? this.esc(msg) : ''}</div>
            </div>`);
        setTimeout(() => document.getElementById('cfdCode')?.focus(), 100);
    },

    async submitPair() {
        const input = document.getElementById('cfdCode');
        const msg = document.getElementById('cfdPairMsg');
        const code = (input.value || '').trim();
        if (code.length !== 6) { msg.textContent = 'กรอกรหัสให้ครบ 6 ตัว'; return; }
        msg.textContent = 'กำลังจับคู่…';
        try {
            const r = await CFApi.post('/api/devices/pair', { code });
            if (r.kind !== 'DISPLAY') {
                msg.textContent = 'รหัสนี้เป็นของ ' + r.kind + ' ไม่ใช่จอแสดงคิว';
                return;
            }
            window.CF_DEVICE_ID = r.deviceId;
            CFApi.stopWaiting();
            this.boot();
        } catch (err) {
            msg.textContent = err.message || 'จับคู่ไม่สำเร็จ';
            input.value = '';
            input.focus();
        }
    },
};

window.DisplayPage = DisplayPage;

// จอนี้ไม่ใช้ CFBoot เพราะไม่ต้องการ snapshot และไม่มีการล็อกอิน
document.addEventListener('DOMContentLoaded', async () => {
    // ต้องรู้ก่อนว่าเราคือจอไหน เพื่อให้ heartbeat รายงานถูกเครื่อง
    try {
        const me = await CFApi.deviceMe('display');
        DisplayPage._me = me;
        if (me.paired) window.CF_DEVICE_ID = me.deviceId;
    } catch { /* ยังไม่จับคู่ — boot() จะพาไปหน้ากรอกรหัสเอง */ }
    DisplayPage.boot();
});
