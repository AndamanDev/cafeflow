/**
 * CafeFlow — KPI / AGGREGATION (§25, §26, §27)
 * ------------------------------------------------------------
 * ที่เดียวที่รวมยอด เพื่อให้ dashboard · cashier · closing
 * ได้ตัวเลขชุดเดียวกันเสมอ ไม่ใช่ต่างหน้าต่างคำนวณ
 */

/** สถานะที่ถือว่า "ขายแล้ว" — จ่ายเงินเรียบร้อยและยังไม่ถูกคืน */
const CF_SOLD = ['PAID', 'SENT_TO_KITCHEN', 'PREPARING', 'READY', 'SERVED', 'COMPLETED'];
/** สถานะที่ยังอยู่ในสายการผลิต */
const CF_IN_PROGRESS = ['SENT_TO_KITCHEN', 'PREPARING'];
/** สถานะที่รอการชำระ */
const CF_WAITING_PAY = ['WAITING_CASH', 'WAITING_PAYMENT', 'PAYMENT_TIMEOUT', 'PAYMENT_REVIEW'];

const CFKpi = {

    /**
     * รายงานที่เซิร์ฟเวอร์คิดมาให้ (มากับ snapshot)
     * คืน null เมื่อไม่มี หรือเมื่อถามถึงรอบอื่นที่ไม่ใช่รอบในรายงาน
     *
     * ★ ต้องใช้ตัวนี้ก่อนเสมอเมื่อมี เพราะเบราว์เซอร์ cache ออเดอร์ไว้แค่ 24 ชั่วโมง
     *   การคำนวณเองจึงถูกเฉพาะ "หน้างานวันนี้" ส่วนรอบที่ยาวกว่านั้นจะขาดไปเงียบ ๆ
     */
    _report(shiftId) {
        const r = CFStore.db && CFStore.db.reports;
        if (!r) return null;
        if (shiftId && r.shiftId !== shiftId) return null;
        return r;
    },

    /** ออเดอร์ในขอบเขตที่สนใจ — ค่าเริ่มต้นคือรอบที่เปิดอยู่ ถ้าไม่มีก็ทั้งวันนี้ */
    scope(shiftId) {
        const all = CFStore.all('orders');
        if (shiftId) return all.filter((o) => o.shiftId === shiftId);
        const shift = CFStore.openShift();
        if (shift) return all.filter((o) => o.shiftId === shift.id);
        return CFApp.todayOrders();
    },

    /* ══════════════════════════════════════════════════════
       §25 / §26 — ตัวเลขหลัก
       ══════════════════════════════════════════════════════ */
    summary(shiftId) {
        const rep = this._report(shiftId);
        if (rep && rep.summary) return rep.summary;

        const orders = this.scope(shiftId);
        const sold = orders.filter((o) => CF_SOLD.includes(o.status));

        const sales = sold.reduce((s, o) => s + o.total, 0);
        const cash  = sold.filter((o) => o.paymentMethod === 'CASH').reduce((s, o) => s + o.total, 0);
        const qr    = sold.filter((o) => o.paymentMethod === 'QR').reduce((s, o) => s + o.total, 0);

        const cancelled = orders.filter((o) => ['CANCELLED', 'VOIDED'].includes(o.status));
        const refunded  = orders.filter((o) => o.status === 'REFUNDED');

        return {
            sales, cash, qr,
            orderCount: sold.length,
            avgOrder: sold.length ? sales / sold.length : 0,

            cancelledCount:  cancelled.length,
            cancelledAmount: cancelled.reduce((s, o) => s + o.total, 0),
            refundedCount:   refunded.length,
            refundedAmount:  refunded.reduce((s, o) => s + o.total, 0),

            waitingPay: orders.filter((o) => CF_WAITING_PAY.includes(o.status)).length,
            waitingCash: orders.filter((o) => o.status === 'WAITING_CASH').length,
            paymentReview: orders.filter((o) => ['PAYMENT_REVIEW', 'PAYMENT_TIMEOUT'].includes(o.status)).length,
            preparing: orders.filter((o) => CF_IN_PROGRESS.includes(o.status)).length,
            ready: orders.filter((o) => o.status === 'READY').length,

            // เวลารอชำระ = ตั้งแต่สร้างออเดอร์จนจ่ายเงินเสร็จ
            avgWaitSec: this._avgGap(sold, (o) => o.createdAt, (o) => o.ts && o.ts.paidAt),
            // เวลาจัดเตรียม = ตั้งแต่เข้าครัวจนพร้อมรับ
            avgPrepSec: this._avgGap(sold, (o) => o.ts && o.ts.sentAt, (o) => o.ts && o.ts.readyAt),
            throughput: this._throughput(sold),
        };
    },

    /** ค่าเฉลี่ยของช่วงเวลา (วินาที) — ข้ามรายการที่ยังไม่มีปลายทางทั้งสองฝั่ง */
    _avgGap(list, fromFn, toFn) {
        const gaps = list
            .map((o) => {
                const a = fromFn(o), b = toFn(o);
                return (a && b) ? (new Date(b) - new Date(a)) / 1000 : null;
            })
            .filter((x) => x != null && x >= 0);
        if (!gaps.length) return 0;
        return gaps.reduce((s, x) => s + x, 0) / gaps.length;
    },

    /** ออเดอร์ต่อชั่วโมง คิดจากช่วงเวลาที่มีการขายจริง */
    _throughput(sold) {
        if (sold.length < 2) return sold.length;
        const times = sold.map((o) => new Date(o.createdAt).getTime());
        const hours = (Math.max(...times) - Math.min(...times)) / 3600000;
        return hours > 0.1 ? sold.length / hours : sold.length;
    },

    /** mm:ss จากวินาที — ใช้แสดงเวลารอ/เวลาทำ */
    fmtSec(sec) {
        sec = Math.round(sec || 0);
        return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
    },

    /* ══════════════════════════════════════════════════════
       §25 — ภาระงานแต่ละสถานี
       ══════════════════════════════════════════════════════ */
    stationLoad() {
        const rep = this._report();
        if (rep && rep.stationLoad) return rep.stationLoad;

        const active = CFStore.all('orders').filter((o) => CF_IN_PROGRESS.includes(o.status));
        const load = {};
        Object.keys(CF_STATIONS).forEach((s) => { load[s] = 0; });
        active.forEach((o) => {
            Object.keys(o.stationStatus || {}).forEach((s) => {
                if (o.stationStatus[s] !== 'READY' && load[s] != null) load[s]++;
            });
        });
        const max = Math.max(1, ...Object.values(load));
        return Object.keys(load).map((s) => ({ station: s, count: load[s], pct: Math.round((load[s] / max) * 100) }));
    },

    /** ตั๋วที่ค้างอยู่ที่สถานีหนึ่ง — หัวใจของหน้า KDS */
    queueFor(station) {
        return CFStore.all('orders')
            .filter((o) => CF_IN_PROGRESS.includes(o.status) &&
                           o.stationStatus && o.stationStatus[station] &&
                           o.stationStatus[station] !== 'READY')
            .sort((a, b) => new Date(a.ts.sentAt || a.createdAt) - new Date(b.ts.sentAt || b.createdAt));
    },

    stationCounts() {
        const out = {};
        Object.keys(CF_STATIONS).forEach((s) => { out[s] = this.queueFor(s).length; });
        return out;
    },

    /* ══════════════════════════════════════════════════════
       §10 — สินค้าหมด
       ══════════════════════════════════════════════════════ */
    soldOutProducts() { return CFStore.all('products').filter((p) => p.active && p.soldOut); },

    /** สินค้าขายดี — ใช้ในใบปิดรอบ */
    topProducts(shiftId, limit) {
        const rep = this._report(shiftId);
        if (rep && rep.topProducts) return rep.topProducts.slice(0, limit || 8);

        const ids = new Set(this.scope(shiftId).filter((o) => CF_SOLD.includes(o.status)).map((o) => o.id));
        const acc = {};
        CFStore.all('orderItems').filter((i) => ids.has(i.orderId)).forEach((i) => {
            const k = i.productId;
            if (!acc[k]) acc[k] = { productId: k, name: i.nameSnapshot, qty: 0, amount: 0 };
            acc[k].qty += i.qty;
            acc[k].amount += i.unitPrice * i.qty;
        });
        return Object.values(acc).sort((a, b) => b.qty - a.qty).slice(0, limit || 8);
    },

    /* ══════════════════════════════════════════════════════
       §27 — การควบคุมเงินสด
       ══════════════════════════════════════════════════════ */
    cashControl(shiftId) {
        const shift = shiftId ? CFStore.byId('shifts', shiftId) : CFStore.openShift();
        if (!shift) return null;

        const rep = this._report(shift.id);
        if (rep && rep.cashControl) return Object.assign({ shift }, rep.cashControl);

        const s = this.summary(shift.id);
        const opening  = shift.openingCash || 0;
        const expected = opening + s.cash;
        const actual   = shift.actualCash;
        return {
            shift, opening, cashSales: s.cash, expected,
            actual, difference: actual == null ? null : actual - expected,
        };
    },
};

window.CF_SOLD = CF_SOLD;
window.CF_IN_PROGRESS = CF_IN_PROGRESS;
window.CF_WAITING_PAY = CF_WAITING_PAY;
window.CFKpi = CFKpi;
