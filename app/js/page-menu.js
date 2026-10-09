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
        // เลื่อนลำดับได้เมื่อดูทีละหมวดและไม่ได้กรอง — ลำดับในหมวด = ลำดับบนคีออสก์
        const canMove = this.state.cat !== 'all' && !q && !this.state.onSale && !this.state.soldOut;
        this._list = list;
        document.getElementById('rows').innerHTML = list.length ? list.map((p, i) => {
            const cat = CFStore.byId('categories', p.categoryId);
            const serves = CFApp.serveTypesOf(p);
            const stock = p.stockQty != null && p.active && !p.soldOut
                ? ` · เหลือ ${p.stockQty}` : '';
            const badge = !p.active
                ? '<span class="status-badge inactive">ปิดใช้งาน</span>'
                : p.soldOut
                    ? '<span class="status-badge danger">สินค้าหมด</span>'
                    : `<span class="status-badge ${p.stockQty != null && p.stockQty <= 5 ? 'waiting' : 'active'}">เปิดขาย${stock}</span>`;
            const sub = [p.groupTh, p.nameEn].filter(Boolean).map(e).join(' · ');
            const when = p.availFrom ? `<span class="cf-when"><i data-lucide="clock" class="icon-sm"></i> ${e(p.availFrom)}–${e(p.availTo)}</span>` : '';

            return `<tr>
                <td>
                    <div class="cf-prod-cell">
                        ${canMove ? `<span class="cf-move">
                            <button class="ds-icon-btn" title="เลื่อนขึ้น" ${i ? '' : 'disabled'}
                                    onclick="MenuPage.moveProduct('${p.id}', -1)"><i data-lucide="chevron-up"></i></button>
                            <button class="ds-icon-btn" title="เลื่อนลง" ${i < list.length - 1 ? '' : 'disabled'}
                                    onclick="MenuPage.moveProduct('${p.id}', 1)"><i data-lucide="chevron-down"></i></button>
                        </span>` : ''}
                        <div>
                            <div class="td-name">${e(p.nameTh)}</div>
                            <div class="td-sub">${sub}${sub && when ? ' · ' : ''}${when}</div>
                        </div>
                    </div>
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
                    <button class="ds-icon-btn" title="ทำสำเนา — สร้างสินค้าใหม่จากตัวนี้" onclick="MenuPage.openProduct('${p.id}', true)">
                        <i data-lucide="copy" class="icon-sm"></i>
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
    /** copy = ทำสำเนา: สินค้าใหม่ที่ค่าทุกอย่างเหมือนตัวเดิม แก้แค่ชื่อกับราคาแล้วบันทึก */
    openProduct(id, copy) {
        const p = id ? CFStore.byId('products', id) : null;

        this.draft = p
            ? Object.assign({}, p, { prices: Object.assign({}, p.prices), costs: Object.assign({}, p.costs || {}) })
            : {
                id: null, nameTh: '', nameEn: '', groupTh: '',
                categoryId: (this.state.cat !== 'all' && this.state.cat) || 'C-COFFEE', prices: { ICED: 0 }, costs: {},
                imageUrl: '', artKey: '', descriptionTh: '', descriptionEn: '',
                availFrom: null, availTo: null, stockQty: null,
                station: 'BAR', active: true, soldOut: false,
            };
        if (p && copy) {
            Object.assign(this.draft, { id: null, nameTh: p.nameTh + ' (สำเนา)', soldOut: false, active: true });
        }
        // แบบเสิร์ฟที่ใช้พรีวิวกลุ่มตัวเลือก — ไม่ใช่ข้อมูลสินค้า
        this._previewServe = CFApp.serveTypesOf(this.draft)[0] || 'ICED';

        Drawer.open({
            title: p && copy ? 'ทำสำเนา: ' + CFApp.esc(p.nameTh) : p ? 'แก้ไข: ' + CFApp.esc(p.nameTh) : 'เพิ่มรายการสินค้า',
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
                <input class="sip-input" style="max-width:120px" type="number" min="0" step="1"
                       id="fPrice-${k}" value="${on ? d.prices[k] : ''}" ${on ? '' : 'disabled'}
                       placeholder="ไม่มีขาย" oninput="MenuPage.setPrice('${k}', this.value)">
                <span class="ds-hint">บาท</span>
                ${on && CFAuth.can('PRICE_EDIT') ? `
                <span class="ds-hint" style="margin-left:8px">ต้นทุน</span>
                <input class="sip-input" style="max-width:100px" type="number" min="0" step="0.5"
                       id="fCost-${k}" value="${d.costs && d.costs[k] != null ? d.costs[k] : ''}" placeholder="—"
                       oninput="MenuPage.showMargin('${k}')">
                <span class="cf-margin" id="fMargin-${k}">${this.marginText(d.prices[k], d.costs && d.costs[k])}</span>` : ''}
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
                    <label class="sip-label">คำอธิบายสั้น ๆ (ไทย) — ขึ้นที่คีออสก์</label>
                    <input class="sip-input" id="fDescTh" maxlength="200" value="${e(d.descriptionTh || '')}"
                           placeholder="เช่น เข้ม หอมช็อกโกแลต">
                </div>
                <div class="sip-field">
                    <label class="sip-label">คำอธิบาย (อังกฤษ)</label>
                    <input class="sip-input" id="fDescEn" maxlength="200" value="${e(d.descriptionEn || '')}"
                           placeholder="Bold, chocolatey">
                </div>
            </div>
            <div class="form-row">
                <div class="sip-field">
                    <label class="sip-label">หมวด</label>
                    <select class="sip-select" id="fCat" onchange="MenuPage.setCategory(this.value)">
                        ${cats.filter((c) => c.active !== false || c.id === d.categoryId).map((c) => `<option value="${c.id}" ${c.id === d.categoryId ? 'selected' : ''}>
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
                    ${CFAuth.can('PRICE_EDIT') ? '· ต้นทุน = ค่าวัตถุดิบ+แก้วต่อแก้ว (ไม่รวมท็อปปิ้ง) ใช้คิดกำไรในใบปิดรอบ · ไม่ใส่ก็ได้' : ''}
                </div>
            </div>

            <div class="ds-section-label">ช่วงเวลาที่ขาย</div>
            <div class="ds-segbar" style="margin-bottom:8px">
                <button type="button" class="ds-seg ${d.availFrom ? '' : 'active'}" onclick="MenuPage.setWindow(false)">ขายทั้งวัน</button>
                <button type="button" class="ds-seg ${d.availFrom ? 'active' : ''}" onclick="MenuPage.setWindow(true)">เฉพาะช่วงเวลา</button>
            </div>
            ${d.availFrom ? `<div class="flex gap-md" style="align-items:center">
                <input class="sip-input" type="time" id="fFrom" value="${e(d.availFrom)}" style="max-width:150px">
                <span>ถึง</span>
                <input class="sip-input" type="time" id="fTo" value="${e(d.availTo)}" style="max-width:150px">
                <span class="ds-hint">น.</span>
            </div>
            <div class="ds-note">นอกช่วงเวลา คีออสก์ซ่อนเมนูนี้เอง · ข้ามเที่ยงคืนได้ เช่น 20:00 ถึง 02:00</div>` : ''}

            <div class="ds-section-label">สต็อก</div>
            <div class="ds-segbar" style="margin-bottom:8px">
                <button type="button" class="ds-seg ${d.stockQty == null ? 'active' : ''}" onclick="MenuPage.setStockMode(false)">ไม่นับ (ขายได้เรื่อย ๆ)</button>
                <button type="button" class="ds-seg ${d.stockQty != null ? 'active' : ''}" onclick="MenuPage.setStockMode(true)">นับจำนวน</button>
            </div>
            ${d.stockQty != null ? `<div class="flex gap-md" style="align-items:center">
                <span>เหลือ</span>
                <input class="sip-input" type="number" min="0" step="1" id="fStock" value="${d.stockQty}" style="max-width:130px">
                <span class="ds-hint">ชิ้น</span>
            </div>
            <div class="ds-note">ขายแล้วระบบลดให้เอง · เหลือ 0 ขึ้น "หมด" ที่คีออสก์ทันที ·
                ยกเลิกออเดอร์ก่อนเข้าครัวคืนสต็อกให้ · เติมของใหม่ก็แก้ตัวเลขนี้</div>` : ''}

            <div class="ds-section-label">สถานีครัวที่รับผิดชอบ</div>
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
                        <span class="sip-chip sip-chip-muted">${g.type === 'SINGLE' ? 'เลือกได้ 1' : g.maxSelect ? 'เลือกได้สูงสุด ' + g.maxSelect : 'เลือกได้หลายอย่าง'}</span>
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
        this.showMargin(k);
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
        if (g('fDescTh'))   this.draft.descriptionTh = g('fDescTh').value;
        if (g('fDescEn'))   this.draft.descriptionEn = g('fDescEn').value;
        if (g('fFrom'))     this.draft.availFrom = g('fFrom').value || '';
        if (g('fTo'))       this.draft.availTo = g('fTo').value || '';
        if (g('fStock'))    this.draft.stockQty = g('fStock').value === '' ? 0 : Math.max(0, parseInt(g('fStock').value, 10) || 0);
        CF_SERVE_ORDER.forEach((k) => {
            const el = g('fCost-' + k);
            if (el) this.draft.costs[k] = el.value === '' ? null : Number(el.value);
        });
        CF_SERVE_ORDER.forEach((k) => {
            const el = g('fPrice-' + k);
            if (el && !el.disabled) {
                const n = parseFloat(el.value);
                this.draft.prices[k] = isNaN(n) ? 0 : n;
            }
        });
    },

    /* ── กำไรต่อแก้ว ── */
    marginText(price, cost) {
        if (cost == null || cost === '' || !(price > 0)) return '';
        const m = price - Number(cost);
        return `กำไร ${CFApp.money(m)} (${Math.round(m / price * 100)}%)`;
    },
    showMargin(k) {
        const c = document.getElementById('fCost-' + k), p = document.getElementById('fPrice-' + k);
        const out = document.getElementById('fMargin-' + k);
        if (out) out.textContent = this.marginText(Number(p && p.value), c && c.value);
    },

    /* ── ช่วงเวลาขาย / สต็อก — สลับโหมดแล้ววาดฟอร์มใหม่ ── */
    setWindow(on) {
        this.captureForm();
        if (on && !this.draft.availFrom) { this.draft.availFrom = '07:00'; this.draft.availTo = '11:00'; }
        if (!on) { this.draft.availFrom = null; this.draft.availTo = null; }
        this.refreshForm();
    },
    setStockMode(on) {
        this.captureForm();
        this.draft.stockQty = on ? (this.draft.stockQty == null ? 10 : this.draft.stockQty) : null;
        this.refreshForm();
    },

    /* ── ลำดับสินค้าในหมวด (= ลำดับบนคีออสก์) ── */
    async moveProduct(id, dir) {
        const list = CFStore.where('products', (p) => p.categoryId === this.state.cat);   // ลำดับเดียวกับ store (sort, id)
        const i = list.findIndex((p) => p.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= list.length) return;
        const ids = list.map((p) => p.id);
        [ids[i], ids[j]] = [ids[j], ids[i]];
        try {
            await CFStore.cmd('post', '/api/products/reorder', { ids });
        } catch (err) {
            showToast(err.message || 'เลื่อนไม่สำเร็จ', 'error', 4000);
        }
    },

    /* ══════════════════════════════════════════════════════
       ปรับราคาหลายรายการ — ใช้กับสินค้าที่แสดงในตารางตอนนี้ (กรองหมวด/ค้นหาก่อนได้)
       ══════════════════════════════════════════════════════ */
    openBulkPrice() {
        const list = (this._list || []).filter((p) => Object.keys(p.prices || {}).length);
        if (!list.length) { showToast('ไม่มีสินค้าในตารางให้ปรับราคา', 'error'); return; }
        this._bp = { ids: list.map((p) => p.id), mode: 'add', value: 5, serves: ['HOT', 'ICED', 'FRAPPE', 'STD'] };
        Drawer.open({
            title: 'ปรับราคา ' + list.length + ' รายการ',
            width: '640px',
            contentHtml: '<div id="bpHost"></div>',
            footerHtml: `
                <button class="btn btn-outline" onclick="Drawer.close()">ยกเลิก</button>
                <button class="btn btn-primary" id="bpGo" onclick="MenuPage.applyBulkPrice()">
                    <i data-lucide="check" class="icon-sm"></i> ปรับราคา</button>`,
            onOpen: () => this.renderBulkPrice(),
        });
    },

    bulkNew(price) {
        const b = this._bp;
        return b.mode === 'pct' ? Math.round(price * (1 + b.value / 100)) : Math.round((price + b.value) * 100) / 100;
    },

    renderBulkPrice() {
        const host = document.getElementById('bpHost');
        if (!host) return;
        const e = CFApp.esc;
        const b = this._bp;
        const rows = [];
        b.ids.forEach((id) => {
            const p = CFStore.byId('products', id);
            CF_SERVE_ORDER.forEach((k) => {
                if (p.prices[k] == null || !b.serves.includes(k)) return;
                rows.push({ name: p.nameTh, k, old: p.prices[k], nu: b.value ? this.bulkNew(p.prices[k]) : p.prices[k] });
            });
        });
        const bad = rows.some((r) => !(r.nu > 0));
        host.innerHTML = `
            <div class="sip-field">
                <label class="sip-label">ปรับแบบ</label>
                <div class="flex gap-md" style="align-items:center;flex-wrap:wrap">
                    <div class="ds-segbar">
                        <button type="button" class="ds-seg ${b.mode === 'add' ? 'active' : ''}" onclick="MenuPage.setBulk('mode','add')">บวก/ลบ เป็นบาท</button>
                        <button type="button" class="ds-seg ${b.mode === 'pct' ? 'active' : ''}" onclick="MenuPage.setBulk('mode','pct')">เป็น %</button>
                    </div>
                    <input class="sip-input" type="number" step="1" id="bpVal" value="${b.value}" style="max-width:120px"
                           onchange="MenuPage.setBulk('value', this.value)">
                    <span class="ds-hint">${b.mode === 'pct' ? '% (ติดลบ = ลดราคา · ปัดเป็นบาทเต็ม)' : 'บาท (ติดลบ = ลดราคา)'}</span>
                </div>
            </div>
            <div class="cf-check-group"><span class="cf-check-label">แบบเสิร์ฟ</span>
                ${CF_SERVE_ORDER.map((k) => `<label class="cf-check"><input type="checkbox" ${b.serves.includes(k) ? 'checked' : ''}
                    onchange="MenuPage.setBulkServe('${k}', this.checked)"> ${e(CF_SERVE[k].label)}</label>`).join('')}
            </div>
            ${bad ? '<div class="ds-block">มีราคาที่ปรับแล้วเหลือ 0 หรือติดลบ — ลดจำนวนที่ปรับลง</div>' : ''}
            <div class="ds-section-label">ตัวอย่าง (${rows.length} ราคา)</div>
            <div class="table-responsive">
                <table class="data-table compact">
                    <thead><tr><th>สินค้า</th><th>แบบ</th><th class="cf-right">เดิม</th><th class="cf-right">ใหม่</th></tr></thead>
                    <tbody>${rows.slice(0, 40).map((r) => `<tr>
                        <td class="td-name">${e(r.name)}</td><td class="td-sub">${e(CF_SERVE[r.k].label)}</td>
                        <td class="cf-right cf-money">${CFApp.money(r.old)}</td>
                        <td class="cf-right cf-money" style="font-weight:700;${r.nu > 0 ? '' : 'color:var(--status-danger)'}">${CFApp.money(r.nu)}</td>
                    </tr>`).join('')}</tbody>
                </table>
            </div>
            ${rows.length > 40 ? `<div class="ds-note">และอีก ${rows.length - 40} ราคา</div>` : ''}
            <div class="ds-note">ปรับเฉพาะสินค้าที่แสดงในตารางตอนนี้ — อยากปรับเฉพาะหมวด ให้เลือกแท็บหมวดก่อนกดปุ่มนี้</div>`;
        const go = document.getElementById('bpGo');
        if (go) go.disabled = bad || !rows.length || !b.value;
        refreshIcons();
    },
    setBulk(k, v) { this._bp[k] = k === 'value' ? Number(v) || 0 : v; this.renderBulkPrice(); },
    setBulkServe(k, on) {
        const s = this._bp.serves;
        if (on && !s.includes(k)) s.push(k);
        if (!on) s.splice(s.indexOf(k), 1);
        this.renderBulkPrice();
    },
    async applyBulkPrice() {
        const b = this._bp;
        const ok = await Drawer.confirm({
            title: 'ปรับราคา?',
            message: `${b.ids.length} สินค้า · ${b.mode === 'pct' ? b.value + '%' : (b.value > 0 ? '+' : '') + b.value + ' บาท'}`,
            note: 'มีผลกับคีออสก์ทันที · ออเดอร์ที่สั่งไปแล้วไม่เปลี่ยน',
            confirmText: 'ปรับราคา', danger: false,
        });
        if (!ok) return;
        try {
            const r = await CFStore.cmd('post', '/api/products/bulk-price',
                { ids: b.ids, mode: b.mode, value: b.value, serveTypes: b.serves });
            showToast('ปรับแล้ว ' + r.changed + ' ราคา', 'success');
            Drawer.close();
        } catch (err) {
            showToast(err.message || 'ปรับราคาไม่สำเร็จ', 'error', 5000);
        }
    },

    /* ══════════════════════════════════════════════════════
       กลุ่มตัวเลือก — แก้ทุกอย่างของกลุ่มในที่เดียว
       ชื่อ · รูปแบบ · บังคับ · ใช้กับแบบเสิร์ฟ/หมวดไหน · ตัวเลือกในกลุ่ม
       เปิดได้ทั้งจากฟอร์มสินค้า (ซ้อน) และจากรายการกลุ่มทั้งหมด
       ฟอร์มเก็บใน this._gd — drawer ตัวเลือกเปิดซ้อนแล้วกลับมาวาดใหม่ได้โดยค่าที่พิมพ์ไม่หาย
       ══════════════════════════════════════════════════════ */
    openGroup(groupId) {
        if (Drawer.isOpen() && document.getElementById('fNameTh')) this.captureForm();   // มาจากฟอร์มสินค้า
        const g = groupId ? CFStore.byId('modifierGroups', groupId) : null;
        const rules = groupId ? CFStore.where('modifierRules', (r) => r.groupId === groupId) : [];
        this._gd = {
            id: g ? g.id : null,
            nameTh: g ? g.nameTh : '', nameEn: g ? g.nameEn || '' : '',
            type: g ? g.type : 'SINGLE', required: g ? !!g.required : false,
            maxSelect: g && g.maxSelect ? g.maxSelect : '', active: g ? g.active !== false : true,
            serves: rules.filter((r) => r.serveType).map((r) => r.serveType),
            cats: rules.filter((r) => r.categoryId).map((r) => r.categoryId),
        };
        Drawer.open({
            title: g ? 'กลุ่มตัวเลือก — ' + CFApp.esc(g.nameTh) : 'เพิ่มกลุ่มตัวเลือก',
            width: '640px',
            contentHtml: this.groupFormHtml(),
            footerHtml: `
                <button class="btn btn-outline" onclick="Drawer.close()">กลับ</button>
                <button class="btn btn-primary" onclick="MenuPage.saveGroup()">
                    <i data-lucide="save" class="icon-sm"></i> บันทึกกลุ่ม
                </button>`,
            onOpen: () => refreshIcons(),
            // ปิดแล้วกลับไปฟอร์มสินค้า/รายการกลุ่ม — วาดหน้านั้นใหม่ (setTimeout: รอ restore เสร็จก่อน)
            onClose: () => setTimeout(() => this.refreshUnder(), 0),
        });
    },

    /** หน้าที่อยู่ใต้ drawer ปัจจุบันหลังปิด — วาดใหม่ให้เห็นค่าล่าสุด */
    refreshUnder() {
        if (!Drawer.isOpen()) return;
        if (document.getElementById('fNameTh')) this.refreshForm();
        else if (document.getElementById('groupList')) this.renderGroupList();
        else if (document.getElementById('gName')) this.renderGroupForm();
        else if (document.getElementById('catList')) this.renderCatList();
    },

    renderGroupForm() {
        const body = document.querySelector('#drawerRoot .drawer-body');
        if (body && document.getElementById('gName')) { body.innerHTML = this.groupFormHtml(); refreshIcons(); }
    },

    groupFormHtml() {
        const e = CFApp.esc;
        const d = this._gd;
        const opts = d.id ? CFRules.optionsOf(d.id, true) : [];
        const tg = (id, on, label, fn) => `
            <button type="button" class="ds-toggle ${on ? 'is-on' : ''}" id="${id}" onclick="${fn}">
                <span class="ds-toggle-track"><span class="ds-toggle-knob"></span></span> ${label}</button>`;
        const chk = (kind, val, label, on) => `
            <label class="cf-check"><input type="checkbox" ${on ? 'checked' : ''}
                onchange="MenuPage.toggleRule('${kind}', '${e(val)}', this.checked)"> ${e(label)}</label>`;

        return `
            <div class="form-row">
                <div class="sip-field">
                    <label class="sip-label">ชื่อกลุ่ม (ไทย)</label>
                    <input class="sip-input" id="gName" value="${e(d.nameTh)}" placeholder="เช่น ระดับความหวาน"
                           oninput="MenuPage._gd.nameTh = this.value">
                </div>
                <div class="sip-field">
                    <label class="sip-label">ชื่อกลุ่ม (อังกฤษ)</label>
                    <input class="sip-input" id="gNameEn" value="${e(d.nameEn)}" placeholder="Sweetness"
                           oninput="MenuPage._gd.nameEn = this.value">
                </div>
            </div>
            <div class="sip-field">
                <label class="sip-label">รูปแบบการเลือก</label>
                <div class="ds-segbar">
                    <button type="button" class="ds-seg ${d.type === 'SINGLE' ? 'active' : ''}"
                            onclick="MenuPage.setGroupType('SINGLE')">เลือกได้ 1</button>
                    <button type="button" class="ds-seg ${d.type === 'MULTI' ? 'active' : ''}"
                            onclick="MenuPage.setGroupType('MULTI')">เลือกได้หลายอย่าง</button>
                </div>
            </div>
            ${d.type === 'MULTI' ? `<div class="sip-field">
                <label class="sip-label">เลือกได้สูงสุด (อย่าง)</label>
                <input class="sip-input" id="gMax" type="number" min="1" max="20" step="1" style="max-width:180px"
                       value="${e(d.maxSelect)}" placeholder="เว้นว่าง = ไม่จำกัด"
                       oninput="MenuPage._gd.maxSelect = this.value">
            </div>` : ''}
            <div class="cf-toggle-row">
                ${tg('gReq', d.required, 'บังคับให้เลือก', "MenuPage.flipGroup('required')")}
                ${tg('gActive', d.active, 'เปิดใช้งาน', "MenuPage.flipGroup('active')")}
            </div>

            <div class="ds-section-label">ใช้กับ</div>
            <div class="ds-note" style="margin-top:0">ลูกค้าเห็นกลุ่มนี้เมื่อสั่งแบบเสิร์ฟที่ติ๊ก <b>หรือ</b> สินค้าในหมวดที่ติ๊ก</div>
            <div class="cf-check-group"><span class="cf-check-label">แบบเสิร์ฟ</span>
                ${CF_SERVE_ORDER.map((k) => chk('serve', k, CF_SERVE[k].label, d.serves.includes(k))).join('')}
            </div>
            <div class="cf-check-group"><span class="cf-check-label">หมวด</span>
                ${CFStore.all('categories').map((c) => chk('cat', c.id, c.nameTh + (c.active === false ? ' (ปิด)' : ''), d.cats.includes(c.id))).join('')}
            </div>

            <div class="ds-section-label cf-section-flex">ตัวเลือกในกลุ่ม
                ${d.id ? `<button type="button" class="btn btn-outline btn-sm"
                    onclick="MenuPage.openOption()"><i data-lucide="plus" class="icon-sm"></i> เพิ่มตัวเลือก</button>` : ''}
            </div>
            ${!d.id ? '<div class="ds-note">บันทึกกลุ่มก่อน แล้วจึงเพิ่มตัวเลือกได้</div>' : opts.length ? `
            <div class="table-responsive">
                <table class="data-table compact">
                    <thead><tr><th></th><th>ชื่อ</th><th>ตัวย่อ</th><th class="cf-right">+ราคา</th><th></th><th></th></tr></thead>
                    <tbody>
                        ${opts.map((o, i) => `<tr class="${o.active === false ? 'cf-row-off' : ''}">
                            <td class="cf-nowrap">
                                <button class="ds-icon-btn" title="เลื่อนขึ้น" ${i ? '' : 'disabled'}
                                        onclick="MenuPage.moveOption('${o.id}', -1)"><i data-lucide="chevron-up"></i></button>
                                <button class="ds-icon-btn" title="เลื่อนลง" ${i < opts.length - 1 ? '' : 'disabled'}
                                        onclick="MenuPage.moveOption('${o.id}', 1)"><i data-lucide="chevron-down"></i></button>
                            </td>
                            <td class="td-name">${e(o.nameTh)}${o.nameEn ? `<div class="td-sub">${e(o.nameEn)}</div>` : ''}</td>
                            <td class="td-sub">${e(o.shortLabel || '')}</td>
                            <td class="cf-right cf-money">${o.priceDelta ? '+' + CFApp.money(o.priceDelta) : '—'}</td>
                            <td>${o.active === false ? '<span class="status-badge inactive">ปิดใช้งาน</span>'
                                : o.isDefault ? '<span class="sip-chip sip-chip-success">ค่าเริ่มต้น</span>' : ''}</td>
                            <td class="cf-nowrap"><button class="ds-icon-btn edit" title="แก้ไข"
                                onclick="MenuPage.openOption('${o.id}')"><i data-lucide="pencil"></i></button></td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>` : '<div class="ds-empty-sm">ยังไม่มีตัวเลือก — กด "เพิ่มตัวเลือก"</div>'}
            <div class="ds-note">ใบเสร็จและสลิปครัวพิมพ์ชื่อเต็มเสมอ — ตัวย่อใช้แค่ในรายการบนหน้าจอ ·
                ตัวเลือกที่ใช้ในบิลแล้วลบไม่ได้ ให้ปิดใช้งานแทน</div>`;
    },

    setGroupType(t) { this._gd.type = t; this.renderGroupForm(); },
    flipGroup(k) {
        this._gd[k] = !this._gd[k];
        document.getElementById(k === 'required' ? 'gReq' : 'gActive').classList.toggle('is-on', this._gd[k]);
    },
    toggleRule(kind, val, on) {
        const list = kind === 'serve' ? this._gd.serves : this._gd.cats;
        const i = list.indexOf(val);
        if (on && i < 0) list.push(val);
        if (!on && i >= 0) list.splice(i, 1);
    },

    async saveGroup() {
        const d = this._gd;
        const name = (d.nameTh || '').trim();
        if (!name) { showToast('ต้องระบุชื่อกลุ่ม', 'error'); return; }
        const maxRaw = String(d.maxSelect || '').trim();
        const maxSelect = d.type !== 'MULTI' || maxRaw === '' ? 0 : Number(maxRaw);
        if (!Number.isInteger(maxSelect) || maxSelect < 0 || maxSelect > 20) {
            showToast('เลือกได้สูงสุดต้องเป็นเลข 1–20 หรือเว้นว่าง', 'error'); return;
        }
        if (!d.serves.length && !d.cats.length && d.active) {
            const ok = await Drawer.confirm({
                title: 'กลุ่มนี้ยังไม่ได้ใช้กับอะไร',
                message: 'ไม่ได้ติ๊กแบบเสิร์ฟหรือหมวดเลย ลูกค้าจะไม่เห็นกลุ่มนี้ที่คีออสก์',
                confirmText: 'บันทึกต่อ', cancelText: 'กลับไปติ๊ก', danger: false,
            });
            if (!ok) return;
        }
        const body = { nameTh: name, nameEn: (d.nameEn || '').trim(), type: d.type,
                       required: d.required, maxSelect, active: d.active };
        try {
            let id = d.id;
            if (id) await CFApi.patch('/api/modifier-groups/' + encodeURIComponent(id), body);
            else id = (await CFApi.post('/api/modifier-groups', body)).id;
            await CFStore.cmd('put', '/api/modifier-groups/' + encodeURIComponent(id) + '/rules',
                { serveTypes: d.serves, categoryIds: d.cats });
            if (!d.id) {
                // กลุ่มใหม่ — อยู่หน้าเดิมต่อ เพื่อเพิ่มตัวเลือกได้ทันที
                d.id = id;
                Drawer.setTitle('กลุ่มตัวเลือก — ' + CFApp.esc(name));
                this.renderGroupForm();
                showToast('สร้างกลุ่มแล้ว — เพิ่มตัวเลือกได้เลย', 'success');
                return;
            }
            showToast('บันทึกกลุ่มตัวเลือกแล้ว', 'success');
            Drawer.close();
        } catch (err) {
            showToast(err.message || 'บันทึกไม่สำเร็จ', 'error', 4000);
        }
    },

    /* ── ตัวเลือกหนึ่งตัว (drawer ซ้อนบนกลุ่ม) ── */
    openOption(optionId) {
        const g = CFStore.byId('modifierGroups', this._gd.id);
        const o = optionId ? CFStore.byId('modifierOptions', optionId) : null;
        this._od = {
            id: o ? o.id : null, single: !!g && g.type === 'SINGLE',
            isDefault: o ? !!o.isDefault : false, active: o ? o.active !== false : true,
        };
        const e = CFApp.esc;
        const field = (id, label, value, extra) => `
            <div class="sip-field"><label class="sip-label">${label}</label>
                <input class="sip-input" id="${id}" value="${e(value == null ? '' : value)}" ${extra || ''}></div>`;
        Drawer.open({
            title: o ? 'แก้ไขตัวเลือก — ' + e(o.nameTh) : 'เพิ่มตัวเลือกใน ' + e(g ? g.nameTh : ''),
            width: '480px',
            contentHtml: `
                ${field('oName', 'ชื่อ (ไทย)', o && o.nameTh, 'placeholder="เช่น หวานน้อย 50%"')}
                ${field('oNameEn', 'ชื่อ (อังกฤษ) — คีออสก์โหมดภาษาอังกฤษ', o && o.nameEn, 'placeholder="Less sweet 50%"')}
                ${field('oShort', 'ตัวย่อบนหน้าจอ (ไม่บังคับ · ใบเสร็จพิมพ์ชื่อเต็ม)', o && o.shortLabel, 'maxlength="24" placeholder="ห.50%"')}
                ${field('oPrice', 'ราคาเพิ่ม (บาท)', o ? o.priceDelta : 0, 'type="number" min="0" step="1"')}
                <div class="cf-toggle-row">
                    ${this._od.single ? `<button type="button" class="ds-toggle ${this._od.isDefault ? 'is-on' : ''}" id="oDef"
                        onclick="MenuPage.flipOption('isDefault', 'oDef')"><span class="ds-toggle-track"><span class="ds-toggle-knob"></span></span>
                        ค่าเริ่มต้น</button>` : ''}
                    <button type="button" class="ds-toggle ${this._od.active ? 'is-on' : ''}" id="oAct"
                        onclick="MenuPage.flipOption('active', 'oAct')"><span class="ds-toggle-track"><span class="ds-toggle-knob"></span></span>
                        เปิดใช้งาน</button>
                </div>
                <div class="ds-note">${this._od.single
                    ? 'ค่าเริ่มต้น = คีออสก์เลือกให้ก่อน (กลุ่มหนึ่งมีได้ตัวเดียว) · '
                    : ''}ปิดใช้งาน = ลูกค้าไม่เห็น แต่บิลเก่ายังอ่านชื่อได้</div>`,
            footerHtml: `
                <button class="btn btn-outline" onclick="Drawer.close()">กลับ</button>
                <button class="btn btn-primary" onclick="MenuPage.saveOption()">
                    <i data-lucide="save" class="icon-sm"></i> บันทึกตัวเลือก</button>`,
            onOpen: () => { refreshIcons(); const n = document.getElementById('oName'); if (n && !o) n.focus(); },
            onClose: () => setTimeout(() => this.refreshUnder(), 0),
        });
    },
    flipOption(k, elId) {
        this._od[k] = !this._od[k];
        document.getElementById(elId).classList.toggle('is-on', this._od[k]);
    },
    async saveOption() {
        const v = (id) => (document.getElementById(id).value || '').trim();
        const body = { nameTh: v('oName'), nameEn: v('oNameEn'), shortLabel: v('oShort'),
                       priceDelta: Number(v('oPrice') || 0), isDefault: this._od.isDefault, active: this._od.active };
        if (!body.nameTh) { showToast('ต้องระบุชื่อตัวเลือก', 'error'); return; }
        if (!(body.priceDelta >= 0)) { showToast('ราคาเพิ่มต้องเป็น 0 ขึ้นไป', 'error'); return; }
        try {
            if (this._od.id) await CFStore.cmd('patch', '/api/modifier-options/' + encodeURIComponent(this._od.id), body);
            else await CFStore.cmd('post', '/api/modifier-groups/' + encodeURIComponent(this._gd.id) + '/options', body);
            showToast('บันทึกตัวเลือกแล้ว', 'success');
            Drawer.close();
        } catch (err) {
            showToast(err.message || 'บันทึกไม่สำเร็จ', 'error', 4000);
        }
    },
    /** เลื่อนลำดับ — สลับกับตัวข้างเคียง แล้วเรียงเลขใหม่ 1..n (ข้อมูลเก่าอาจมี sort ซ้ำ) */
    async moveOption(id, dir) {
        const opts = CFRules.optionsOf(this._gd.id, true);
        const i = opts.findIndex((o) => o.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= opts.length) return;
        const order = opts.map((o) => o.id);
        [order[i], order[j]] = [order[j], order[i]];
        try {
            for (let k = 0; k < order.length; k++) {
                const o = opts.find((x) => x.id === order[k]);
                if (o.sort !== k + 1) await CFApi.patch('/api/modifier-options/' + encodeURIComponent(o.id), { sort: k + 1 });
            }
            await CFStore.refresh();
            this.renderGroupForm();
        } catch (err) {
            showToast(err.message || 'เลื่อนไม่สำเร็จ', 'error', 4000);
        }
    },

    /* ── รายการกลุ่มตัวเลือกทั้งหมด (#groups จากเมนู) ── */
    openGroups() {
        Drawer.open({
            title: 'กลุ่มตัวเลือก',
            width: '760px',
            contentHtml: '<div id="groupList"></div>',
            footerHtml: `
                <button class="btn btn-outline" onclick="Drawer.close()">ปิด</button>
                <button class="btn btn-primary" onclick="MenuPage.openGroup()">
                    <i data-lucide="plus" class="icon-sm"></i> เพิ่มกลุ่มตัวเลือก</button>`,
            onOpen: () => this.renderGroupList(),
        });
    },

    renderGroupList() {
        const el = document.getElementById('groupList');
        if (!el) return;
        const e = CFApp.esc;
        const rows = CFStore.all('modifierGroups').slice().sort((a, b) => (a.sort || 0) - (b.sort || 0)).map((g) => {
            const opts = CFRules.optionsOf(g.id);
            const rules = CFStore.where('modifierRules', (r) => r.groupId === g.id);
            const applies = rules.map((r) => r.serveType
                ? CF_SERVE[r.serveType].label
                : 'หมวด' + ((CFStore.byId('categories', r.categoryId) || {}).nameTh || '?'));
            return `<tr class="cf-row-click ${g.active === false ? 'cf-row-off' : ''}" onclick="MenuPage.openGroup('${g.id}')">
                <td class="td-name">${e(g.nameTh)}${g.active === false ? ' <span class="status-badge inactive">ปิดใช้งาน</span>' : ''}
                    <div class="td-sub">${opts.map((o) => e(o.shortLabel || o.nameTh)).join(' · ') || 'ยังไม่มีตัวเลือก'}</div></td>
                <td class="td-sub cf-nowrap">${g.type === 'SINGLE' ? 'เลือกได้ 1' : g.maxSelect ? 'สูงสุด ' + g.maxSelect : 'หลายอย่าง'}${g.required ? ' · บังคับ' : ''}</td>
                <td class="td-sub">${e(applies.join(', ')) || '<span style="color:var(--status-danger)">ยังไม่ได้ใช้กับอะไร</span>'}</td>
                <td><i data-lucide="chevron-right" class="icon-sm"></i></td>
            </tr>`;
        }).join('');
        el.innerHTML = `
            <div class="sip-banner sip-banner-info" style="margin-bottom:12px">
                <i data-lucide="info" class="icon-sm"></i>
                ตัวเลือกผูกกับ "แบบเสิร์ฟ" และ "หมวด" ไม่ได้ผูกกับสินค้าทีละตัว — กดที่แถวเพื่อแก้ไข
            </div>
            <div class="table-responsive">
                <table class="data-table compact">
                    <thead><tr><th>กลุ่ม / ตัวเลือก</th><th>รูปแบบ</th><th>ใช้กับ</th><th></th></tr></thead>
                    <tbody>${rows || '<tr><td colspan="4"><div class="ds-empty-sm">ยังไม่มีกลุ่มตัวเลือก</div></td></tr>'}</tbody>
                </table>
            </div>`;
        refreshIcons();
    },

    /* ══════════════════════════════════════════════════════
       หมวดหมู่ — เพิ่ม · แก้ชื่อ · เรียงลำดับ · ปิดใช้งาน · ลบ (เฉพาะหมวดว่าง)
       ══════════════════════════════════════════════════════ */
    openCategories() {
        Drawer.open({
            title: 'หมวดหมู่สินค้า',
            width: '640px',
            contentHtml: '<div id="catList"></div>',
            footerHtml: `
                <button class="btn btn-outline" onclick="Drawer.close()">ปิด</button>
                <button class="btn btn-primary" onclick="MenuPage.openCategory()">
                    <i data-lucide="plus" class="icon-sm"></i> เพิ่มหมวด</button>`,
            onOpen: () => this.renderCatList(),
        });
    },

    renderCatList() {
        const el = document.getElementById('catList');
        if (!el) return;
        const e = CFApp.esc;
        const cats = CFStore.all('categories').slice().sort((a, b) => a.sort - b.sort);
        const count = (id) => CFStore.where('products', (p) => p.categoryId === id).length;
        el.innerHTML = `
            <div class="table-responsive">
                <table class="data-table compact">
                    <thead><tr><th></th><th>หมวด</th><th class="cf-right">สินค้า</th><th>สถานะ</th><th></th></tr></thead>
                    <tbody>${cats.map((c, i) => `<tr class="${c.active === false ? 'cf-row-off' : ''}">
                        <td class="cf-nowrap">
                            <button class="ds-icon-btn" title="เลื่อนขึ้น" ${i ? '' : 'disabled'}
                                    onclick="MenuPage.moveCategory('${c.id}', -1)"><i data-lucide="chevron-up"></i></button>
                            <button class="ds-icon-btn" title="เลื่อนลง" ${i < cats.length - 1 ? '' : 'disabled'}
                                    onclick="MenuPage.moveCategory('${c.id}', 1)"><i data-lucide="chevron-down"></i></button>
                        </td>
                        <td class="td-name">${e(c.nameTh)}${c.nameEn ? `<div class="td-sub">${e(c.nameEn)}</div>` : ''}</td>
                        <td class="cf-right">${count(c.id)}</td>
                        <td>${c.active === false ? '<span class="status-badge inactive">ปิดใช้งาน</span>' : '<span class="status-badge active">ใช้งาน</span>'}</td>
                        <td class="cf-nowrap">
                            <button class="ds-icon-btn edit" title="แก้ไข" onclick="MenuPage.openCategory('${c.id}')"><i data-lucide="pencil"></i></button>
                            ${count(c.id) ? '' : `<button class="ds-icon-btn delete" title="ลบ" onclick="MenuPage.deleteCategory('${c.id}')"><i data-lucide="trash-2"></i></button>`}
                        </td>
                    </tr>`).join('')}</tbody>
                </table>
            </div>
            <div class="ds-note">ลำดับนี้คือลำดับแท็บหมวดบนคีออสก์ · ปิดใช้งาน = หมวดและสินค้าในหมวดหายจากคีออสก์ ·
                ลบได้เฉพาะหมวดที่ไม่มีสินค้า</div>`;
        refreshIcons();
    },

    openCategory(id) {
        const c = id ? CFStore.byId('categories', id) : null;
        this._cd = { id: c ? c.id : null, active: c ? c.active !== false : true };
        const e = CFApp.esc;
        Drawer.open({
            title: c ? 'แก้ไขหมวด — ' + e(c.nameTh) : 'เพิ่มหมวด',
            width: '440px',
            contentHtml: `
                <div class="sip-field"><label class="sip-label">ชื่อหมวด (ไทย)</label>
                    <input class="sip-input" id="cName" value="${e(c ? c.nameTh : '')}" placeholder="เช่น ชาผลไม้"></div>
                <div class="sip-field"><label class="sip-label">ชื่อหมวด (อังกฤษ)</label>
                    <input class="sip-input" id="cNameEn" value="${e(c ? c.nameEn || '' : '')}" placeholder="Fruit tea"></div>
                ${c ? `<div class="cf-toggle-row"><button type="button" class="ds-toggle ${this._cd.active ? 'is-on' : ''}" id="cAct"
                    onclick="MenuPage._cd.active = !MenuPage._cd.active; this.classList.toggle('is-on', MenuPage._cd.active)">
                    <span class="ds-toggle-track"><span class="ds-toggle-knob"></span></span> เปิดใช้งาน</button></div>` : ''}
                <div class="ds-note">หมวดใหม่ต่อท้ายสุด เลื่อนลำดับได้ในรายการหมวด ·
                    ตัวเลือก (เช่น เมล็ดกาแฟ) ผูกกับหมวดได้ที่หน้า "กลุ่มตัวเลือก"</div>`,
            footerHtml: `
                <button class="btn btn-outline" onclick="Drawer.close()">กลับ</button>
                <button class="btn btn-primary" onclick="MenuPage.saveCategory()">
                    <i data-lucide="save" class="icon-sm"></i> บันทึกหมวด</button>`,
            onOpen: () => { const n = document.getElementById('cName'); if (n && !c) n.focus(); refreshIcons(); },
            onClose: () => setTimeout(() => this.refreshUnder(), 0),
        });
    },

    async saveCategory() {
        const v = (id) => (document.getElementById(id).value || '').trim();
        const body = { nameTh: v('cName'), nameEn: v('cNameEn') };
        if (!body.nameTh) { showToast('ต้องระบุชื่อหมวด', 'error'); return; }
        const d = this._cd;
        if (d.id) {
            body.active = d.active;
            const cur = CFStore.byId('categories', d.id);
            const live = CFStore.where('products', (p) => p.categoryId === d.id && p.active).length;
            if (cur.active !== false && !d.active && live) {
                const ok = await Drawer.confirm({
                    title: 'ปิดใช้งานหมวดนี้?',
                    message: `สินค้าที่เปิดขายในหมวดนี้ ${live} รายการจะหายจากคีออสก์ด้วย`,
                    confirmText: 'ปิดใช้งาน', danger: true,
                });
                if (!ok) return;
            }
        }
        try {
            await CFStore.cmd(d.id ? 'patch' : 'post',
                d.id ? '/api/categories/' + encodeURIComponent(d.id) : '/api/categories', body);
            showToast(d.id ? 'บันทึกหมวดแล้ว' : 'เพิ่มหมวดแล้ว', 'success');
            Drawer.close();
        } catch (err) {
            showToast(err.message || 'บันทึกไม่สำเร็จ', 'error', 4000);
        }
    },

    async moveCategory(id, dir) {
        const cats = CFStore.all('categories').slice().sort((a, b) => a.sort - b.sort);
        const i = cats.findIndex((c) => c.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= cats.length) return;
        const order = cats.map((c) => c.id);
        [order[i], order[j]] = [order[j], order[i]];
        try {
            for (let k = 0; k < order.length; k++) {
                const c = cats.find((x) => x.id === order[k]);
                if (c.sort !== (k + 1) * 10) await CFApi.patch('/api/categories/' + encodeURIComponent(c.id), { sort: (k + 1) * 10 });
            }
            await CFStore.refresh();
            this.renderCatList();
        } catch (err) {
            showToast(err.message || 'เลื่อนไม่สำเร็จ', 'error', 4000);
        }
    },

    async deleteCategory(id) {
        const c = CFStore.byId('categories', id);
        const ok = await Drawer.confirm({
            title: 'ลบหมวดนี้?', message: c.nameTh,
            note: 'หมวดนี้ไม่มีสินค้า ลบได้เลย · กฎตัวเลือกที่ผูกกับหมวดนี้จะถูกลบด้วย',
            confirmText: 'ลบหมวด', danger: true,
        });
        if (!ok) return;
        try {
            await CFStore.cmd('delete', '/api/categories/' + encodeURIComponent(id), {});
            showToast('ลบหมวดแล้ว', 'success');
            this.renderCatList();
        } catch (err) {
            showToast(err.message || 'ลบไม่สำเร็จ', 'error', 4000);
        }
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
            descriptionTh: d.descriptionTh || '', descriptionEn: d.descriptionEn || '',
            availFrom: d.availFrom || null, availTo: d.availTo || null,
            stockQty: d.stockQty == null ? null : d.stockQty,
        };
        // ต้นทุนส่งเฉพาะคนที่เห็นต้นทุน — คนอื่นไม่ส่ง เซิร์ฟเวอร์คงของเดิมไว้
        if (CFAuth.can('PRICE_EDIT')) body.costs = d.costs || {};
        if ((body.availFrom == null) !== (body.availTo == null) || (body.availFrom && body.availFrom === body.availTo)) {
            showToast('ใส่เวลาเริ่มและเวลาเลิกขายให้ครบ (และต้องไม่เท่ากัน)', 'error'); return;
        }
        // เติมสต็อกแล้วตัว "หมด" ที่ค้างจากของหมด ปลดให้เลย — คนเติมของไม่ต้องไปกดอีกสวิตช์
        if (body.stockQty > 0 && d.id) {
            const cur = CFStore.byId('products', d.id);
            if (cur && cur.stockQty === 0 && body.soldOut) body.soldOut = false;
        }
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

    boot() {
        CFApp.boot({ page: 'menu' });
        CFKioskArt.mount();      // พรีวิวรูปสินค้าต้องใช้ sprite ตัวเดียวกับคีออสก์
        this.render();
        CFStore.subscribe(() => this.render());
        if (location.hash === '#groups') setTimeout(() => this.openGroups(), 250);
        if (location.hash === '#categories') setTimeout(() => this.openCategories(), 250);
    },
};

window.MenuPage = MenuPage;
CFBoot.ready(() => MenuPage.boot());
