/**
 * CafeFlow — จับคู่อุปกรณ์ (§30)
 * ══════════════════════════════════════════════════════════════════
 * ก่อนหน้านี้คีออสก์บอกตัวตนด้วย header `X-CF-Device` ที่ตัวเองประกาศเอง
 * ใครที่อยู่บน LAN (รวมลูกค้าที่ต่อ Wi-Fi ร้าน) จึงยิงสร้างออเดอร์จริงเข้าคิวครัวได้
 *
 * ตอนนี้ตัวตนต้องมาจากของที่ผู้จัดการเป็นคนออกให้:
 *   1. ผู้จัดการกด "จับคู่" ที่หลังบ้าน → ได้รหัส 6 หลัก อายุ 10 นาที (แสดงครั้งเดียว)
 *   2. ไปกรอกที่เครื่องคีออสก์ → เครื่องได้ token ยาวเก็บใน cookie httpOnly
 *   3. ทุก request ที่คีออสก์ยิงเข้ามาถูกตรวจจาก cookie ไม่ใช่จาก header
 *
 * ทำไมใช้รหัสสั้นแทนการพิมพ์ token ยาว ๆ: คนหน้าร้านต้องพิมพ์บนจอสัมผัส
 * รหัส 6 หลักอายุ 10 นาทีปลอดภัยพอ (เดาได้ 1 ใน 900,000 ต่อครั้ง และถูกล็อกหลังเดาผิด)
 */
'use strict';
const crypto = require('crypto');
const { ApiError } = require('./orders');
const { publish } = require('./stream');

const COOKIE = 'cf_device';
const CODE_TTL_MIN = 10;
const TOKEN_DAYS = 365;          // เครื่องในร้านจับคู่ครั้งเดียวจบ ไม่ควรหลุดกลางวันขาย

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

/** รหัส 6 หลัก ไม่มี 0/O/1/I ให้สับสนตอนอ่านจากจอไปพิมพ์อีกเครื่อง */
function makeCode() {
    const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let out = '';
    const buf = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) out += alphabet[buf[i] % alphabet.length];
    return out;
}

/** อ่านอุปกรณ์จาก cookie — ตัวเดียวที่เชื่อถือได้ */
async function currentDevice(query, req) {
    const raw = req.cookies && req.cookies[COOKIE];
    if (!raw) return null;
    const r = await query(
        `SELECT * FROM device
          WHERE pairing_token_hash = $1 AND active
            AND (paired_at IS NULL OR paired_at > now() - ($2 || ' days')::interval)`,
        [sha(raw), String(TOKEN_DAYS)]);
    return r.rows[0] || null;
}

/** นับครั้งที่กรอกรหัสผิดต่อ IP — กันการไล่เดารหัส 6 หลัก */
const fails = new Map();
function tooManyFails(ip) {
    const n = fails.get(ip) || 0;
    return n >= 10;
}

function registerDevices(app, deps) {
    const { query, branchId } = deps;
    const { context, requirePerm, handle } = deps.helpers;

    /**
     * ผู้จัดการขอรหัสจับคู่ให้อุปกรณ์หนึ่งเครื่อง
     * รหัสถูกแสดง "ครั้งเดียว" — ในฐานเก็บแต่ hash ดูย้อนหลังไม่ได้
     */
    app.post('/api/devices/:id/pair-code', handle(async (req) => {
        const ctx = await context(req);
        requirePerm(ctx, 'MENU_EDIT');       // ระดับผู้จัดการขึ้นไป

        const code = makeCode();
        const r = await query(
            `UPDATE device
                SET pair_code_hash = $3,
                    pair_code_expires_at = now() + ($4 || ' minutes')::interval,
                    pair_code_by = $5
              WHERE id = $1 AND branch_id = $2 AND active
              RETURNING id, name_th, kind`,
            [req.params.id, branchId(), sha(code), String(CODE_TTL_MIN), ctx.actorUserId]);
        if (!r.rows.length) throw new ApiError(404, 'ไม่พบอุปกรณ์');

        return { deviceId: r.rows[0].id, name: r.rows[0].name_th, kind: r.rows[0].kind,
                 code, expiresInMin: CODE_TTL_MIN };
    }));

    /** เครื่องคีออสก์กรอกรหัสเพื่อรับ token */
    app.post('/api/devices/pair', handle(async (req, reply) => {
        const ip = (req.ip || '').replace(/^::ffff:/, '');
        if (tooManyFails(ip)) {
            throw new ApiError(429, 'กรอกรหัสผิดหลายครั้งเกินไป — รอสักครู่แล้วลองใหม่');
        }

        const code = String((req.body || {}).code || '').trim().toUpperCase();
        if (!/^[A-Z0-9]{6}$/.test(code)) throw new ApiError(400, 'รหัสจับคู่ต้องเป็น 6 ตัวอักษร');

        const r = await query(
            `SELECT * FROM device
              WHERE branch_id = $1 AND active
                AND pair_code_hash = $2 AND pair_code_expires_at > now()`,
            [branchId(), sha(code)]);

        if (!r.rows.length) {
            fails.set(ip, (fails.get(ip) || 0) + 1);
            throw new ApiError(401, 'รหัสไม่ถูกต้องหรือหมดอายุแล้ว');
        }
        fails.delete(ip);

        const dev = r.rows[0];
        const token = crypto.randomBytes(32).toString('base64url');
        await query(
            `UPDATE device
                SET pairing_token_hash = $2, paired_at = now(), paired_ip = $3,
                    pair_code_hash = NULL, pair_code_expires_at = NULL,
                    last_seen_at = now()
              WHERE id = $1`,
            [dev.id, sha(token), ip || null]);

        reply.setCookie(COOKIE, token, {
            httpOnly: true, sameSite: 'lax', path: '/',
            maxAge: TOKEN_DAYS * 24 * 3600,
            secure: process.env.CF_COOKIE_SECURE === '1',
        });

        publish(branchId(), { entity: 'devices', op: 'update', id: dev.id });
        return { ok: true, deviceId: dev.id, name: dev.name_th, kind: dev.kind,
                 station: dev.assigned_station };
    }));

    /** เครื่องถามว่าตัวเองจับคู่อยู่กับอะไร — ใช้ตอน boot */
    app.get('/api/devices/me', handle(async (req) => {
        const dev = await currentDevice(query, req);
        if (!dev) return { paired: false };
        return { paired: true, deviceId: dev.id, name: dev.name_th, kind: dev.kind,
                 station: dev.assigned_station };
    }));

    /** เลิกจับคู่ — เครื่องหาย ถูกขโมย หรือย้ายไปใช้ที่อื่น */
    app.post('/api/devices/:id/unpair', handle(async (req) => {
        const ctx = await context(req);
        requirePerm(ctx, 'MENU_EDIT');
        const r = await query(
            `UPDATE device SET pairing_token_hash = NULL, paired_at = NULL,
                    pair_code_hash = NULL, pair_code_expires_at = NULL
              WHERE id = $1 AND branch_id = $2 RETURNING id`,
            [req.params.id, branchId()]);
        if (!r.rows.length) throw new ApiError(404, 'ไม่พบอุปกรณ์');
        publish(branchId(), { entity: 'devices', op: 'update', id: req.params.id });
        return { ok: true };
    }));
}

module.exports = { registerDevices, currentDevice, COOKIE, sha };
