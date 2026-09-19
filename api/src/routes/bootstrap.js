/**
 * GET /api/bootstrap
 * ══════════════════════════════════════════════════════════════════
 * คืนฐานข้อมูลก้อนเดียวรูปทรงเดียวกับ CF_SEED เพื่อให้ CFStore ฝั่งเบราว์เซอร์
 * cache ไว้ในหน่วยความจำแล้วอ่านแบบ synchronous ต่อได้เหมือนเดิม
 *
 * ⚠️ ไม่ส่งทั้งฐาน — ส่ง master data ทั้งหมด + ข้อมูลธุรกรรมเฉพาะ "หน้างานวันนี้"
 *    ประวัติย้อนหลังต้องไปทาง /api/orders?from=&to= (ดู A2 ในแผน)
 *    ถ้าวันหนึ่งหน้าไหนต้องการข้อมูลเก่ากว่านี้ ต้องแก้หน้านั้นให้เรียก endpoint นั้น
 *    ห้ามแก้ด้วยการขยายหน้าต่างนี้ไปเรื่อย ๆ จนโหลดทั้งปี
 */
'use strict';
const S = require('../serialize/snapshot');

/** อุปกรณ์ที่ไม่ส่งสัญญาณเกินเท่านี้ถือว่าออฟไลน์ (§30 บอกให้เต้นทุก 10–30 วิ) */
const ONLINE_CUTOFF_MS = 90 * 1000;

/** ออเดอร์ที่ยังไม่จบ ต้องอยู่ใน cache เสมอไม่ว่าจะเก่าแค่ไหน */
const OPEN_STATUSES = `('DRAFT','ORDER_CONFIRMED','WAITING_CASH','WAITING_PAYMENT',
                        'PAYMENT_TIMEOUT','PAYMENT_REVIEW','PAYMENT_FAILED','PAID',
                        'SENT_TO_KITCHEN','PREPARING','READY','SERVED')`;

/**
 * ⚠️ ทุก query ในนี้ทำ "ตามลำดับ" บน client ตัวเดียว ห้ามใช้ Promise.all
 *    เหตุผลสองข้อ:
 *    1. client ของ pg ยิงพร้อมกันไม่ได้ (pg@9 จะกลายเป็น error)
 *    2. snapshot ต้องเป็นภาพ ณ จุดเวลาเดียว — ผู้เรียกครอบด้วย
 *       REPEATABLE READ ให้แล้ว การแยกไปหลาย connection จะทำให้ได้ภาพคนละเวลา
 *       เช่นออเดอร์มาแล้วแต่รายการสินค้าของมันยังไม่มา
 *    ตารางเล็กและอยู่บน LAN การทำตามลำดับจึงไม่ใช่ปัญหา
 */
async function buildSnapshot(c, branchId, opts) {
    const hours = (opts && opts.hours) || 24;
    const auditLimit = (opts && opts.auditLimit) || 200;

    const q = async (sql, params) => (await c.query(sql, params)).rows;

    /* ── master data ── */
    const users = await q('SELECT * FROM app_user WHERE branch_id = $1 ORDER BY id', [branchId]);
    const devices = await q('SELECT * FROM device WHERE branch_id = $1 ORDER BY id', [branchId]);
    const categories = await q('SELECT * FROM category WHERE branch_id = $1 ORDER BY sort', [branchId]);
    // ราคายุบกลับเป็น sparse map ตรงนี้ — สินค้าที่ไม่มีแถวราคาเลยได้ {} ซึ่งถูกต้อง
    const products = await q(
        `SELECT p.*, COALESCE(pp.prices, '{}'::jsonb) AS prices
           FROM product p
           LEFT JOIN LATERAL (
               SELECT jsonb_object_agg(serve_type, price) AS prices
                 FROM product_price WHERE product_id = p.id
           ) pp ON true
          WHERE p.branch_id = $1 AND p.deleted_at IS NULL
          ORDER BY p.sort, p.id`, [branchId]);
    const groups = await q('SELECT * FROM modifier_group WHERE branch_id = $1 ORDER BY sort, id', [branchId]);
    const options = await q(
        `SELECT o.* FROM modifier_option o
           JOIN modifier_group g ON g.id = o.group_id
          WHERE g.branch_id = $1 ORDER BY o.group_id, o.sort`, [branchId]);
    const rules = await q('SELECT * FROM modifier_rule WHERE branch_id = $1 ORDER BY sort, id', [branchId]);
    const shifts = await q(
        `SELECT * FROM shift WHERE branch_id = $1
          ORDER BY business_date DESC, opened_at DESC LIMIT 30`, [branchId]);

    /* ── ธุรกรรมในหน้าต่างเวลา ── */
    const orders = await q(
        `SELECT o.*, COALESCE(ss.m, '{}'::jsonb) AS station_status
           FROM cf_order o
           LEFT JOIN LATERAL (
               SELECT jsonb_object_agg(station, status) AS m
                 FROM order_station_status WHERE order_id = o.id
           ) ss ON true
          WHERE o.branch_id = $1
            AND (o.status IN ${OPEN_STATUSES} OR o.created_at > now() - ($2 || ' hours')::interval)
          ORDER BY o.created_at DESC`, [branchId, String(hours)]);

    const orderIds = orders.map((o) => o.id);

    const items = orderIds.length ? await q(
        `SELECT i.*, COALESCE(m.mods, '[]'::jsonb) AS mods
           FROM order_item i
           LEFT JOIN LATERAL (
               SELECT jsonb_agg(jsonb_build_object(
                          'groupId', group_id, 'optionId', option_id, 'label', label,
                          'shortLabel', short_label, 'priceDelta', price_delta)
                      ORDER BY sort) AS mods
                 FROM order_item_modifier WHERE order_item_id = i.id
           ) m ON true
          WHERE i.order_id = ANY($1) ORDER BY i.order_id, i.line_no`, [orderIds]) : [];
    const payments = orderIds.length ? await q(
        'SELECT * FROM payment WHERE order_id = ANY($1) ORDER BY created_at', [orderIds]) : [];
    const audits = await q(
        `SELECT * FROM audit_log WHERE branch_id = $1
          ORDER BY ts DESC, id DESC LIMIT $2`, [branchId, auditLimit]);

    /* ── ค่าตั้ง: KV กลับเป็น object เดียว + ข้อมูลสาขา ── */
    const branch = (await q('SELECT * FROM branch WHERE id = $1', [branchId]))[0];
    const settings = {
        shopName: branch.name_th,
        branch: branch.code,
        address: branch.address,
        taxId: branch.tax_id,
        vatPercent: Number(branch.vat_percent),
        vatRegistered: branch.vat_registered,
        promptpayId: branch.promptpay_id || '',
    };
    for (const r of await q('SELECT key, value FROM app_setting WHERE branch_id = $1', [branchId])) {
        settings[r.key] = r.value;
    }

    const rev = Number((await q("SELECT last_value FROM global_rev"))[0].last_value);

    return {
        meta: { rev, branchId, serverTime: new Date().toISOString(), window: { hours } },
        settings,
        users: users.map(S.toUser),
        devices: devices.map((d) => S.toDevice(d, ONLINE_CUTOFF_MS)),
        categories: categories.map(S.toCategory),
        products: products.map(S.toProduct),
        modifierGroups: groups.map(S.toGroup),
        modifierOptions: options.map(S.toOption),
        modifierRules: rules.map(S.toRule),
        shifts: shifts.map(S.toShift),
        orders: orders.map(S.toOrder),
        orderItems: items.map(S.toOrderItem),
        payments: payments.map(S.toPayment),
        auditLogs: audits.map(S.toAudit),
    };
}

module.exports = { buildSnapshot, ONLINE_CUTOFF_MS };
