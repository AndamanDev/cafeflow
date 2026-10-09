/**
 * CafeFlow — DOCUMENT BUILDERS
 * ------------------------------------------------------------
 * ฟังก์ชันบริสุทธิ์: รับ id → คืน HTML string ของเอกสาร
 *
 * ⚠️ 58 มม. ไม่ใช่ "80 มม. ที่ย่อลง"
 *    พื้นที่พิมพ์จริงเหลือราว 48 มม. (~22 ตัวอักษรที่ 9pt)
 *    เทียบกับ 80 มม. ที่ราว 72 มม. (~32 ตัวอักษร) — ราวสองในสาม
 *    จึงต้องแยกเส้นทางการจัดบรรทัด ไม่ใช่หวังให้เบราว์เซอร์ย่อให้
 */
const CFDocs = {

    /* ══════════════════════════════════════════════════════
       ใบเสร็จรับเงิน — กระดาษม้วน (ทางสำรองตอนยังไม่ได้ตั้งเครื่องพิมพ์)
       ------------------------------------------------------
       ⚠️ ต้องหน้าตาเดียวกับ receipt() ใน api/src/print/raster.js
          ลูกค้าไม่ควรได้ใบเสร็จคนละแบบเพียงเพราะร้านยังไม่ได้ตั้งเครื่องพิมพ์
          แก้ที่หนึ่งต้องแก้อีกที่
       บรรทัดภาษีพิมพ์เฉพาะสาขาที่จด VAT — ไม่ได้จดแต่แสดงยอดภาษี = เรียกเก็บโดยไม่มีสิทธิ์
       ══════════════════════════════════════════════════════ */
    receiptRoll(orderId, width) {
        const narrow = width === '58mm';
        const e = CFApp.esc;
        const o = CFStore.byId('orders', orderId);
        if (!o) return '<div class="ds-empty">ไม่พบออเดอร์</div>';

        const s = CFStore.settings();
        const items = CFOrders.items(orderId);
        const pay = CFOrders.payment(orderId);
        const row = (l, r, cls) =>
            `<div class="cf-rc-row${cls ? ' ' + cls : ''}"><span>${l}</span><span>${r}</span></div>`;

        /* ── หัวร้าน (ตรงกับ shopHeader ใน api/src/print/raster.js) ── */
        let html = '<div class="cf-rc-center">';
        html += `<div class="cf-rc-lg">${e(s.shopName)}</div>`;
        if (s.address) html += `<div class="cf-rc-sm">${e(s.address)}</div>`;
        if (s.shopPhone) html += `<div class="cf-rc-sm">โทร ${e(s.shopPhone)}</div>`;
        if (s.taxId) html += `<div class="cf-rc-sm">เลขประจำตัวผู้เสียภาษี ${e(s.taxId)}</div>`;
        html += `<div class="cf-rc-sp"><b>${s.vatRegistered ? 'ใบเสร็จรับเงิน/ใบกำกับภาษีอย่างย่อ' : 'ใบเสร็จรับเงิน'}</b></div>`;
        html += '</div>';
        html += '<div class="cf-rc-hr cf-rc-solid"></div>';

        html += row('เลขที่', e(o.id));
        html += row('วันที่', CFApp.dateTime((o.ts && o.ts.paidAt) || o.createdAt));
        html += row('คิว', e(o.orderNo) + ' · ' + (o.diningOption === 'TAKE_AWAY' ? 'กลับบ้าน' : 'กินที่ร้าน'));
        if (o.cashierId) html += row('พนักงาน', e(CFApp.actorName(o.cashierId)));
        html += '<div class="cf-rc-hr"></div>';

        /* ── รายการ: "1 x ชื่อ (เย็น) ... 85.00" แล้วตัวเลือกบรรทัดละตัว นำด้วย "-" (ชื่อเต็ม ไม่ใช้ตัวย่อ) ── */
        let count = 0;
        items.forEach((it) => {
            count += it.qty;
            html += row(`<span class="cf-rc-name">${it.qty} x ${e(it.nameSnapshot)}${e(CFApp.serveSuffix(it.serveType))}</span>`,
                        CFApp.money(it.unitPrice * it.qty));
            (it.mods || []).forEach((m) => {
                const d = Number(m.priceDelta) || 0;
                html += `<div class="cf-rc-mod">- ${e(m.label || m.shortLabel)}${d ? ` (+${d % 1 ? CFApp.money(d) : d})` : ''}</div>`;
            });
        });

        html += '<div class="cf-rc-hr"></div>';
        html += row(`รวม ${count} รายการ`, CFApp.money(o.subtotal != null ? o.subtotal : o.total));
        if (o.discount > 0) html += row('ส่วนลด', '-' + CFApp.money(o.discount));
        if (s.vatRegistered) {
            // ?? ไม่ใช่ || — ร้านที่ตั้ง 0% (อัตราศูนย์) ต้องแสดง 0% ไม่ใช่ 7%
            const rate = Number(s.vatPercent ?? 7);
            const vat = o.total - o.total / (1 + rate / 100);
            html += row('มูลค่าก่อนภาษี', CFApp.money(o.total - vat), 'cf-rc-sm');
            html += row(`ภาษีมูลค่าเพิ่ม ${rate}%`, CFApp.money(vat), 'cf-rc-sm');
        }
        html += '<div class="cf-rc-hr cf-rc-solid"></div>';
        html += row('ยอดสุทธิ', CFApp.baht(o.total), 'cf-rc-lg');
        html += '<div class="cf-rc-hr cf-rc-solid"></div>';

        if (pay) {
            html += row(pay.method === 'CASH' ? 'ชำระด้วยเงินสด' : 'ชำระด้วย QR พร้อมเพย์', CFApp.money(pay.amount));
            if (pay.received != null) {
                html += row('รับเงิน', CFApp.money(pay.received));
                html += row('เงินทอน', `<b>${CFApp.money(pay.change)}</b>`);
            }
            if (pay.ref) html += `<div class="cf-rc-sm">อ้างอิง ${e(pay.ref)}</div>`;
            html += '<div class="cf-rc-hr"></div>';
        }

        html += '<div class="cf-rc-center"><b>ขอบคุณที่ใช้บริการ</b></div>';
        String(s.receiptFooter || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 4)
            .forEach((ln) => { html += `<div class="cf-rc-center cf-rc-sm">${e(ln)}</div>`; });
        if (o.reprintCount > 0) {
            html += `<div class="cf-rc-center cf-rc-sm">สำเนา — พิมพ์ซ้ำครั้งที่ ${o.reprintCount}</div>`;
        }
        return html;
    },

    /* ══════════════════════════════════════════════════════
       สลิปครัว (§19) — กระดาษม้วน
       ══════════════════════════════════════════════════════ */
    kitchenSlipRoll(orderId, station, width) {
        const narrow = width === '58mm';
        const e = CFApp.esc;
        const o = CFStore.byId('orders', orderId);
        if (!o) return '<div class="ds-empty">ไม่พบออเดอร์</div>';

        const items = CFOrders.items(orderId).filter((i) => i.station === station && i.itemStatus !== 'VOID');

        // หน้าตาเดียวกับ kitchenSlip ใน raster.js: สถานีแถบดำ · คิวตัวใหญ่ · "กลับบ้าน" แถบดำ · ไม่มีราคา
        let html = `<div class="cf-rc-banner">${e(CFApp.stationLabel(station))}</div>`;
        html += `<div class="cf-rc-center cf-rc-xl">คิว ${e(o.orderNo)}</div>`;
        html += o.diningOption === 'TAKE_AWAY'
            ? '<div class="cf-rc-banner cf-rc-item-lg">กลับบ้าน</div>'
            : '<div class="cf-rc-center"><b>กินที่ร้าน</b></div>';
        html += `<div class="cf-rc-row cf-rc-sm"><span>${o.kioskId ? 'สั่งที่ ' + e(o.kioskId) : ''}</span>
                 <span>เวลา ${CFApp.time(o.ts && o.ts.sentAt ? o.ts.sentAt : o.createdAt)}</span></div>`;
        html += '<div class="cf-rc-hr cf-rc-solid"></div>';

        if (!items.length) {
            html += '<div class="cf-rc-center cf-rc-sm">ไม่มีรายการของสถานีนี้</div>';
        }
        let count = 0;
        items.forEach((it, i) => {
            count += it.qty;
            html += `<div class="cf-rc-name cf-rc-item-lg">${it.qty} x ${e(it.nameSnapshot)}${e(CFApp.serveSuffix(it.serveType))}</div>`;
            // ⚠️ ครัวใช้ข้อมูลนี้ตัดสินใจผลิต — ต้องสะกดเต็มคำเสมอ แม้กระดาษ 58 มม.
            (it.mods || []).forEach((m) => {
                html += `<div class="cf-rc-mod">- ${e(m.label)}</div>`;
            });
            if (i < items.length - 1) html += '<div class="cf-rc-hr"></div>';
        });

        html += '<div class="cf-rc-hr cf-rc-solid"></div>';
        html += `<div class="cf-rc-row cf-rc-sm"><span>รวม ${count} รายการ</span>
                 <span>พิมพ์ ${CFApp.time(new Date().toISOString())}</span></div>`;
        return html;
    },

    /* ══════════════════════════════════════════════════════
       ใบปิดรอบ (§27) — A4
       ══════════════════════════════════════════════════════ */
    closingA4(shiftId) {
        const e = CFApp.esc;
        const s = CFStore.settings();
        const shift = CFStore.byId('shifts', shiftId);   // ไม่เจอ = ไม่พิมพ์ ห้ามถอยไปใช้รอบที่เปิดอยู่
        if (!shift) return '<div class="ds-empty">ไม่พบรอบการขาย</div>';

        const k = CFKpi.summary(shift.id);
        const cc = CFKpi.cashControl(shift.id);
        const top = CFKpi.topProducts(shift.id, 8);

        let html = `
            <div class="cf-doc-head">
                <h2>${e(s.shopName)}</h2>
                <p>${e(s.branch)} · ${e(s.address)}</p>
                <p>เลขประจำตัวผู้เสียภาษี ${e(s.taxId)}</p>
                <h2 style="margin-top:12px">ใบสรุปปิดรอบการขาย</h2>
            </div>

            <table class="ds-table-grid">
                <tr><th style="width:22%">รหัสรอบ</th><td class="l">${e(shift.id)}</td>
                    <th style="width:22%">สถานะ</th><td class="l">${shift.status === 'OPEN' ? 'ยังไม่ปิดรอบ (ตัวอย่าง)' : 'ปิดรอบแล้ว'}</td></tr>
                <tr><th>เปิดรอบ</th><td class="l">${CFApp.dateTime(shift.openedAt)}</td>
                    <th>ปิดรอบ</th><td class="l">${shift.closedAt ? CFApp.dateTime(shift.closedAt) : '—'}</td></tr>
                <tr><th>ผู้เปิดรอบ</th><td class="l">${e(CFApp.actorName(shift.openedBy))}</td>
                    <th>ผู้ปิดรอบ</th><td class="l">${shift.closedBy ? e(CFApp.actorName(shift.closedBy)) : '—'}</td></tr>
            </table>

            <div class="card-title">สรุปยอดขาย</div>
            <table class="ds-table-grid">
                <tr><th style="width:40%">รายการ</th><th style="width:20%">จำนวน</th><th>จำนวนเงิน (บาท)</th></tr>
                <tr><td class="l">ยอดขายเงินสด</td><td class="c">—</td><td class="r">${CFApp.money(k.cash)}</td></tr>
                <tr><td class="l">ยอดขาย QR</td><td class="c">—</td><td class="r">${CFApp.money(k.qr)}</td></tr>
                <tr><td class="l"><b>ยอดขายรวม</b></td><td class="c"><b>${k.orderCount}</b></td><td class="r"><b>${CFApp.money(k.sales)}</b></td></tr>
                <tr><td class="l">ยกเลิก</td><td class="c">${k.cancelledCount}</td><td class="r">${CFApp.money(k.cancelledAmount)}</td></tr>
                <tr><td class="l">คืนเงิน</td><td class="c">${k.refundedCount}</td><td class="r">${CFApp.money(k.refundedAmount)}</td></tr>
                <tr><td class="l">ยอดขายเฉลี่ยต่อบิล</td><td class="c">—</td><td class="r">${CFApp.money(k.avgOrder)}</td></tr>
            </table>

            <div class="card-title">การควบคุมเงินสด</div>
            <table class="ds-table-grid">
                <tr><td class="l" style="width:60%">เงินตั้งต้น</td><td class="r">${CFApp.money(cc.opening)}</td></tr>
                <tr><td class="l">ยอดขายเงินสด</td><td class="r">${CFApp.money(cc.cashSales)}</td></tr>
                <tr><td class="l"><b>เงินสดที่ควรมี</b></td><td class="r"><b>${CFApp.money(cc.expected)}</b></td></tr>
                <tr><td class="l">เงินสดนับจริง</td><td class="r">${cc.actual == null ? '.....................' : CFApp.money(cc.actual)}</td></tr>
                <tr><td class="l"><b>ผลต่าง</b></td><td class="r"><b>${cc.difference == null ? '.....................' : CFApp.money(cc.difference)}</b></td></tr>
            </table>

            <div class="card-title">ตัวชี้วัดการปฏิบัติงาน</div>
            <table class="ds-table-grid">
                <tr><th>เวลารอชำระเฉลี่ย</th><th>เวลาจัดเตรียมเฉลี่ย</th><th>ออเดอร์ต่อชั่วโมง</th><th>สัดส่วนเงินสด : QR</th></tr>
                <tr><td class="c">${CFKpi.fmtSec(k.avgWaitSec)}</td>
                    <td class="c">${CFKpi.fmtSec(k.avgPrepSec)}</td>
                    <td class="c">${k.throughput.toFixed(1)}</td>
                    <td class="c">${k.sales ? Math.round((k.cash / k.sales) * 100) : 0}% : ${k.sales ? Math.round((k.qr / k.sales) * 100) : 0}%</td></tr>
            </table>

            <div class="card-title">สินค้าขายดี</div>
            <table class="ds-table-grid">
                <tr><th style="width:8%">ลำดับ</th><th class="l">สินค้า</th><th style="width:15%">จำนวน</th><th style="width:22%">จำนวนเงิน</th></tr>
                ${top.map((t, i) => `<tr><td class="c">${i + 1}</td><td class="l">${e(t.name)}</td>
                    <td class="c">${t.qty}</td><td class="r">${CFApp.money(t.amount)}</td></tr>`).join('')}
            </table>

            <div class="ds-print-sign">
                <div class="cf-sign-box"><div class="cf-sign-line"></div>ผู้ปิดรอบ</div>
                <div class="cf-sign-box"><div class="cf-sign-line"></div>ผู้ตรวจสอบ</div>
            </div>

            <div class="ds-print-footer">
                ${e(s.shopName)} · พิมพ์เมื่อ ${CFApp.dateTime(new Date().toISOString())}
                · หน้า <span class="ds-page-no"></span>
            </div>`;
        return html;
    },

    /* ══════════════════════════════════════════════════════
       ใบปิดรอบ (§27) — กระดาษม้วน 58/80 มม.
       ------------------------------------------------------
       ฉบับย่อ: ตัดตารางสินค้าขายดีและตาราง KPI ออก
       เพราะตารางหลายคอลัมน์ลงกระดาษกว้าง 48 มม. ไม่ได้
       ข้อมูลครบยังอยู่ในเวอร์ชัน A4
       ══════════════════════════════════════════════════════ */
    closingRoll(shiftId) {
        const e = CFApp.esc;
        const s = CFStore.settings();
        const shift = CFStore.byId('shifts', shiftId);   // ไม่เจอ = ไม่พิมพ์ ห้ามถอยไปใช้รอบที่เปิดอยู่
        if (!shift) return '<div class="ds-empty">ไม่พบรอบการขาย</div>';

        const k = CFKpi.summary(shift.id);
        const cc = CFKpi.cashControl(shift.id);
        const row = (label, value, big) =>
            `<div class="cf-rc-row${big ? ' cf-rc-lg' : ''}"><span>${label}</span><span>${value}</span></div>`;

        let html = '<div class="cf-rc-center">';
        html += `<div class="cf-rc-lg">${e(s.shopName)}</div>`;
        html += '<div class="cf-rc-sm">ใบสรุปปิดรอบการขาย</div>';
        html += '</div>';
        html += '<div class="cf-rc-hr"></div>';

        html += row('รหัสรอบ', e(shift.id));
        html += row('เปิดรอบ', CFApp.time(shift.openedAt));
        html += row('ปิดรอบ', shift.closedAt ? CFApp.time(shift.closedAt) : '—');
        html += row('ผู้รับผิดชอบ', e(CFApp.actorName(shift.closedBy || shift.openedBy)));
        html += '<div class="cf-rc-hr"></div>';

        html += row('ยอดขายเงินสด', CFApp.money(k.cash));
        html += row('ยอดขาย QR', CFApp.money(k.qr));
        html += row('จำนวนบิล', String(k.orderCount));
        html += row('ยอดขายรวม', CFApp.money(k.sales), true);
        html += '<div class="cf-rc-hr"></div>';

        html += row('ยกเลิก (' + k.cancelledCount + ')', CFApp.money(k.cancelledAmount));
        html += row('คืนเงิน (' + k.refundedCount + ')', CFApp.money(k.refundedAmount));
        html += '<div class="cf-rc-hr"></div>';

        html += '<div class="cf-rc-name">การควบคุมเงินสด</div>';
        html += row('เงินตั้งต้น', CFApp.money(cc.opening));
        html += row('ขายเงินสด', CFApp.money(cc.cashSales));
        html += row('ควรมี', CFApp.money(cc.expected), true);
        html += row('นับได้จริง', cc.actual == null ? '________' : CFApp.money(cc.actual));
        html += row('ผลต่าง', cc.difference == null ? '________' : CFApp.money(cc.difference), true);

        html += '<div class="cf-rc-hr"></div>';
        html += '<div class="cf-rc-sp cf-rc-sm">ลงชื่อผู้ปิดรอบ</div>';
        html += '<div class="cf-rc-sm">__________________________</div>';
        html += `<div class="cf-rc-center cf-rc-sp cf-rc-sm">พิมพ์ ${CFApp.dateTime(new Date().toISOString())}</div>`;
        return html;
    },

    /* ══════════════════════════════════════════════════════
       ตัวช่วยเปิด preview — ให้หน้าเรียกสั้น ๆ
       ══════════════════════════════════════════════════════ */
    previewReceipt(orderId) {
        const o = CFStore.byId('orders', orderId);
        const title = 'ใบเสร็จรับเงิน — ' + (o ? o.orderNo : '');
        const browser = {
            title,
            size: CFStore.settings().receiptWidth,
            sizes: ['58mm', '80mm'],
            build: (w) => CFDocs.receiptRoll(orderId, w),
            docRef: { type: 'receipt', orderId },
        };
        const id = encodeURIComponent(orderId);
        CFPrint.previewServer({
            title,
            previewPath: '/api/orders/' + id + '/print-preview?doc=receipt',
            printPath: '/api/orders/' + id + '/receipt',
            fallback: browser,
        });
    },

    previewKitchenSlip(orderId, station) {
        const o = CFStore.byId('orders', orderId);
        const title = 'สลิปครัว ' + CFApp.stationLabel(station) + ' — ' + (o ? o.orderNo : '');
        const browser = {
            title,
            size: CFStore.settings().kitchenSlipWidth,
            sizes: ['58mm', '80mm'],
            build: (w) => CFDocs.kitchenSlipRoll(orderId, station, w),
            docRef: { type: 'kslip', orderId, station },
        };
        const id = encodeURIComponent(orderId);
        CFPrint.previewServer({
            title,
            previewPath: '/api/orders/' + id + '/print-preview?doc=kslip&station=' + encodeURIComponent(station),
            printPath: '/api/orders/' + id + '/kitchen-slip',
            printBody: { station },
            fallback: browser,
        });
    },

    previewClosing(shiftId) {
        const browser = {
            title: 'ใบสรุปปิดรอบการขาย',
            size: CFStore.settings().closingWidth || 'A4',
            sizes: ['58mm', '80mm', 'A4'],
            // กระดาษม้วนได้ฉบับย่อ A4 ได้ฉบับเต็ม — ตารางหลายคอลัมน์ลง 48 มม. ไม่ได้
            build: (w) => (w === 'A4' ? CFDocs.closingA4(shiftId) : CFDocs.closingRoll(shiftId)),
            docRef: { type: 'closing', orderId: null },
        };
        const id = encodeURIComponent(shiftId);
        CFPrint.previewServer({
            title: browser.title,
            previewPath: '/api/reports/shift/' + id + '/print-preview',
            printPath: '/api/reports/shift/' + id + '/print',
            fallback: browser,
            // ฉบับเต็ม A4 มีแค่ทางเบราว์เซอร์ — ต้องเลือกได้เสมอ แม้ตั้งเครื่องพิมพ์ม้วนแล้ว
            browserAlways: 'ฉบับเต็ม A4 / เบราว์เซอร์',
        });
    },
};

window.CFDocs = CFDocs;
