/**
 * CafeFlow — กฎตัวเลือกสินค้า (§11)
 * ------------------------------------------------------------
 * ผูกกับ "แบบเสิร์ฟ" และ "หมวด" ไม่ใช่ hard-code ต่อสินค้า
 * ทั้งหน้าจัดการเมนู หน้าคีออสก์ และเซิร์ฟเวอร์ต้องใช้ชุดเดียวกัน
 * ถ้าสองที่คิดกฎต่างกันเมื่อไหร่ ตัวเลือกที่ลูกค้าเห็นกับที่ร้านตั้งจะไม่ตรงกัน
 *
 * ⚠️ รุ่นนี้เป็น pure — รับ `data` เข้ามาแทนการอ่าน CFStore ตรง ๆ
 *    เพราะเซิร์ฟเวอร์ไม่มี CFStore · ฝั่งเบราว์เซอร์มี adapter ใน cf-app.js
 *    ที่ฉีด CFStore.db ให้ ลายเซ็นที่หน้าเว็บเรียกอยู่จึงไม่เปลี่ยน
 *
 *    data = { modifierRules, modifierGroups, modifierOptions }  (array ทั้งสามตัว)
 */
(function (root, factory) {
    const m = factory();
    if (typeof module === 'object' && module.exports) module.exports = m;
    else Object.keys(m).forEach((k) => { root[k] = m[k]; });
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const arr = (x) => (Array.isArray(x) ? x : []);

    /** กลุ่มตัวเลือกที่ต้องแสดง สำหรับสินค้า + แบบเสิร์ฟหนึ่ง ๆ */
    function groupsFor(serveType, categoryId, data) {
        data = data || {};
        const groups = arr(data.modifierGroups);
        const seen = {};
        return arr(data.modifierRules)
            .filter((r) => (r.serveType && r.serveType === serveType) ||
                           (r.categoryId && r.categoryId === categoryId))
            .sort((a, b) => a.sort - b.sort)
            .map((r) => groups.find((g) => g.id === r.groupId))
            .filter((g) => {
                if (!g || seen[g.id]) return false;
                seen[g.id] = true;
                return true;
            });
    }

    /** กลุ่มที่ถูกกฎซ่อน — ใช้อธิบายให้ผู้ใช้เห็นว่ามี rule engine อยู่จริง */
    function hiddenFor(serveType, categoryId, data) {
        const shown = {};
        groupsFor(serveType, categoryId, data).forEach((g) => { shown[g.id] = true; });
        return arr((data || {}).modifierGroups).filter((g) => !shown[g.id]);
    }

    function optionsOf(groupId, data) {
        return arr((data || {}).modifierOptions)
            .filter((o) => o.groupId === groupId)
            .sort((a, b) => a.sort - b.sort);
    }

    /** ตัวเลือกเริ่มต้นของสินค้า + แบบเสิร์ฟ — คีออสก์ใช้ตั้งค่าเริ่มต้นให้ลูกค้า */
    function defaultsFor(serveType, categoryId, data) {
        const out = [];
        groupsFor(serveType, categoryId, data).forEach((g) => {
            if (g.type !== 'SINGLE') return;
            const d = optionsOf(g.id, data).find((o) => o.isDefault);
            if (d) {
                out.push({
                    groupId: g.id, optionId: d.id, label: d.nameTh,
                    shortLabel: d.shortLabel, priceDelta: d.priceDelta,
                });
            }
        });
        return out;
    }

    /**
     * ตรวจว่าตัวเลือกที่ส่งมาถูกกฎไหม — เซิร์ฟเวอร์ใช้ตอนรับออเดอร์
     * คืน array ของข้อความปัญหา (ว่าง = ผ่าน)
     */
    function validate(serveType, categoryId, mods, data) {
        const problems = [];
        const groups = groupsFor(serveType, categoryId, data);
        const allowed = {};
        groups.forEach((g) => { optionsOf(g.id, data).forEach((o) => { allowed[o.id] = g; }); });

        arr(mods).forEach((m) => {
            if (!allowed[m.optionId]) problems.push('ตัวเลือก "' + (m.label || m.optionId) + '" ไม่ถูกกฎของสินค้านี้');
        });
        groups.forEach((g) => {
            const picked = arr(mods).filter((m) => m.groupId === g.id);
            if (g.required && picked.length === 0) problems.push('ต้องเลือก "' + g.nameTh + '"');
            if (g.type === 'SINGLE' && picked.length > 1) problems.push('"' + g.nameTh + '" เลือกได้อย่างเดียว');
        });
        return problems;
    }

    return { CFRulesCore: { groupsFor, hiddenFor, optionsOf, defaultsFor, validate } };
});
