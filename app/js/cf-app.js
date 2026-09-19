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

        // ?denied= มาจาก CFAuth.guard() เมื่อสิทธิ์ไม่พอ — ต้องบอกเหตุผล ไม่ใช่เด้งเงียบ ๆ
        const q = new URLSearchParams(location.search);
        if (q.get('denied')) {
            setTimeout(() => showToast('ไม่มีสิทธิ์เข้าหน้าที่ร้องขอ (' + q.get('denied') + ')', 'warning', 4000), 300);
        }
        if (q.get('reset') === '1') {
            setTimeout(() => this.confirmReset(), 200);
        }
        if (!CFStore.isPersistent()) {
            setTimeout(() => showToast('เบราว์เซอร์นี้เก็บข้อมูลถาวรไม่ได้ — ข้อมูลจะหายเมื่อปิดหน้า', 'warning', 6000), 500);
        }
    },

    async confirmReset() {
        const ok = await Drawer.confirm({
            title: 'รีเซ็ตข้อมูลตัวอย่าง?',
            message: 'ออเดอร์ การชำระเงิน และการแก้ไขเมนูทั้งหมดจะกลับไปเป็นชุดข้อมูลเริ่มต้น',
            note: 'ใช้เมื่อต้องการเริ่มสาธิตใหม่ตั้งแต่ต้น',
            confirmText: 'รีเซ็ต', danger: true,
        });
        if (ok) CFStore.resetDemo();
        else history.replaceState(null, '', location.pathname);
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

    /** แบบเสิร์ฟที่สินค้านี้มีขายจริง เรียงตามลำดับบนป้าย */
    serveTypesOf(product) {
        if (!product || !product.prices) return [];
        return CF_SERVE_ORDER.filter((k) => product.prices[k] != null);
    },

    /**
     * ทางเดียวที่อ่านราคาสินค้า — ห้ามอ่าน product.price ตรง ๆ ที่ไหนอีก
     * คืน null เมื่อแบบเสิร์ฟนั้นไม่มีขาย ('–' บนป้าย) ซึ่งต่างจากราคา 0
     */
    priceOf(product, serveType) {
        if (!product || !product.prices) return null;
        if (serveType && product.prices[serveType] != null) return product.prices[serveType];
        if (serveType) return null;
        const first = this.serveTypesOf(product)[0];
        return first ? product.prices[first] : null;
    },

    /** ราคาต่ำสุดของสินค้า — ใช้แสดง "เริ่มต้น ฿xx" บนการ์ดคีออสก์ */
    minPriceOf(product) {
        const vals = this.serveTypesOf(product).map((k) => product.prices[k]);
        return vals.length ? Math.min(...vals) : 0;
    },

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
 * กฎตัวเลือกสินค้า (§11)
 * ------------------------------------------------------------
 * ผูกกับ "แบบเสิร์ฟ" และ "หมวด" ไม่ใช่ hard-code ต่อสินค้า
 * อยู่ที่นี่เพราะทั้งหน้าจัดการเมนูและหน้าคีออสก์ต้องใช้ตัวเดียวกัน
 * ถ้าสองที่คิดกฎต่างกันเมื่อไหร่ ราคาที่ลูกค้าเห็นกับที่ร้านตั้งจะไม่ตรงกัน
 */
const CFRules = {

    /** กลุ่มตัวเลือกที่ต้องแสดง สำหรับสินค้า + แบบเสิร์ฟหนึ่ง ๆ */
    groupsFor(serveType, categoryId) {
        const seen = new Set();
        return CFStore.all('modifierRules')
            .filter((r) => (r.serveType && r.serveType === serveType) ||
                           (r.categoryId && r.categoryId === categoryId))
            .sort((a, b) => a.sort - b.sort)
            .map((r) => CFStore.byId('modifierGroups', r.groupId))
            .filter((g) => g && !seen.has(g.id) && seen.add(g.id));
    },

    /** กลุ่มที่ถูกกฎซ่อน — ใช้อธิบายให้ผู้ใช้เห็นว่ามี rule engine อยู่จริง */
    hiddenFor(serveType, categoryId) {
        const shown = new Set(this.groupsFor(serveType, categoryId).map((g) => g.id));
        return CFStore.all('modifierGroups').filter((g) => !shown.has(g.id));
    },

    optionsOf(groupId) {
        return CFStore.where('modifierOptions', (o) => o.groupId === groupId)
            .sort((a, b) => a.sort - b.sort);
    },

    /** ตัวเลือกเริ่มต้นของสินค้า + แบบเสิร์ฟ — คีออสก์ใช้ตั้งค่าเริ่มต้นให้ลูกค้า */
    defaultsFor(serveType, categoryId) {
        const out = [];
        this.groupsFor(serveType, categoryId).forEach((g) => {
            if (g.type !== 'SINGLE') return;
            const d = this.optionsOf(g.id).find((o) => o.isDefault);
            if (d) out.push({ groupId: g.id, optionId: d.id, label: d.nameTh, shortLabel: d.shortLabel, priceDelta: d.priceDelta });
        });
        return out;
    },
};

window.CFRules = CFRules;
window.CFApp = CFApp;
