/**
 * CafeFlow — CSV EXPORT (§28)
 * ------------------------------------------------------------
 * คอลัมน์ตรงตามสเปก §28 เป๊ะ เพื่อให้เป็นสัญญาข้อมูลจริง ไม่ใช่ dump ตามใจ
 *
 * ⚠️ ต้องมี UTF-8 BOM ไม่งั้น Excel บน Windows ภาษาไทยจะเพี้ยนทุกตัว
 */
const CFExport = {

    /** ครอบค่าให้ปลอดภัย — ค่าอย่าง "หวาน 25%, แยกน้ำแข็ง" มีคอมมาอยู่จริง */
    cell(v) {
        if (v == null) return '';
        const s = String(v);
        return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    },

    toCsv(headers, rows) {
        return [headers.join(',')]
            .concat(rows.map((r) => r.map((c) => this.cell(c)).join(',')))
            .join('\r\n');
    },

    download(filename, csv) {
        // ﻿ = BOM
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    /** ตัวเลือกของรายการ แยกตามกลุ่มให้ตรงคอลัมน์ §28 */
    _modOf(item, groupId) {
        const m = (item.mods || []).find((x) => x.groupId === groupId);
        return m ? m.label : '';
    },
    _addons(item) {
        return (item.mods || []).filter((x) => x.groupId === 'MG-ADDON').map((x) => x.label).join(', ');
    },

    scopeOrders(shiftId) {
        return CFKpi.scope(shiftId).slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    },

    /* ── orders.csv ──────────────────────────────────────── */
    orders(shiftId) {
        const rows = this.scopeOrders(shiftId).map((o) => [
            o.orderNo,
            o.createdAt,
            o.kioskId,
            o.cashierId ? CFApp.actorName(o.cashierId) : '',
            o.paymentMethod,
            o.subtotal.toFixed(2),
            (o.discount || 0).toFixed(2),
            o.total.toFixed(2),
            o.status,
        ]);
        return this.toCsv(
            ['order_no', 'order_datetime', 'kiosk', 'cashier', 'payment_type', 'subtotal', 'discount', 'total', 'status'],
            rows
        );
    },

    /* ── order_items.csv ─────────────────────────────────── */
    orderItems(shiftId) {
        const orders = this.scopeOrders(shiftId);
        const byId = {};
        orders.forEach((o) => { byId[o.id] = o; });

        const rows = [];
        CFStore.all('orderItems')
            .filter((i) => byId[i.orderId])
            .forEach((i) => {
                rows.push([
                    byId[i.orderId].orderNo,
                    i.nameSnapshot,
                    CFApp.serveLabel(i.serveType),
                    i.qty,
                    this._modOf(i, 'MG-SWEET'),
                    this._modOf(i, 'MG-TEMP'),
                    this._modOf(i, 'MG-ICE'),
                    i.station,
                    (i.unitPrice * i.qty).toFixed(2),
                    this._addons(i),
                ]);
            });
        return this.toCsv(
            ['order_no', 'product', 'serve_type', 'qty', 'sweetness', 'temperature', 'separate_ice', 'station', 'price', 'addons'],
            rows
        );
    },

    /* ── payments.csv ────────────────────────────────────── */
    payments(shiftId) {
        const byId = {};
        this.scopeOrders(shiftId).forEach((o) => { byId[o.id] = o; });

        const rows = CFStore.all('payments')
            .filter((p) => byId[p.orderId])
            .map((p) => [
                byId[p.orderId].orderNo,
                p.method,
                p.amount.toFixed(2),
                p.received != null ? p.received.toFixed(2) : '',
                p.change != null ? p.change.toFixed(2) : '',
                p.ref || '', p.bank || '', p.txAt || '',
                p.verifiedBy ? CFApp.actorName(p.verifiedBy) : '',
                p.overrideBy ? CFApp.actorName(p.overrideBy) : '',
                p.overrideReason || '',
                p.status,
            ]);
        return this.toCsv(
            ['order_no', 'method', 'amount', 'received', 'change', 'ref', 'bank', 'tx_datetime',
             'verified_by', 'override_by', 'override_reason', 'status'],
            rows
        );
    },

    /* ── daily_closing.csv ───────────────────────────────── */
    dailyClosing(shiftId) {
        const shift = shiftId ? CFStore.byId('shifts', shiftId) : CFStore.openShift();
        const k = CFKpi.summary(shift.id);
        const cc = CFKpi.cashControl(shift.id);
        const rows = [[
            shift.id, shift.openedAt, shift.closedAt || '',
            CFApp.actorName(shift.openedBy), shift.closedBy ? CFApp.actorName(shift.closedBy) : '',
            k.cash.toFixed(2), k.qr.toFixed(2), k.sales.toFixed(2),
            k.orderCount,
            k.cancelledCount, k.cancelledAmount.toFixed(2),
            k.refundedCount, k.refundedAmount.toFixed(2),
            cc.opening.toFixed(2), cc.expected.toFixed(2),
            cc.actual == null ? '' : cc.actual.toFixed(2),
            cc.difference == null ? '' : cc.difference.toFixed(2),
        ]];
        return this.toCsv(
            ['shift_id', 'opened_at', 'closed_at', 'opened_by', 'closed_by',
             'cash_sales', 'qr_sales', 'total_sales', 'orders',
             'cancelled_count', 'cancelled_amount', 'refund_count', 'refund_amount',
             'opening_cash', 'expected_cash', 'actual_cash', 'difference'],
            rows
        );
    },

    /** ส่งออกทั้งชุด 4 ไฟล์ */
    all(shiftId) {
        const shift = shiftId ? CFStore.byId('shifts', shiftId) : CFStore.openShift();
        const tag = shift ? shift.id : new Date().toISOString().slice(0, 10);
        const files = [
            ['orders_' + tag + '.csv',       this.orders(shift && shift.id)],
            ['order_items_' + tag + '.csv',  this.orderItems(shift && shift.id)],
            ['payments_' + tag + '.csv',     this.payments(shift && shift.id)],
            ['daily_closing_' + tag + '.csv', this.dailyClosing(shift && shift.id)],
        ];
        // ดาวน์โหลดทีละไฟล์แบบหน่วงเล็กน้อย — เบราว์เซอร์บล็อกการยิงติดกันหลายไฟล์
        files.forEach(([name, csv], i) => setTimeout(() => this.download(name, csv), i * 350));
        showToast('กำลังส่งออก ' + files.length + ' ไฟล์', 'success');
    },
};

window.CFExport = CFExport;
