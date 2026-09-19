/**
 * CafeFlow — โมเดลราคา
 * ------------------------------------------------------------
 * สูตรคิดราคาชุดเดียวของทั้งระบบ ถ้าเบราว์เซอร์กับเซิร์ฟเวอร์คิดคนละแบบเมื่อไหร่
 * ราคาที่ลูกค้าเห็นกับที่ร้านเก็บเงินจะไม่ตรงกัน — นั่นคือบั๊กที่ลูกค้าจับได้ก่อนเรา
 *
 * **สินค้าเก็บราคาเป็น sparse map `prices: {HOT:50, ICED:50}`
 *   คีย์ที่ไม่มี = ไม่มีขายแบบนั้น ('–' บนป้ายหน้าร้าน) ซึ่งต่างจากราคา 0**
 *
 * ⚠️ ตรรกะบริสุทธิ์เท่านั้น — ห้ามอ้าง window / CFStore / fetch
 */
(function (root, factory) {
    const m = factory();
    if (typeof module === 'object' && module.exports) module.exports = m;
    else Object.keys(m).forEach((k) => { root[k] = m[k]; });
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const ORDER = ['HOT', 'ICED', 'FRAPPE', 'STD'];

    /** แบบเสิร์ฟที่สินค้านี้มีขายจริง เรียงตามลำดับบนป้าย */
    function serveTypesOf(product) {
        if (!product || !product.prices) return [];
        return ORDER.filter((k) => product.prices[k] != null);
    }

    /**
     * ทางเดียวที่อ่านราคาสินค้า — ห้ามอ่าน product.price ตรง ๆ ที่ไหนอีก
     * คืน null เมื่อแบบเสิร์ฟนั้นไม่มีขาย ซึ่งต่างจากราคา 0
     */
    function priceOf(product, serveType) {
        if (!product || !product.prices) return null;
        if (serveType && product.prices[serveType] != null) return product.prices[serveType];
        if (serveType) return null;
        const first = serveTypesOf(product)[0];
        return first ? product.prices[first] : null;
    }

    /** ราคาต่ำสุดของสินค้า — ใช้แสดง "เริ่มต้น ฿xx" บนการ์ดคีออสก์ */
    function minPriceOf(product) {
        const vals = serveTypesOf(product).map((k) => product.prices[k]);
        return vals.length ? Math.min.apply(null, vals) : 0;
    }

    /** ราคาต่อหน่วยหลังรวมส่วนเพิ่มของตัวเลือก */
    function unitPriceOf(product, serveType, mods) {
        const base = priceOf(product, serveType);
        if (base == null) return null;
        return base + (mods || []).reduce((s, m) => s + (m.priceDelta || 0), 0);
    }

    /** ยอดของหนึ่งบรรทัดในตะกร้า/ออเดอร์ */
    function lineTotal(product, serveType, mods, qty) {
        const unit = unitPriceOf(product, serveType, mods);
        return unit == null ? 0 : unit * (qty || 1);
    }

    /** ยอดรวมทั้งตะกร้า — lines = [{product, serveType, mods, qty}] */
    function cartTotal(lines) {
        return (lines || []).reduce(
            (s, l) => s + lineTotal(l.product, l.serveType, l.mods, l.qty), 0);
    }

    // ส่งออกเป็นก้อนเดียวชื่อ CFPricing — ชื่อสั้น ๆ อย่าง priceOf ถ้าหลุดเป็น
    // global ในเบราว์เซอร์มีโอกาสชนกับสคริปต์อื่นสูงเกินไป
    return { CFPricing: { serveTypesOf, priceOf, minPriceOf, unitPriceOf, lineTotal, cartTotal } };
});
