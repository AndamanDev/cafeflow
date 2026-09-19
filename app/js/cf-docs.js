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
       ใบเสร็จรับเงิน — กระดาษม้วน
       ══════════════════════════════════════════════════════ */
    receiptRoll(orderId, width) {
        const narrow = width === '58mm';
        const e = CFApp.esc;
        const o = CFStore.byId('orders', orderId);
        if (!o) return '<div class="ds-empty">ไม่พบออเดอร์</div>';

        const s = CFStore.settings();
        const items = CFOrders.items(orderId);
        const pay = CFOrders.payment(orderId);
        const vat = o.total - (o.total / (1 + s.vatPercent / 100));

        /* ── หัวใบเสร็จ: 58 มม. ตัดที่อยู่ทิ้ง เหลือแค่ชื่อร้าน + เลขผู้เสียภาษี ── */
        let html = '<div class="cf-rc-center">';
        html += `<div class="cf-rc-lg">${e(s.shopName)}</div>`;
        if (!narrow) html += `<div class="cf-rc-sm">${e(s.branch)}</div><div class="cf-rc-sm">${e(s.address)}</div>`;
        html += `<div class="cf-rc-sm">เลขประจำตัวผู้เสียภาษี ${e(s.taxId)}</div>`;
        html += '</div>';
        html += '<div class="cf-rc-hr"></div>';

        html += `<div class="cf-rc-row"><span>เลขที่</span><span><b>${e(o.orderNo)}</b></span></div>`;
        html += `<div class="cf-rc-row"><span>วันที่</span><span>${CFApp.date(o.createdAt)} ${CFApp.time(o.createdAt)}</span></div>`;
        html += `<div class="cf-rc-row"><span>จุดสั่ง</span><span>${e(o.kioskId)}</span></div>`;
        if (o.cashierId) {
            html += `<div class="cf-rc-row"><span>พนักงาน</span><span>${e(CFApp.actorName(o.cashierId))}</span></div>`;
        }
        html += '<div class="cf-rc-hr"></div>';

        /* ── รายการสินค้า ──────────────────────────────────
           80 มม. : ชื่อ ... x2 ... 120.00  แถวเดียว
           58 มม. : ชื่อขึ้นบรรทัดเอง แล้ว x2 / ราคา อยู่บรรทัดถัดไป */
        items.forEach((it) => {
            const amount = CFApp.money(it.unitPrice * it.qty);
            const nm = e(it.nameSnapshot) + e(CFApp.serveSuffix(it.serveType));
            if (narrow) {
                html += `<div class="cf-rc-name">${nm}</div>`;
                html += `<div class="cf-rc-row"><span class="cf-rc-sm">x${it.qty} @ ${CFApp.money(it.unitPrice)}</span><span>${amount}</span></div>`;
            } else {
                html += `<div class="cf-rc-row"><span class="cf-rc-name">${nm} x${it.qty}</span><span>${amount}</span></div>`;
            }
            // ใบเสร็จลูกค้าใช้ตัวย่อได้เมื่อกระดาษแคบ — สลิปครัวห้าม (ดู kitchenSlipRoll)
            if (it.mods && it.mods.length) {
                html += `<div class="cf-rc-mod">${e(CFApp.modsText(it, narrow))}</div>`;
            }
        });

        html += '<div class="cf-rc-hr"></div>';
        html += `<div class="cf-rc-row"><span>ยอดรวม</span><span>${CFApp.money(o.subtotal)}</span></div>`;
        if (o.discount) html += `<div class="cf-rc-row"><span>ส่วนลด</span><span>-${CFApp.money(o.discount)}</span></div>`;
        html += `<div class="cf-rc-row cf-rc-sm"><span>ภาษีมูลค่าเพิ่ม ${s.vatPercent}% (ในราคา)</span><span>${CFApp.money(vat)}</span></div>`;
        html += `<div class="cf-rc-row cf-rc-lg"><span>สุทธิ</span><span>${CFApp.money(o.total)}</span></div>`;
        html += '<div class="cf-rc-hr"></div>';

        if (pay) {
            if (pay.method === 'CASH') {
                html += `<div class="cf-rc-row"><span>เงินสด</span><span>${CFApp.money(pay.received || o.total)}</span></div>`;
                html += `<div class="cf-rc-row"><span>เงินทอน</span><span>${CFApp.money(pay.change || 0)}</span></div>`;
            } else {
                html += `<div class="cf-rc-row"><span>ชำระผ่าน QR</span><span>${e(pay.bank || '')}</span></div>`;
                if (pay.ref) html += `<div class="cf-rc-row cf-rc-sm"><span>อ้างอิง</span><span>${e(pay.ref)}</span></div>`;
            }
            if (pay.overrideBy) {
                html += `<div class="cf-rc-sm cf-rc-sp">* ยืนยันโดยพนักงาน: ${e(CFApp.actorName(pay.overrideBy))}</div>`;
            }
        }

        /* ── เลขคิว — สิ่งที่ลูกค้าต้องอ่านจากระยะไกล ── */
        html += '<div class="cf-rc-hr"></div>';
        html += '<div class="cf-rc-center cf-rc-sp">';
        html += '<div class="cf-rc-sm">หมายเลขรับสินค้า</div>';
        html += `<div class="cf-rc-xl">${e(o.orderNo)}</div>`;
        html += '</div>';

        html += '<div class="cf-rc-center cf-rc-sp cf-rc-sm">ขอบคุณที่ใช้บริการ</div>';
        if (o.reprintCount > 0) {
            html += `<div class="cf-rc-center cf-rc-sm">(พิมพ์ซ้ำครั้งที่ ${o.reprintCount})</div>`;
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

        let html = '<div class="cf-rc-center">';
        html += `<div class="cf-rc-lg">*** ${e(CFApp.stationLabel(station))} ***</div>`;
        html += '</div>';
        html += '<div class="cf-rc-hr"></div>';

        html += '<div class="cf-rc-center">';
        html += `<div class="cf-rc-xl">${e(o.orderNo)}</div>`;
        html += `<div class="cf-rc-sm">${CFApp.time(o.ts && o.ts.sentAt ? o.ts.sentAt : o.createdAt)} · ${e(o.kioskId)}</div>`;
        html += '</div>';
        html += '<div class="cf-rc-hr"></div>';

        if (!items.length) {
            html += '<div class="cf-rc-center cf-rc-sm">ไม่มีรายการของสถานีนี้</div>';
        }
        items.forEach((it) => {
            html += `<div class="cf-rc-name" style="font-size:1.15em">${it.qty} x ${e(it.nameSnapshot)}${e(CFApp.serveSuffix(it.serveType))}</div>`;
            // ⚠️ ครัวใช้ข้อมูลนี้ตัดสินใจผลิต — ต้องสะกดเต็มคำเสมอ แม้กระดาษ 58 มม.
            // การย่อ "หวาน 25%" เป็น "ห.25%" คือการแลกความถูกต้องกับกระดาษไม่กี่มิลลิเมตร
            (it.mods || []).forEach((m) => {
                html += `<div class="cf-rc-mod">- ${e(m.label)}</div>`;
            });
            html += '<div class="cf-rc-sp"></div>';
        });

        html += '<div class="cf-rc-hr"></div>';
        html += `<div class="cf-rc-sm${narrow ? '' : ' cf-rc-center'}">พิมพ์ ${CFApp.timeSec(new Date().toISOString())}</div>`;
        return html;
    },

    /* ══════════════════════════════════════════════════════
       ใบปิดรอบ (§27) — A4
       ══════════════════════════════════════════════════════ */
    closingA4(shiftId) {
        const e = CFApp.esc;
        const s = CFStore.settings();
        const shift = CFStore.byId('shifts', shiftId) || CFStore.openShift();
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
    closingRoll(shiftId, width) {
        const e = CFApp.esc;
        const s = CFStore.settings();
        const shift = CFStore.byId('shifts', shiftId) || CFStore.openShift();
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
        CFPrint.preview({
            title: 'ใบเสร็จรับเงิน — ' + (o ? o.orderNo : ''),
            size: CFStore.settings().receiptWidth,
            sizes: ['58mm', '80mm'],
            build: (w) => CFDocs.receiptRoll(orderId, w),
            docRef: { type: 'receipt', orderId },
        });
    },

    previewKitchenSlip(orderId, station) {
        const o = CFStore.byId('orders', orderId);
        CFPrint.preview({
            title: 'สลิปครัว ' + CFApp.stationLabel(station) + ' — ' + (o ? o.orderNo : ''),
            size: CFStore.settings().kitchenSlipWidth,
            sizes: ['58mm', '80mm'],
            build: (w) => CFDocs.kitchenSlipRoll(orderId, station, w),
            docRef: { type: 'kslip', orderId, station },
        });
    },

    previewClosing(shiftId) {
        CFPrint.preview({
            title: 'ใบสรุปปิดรอบการขาย',
            size: CFStore.settings().closingWidth || 'A4',
            sizes: ['58mm', '80mm', 'A4'],
            // กระดาษม้วนได้ฉบับย่อ A4 ได้ฉบับเต็ม — ตารางหลายคอลัมน์ลง 48 มม. ไม่ได้
            build: (w) => (w === 'A4' ? CFDocs.closingA4(shiftId) : CFDocs.closingRoll(shiftId, w)),
            docRef: { type: 'closing', orderId: null },
        });
    },
};

window.CFDocs = CFDocs;
