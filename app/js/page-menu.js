/**
 * CafeFlow — เมนูและสินค้า (§10, §11, §18)
 * ------------------------------------------------------------
 * หน้านี้เป็นตัวอย่างหลักของสองเรื่อง:
 *   1. "เพิ่มรายการ" ต้องเป็น drawer ไม่ใช่ modal
 *   2. drawer ซ้อน drawer (แก้ไขกลุ่มตัวเลือกจากในฟอร์มสินค้า)
 *
 * โมเดลราคา: สินค้าหนึ่งตัวมีได้ถึง 3 ราคา (ร้อน/เย็น/ปั่น) ตามป้ายหน้าร้าน
 * แบบที่ไม่มีขายคือ "ไม่มีคีย์ใน prices" ไม่ใช่ราคา 0
 *
 * ⚠️ ข้อจำกัดจาก ds-drawer.js ที่ต้องเคารพ
 *    Drawer.open() snapshot drawer แม่ด้วย innerHTML และ close() restore ด้วย innerHTML
 *    → ค่าที่พิมพ์ในช่อง และ handler ที่ผูกด้วย addEventListener หายหมด
 *    ดังนั้น (ก) ปุ่มทุกตัวใช้ inline onclick  (ข) MenuPage.draft เป็น source of truth
 */
const MenuPage = {

    state: { cat: 'all', q: '', onSale: false, soldOut: false },
    draft: null,

    /* ══════════════════════════════════════════════════════
       RENDER
       ══════════════════════════════════════════════════════ */
    render() {
        const e = CFApp.esc;
        const products = CFStore.all('products');

        const kpi = (icon, value, label, critical) => `
            <div class="sip-kpi ${critical ? 'critical' : ''}">
                <i data-lucide="${icon}" class="sip-kpi-icon icon-lg"></i>
                <div class="sip-kpi-value">${value}</div>
                <div class="sip-kpi-label">${label}</div>
            </div>`;

        const soldOut = products.filter((p) => p.active && p.soldOut).length;
        document.getElementById('kpiStrip').innerHTML =
            kpi('package',      products.length, 'สินค้าทั้งหมด') +
            kpi('check-circle', products.filter((p) => p.active && !p.soldOut).length, 'เปิดขายอยู่') +
            kpi('ban',          soldOut, 'สินค้าหมดวันนี้', soldOut > 0) +
            kpi('archive',      products.filter((p) => !p.active).length, 'ปิดใช้งาน');

        /* ── แถบหมวด ── */
        const cats = CFStore.all('categories');
        document.getElementById('catBar').innerHTML =
            `<button class="ds-seg ${this.state.cat === 'all' ? 'active' : ''}"
                     onclick="MenuPage.setCat('all')">ทั้งหมด</button>` +
            cats.map((c) => `<button class="ds-seg ${this.state.cat === c.id ? 'active' : ''}"
                     onclick="MenuPage.setCat('${c.id}')">${e(c.nameTh)}</button>`).join('');

        document.getElementById('fOnSale').classList.toggle('is-on', this.state.onSale);
        document.getElementById('fSoldOut').classList.toggle('is-on', this.state.soldOut);

        /* ── ตาราง ── */
        const q = this.state.q.trim().toLowerCase();
        const list = products.filter((p) => {
            if (this.state.cat !== 'all' && p.categoryId !== this.state.cat) return false;
            if (this.state.onSale && (!p.active || p.soldOut)) return false;
            if (this.state.soldOut && !p.soldOut) return false;
            if (q && !(p.nameTh.toLowerCase().includes(q) || (p.nameEn || '').toLowerCase().includes(q))) return false;
            return true;
        });

        document.getElementById('rowCount').textContent = list.length + ' รายการ';
        document.getElementById('rows').innerHTML = list.length ? list.map((p) => {
            const cat = CFStore.byId('categories', p.categoryId);
            const serves = CFApp.serveTypesOf(p);
            const badge = !p.active
                ? '<span class="status-badge inactive">ปิดใช้งาน</span>'
                : p.soldOut
                    ? '<span class="status-badge danger">สินค้าหมด</span>'
                    : '<span class="status-badge active">เปิดขาย</span>';

            return `<tr>
                <td>
                    <div class="td-name">${e(p.nameTh)}</div>
                    <div class="td-sub">${e(p.groupTh || '')}${p.nameEn ? ' · ' + e(p.nameEn) : ''}</div>
                </td>
                <td>${e(cat ? cat.nameTh : '—')}</td>
                <td>
                    <div class="ds-chips" style="margin:0">
                        ${serves.filter((k) => k !== 'STD').map((k) =>
                            `<span class="sip-chip sip-chip-muted">${e(CF_SERVE[k].short)}</span>`).join('')
                          || '<span class="text-light">—</span>'}
                    </div>
                </td>
                <td>${CFApp.stationChip(p.station)}</td>
                <td class="cf-right cf-money cf-nowrap" data-role-gate="ADMIN MANAGER">${CFApp.priceSummary(p)}</td>
                <td>${badge}</td>
                <td class="cf-nowrap">
                    <button class="ds-icon-btn edit" title="แก้ไข" onclick="MenuPage.openProduct('${p.id}')">
                        <i data-lucide="pencil" class="icon-sm"></i>
                    </button>
                    <button class="ds-icon-btn" title="ปิดการขาย" onclick="MenuPage.remove('${p.id}')">
                        <i data-lucide="trash-2" class="icon-sm"></i>
                    </button>
                </td>
            </tr>`;
        }).join('') : '<tr><td colspan="7"><div class="ds-empty-sm">ไม่พบสินค้าที่ตรงเงื่อนไข</div></td></tr>';

        CFApp.applyRoleGate();
        refreshIcons();
    },

    setCat(c) { this.state.cat = c; this.render(); },
    setQuery(v) { this.state.q = v; this.render(); },
    toggleFilter(k) {
        this.state[k] = !this.state[k];
        if (k === 'onSale' && this.state.onSale) this.state.soldOut = false;
        if (k === 'soldOut' && this.state.soldOut) this.state.onSale = false;
        this.render();
    },

    /* ══════════════════════════════════════════════════════
       DRAWER 1 — เพิ่ม / แก้ไขสินค้า
       ══════════════════════════════════════════════════════ */
    openProduct(id) {
        const p = id ? CFStore.byId('products', id) : null;

        this.draft = p
            ? Object.assign({}, p, { prices: Object.assign({}, p.prices) })
            : {
                id: null, nameTh: '', nameEn: '', groupTh: '',
                categoryId: 'C-COFFEE', prices: { ICED: 0 },
                imageUrl: '', artKey: '',
                station: 'BAR', active: true, soldOut: false,
            };
        // แบบเสิร์ฟที่ใช้พรีวิวกลุ่มตัวเลือก — ไม่ใช่ข้อมูลสินค้า
        this._previewServe = CFApp.serveTypesOf(this.draft)[0] || 'ICED';

        Drawer.open({
            title: p ? 'แก้ไข: ' + CFApp.esc(p.nameTh) : 'เพิ่มรายการสินค้า',
            width: '620px',
            contentHtml: this.productFormHtml(),
            footerHtml: `
                <button class="btn btn-outline" onclick="Drawer.close()">ยกเลิก</button>
                <button class="btn btn-primary" onclick="MenuPage.save()">
                    <i data-lucide="save" class="icon-sm"></i> บันทึก
                </button>`,
            onOpen: () => { refreshIcons(); CFApp.applyRoleGate(); },
        });
    },

    productFormHtml() {
        const e = CFApp.esc;
        const d = this.draft;
        const cats = CFStore.all('categories');

        /* แถวราคาแยกตามแบบเสิร์ฟ — สวิตช์ปิดคือ "ไม่มีขายแบบนี้" ('–' บนป้าย) */
        const priceRow = (k) => {
            const on = d.prices[k] != null;
            return `<div class="flex gap-md" style="align-items:center;margin-bottom:8px">
                <button type="button" class="ds-toggle ${on ? 'is-on' : ''}" style="min-width:104px"
                        onclick="MenuPage.toggleServe('${k}')">
                    <span class="ds-toggle-track"><span class="ds-toggle-knob"></span></span>
                    ${e(CF_SERVE[k].label)}
                </button>
                <input class="sip-input" style="max-width:130px" type="number" min="0" step="1"
                       id="fPrice-${k}" value="${on ? d.prices[k] : ''}" ${on ? '' : 'disabled'}
                       placeholder="ไม่มีขาย" oninput="MenuPage.setPrice('${k}', this.value)">
                <span class="ds-hint">บาท</span>
            </div>`;
        };

        const isFood = ['C-BAKERY', 'C-FOOD', 'C-DESSERT'].includes(d.categoryId);

        return `
            <div class="ds-section-label">ข้อมูลพื้นฐาน</div>
            <div class="form-row">
                <div class="sip-field">
                    <label class="sip-label">ชื่อสินค้า (ไทย)</label>
                    <input class="sip-input" id="fNameTh" value="${e(d.nameTh)}"
                           oninput="MenuPage.set('nameTh', this.value)">
                </div>
                <div class="sip-field">
                    <label class="sip-label">ชื่อสินค้า (อังกฤษ)</label>
                    <input class="sip-input" id="fNameEn" value="${e(d.nameEn || '')}"
                           oninput="MenuPage.set('nameEn', this.value)">
                </div>
            </div>
            <div class="form-row">
                <div class="sip-field">
                    <label class="sip-label">หมวด</label>
                    <select class="sip-select" id="fCat" onchange="MenuPage.setCategory(this.value)">
                        ${cats.map((c) => `<option value="${c.id}" ${c.id === d.categoryId ? 'selected' : ''}>
                            ${e(c.nameTh)}</option>`).join('')}
                    </select>
                </div>
                <div class="sip-field">
                    <label class="sip-label">กลุ่มบนป้ายเมนู</label>
                    <input class="sip-input" id="fGroup" value="${e(d.groupTh || '')}"
                           placeholder="เช่น HOUSE BLEND" oninput="MenuPage.set('groupTh', this.value)">
                </div>
            </div>

            <div class="ds-section-label">รูปภาพสินค้า</div>
            <div class="flex gap-md" style="align-items:flex-start">
                <div id="fArtPreview" class="cf-art-preview">${this.artPreviewHtml()}</div>
                <div style="flex:1;min-width:0">
                    <div class="sip-field">
                        <label class="sip-label">รูปสินค้า</label>
                        <div class="cf-upload-row">
                            <button type="button" class="btn btn-outline btn-sm"
                                    id="fUploadBtn" onclick="MenuPage.pickImage()">
                                <i data-lucide="upload" class="icon-sm"></i> อัปโหลดจากเครื่อง
                            </button>
                            ${d.imageUrl ? `<button type="button" class="btn btn-outline btn-sm"
                                    onclick="MenuPage.clearImage()">
                                <i data-lucide="x" class="icon-sm"></i> เอารูปออก
                            </button>` : ''}
                            <input type="file" id="fImageFile" accept="image/jpeg,image/png,image/webp"
                                   hidden onchange="MenuPage.uploadImage(this)">
                            <span class="ds-note" id="fUploadNote">JPG · PNG · WebP — ระบบย่อให้เองอัตโนมัติ</span>
                        </div>
                    </div>
                    <div class="sip-field">
                        <label class="sip-label">หรือใส่ลิงก์รูปภาพ</label>
                        <input class="sip-input" id="fImageUrl" value="${e(d.imageUrl || '')}"
                               placeholder="https://…  เว้นว่างเพื่อใช้ภาพวาดประกอบ"
                               oninput="MenuPage.setImage(this.value)">
                    </div>
                    <div class="sip-field" style="margin:0">
                        <label class="sip-label">ภาพวาดประกอบ</label>
                        <select class="sip-select" id="fArtKey" onchange="MenuPage.setArtKey(this.value)">
                            <option value="">เลือกอัตโนมัติตามหมวดและแบบเสิร์ฟ</option>
                            ${CFKioskArt.KEYS.map((k) => `<option value="${k}"
                                ${d.artKey === k ? 'selected' : ''}>${e(CFKioskArt.LABEL[k])}</option>`).join('')}
                        </select>
                    </div>
                </div>
            </div>
            <div class="ds-note">
                ลิงก์รูปตายเมื่อไหร่ ระบบจะกลับไปใช้ภาพวาดให้เอง — คีออสก์จะไม่มีวันขึ้นรูปแตก
            </div>

            <div class="ds-section-label">ราคาตามแบบเสิร์ฟ</div>
            <div data-role-gate="ADMIN MANAGER">
                ${isFood ? priceRow('STD')
                         : ['HOT', 'ICED', 'FRAPPE'].map(priceRow).join('')}
                <div class="ds-note">
                    ปิดสวิตช์ = ไม่มีขายแบบนั้น (ตรงกับ "–" บนป้ายหน้าร้าน) ไม่ใช่ราคา 0
                    — คีออสก์จะไม่ให้ลูกค้าเลือกแบบที่ปิดไว้
                </div>
            </div>

            <div class="ds-section-label">สถานีครัวที่รับผิดชอบ (§18)</div>
            <div class="ds-chips">
                ${Object.keys(CF_STATIONS).map((st) => `
                    <button type="button" class="ds-chip-toggle ${st === d.station ? 'is-on' : ''}"
                            onclick="MenuPage.set('station','${st}', true)">${e(CF_STATIONS[st].label)}</button>`).join('')}
            </div>

            <div class="ds-section-label">ตัวเลือกสินค้า (Modifier)</div>
            <div id="mgHost">${this.modifierHtml()}</div>

            <div class="ds-section-label">สถานะ</div>
            <div class="sip-field-row">
                <button type="button" class="ds-toggle ${d.active ? 'is-on' : ''}" id="tgActive"
                        onclick="MenuPage.toggle('active')">
                    <span class="ds-toggle-track"><span class="ds-toggle-knob"></span></span> เปิดขาย
                </button>
                <button type="button" class="ds-toggle ${d.soldOut ? 'is-on' : ''}" id="tgSoldOut"
                        onclick="MenuPage.toggle('soldOut')">
                    <span class="ds-toggle-track"><span class="ds-toggle-knob"></span></span> สินค้าหมดวันนี้
                </button>
            </div>
            <div class="ds-note">
                ติ๊ก "สินค้าหมดวันนี้" แล้วคีออสก์ทุกเครื่องจะขึ้นว่าสินค้าหมดทันที
                และจะโผล่บนหน้าภาพรวมของผู้จัดการ
            </div>`;
    },

    /**
     * §11 — กลุ่มตัวเลือกที่ขับด้วยกฎ
     * กฎผูกกับ "แบบเสิร์ฟ" จึงต้องให้เลือกดูทีละแบบ
     * กลุ่มที่ถูกซ่อนต้องหายไปจริงพร้อมคำอธิบาย ไม่ใช่แค่ทำจาง
     */
    modifierHtml() {
        const e = CFApp.esc;
        const d = this.draft;
        const serves = CFApp.serveTypesOf(d);

        if (!serves.length) {
            return '<div class="ds-block"><i data-lucide="alert-circle" class="icon-sm"></i> ' +
                   'ต้องเปิดขายอย่างน้อยหนึ่งแบบเสิร์ฟก่อน</div>';
        }
        if (!serves.includes(this._previewServe)) this._previewServe = serves[0];

        const sv = this._previewServe;
        const shown = CFRules.groupsFor(sv, d.categoryId);
        const hidden = CFRules.hiddenFor(sv, d.categoryId);

        const picker = serves.length > 1 ? `
            <div class="ds-toolbar" style="margin-bottom:10px">
                <span class="ds-hint">ดูตัวเลือกของแบบ</span>
                <div class="ds-segbar">
                    ${serves.map((k) => `<button type="button" class="ds-seg ${k === sv ? 'active' : ''}"
                        onclick="MenuPage.previewServe('${k}')">${e(CF_SERVE[k].label)}</button>`).join('')}
                </div>
            </div>` : '';

        if (!shown.length) {
            return picker + `<div class="sip-banner sip-banner-info">
                    <i data-lucide="info" class="icon-sm"></i>
                    แบบ "${e(CF_SERVE[sv].label)}" ไม่แสดงตัวเลือกใด ๆ ตามกฎในระบบ
                </div>` + this.hiddenNote(hidden);
        }

        return picker + shown.map((g) => {
            const opts = CFRules.optionsOf(g.id);
            return `<div class="sip-card" style="padding:10px 12px;margin-bottom:8px">
                <div class="flex flex-between gap-md" style="align-items:center">
                    <div>
                        <strong style="font-size:14px">${e(g.nameTh)}</strong>
                        <span class="sip-chip sip-chip-muted">${g.type === 'SINGLE' ? 'เลือกได้ 1' : 'เลือกได้หลายอย่าง'}</span>
                        ${g.required ? '<span class="sip-chip sip-chip-active">บังคับ</span>' : ''}
                    </div>
                    <button type="button" class="btn btn-ghost btn-sm" onclick="MenuPage.openGroup('${g.id}')">
                        <i data-lucide="settings-2" class="icon-sm"></i> แก้ไขตัวเลือก
                    </button>
                </div>
                <div class="td-sub" style="margin-top:4px">
                    ${opts.map((o) => e(o.shortLabel) + (o.priceDelta ? ' (+' + o.priceDelta + ')' : '')).join(' · ')}
                </div>
            </div>`;
        }).join('') + this.hiddenNote(hidden);
    },

    hiddenNote(hidden) {
        if (!hidden.length) return '';
        const e = CFApp.esc;
        return `<div class="ds-note">
            <i data-lucide="filter" class="icon-sm"></i>
            กฎของแบบเสิร์ฟ/หมวดนี้ซ่อน: ${hidden.map((g) => e(g.nameTh)).join(' · ')}
        </div>`;
    },

    /** พรีวิวภาพที่ลูกค้าจะเห็นจริง — ใช้ resolver ตัวเดียวกับคีออสก์ */
    artPreviewHtml() {
        const sv = CFApp.serveTypesOf(this.draft)[0] || 'ICED';
        return CFKioskArt.tile(this.draft, sv);
    },

    /** วาดใหม่เฉพาะพรีวิว — ห้าม re-render ทั้งฟอร์ม ไม่งั้น input เสีย focus ทุกคีย์ที่พิมพ์ */
    repaintArt() {
        const el = document.getElementById('fArtPreview');
        if (el) el.innerHTML = this.artPreviewHtml();
    },

    setImage(v) { this.draft.imageUrl = v.trim(); this.repaintArt(); },

    /* ══════════════════════════════════════════════════════
       อัปโหลดรูปจากเครื่อง — ช่องทางที่สามต่อจากลิงก์และภาพวาด
       ══════════════════════════════════════════════════════ */
    pickImage() {
        const el = document.getElementById('fImageFile');
        if (el) { el.value = ''; el.click(); }   // ล้างค่าก่อน ไม่งั้นเลือกไฟล์เดิมซ้ำไม่ติด
    },

    async uploadImage(input) {
        const file = input.files && input.files[0];
        if (!file) return;

        const note = document.getElementById('fUploadNote');
        const btn = document.getElementById('fUploadBtn');
        const say = (msg) => { if (note) note.textContent = msg; };

        // เตือนตั้งแต่ยังไม่ส่ง — ผู้ใช้จะได้ไม่ต้องรออัปโหลด 10 MB แล้วค่อยรู้ว่าไม่ผ่าน
        if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
            say('รองรับเฉพาะ JPG, PNG หรือ WebP'); return;
        }
        if (file.size > 12 * 1024 * 1024) {
            say('ไฟล์ใหญ่เกิน 12 MB — ลองถ่ายใหม่ที่ความละเอียดต่ำลง'); return;
        }

        if (btn) btn.disabled = true;
        say('กำลังอัปโหลด…');
        try {
            const fd = new FormData();
            fd.append('file', file, file.name);
            // ใช้ fetch ตรง ไม่ผ่าน CFApi เพราะ multipart ต้องให้เบราว์เซอร์
            // ตั้ง Content-Type พร้อม boundary เอง ถ้าเราตั้งเองจะพังทันที
            const res = await fetch((CFApi.baseUrl() || '') + '/api/media/upload',
                { method: 'POST', body: fd, credentials: 'same-origin' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'อัปโหลดไม่สำเร็จ');

            this.draft.imageUrl = data.url;
            const f = document.getElementById('fImageUrl');
            if (f) f.value = data.url;
            this.repaintArt();
            say(`อัปโหลดแล้ว ${data.width}×${data.height} · ` +
                `${Math.round(data.originalBytes / 1024)} KB → ${Math.round(data.bytes / 1024)} KB`);
            // ปุ่ม "เอารูปออก" เพิ่งมีความหมาย ต้องวาดใหม่ให้โผล่
            this.refreshForm();
        } catch (err) {
            say(err.message || 'อัปโหลดไม่สำเร็จ');
        } finally {
            if (btn) btn.disabled = false;
        }
    },

    clearImage() {
        this.captureForm();
        this.draft.imageUrl = '';
        this.refreshForm();     // กลับไปใช้ภาพวาดประกอบตามหมวดและแบบเสิร์ฟ
    },
    setArtKey(v) { this.draft.artKey = v; this.repaintArt(); },

    /* ── การแก้ค่าในฟอร์ม ─────────────────────────────── */
    set(key, value, rerender) {
        this.draft[key] = value;
        if (rerender) this.refreshForm();
    },

    setPrice(k, v) {
        const n = parseFloat(v);
        this.draft.prices[k] = isNaN(n) ? 0 : n;
    },

    /** เปิด/ปิดการขายแบบเสิร์ฟหนึ่ง — ปิดคือลบคีย์ทิ้ง ไม่ใช่ตั้งเป็น 0 */
    toggleServe(k) {
        this.captureForm();
        if (this.draft.prices[k] != null) delete this.draft.prices[k];
        else this.draft.prices[k] = 0;
        this.refreshForm();
    },

    previewServe(k) { this.captureForm(); this._previewServe = k; this.refreshForm(); },

    /** เปลี่ยนหมวด → กฎเปลี่ยน (กาแฟมีเมล็ดพิเศษ, มัทฉะมีเกรด) และแนะนำสถานีให้ */
    setCategory(cid) {
        this.captureForm();
        this.draft.categoryId = cid;
        const suggest = { 'C-BAKERY': 'BAKERY', 'C-FOOD': 'KITCHEN', 'C-DESSERT': 'DESSERT' }[cid] || 'BAR';
        this.draft.station = suggest;
        // ของกินไม่มีแกนร้อน/เย็น/ปั่น — สลับโครงราคาให้ตรงกับหมวด
        const isFood = ['C-BAKERY', 'C-FOOD', 'C-DESSERT'].includes(cid);
        const hadStd = this.draft.prices.STD != null;
        if (isFood && !hadStd) {
            const first = CFApp.minPriceOf(this.draft) || 0;
            this.draft.prices = { STD: first };
        } else if (!isFood && hadStd) {
            this.draft.prices = { ICED: this.draft.prices.STD };
        }
        this.refreshForm();
    },

    toggle(key) {
        this.draft[key] = !this.draft[key];
        const el = document.getElementById(key === 'active' ? 'tgActive' : 'tgSoldOut');
        if (el) el.classList.toggle('is-on', this.draft[key]);
    },

    /** วาดฟอร์มใหม่จาก draft (ค่าทั้งหมดอยู่ใน draft อยู่แล้ว จึงไม่มีอะไรหาย) */
    refreshForm() {
        Drawer.setContent(this.productFormHtml());
        refreshIcons();
        CFApp.applyRoleGate();
    },

    /** อ่านค่าจาก DOM กลับเข้า draft — เรียกก่อนทุกครั้งที่จะ re-render หรือเปิด drawer ซ้อน */
    captureForm() {
        const g = (id) => document.getElementById(id);
        if (g('fNameTh')) this.draft.nameTh = g('fNameTh').value;
        if (g('fNameEn')) this.draft.nameEn = g('fNameEn').value;
        if (g('fGroup'))  this.draft.groupTh = g('fGroup').value;
        if (g('fCat'))    this.draft.categoryId = g('fCat').value;
        if (g('fImageUrl')) this.draft.imageUrl = g('fImageUrl').value.trim();
        if (g('fArtKey'))   this.draft.artKey = g('fArtKey').value;
        CF_SERVE_ORDER.forEach((k) => {
            const el = g('fPrice-' + k);
            if (el && !el.disabled) {
                const n = parseFloat(el.value);
                this.draft.prices[k] = isNaN(n) ? 0 : n;
            }
        });
    },

    /* ══════════════════════════════════════════════════════
       DRAWER 2 — แก้ไขกลุ่มตัวเลือก (ซ้อนบน drawer สินค้า)
       ══════════════════════════════════════════════════════ */
    openGroup(groupId) {
        this.captureForm();          // ⚠️ ต้องเก็บก่อน ไม่งั้นค่าที่พิมพ์หายตอน snapshot
        this._groupId = groupId;
        this._groupType = null;
        this._groupRequired = null;

        Drawer.open({
            title: 'กลุ่มตัวเลือก — ' + CFApp.esc(CFStore.byId('modifierGroups', groupId).nameTh),
            width: '520px',
            contentHtml: this.groupFormHtml(groupId),
            footerHtml: `
                <button class="btn btn-outline" onclick="Drawer.close()">กลับ</button>
                <button class="btn btn-primary" onclick="MenuPage.saveGroup()">
                    <i data-lucide="save" class="icon-sm"></i> บันทึกกลุ่ม
                </button>`,
            onOpen: () => refreshIcons(),
            // close() เรียก onClose ก่อน restore เสมอ จึงต้องรอให้ restore เสร็จก่อน
            // setTimeout(0) ครอบคลุมทั้งกดปุ่ม กด Esc และคลิกฉากหลัง
            onClose: () => setTimeout(() => {
                if (Drawer.isOpen()) this.refreshForm();
            }, 0),
        });
    },

    groupFormHtml(groupId) {
        const e = CFApp.esc;
        const g = CFStore.byId('modifierGroups', groupId);
        const opts = CFRules.optionsOf(groupId);

        return `
            <div class="sip-field">
                <label class="sip-label">ชื่อกลุ่ม</label>
                <input class="sip-input" id="gName" value="${e(g.nameTh)}">
            </div>
            <div class="sip-field">
                <label class="sip-label">รูปแบบการเลือก</label>
                <div class="ds-segbar" id="gTypeBar">
                    <button type="button" class="ds-seg ${g.type === 'SINGLE' ? 'active' : ''}"
                            onclick="MenuPage.setGroupType('SINGLE')">เลือกได้ 1</button>
                    <button type="button" class="ds-seg ${g.type === 'MULTI' ? 'active' : ''}"
                            onclick="MenuPage.setGroupType('MULTI')">เลือกได้หลายอย่าง</button>
                </div>
            </div>
            <div class="sip-field">
                <button type="button" class="ds-toggle ${g.required ? 'is-on' : ''}" id="gReq"
                        onclick="MenuPage.toggleGroupRequired()">
                    <span class="ds-toggle-track"><span class="ds-toggle-knob"></span></span> บังคับให้เลือก
                </button>
            </div>

            <div class="ds-section-label">ตัวเลือกในกลุ่ม</div>
            <div class="table-responsive">
                <table class="data-table compact">
                    <thead><tr><th>ชื่อ</th><th>ตัวย่อ</th><th class="cf-right">+ราคา</th><th>ค่าเริ่มต้น</th></tr></thead>
                    <tbody>
                        ${opts.map((o) => `<tr>
                            <td class="td-name">${e(o.nameTh)}</td>
                            <td class="td-sub">${e(o.shortLabel)}</td>
                            <td class="cf-right cf-money">${o.priceDelta ? '+' + o.priceDelta : '—'}</td>
                            <td>${o.isDefault ? '<span class="sip-chip sip-chip-success">ค่าเริ่มต้น</span>' : ''}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
            <div class="ds-note">
                ตัวย่อใช้บนใบเสร็จกระดาษแคบ 58 มม. — สลิปครัวจะสะกดเต็มคำเสมอ
            </div>`;
    },

    setGroupType(t) {
        this._groupType = t;
        document.querySelectorAll('#gTypeBar .ds-seg').forEach((b, i) => {
            b.classList.toggle('active', ['SINGLE', 'MULTI'][i] === t);
        });
    },

    toggleGroupRequired() {
        const cur = this._groupRequired == null
            ? CFStore.byId('modifierGroups', this._groupId).required
            : this._groupRequired;
        this._groupRequired = !cur;
        document.getElementById('gReq').classList.toggle('is-on', this._groupRequired);
    },

    saveGroup() {
        const id = this._groupId;
        const name = document.getElementById('gName').value.trim();
        const type = this._groupType;
        const req = this._groupRequired;

        if (!name) { showToast('ต้องระบุชื่อกลุ่ม', 'error'); return; }

        const done = () => {
            this._groupType = null;
            this._groupRequired = null;
            showToast('บันทึกกลุ่มตัวเลือกแล้ว', 'success');
            Drawer.close();     // → restore drawer สินค้า แล้ว onClose จะ refresh ให้
        };

        CFStore.cmd('patch', '/api/modifier-groups/' + encodeURIComponent(id),
            { nameTh: name, type, required: req })
            .then(done)
            .catch((err) => showToast(err.message || 'บันทึกไม่สำเร็จ', 'error', 4000));
    },

    /* ══════════════════════════════════════════════════════
       บันทึก / ปิดการขายสินค้า
       ══════════════════════════════════════════════════════ */
    save() {
        this.captureForm();
        const d = this.draft;

        if (!d.nameTh.trim()) { showToast('ต้องระบุชื่อสินค้า (ไทย)', 'error'); return; }
        const serves = CFApp.serveTypesOf(d);
        if (!serves.length) { showToast('ต้องเปิดขายอย่างน้อยหนึ่งแบบเสิร์ฟ', 'error'); return; }
        const bad = serves.find((k) => d.prices[k] <= 0);
        if (bad) { showToast('ราคาแบบ "' + CF_SERVE[bad].label + '" ต้องมากกว่า 0', 'error'); return; }

        const isNew = !d.id;

        // เซิร์ฟเวอร์ออก id และตรวจราคาซ้ำอีกชั้น — ที่นี่แค่ส่งสิ่งที่ผู้ใช้กรอก
        const body = {
            categoryId: d.categoryId, groupTh: d.groupTh, nameTh: d.nameTh, nameEn: d.nameEn,
            imageUrl: d.imageUrl, artKey: d.artKey, station: d.station,
            active: d.active !== false, soldOut: !!d.soldOut, recommended: !!d.recommended,
            prices: d.prices,
        };
        CFStore.cmd(isNew ? 'post' : 'put',
            isNew ? '/api/products' : '/api/products/' + encodeURIComponent(d.id), body)
            .then(() => {
                Drawer.close();
                showToast(isNew ? 'เพิ่มสินค้าแล้ว' : 'บันทึกการแก้ไขแล้ว', 'success');
            })
            .catch((err) => showToast(err.message || 'บันทึกไม่สำเร็จ', 'error', 4000));
    },

    async remove(id) {
        const p = CFStore.byId('products', id);
        const ok = await Drawer.confirm({
            title: 'ปิดการขายสินค้านี้?',
            message: 'สินค้าจะถูกซ่อนจากคีออสก์ แต่ยังคงอยู่ในออเดอร์เก่า',
            lines: [p.nameTh],
            note: 'ระบบไม่ลบข้อมูลจริง เพื่อให้ออเดอร์ย้อนหลังยังอ่านชื่อสินค้าได้',
            confirmText: 'ปิดการขาย', danger: true,
        });
        if (!ok) return;

        try {
            await CFStore.cmd('post', '/api/products/' + encodeURIComponent(id) + '/archive', {});
        } catch (err) {
            showToast(err.message || 'ปิดการขายไม่สำเร็จ', 'error', 4000);
            return;
        }

        showToast('ปิดการขาย ' + p.nameTh + ' แล้ว', 'success');
    },

    /* ── มุมมองรวมกลุ่มตัวเลือกทั้งหมด (#groups จากเมนู) ── */
    openGroups() {
        const e = CFApp.esc;
        const rows = CFStore.all('modifierGroups').map((g) => {
            const opts = CFRules.optionsOf(g.id);
            const rules = CFStore.where('modifierRules', (r) => r.groupId === g.id);
            const applies = rules.map((r) => r.serveType
                ? CF_SERVE[r.serveType].label
                : 'หมวด ' + (CFStore.byId('categories', r.categoryId) || {}).nameTh);
            return `<tr>
                <td class="td-name">${e(g.nameTh)}</td>
                <td class="td-sub">${g.type === 'SINGLE' ? 'เลือกได้ 1' : 'หลายอย่าง'}${g.required ? ' · บังคับ' : ''}</td>
                <td class="td-sub">${opts.length} ตัวเลือก</td>
                <td class="td-sub">${e(applies.join(', ')) || '—'}</td>
            </tr>`;
        }).join('');

        Drawer.open({
            title: 'กลุ่มตัวเลือกทั้งหมด (§11)',
            width: '640px',
            contentHtml: `
                <div class="sip-banner sip-banner-info" style="margin-bottom:12px">
                    <i data-lucide="info" class="icon-sm"></i>
                    ตัวเลือกผูกกับ "แบบเสิร์ฟ" และ "หมวด" ด้วยกฎ ไม่ได้ผูกกับสินค้าทีละตัว
                </div>
                <div class="table-responsive">
                    <table class="data-table compact">
                        <thead><tr><th>กลุ่ม</th><th>รูปแบบ</th><th>จำนวน</th><th>ใช้กับ</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`,
            footerHtml: '<button class="btn btn-outline" onclick="Drawer.close()">ปิด</button>',
            onOpen: () => refreshIcons(),
        });
    },

    boot() {
        CFApp.boot({ page: 'menu' });
        CFKioskArt.mount();      // พรีวิวรูปสินค้าต้องใช้ sprite ตัวเดียวกับคีออสก์
        this.render();
        CFStore.subscribe(() => this.render());
        if (location.hash === '#groups') setTimeout(() => this.openGroups(), 250);
    },
};

window.MenuPage = MenuPage;
CFBoot.ready(() => MenuPage.boot());
