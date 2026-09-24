/**
 * CafeFlow — ORDER STATE MACHINE (§7, §8, §21)
 * ------------------------------------------------------------
 * ทุกการเปลี่ยนสถานะของออเดอร์ต้องผ่าน CFOrders.transition()
 * ตรรกะจริง (ผังสถานะ การชำระ routing เข้าครัว audit log) อยู่ที่เซิร์ฟเวอร์
 * ไฟล์นี้เป็นตัวเรียก + ตรวจล่วงหน้าด้วยผังจาก shared/cf-flow.js ตัวเดียวกัน
 * เพื่อให้ข้อความทันทีโดยไม่ต้องรอ network
 */

/* ── ผังสถานะ CF_FLOW · CF_REASON_REQUIRED · CF_ACTION_LABEL ──
   ย้ายไป shared/cf-flow.js แล้ว เพราะเซิร์ฟเวอร์ต้องตัดสินด้วยผังเดียวกับหน้าจอ
   ไฟล์นี้เหลือเฉพาะ "การกระทำ" ส่วน "กฎ" อยู่ที่ shared/ */

/** แสดง error ให้ผู้ใช้เห็นเป็นภาษาคน แล้วคืน false เพื่อให้ผู้เรียกเดินต่อได้ */
function _fail(err) {
    const msg = err && err.offline
        ? 'ติดต่อเซิร์ฟเวอร์ของร้านไม่ได้ — ยังไม่ได้บันทึก'
        : (err && err.message) || 'ทำรายการไม่สำเร็จ';
    if (window.showToast) showToast(msg, 'error', 4000);
    return false;
}

const CFOrders = {

    /** สถานะถัดไปที่ถูกกฎ — ใช้ generate ปุ่ม จึงไม่มีปุ่มที่กดแล้วพัง */
    nextStates(order) { return CFFlow.nextStates(order.status); },

    canGo(order, to) { return CFFlow.canGo(order.status, to); },

    /**
     * เปลี่ยนสถานะออเดอร์
     * คืน Promise<true> เมื่อสำเร็จ / Promise<false> พร้อม toast เมื่อถูกปฏิเสธ
     */
    transition(orderId, newStatus, opts) {
        opts = opts || {};

        // เซิร์ฟเวอร์ตรวจผัง เหตุผล และสิทธิ์ซ้ำอีกชั้นเสมอ — ที่ตรวจตรงนี้เพื่อ
        // ไม่ให้ยิงไปทั้งที่รู้อยู่แล้วว่าไม่ผ่าน และให้ข้อความทันทีโดยไม่ต้องรอ network
        const order = CFStore.byId('orders', orderId);
        if (order && !CFFlow.canGo(order.status, newStatus)) {
            showToast('เปลี่ยนสถานะจาก "' + CFApp.statusLabel(order.status) +
                      '" ไปเป็น "' + CFApp.statusLabel(newStatus) + '" ไม่ได้', 'error', 4000);
            return Promise.resolve(false);
        }
        if (CFFlow.needsReason(newStatus) && !String(opts.reason || '').trim()) {
            showToast('ต้องระบุเหตุผลก่อนทำรายการนี้', 'error');
            return Promise.resolve(false);
        }
        return CFStore.cmd('post', '/api/orders/' + encodeURIComponent(orderId) + '/transition',
            Object.assign({ status: newStatus }, opts))
            .then(() => true).catch(_fail);
    },

    /**
     * §21 — สถานีหนึ่งทำเสร็จ
     * ออเดอร์จะเป็น READY ก็ต่อเมื่อ "ทุกสถานี" พร้อม ไม่ใช่สถานีแรกที่กด
     */
    setStationReady(orderId, station) {
        return CFStore.cmd('post',
            '/api/orders/' + encodeURIComponent(orderId) +
            '/stations/' + encodeURIComponent(station) + '/ready', {})
            .then(() => true).catch(_fail);
    },

    /**
     * สร้างออเดอร์ใหม่จากตะกร้าของคีออสก์ (§9)
     * cart = [{ productId, serveType, qty, mods:[{groupId,optionId,label,shortLabel,priceDelta}] }]
     * คืน Promise ของ orderId (null เมื่อไม่สำเร็จ — toast แล้ว)
     * ออเดอร์เริ่มที่ ORDER_CONFIRMED แล้วผู้เรียกค่อย transition ไปตามวิธีชำระ
     */
    create(cart, opts) {
        opts = opts || {};
        if (!cart || !cart.length) return Promise.resolve(null);

        // clientUuid ทำให้ retry ตอน Wi-Fi สะดุดไม่กลายเป็นสองออเดอร์
        // สร้างครั้งเดียวต่อการกด "ชำระเงิน" ไม่ใช่ต่อการยิงแต่ละครั้ง
        const clientUuid = opts.clientUuid ||
            (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
        return CFStore.cmd('post', '/api/orders', {
            clientUuid,
            cart: cart.map((l) => ({
                productId: l.productId, serveType: l.serveType, qty: l.qty,
                mods: (l.mods || []).map((m) => ({ optionId: m.optionId })),
            })),
            diningOption: opts.diningOption || 'DINE_IN',
            paymentMethod: opts.paymentMethod || 'CASH',
            kioskId: opts.kioskId || null,
            expectTotal: opts.expectTotal,      // ไม่ตรงกับที่เซิร์ฟเวอร์คิด = ปฏิเสธ
        }).then((res) => res.orderId).catch((err) => { _fail(err); return null; });
    },

    /** บันทึกการพิมพ์ (§19 reprint) */
    logPrint(orderId, docType, width, station) {
        // ยิงแล้วไม่ต้องรอ — กระดาษออกไปแล้ว การบันทึกช้าไปเสี้ยววินาทีไม่เป็นไร
        // แต่ถ้าบันทึกไม่ได้ต้องรู้ ไม่ใช่เงียบ
        if (!orderId) return;
        CFStore.cmd('post', '/api/orders/' + encodeURIComponent(orderId) + '/print',
            { docType, width, station })
            .catch((err) => console.warn('[CFOrders] บันทึกการพิมพ์ไม่สำเร็จ', err));
    },

    /** ประวัติของออเดอร์หนึ่ง เรียงใหม่ก่อน */
    historyOf(orderId) {
        return CFStore.all('auditLogs').filter((a) => a.orderId === orderId);
    },

    items(orderId) { return CFStore.all('orderItems').filter((i) => i.orderId === orderId); },
    payment(orderId) { return CFStore.all('payments').find((p) => p.orderId === orderId) || null; },
};

window.CF_FLOW = CF_FLOW;
window.CF_REASON_REQUIRED = CF_REASON_REQUIRED;
window.CF_ACTION_LABEL = CF_ACTION_LABEL;
window.CFOrders = CFOrders;
