/**
 * CafeFlow — APP SHELL
 * ------------------------------------------------------------
 * ของที่ทุกหน้าใช้ร่วมกัน: boot, role gate ในเนื้อหน้า, formatter, esc
 */

const CFApp = {

    /**
     * เรียกที่ต้นของ <page>.boot()
     * guard() ถูกเรียกไปแล้วใน <head> — ตรงนี้คือส่วนที่ต้องรอ DOM
     */
    boot(opts) {
        opts = opts || {};
        this.applyRoleGate();

        const sess = CFAuth.session();
        if (sess && sess.mustChangePassword) setTimeout(() => this.changePassword({ forced: true }), 300);

        // ?denied= มาจาก CFAuth.guard() เมื่อสิทธิ์ไม่พอ — ต้องบอกเหตุผล ไม่ใช่เด้งเงียบ ๆ
        const q = new URLSearchParams(location.search);
        if (q.get('denied')) {
            setTimeout(() => showToast('ไม่มีสิทธิ์เข้าหน้าที่ร้องขอ (' + q.get('denied') + ')', 'warning', 4000), 300);
        }
    },

    /**
     * ผลอ่านภาพสลิป (OCR) — แคชเชียร์กับหน้าจัดการออเดอร์ใช้กล่องเดียวกัน
     * อ่านไม่ออก = เทา (ไม่ใช่แดง) เพราะเตือนผิดบ่อยแล้วคนจะเลิกเชื่อคำเตือน
     */
    slipOcrHtml(slip) {
        const e = this.esc;
        if (!slip || !slip.hasImage) return '';
        const box = (cls, icon, lines) => `<div class="sip-banner ${cls}" style="margin-top:8px;align-items:flex-start">
                <i data-lucide="${icon}" class="icon-sm"></i>
                <div>${lines.map((l) => `<div>${l}</div>`).join('')}</div></div>`;
        if (slip.ocrStatus === 'QUEUED' || slip.ocrStatus === 'RUNNING') {
            return box('sip-banner-info', 'loader', ['กำลังอ่านยอดเงินและวันที่จากภาพสลิป… (ราว 6 วินาที)']);
        }
        if (slip.ocrStatus === 'ERROR' || !slip.ocr) {
            return box('sip-banner-info', 'eye', ['อ่านภาพสลิปไม่ได้ — ดูยอดและวันที่จากภาพเอง']);
        }
        const c = slip.ocr.checks || {};
        const mark = (k) => (c[k] === 'PASS' ? '✅' : c[k] === 'FAIL' ? '❌' : '❔');
        const notes = slip.ocr.notes || [];
        const lines = [
            `<strong>${slip.verdict === 'FAIL' ? 'สลิปนี้มีจุดที่ไม่ตรง — ห้ามยืนยันจนกว่าจะตรวจกับลูกค้า'
                     : slip.verdict === 'PASS' ? 'ยอดและเวลาในสลิปตรงกับออเดอร์'
                     : 'อ่านสลิปได้ไม่ครบ — ดูจากภาพประกอบ'}</strong>`,
            mark('amount') + ' ' + e(notes[0] || ''),
            mark('date') + ' ' + e(notes[1] || ''),
        ];
        const cls = slip.verdict === 'FAIL' ? 'sip-banner-danger' : slip.verdict === 'PASS' ? 'sip-banner-success' : 'sip-banner-info';
        return box(cls, slip.verdict === 'FAIL' ? 'alert-octagon' : 'scan-text', lines) +
            '<div class="ds-note" style="margin-top:4px">ผลจากการอ่านภาพ (OCR) ช่วยเตือนเท่านั้น — ยังต้องดูเงินเข้าบัญชีร้านจริงทุกครั้ง</div>';
    },

    /**
     * เปลี่ยนรหัสผ่านของตัวเอง
     * forced = ล็อกอินด้วยรหัสตั้งต้น — ปิดหน้าต่างได้ แต่จะเด้งกลับมาทุกหน้าจนกว่าจะเปลี่ยน
     */
    changePassword(opts) {
        opts = opts || {};
        Drawer.open({
            title: 'เปลี่ยนรหัสผ่าน',
            width: '440px',
            contentHtml: `
                ${opts.forced ? `<div class="ds-warn" style="margin-bottom:14px">
                    บัญชีนี้ยังใช้รหัสผ่านตั้งต้น ใครที่อยู่ใน Wi‑Fi ร้านก็เข้าได้ — กรุณาตั้งรหัสใหม่ก่อนใช้งาน
                </div>` : ''}
                <div class="sip-field">
                    <label class="sip-label">รหัสผ่านเดิม</label>
                    <input class="sip-input" id="pwCur" type="password" autocomplete="current-password">
                </div>
                <div class="sip-field">
                    <label class="sip-label">รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)</label>
                    <input class="sip-input" id="pwNew" type="password" autocomplete="new-password">
                </div>
                <div class="sip-field">
                    <label class="sip-label">พิมพ์รหัสผ่านใหม่อีกครั้ง</label>
                    <input class="sip-input" id="pwNew2" type="password" autocomplete="new-password"
                           onkeydown="if(event.key==='Enter')CFApp.savePassword()">
                </div>`,
            footerHtml: `
                <button class="btn btn-outline" onclick="Drawer.close()">${opts.forced ? 'ไว้ทีหลัง' : 'ยกเลิก'}</button>
                <button class="btn btn-primary" onclick="CFApp.savePassword()">บันทึก</button>`,
            onOpen: () => setTimeout(() => document.getElementById('pwCur')?.focus(), 50),
        });
    },

    async savePassword() {
        const v = (id) => (document.getElementById(id) || {}).value || '';
        const next = v('pwNew');
        if (next !== v('pwNew2')) { showToast('รหัสผ่านใหม่สองช่องไม่ตรงกัน', 'error'); return; }
        try {
            await CFApi.post('/api/auth/password', { current: v('pwCur'), next });
            CFAuth.clearMustChange();
            Drawer.close();
            showToast('เปลี่ยนรหัสผ่านแล้ว', 'success');
        } catch (err) {
            showToast(err.message || 'เปลี่ยนรหัสผ่านไม่สำเร็จ', 'error', 4000);
        }
    },

    /**
     * role gate ในเนื้อหน้า
     * ⚠️ DSNavbar.applyRoleGate() กรองเฉพาะ .mc-navbar [data-role-gate]
     *    ไม่ครอบ body ของหน้า — ต้องเรียกตัวนี้เองหลัง render ทุกครั้ง
     *    และหลังเปิด drawer ทุกครั้ง ไม่งั้น CASHIER จะเห็นคอลัมน์ที่ไม่ควรเห็น
     */
    applyRoleGate(root) {
        const role = CFAuth.getRole();
        (root || document).querySelectorAll('[data-role-gate]').forEach((el) => {
            if (el.closest('.mc-navbar')) return;           // navbar มีคนดูแลแล้ว
            const allowed = el.getAttribute('data-role-gate').split(/[\s,]+/).filter(Boolean);
            if (!allowed.length) return;
            el.style.display = (role && allowed.includes(role)) ? '' : 'none';
        });
    },

    /* ══════════════════════════════════════════════════════
       FORMATTER
       ══════════════════════════════════════════════════════ */
    money(n)     { return (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
    baht(n)      { return '฿' + this.money(n); },
    int(n)       { return (Number(n) || 0).toLocaleString('th-TH'); },

    time(iso)    { return iso ? new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—'; },
    timeSec(iso) { return iso ? new Date(iso).toLocaleTimeString('th-TH', { hour12: false }) : '—'; },
    date(iso)    { return iso ? new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'; },
    dateFull(iso){ return iso ? new Date(iso).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—'; },
    dateTime(iso){ return iso ? this.date(iso) + ' ' + this.time(iso) : '—'; },

    /** ระยะเวลาแบบ mm:ss (ใช้กับตัวจับเวลา KDS) */
    elapsed(iso) {
        if (!iso) return '--:--';
        const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
        const m = Math.floor(s / 60);
        if (m >= 60) return Math.floor(m / 60) + ' ชม. ' + (m % 60) + ' น.';
        return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    },
    elapsedMin(iso) { return iso ? (Date.now() - new Date(iso).getTime()) / 60000 : 0; },

    /** ชิปสถานะออเดอร์ตาม CF_STATUS */
    statusChip(status) {
        const s = CF_STATUS[status] || { label: status, chip: 'sip-chip-muted' };
        return `<span class="sip-chip ${s.chip}">${s.label}</span>`;
    },
    statusLabel(status) { return (CF_STATUS[status] || {}).label || status; },

    stationLabel(st) { return (CF_STATIONS[st] || {}).label || st; },

    /** สีชิปประจำสถานี — ให้จำได้ด้วยสายตาทั้งแอป */
    stationChip(st) {
        const cls = { BAR: 'sip-chip-progress', KITCHEN: 'sip-chip-active', BAKERY: 'sip-chip-amber', DESSERT: 'sip-chip-ack' }[st] || 'sip-chip-muted';
        return `<span class="sip-chip ${cls}">${this.stationLabel(st)}</span>`;
    },

    /**
     * ป้ายรูปแบบการรับสินค้า
     * ครัวต้องเห็นตั้งแต่แรกว่าจะใส่แก้วหรือใส่ถุง — เห็นตอนทำเสร็จแล้วสายเกินไป
     * ใช้สีเหลืองกับ "กลับบ้าน" เพราะเป็นกรณีที่ต้องทำอะไรเพิ่ม ส่วนกินที่ร้านเป็นค่าปกติ
     */
    diningChip(v) {
        const d = (typeof CF_DINING !== 'undefined' && CF_DINING[v]) || null;
        if (!d) return '';
        const cls = v === 'TAKE_AWAY' ? 'sip-chip-amber' : 'sip-chip-muted';
        return `<span class="sip-chip ${cls}">${d.label}</span>`;
    },

    diningLabel(v) {
        const d = (typeof CF_DINING !== 'undefined' && CF_DINING[v]) || null;
        return d ? d.label : '';
    },

    /** ชื่อผู้ใช้จาก id (audit log เก็บเป็น id หรือคำว่า SYSTEM/KIOSK) */
    actorName(actor) {
        if (!actor) return '—';
        if (actor === 'SYSTEM') return 'ระบบ';
        if (actor === 'KIOSK')  return 'คีออสก์';
        const u = CFStore.byId('users', actor);
        return u ? u.name : actor;
    },

    /** สรุปตัวเลือกของรายการเป็นข้อความบรรทัดเดียว */
    modsText(item, short) {
        if (!item.mods || !item.mods.length) return '';
        return item.mods.map((m) => (short ? m.shortLabel : m.label)).join(' · ');
    },

    /* ══════════════════════════════════════════════════════
       แบบเสิร์ฟ (ร้อน / เย็น / ปั่น) — แกนที่กำหนดราคา
       ══════════════════════════════════════════════════════ */

    /* สูตรจริงอยู่ที่ shared/cf-pricing.js — เซิร์ฟเวอร์ใช้ตัวเดียวกัน
       ที่นี่เหลือแค่ทางผ่าน เพื่อให้ลายเซ็นที่หน้าเว็บเรียกอยู่ไม่เปลี่ยน */

    /** แบบเสิร์ฟที่สินค้านี้มีขายจริง เรียงตามลำดับบนป้าย */
    serveTypesOf(product) { return CFPricing.serveTypesOf(product); },

    /**
     * ทางเดียวที่อ่านราคาสินค้า — ห้ามอ่าน product.price ตรง ๆ ที่ไหนอีก
     * คืน null เมื่อแบบเสิร์ฟนั้นไม่มีขาย ('–' บนป้าย) ซึ่งต่างจากราคา 0
     */
    priceOf(product, serveType) { return CFPricing.priceOf(product, serveType); },

    /** ราคาต่ำสุดของสินค้า — ใช้แสดง "เริ่มต้น ฿xx" บนการ์ดคีออสก์ */
    minPriceOf(product) { return CFPricing.minPriceOf(product); },

    serveLabel(k) { return (CF_SERVE[k] || {}).label || ''; },

    /** ป้ายแบบเสิร์ฟสำหรับต่อท้ายชื่อสินค้า — STD ไม่ต้องแสดง */
    serveSuffix(k) {
        const s = (CF_SERVE[k] || {}).short;
        return s ? ' (' + s + ')' : '';
    },

    /** สรุปราคาทุกแบบเสิร์ฟเป็นข้อความ เช่น "50 / 50 / 70" */
    priceSummary(product) {
        return CF_SERVE_ORDER
            .filter((k) => product.prices[k] != null)
            .map((k) => this.money(product.prices[k]))
            .join(' / ');
    },

    /** HTML escape — ทุกค่าที่มาจากข้อมูลต้องผ่านตัวนี้ก่อนต่อเข้า innerHTML */
    esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    /* ══════════════════════════════════════════════════════
       ตัวช่วยอื่น
       ══════════════════════════════════════════════════════ */

    /** ออเดอร์ของวันนี้ (ใช้ทั้ง dashboard / closing / cashier) */
    todayOrders() {
        const d0 = new Date(); d0.setHours(0, 0, 0, 0);
        return CFStore.all('orders').filter((o) => new Date(o.createdAt) >= d0);
    },

    /** อุปกรณ์ปัจจุบันของหน้านี้ — ใช้เขียนลง audit log */
    deviceId() { return window.CF_DEVICE_ID || 'CASHIER-01'; },

    /**
     * เดินตัวจับเวลาทุกวินาทีโดยไม่ re-render ทั้งหน้า
     * เขียนแค่ textContent ของ [data-since] และสลับคลาสอายุ
     * (ห้ามเรียก refreshIcons() ในนี้ — มันเดินทั้ง document ทุก tick)
     */
    startTickers() {
        if (this._ticker) clearInterval(this._ticker);
        this.tickNow = () => {
            const s = CFStore.db ? CFStore.db.settings : { kdsWarnMin: 3, kdsDangerMin: 6 };
            document.querySelectorAll('[data-since]').forEach((el) => {
                const iso = el.getAttribute('data-since');
                el.textContent = this.elapsed(iso);
                const card = el.closest('[data-age-target]');
                if (!card) return;
                const mins = this.elapsedMin(iso);
                card.classList.toggle('warn',   mins >= s.kdsWarnMin && mins < s.kdsDangerMin);
                card.classList.toggle('danger', mins >= s.kdsDangerMin);
            });
        };
        this.tickNow();
        this._ticker = setInterval(this.tickNow, 1000);
    },

    /** ถูกแทนที่ด้วยตัวจริงใน startTickers() — no-op จนกว่าจะเริ่มเดิน */
    tickNow() {},
};

/**
 * กฎตัวเลือกสินค้า (§11) — ตัวเชื่อมฝั่งเบราว์เซอร์
 * ------------------------------------------------------------
 * กฎจริงเป็นฟังก์ชันบริสุทธิ์อยู่ที่ shared/cf-rules.js (เซิร์ฟเวอร์ใช้ตัวเดียวกัน)
 * ที่นี่แค่ฉีดข้อมูลจาก CFStore เข้าไปให้ เพื่อให้ลายเซ็นที่หน้าเว็บเรียกอยู่
 * — `CFRules.groupsFor(serveType, categoryId)` — ไม่เปลี่ยน
 */
const CFRules = (function () {
    const data = () => ({
        modifierRules:   CFStore.all('modifierRules'),
        modifierGroups:  CFStore.all('modifierGroups'),
        modifierOptions: CFStore.all('modifierOptions'),
    });
    return {
        groupsFor:   (s, c) => CFRulesCore.groupsFor(s, c, data()),
        hiddenFor:   (s, c) => CFRulesCore.hiddenFor(s, c, data()),
        optionsOf:   (g)    => CFRulesCore.optionsOf(g, data()),
        defaultsFor: (s, c) => CFRulesCore.defaultsFor(s, c, data()),
        validate:    (s, c, mods) => CFRulesCore.validate(s, c, mods, data()),
    };
})();

window.CFRules = CFRules;
window.CFApp = CFApp;
