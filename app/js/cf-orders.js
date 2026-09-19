/**
 * CafeFlow — ORDER STATE MACHINE (§7, §8, §21)
 * ------------------------------------------------------------
 * ทุกการเปลี่ยนสถานะของออเดอร์ต้องผ่าน CFOrders.transition()
 * เพื่อให้ (ก) เดินตามผังชีวิตจริง (ข) มี audit log ทุกครั้ง
 */

/* ── ผังสถานะ CF_FLOW · CF_REASON_REQUIRED · CF_ACTION_LABEL ──
   ย้ายไป shared/cf-flow.js แล้ว เพราะเซิร์ฟเวอร์ต้องตัดสินด้วยผังเดียวกับหน้าจอ
   ไฟล์นี้เหลือเฉพาะ "การกระทำ" ส่วน "กฎ" อยู่ที่ shared/ */

const CFOrders = {

    /** สถานะถัดไปที่ถูกกฎ — ใช้ generate ปุ่ม จึงไม่มีปุ่มที่กดแล้วพัง */
    nextStates(order) { return CFFlow.nextStates(order.status); },

    canGo(order, to) { return CFFlow.canGo(order.status, to); },

    /**
     * เปลี่ยนสถานะออเดอร์
     * คืน true เมื่อสำเร็จ / false พร้อม toast เมื่อถูกปฏิเสธ
     */
    transition(orderId, newStatus, opts) {
        opts = opts || {};
        const order = CFStore.byId('orders', orderId);
        if (!order) { showToast('ไม่พบออเดอร์', 'error'); return false; }

        // (1) ผังสถานะ — ปฏิเสธออกมาดัง ๆ ดีกว่าเขียนข้อมูลผิดเงียบ ๆ
        if (!this.canGo(order, newStatus)) {
            showToast(
                'เปลี่ยนสถานะจาก "' + CFApp.statusLabel(order.status) +
                '" ไปเป็น "' + CFApp.statusLabel(newStatus) + '" ไม่ได้', 'error', 4000
            );
            return false;
        }

        // (2) เหตุผลบังคับ — ผู้เรียกต้องเก็บมาก่อน
        const reason = (opts.reason || '').trim();
        if (CFFlow.needsReason(newStatus) && !reason) {
            showToast('ต้องระบุเหตุผลก่อนทำรายการนี้', 'error');
            return false;
        }

        const actor = opts.byId || (CFAuth.getUser() || {}).id || 'SYSTEM';
        const nowIso = new Date().toISOString();

        CFStore.mutate((db) => {
            const o = db.orders.find((x) => x.id === orderId);
            const from = o.status;

            o.prevStatus = from;
            o.status = newStatus;
            if (reason) o.cancelReason = reason;

            const stamp = CFFlow.stampFor(newStatus);
            if (stamp) { o.ts = o.ts || {}; o.ts[stamp] = nowIso; }

            this._audit(db, orderId, 'STATUS_CHANGE', from, newStatus, actor, reason, opts.device);

            /* ── ผลพลอยได้ที่ต้องอยู่ใน mutate เดียวกัน ── */

            // ชำระแล้ว → บันทึกการชำระ + ส่งเข้าครัวทันที (§7 "Verify Before Forward")
            if (newStatus === 'PAID') {
                o.cashierId = actor;
                this._settlePayment(db, o, opts, nowIso, actor);
                this._sendToKitchen(db, o, nowIso, actor);
            }

            // ยกเลิก/คืนเงิน → เอารายการออกจากบอร์ดครัว
            if (['CANCELLED', 'VOIDED', 'REFUNDED'].includes(newStatus)) {
                db.orderItems.filter((i) => i.orderId === orderId).forEach((i) => { i.itemStatus = 'VOID'; });
                const p = db.payments.find((x) => x.orderId === orderId);
                if (p && newStatus === 'REFUNDED') p.status = 'REFUNDED';
            }
        }, 'transition:' + newStatus);

        return true;
    },

    /** สร้าง/ปิดรายการชำระเงินให้ครบเมื่อออเดอร์กลายเป็น PAID */
    _settlePayment(db, o, opts, nowIso, actor) {
        let p = db.payments.find((x) => x.orderId === o.id);
        if (!p) {
            p = {
                id: 'PM-' + (++db.counters.paymentSeq), orderId: o.id,
                method: o.paymentMethod, amount: o.total,
                received: null, change: null, ref: null, bank: null, txAt: null,
                verifiedBy: null, overrideBy: null, overrideReason: null, overrideAt: null,
                status: 'PAID', createdAt: nowIso,
            };
            db.payments.push(p);
        }
        p.status = 'PAID';
        p.amount = o.total;
        if (opts.received != null) { p.received = opts.received; p.change = opts.received - o.total; }
        if (opts.ref)  p.ref  = opts.ref;
        if (opts.bank) p.bank = opts.bank;
        p.verifiedBy = actor;

        // การ override ต้องเก็บครบสามช่องตาม §16
        if (opts.override) {
            p.overrideBy = actor;
            p.overrideReason = opts.reason || opts.overrideReason || null;
            p.overrideAt = nowIso;
            this._audit(db, o.id, 'PAYMENT_OVERRIDE', null, null, actor, p.overrideReason, opts.device);
        } else {
            this._audit(db, o.id, o.paymentMethod === 'CASH' ? 'PAYMENT_RECEIVED' : 'PAYMENT_VERIFIED',
                null, null, actor,
                opts.received != null ? ('รับเงิน ' + opts.received + ' ทอน ' + (opts.received - o.total)) : null,
                opts.device);
        }
    },

    /** §18 routing — ตั้งคิวของทุกสถานีที่ออเดอร์นี้แตะ */
    _sendToKitchen(db, o, nowIso, actor) {
        const items = db.orderItems.filter((i) => i.orderId === o.id);
        const stations = [...new Set(items.map((i) => i.station))];

        o.stationStatus = {};
        stations.forEach((s) => { o.stationStatus[s] = 'QUEUED'; });
        items.forEach((i) => { i.itemStatus = 'QUEUED'; });

        o.prevStatus = o.status;
        o.status = 'SENT_TO_KITCHEN';
        o.ts.sentAt = nowIso;

        this._audit(db, o.id, 'STATUS_CHANGE', 'PAID', 'SENT_TO_KITCHEN', actor,
            'ส่งเข้า ' + stations.map((s) => CFApp.stationLabel(s)).join(' / '));
    },

    /**
     * §21 — สถานีหนึ่งทำเสร็จ
     * ออเดอร์จะเป็น READY ก็ต่อเมื่อ "ทุกสถานี" พร้อม ไม่ใช่สถานีแรกที่กด
     */
    setStationReady(orderId, station, byId) {
        const order = CFStore.byId('orders', orderId);
        if (!order) return false;
        if (!['SENT_TO_KITCHEN', 'PREPARING'].includes(order.status)) {
            showToast('ออเดอร์นี้ไม่ได้อยู่ในขั้นตอนการผลิต', 'error');
            return false;
        }

        const actor = byId || (CFAuth.getUser() || {}).id || 'SYSTEM';
        let allReady = false;

        CFStore.mutate((db) => {
            const o = db.orders.find((x) => x.id === orderId);
            o.stationStatus[station] = 'READY';
            db.orderItems
                .filter((i) => i.orderId === orderId && i.station === station)
                .forEach((i) => { i.itemStatus = 'READY'; });

            const pending = Object.keys(o.stationStatus).filter((s) => o.stationStatus[s] !== 'READY');
            allReady = pending.length === 0;

            this._audit(db, orderId, 'STATION_READY', null, null, actor,
                CFApp.stationLabel(station) + ' พร้อมแล้ว' +
                (allReady ? ' — ครบทุกสถานี' : ' — รออีก ' + pending.length + ' สถานี'),
                CFApp.deviceId());

            if (allReady) {
                o.prevStatus = o.status;
                o.status = 'READY';
                o.ts = o.ts || {};
                o.ts.readyAt = new Date().toISOString();
                this._audit(db, orderId, 'STATUS_CHANGE', o.prevStatus, 'READY', actor, 'ทุกสถานีพร้อม');
            } else if (o.status === 'SENT_TO_KITCHEN') {
                o.prevStatus = o.status;
                o.status = 'PREPARING';
            }
        }, 'station-ready');

        showToast(allReady ? 'ออเดอร์พร้อมรับแล้ว' : CFApp.stationLabel(station) + ' เสร็จแล้ว — รอสถานีอื่น',
            allReady ? 'success' : 'info');
        return true;
    },

    /**
     * สร้างออเดอร์ใหม่จากตะกร้าของคีออสก์ (§9)
     * cart = [{ productId, serveType, qty, mods:[{groupId,optionId,label,shortLabel,priceDelta}] }]
     * คืน orderId · ออเดอร์เริ่มที่ ORDER_CONFIRMED แล้วผู้เรียกค่อย transition ไปตามวิธีชำระ
     */
    create(cart, opts) {
        opts = opts || {};
        if (!cart || !cart.length) return null;

        let orderId = null;
        CFStore.mutate((db) => {
            const orderNo = CFStore.nextOrderNo();
            orderId = 'O-' + orderNo;
            const nowIso = new Date().toISOString();
            const shift = db.shifts.find((s) => s.status === 'OPEN');

            let subtotal = 0;
            const stations = new Set();

            cart.forEach((line) => {
                const p = db.products.find((x) => x.id === line.productId);
                if (!p) return;
                const base = p.prices[line.serveType];
                if (base == null) return;   // กันไม่ให้ขายแบบเสิร์ฟที่ร้านไม่มี

                const mods = line.mods || [];
                const unitPrice = base + mods.reduce((s, m) => s + (m.priceDelta || 0), 0);
                subtotal += unitPrice * line.qty;
                stations.add(p.station);

                db.orderItems.push({
                    id: 'OI-' + (++db.counters.itemSeq),
                    orderId, productId: p.id,
                    nameSnapshot: p.nameTh,
                    serveType: line.serveType,
                    qty: line.qty, unitPrice,
                    station: p.station,
                    mods: mods.map((m) => ({
                        groupId: m.groupId, optionId: m.optionId,
                        label: m.label, shortLabel: m.shortLabel, priceDelta: m.priceDelta || 0,
                    })),
                    itemStatus: 'DRAFT',
                });
            });

            const stationStatus = {};
            [...stations].forEach((s) => { stationStatus[s] = 'QUEUED'; });

            db.orders.push({
                id: orderId, orderNo,
                shiftId: shift ? shift.id : null,
                createdAt: nowIso,
                kioskId: opts.kioskId || 'KIOSK-01',
                diningOption: opts.diningOption || 'DINE_IN',   // DINE_IN | TAKE_AWAY (§9)
                cashierId: null,
                status: 'ORDER_CONFIRMED', prevStatus: 'DRAFT',
                paymentMethod: opts.paymentMethod || 'CASH',
                subtotal, discount: 0, total: subtotal,
                stationStatus, reprintCount: 0,
                ts: { createdAt: nowIso },
                cancelReason: null,
            });

            this._audit(db, orderId, 'ORDER_CREATED', 'DRAFT', 'ORDER_CONFIRMED',
                'KIOSK', 'ลูกค้าสั่งเองที่ ' + (opts.kioskId || 'KIOSK-01'), opts.kioskId);
        }, 'order-create');

        return orderId;
    },

    /** บันทึกการพิมพ์ (§19 reprint) */
    logPrint(orderId, docType, width, station) {
        CFStore.mutate((db) => {
            const o = db.orders.find((x) => x.id === orderId);
            if (o && docType === 'receipt') o.reprintCount = (o.reprintCount || 0) + 1;
            this._audit(db, orderId || null, 'PRINT', null, null,
                (CFAuth.getUser() || {}).id || 'SYSTEM',
                [docType, station, width].filter(Boolean).join(' · '), CFApp.deviceId());
        }, 'print');
    },

    /** §8 — โครงข้อมูลขั้นต่ำของ audit log */
    _audit(db, orderId, eventType, oldStatus, newStatus, actor, reason, device) {
        db.auditLogs.unshift({
            id: 'AU-' + (++db.counters.auditSeq),
            ts: new Date().toISOString(),
            eventType, orderId,
            oldStatus: oldStatus || null, newStatus: newStatus || null,
            actor: actor || 'SYSTEM',
            device: device || CFApp.deviceId(),
            reason: reason || null,
            sourceIp: '192.168.1.31',
        });
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
