/**
 * CafeFlow — KIOSK CORE (§9, §11, §12, §14, §16, §35)
 * ------------------------------------------------------------
 * หน้าจอลูกค้าสั่งเอง · จอสัมผัสยืนกด 21–32 นิ้ว Full HD
 *
 * โครงเป็น router หน้าเต็มจอ ไม่ใช่ drawer — เพราะคีออสก์จริงต้องการ
 * หน้าละหนึ่งหน้าที่ ปุ่มย้อนกลับตำแหน่งตายตัว และไหลเป็นเส้นตรง
 *
 * ⚠️ ไฟล์นี้ถูกฝังในอาร์ติแฟกต์ด้วย
 *    ห้ามอ้าง Drawer / showToast ของ design system / refreshIcons /
 *    CFAuth / localStorage / ลิงก์ไป *.html โดยตรง
 *    (ทุกอย่างที่ต้องใช้ต้องผ่าน CFStore, CFApp, CFRules, CFOrders, CFKioskArt)
 */
const CFKiosk = {

    /** ค่าเริ่มต้นอยู่ใน cf-data.js — หน้าตั้งค่าหลังบ้านใช้ตัวเดียวกัน */
    get DEFAULTS() { return CF_KIOSK_DEFAULTS; },

    /** อ่านค่าตั้งแบบ merge default เสมอ — ฐานข้อมูลเก่าที่ยังไม่มีคีย์จึงไม่พัง */
    cfg() { return Object.assign({}, CF_KIOSK_DEFAULTS, CFStore.settings()); },

    /** ASK | DINE_IN | TAKE_AWAY — ตัวแปลงค่าอยู่ใน cf-data.js เพื่อให้หลังบ้านอ่านตัวเดียวกัน */
    diningMode() { return CF_DINING_MODE(this.cfg()); },

    state: {
        screen: 'attract', stack: [],
        dining: null, cat: null, cart: [], line: null,
        upsellShown: false, deviceId: 'KIOSK-01', dirty: false,
    },

    opts: { allowDeviceGate: false, demo: false },

    /* ══════════════════════════════════════════════════════
       BOOT
       ══════════════════════════════════════════════════════ */
    boot(o) {
        this.opts = Object.assign(this.opts, o || {});
        this.state.deviceId = this.opts.deviceId || 'KIOSK-01';
        window.CF_DEVICE_ID = this.state.deviceId;

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

        const st = document.getElementById('cfkStage');
        if (st) st.style.setProperty('--scale', c.kioskScale || 1);
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
        clearTimeout(this._idle); clearInterval(this._qr); clearInterval(this._doneT);
        this.state.stack = [];
        this.state.cart = [];
        this.state.line = null;
        this.state.dining = null;
        this.state.cat = null;
        this.state.upsellShown = false;
        this.state.screen = 'attract';
        this.render();
    },

    render() {
        const fn = this['screen_' + this.state.screen];
        this.stage.innerHTML = (fn ? fn.call(this, this.state.params) : '')
            + (this.opts.demo ? '<div class="cfk-demoonly">เดโม</div>' : '')
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
    },

    /* ══════════════════════════════════════════════════════
       ตัวจับเวลาไม่มีการใช้งาน
       หน้า pay/qr/done มีตัวนับของตัวเอง ห้ามให้ idle มาตัดกลางคัน
       ══════════════════════════════════════════════════════ */
    resetIdle() {
        clearTimeout(this._idle);
        if (['attract', 'pay', 'qr', 'done'].includes(this.state.screen)) return;
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
                <div class="cfk-attract-sub">สั่งด้วยตนเอง · Self Order</div>
                <div class="cfk-attract-cta">แตะเพื่อเริ่มสั่ง</div>
            </div>
            <div class="cfk-attract-band"><div class="cfk-attract-row">${tiles}</div></div>
        </button>`;
    },

    start() {
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
                <b>${e(d.label)}</b><small>${e(d.en)}</small>
            </button>`;
        };
        return `
        ${this.topHtml({ title: 'เลือกรูปแบบการรับ', sub: 'เลือกก่อนเริ่มสั่งอาหาร', back: 'attract' })}
        <div class="cfk-choices">${choice('DINE_IN')}${choice('TAKE_AWAY')}</div>`;
    },

    setDining(v) { this.state.dining = v; this.go('menu'); },
    diningLabel() { return (CF_DINING[this.state.dining] || CF_DINING.DINE_IN).label; },

    /* ── แถบหัวร่วม ── */
    topHtml(o) {
        const e = CFApp.esc;
        return `
        <div class="cfk-top">
            ${o.back ? `<button class="cfk-back" onclick="CFKiosk.back()" aria-label="ย้อนกลับ">
                ${CFKioskArt.icon('back')}</button>` : ''}
            <div class="cfk-top-title">
                <b>${e(o.title)}</b>
                ${o.sub ? `<span>${e(o.sub)}</span>` : ''}
            </div>
            ${o.mode && this.state.dining ? this.modeChipHtml() : ''}
        </div>`;
    },

    /**
     * ชิปบอกว่ากำลังสั่งแบบไหน
     * โหมดตายตัว (ร้านรับแบบเดียว) ต้องเป็นป้ายอ่านอย่างเดียว ไม่ใช่ปุ่ม —
     * ไม่งั้นมันคือทางลัดกลับเข้าหน้าที่ผู้จัดการเพิ่งปิดไป
     */
    modeChipHtml() {
        const d = CF_DINING[this.state.dining] || CF_DINING.DINE_IN;
        const inner = `${CFKioskArt.icon(d.icon)} ${CFApp.esc(d.label)}`;
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
        ${this.topHtml({ title: CFStore.settings().shopName, sub: 'เลือกเมนูที่ต้องการ', back: 'dining', mode: true })}
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
            <b>${e(c.nameTh)}</b><small>${e(c.nameEn || '')}</small></button>`;
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
        if (!groups.length) return '<div class="cfk-empty">ยังไม่มีสินค้าในหมวดนี้</div>';

        return groups.map((g) => `
            ${g.name ? `<div class="cfk-groupbar">${e(g.name)}</div>` : ''}
            <div class="cfk-grid">${g.items.map((p) => this.cardHtml(p)).join('')}</div>
        `).join('');
    },

    cardHtml(p) {
        const e = CFApp.esc;
        const serves = CFApp.serveTypesOf(p);
        const multi = serves.filter((k) => k !== 'STD').length > 1;
        const pills = serves.filter((k) => k !== 'STD')
            .map((k) => `<span class="cfk-serve-pill">${e(CF_SERVE[k].short)}</span>`).join('');

        return `<button class="cfk-card" ${p.soldOut ? 'disabled' : `onclick="CFKiosk.openItem('${p.id}')"`}>
            ${p.recommended && !p.soldOut ? '<span class="cfk-badge cfk-badge-reco">แนะนำ</span>' : ''}
            ${p.soldOut ? '<span class="cfk-badge cfk-badge-out">สินค้าหมด</span>' : ''}
            ${CFKioskArt.tile(p, serves[0])}
            <span class="cfk-card-body">
                <span class="cfk-card-name">${e(p.nameTh)}</span>
                <span class="cfk-card-en">${e(p.nameEn || '')}</span>
                <span class="cfk-card-foot">
                    <span class="cfk-serves">${pills}</span>
                    <span class="cfk-price">${multi ? '<small>เริ่ม </small>' : ''}฿${CFApp.money(CFApp.minPriceOf(p))}</span>
                </span>
            </span>
        </button>`;
    },

    /* ── แถบ/แผงตะกร้า — อยู่ที่เดิมเสมอ ไม่เคยหาย ── */
    cartBarHtml() {
        const n = this.cartCount(), t = this.cartTotal();
        return `<div class="cfk-cartbar ${n ? '' : 'is-empty'}">
            <div class="cfk-cartbar-info">
                <span>${n ? n + ' รายการ' : 'ตะกร้าว่าง · เลือกเมนูเพื่อเริ่ม'}</span>
                <strong>฿${CFApp.money(t)}</strong>
            </div>
            <button class="cfk-btn cfk-btn-ghost" ${n ? '' : 'disabled'} onclick="CFKiosk.go('cart')">
                ${CFKioskArt.icon('cart')} ดูตะกร้า
            </button>
            <button class="cfk-btn cfk-btn-primary" ${n ? '' : 'disabled'} onclick="CFKiosk.toCheckout()">
                ชำระเงิน
            </button>
        </div>`;
    },

    cartPanelHtml() {
        const n = this.cartCount();
        return `<div class="cfk-cartpanel">
            <div class="cfk-cartpanel-head">ตะกร้าของคุณ${n ? ' · ' + n + ' รายการ' : ''}</div>
            <div class="cfk-cartpanel-list">
                ${n ? this.state.cart.map((l) => this.cartLineHtml(l, true)).join('')
                    : '<div class="cfk-empty">ตะกร้าว่าง<br>เลือกเมนูเพื่อเริ่ม</div>'}
            </div>
            <div class="cfk-cartpanel-foot">
                <div class="cfk-total" style="padding:0"><span>ยอดรวม</span><strong>฿${CFApp.money(this.cartTotal())}</strong></div>
                <button class="cfk-btn cfk-btn-primary" ${n ? '' : 'disabled'} onclick="CFKiosk.toCheckout()">
                    ชำระเงิน ฿${CFApp.money(this.cartTotal())}
                </button>
                ${n ? `<button class="cfk-mini" onclick="CFKiosk.askClear()">${CFKioskArt.icon('trash')} ล้างตะกร้า</button>` : ''}
            </div>
        </div>`;
    },

    /* ══════════════════════════════════════════════════════
       หน้า 4 — รายละเอียดสินค้า
       ══════════════════════════════════════════════════════ */
    openItem(productId, editLineId) {
        const p = CFStore.byId('products', productId);
        if (!p || p.soldOut) { this.toast('สินค้านี้หมดแล้ว'); return; }

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
        const showServe = serves.length > 1 || serves[0] !== 'STD';

        const serveBlock = showServe ? `
            <div class="cfk-optgroup">
                <div class="cfk-optgroup-head"><b>เลือกแบบ</b><span class="cfk-tag cfk-tag-req">ต้องเลือก</span></div>
                <div class="cfk-serves-pick">
                    ${serves.map((k) => `<button class="cfk-serve ${k === L.serveType ? 'active' : ''}"
                        onclick="CFKiosk.setServe('${k}')">
                        <b>${e(CF_SERVE[k].label)}</b><small>฿${CFApp.money(p.prices[k])}</small></button>`).join('')}
                </div>
            </div>` : '';

        const groups = CFRules.groupsFor(L.serveType, p.categoryId);
        const optBlock = groups.map((g) => {
            const missing = this._missing && this._missing.includes(g.id);
            return `
            <div class="cfk-optgroup ${missing ? 'is-missing' : ''}">
                <div class="cfk-optgroup-head">
                    <b>${e(g.nameTh)}</b>
                    ${g.required ? '<span class="cfk-tag cfk-tag-req">ต้องเลือก</span>' : ''}
                    ${g.type === 'MULTI' ? '<span class="cfk-tag">เลือกได้หลายอย่าง</span>' : ''}
                </div>
                <div class="cfk-opts">
                    ${CFRules.optionsOf(g.id).map((o) => {
                        const on = L.mods.some((m) => m.optionId === o.id);
                        return `<button class="cfk-opt ${on ? 'active' : ''}"
                            onclick="CFKiosk.toggleOpt('${g.id}','${o.id}',${g.type === 'MULTI'})">
                            <span>${e(o.nameTh)}</span>${o.priceDelta ? `<b>+฿${o.priceDelta}</b>` : ''}</button>`;
                    }).join('')}
                </div>
            </div>`;
        }).join('');

        const hidden = CFRules.hiddenFor(L.serveType, p.categoryId);
        const hiddenNote = (hidden.length && groups.length) ? `
            <div class="cfk-note" style="margin-top:calc(var(--u)*1.6)">
                ${CFKioskArt.icon('alert')}
                <span>แบบ "${e(CF_SERVE[L.serveType].label)}" ไม่มี: ${hidden.map((g) => e(g.nameTh)).join(' · ')}</span>
            </div>` : '';

        return `
        ${this.topHtml({ title: p.nameTh, sub: p.groupTh || '', back: 'menu' })}
        <div class="cfk-item">
            <div class="cfk-item-left">
                <div class="cfk-hero">${CFKioskArt.tile(p, L.serveType)}</div>
            </div>
            <div class="cfk-item-scroll">
                <div class="cfk-item-name">${e(p.nameTh)}</div>
                <div class="cfk-item-en">${e(p.nameEn || '')}</div>
                ${serveBlock}
                ${optBlock || '<div class="cfk-note">เมนูนี้ไม่มีตัวเลือกเพิ่มเติม</div>'}
                ${hiddenNote}
                <div class="cfk-optgroup">
                    <div class="cfk-optgroup-head"><b>จำนวน</b></div>
                    <div class="cfk-qty">
                        <button onclick="CFKiosk.addQty(-1)" ${L.qty <= 1 ? 'disabled' : ''}
                                aria-label="ลด">${CFKioskArt.icon('minus')}</button>
                        <output>${L.qty}</output>
                        <button onclick="CFKiosk.addQty(1)" aria-label="เพิ่ม">${CFKioskArt.icon('plus')}</button>
                    </div>
                </div>
            </div>
            <div class="cfk-actionbar">
                <button class="cfk-btn cfk-btn-ghost" onclick="CFKiosk.back()">ยกเลิก</button>
                <button class="cfk-btn cfk-btn-primary cfk-btn-grow" onclick="CFKiosk.addToCart()">
                    ${CFKioskArt.icon('check')} ${L.lineId ? 'บันทึก' : 'เพิ่มลงตะกร้า'} · ฿${CFApp.money(this.lineTotal(L))}
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
        if (!p || p.soldOut) { this.toast('สินค้านี้เพิ่งหมด'); this.go('menu'); return; }

        const missing = CFRules.groupsFor(L.serveType, p.categoryId)
            .filter((g) => g.required && !L.mods.some((m) => m.groupId === g.id));
        if (missing.length) {
            this._missing = missing.map((g) => g.id);
            this.render();
            const el = this.stage.querySelector('.cfk-optgroup.is-missing');
            if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
            this.toast('กรุณาเลือก ' + missing.map((g) => g.nameTh).join(' และ '), 2400);
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
        this.toast('เพิ่ม ' + p.nameTh + ' แล้ว');
    },

    /* ══════════════════════════════════════════════════════
       หน้า 5 — ตะกร้า
       ══════════════════════════════════════════════════════ */
    screen_cart() {
        const n = this.cartCount();
        if (!n) return this.screen_menu();

        return `
        ${this.topHtml({ title: 'ตะกร้าของคุณ', sub: n + ' รายการ', back: 'menu', mode: true })}
        <div style="display:grid;grid-template-rows:1fr auto auto;min-height:0">
            <div style="overflow-y:auto;min-height:0;padding:0 var(--pad)">
                ${this.state.cart.map((l) => this.cartLineHtml(l)).join('')}
                <button class="cfk-mini" style="margin:calc(var(--u)*1.6) 0"
                        onclick="CFKiosk.askClear()">${CFKioskArt.icon('trash')} ล้างตะกร้าทั้งหมด</button>
            </div>
            <div class="cfk-total"><span>ยอดรวม (รวมภาษีมูลค่าเพิ่มแล้ว)</span>
                 <strong>฿${CFApp.money(this.cartTotal())}</strong></div>
            <div class="cfk-actionbar">
                <button class="cfk-btn cfk-btn-ghost" onclick="CFKiosk.go('menu')">สั่งเพิ่ม</button>
                <button class="cfk-btn cfk-btn-primary cfk-btn-grow" onclick="CFKiosk.toCheckout()">
                    ชำระเงิน ฿${CFApp.money(this.cartTotal())}
                </button>
            </div>
        </div>`;
    },

    cartLineHtml(l, compact) {
        const e = CFApp.esc;
        const p = CFStore.byId('products', l.productId);
        const mods = l.mods.map((m) => e(m.label)).join(' · ');
        return `<div class="cfk-cartline">
            ${CFKioskArt.tile(p, l.serveType)}
            <div class="cfk-cartline-mid">
                <div class="cfk-cartline-name">${e(p.nameTh)}${e(CFApp.serveSuffix(l.serveType))}</div>
                ${mods ? `<div class="cfk-cartline-mods">${mods}</div>` : ''}
                ${compact ? '' : `<div class="cfk-cartline-act">
                    <button class="cfk-mini" onclick="CFKiosk.lineQty('${l.lineId}',-1)">${CFKioskArt.icon('minus')}</button>
                    <button class="cfk-mini" onclick="CFKiosk.lineQty('${l.lineId}',1)">${CFKioskArt.icon('plus')}</button>
                    <button class="cfk-mini" onclick="CFKiosk.openItem('${l.productId}','${l.lineId}')">
                        ${CFKioskArt.icon('pencil')} แก้ไข</button>
                    <button class="cfk-mini" onclick="CFKiosk.removeLine('${l.lineId}')">${CFKioskArt.icon('trash')}</button>
                </div>`}
            </div>
            <div class="cfk-cartline-end">
                <div class="cfk-cartline-mods">× ${l.qty}</div>
                <div class="cfk-cartline-amt">฿${CFApp.money(this.lineTotal(l))}</div>
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
        if (!this.state.cart.length) { this.go('menu'); this.toast('ตะกร้าว่างแล้ว'); return; }
        this.render();
    },

    askClear() {
        this.stage.insertAdjacentHTML('beforeend', `
        <div class="cfk-sheet" id="cfkSheet">
            <div class="cfk-sheet-box">
                <div class="cfk-sheet-body">
                    <b>ล้างตะกร้าทั้งหมด?</b>
                    <p>รายการที่เลือกไว้ทั้งหมดจะถูกลบ</p>
                </div>
                <div class="cfk-actionbar">
                    <button class="cfk-btn cfk-btn-ghost cfk-btn-grow" onclick="CFKiosk.closeSheet()">ยกเลิก</button>
                    <button class="cfk-btn cfk-btn-primary cfk-btn-grow" onclick="CFKiosk.doClear()">ล้างตะกร้า</button>
                </div>
            </div>
        </div>`);
    },
    closeSheet() { const s = document.getElementById('cfkSheet'); if (s) s.remove(); },
    doClear() {
        this.state.cart = [];
        this.state.upsellShown = false;
        this.closeSheet();
        this.go('menu');
        this.toast('ล้างตะกร้าแล้ว');
    },

    /* ══════════════════════════════════════════════════════
       หน้า 6 — UPSELL (ครั้งเดียวต่อออเดอร์)
       ══════════════════════════════════════════════════════ */
    toCheckout() {
        if (!this.state.cart.length) return;
        if (this.cfg().kioskUpsell !== false && !this.state.upsellShown && this.upsellPicks().length) {
            this.state.upsellShown = true;
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
        const picks = this.upsellPicks();
        const inCart = new Set(this.state.cart.map((l) => l.productId));

        return `
        ${this.topHtml({ title: 'เพิ่มอีกสักหน่อยไหม?', sub: 'แนะนำสำหรับคุณ', back: 'cart' })}
        <div class="cfk-upsell">
            <div class="cfk-upgrid">
                ${picks.map((p) => {
                    const added = inCart.has(p.id);
                    return `<button class="cfk-card cfk-upcard ${added ? 'is-added' : ''}"
                        onclick="CFKiosk.quickAdd('${p.id}')">
                        ${CFKioskArt.tile(p, CFApp.serveTypesOf(p)[0])}
                        <span class="cfk-card-body">
                            <span class="cfk-card-name">${e(p.nameTh)}</span>
                            <span class="cfk-card-foot">
                                <span class="cfk-serve-pill">${added ? 'เพิ่มแล้ว' : 'แตะเพื่อเพิ่ม'}</span>
                                <span class="cfk-price">+฿${CFApp.money(CFApp.minPriceOf(p))}</span>
                            </span>
                        </span>
                    </button>`;
                }).join('')}
            </div>
            <div class="cfk-actionbar">
                <button class="cfk-btn cfk-btn-ghost" onclick="CFKiosk.go('pay')">ไม่ ขอบคุณ</button>
                <button class="cfk-btn cfk-btn-primary cfk-btn-grow" onclick="CFKiosk.go('pay')">
                    ชำระเงิน ฿${CFApp.money(this.cartTotal())}
                </button>
            </div>
        </div>`;
    },

    /** เพิ่มจากหน้าแนะนำ — ใช้ค่าเริ่มต้นของกฎ ไม่ต้องให้ลูกค้าเลือกซ้ำ */
    quickAdd(productId) {
        const p = CFStore.byId('products', productId);
        if (!p || p.soldOut) return;
        const sv = CFApp.serveTypesOf(p)[0];
        this.state.cart.push({
            lineId: 'L' + Date.now().toString(36), productId, serveType: sv, qty: 1,
            mods: CFRules.defaultsFor(sv, p.categoryId),
        });
        this.render();
        this.toast('เพิ่ม ' + p.nameTh + ' แล้ว');
    },

    /* ══════════════════════════════════════════════════════
       หน้า 7 — ชำระเงิน
       ══════════════════════════════════════════════════════ */
    screen_pay() {
        const tile = (key, tint) =>
            `<span class="cfk-media" style="--t1:${tint[0]};--t2:${tint[1]};--art-a:${tint[2]}">
                <svg class="cfk-art" viewBox="0 0 120 120"><use href="#cfa-${key}"/></svg></span>`;
        return `
        ${this.topHtml({ title: 'เลือกวิธีชำระเงิน', back: 'cart', mode: true })}
        <div style="display:grid;grid-template-rows:auto 1fr;min-height:0">
            <div class="cfk-paytotal">
                <span>ยอดที่ต้องชำระ</span><strong>฿${CFApp.money(this.cartTotal())}</strong>
            </div>
            <div class="cfk-choices">
                <button class="cfk-bigchoice" onclick="CFKiosk.submit('CASH')">
                    ${CFKioskArt.icon('cash')}
                    <b>เงินสด</b><small>ชำระที่เคาน์เตอร์</small>
                </button>
                <button class="cfk-bigchoice" onclick="CFKiosk.submit('QR')">
                    ${CFKioskArt.icon('qr')}
                    <b>QR พร้อมเพย์</b><small>สแกนจ่ายด้วยมือถือ</small>
                </button>
            </div>
        </div>`;
    },

    /**
     * สร้างออเดอร์จริงแล้วส่งเข้าคิวแคชเชียร์
     *
     * เป็น async เพราะเมื่อต่อกับเซิร์ฟเวอร์จริง CFOrders.create/transition คืน Promise
     * (บนอาร์ติแฟกต์ที่ทำงานในหน่วยความจำ await กับค่าธรรมดาก็ไม่มีผลอะไร)
     *
     * ⚠️ ต้องกันการกดซ้ำ — ลูกค้ายืนหน้าจอแล้วปุ่มไม่ตอบทันทีจะกดรัว
     *    ถ้าปล่อยไว้จะได้สามออเดอร์และเก็บเงินสามรอบ
     */
    async submit(method) {
        if (this._submitting) return;
        this._submitting = true;
        this.setBusy(true, 'กำลังส่งออเดอร์…');
        try {
            // clientUuid ผูกกับ "การกดชำระครั้งนี้" — retry ตอนเน็ตสะดุดจึงได้ใบเดิม
            this._clientUuid = this._clientUuid || (window.crypto && crypto.randomUUID
                ? crypto.randomUUID() : 'cu-' + Date.now() + '-' + Math.random().toString(36).slice(2));

            const orderId = await CFOrders.create(this.state.cart, {
                kioskId: this.state.deviceId,
                paymentMethod: method,
                diningOption: this.state.dining || 'DINE_IN',
                clientUuid: this._clientUuid,
                expectTotal: this.cartTotal(),
            });
            if (!orderId) { this.toast('สร้างออเดอร์ไม่สำเร็จ'); return; }

            const ok = await CFOrders.transition(orderId,
                method === 'CASH' ? 'WAITING_CASH' : 'WAITING_PAYMENT',
                { byId: 'KIOSK', device: this.state.deviceId });
            if (ok === false) { this.toast('ส่งออเดอร์ไม่สำเร็จ'); return; }

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
            el.textContent = text || 'กำลังทำงาน…';
        } else if (el) {
            el.remove();
        }
    },

    /* ── QR + นับถอยหลัง (§14, §16) ── */
    screen_qr() {
        const o = CFStore.byId('orders', this.state.orderId);
        const sec = CFStore.settings().qrTimeoutSec || 60;
        // ต่อกับเซิร์ฟเวอร์จริง → ขอ QR ที่ผูกยอดไว้แล้ว · โหมดเดโม → กล่องจำลองเหมือนเดิม
        setTimeout(() => (this.canQr() ? this.loadQr() : this.startQr(sec)), 0);
        return `
        ${this.topHtml({ title: 'สแกนเพื่อชำระเงิน', sub: 'ออเดอร์ ' + o.orderNo })}
        <div style="display:grid;grid-template-rows:1fr auto;min-height:0">
            <div class="cfk-center">
                <div class="cfk-qr" id="cfkQrBox">
                    ${CFKioskArt.icon('qr')}
                    <span>${this.canQr() ? 'กำลังสร้าง QR…' : 'QR จำลองสำหรับเดโม'}</span>
                </div>
                <div class="cfk-done-no" style="font-size:calc(var(--u)*5)">฿${CFApp.money(o.total)}</div>
                <div class="cfk-note cfk-note-ok">
                    ${CFKioskArt.icon('timer')}
                    <span>เหลือเวลา <b class="cfk-countdown" id="cfkLeft">${sec}</b> วินาที</span>
                </div>
            </div>
            <div class="cfk-actionbar">
                <button class="cfk-btn cfk-btn-ghost" onclick="CFKiosk.qrTimeout()">แจ้งพนักงาน</button>
                <button class="cfk-btn cfk-btn-primary cfk-btn-grow" onclick="CFKiosk.qrPaid()">
                    ${CFKioskArt.icon('check')} ${this.canQr() ? 'โอนแล้ว' : 'จำลองว่าชำระแล้ว'}
                </button>
            </div>
        </div>`;
    },

    /** มีเซิร์ฟเวอร์จริงให้ออก QR ไหม — อาร์ติแฟกต์/เดโมไม่มี */
    canQr() { return !!(window.CFStore && CFStore.mode === 'api'); },

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
                '<span>สแกนด้วยแอปธนาคาร · ยอดขึ้นให้อัตโนมัติ</span>';
            // นับถอยหลังจากเวลาหมดอายุจริงของเซิร์ฟเวอร์ ไม่ใช่ค่าคงที่ฝั่งเบราว์เซอร์
            this.startQr(Math.max(1, Math.round((new Date(r.expiresAt) - Date.now()) / 1000)));
        } catch (err) {
            if (box) {
                box.innerHTML = CFKioskArt.icon('alert') +
                    '<span>' + CFApp.esc(err.message || 'สร้าง QR ไม่สำเร็จ') +
                    '<br>กรุณาชำระที่เคาน์เตอร์</span>';
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
            if (left <= 0) { clearInterval(this._qr); this.qrTimeout(); }
        }, 1000);
    },

    async qrPaid() {
        if (this._submitting) return;
        this._submitting = true;
        clearInterval(this._qr);
        this.setBusy(true, 'กำลังยืนยันการชำระ…');
        try {
            const ok = await CFOrders.transition(this.state.orderId, 'PAID',
                { byId: 'SYSTEM', device: this.state.deviceId, ref: 'TX' + Date.now(), bank: 'KBANK' });
            if (ok === false) { this.toast('ยืนยันการชำระไม่สำเร็จ'); return; }
            this.go('done', { kind: 'PAID' });
        } finally {
            this._submitting = false;
            this.setBusy(false);
        }
    },

    async qrTimeout() {
        if (this._submitting) return;
        this._submitting = true;
        clearInterval(this._qr);
        this.setBusy(true, 'กำลังแจ้งพนักงาน…');
        try {
            const id = this.state.orderId;
            // ต้องรอตัวแรกให้เสร็จก่อน — สองคำสั่งนี้เป็นลำดับ ไม่ใช่ขนาน
            await CFOrders.transition(id, 'PAYMENT_TIMEOUT',
                { byId: 'SYSTEM', device: this.state.deviceId });
            await CFOrders.transition(id, 'PAYMENT_REVIEW',
                { byId: 'SYSTEM', device: this.state.deviceId,
                  reason: 'ลูกค้ากดแจ้งพนักงานจากคีออสก์' });
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

        const banner = {
            CASH: ['cash', 'cfk-note-warn', 'กรุณาชำระเงิน ฿' + CFApp.money(o.total) + ' ที่เคาน์เตอร์'],
            PAID: ['chef', 'cfk-note-ok', 'ส่งเข้าครัวแล้ว กรุณารอเรียกหมายเลข'],
            TIMEOUT: ['alert', 'cfk-note-warn', 'หากท่านชำระเงินแล้ว กรุณาแจ้งพนักงานที่เคาน์เตอร์'],
        }[kind];

        return `
        <div class="cfk-top"><div class="cfk-top-title"><b>รับออเดอร์เรียบร้อย</b>
            <span>${e(this.diningLabel())}</span></div></div>
        <div style="display:grid;grid-template-rows:1fr auto;min-height:0">
            <div class="cfk-center">
                <div class="cfk-done-ico ${kind === 'TIMEOUT' ? 'warn' : 'ok'}">
                    ${CFKioskArt.icon(kind === 'TIMEOUT' ? 'alert' : 'check')}
                </div>
                <div class="cfk-done-label">หมายเลขออเดอร์ของคุณ</div>
                <div class="cfk-done-no">${e(o.orderNo)}</div>
                <div class="cfk-note ${banner[1]}">${CFKioskArt.icon(banner[0])}<span>${banner[2]}</span></div>
                <div class="cfk-done-timer">กลับหน้าแรกใน <b id="cfkDoneLeft">${sec}</b> วินาที</div>
            </div>
            <div class="cfk-actionbar">
                <button class="cfk-btn cfk-btn-primary cfk-btn-grow" onclick="CFKiosk.reset()">เสร็จสิ้น</button>
            </div>
        </div>`;
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
