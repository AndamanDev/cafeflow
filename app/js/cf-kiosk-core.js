/**
 * CafeFlow — KIOSK CORE (§9, §11, §12, §14, §16, §35)
 * ------------------------------------------------------------
 * หน้าจอลูกค้าสั่งเอง · จอสัมผัสยืนกด 21–32 นิ้ว Full HD
 *
 * โครงเป็น router หน้าเต็มจอ ไม่ใช่ drawer — เพราะคีออสก์จริงต้องการ
 * หน้าละหนึ่งหน้าที่ ปุ่มย้อนกลับตำแหน่งตายตัว และไหลเป็นเส้นตรง
 *
 * ⚠️ kiosk.html ไม่โหลด ds-components / ds-overlays / lucide (ดูเหตุผลที่หัวไฟล์นั้น)
 *    และไม่มีพนักงานล็อกอิน — ห้ามอ้าง Drawer / showToast ของ design system /
 *    refreshIcons / CFAuth / ลิงก์ไป *.html โดยตรง
 *    (ทุกอย่างที่ต้องใช้ต้องผ่าน CFStore, CFApi, CFApp, CFRules, CFOrders, CFKioskArt)
 */
const CFKiosk = {

    /** ค่าเริ่มต้นอยู่ใน shared/cf-consts.js — หน้าตั้งค่าหลังบ้านใช้ตัวเดียวกัน */
    get DEFAULTS() { return CF_KIOSK_DEFAULTS; },

    /** อ่านค่าตั้งแบบ merge default เสมอ — ฐานข้อมูลเก่าที่ยังไม่มีคีย์จึงไม่พัง */
    cfg() { return Object.assign({}, CF_KIOSK_DEFAULTS, CFStore.settings()); },

    /** ASK | DINE_IN | TAKE_AWAY — ตัวแปลงค่าอยู่ใน shared/cf-consts.js เพื่อให้หลังบ้านอ่านตัวเดียวกัน */
    diningMode() { return CF_DINING_MODE(this.cfg()); },

    state: {
        screen: 'attract', stack: [],
        dining: null, cat: null, cart: [], line: null,
        upsellShown: false, deviceId: 'KIOSK-01', dirty: false,
        lang: 'th',                     // th | en — กลับเป็นไทยทุกครั้งที่เริ่มลูกค้าคนใหม่
    },

    opts: {},

    /* ══════════════════════════════════════════════════════
       BOOT
       ══════════════════════════════════════════════════════ */
    boot(o) {
        this.opts = Object.assign(this.opts, o || {});
        this.state.deviceId = this.opts.deviceId || 'KIOSK-01';
        window.CF_DEVICE_ID = this.state.deviceId;

        // รายงานตัวทันทีแล้วทุก 20 วิ — ไม่งั้นหน้าภาพรวมขึ้นว่าคีออสก์ออฟไลน์ทั้งที่เปิดอยู่ (ตัดที่ 60 วิ)
        CFApi.heartbeat().catch(() => {});
        clearInterval(this._beat);
        this._beat = setInterval(() => CFApi.heartbeat().catch(() => {}), 20000);

        // คีออสก์ไม่โหลด ds-toast.js / ds-icons.js — ต่อสายให้ของที่ใช้ร่วมกันเรียกได้
        // (cf-orders.js เรียก showToast ตอนปฏิเสธ transition)
        window.showToast = (msg) => this.toast(msg, 2400);
        window.refreshIcons = () => {};

        CFKioskArt.mount();
        this.applyOrientation();

        this.stage = document.getElementById('cfkStage');
        this.stage.addEventListener('pointerdown', () => this.bumpIdle());

        // ผู้จัดการแก้เมนู/ค่าตั้งจากหลังบ้าน → คีออสก์ต้องตามทันโดยไม่ต้องรีเฟรช
        CFStore.subscribe(() => this.onRemote());

        // มีเวอร์ชันใหม่ → โหลดใหม่ตอนว่าง (หน้าแรก) เท่านั้น ห้ามตัดลูกค้าที่กำลังสั่ง
        CFApi.watchVersion(() => {
            this._newVersion = true;
            if (this.state.screen === 'attract') location.reload();
        });

        this.go('attract');
    },

    /* ── แนวจอ + ตัวคูณขนาด ────────────────────────────── */
    applyOrientation() {
        const c = this.cfg();
        const q = new URLSearchParams(location.search).get('o');   // override ชั่วคราว ไม่บันทึก
        const o = q ? q.toUpperCase() : c.kioskOrientation;

        const b = document.body;
        b.classList.toggle('cfk-landscape', o === 'LANDSCAPE');
        b.classList.toggle('cfk-portrait', o !== 'LANDSCAPE');
        b.classList.toggle('cfk-frame', c.kioskFrame !== false);
        b.classList.toggle('cfk-noart', c.kioskImages === false);
        b.classList.toggle('cfk-cam-mirror', c.kioskCamMirror === true);
        b.classList.toggle('cfk-cam-flip', c.kioskCamFlip === true);

        const st = document.getElementById('cfkStage');
        if (st) st.style.setProperty('--scale', c.kioskScale || 1);
    },

    /**
     * กล้องของเครื่องนี้กลับภาพแบบกระจกมาเอง (ไดรเวอร์/ตั้งค่าในตัวกล้อง) — ตั้งที่ ตั้งค่าคีออสก์ (kioskCamFlip)
     * ต้องพลิกคืนทั้งภาพบนจอและภาพหลักฐาน ไม่งั้น OCR อ่านตัวหนังสือกลับด้านไม่ออก
     * (ตรวจเองจาก QR ไม่ได้ — jsQR อ่าน QR กลับด้านได้และคืนมุมแบบจัดเรียงแล้ว จึงไม่รู้ว่ากลับ)
     */
    camFlip() { return this.cfg().kioskCamFlip === true; },

    /** วาดเฟรมจากกล้องลง canvas — พลิกคืนเมื่อ flip เป็นจริง */
    drawFrame(ctx, video, w, h, flip) {
        ctx.setTransform(flip ? -1 : 1, 0, 0, 1, flip ? w : 0, 0);
        ctx.drawImage(video, 0, 0, w, h);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    },

    /**
     * มีการเปลี่ยนแปลงจากที่อื่น
     * วาดใหม่เฉพาะหน้าที่ปลอดภัย — ถ้าลูกค้ากำลังเลือกตัวเลือกอยู่แล้ววาดทับ
     * สิ่งที่เขากดค้างไว้จะหายหมด
     */
    onRemote() {
        this.applyOrientation();
        clearTimeout(this._remoteT);
        this._remoteT = setTimeout(() => {
            if (['attract', 'menu', 'cart'].includes(this.state.screen)) this.render();
            else this.state.dirty = true;
        }, 300);
    },

    /* ══════════════════════════════════════════════════════
       ROUTER
       ══════════════════════════════════════════════════════ */
    go(name, params) {
        if (this.state.screen && name !== this.state.screen) this.state.stack.push(this.state.screen);
        this.state.screen = name;
        this.state.params = params || {};
        this.state.dirty = false;
        this.render();
    },

    back() {
        const prev = this.state.stack.pop() || 'menu';
        this.state.screen = prev;
        this.state.params = {};
        this.render();
    },

    reset() {
        if (this._newVersion) { location.reload(); return; }
        clearTimeout(this._idle); clearInterval(this._qr); clearInterval(this._doneT);
        this.state.stack = [];
        this.state.cart = [];
        this._orderCart = null;
        this.state.line = null;
        this.state.dining = null;
        this.state.cat = null;
        this.state.upsellShown = false;
        this.state.lang = 'th';
        this.state.screen = 'attract';
        this.render();
    },

    render() {
        if (!this.camScreen()) this.stopCam();     // ไฟกล้องต้องดับเมื่อออกจากหน้าสแกน
        const fn = this['screen_' + this.state.screen];
        this.stage.innerHTML = (fn ? fn.call(this, this.state.params) : '')
            + '<div class="cfk-toast" id="cfkToast"></div>';
        this.stage.scrollTop = 0;
        this.afterRender();
        this.resetIdle();
    },

    afterRender() {
        // เลื่อนหมวดที่เลือกให้อยู่กลางแถบ ไม่งั้นหมวดท้าย ๆ ไม่มีใครเห็น
        const a = this.stage.querySelector('.cfk-cat.active');
        if (a && a.parentElement.classList.contains('cfk-catstrip')) {
            a.scrollIntoView({ inline: 'center', block: 'nearest' });
        }
        this.fitItem();
    },

    /**
     * หน้าเลือกตัวเลือกห้ามเลื่อน และไม่ปล่อยที่ว่างโล่งด้านล่าง —
     * ขยายเนื้อหาทั้งก้อน (ปุ่ม · ตัวหนังสือ · ระยะห่าง) จนเต็มพื้นที่พอดี
     * เมนูที่มีตัวเลือกน้อยได้ปุ่มใหญ่ขึ้น (สูงสุด 1.5 เท่า — ใหญ่กว่านั้นดูไม่เป็นหน้าจอสั่งอาหาร)
     * ★ ย่อลงต่ำกว่า 100% เฉพาะกรณีเนื้อหาล้นจอจริง ๆ (ไม่งั้นตัวเลือกล่างสุดกดไม่ได้)
     */
    fitItem() {
        const box = this.stage.querySelector('.cfk-item-scroll');
        const fit = box && box.querySelector('.cfk-item-fit');
        if (!fit) return;
        const room = box.clientHeight;
        const fits = (z) => { fit.style.zoom = z; return fit.getBoundingClientRect().height <= room; };

        if (!fits(1)) {
            let z = 1;
            while (!fits(z) && z > 0.6) z = Math.round((z - 0.05) * 100) / 100;
            return;
        }
        // หาค่าขยายที่ใหญ่ที่สุดที่ยังพอดี — ขยายแล้วข้อความหักบรรทัดใหม่ได้ ความสูงจึงไม่เป็นเส้นตรง ต้องวัดจริง
        let lo = 1, hi = 1.5;
        if (fits(hi)) return;
        for (let i = 0; i < 8; i++) {
            const mid = (lo + hi) / 2;
            if (fits(mid)) lo = mid; else hi = mid;
        }
        fits(lo);
    },

    /* ══════════════════════════════════════════════════════
       ตัวจับเวลาไม่มีการใช้งาน
       หน้า pay/qr/done มีตัวนับของตัวเอง ห้ามให้ idle มาตัดกลางคัน
       ══════════════════════════════════════════════════════ */
    resetIdle() {
        clearTimeout(this._idle);
        if (['attract', 'pay', 'qr', 'qrexpired', 'slip', 'done'].includes(this.state.screen)) return;
        const sec = this.cfg().kioskIdleSec || 90;
        this._idle = setTimeout(() => this.reset(), sec * 1000);
    },
    bumpIdle() { this.resetIdle(); },

    toast(msg, ms) {
        const el = document.getElementById('cfkToast');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('show');
        clearTimeout(this._toastT);
        this._toastT = setTimeout(() => el.classList.remove('show'), ms || 1600);
    },

    /* ══════════════════════════════════════════════════════
       ภาษา — ไทย / English (ลูกค้าต่างชาติ)
       ข้อความจากเซิร์ฟเวอร์ (เหตุผลสลิปไม่ผ่าน, error) ยังเป็นไทย
       ══════════════════════════════════════════════════════ */
    t(th, en) { return this.state.lang === 'en' ? en : th; },

    /** ชื่อของ สินค้า / หมวด / ตัวเลือก — ไม่มีชื่ออังกฤษก็ใช้ชื่อไทย */
    nm(x) { return x ? ((this.state.lang === 'en' && x.nameEn) || x.nameTh || '') : ''; },

    serveLabel(k) {
        return this.t(CF_SERVE[k].label, { HOT: 'Hot', ICED: 'Iced', FRAPPE: 'Frappé', STD: 'Regular' }[k]);
    },
    serveShort(k) { return k === 'STD' ? '' : this.t(CF_SERVE[k].short, this.serveLabel(k)); },
    serveSuffix(k) { return this.t(CFApp.serveSuffix(k), k === 'STD' ? '' : ' (' + this.serveLabel(k) + ')'); },

    /** หัวข้อกลุ่มบนป้ายหน้าร้าน — ส่วนใหญ่เป็นอังกฤษอยู่แล้ว แปลเฉพาะที่เป็นไทย */
    groupName(name) {
        if (this.state.lang !== 'en') return name;
        return ({ 'ประหยัดสุดคุ้ม': 'Value picks', 'อาหาร': 'Food', 'ของหวาน': 'Desserts',
                  'เบเกอรี่': 'Bakery', 'LEMON (สด)': 'LEMON (fresh)' })[name] || name;
    },

    /** ตัวเลือกที่เก็บในตะกร้าเป็นชื่อไทย — โหมดอังกฤษดึงชื่อจากตัวเลือกจริง */
    modLabel(m) { return this.nm(CFStore.byId('modifierOptions', m.optionId)) || m.label; },

    langBtn(cls) {
        return `<button class="cfk-lang ${cls || ''}" onclick="event.stopPropagation();CFKiosk.toggleLang()"
                        aria-label="${this.t('Change language to English', 'เปลี่ยนเป็นภาษาไทย')}">
            ${this.t('English', 'ภาษาไทย')}</button>`;
    },

    toggleLang() {
        this.state.lang = this.state.lang === 'en' ? 'th' : 'en';
        this.render();
    },

    /**
     * หน้าถามยืนยันแบบแผ่นล่าง — ปุ่มที่กดแล้วย้อนไม่ได้ (ล้างตะกร้า · เรียกพนักงาน · เปลี่ยนเป็นเงินสด)
     * onOk เป็นชื่อเมธอดของ CFKiosk (ใส่ใน onclick ได้)
     */
    confirmSheet({ title, text, ok, onOk }) {
        this.closeSheet();
        const e = CFApp.esc;
        this.stage.insertAdjacentHTML('beforeend', `
        <div class="cfk-sheet" id="cfkSheet">
            <div class="cfk-sheet-box">
                <div class="cfk-sheet-body">
                    <b>${e(title)}</b>
                    <p>${e(text)}</p>
                </div>
                <div class="cfk-actionbar">
                    <button class="cfk-btn cfk-btn-ghost cfk-btn-grow" onclick="CFKiosk.closeSheet()">${this.t('ยกเลิก', 'Cancel')}</button>
                    <button class="cfk-btn cfk-btn-primary cfk-btn-grow"
                            onclick="CFKiosk.closeSheet();CFKiosk.${onOk}()">${e(ok)}</button>
                </div>
            </div>
        </div>`);
    },

    /* ══════════════════════════════════════════════════════
       ตะกร้า
       ══════════════════════════════════════════════════════ */
    lineTotal(L) {
        const p = CFStore.byId('products', L.productId);
        const base = CFApp.priceOf(p, L.serveType) || 0;
        const add = L.mods.reduce((s, m) => s + (m.priceDelta || 0), 0);
        return (base + add) * L.qty;
    },
    cartTotal() { return this.state.cart.reduce((s, l) => s + this.lineTotal(l), 0); },
    cartCount() { return this.state.cart.reduce((s, l) => s + l.qty, 0); },

    /* ══════════════════════════════════════════════════════
       หน้า 1 — ATTRACT
       ══════════════════════════════════════════════════════ */
    screen_attract() {
        const e = CFApp.esc, s = CFStore.settings();
        const picks = CFStore.where('products', (p) => p.active && !p.soldOut && p.recommended).slice(0, 6);
        const tiles = picks.concat(picks)   // ต่อสองชุดให้ marquee วนไม่มีรอยต่อ
            .map((p) => `<div class="cfk-attract-tile">${CFKioskArt.tile(p, CFApp.serveTypesOf(p)[0])}</div>`)
            .join('');

        return `
        ${this.langBtn('cfk-lang-float')}
        <button class="cfk-attract" onclick="CFKiosk.start()">
            <div class="cfk-attract-mid">
                <span class="cfk-attract-strip" style="position:absolute;top:0;left:0;right:0"></span>
                <div class="cfk-attract-mark">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"
                         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M17 8h1a4 4 0 0 1 0 8h-1"/>
                        <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/>
                        <line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/>
                        <line x1="14" y1="1" x2="14" y2="4"/>
                    </svg>
                </div>
                <div class="cfk-attract-shop">${e(s.shopName)}</div>
                <div class="cfk-attract-sub">${this.t('สั่งด้วยตนเอง', 'Self order')}</div>
                ${CFStore.openShift()
                    ? `<div class="cfk-attract-cta">${this.t('แตะเพื่อเริ่มสั่ง', 'Tap to start ordering')}</div>`
                    : `<div class="cfk-attract-cta cfk-attract-closed">${this.t('ยังไม่เปิดรับออเดอร์', 'Not taking orders yet')}</div>`}
            </div>
            <div class="cfk-attract-band"><div class="cfk-attract-row">${tiles}</div></div>
        </button>`;
    },

    start() {
        // ยังไม่เปิดรอบ = เซิร์ฟเวอร์ไม่รับออเดอร์ — อย่าให้ลูกค้าเลือกจนจบแล้วค่อยเจอข้อความผิดพลาด
        // เปิดรอบแล้วหน้านี้วาดใหม่เอง (onRemote)
        if (!CFStore.openShift()) return;
        this.state.stack = [];
        const m = this.diningMode();
        // ร้านที่รับแบบเดียว ไม่ต้องถาม — ข้ามไปเมนูเลย ลดจาก 5 แตะเหลือ 4
        if (m === 'ASK') { this.go('dining'); return; }
        this.state.dining = m;
        this.go('menu');
    },

    /* ══════════════════════════════════════════════════════
       หน้า 2 — กินที่ร้าน / กลับบ้าน
       ══════════════════════════════════════════════════════ */
    screen_dining() {
        const e = CFApp.esc;
        const choice = (key) => {
            const d = CF_DINING[key], t = CFKioskArt.TINT[d.tint];
            return `
            <button class="cfk-bigchoice" onclick="CFKiosk.setDining('${key}')">
                <span class="cfk-media" style="--t1:${t[0]};--t2:${t[1]};--art-a:${t[2]}">
                    <svg class="cfk-art" viewBox="0 0 120 120"><use href="#cfa-${d.art}"/></svg></span>
                <b>${e(this.t(d.label, d.en))}</b>
            </button>`;
        };
        return `
        ${this.topHtml({ title: this.t('เลือกรูปแบบการรับ', 'Dine in or take away?'),
                         sub: this.t('เลือกก่อนเริ่มสั่งอาหาร', 'Choose before you order'), back: 'attract' })}
        <div class="cfk-choices">
            <div class="cfk-choices-q">${this.t('ทานที่ร้าน หรือ กลับบ้าน?', 'Eat here or take away?')}
                <small>${this.t('แตะเลือกด้านล่าง', 'Tap one below')}</small></div>
            ${choice('DINE_IN')}${choice('TAKE_AWAY')}
        </div>`;
    },

    setDining(v) { this.state.dining = v; this.go('menu'); },
    diningLabel() { const d = CF_DINING[this.state.dining] || CF_DINING.DINE_IN; return this.t(d.label, d.en); },

    /* ── แถบหัวร่วม ── */
    topHtml(o) {
        const e = CFApp.esc;
        return `
        <div class="cfk-top">
            ${o.back ? `<button class="cfk-back" onclick="CFKiosk.back()" aria-label="${this.t('ย้อนกลับ', 'Back')}">
                ${CFKioskArt.icon('back')}</button>` : ''}
            <div class="cfk-top-title">
                <b>${e(o.title)}</b>
                ${o.sub ? `<span>${e(o.sub)}</span>` : ''}
            </div>
            ${o.mode && this.state.dining ? this.modeChipHtml() : ''}
            ${o.noLang ? '' : this.langBtn()}
        </div>`;
    },

    /**
     * ชิปบอกว่ากำลังสั่งแบบไหน
     * โหมดตายตัว (ร้านรับแบบเดียว) ต้องเป็นป้ายอ่านอย่างเดียว ไม่ใช่ปุ่ม —
     * ไม่งั้นมันคือทางลัดกลับเข้าหน้าที่ผู้จัดการเพิ่งปิดไป
     */
    modeChipHtml() {
        const d = CF_DINING[this.state.dining] || CF_DINING.DINE_IN;
        const inner = `${CFKioskArt.icon(d.icon)} ${CFApp.esc(this.t(d.label, d.en))}`;
        return this.diningMode() === 'ASK'
            ? `<button class="cfk-mode" onclick="CFKiosk.go('dining')">${inner}</button>`
            : `<span class="cfk-mode cfk-mode-static">${inner}</span>`;
    },

    /* ══════════════════════════════════════════════════════
       หน้า 3 — MENU
       ══════════════════════════════════════════════════════ */
    screen_menu() {
        const cats = CFStore.all('categories').filter((c) =>
            c.active && CFStore.all('products').some((p) => p.categoryId === c.id && p.active));
        if (!this.state.cat || !cats.some((c) => c.id === this.state.cat)) {
            this.state.cat = cats.length ? cats[0].id : null;
        }
        const land = document.body.classList.contains('cfk-landscape');
        const catsHtml = cats.map((c) => this.catHtml(c)).join('');

        return `
        ${this.topHtml({ title: CFStore.settings().shopName, sub: this.t('เลือกเมนูที่ต้องการ', 'Choose your items'), back: 'dining', mode: true })}
        <div class="cfk-menu">
            ${land ? `<div class="cfk-rail">${catsHtml}</div>`
                   : `<div class="cfk-catstrip">${catsHtml}</div>`}
            <div class="cfk-gridwrap" id="cfkGrid">${this.gridHtml()}</div>
            ${land ? this.cartPanelHtml() : this.cartBarHtml()}
        </div>`;
    },

    catHtml(c) {
        const e = CFApp.esc;
        return `<button class="cfk-cat ${c.id === this.state.cat ? 'active' : ''}"
                        onclick="CFKiosk.setCat('${c.id}')">
            <b>${e(this.nm(c))}</b></button>`;
    },

    setCat(id) {
        this.state.cat = id;
        const g = document.getElementById('cfkGrid');
        if (g) { g.innerHTML = this.gridHtml(); g.scrollTop = 0; }
        this.stage.querySelectorAll('.cfk-cat').forEach((b) => {
            b.classList.toggle('active', b.getAttribute('onclick').includes("'" + id + "'"));
        });
        this.afterRender();
        this.bumpIdle();
    },

    gridHtml() {
        const e = CFApp.esc;
        const list = CFStore.where('products', (p) => p.active && p.categoryId === this.state.cat);

        // จัดกลุ่มตามหัวข้อบนป้ายหน้าร้าน ลูกค้าจะหาเจอเหมือนตอนยืนดูป้าย
        const groups = [];
        list.forEach((p) => {
            let g = groups.find((x) => x.name === (p.groupTh || ''));
            if (!g) { g = { name: p.groupTh || '', items: [] }; groups.push(g); }
            g.items.push(p);
        });
        if (!groups.length) return `<div class="cfk-empty">${this.t('ยังไม่มีสินค้าในหมวดนี้', 'No items in this category yet')}</div>`;

        return groups.map((g) => `
            ${g.name ? `<div class="cfk-groupbar"><b>${e(this.groupName(g.name))}</b><span>${this.t(g.items.length + ' เมนู', g.items.length + ' items')}</span></div>` : ''}
            <div class="cfk-grid">${g.items.map((p) => this.cardHtml(p)).join('')}</div>
        `).join('');
    },

    cardHtml(p) {
        const e = CFApp.esc;
        const serves = CFApp.serveTypesOf(p);
        const multi = serves.filter((k) => k !== 'STD').length > 1;
        const pills = serves.filter((k) => k !== 'STD')
            .map((k) => `<span class="cfk-serve-pill">${e(this.serveShort(k))}</span>`).join('');

        return `<button class="cfk-card" ${p.soldOut ? 'disabled' : `onclick="CFKiosk.openItem('${p.id}')"`}>
            ${p.recommended && !p.soldOut ? `<span class="cfk-badge cfk-badge-reco">${this.t('แนะนำ', 'Popular')}</span>` : ''}
            ${p.soldOut ? `<span class="cfk-badge cfk-badge-out">${this.t('สินค้าหมด', 'Sold out')}</span>` : ''}
            ${CFKioskArt.tile(p, serves[0])}
            <span class="cfk-card-body">
                <span class="cfk-card-name">${e(this.nm(p))}</span>
                <span class="cfk-card-foot">
                    <span class="cfk-serves">${pills}</span>
                    <span class="cfk-price">${multi ? `<small>${this.t('เริ่ม ', 'from ')}</small>` : ''}฿${CFApp.money(CFApp.minPriceOf(p))}</span>
                </span>
            </span>
        </button>`;
    },

    /* ── แถบ/แผงตะกร้า — อยู่ที่เดิมเสมอ ไม่เคยหาย ── */
    cartBarHtml() {
        const n = this.cartCount(), t = this.cartTotal();
        if (!n) {
            return `<div class="cfk-cartbar is-empty">
                ${CFKioskArt.icon('cart')}
                <span>${this.t('แตะเมนูที่ชอบเพื่อเพิ่มลงตะกร้า', 'Tap an item to add it to your cart')}</span>
            </div>`;
        }
        // ไปหน้าตะกร้าก่อนเสมอ — ลูกค้าได้ทวนรายการ/แก้ตัวเลือกก่อนจ่าย (ปุ่มชำระเงินอยู่ที่นั่น)
        return `<div class="cfk-cartbar">
            <button class="cfk-cartbtn" onclick="CFKiosk.go('cart')">
                <span class="cfk-cartbtn-n">${CFKioskArt.icon('cart')}<i>${n}</i></span>
                <span class="cfk-cartbtn-label">${this.t('ดูตะกร้า · ชำระเงิน', 'View cart · Pay')}</span>
                <span class="cfk-cartbtn-amt">฿${CFApp.money(t)}</span>
                ${CFKioskArt.icon('next')}
            </button>
        </div>`;
    },

    cartPanelHtml() {
        const n = this.cartCount();
        return `<div class="cfk-cartpanel">
            <div class="cfk-cartpanel-head">${this.t('ตะกร้าของคุณ', 'Your cart')}${n ? ' · ' + this.t(n + ' รายการ', n + (n > 1 ? ' items' : ' item')) : ''}</div>
            <div class="cfk-cartpanel-list">
                ${n ? this.state.cart.map((l) => this.cartLineHtml(l, true)).join('')
                    : `<div class="cfk-empty">${this.t('ตะกร้าว่าง<br>เลือกเมนูเพื่อเริ่ม', 'Your cart is empty<br>Choose an item to start')}</div>`}
            </div>
            <div class="cfk-cartpanel-foot">
                <div class="cfk-total" style="padding:0"><span>${this.t('ยอดรวม', 'Total')}</span><strong>฿${CFApp.money(this.cartTotal())}</strong></div>
                <button class="cfk-btn cfk-btn-primary" ${n ? '' : 'disabled'} onclick="CFKiosk.toCheckout()">
                    ${this.t('ชำระเงิน', 'Pay')} ฿${CFApp.money(this.cartTotal())}
                </button>
                ${n ? `<button class="cfk-mini" onclick="CFKiosk.askClear()">${CFKioskArt.icon('trash')} ${this.t('ล้างตะกร้า', 'Clear cart')}</button>` : ''}
            </div>
        </div>`;
    },

    /* ══════════════════════════════════════════════════════
       หน้า 4 — รายละเอียดสินค้า
       ══════════════════════════════════════════════════════ */
    openItem(productId, editLineId) {
        const p = CFStore.byId('products', productId);
        if (!p || p.soldOut) { this.toast(this.t('สินค้านี้หมดแล้ว', 'Sorry, this item is sold out')); return; }

        if (editLineId) {
            const l = this.state.cart.find((x) => x.lineId === editLineId);
            this.state.line = { lineId: editLineId, productId, serveType: l.serveType,
                                qty: l.qty, mods: l.mods.slice() };
        } else {
            const first = CFApp.serveTypesOf(p)[0];
            this.state.line = { lineId: null, productId, serveType: first, qty: 1,
                                mods: CFRules.defaultsFor(first, p.categoryId) };
        }
        this.go('item');
    },

    screen_item() {
        const e = CFApp.esc;
        const L = this.state.line;
        const p = CFStore.byId('products', L.productId);
        const serves = CFApp.serveTypesOf(p);
        const showServe = serves.length > 1;
        // ชื่อภาษาที่สองใต้ชื่อหลัก (ไทย → อังกฤษ และกลับกัน) — ไม่มีหรือซ้ำกันก็ไม่ต้องแสดง
        const altName = this.state.lang === 'en' ? p.nameTh : p.nameEn;
        const alt = altName && altName !== this.nm(p) ? altName : '';

        // เลขขั้นตอนหน้าหัวข้อแต่ละกลุ่ม (1 2 3 …) — ลูกค้าเห็นว่ามีกี่ขั้น และไล่ทำจากบนลงล่าง
        let step = 0;
        const head = (title, tags) => `
                <div class="cfk-optgroup-head"><span class="cfk-step-no">${++step}</span><b>${e(title)}</b>${tags}</div>`;
        const req = `<span class="cfk-tag cfk-tag-miss">${this.t('ยังไม่ได้เลือก', 'Please choose')}</span>`;
        const SERVE_ICON = { HOT: 'hot', ICED: 'iced', FRAPPE: 'frappe', STD: 'check' };

        const serveBlock = showServe ? `
            <div class="cfk-optgroup">
                ${head(this.t('เลือกแบบ', 'Choose style'), '')}
                <div class="cfk-serves-pick">
                    ${serves.map((k) => `<button class="cfk-serve ${k === L.serveType ? 'active' : ''}"
                        onclick="CFKiosk.setServe('${k}')">
                        <b>${CFKioskArt.icon(SERVE_ICON[k])} ${e(this.serveLabel(k))}</b><small>฿${CFApp.money(p.prices[k])}</small></button>`).join('')}
                </div>
            </div>` : '';

        const groups = CFRules.groupsFor(L.serveType, p.categoryId);
        const optBlock = groups.map((g) => {
            const missing = this._missing && this._missing.includes(g.id);
            const opts = CFRules.optionsOf(g.id);
            // คิดคอลัมน์จากชื่อไทยเสมอ — ชื่ออังกฤษยาวกว่าจะได้คอลัมน์น้อยลง แถวเพิ่ม
            // แล้ว fitItem ย่อทั้งหน้า ตัวหนังสือภาษาอังกฤษเลยดูเล็กกว่า (ยาวเกินก็ขึ้นบรรทัดใหม่ในปุ่มเอา)
            const longest = Math.max(0, ...opts.map((o) => (o.nameTh || '').length));
            const cols = longest <= 10 ? 5 : longest <= 18 ? 3 : 2;
            // เพดานของกลุ่มหลายอย่าง (เช่น ท็อปปิ้งสูงสุด 3) — ครบแล้วปุ่มที่เหลือจางลง
            const max = g.type === 'MULTI' && g.maxSelect ? g.maxSelect : 0;
            const picked = L.mods.filter((m) => m.groupId === g.id).length;
            const full = max && picked >= max;
            const hint = g.type !== 'MULTI' ? ''
                : max ? this.t('เลือกได้สูงสุด ' + max + ' อย่าง (เลือกแล้ว ' + picked + ')', 'Choose up to ' + max + ' (' + picked + ' chosen)')
                      : this.t('เลือกได้หลายอย่าง', 'Choose any');
            return `
            <div class="cfk-optgroup ${missing ? 'is-missing' : ''}">
                ${head(this.nm(g), (g.required && missing ? req : '') +
                    (hint ? `<span class="cfk-optgroup-hint">${hint}</span>` : ''))}
                <div class="cfk-opts" style="--cols:${cols}">
                    ${opts.map((o) => {
                        const on = L.mods.some((m) => m.optionId === o.id);
                        return `<button class="cfk-opt ${on ? 'active' : ''} ${full && !on ? 'is-full' : ''}" aria-pressed="${on}"
                            onclick="CFKiosk.toggleOpt('${g.id}','${o.id}',${g.type === 'MULTI'})">
                            <span>${e(this.nm(o))}</span>${o.priceDelta ? `<b>+฿${o.priceDelta}</b>` : ''}</button>`;
                    }).join('')}
                </div>
            </div>`;
        }).join('');

        return `
        ${this.topHtml({ title: this.t('เลือกตัวเลือก', 'Choose options'), sub: this.groupName(p.groupTh || ''), back: 'menu' })}
        <div class="cfk-item">
            <div class="cfk-item-left">
                <div class="cfk-hero">${CFKioskArt.tile(p, L.serveType)}</div>
            </div>
            <!-- หน้านี้ห้ามเลื่อน — ลูกค้าต้องเห็นทุกตัวเลือกพร้อมกัน (fitItem ย่อเนื้อหาให้พอดีจอเอง) -->
            <div class="cfk-item-scroll">
                <div class="cfk-item-fit">
                    <!-- รูปเต็มความกว้าง แล้วชื่อ · ราคาใต้รูป (จอแนวนอนมีรูปใหญ่ด้านซ้ายแทน) -->
                    <div class="cfk-item-banner">${CFKioskArt.tile(p, L.serveType)}</div>
                    <div class="cfk-item-head">
                        <div class="cfk-item-head-text">
                            <div class="cfk-item-name">${e(this.nm(p))}</div>
                            ${alt ? `<div class="cfk-item-en">${e(alt)}</div>` : ''}
                        </div>
                        <div class="cfk-item-price">฿${CFApp.money(CFApp.priceOf(p, L.serveType) || 0)}</div>
                    </div>
                    ${serveBlock}
                    ${optBlock || `<div class="cfk-note">${this.t('เมนูนี้ไม่มีตัวเลือกเพิ่มเติม', 'No options for this item')}</div>`}
                    <div class="cfk-item-qtyrow">
                        <b>${this.t('จำนวน', 'Quantity')}</b>
                        <div class="cfk-qty" role="group" aria-label="${this.t('จำนวน', 'Quantity')}">
                            <button onclick="CFKiosk.addQty(-1)" ${L.qty <= 1 ? 'disabled' : ''}
                                    aria-label="${this.t('ลด', 'Less')}">${CFKioskArt.icon('minus')}</button>
                            <output>${L.qty}</output>
                            <button onclick="CFKiosk.addQty(1)" aria-label="${this.t('เพิ่ม', 'More')}">${CFKioskArt.icon('plus')}</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="cfk-actionbar">
                <button class="cfk-btn cfk-btn-ghost" onclick="CFKiosk.back()">${this.t('ยกเลิก', 'Cancel')}</button>
                <button class="cfk-btn cfk-btn-primary cfk-btn-grow" onclick="CFKiosk.addToCart()">
                    ${CFKioskArt.icon('check')} ${L.lineId ? this.t('บันทึก', 'Save') : this.t('เพิ่มลงตะกร้า', 'Add to cart')} · ฿${CFApp.money(this.lineTotal(L))}
                </button>
            </div>
        </div>`;
    },

    /** เปลี่ยนแบบเสิร์ฟ → ราคาเปลี่ยน กฎเปลี่ยน และรูป hero เปลี่ยนตาม */
    setServe(k) {
        const L = this.state.line;
        const p = CFStore.byId('products', L.productId);
        L.serveType = k;
        // ตัวเลือกที่กลุ่มหายไปตามกฎใหม่ต้องถูกตัดออก ไม่งั้นลูกค้าโดนคิดของที่ไม่ได้เลือก
        const allowed = new Set(CFRules.groupsFor(k, p.categoryId).map((g) => g.id));
        L.mods = L.mods.filter((m) => allowed.has(m.groupId));
        CFRules.defaultsFor(k, p.categoryId).forEach((d) => {
            if (!L.mods.some((m) => m.groupId === d.groupId)) L.mods.push(d);
        });
        this._missing = null;
        this.render();
    },

    toggleOpt(groupId, optionId, multi) {
        const L = this.state.line;
        const o = CFStore.byId('modifierOptions', optionId);
        const has = L.mods.some((m) => m.optionId === optionId);
        const rec = { groupId, optionId, label: o.nameTh, shortLabel: o.shortLabel, priceDelta: o.priceDelta };

        if (multi) {
            // ครบเพดานแล้ว — ไม่แทนที่ตัวเก่าให้เอง (ลูกค้าอาจไม่ทันเห็น) ให้เอาออกเองก่อน
            const g = CFStore.byId('modifierGroups', groupId);
            const max = g && g.maxSelect;
            if (!has && max && L.mods.filter((m) => m.groupId === groupId).length >= max) {
                this.toast(this.t('เลือกได้สูงสุด ' + max + ' อย่าง — แตะตัวที่เลือกไว้เพื่อเอาออกก่อน',
                                  'Up to ' + max + ' only — tap a chosen one to remove it first'), 2600);
                return;
            }
            L.mods = has ? L.mods.filter((m) => m.optionId !== optionId) : L.mods.concat([rec]);
        } else {
            L.mods = L.mods.filter((m) => m.groupId !== groupId);
            if (!has) L.mods.push(rec);
        }
        this._missing = null;
        this.render();
    },

    addQty(d) {
        const L = this.state.line;
        L.qty = Math.max(1, Math.min(99, L.qty + d));
        this.render();
    },

    addToCart() {
        const L = this.state.line;
        const p = CFStore.byId('products', L.productId);

        // ผู้จัดการอาจปิดขายกลางคัน แล้ว sync เข้ามาระหว่างลูกค้าเลือกอยู่
        if (!p || p.soldOut) { this.toast(this.t('สินค้านี้เพิ่งหมด', 'This item just sold out')); this.go('menu'); return; }

        const missing = CFRules.groupsFor(L.serveType, p.categoryId)
            .filter((g) => g.required && !L.mods.some((m) => m.groupId === g.id));
        if (missing.length) {
            this._missing = missing.map((g) => g.id);
            this.render();
            const el = this.stage.querySelector('.cfk-optgroup.is-missing');
            if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
            this.toast(this.t('กรุณาเลือก ', 'Please choose ') + missing.map((g) => this.nm(g)).join(this.t(' และ ', ' and ')), 2400);
            return;
        }

        if (L.lineId) {
            const i = this.state.cart.findIndex((x) => x.lineId === L.lineId);
            this.state.cart[i] = Object.assign({}, L);
        } else {
            this.state.cart.push(Object.assign({}, L, { lineId: 'L' + Date.now().toString(36) }));
        }
        this._missing = null;
        this.go('menu');
        this.toast(this.t('เพิ่ม ' + p.nameTh + ' แล้ว', 'Added ' + this.nm(p)));
    },

    /* ══════════════════════════════════════════════════════
       หน้า 5 — ตะกร้า
       ══════════════════════════════════════════════════════ */
    screen_cart() {
        const n = this.cartCount();
        if (!n) return this.screen_menu();

        return `
        ${this.topHtml({ title: this.t('ตะกร้าของคุณ', 'Your cart'), sub: this.t(n + ' รายการ', n + (n > 1 ? ' items' : ' item')), back: 'menu', mode: true })}
        <div class="cfk-cart">
            <div class="cfk-cart-list">
                ${this.state.cart.map((l) => this.cartCardHtml(l)).join('')}
                <button class="cfk-cart-clear" onclick="CFKiosk.askClear()">
                    ${CFKioskArt.icon('trash')} ${this.t('ล้างตะกร้าทั้งหมด', 'Clear cart')}</button>
            </div>
            <div class="cfk-cart-sum">
                <div><span>${this.t('ยอดรวม', 'Total')}</span>
                     <small>${this.t(n + ' ชิ้น · รวมภาษีมูลค่าเพิ่มแล้ว', n + (n > 1 ? ' items' : ' item') + ' · VAT included')}</small></div>
                <strong>฿${CFApp.money(this.cartTotal())}</strong>
            </div>
            <div class="cfk-actionbar">
                <button class="cfk-btn cfk-btn-ghost" onclick="CFKiosk.go('menu')">${this.t('สั่งเพิ่ม', 'Add more')}</button>
                <button class="cfk-btn cfk-btn-primary cfk-btn-grow" onclick="CFKiosk.toCheckout()">
                    ${this.t('ชำระเงิน', 'Pay')} ฿${CFApp.money(this.cartTotal())}
                </button>
            </div>
        </div>`;
    },

    cartLineHtml(l, compact) {
        const e = CFApp.esc;
        const p = CFStore.byId('products', l.productId);
        const mods = l.mods.map((m) => e(this.modLabel(m))).join(' · ');
        return `<div class="cfk-cartline">
            ${CFKioskArt.tile(p, l.serveType)}
            <div class="cfk-cartline-mid">
                <div class="cfk-cartline-name">${e(this.nm(p))}${e(this.serveSuffix(l.serveType))}</div>
                ${mods ? `<div class="cfk-cartline-mods">${mods}</div>` : ''}
                ${compact ? '' : `<div class="cfk-cartline-act">
                    <button class="cfk-mini" onclick="CFKiosk.lineQty('${l.lineId}',-1)">${CFKioskArt.icon('minus')}</button>
                    <button class="cfk-mini" onclick="CFKiosk.lineQty('${l.lineId}',1)">${CFKioskArt.icon('plus')}</button>
                    <button class="cfk-mini" onclick="CFKiosk.openItem('${l.productId}','${l.lineId}')">
                        ${CFKioskArt.icon('pencil')} ${this.t('แก้ไข', 'Edit')}</button>
                    <button class="cfk-mini" onclick="CFKiosk.removeLine('${l.lineId}')">${CFKioskArt.icon('trash')}</button>
                </div>`}
            </div>
            <div class="cfk-cartline-end">
                <div class="cfk-cartline-mods">× ${l.qty}</div>
                <div class="cfk-cartline-amt">฿${CFApp.money(this.lineTotal(l))}</div>
            </div>
        </div>`;
    },

    /**
     * หนึ่งรายการในหน้าตะกร้า — แถวเดียวแบบใบเสร็จ: รูป · ชื่อ + ตัวเลือก · จำนวน + ราคา
     * ตัวเลือกเป็นข้อความบรรทัดเดียว (อ่านไล่ได้เร็วกว่าป้ายหลายอัน) · แตะชื่อเพื่อแก้ไข
     * ปุ่ม − / + ยังใหญ่พอกดจากระยะยืน · เหลือ 1 ชิ้นแล้วปุ่ม − กลายเป็นถังขยะ
     */
    cartCardHtml(l) {
        const e = CFApp.esc;
        const p = CFStore.byId('products', l.productId);
        const mods = l.mods.map((m) => this.modLabel(m)).filter(Boolean).join(' · ');
        const one = l.qty <= 1;
        return `<div class="cfk-cline">
            <div class="cfk-cline-thumb">${CFKioskArt.tile(p, l.serveType)}</div>
            <button class="cfk-cline-info" onclick="CFKiosk.openItem('${l.productId}','${l.lineId}')">
                <span class="cfk-cline-name">${e(this.nm(p))}${e(this.serveSuffix(l.serveType))}</span>
                ${mods ? `<span class="cfk-cline-mods">${e(mods)}</span>` : ''}
                <span class="cfk-cline-edit">${CFKioskArt.icon('pencil')} ${this.t('แก้ไข', 'Edit')}</span>
            </button>
            <div class="cfk-cline-end">
                <div class="cfk-qty" role="group" aria-label="${this.t('จำนวน', 'Quantity')}">
                    <button class="${one ? 'is-del' : ''}" onclick="CFKiosk.lineQty('${l.lineId}',-1)"
                            aria-label="${one ? this.t('ลบ', 'Remove') : this.t('ลด', 'Less')}">${CFKioskArt.icon(one ? 'trash' : 'minus')}</button>
                    <output>${l.qty}</output>
                    <button onclick="CFKiosk.lineQty('${l.lineId}',1)" aria-label="${this.t('เพิ่ม', 'More')}">${CFKioskArt.icon('plus')}</button>
                </div>
                <div class="cfk-cline-amt">฿${CFApp.money(this.lineTotal(l))}</div>
            </div>
        </div>`;
    },

    lineQty(lineId, d) {
        const l = this.state.cart.find((x) => x.lineId === lineId);
        if (!l) return;
        l.qty += d;
        if (l.qty < 1) { this.removeLine(lineId); return; }
        if (l.qty > 99) l.qty = 99;
        this.render();
    },

    removeLine(lineId) {
        this.state.cart = this.state.cart.filter((x) => x.lineId !== lineId);
        if (!this.state.cart.length) { this.go('menu'); this.toast(this.t('ตะกร้าว่างแล้ว', 'Your cart is empty')); return; }
        this.render();
    },

    askClear() {
        this.confirmSheet({
            title: this.t('ล้างตะกร้าทั้งหมด?', 'Clear your cart?'),
            text: this.t('รายการที่เลือกไว้ทั้งหมดจะถูกลบ', 'All the items you chose will be removed'),
            ok: this.t('ล้างตะกร้า', 'Clear cart'), onOk: 'doClear',
        });
    },
    closeSheet() { const s = document.getElementById('cfkSheet'); if (s) s.remove(); },
    doClear() {
        this.state.cart = [];
        this.state.upsellShown = false;
        this.closeSheet();
        this.go('menu');
        this.toast(this.t('ล้างตะกร้าแล้ว', 'Cart cleared'));
    },

    /* ══════════════════════════════════════════════════════
       หน้า 6 — UPSELL (ครั้งเดียวต่อออเดอร์)
       ══════════════════════════════════════════════════════ */
    toCheckout() {
        if (!this.state.cart.length) return;
        if (this.cfg().kioskUpsell !== false && !this.state.upsellShown && this.upsellPicks().length) {
            this.state.upsellShown = true;
            // ล็อกรายการแนะนำไว้ตอนเข้าหน้า — ถ้าคำนวณใหม่ทุกครั้ง ของที่เพิ่งเพิ่มจะหายจากจอ (เพราะอยู่ในตะกร้าแล้ว)
            this._upsellIds = this.upsellPicks().map((p) => p.id);
            this.go('upsell');
        } else this.go('pay');
    },

    upsellPicks() {
        const inCart = new Set(this.state.cart.map((l) => l.productId));
        const ok = (p) => p.active && !p.soldOut && !inCart.has(p.id);
        let picks = CFStore.where('products', (p) => ok(p) && p.recommended);
        ['C-DESSERT', 'C-BAKERY'].forEach((c) => {
            if (picks.length < 4) {
                picks = picks.concat(CFStore.where('products', (p) => ok(p) && p.categoryId === c
                    && !picks.some((x) => x.id === p.id)));
            }
        });
        return picks.sort((a, b) => CFApp.minPriceOf(a) - CFApp.minPriceOf(b)).slice(0, 4);
    },

    screen_upsell() {
        const e = CFApp.esc;
        const picks = (this._upsellIds || this.upsellPicks().map((p) => p.id))
            .map((id) => CFStore.byId('products', id)).filter(Boolean);
        const addedLine = (id) => this.state.cart.find((l) => l.productId === id && l.upsell);
        const nAdded = picks.filter((p) => addedLine(p.id)).length;

        return `
        ${this.topHtml({ title: this.t('แนะนำเพิ่มเติม', 'Recommended'), back: 'cart' })}
        <div class="cfk-upsell">
            <div class="cfk-upsell-body">
                <div class="cfk-choices-q">${this.t('รับอะไรเพิ่มไหม?', 'Anything else?')}
                    <small>${this.t('แตะเพื่อเพิ่ม · แตะอีกครั้งเพื่อเอาออก · ไม่เอาก็กดไปชำระเงินได้เลย',
                                    'Tap to add · tap again to remove · or just continue to payment')}</small></div>
                <div class="cfk-upgrid">
                ${picks.map((p) => {
                    const added = !!addedLine(p.id);
                    return `<button class="cfk-card cfk-upcard ${added ? 'is-added' : ''}" aria-pressed="${added}"
                        onclick="CFKiosk.quickAdd('${p.id}')" ${p.soldOut ? 'disabled' : ''}>
                        ${CFKioskArt.tile(p, CFApp.serveTypesOf(p)[0])}
                        <span class="cfk-card-body">
                            <span class="cfk-card-name">${e(this.nm(p))}</span>
                            <span class="cfk-card-foot">
                                <span class="cfk-price">+฿${CFApp.money(CFApp.minPriceOf(p))}</span>
                            </span>
                            <span class="cfk-upcard-btn">${added
                                ? CFKioskArt.icon('check') + ' ' + this.t('เพิ่มแล้ว', 'Added')
                                : CFKioskArt.icon('plus') + ' ' + this.t('เพิ่ม', 'Add')}</span>
                        </span>
                    </button>`;
                }).join('')}
                </div>
            </div>
            <!-- ปุ่มเดียว — เดิมมี "ไม่ ขอบคุณ" กับ "ชำระเงิน" ที่ไปหน้าเดียวกัน ลูกค้าลังเลว่าต้องกดอันไหน
                 ข้อความบนปุ่มจึงบอกเองว่า "ไม่เพิ่ม" ได้ เมื่อยังไม่ได้เลือกอะไร -->
            <div class="cfk-actionbar">
                <button class="cfk-btn cfk-btn-primary cfk-btn-grow" onclick="CFKiosk.go('pay')">
                    ${nAdded ? this.t('ไปชำระเงิน', 'Continue to payment') : this.t('ไม่เพิ่ม · ไปชำระเงิน', 'No thanks · continue to payment')}
                    ฿${CFApp.money(this.cartTotal())} ${CFKioskArt.icon('next')}
                </button>
            </div>
        </div>`;
    },

    /**
     * เพิ่มจากหน้าแนะนำ — ใช้ค่าเริ่มต้นของกฎ ไม่ต้องให้ลูกค้าเลือกซ้ำ
     * แตะซ้ำ = เอาออก (เฉพาะรายการที่เพิ่มจากหน้านี้ — ของที่ลูกค้าเลือกเองจากเมนูไม่แตะ)
     */
    quickAdd(productId) {
        const p = CFStore.byId('products', productId);
        if (!p || p.soldOut) return;
        const had = this.state.cart.find((l) => l.productId === productId && l.upsell);
        if (had) {
            this.state.cart = this.state.cart.filter((l) => l !== had);
            this.render();
            this.toast(this.t('เอา ' + p.nameTh + ' ออกแล้ว', 'Removed ' + this.nm(p)));
            return;
        }
        const sv = CFApp.serveTypesOf(p)[0];
        this.state.cart.push({
            lineId: 'L' + Date.now().toString(36), productId, serveType: sv, qty: 1,
            mods: CFRules.defaultsFor(sv, p.categoryId), upsell: true,
        });
        this.render();
        this.toast(this.t('เพิ่ม ' + p.nameTh + ' แล้ว', 'Added ' + this.nm(p)));
    },

    /* ══════════════════════════════════════════════════════
       หน้า 7 — ชำระเงิน
       ══════════════════════════════════════════════════════ */
    screen_pay() {
        const tile = (key, tint) =>
            `<span class="cfk-media" style="--t1:${tint[0]};--t2:${tint[1]};--art-a:${tint[2]}">
                <svg class="cfk-art" viewBox="0 0 120 120"><use href="#cfa-${key}"/></svg></span>`;
        return `
        ${this.topHtml({ title: this.t('เลือกวิธีชำระเงิน', 'How would you like to pay?'), back: 'cart', mode: true })}
        <div class="cfk-choices">
                <div class="cfk-paytotal">
                    <span>${this.t('ยอดที่ต้องชำระ', 'Amount due')}</span><strong>฿${CFApp.money(this.cartTotal())}</strong>
                </div>
                <button class="cfk-bigchoice" onclick="CFKiosk.submit('CASH')">
                    ${CFKioskArt.icon('cash')}
                    <b>${this.t('เงินสด', 'Cash')}</b><small>${this.t('ชำระที่เคาน์เตอร์', 'Pay at the counter')}</small>
                </button>
                <button class="cfk-bigchoice" onclick="CFKiosk.submit('QR')">
                    ${CFKioskArt.icon('qr')}
                    <b>${this.t('QR พร้อมเพย์', 'PromptPay QR')}</b><small>${this.t('สแกนจ่ายด้วยมือถือ', 'Scan with your banking app')}</small>
                </button>
        </div>`;
    },

    /**
     * สร้างออเดอร์จริงแล้วส่งเข้าคิวแคชเชียร์
     *
     * เป็น async เพราะ CFOrders.create/transition ต้องรอเซิร์ฟเวอร์ตัดสิน
     *
     * ⚠️ ต้องกันการกดซ้ำ — ลูกค้ายืนหน้าจอแล้วปุ่มไม่ตอบทันทีจะกดรัว
     *    ถ้าปล่อยไว้จะได้สามออเดอร์และเก็บเงินสามรอบ
     */
    async submit(method) {
        if (this._submitting) return;
        this._submitting = true;
        this.setBusy(true, this.t('กำลังส่งออเดอร์…', 'Sending your order…'));
        try {
            // clientUuid ผูกกับ "การกดชำระครั้งนี้" — retry ตอนเน็ตสะดุดจึงได้ใบเดิม
            this._clientUuid = this._clientUuid || CFApi.uuid();

            const orderId = await CFOrders.create(this.state.cart, {
                kioskId: this.state.deviceId,
                paymentMethod: method,
                diningOption: this.state.dining || 'DINE_IN',
                clientUuid: this._clientUuid,
                expectTotal: this.cartTotal(),
            });
            // บอกเหตุผลจากเซิร์ฟเวอร์ด้วย (เช่น เมนูหมด ราคาเปลี่ยน) — คีออสก์ไม่มี showToast ของหน้าพนักงาน
            if (!orderId) {
                const why = CFOrders.lastError;
                this.toast(this.t('สร้างออเดอร์ไม่สำเร็จ', 'Could not place your order') + (why ? ' — ' + why : ''), 5000);
                return;
            }

            // กดซ้ำหลังหมดเวลารอ — เซิร์ฟเวอร์คืนออเดอร์เดิม (clientUuid) ซึ่งอาจเปลี่ยนสถานะไปแล้วรอบก่อน
            const target = method === 'CASH' ? 'WAITING_CASH' : 'WAITING_PAYMENT';
            const cur = CFStore.byId('orders', orderId);
            const ok = (cur && cur.status === target) ? true
                : await CFOrders.transition(orderId, target, { byId: 'KIOSK', device: this.state.deviceId });
            if (ok === false) { this.toast(this.t('ส่งออเดอร์ไม่สำเร็จ', 'Could not send your order')); return; }

            this._orderCart = { orderId, cart: this.state.cart };
            this.state.cart = [];
            this.state.orderId = orderId;
            this._clientUuid = null;          // ออเดอร์ถัดไปต้องได้ uuid ใหม่
            if (method === 'CASH') this.go('done', { kind: 'CASH' });
            else this.go('qr');
        } finally {
            this._submitting = false;
            this.setBusy(false);
        }
    },

    /** ม่านบางกันการกดระหว่างรอเซิร์ฟเวอร์ — ลูกค้าต้องเห็นว่าเครื่องกำลังทำงาน */
    setBusy(on, text) {
        let el = document.getElementById('cfkBusy');
        if (on) {
            if (!el) {
                el = document.createElement('div');
                el.id = 'cfkBusy';
                el.className = 'cfk-busy';
                this.stage.appendChild(el);
            }
            if (typeof text === 'object' && text && text.html) el.innerHTML = text.html;
            else el.textContent = text || this.t('กำลังทำงาน…', 'Working…');
            // solid = ปิดพื้นหลังทั้งจอ (ตอนตรวจสลิป — ไม่ให้ภาพกล้อง/ปุ่มด้านหลังแย่งสายตา)
            el.classList.toggle('is-solid', !!(text && text.solid));
        } else if (el) {
            el.remove();
        }
    },

    /* ── QR + นับถอยหลัง (§14, §16) ── */
    /**
     * หน้าจ่ายด้วย QR — QR · ภาพแนะนำวิธียกสลิป · กล้อง อยู่หน้าเดียว
     * กล้องรออ่านสลิปตั้งแต่แสดง QR: ลูกค้าโอนเสร็จยกมือถือขึ้นได้เลย ไม่ต้องหาปุ่ม "โอนแล้ว"
     */
    screen_qr() {
        const o = CFStore.byId('orders', this.state.orderId);
        const sec = CFStore.settings().qrTimeoutSec || 60;
        this._qrScanned = false;
        this._paused = false;
        this._rejectedRef = null;
        // ขอ QR ที่ผูกยอดไว้แล้วจากเซิร์ฟเวอร์ — นับถอยหลังเริ่มเมื่อได้เวลาหมดอายุจริง
        setTimeout(() => { this.loadQr(); this.startCam(); }, 0);
        return `
        ${this.topHtml({ title: this.t('สแกนเพื่อชำระเงิน', 'Scan to pay'), sub: this.t('ออเดอร์ ', 'Order ') + o.orderNo })}
        <div class="cfk-pay2">
            <div class="cfk-pay2-row">
                <div class="cfk-pay2-qr">
                    <div class="cfk-qr" id="cfkQrBox">
                        ${CFKioskArt.icon('qr')}
                        <span>${this.t('กำลังสร้าง QR…', 'Creating QR…')}</span>
                    </div>
                    <div class="cfk-pay2-amount">฿${CFApp.money(o.total)}</div>
                    <div class="cfk-note cfk-note-ok" id="cfkQrTimer">
                        ${CFKioskArt.icon('timer')}
                        <span>${this.t('เหลือเวลา', 'Time left')} <b class="cfk-countdown" id="cfkLeft">${sec}</b> ${this.t('วินาที', 'sec')}</span>
                    </div>
                </div>
                ${this.slipHintHtml(this.t('โอนแล้ว ยกสลิปแบบนี้', 'Paid? Show your slip like this'))}
            </div>
            <div class="cfk-pay2-cam">
                <div class="cfk-cam" id="cfkCam">
                    <video id="cfkVideo" playsinline muted></video>
                    <div class="cfk-cam-frame"></div>
                </div>
                <div class="cfk-note cfk-note-ok" id="cfkCamMsg">
                    ${CFKioskArt.icon('qr')}
                    <span>${this.SLIP_HOW()}</span>
                </div>
            </div>
            <div class="cfk-actionbar">
                <button class="cfk-btn cfk-btn-ghost cfk-btn-grow" onclick="CFKiosk.askEditOrder()">${CFKioskArt.icon('back')} ${this.t('แก้รายการ', 'Edit order')}</button>
                <button class="cfk-btn cfk-btn-ghost cfk-btn-grow" onclick="CFKiosk.askPayCash()">${this.t('จ่ายเงินสดแทน', 'Pay cash instead')}</button>
                <button class="cfk-btn cfk-btn-ghost cfk-btn-grow" onclick="CFKiosk.askStaff()">${this.t('แจ้งพนักงาน', 'Call staff')}</button>
            </div>
        </div>`;
    },

    /** แผงแนะนำข้าง QR / ข้างตัวนับหน้าสแกนสลิป: หัวข้อ · ภาพมือถือแสดงสลิป · ชิปวิธียก */
    slipHintHtml(title) {
        return `<div class="cfk-slip-hint">
                    <div class="cfk-slip-title">${title}</div>
                    ${CFKioskArt.slipHint()}
                    <div class="cfk-slip-chips">
                        <span>${this.t('หันจอสลิปเข้ากล้อง', 'Face the slip to the camera')}</span>
                        <span>${this.t('ห่างราว 1 คืบ', 'About a hand-span away')}</span>
                        <span>${this.t('ให้เห็น QR มุมสลิป', 'Keep the corner QR visible')}</span>
                    </div>
                </div>`;
    },

    /**
     * ขอ QR ที่ผูกยอดจากเซิร์ฟเวอร์
     * ยอดฝังอยู่ใน payload ลูกค้าจึงพิมพ์ยอดผิดไม่ได้ และเราตรวจซ้ำได้ตอนอ่านสลิป
     */
    async loadQr() {
        const box = document.getElementById('cfkQrBox');
        try {
            const r = await CFApi.post('/api/orders/' +
                encodeURIComponent(this.state.orderId) + '/qr', {});
            if (!box) return;
            box.classList.add('has-qr');
            box.innerHTML = '<div class="cfk-qr-img">' + r.svg + '</div>' +
                '<span>' + this.t('สแกนด้วยแอปธนาคาร · ยอดขึ้นให้อัตโนมัติ', 'Scan with your banking app · the amount fills in automatically') + '</span>';
            // นับถอยหลังจากเวลาหมดอายุจริงของเซิร์ฟเวอร์ ไม่ใช่ค่าคงที่ฝั่งเบราว์เซอร์
            this.startQr(Math.max(1, Math.round((new Date(r.expiresAt) - Date.now()) / 1000)));
        } catch (err) {
            if (box) {
                box.innerHTML = CFKioskArt.icon('alert') +
                    '<span>' + CFApp.esc(err.message || this.t('สร้าง QR ไม่สำเร็จ', 'Could not create the QR')) +
                    '<br>' + this.t('กรุณาชำระที่เคาน์เตอร์', 'Please pay at the counter') + '</span>';
            }
            // ออก QR ไม่ได้ก็ต้องขายต่อได้ — ส่งให้แคชเชียร์จัดการแทน ไม่ใช่ค้างคาหน้าจอ
            clearInterval(this._qr);
        }
    },

    startQr(sec) {
        clearInterval(this._qr);
        let left = sec;
        const el0 = document.getElementById('cfkLeft');
        if (el0) el0.textContent = left;
        this._qr = setInterval(() => {
            left--;
            const el = document.getElementById('cfkLeft');
            if (el) el.textContent = Math.max(0, left);
            if (left <= 0) { clearInterval(this._qr); this.go('qrexpired'); }
        }, 1000);
    },

    /**
     * ลูกค้ากด "โอนแล้ว" → ไปหน้าสแกนสลิป
     *
     * ★ คำกดของลูกค้าไม่ใช่หลักฐาน — ต้องยกสลิปในมือถือให้กล้องอ่าน QR บนสลิป
     *   เซิร์ฟเวอร์ตรวจรูปแบบ + กันสลิปใบเดิมใช้ซ้ำ แล้วส่งไปรอแคชเชียร์ยืนยันยอด (PAYMENT_REVIEW)
     *   ครัวได้ออเดอร์เมื่อแคชเชียร์เห็นเงินเข้าแล้วเท่านั้น (§44 Verify Before Forward)
     */
    qrPaid() {
        clearInterval(this._qr);
        this._paused = false;
        this._rejectedRef = null;
        this.go('slip');
    },

    /* ══════════════════════════════════════════════════════
       หน้า 7b — สแกนสลิปจากจอมือถือลูกค้า
       ══════════════════════════════════════════════════════ */
    screen_slip() {
        const o = CFStore.byId('orders', this.state.orderId);
        setTimeout(() => this.startCam(), 0);
        // หน้าตาเดียวกับหน้า QR (cfk-pay2) — ช่อง QR ด้านซ้ายเปลี่ยนเป็นป้าย "โอนแล้ว" เพราะไม่ต้องสแกน QR อีก
        return `
        ${this.topHtml({ title: this.t('สแกนสลิปโอนเงิน', 'Scan your transfer slip'), sub: this.t('ออเดอร์ ', 'Order ') + o.orderNo })}
        <div class="cfk-pay2">
            <div class="cfk-pay2-row">
                <div class="cfk-pay2-qr">
                    <div class="cfk-qr cfk-pay2-paid">
                        ${CFKioskArt.icon('check')}
                        <span>${this.t('โอนแล้ว · รอตรวจสลิป', 'Paid · checking slip')}</span>
                    </div>
                    <div class="cfk-pay2-amount">฿${CFApp.money(o.total)}</div>
                    <!-- หมดเวลาแล้วส่งให้พนักงานเอง — ต้องเห็นตัวนับ ไม่งั้นลูกค้างงว่าทำไมหน้าเปลี่ยน -->
                    <div class="cfk-note cfk-note-ok" id="cfkSlipTimer">
                        ${CFKioskArt.icon('timer')}
                        <span>${this.t('เหลือเวลา', 'Time left')} <b class="cfk-countdown" id="cfkSlipLeft">${this.cfg().kioskSlipScanSec || 90}</b> ${this.t('วินาที', 'sec')}</span>
                    </div>
                </div>
                ${this.slipHintHtml(this.t('ยกสลิปแบบนี้', 'Show your slip like this'))}
            </div>
            <div class="cfk-pay2-cam">
                <div class="cfk-cam" id="cfkCam">
                    <video id="cfkVideo" playsinline muted></video>
                    <div class="cfk-cam-frame"></div>
                </div>
                <div class="cfk-note cfk-note-ok" id="cfkCamMsg">
                    ${CFKioskArt.icon('qr')}
                    <span>${this.SLIP_HOW()}</span>
                </div>
            </div>
            <div class="cfk-actionbar">
                <button class="cfk-btn cfk-btn-ghost cfk-btn-grow" onclick="CFKiosk.askStaff()">
                    ${this.t('สแกนไม่ได้ · แจ้งพนักงาน', 'Can\'t scan · call staff')}
                </button>
            </div>
        </div>`;
    },

    SLIP_HOW() {
        return this.t('หันจอสลิปเข้ากล้อง ให้เห็นทั้งใบจนถึง QR', 'Turn your slip to the camera — show the whole slip down to the QR');
    },

    camMsg(text, warn) {
        const el = document.getElementById('cfkCamMsg');
        if (!el) return;
        el.className = 'cfk-note ' + (warn ? 'cfk-note-warn' : 'cfk-note-ok');
        el.innerHTML = CFKioskArt.icon(warn ? 'alert' : 'qr') + '<span></span>';
        el.querySelector('span').textContent = text;
    },

    /** หน้าที่เปิดกล้องสแกนสลิป — หน้า QR (กล้องรอตั้งแต่แสดง QR) และหน้าสแกนสลิปเดี่ยว */
    camScreen() { return this.state.screen === 'slip' || this.state.screen === 'qr'; },

    resetScanDeadline() {
        // หมดเวลาแล้วส่งให้พนักงานดูแทน — ไม่ปล่อยให้ลูกค้ายืนงงหน้าเครื่อง
        // หน้า QR ก่อนสแกนครั้งแรก: ตัวนับของ QR เป็นตัวคุมเวลา (หมดแล้วไปหน้า "โอนแล้วหรือยัง?")
        this._deadline = (this.state.screen === 'qr' && !this._qrScanned)
            ? Infinity : Date.now() + (this.cfg().kioskSlipScanSec || 90) * 1000;
    },

    /**
     * อ่านสลิปไม่ครบ → หยุดกล้องไว้ แสดงภาพที่ถ่ายได้แทนภาพสด + ปุ่มถ่ายใหม่ / ส่งให้พนักงาน
     * ลูกค้าเห็นเองว่าภาพเบลอหรือวันที่หลุดกรอบ แก้ได้ตรงจุดกว่าอ่านคำอธิบายอย่างเดียว
     */
    camPreview(image, [title, how]) {
        this._paused = true;
        const cam = document.getElementById('cfkCam');
        if (cam && image) {
            let pv = document.getElementById('cfkPreview');
            if (!pv) {
                pv = document.createElement('img');
                pv.id = 'cfkPreview';
                pv.className = 'cfk-cam-preview';
                pv.alt = this.t('ภาพสลิปที่ถ่ายได้', 'Photo of your slip');
                cam.appendChild(pv);
            }
            pv.src = image;
        }
        this.camRetake([title, how]);
        const el = document.getElementById('cfkCamMsg');
        if (el) {
            el.querySelector('.cfk-slip-reject-next').textContent = this.t('นี่คือภาพที่กล้องถ่ายได้ — ถ่ายใหม่ได้เรื่อย ๆ จนกว่าจะชัด',
                'This is the photo the camera took — you can retake it until it is clear');
            el.insertAdjacentHTML('beforeend', `
                <div class="cfk-preview-actions">
                    <button class="cfk-btn cfk-btn-ghost cfk-btn-grow" onclick="CFKiosk.previewSend()">${this.t('ส่งให้พนักงานตรวจ', 'Send to staff')}</button>
                    <button class="cfk-btn cfk-btn-primary cfk-btn-grow" onclick="CFKiosk.previewRetake()">
                        ${CFKioskArt.icon('qr')} ${this.t('ถ่ายใหม่', 'Retake')}</button>
                </div>`);
        }
        // ลูกค้าเดินหนีไประหว่างดูภาพ → ส่งให้พนักงานเองหลัง 60 วิ (สลิปบันทึกไว้แล้ว)
        clearTimeout(this._previewT);
        this._previewT = setTimeout(() => { if (this._paused) this.previewSend(); }, 60000);
    },

    previewRetake() {
        clearTimeout(this._previewT);
        const pv = document.getElementById('cfkPreview');
        if (pv) pv.remove();
        this.camMsg(this.t('หันจอมือถือเข้าหากล้องอีกครั้ง ให้เห็นทั้งใบตั้งแต่วันที่ด้านบนจนถึง QR',
                           'Turn your phone to the camera again — show the whole slip from the date to the QR'));
        this.resetScanDeadline();
        this._paused = false;
    },

    previewSend() {
        clearTimeout(this._previewT);
        this._paused = false;
        this.stopCam();
        this.go('done', { kind: 'REVIEW' });
    },

    /** ขอสแกนใหม่ — เด่นเท่ากล่องสลิปไม่ผ่าน แต่เป็นสีเหลือง (ลูกค้าไม่ได้ทำผิด แค่ต้องถือใหม่) */
    camRetake([title, how]) {
        const el = document.getElementById('cfkCamMsg');
        if (!el) return;
        const e = CFApp.esc;
        el.className = 'cfk-slip-reject cfk-slip-retake';
        el.innerHTML = `
            <div class="cfk-slip-reject-head">${CFKioskArt.icon('alert')} ${e(title)}</div>
            <div class="cfk-slip-reject-why">${e(how)}</div>
            <div class="cfk-slip-reject-next">${this.t('แล้วสแกนอีกครั้ง — กล้องยังเปิดอยู่', 'Then scan again — the camera is still on')}</div>`;
    },

    /** สลิปไม่ผ่าน — ต้องเด่นพอให้ลูกค้าที่กำลังมองมือถือตัวเองเห็น ไม่ใช่แค่แถบเล็ก ๆ */
    camReject(reasons) {
        const el = document.getElementById('cfkCamMsg');
        if (!el) return;
        const e = CFApp.esc;
        el.className = 'cfk-slip-reject';
        el.innerHTML = `
            <div class="cfk-slip-reject-head">${CFKioskArt.icon('alert')} ${this.t('สลิปนี้ไม่ตรงกับออเดอร์', 'This slip does not match your order')}</div>
            ${reasons.map((r) => `<div class="cfk-slip-reject-why">${e(r)}</div>`).join('')}
            <div class="cfk-slip-reject-next">${this.t('เปิดสลิปที่ถูกต้องแล้วสแกนใหม่ หรือกด "แจ้งพนักงาน" ด้านล่าง',
                'Open the correct slip and scan again, or tap "Call staff" below')}</div>`;
    },

    async startCam() {
        this.stopCam();
        const video = document.getElementById('cfkVideo');
        if (!video) return;
        // กล้องเปิดได้เฉพาะหน้าเว็บที่เบราว์เซอร์ถือว่าปลอดภัย (https หรือเปิดด้วยค่าพิเศษ)
        // วิธีตั้งเครื่องคีออสก์อยู่ใน ops/README.md หัวข้อ "กล้องสแกนสลิป"
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.jsQR) {
            this.camMsg(this.t('กล้องของเครื่องนี้ยังใช้ไม่ได้ กรุณาแจ้งพนักงานที่เคาน์เตอร์', 'The camera is not available — please ask our staff at the counter'), true);
            return;
        }
        try {
            this._cam = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
            });
            // โฟกัสต่อเนื่อง — มือถือลูกค้าอยู่ใกล้กล้องแค่ 20–30 ซม. กล้องที่ล็อกโฟกัสไกลจะเบลอเสมอ
            // กล้องราคาถูกหลายรุ่นไม่มีตัวเลือกนี้ (ปฏิเสธเงียบ ๆ) — ไม่เป็นไร ใช้ต่อได้
            const track = this._cam.getVideoTracks()[0];
            const caps = track && track.getCapabilities ? track.getCapabilities() : {};
            if (caps.focusMode && caps.focusMode.includes('continuous')) {
                track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
            }
            // จอมือถือมีแสงในตัว กล้องมักรับแสงเกินจนพื้นขาวของสลิปกลืนตัวหนังสือ — ลดลงราว 1 สต็อป
            if (caps.exposureCompensation && caps.exposureCompensation.min < 0) {
                const ev = Math.max(caps.exposureCompensation.min, -1);
                track.applyConstraints({ advanced: [{ exposureCompensation: ev }] }).catch(() => {});
            }
        } catch (err) {
            console.warn('[kiosk] เปิดกล้องไม่ได้', err);
            this.camMsg(this.t('เปิดกล้องไม่ได้ กรุณาแจ้งพนักงานที่เคาน์เตอร์', 'Could not open the camera — please ask our staff at the counter'), true);
            return;
        }
        if (!this.camScreen()) { this.stopCam(); return; }   // ลูกค้ากดออกไประหว่างรอ
        video.srcObject = this._cam;
        await video.play().catch(() => {});

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        let lastHint = 0;
        // หมดเวลาแล้วส่งให้พนักงานดูแทน — ไม่ปล่อยให้ลูกค้ายืนงงหน้าเครื่อง
        this._paused = false;
        this.resetScanDeadline();
        // ตัวนับบนจอ — ตอนดูภาพที่ถ่าย (paused) เส้นตายไม่เดิน จึงไม่นับลง
        this._slipT = setInterval(() => {
            const el = document.getElementById('cfkSlipLeft');
            if (el && !this._paused) el.textContent = Math.max(0, Math.ceil((this._deadline - Date.now()) / 1000));
        }, 1000);

        this._scan = setInterval(async () => {
            if (this._submitting || !video.videoWidth) return;
            if (this._paused) return;                         // กำลังดูภาพที่ถ่าย รอลูกค้าตัดสินใจ
            if (Date.now() > this._deadline) { this.stopCam(); this.qrTimeout(); return; }
            // ย่อภาพก่อนถอดรหัส — เร็วขึ้นหลายเท่า และ QR บนจอมือถือยังใหญ่พอ
            const scale = Math.min(1, 800 / video.videoWidth);
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
            if (!code || !code.data) { this.liveHint(canvas); return; }

            const slip = CFSlip.parse(code.data);
            if (!slip.ok) {
                if (Date.now() - lastHint > 3000) {
                    lastHint = Date.now();
                    this.camMsg(this.t('QR นี้ไม่ใช่สลิป — กรุณาเปิดหน้าสลิปหลังโอนเงินสำเร็จ', 'This QR is not a slip — open the slip shown after your transfer'), true);
                }
                return;
            }
            // สลิปใบที่เพิ่งตรวจแล้วไม่ผ่าน — ลูกค้ายังถือค้างไว้ ไม่ต้องส่งซ้ำ ย้ำข้อความเดิมพอ
            if (slip.ref === this._rejectedRef) return;
            this.submitSlip(code.data, video);
        }, 200);
    },

    stopCam() {
        clearInterval(this._scan);
        clearInterval(this._slipT);
        this._scan = null;
        if (this._cam) {
            this._cam.getTracks().forEach((t) => t.stop());
            this._cam = null;
        }
    },

    /**
     * ถ่ายภาพเฟรมนี้เก็บเป็นหลักฐาน — เต็มความละเอียดของกล้อง (ไม่ใช่ภาพย่อที่ใช้ถอดรหัส)
     * และไม่กลับด้านแบบกระจก ตัวหนังสือบนสลิปจะได้อ่านออก (กล้องที่กลับภาพมาเองก็พลิกคืนให้)
     */
    snapSlip(video) {
        const c = document.createElement('canvas');
        const scale = Math.min(1, 1600 / video.videoWidth);
        c.width = Math.round(video.videoWidth * scale);
        c.height = Math.round(video.videoHeight * scale);
        this.drawFrame(c.getContext('2d'), video, c.width, c.height, this.camFlip());
        return c;
    },

    /**
     * ความคมของภาพ — ความแปรปรวนของ Laplacian บนภาพขาวดำย่อ
     * ภาพเบลอขอบตัวอักษรจะนุ่ม ค่าต่ำ · ภาพคมขอบชัด ค่าสูง
     * (ย่อก่อนคำนวณ ไม่งั้นช้าเกินสำหรับหลายเฟรมบนเครื่องคีออสก์)
     */
    sharpness(canvas) { return this.frameStats(canvas).sharp; },

    /**
     * คุณภาพภาพหนึ่งเฟรม (ย่อเหลือ 400 px ก่อน)
     *   sharp   ความคม — ความแปรปรวนของ Laplacian
     *   glare   สัดส่วนจุดขาวจ้าจนเต็มสเกล (แสงสะท้อน/รับแสงเกิน) ในครึ่งกลางของภาพ
     *   screen  สัดส่วนพื้นสว่างกลางภาพ — มีจอมือถือยกมาอยู่หน้ากล้องไหม
     */
    frameStats(canvas) {
        const w = 400, h = Math.round(400 * canvas.height / canvas.width);
        const s = document.createElement('canvas');
        s.width = w; s.height = h;
        const x = s.getContext('2d', { willReadFrequently: true });
        x.drawImage(canvas, 0, 0, w, h);
        const d = x.getImageData(0, 0, w, h).data;
        const g = new Float32Array(w * h);
        for (let i = 0; i < w * h; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
        let sum = 0, sq = 0, n = 0;
        for (let y = 1; y < h - 1; y++) {
            for (let xx = 1; xx < w - 1; xx++) {
                const i = y * w + xx;
                const lap = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
                sum += lap; sq += lap * lap; n++;
            }
        }
        const mean = sum / n;
        // นับเฉพาะครึ่งกลางของภาพ — ขอบภาพมักเป็นผนัง/เพดานที่สว่างอยู่แล้ว ไม่เกี่ยวกับสลิป
        let clip = 0, bright = 0, c = 0;
        for (let y = Math.floor(h / 4); y < Math.floor(h * 3 / 4); y++) {
            for (let xx = Math.floor(w / 4); xx < Math.floor(w * 3 / 4); xx++) {
                const v = g[y * w + xx];
                if (v >= 250) clip++;
                if (v >= 170) bright++;
                c++;
            }
        }
        return { sharp: sq / n - mean * mean, glare: clip / c, screen: bright / c };
    },

    /**
     * บอกลูกค้าทันทีว่าทำไมยังอ่านไม่ได้ — ตรวจราววินาทีละครั้ง ต้องเป็นแบบเดิมติดกัน 2 ครั้งถึงขึ้น
     * ขึ้นเฉพาะตอนมีจอมือถืออยู่หน้ากล้องแล้ว (ยังไม่ยกมือถือมา ไม่ต้องเตือนอะไร)
     * ไม่ทับกล่องแดง/เหลือง (สลิปไม่ผ่าน / ขอถ่ายใหม่) ที่ลูกค้ากำลังอ่านอยู่
     */
    liveHint(canvas) {
        this._hintTick = (this._hintTick || 0) + 1;
        if (this._hintTick % 5) return;
        const el = document.getElementById('cfkCamMsg');
        if (!el || !el.classList.contains('cfk-note')) return;
        const st = this.frameStats(canvas);
        const kind = st.screen < 0.15 ? null
            : st.glare > 0.12 ? 'glare'
            : st.sharp < 40 ? 'blur' : null;
        if (kind !== this._hintPrev) { this._hintPrev = kind; return; }       // รอให้เห็นซ้ำก่อน กันข้อความกะพริบ
        const text = {
            glare: this.t('มีแสงสะท้อนบนจอมือถือ — เอียงมือถือเล็กน้อยให้พ้นแสงไฟ', 'There is glare on your screen — tilt your phone a little away from the light'),
            blur: this.t('ภาพยังไม่ชัด — ถือมือถือนิ่ง ๆ ห่างกล้องราว 25 ซม.', 'The image is blurry — hold your phone still, about 25 cm from the camera'),
        }[kind] || this.SLIP_HOW();
        if (el.textContent.trim() !== text) this.camMsg(text, !!kind);
    },

    /**
     * อ่าน QR ได้ตอนที่มือลูกค้ายังขยับ — เฟรมนั้นมักเบลอ
     * เก็บต่ออีก ~0.6 วิ (ลูกค้าถือนิ่งขึ้นเองเมื่อเห็นว่าเครื่องกำลังทำงาน) แล้วเลือกเฟรมที่คมที่สุด
     */
    async captureBest(video, ms = 600) {
        try {
            let best = null, bestScore = -1;
            const until = Date.now() + ms;
            do {
                const c = this.snapSlip(video);
                // ภาพคมแต่มีแสงสะท้อนเป็นแผ่น อ่านไม่ออกเท่าภาพที่คมน้อยกว่าแต่ไม่มีแสงสะท้อน
                const st = this.frameStats(c);
                const score = st.sharp * (1 - Math.min(0.8, st.glare * 3));
                if (score > bestScore) { best = c; bestScore = score; }
                await new Promise((r) => setTimeout(r, 70));
            } while (Date.now() < until);
            return best ? best.toDataURL('image/jpeg', 0.85) : null;
        } catch (err) {
            return null;        // ถ่ายไม่ได้ก็ยังส่งสลิปได้ — ภาพเป็นของเสริม
        }
    },

    async submitSlip(payload, video) {
        if (this._submitting) return;
        this._submitting = true;
        if (this.state.screen === 'qr' && !this._qrScanned) {
            this._qrScanned = true;
            clearInterval(this._qr);
            const t = document.getElementById('cfkQrTimer');
            if (t) t.hidden = true;
            this.resetScanDeadline();
        }
        this.slipSteps('capture');
        try {
            const image = video ? await this.captureBest(video) : null;
            this.slipSteps('send');
            const r = await CFApi.post('/api/orders/' + encodeURIComponent(this.state.orderId) + '/slip', { payload, image }, { timeout: 60000 });   // อัปโหลดภาพเต็มขนาด — Wi-Fi ช้าใช้เวลานานกว่าคำขอทั่วไป
            const res = r.slipId ? await this.waitSlipCheck(r.slipId, r.bank) : null;
            if (res && res.verdict === 'FAIL') {
                // ยอด/วันที่ไม่ตรง — บอกลูกค้าตรงนี้ ให้สแกนใบที่ถูกต้องหรือแจ้งพนักงาน (กล้องยังเปิดอยู่)
                this._rejectedRef = r.ref;
                const why = (res.notes || []).filter((n, i) =>
                    (i === 0 && res.checks.amount === 'FAIL') || (i === 1 && res.checks.date === 'FAIL') ||
                    (i === 2 && res.checks.receiver === 'FAIL'));
                this.camReject(why);
                return;
            }
            // อ่านยอดไม่ออก (ภาพเบลอ) หรือไม่เห็นวันที่ (ถือให้กล้องเห็นแค่ครึ่งล่างที่มี QR)
            // → โชว์ภาพที่ถ่ายได้ให้ลูกค้าเห็นเองว่าผิดตรงไหน แล้วให้ถ่ายใหม่ วนได้จนกว่าจะอ่านออก
            //   ลูกค้าเลือก "ส่งให้พนักงานตรวจ" ได้ทุกเมื่อ — ไม่มีใครติดวนอยู่หน้าเครื่อง
            const noAmount = res && (res.status === 'ERROR' || (res.checks && res.checks.amount === 'UNKNOWN'));
            const noDate = res && res.checks && res.checks.date === 'UNKNOWN';
            // ร้านตั้งบัญชีไว้ (ไม่ใช่ SKIP) แต่หาผู้รับไม่เจอ — มักเป็นนิ้วหรือแสงสะท้อนบังกลางสลิป
            const noReceiver = res && res.checks && res.checks.receiver === 'UNKNOWN';
            if (noAmount || noDate || noReceiver) {
                this.camPreview(image, noAmount
                    ? [this.t('ภาพสลิปไม่ชัด อ่านยอดเงินไม่ออก', 'The slip is not clear — we could not read the amount'),
                       this.t('ถือมือถือนิ่ง ๆ ห่างกล้องราว 25 ซม. และเพิ่มความสว่างจอ', 'Hold your phone still about 25 cm away and turn up the screen brightness')]
                    : noDate ? [this.t('ไม่เห็นวันที่บนสลิป', 'We cannot see the date on the slip'),
                                this.t('เลื่อนมือถือให้เห็นหัวสลิปที่มีวันที่และเวลาด้วย', 'Move your phone so the top of the slip with the date and time shows too')]
                    : [this.t('ไม่เห็นชื่อผู้รับเงิน', 'We cannot see the receiver name'),
                       this.t('ระวังนิ้วหรือแสงสะท้อนบังกลางสลิป — เอียงมือถือเล็กน้อย', 'Keep fingers and glare off the middle of the slip — tilt your phone a little')]);
                return;
            }
            // ผ่าน / อ่านไม่ออก / ตัวอ่านสลิปไม่ตอบ → ให้แคชเชียร์ตรวจตามปกติ ไม่ให้ลูกค้าติดอยู่หน้าเครื่อง
            this.stopCam();
            this.go('done', { kind: 'REVIEW' });
        } catch (err) {
            // สลิปซ้ำ/ไม่ใช่สลิป → บอกเหตุผลแล้วสแกนต่อได้ ไม่ปิดกล้อง
            this.camMsg(err.offline ? this.t('ติดต่อเซิร์ฟเวอร์ไม่ได้ กรุณาแจ้งพนักงาน', 'Cannot reach the shop system — please ask our staff')
                                    : (err.message || this.t('ตรวจสลิปไม่สำเร็จ', 'Could not check the slip')), true);
            // กันอ่าน QR เดิมซ้ำรัว ๆ ขณะที่ลูกค้ายังถือมือถือค้างไว้
            await new Promise((r) => setTimeout(r, 2500));
        } finally {
            this._submitting = false;
            this.setBusy(false);
        }
    },

    /**
     * รอผลอ่านสลิป (OCR) — นานสุด 25 วินาที ไม่งั้นคืน null แล้วปล่อยให้แคชเชียร์ตรวจแทน
     * วัดจริงบนเครื่อง 8 คอร์: 5–10 วิต่อใบ (สลิปที่มีตัวหนังสือเยอะช้ากว่า) — 15 วิเดิมเฉียดเส้นเกินไป
     * บอกลูกค้าว่าอีกนานแค่ไหน ไม่งั้นยืนรอ 10 วิแล้วนึกว่าเครื่องค้าง
     */
    async waitSlipCheck(slipId, bank) {
        const t0 = Date.now(), until = t0 + 25000;
        const tick = () => this.slipSteps('check', { bank, elapsed: (Date.now() - t0) / 1000 });
        tick();
        const timer = setInterval(tick, 1000);
        try {
            return await this._pollSlip(slipId, until);
        } finally {
            clearInterval(timer);
        }
    },

    /**
     * การ์ดขั้นตอนระหว่างรอ — ลูกค้าเห็นว่าผ่านอะไรไปแล้ว และกำลังทำอะไรอยู่
     *   capture  ถ่ายภาพสลิป (~0.6 วิ) · send ส่งให้ร้านตรวจ · check ตรวจยอด/วันที่ (OCR 5–10 วิ)
     * ★ ไม่โชว์ตัวเลขวินาที — เวลาจริงขึ้นกับเครื่อง เลขหมดแล้วยังไม่เสร็จ ลูกค้าจะนึกว่าค้าง
     *   ใช้แถบ loading วิ่งไม่รู้จบแทน · รอนานเกิน 12 วิ เปลี่ยนข้อความเป็น "อีกสักครู่"
     */
    slipSteps(phase, o = {}) {
        const e = CFApp.esc;
        const order = ['capture', 'send', 'check'];
        const at = order.indexOf(phase);
        const step = (i, doneText, activeText) => {
            const st = i < at ? 'done' : i === at ? 'active' : 'todo';
            const mark = st === 'done' ? '✓' : st === 'active' ? '<span class="cfk-spin"></span>' : '';
            return `<li class="cfk-step is-${st}"><span class="cfk-step-mark">${mark}</span>
                    <span>${st === 'done' ? doneText : activeText}</span></li>`;
        };
        this.setBusy(true, { solid: true, html: `
            <div class="cfk-slipwait" role="status" aria-live="polite">
                <div class="cfk-slipwait-title">${at < 2 ? this.t('กำลังรับสลิป', 'Receiving your slip') : this.t('กำลังตรวจสลิป', 'Checking your slip')}</div>
                <ol class="cfk-steps">
                    ${step(0, this.t('ถ่ายภาพสลิปแล้ว', 'Photo taken'), this.t('ถือมือถือนิ่ง ๆ กำลังถ่ายภาพสลิป', 'Hold still — taking a photo of the slip'))}
                    ${step(1, this.t('อ่านสลิปแล้ว', 'Slip read') + (o.bank ? ' · ' + e(o.bank) : '') + this.t(' · ยังไม่เคยใช้', ' · not used before'), this.t('กำลังอ่านสลิป', 'Reading the slip'))}
                    ${step(2, '', this.t('กำลังตรวจยอดเงินและวันที่', 'Checking the amount and date'))}
                </ol>
                ${at === 2 ? `
                <div class="cfk-slipwait-bar is-loading"><span></span></div>
                <div class="cfk-slipwait-left">${(o.elapsed || 0) < 12 ? this.t('กรุณารอสักครู่', 'Please wait a moment') : this.t('อีกสักครู่ ใกล้เสร็จแล้ว', 'Almost done')}</div>
                <div class="cfk-slipwait-note">${this.t('เก็บมือถือได้เลย ไม่ต้องถือค้างไว้', 'You can put your phone away now')}</div>` : ''}
            </div>` });
    },

    async _pollSlip(slipId, until) {
        while (Date.now() < until) {
            try {
                const r = await CFApi.get('/api/slips/' + encodeURIComponent(slipId) + '/check');
                if (r.status === 'DONE' || r.status === 'ERROR') return r;
            } catch (err) {
                return null;
            }
            await new Promise((ok) => setTimeout(ok, 700));
        }
        return null;
    },

    /**
     * นับถอยหลังจบ — ถามลูกค้าก่อน ไม่ส่งไปหาพนักงานเอง
     * QR พร้อมเพย์ไม่มีวันหมดอายุในระบบธนาคาร ลูกค้าที่เพิ่งโอนเสร็จตอนเลขหมดยังเป็นการจ่ายจริง
     * ต้องสแกนสลิปได้ ไม่ใช่โดนไล่ไปเคาน์เตอร์ · ไม่มีใครกด 30 วิ = เดินไปแล้ว ส่งให้พนักงาน
     */
    screen_qrexpired() {
        const o = CFStore.byId('orders', this.state.orderId);
        clearTimeout(this._expT);
        this._expT = setTimeout(() => { if (this.state.screen === 'qrexpired') this.qrTimeout(); }, 30000);
        return `
        ${this.topHtml({ title: this.t('หมดเวลาชำระเงิน', 'Payment time is up'), sub: this.t('ออเดอร์ ', 'Order ') + o.orderNo + ' · ฿' + CFApp.money(o.total) })}
        <div style="display:grid;grid-template-rows:1fr auto;min-height:0">
            <div class="cfk-center"><div class="cfk-panel">
                <div class="cfk-done-ico warn">${CFKioskArt.icon('timer')}</div>
                <div class="cfk-slipwait-title">${this.t('โอนเงินไปแล้วหรือยัง?', 'Have you already paid?')}</div>
                <div class="cfk-note cfk-note-ok">${CFKioskArt.icon('qr')}
                    <span>${this.t('ถ้าโอนแล้ว กดสแกนสลิปได้เลย แม้เวลาจะหมด · ถ้ายังไม่ได้โอน ขอ QR ใหม่หรือจ่ายเงินสดได้',
                                   'If you paid, scan your slip even though time is up · If not, get a new QR or pay cash')}</span></div>
            </div></div>
            <div class="cfk-actionbar cfk-actionbar-stack">
                <button class="cfk-btn cfk-btn-primary cfk-btn-grow" onclick="CFKiosk.expiredChoice('scan')">
                    ${CFKioskArt.icon('check')} ${this.t('โอนแล้ว · สแกนสลิป', 'Paid · scan slip')}</button>
                <button class="cfk-btn cfk-btn-ghost cfk-btn-grow" onclick="CFKiosk.expiredChoice('newqr')">${this.t('ขอ QR ใหม่', 'Get a new QR')}</button>
                <button class="cfk-btn cfk-btn-ghost cfk-btn-grow" onclick="CFKiosk.expiredChoice('edit')">${this.t('กลับไปแก้รายการ', 'Go back and edit order')}</button>
                <button class="cfk-btn cfk-btn-ghost cfk-btn-grow" onclick="CFKiosk.expiredChoice('cash')">${this.t('จ่ายเงินสดแทน', 'Pay cash instead')}</button>
                <button class="cfk-btn cfk-btn-ghost cfk-btn-grow" onclick="CFKiosk.expiredChoice('staff')">${this.t('แจ้งพนักงาน', 'Call staff')}</button>
            </div>
        </div>`;
    },

    expiredChoice(kind) {
        clearTimeout(this._expT);
        if (kind === 'scan') return this.qrPaid();
        if (kind === 'newqr') return this.go('qr');                 // screen_qr ขอ QR ใบใหม่จากเซิร์ฟเวอร์เอง
        if (kind === 'cash') return this.askPayCash();
        if (kind === 'edit') return this.askEditOrder();
        return this.askStaff();
    },

    /**
     * ปุ่ม "แจ้งพนักงาน" ถามก่อน — เผลอแตะแล้วออเดอร์ไปค้างที่แคชเชียร์ ทั้งที่ลูกค้ากำลังจะโอน
     * (ตัวจับเวลาที่ส่งให้พนักงานเองยังเรียก qrTimeout() ตรง ไม่ต้องถาม)
     */
    askStaff() {
        this.confirmSheet({
            title: this.t('เรียกพนักงานช่วย?', 'Call our staff?'),
            text: this.t('พนักงานที่เคาน์เตอร์จะตรวจการชำระเงินให้ — ถ้ายังไม่ได้โอน กด "ยกเลิก" แล้วชำระต่อได้',
                         'Our staff at the counter will check your payment — if you have not paid yet, tap "Cancel" to continue'),
            ok: this.t('เรียกพนักงาน', 'Call staff'), onOk: 'qrTimeout',
        });
    },

    /** ลูกค้าไม่มีแอปธนาคาร / เน็ตมือถือ — เปลี่ยนออเดอร์นี้ไปจ่ายเงินสด (เซิร์ฟเวอร์ปิด QR ให้) */
    /**
     * กลับไปแก้รายการ — ยกเลิกออเดอร์ QR ที่ยังไม่ได้โอน แล้วคืนของเข้าตะกร้า
     * ถามก่อนเสมอ: ถ้าโอนไปแล้วแต่ยกเลิก เงินจะเข้าออเดอร์ที่ไม่มีอยู่
     * (เซิร์ฟเวอร์ปฏิเสธเองถ้ามีสลิปสแกนเข้ามาแล้ว — ดู /api/orders/:id/kiosk-cancel)
     */
    askEditOrder() {
        this.confirmSheet({
            title: this.t('ยังไม่ได้โอนเงินใช่ไหม?', 'You have not paid yet?'),
            text: this.t('ออเดอร์นี้และ QR จะถูกยกเลิก แล้วกลับไปแก้รายการในตะกร้า — ถ้าโอนไปแล้ว อย่ากด ให้สแกนสลิปหรือแจ้งพนักงาน',
                         'This order and its QR will be cancelled and you go back to your cart — if you already paid, do not continue: scan your slip or call staff'),
            ok: this.t('ยังไม่โอน · แก้รายการ', 'Not paid · edit order'), onOk: 'editOrder',
        });
    },

    async editOrder() {
        if (this._submitting) return;
        this._submitting = true;
        this.setBusy(true, this.t('กำลังยกเลิกออเดอร์…', 'Cancelling the order…'));
        try {
            const id = this.state.orderId;
            try {
                await CFApi.post('/api/orders/' + encodeURIComponent(id) + '/kiosk-cancel', {});
            } catch (err) {
                this.toast(err.message || this.t('แก้รายการไม่ได้ กรุณาแจ้งพนักงาน', 'Cannot edit — please call staff'), 3000);
                return;
            }
            clearInterval(this._qr);
            clearTimeout(this._expT);
            this.stopCam();
            const saved = this._orderCart && this._orderCart.orderId === id ? this._orderCart.cart : [];
            this._orderCart = null;
            this.state.orderId = null;
            this.state.cart = saved;
            this.state.stack = [];
            this.go(saved.length ? 'cart' : 'menu');
        } finally {
            this._submitting = false;
            this.setBusy(false);
        }
    },

    askPayCash() {
        const o = CFStore.byId('orders', this.state.orderId);
        this.confirmSheet({
            title: this.t('เปลี่ยนเป็นจ่ายเงินสด?', 'Pay cash instead?'),
            text: this.t('QR นี้จะใช้ไม่ได้ แล้วไปชำระ ฿' + CFApp.money(o.total) + ' ที่เคาน์เตอร์ — ถ้าโอนไปแล้ว อย่าเปลี่ยน ให้กด "โอนแล้ว · สแกนสลิป"',
                         'This QR will stop working and you pay ฿' + CFApp.money(o.total) + ' at the counter — if you already transferred, tap "Paid · scan slip" instead'),
            ok: this.t('จ่ายเงินสด', 'Pay cash'), onOk: 'switchToCash',
        });
    },

    async switchToCash() {
        if (this._submitting) return;
        this._submitting = true;
        clearInterval(this._qr);
        clearTimeout(this._expT);
        this.setBusy(true, this.t('กำลังเปลี่ยนเป็นเงินสด…', 'Switching to cash…'));
        try {
            const ok = await CFOrders.transition(this.state.orderId, 'WAITING_CASH',
                { byId: 'KIOSK', device: this.state.deviceId, reason: 'ลูกค้าเปลี่ยนเป็นจ่ายเงินสดที่คีออสก์' });
            if (ok === false) { this.toast(this.t('เปลี่ยนไม่สำเร็จ กรุณาแจ้งพนักงาน', 'Could not switch — please ask our staff'), 2400); return; }
            this.go('done', { kind: 'CASH' });
        } finally {
            this._submitting = false;
            this.setBusy(false);
        }
    },

    async qrTimeout() {
        if (this._submitting) return;
        this._submitting = true;
        clearInterval(this._qr);
        this.stopCam();
        this.setBusy(true, this.t('กำลังแจ้งพนักงาน…', 'Calling staff…'));
        try {
            const id = this.state.orderId;
            // สถานะอาจเดินไปแล้วระหว่างที่ลูกค้ายืนสแกน (เซิร์ฟเวอร์ปิด QR ที่หมดเวลาเอง)
            // จึงข้ามขั้นที่ผ่านไปแล้ว ไม่งั้นลูกค้าเห็นข้อความ error ทั้งที่ไม่ได้ทำอะไรผิด
            const st = (CFStore.byId('orders', id) || {}).status;
            // ต้องรอตัวแรกให้เสร็จก่อน — สองคำสั่งนี้เป็นลำดับ ไม่ใช่ขนาน
            if (st === 'WAITING_PAYMENT') {
                await CFOrders.transition(id, 'PAYMENT_TIMEOUT',
                    { byId: 'SYSTEM', device: this.state.deviceId });
            }
            if (st !== 'PAYMENT_REVIEW') {
                await CFOrders.transition(id, 'PAYMENT_REVIEW',
                    { byId: 'SYSTEM', device: this.state.deviceId,
                      reason: 'ลูกค้ากดแจ้งพนักงานจากคีออสก์' });
            }
            this.go('done', { kind: 'TIMEOUT' });
        } finally {
            this._submitting = false;
            this.setBusy(false);
        }
    },

    /* ══════════════════════════════════════════════════════
       หน้า 8 — เสร็จสิ้น
       ══════════════════════════════════════════════════════ */
    screen_done(params) {
        const e = CFApp.esc;
        const o = CFStore.byId('orders', this.state.orderId);
        const kind = (params && params.kind) || 'CASH';
        const sec = this.cfg().kioskDoneSec || 12;
        setTimeout(() => this.startDone(sec), 0);
        this.printTicket(this.state.orderId, kind);

        // หัวข้อบอกสิ่งที่ลูกค้าต้องทำต่อ ไม่ใช่ "เรียบร้อย" ทุกกรณี —
        // ลูกค้าที่ยังไม่ได้จ่าย (เงินสด / QR หมดเวลา) ห้ามเข้าใจว่าเสร็จแล้วเดินไปรออาหาร
        const money = '฿' + CFApp.money(o.total);
        const v = {
            CASH: { title: this.t('ไปชำระเงินที่เคาน์เตอร์', 'Please pay at the counter'), ico: 'cash', tone: 'warn',
                    banner: ['cash', 'cfk-note-warn', this.t('แจ้งหมายเลขนี้และชำระ ' + money + ' ที่เคาน์เตอร์ แล้วออเดอร์จะเข้าครัว',
                                                             'Show this number and pay ' + money + ' at the counter — then we start your order')] },
            PAID: { title: this.t('รับออเดอร์เรียบร้อย', 'Order received'), ico: 'check', tone: 'ok',
                    banner: ['chef', 'cfk-note-ok', this.t('ส่งเข้าครัวแล้ว กรุณารอเรียกหมายเลข', 'Sent to the kitchen — please wait for your number')] },
            REVIEW: { title: this.t('ได้รับสลิปแล้ว', 'Slip received'), ico: 'check', tone: 'ok',
                    banner: ['timer', 'cfk-note-ok', this.t('พนักงานกำลังตรวจยอดเงิน แล้วจะส่งเข้าครัวทันที', 'Our staff is checking your payment — your order goes to the kitchen right after')] },
            TIMEOUT: { title: this.t('กรุณาติดต่อพนักงาน', 'Please see our staff'), ico: 'alert', tone: 'warn',
                    banner: ['alert', 'cfk-note-warn', this.t('ออเดอร์นี้ยังไม่ได้ชำระ — ถ้าโอนแล้ว แสดงสลิปที่เคาน์เตอร์',
                                                              'This order is not paid yet — if you already paid, show your slip at the counter')] },
        }[kind];

        return `
        <div class="cfk-top"><div class="cfk-top-title"><b>${e(v.title)}</b>
            <span>${e(this.diningLabel())}</span></div></div>
        <div style="display:grid;grid-template-rows:1fr auto;min-height:0">
            <div class="cfk-center"><div class="cfk-panel">
                <div class="cfk-done-ico ${v.tone}">
                    ${CFKioskArt.icon(v.ico)}
                </div>
                <div class="cfk-done-label">${this.t('หมายเลขออเดอร์ของคุณ', 'Your order number')}</div>
                <div class="cfk-done-no">${e(o.orderNo)}</div>
                <div class="cfk-note ${v.banner[1]}">${CFKioskArt.icon(v.banner[0])}<span>${e(v.banner[2])}</span></div>
                <div class="cfk-done-timer">${this.t('กลับหน้าแรกใน', 'Back to start in')} <b id="cfkDoneLeft">${sec}</b> ${this.t('วินาที', 'sec')}</div>
            </div></div>
            <div class="cfk-actionbar">
                <button class="cfk-btn cfk-btn-primary cfk-btn-grow" onclick="CFKiosk.reset()">${this.t('เสร็จสิ้น', 'Done')}</button>
            </div>
        </div>`;
    },

    /**
     * ใบรับออเดอร์ — ออกที่เครื่องพิมพ์ที่ผูกกับตู้นี้ (ตั้งที่ หน้าภาพรวม › เครื่องพิมพ์)
     * ยิงครั้งเดียวต่อออเดอร์ · พิมพ์ไม่ได้ก็ไม่ขวางลูกค้า — จอยังแสดงเลขคิวอยู่
     */
    printTicket(orderId, kind) {
        if (!orderId) return;
        this._ticketed = this._ticketed || {};
        if (this._ticketed[orderId]) return;
        this._ticketed[orderId] = true;
        CFApi.post('/api/orders/' + encodeURIComponent(orderId) + '/kiosk-ticket', { kind })
            .catch((err) => console.warn('[kiosk] พิมพ์ใบรับออเดอร์ไม่สำเร็จ', err));
    },

    startDone(sec) {
        clearInterval(this._doneT);
        let left = sec;
        this._doneT = setInterval(() => {
            left--;
            const el = document.getElementById('cfkDoneLeft');
            if (el) el.textContent = left;
            if (left <= 0) { clearInterval(this._doneT); this.reset(); }
        }, 1000);
    },
};

window.CFKiosk = CFKiosk;
