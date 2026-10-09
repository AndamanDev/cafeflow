/**
 * CafeFlow — จัดการข้อมูลอ้างอิงของเมนู (§10, §11)
 * ══════════════════════════════════════════════════════════════════
 *   หมวด            POST /api/categories · PATCH /api/categories/:id · DELETE /api/categories/:id
 *   กลุ่มตัวเลือก    POST /api/modifier-groups  (แก้ใช้ PATCH เดิมใน admin.js)
 *   ตัวเลือก         POST /api/modifier-groups/:id/options · PATCH /api/modifier-options/:id
 *   กฎ (ใช้กับอะไร)  PUT  /api/modifier-groups/:id/rules  { serveTypes:[], categoryIds:[] }
 *   ลำดับสินค้า      POST /api/products/reorder  { ids:[] }  (ลำดับในหมวด = ลำดับบนคีออสก์)
 *   ปรับราคาหลายตัว  POST /api/products/bulk-price { ids:[], mode:'add'|'pct', value, serveTypes? }
 *
 * ★ ไม่ลบจริงสิ่งที่บิลเก่าอ้างถึง — ปิดใช้งาน (active=false) แทน
 *   order_item_modifier เก็บ option_id ไว้ · product อ้าง category_id
 *   หมวดลบจริงได้เฉพาะตอนไม่มีสินค้าเลย (สร้างผิด กดลบทิ้ง)
 */
'use strict';
const crypto = require('crypto');
const { audit, touch, ApiError } = require('./orders');
const { publish } = require('./stream');

const SERVE_TYPES = ['HOT', 'ICED', 'FRAPPE', 'STD'];
const newId = (prefix) => prefix + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
const text = (v, max) => String(v == null ? '' : v).trim().slice(0, max || 120);
const optText = (v, max) => { const s = text(v, max); return s || null; };

function registerCatalog(app, deps) {
    const { tx, branchId } = deps;
    const { context, requirePerm, handle } = deps.helpers;

    /** ทุกคำสั่งในไฟล์นี้: สิทธิ์แก้เมนู · ทรานแซกชันเดียว · audit · change_log · แจ้งจออื่น */
    const write = (entity, reasonOf, fn) => handle(async (req) => {
        const ctx = await context(req);
        requirePerm(ctx, 'MENU_EDIT');
        const out = await tx(async (c) => {
            const r = await fn(c, req, ctx);
            await audit(c, branchId(), {
                eventType: 'PRODUCT_UPDATE', actorKind: ctx.actorKind,
                actorUserId: ctx.actorUserId, deviceId: ctx.deviceId, ip: ctx.ip,
                reason: reasonOf(r), payload: { entity, id: r.id },
            });
            await touch(c, branchId(), entity, r.id, r.op || 'update');
            return r;
        });
        publish(branchId(), { entity, op: out.op || 'update', id: out.id });
        return { ok: true, id: out.id };
    });

    /* ── หมวด ─────────────────────────────────────────────────── */
    app.post('/api/categories', write('categories', (r) => 'เพิ่มหมวด ' + r.name, async (c, req) => {
        const b = req.body || {};
        const name = text(b.nameTh, 60);
        if (!name) throw new ApiError(400, 'ต้องระบุชื่อหมวด');
        const dup = await c.query('SELECT 1 FROM category WHERE branch_id = $1 AND lower(name_th) = lower($2)',
            [branchId(), name]);
        if (dup.rows.length) throw new ApiError(409, 'มีหมวด "' + name + '" อยู่แล้ว');
        const id = newId('CAT');
        // ต่อท้ายสุด — ลำดับเลื่อนทีหลังได้
        await c.query(
            `INSERT INTO category (id, branch_id, name_th, name_en, sort, active)
             VALUES ($1, $2, $3, $4, (SELECT COALESCE(max(sort), 0) + 10 FROM category WHERE branch_id = $2), true)`,
            [id, branchId(), name, optText(b.nameEn, 60)]);
        return { id, name, op: 'insert' };
    }));

    app.patch('/api/categories/:id', write('categories', (r) => 'แก้ไขหมวด ' + r.name, async (c, req) => {
        const b = req.body || {};
        const cur = (await c.query('SELECT * FROM category WHERE id = $1 AND branch_id = $2 FOR UPDATE',
            [req.params.id, branchId()])).rows[0];
        if (!cur) throw new ApiError(404, 'ไม่พบหมวด');
        const name = b.nameTh !== undefined ? text(b.nameTh, 60) : cur.name_th;
        if (!name) throw new ApiError(400, 'ต้องระบุชื่อหมวด');
        const sort = b.sort !== undefined ? Number(b.sort) : cur.sort;
        if (!Number.isInteger(sort)) throw new ApiError(400, 'ลำดับไม่ถูกต้อง');
        await c.query(
            `UPDATE category SET name_th = $3, name_en = $4, sort = $5, active = $6
              WHERE id = $1 AND branch_id = $2`,
            [cur.id, branchId(), name, b.nameEn !== undefined ? optText(b.nameEn, 60) : cur.name_en,
             sort, b.active !== undefined ? b.active !== false : cur.active]);
        return { id: cur.id, name };
    }));

    app.delete('/api/categories/:id', write('categories', (r) => 'ลบหมวด ' + r.name, async (c, req) => {
        const cur = (await c.query('SELECT * FROM category WHERE id = $1 AND branch_id = $2 FOR UPDATE',
            [req.params.id, branchId()])).rows[0];
        if (!cur) throw new ApiError(404, 'ไม่พบหมวด');
        // นับรวมสินค้าที่ลบไปแล้ว — บิลเก่ายัง join หมวดผ่านสินค้าอยู่
        const n = Number((await c.query('SELECT count(*)::int AS n FROM product WHERE category_id = $1',
            [cur.id])).rows[0].n);
        if (n) throw new ApiError(409, `หมวดนี้มีสินค้า ${n} รายการ — ลบไม่ได้ ให้ปิดใช้งานแทน (หรือย้ายสินค้าไปหมวดอื่นก่อน)`);
        await c.query('DELETE FROM modifier_rule WHERE category_id = $1', [cur.id]);
        await c.query('DELETE FROM category WHERE id = $1', [cur.id]);
        return { id: cur.id, name: cur.name_th, op: 'delete' };
    }));

    /* ── กลุ่มตัวเลือก ─────────────────────────────────────────── */
    app.post('/api/modifier-groups', write('modifierGroups', (r) => 'เพิ่มกลุ่มตัวเลือก ' + r.name, async (c, req) => {
        const b = req.body || {};
        const name = text(b.nameTh, 60);
        if (!name) throw new ApiError(400, 'ต้องระบุชื่อกลุ่ม');
        const type = b.type === 'MULTI' ? 'MULTI' : 'SINGLE';
        let max = null;
        if (type === 'MULTI' && b.maxSelect != null && b.maxSelect !== '' && Number(b.maxSelect) !== 0) {
            max = Number(b.maxSelect);
            if (!Number.isInteger(max) || max < 1 || max > 20) throw new ApiError(400, 'เลือกได้สูงสุดต้องเป็นเลข 1–20');
        }
        const id = newId('MG');
        await c.query(
            `INSERT INTO modifier_group (id, branch_id, name_th, name_en, type, required, max_select, sort, active)
             VALUES ($1, $2, $3, $4, $5, $6, $7,
                     (SELECT COALESCE(max(sort), 0) + 10 FROM modifier_group WHERE branch_id = $2), true)`,
            [id, branchId(), name, optText(b.nameEn, 60), type, b.required === true, max]);
        return { id, name, op: 'insert' };
    }));

    /** กฎ "ใช้กับอะไร" — ส่งชุดใหม่ทั้งชุด แทนที่ของเดิม (แบบเสิร์ฟ และ/หรือ หมวด) */
    app.put('/api/modifier-groups/:id/rules', write('modifierRules', (r) => 'ตั้งกฎกลุ่มตัวเลือก ' + r.name, async (c, req) => {
        const b = req.body || {};
        const g = (await c.query('SELECT * FROM modifier_group WHERE id = $1 AND branch_id = $2 FOR UPDATE',
            [req.params.id, branchId()])).rows[0];
        if (!g) throw new ApiError(404, 'ไม่พบกลุ่มตัวเลือก');
        const serves = [...new Set((b.serveTypes || []).map(String))];
        if (serves.some((s) => !SERVE_TYPES.includes(s))) throw new ApiError(400, 'แบบเสิร์ฟไม่ถูกต้อง');
        const cats = [...new Set((b.categoryIds || []).map(String))];
        if (cats.length) {
            const ok = await c.query('SELECT id FROM category WHERE branch_id = $1 AND id = ANY($2)', [branchId(), cats]);
            if (ok.rows.length !== cats.length) throw new ApiError(400, 'มีหมวดที่ไม่พบ');
        }
        await c.query('DELETE FROM modifier_rule WHERE group_id = $1 AND branch_id = $2', [g.id, branchId()]);
        let sort = g.sort;      // ลำดับที่กลุ่มโผล่ในคีออสก์ = ลำดับของกลุ่ม
        for (const s of serves) {
            await c.query('INSERT INTO modifier_rule (id, branch_id, group_id, serve_type, sort) VALUES ($1,$2,$3,$4,$5)',
                [newId('MR'), branchId(), g.id, s, sort]);
        }
        for (const cid of cats) {
            await c.query('INSERT INTO modifier_rule (id, branch_id, group_id, category_id, sort) VALUES ($1,$2,$3,$4,$5)',
                [newId('MR'), branchId(), g.id, cid, sort]);
        }
        return { id: g.id, name: g.name_th };
    }));

    /* ── ตัวเลือกในกลุ่ม ───────────────────────────────────────── */
    async function optionFields(c, b, cur) {
        const pick = (k, d) => (b[k] !== undefined ? b[k] : d);
        const name = text(pick('nameTh', cur && cur.name_th), 80);
        if (!name) throw new ApiError(400, 'ต้องระบุชื่อตัวเลือก');
        const price = Number(pick('priceDelta', cur ? cur.price_delta : 0) || 0);
        if (!isFinite(price) || price < 0 || price > 10000) throw new ApiError(400, 'ราคาเพิ่มต้องเป็น 0 ขึ้นไป');
        const sort = Number(pick('sort', cur ? cur.sort : 0));
        if (!Number.isInteger(sort)) throw new ApiError(400, 'ลำดับไม่ถูกต้อง');
        return {
            name, price, sort,
            nameEn: optText(pick('nameEn', cur && cur.name_en), 80),
            // ตัวย่อบนใบเสร็จ 58 มม. — ไม่กรอกใช้ชื่อเต็ม
            short: optText(pick('shortLabel', cur && cur.short_label), 24) || name.slice(0, 24),
            isDefault: pick('isDefault', cur ? cur.is_default : false) === true,
            active: pick('active', cur ? cur.active : true) !== false,
        };
    }

    /** ค่าเริ่มต้นมีได้ตัวเดียวต่อกลุ่ม (unique index) — ล้างตัวอื่นก่อนตั้ง · ปิดใช้งานแล้วเป็นค่าเริ่มต้นไม่ได้ */
    async function setDefault(c, groupId, optionId, on) {
        if (!on) return;
        await c.query('UPDATE modifier_option SET is_default = false WHERE group_id = $1 AND id <> $2 AND is_default',
            [groupId, optionId]);
    }

    app.post('/api/modifier-groups/:id/options', write('modifierOptions', (r) => 'เพิ่มตัวเลือก ' + r.name, async (c, req) => {
        const g = (await c.query('SELECT * FROM modifier_group WHERE id = $1 AND branch_id = $2 FOR UPDATE',
            [req.params.id, branchId()])).rows[0];
        if (!g) throw new ApiError(404, 'ไม่พบกลุ่มตัวเลือก');
        const f = await optionFields(c, req.body || {}, null);
        const id = newId('MO');
        const sort = Number((await c.query('SELECT COALESCE(max(sort), 0) + 1 AS s FROM modifier_option WHERE group_id = $1',
            [g.id])).rows[0].s);
        const isDefault = f.isDefault && g.type === 'SINGLE';
        await setDefault(c, g.id, id, isDefault);
        await c.query(
            `INSERT INTO modifier_option (id, group_id, name_th, name_en, short_label, price_delta, is_default, sort, active)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)`,
            [id, g.id, f.name, f.nameEn, f.short, f.price, isDefault, sort]);
        return { id, name: f.name, op: 'insert' };
    }));

    app.patch('/api/modifier-options/:id', write('modifierOptions', (r) => 'แก้ไขตัวเลือก ' + r.name, async (c, req) => {
        const cur = (await c.query(
            `SELECT o.*, g.type FROM modifier_option o JOIN modifier_group g ON g.id = o.group_id
              WHERE o.id = $1 AND g.branch_id = $2 FOR UPDATE OF o`, [req.params.id, branchId()])).rows[0];
        if (!cur) throw new ApiError(404, 'ไม่พบตัวเลือก');
        const f = await optionFields(c, req.body || {}, cur);
        const isDefault = f.isDefault && f.active && cur.type === 'SINGLE';
        await setDefault(c, cur.group_id, cur.id, isDefault);
        await c.query(
            `UPDATE modifier_option SET name_th = $2, name_en = $3, short_label = $4, price_delta = $5,
                    is_default = $6, sort = $7, active = $8 WHERE id = $1`,
            [cur.id, f.name, f.nameEn, f.short, f.price, isDefault, f.sort, f.active]);
        return { id: cur.id, name: f.name };
    }));
}

function registerProductTools(app, deps) {
    const { tx, branchId } = deps;
    const { context, requirePerm, handle } = deps.helpers;

    /** เรียงสินค้าตาม ids ที่ส่งมา (สินค้าในหมวดเดียวกัน) — sort = 10, 20, 30 … */
    app.post('/api/products/reorder', handle(async (req) => {
        const ctx = await context(req);
        requirePerm(ctx, 'MENU_EDIT');
        const ids = [...new Set(((req.body || {}).ids || []).map(String))];
        if (!ids.length || ids.length > 500) throw new ApiError(400, 'รายการสินค้าไม่ถูกต้อง');
        await tx(async (c) => {
            const n = (await c.query('SELECT count(*)::int AS n FROM product WHERE branch_id = $1 AND id = ANY($2)',
                [branchId(), ids])).rows[0].n;
            if (n !== ids.length) throw new ApiError(400, 'มีสินค้าที่ไม่พบ');
            for (const [i, id] of ids.entries()) {
                await c.query('UPDATE product SET sort = $2 WHERE id = $1', [id, (i + 1) * 10]);
            }
            await touch(c, branchId(), 'products', ids[0], 'update');
        });
        publish(branchId(), { entity: 'products', op: 'update', id: ids[0] });
        return { ok: true };
    }));

    /**
     * ปรับราคาหลายรายการ — บวก/ลบเป็นบาท หรือเป็น % (ปัดเป็นบาทเต็ม)
     * ราคาหลังปรับต้องมากกว่า 0 ทุกแถว ไม่งั้นไม่ปรับเลยสักแถว (ทรานแซกชันเดียว)
     */
    app.post('/api/products/bulk-price', handle(async (req) => {
        const ctx = await context(req);
        requirePerm(ctx, 'PRICE_EDIT');
        const b = req.body || {};
        const ids = [...new Set((b.ids || []).map(String))];
        const value = Number(b.value);
        const mode = b.mode === 'pct' ? 'pct' : 'add';
        if (!ids.length) throw new ApiError(400, 'ยังไม่ได้เลือกสินค้า');
        if (!isFinite(value) || value === 0) throw new ApiError(400, 'ใส่จำนวนที่จะปรับ (ไม่ใช่ 0)');
        if (mode === 'pct' && (value <= -100 || value > 500)) throw new ApiError(400, 'เปอร์เซ็นต์ต้องอยู่ระหว่าง -99 ถึง 500');
        const serves = (b.serveTypes || []).filter((s) => SERVE_TYPES.includes(s));

        const out = await tx(async (c) => {
            const rows = (await c.query(
                `SELECT pp.product_id, pp.serve_type, pp.price, p.name_th FROM product_price pp
                   JOIN product p ON p.id = pp.product_id
                  WHERE p.branch_id = $1 AND p.id = ANY($2) AND p.deleted_at IS NULL
                    AND ($3::text[] IS NULL OR pp.serve_type = ANY($3))
                  FOR UPDATE OF pp`, [branchId(), ids, serves.length ? serves : null])).rows;
            let changed = 0;
            for (const r of rows) {
                const old = Number(r.price);
                const nu = mode === 'pct' ? Math.round(old * (1 + value / 100)) : Math.round((old + value) * 100) / 100;
                if (!(nu > 0)) throw new ApiError(400, `"${r.name_th}" ราคาหลังปรับเหลือ ${nu} — ต้องมากกว่า 0`);
                if (nu === old) continue;
                await c.query('UPDATE product_price SET price = $3 WHERE product_id = $1 AND serve_type = $2',
                    [r.product_id, r.serve_type, nu]);
                changed++;
            }
            await audit(c, branchId(), {
                eventType: 'PRODUCT_UPDATE', actorKind: ctx.actorKind, actorUserId: ctx.actorUserId,
                deviceId: ctx.deviceId, ip: ctx.ip,
                reason: `ปรับราคา ${ids.length} สินค้า ${mode === 'pct' ? value + '%' : (value > 0 ? '+' : '') + value + ' บาท'}`,
                payload: { ids, mode, value, serves, changed },
            });
            await touch(c, branchId(), 'products', ids[0], 'update');
            return { changed };
        });
        publish(branchId(), { entity: 'products', op: 'update', id: ids[0] });
        return { ok: true, changed: out.changed };
    }));
}

module.exports = { registerCatalog, registerProductTools };
