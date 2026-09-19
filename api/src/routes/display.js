/**
 * CafeFlow — จอแสดงคิวลูกค้า (§22, §36)
 * ══════════════════════════════════════════════════════════════════
 * ★ จอนี้ไม่ใช้ /api/bootstrap โดยตั้งใจ
 *   มันเป็นทีวีที่แขวนให้คนทั้งร้านเห็น และมักเสียบทิ้งไว้ตลอดโดยไม่มีใครดูแล
 *   ถ้าให้มันถือ snapshot ทั้งก้อน (ยอดขาย รายชื่อพนักงาน ค่าตั้งร้าน)
 *   ใครเปิด devtools ที่ทีวีก็อ่านได้หมด
 *
 *   endpoint นี้จึงส่งเฉพาะสิ่งที่ต้องขึ้นจอ: เลขคิวกับสถานะ — ไม่มีราคา
 *   ไม่มีชื่อลูกค้า ไม่มียอดเงิน
 */
'use strict';
const { ApiError } = require('./orders');

/** เรียงตามเวลาที่เข้าครัว — คิวที่สั่งก่อนต้องอยู่ก่อน ไม่ใช่เรียงตามเลข */
const SQL = `
    SELECT o.order_no, o.status, o.dining_option,
           o.sent_at, o.ready_at, o.created_at
      FROM cf_order o
     WHERE o.branch_id = $1
       AND o.status IN ('SENT_TO_KITCHEN','PREPARING','READY')
     ORDER BY COALESCE(o.sent_at, o.created_at)`;

function registerDisplay(app, deps) {
    const { query, branchId } = deps;
    const { context, handle } = deps.helpers;

    app.get('/api/display', handle(async (req) => {
        const ctx = await context(req);
        // จอที่จับคู่แล้วดูได้ · พนักงานที่ล็อกอินก็ดูได้ (ไว้พรีวิวจากหลังบ้าน)
        const okDevice = ctx.device && ['DISPLAY', 'KDS', 'CASHIER'].includes(ctx.device.kind);
        if (!ctx.user && !okDevice) {
            throw new ApiError(401, 'จอนี้ยังไม่ได้จับคู่กับร้าน — ขอรหัสจับคู่จากผู้จัดการ');
        }

        const rows = (await query(SQL, [branchId()])).rows;
        const branch = (await query('SELECT name_th FROM branch WHERE id = $1',
            [branchId()])).rows[0];

        const preparing = [];
        const ready = [];
        for (const r of rows) {
            const item = {
                orderNo: r.order_no,
                takeAway: r.dining_option === 'TAKE_AWAY',
                since: r.status === 'READY' ? r.ready_at : (r.sent_at || r.created_at),
            };
            (r.status === 'READY' ? ready : preparing).push(item);
        }
        // คิวที่พร้อมแล้วเรียงใหม่ให้ใบที่เพิ่งพร้อมอยู่บนสุด — ลูกค้ามองหาเลขตัวเอง
        // ที่เพิ่งถูกเรียก ไม่ใช่ใบที่พร้อมมาตั้งแต่สิบนาทีที่แล้ว
        ready.sort((a, b) => new Date(b.since) - new Date(a.since));

        return {
            shopName: branch ? branch.name_th : 'CafeFlow',
            serverTime: new Date().toISOString(),
            preparing, ready,
        };
    }));

    /**
     * เมนูแนะนำสำหรับพื้นที่โฆษณา 40% (§22)
     * CMS โฆษณาจริง (§23) ยังไม่ได้ทำ — ระหว่างนี้หมุนเมนูแนะนำของร้านแทน
     * ดีกว่าปล่อยพื้นที่ว่างหรือใส่ภาพ placeholder ที่ไม่มีประโยชน์กับใคร
     */
    app.get('/api/display/highlights', handle(async (req) => {
        const ctx = await context(req);
        const okDevice = ctx.device && ctx.device.kind === 'DISPLAY';
        if (!ctx.user && !okDevice) throw new ApiError(401, 'จอนี้ยังไม่ได้จับคู่กับร้าน');

        const r = await query(
            `SELECT p.id, p.name_th, p.name_en, p.image_url, p.art_key, p.category_id,
                    (SELECT min(price) FROM product_price WHERE product_id = p.id) AS from_price
               FROM product p
              WHERE p.branch_id = $1 AND p.active AND NOT p.sold_out
                AND p.deleted_at IS NULL AND p.recommended
              ORDER BY p.sort, p.id LIMIT 8`, [branchId()]);

        return {
            items: r.rows.map((x) => ({
                id: x.id, nameTh: x.name_th, nameEn: x.name_en,
                imageUrl: x.image_url, artKey: x.art_key, categoryId: x.category_id,
                fromPrice: x.from_price == null ? null : Number(x.from_price),
            })),
        };
    }));
}

module.exports = { registerDisplay };
