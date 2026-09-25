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
const net = require('net');
const { ApiError, audit, touch } = require('./orders');
const { listUsbPrinters, isLinuxDevice } = require('../print/usb');
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

const STATIONS = ['BAR', 'KITCHEN', 'BAKERY', 'DESSERT'];

/**
 * ตรวจและแปลงค่าตั้งเครื่องพิมพ์จากหน้าเว็บ → คอลัมน์ของตาราง device
 * cur = แถวเดิม (ตอนแก้) — ฟิลด์ที่ไม่ได้ส่งมาใช้ค่าเดิม
 */
async function printerFields(c, branchId, body, cur) {
    const pick = (k, dflt) => (body[k] !== undefined ? body[k] : dflt);

    const name = String(pick('name', cur && cur.name_th) || '').trim();
    if (!name) throw new ApiError(400, 'ต้องตั้งชื่อเครื่องพิมพ์');

    const conn = pick('conn', (cur && cur.printer_conn) || 'NETWORK');
    if (!['NETWORK', 'USB'].includes(conn)) throw new ApiError(400, 'การเชื่อมต่อต้องเป็น LAN หรือ USB');

    let host = null, port = 9100, usb = null;
    if (conn === 'NETWORK') {
        host = String(pick('host', cur && cur.printer_host) || '').trim();
        if (!net.isIP(host)) throw new ApiError(400, 'IP ของเครื่องพิมพ์ไม่ถูกต้อง เช่น 192.168.1.50');
        port = Number(pick('port', (cur && cur.printer_port) || 9100));
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            throw new ApiError(400, 'พอร์ตต้องเป็นตัวเลข 1–65535 (ปกติคือ 9100)');
        }
    } else {
        usb = String(pick('usb', cur && cur.printer_usb) || '').trim();
        if (!usb) throw new ApiError(400, 'ต้องเลือกเครื่องพิมพ์ USB');
        if (process.platform !== 'win32' && !isLinuxDevice(usb)) {
            throw new ApiError(400, 'เครื่องพิมพ์ USB ต้องเป็นอุปกรณ์เช่น /dev/usb/lp0');
        }
    }

    // พิมพ์ให้คีออสก์ตัวไหน — ผูกคีออสก์แล้วไม่ผูกสถานี (เครื่องนี้พิมพ์แค่ใบรับออเดอร์ของตู้นั้น)
    const kiosk = pick('kiosk', cur ? cur.serves_kiosk : null) || null;
    if (kiosk) {
        const k = await c.query(
            `SELECT id FROM device WHERE id = $1 AND branch_id = $2 AND kind = 'KIOSK'`, [kiosk, branchId]);
        if (!k.rows.length) throw new ApiError(400, 'ไม่พบคีออสก์ที่เลือก');
    }
    // USB ต้องเสียบที่เครื่องเซิร์ฟเวอร์ — เสียบที่ตู้คีออสก์แล้วเซิร์ฟเวอร์สั่งพิมพ์ไม่ได้
    if (kiosk && conn === 'USB') throw new ApiError(400, 'เครื่องพิมพ์ของคีออสก์ต้องต่อแบบ LAN / IP');
    const station = kiosk ? null : (pick('station', cur ? cur.assigned_station : null) || null);
    if (station && !STATIONS.includes(station)) throw new ApiError(400, 'ส่วนที่พิมพ์ไม่ถูกต้อง');

    const paper = pick('paperWidth', (cur && cur.paper_width) || '80mm');
    if (!['58mm', '80mm'].includes(paper)) throw new ApiError(400, 'กระดาษต้องเป็น 58mm หรือ 80mm');

    const fallback = pick('fallbackId', cur ? cur.fallback_printer_id : null) || null;
    if (fallback) {
        if (cur && fallback === cur.id) throw new ApiError(400, 'เครื่องสำรองต้องเป็นเครื่องอื่น ไม่ใช่ตัวเอง');
        const fb = await c.query(
            `SELECT id FROM device WHERE id = $1 AND branch_id = $2 AND kind = 'PRINTER' AND active`,
            [fallback, branchId]);
        if (!fb.rows.length) throw new ApiError(400, 'ไม่พบเครื่องพิมพ์สำรองที่เลือก');
    }

    // ความกว้างที่พิมพ์ได้ (จุด) — null = มาตรฐาน 203 dpi ตามขนาดกระดาษ
    let dots = pick('dots', cur ? cur.print_dots : null);
    dots = dots == null || dots === '' ? null : Number(dots);
    if (dots != null && !(Number.isInteger(dots) && dots >= 200 && dots <= 832 && dots % 8 === 0)) {
        throw new ApiError(400, 'ความกว้างที่พิมพ์ได้ต้องเป็นจำนวนจุด 200–832 ที่หารด้วย 8 ลงตัว');
    }

    const active = pick('active', cur ? cur.active : true) !== false;
    return { name, conn, host, port, usb, station, kiosk, paper, dots, fallback, active };
}

function registerDevices(app, deps) {
    const { query, tx, branchId } = deps;
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

    /* ══════════════════════════════════════════════════════
       เครื่องพิมพ์ (§19) — เพิ่ม/แก้จากหน้าภาพรวม
       ลบจริงไม่ได้: print_job เก่ายังอ้าง device_id อยู่ → ปิดใช้งานแทน
       ══════════════════════════════════════════════════════ */

    /** เครื่องพิมพ์ที่เครื่องเซิร์ฟเวอร์มองเห็น — ใช้เติมตัวเลือก USB */
    app.get('/api/printers/usb', handle(async (req) => {
        const ctx = await context(req);
        requirePerm(ctx, 'MENU_EDIT');
        try {
            return { platform: process.platform, printers: await listUsbPrinters() };
        } catch (err) {
            throw new ApiError(500, 'อ่านรายชื่อเครื่องพิมพ์ในเครื่องไม่ได้: ' + err.message);
        }
    }));

    async function savePrinter(c, ctx, id, isNew, body) {
        let cur = null;
        if (!isNew) {
            cur = (await c.query(
                `SELECT * FROM device WHERE id = $1 AND branch_id = $2 AND kind = 'PRINTER' FOR UPDATE`,
                [id, branchId()])).rows[0];
            if (!cur) throw new ApiError(404, 'ไม่พบเครื่องพิมพ์');
        }
        const f = await printerFields(c, branchId(), body, cur);

        if (isNew) {
            await c.query(
                `INSERT INTO device (id, branch_id, kind, name_th, printer_conn, printer_host, printer_port,
                                     printer_usb, assigned_station, paper_width, fallback_printer_id, active,
                                     print_dots, serves_kiosk)
                 VALUES ($1,$2,'PRINTER',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
                [id, branchId(), f.name, f.conn, f.host, f.port, f.usb, f.station, f.paper,
                 f.fallback, f.active, f.dots, f.kiosk]);
        } else {
            await c.query(
                `UPDATE device SET name_th = $3, printer_conn = $4, printer_host = $5, printer_port = $6,
                        printer_usb = $7, assigned_station = $8, paper_width = $9,
                        fallback_printer_id = $10, active = $11, print_dots = $12, serves_kiosk = $13
                  WHERE id = $1 AND branch_id = $2`,
                [id, branchId(), f.name, f.conn, f.host, f.port, f.usb, f.station, f.paper,
                 f.fallback, f.active, f.dots, f.kiosk]);
            // ปิดเครื่องที่เป็นสำรองของเครื่องอื่น → ถอดออก ไม่งั้นดูเหมือนมีสำรองแต่ใช้ไม่ได้จริง
            if (!f.active) {
                await c.query(
                    `UPDATE device SET fallback_printer_id = NULL
                      WHERE branch_id = $1 AND fallback_printer_id = $2`, [branchId(), id]);
            }
        }

        await audit(c, branchId(), {
            eventType: 'DEVICE_UPDATE', actorKind: ctx.actorKind,
            actorUserId: ctx.actorUserId, deviceId: ctx.deviceId, ip: ctx.ip,
            reason: (isNew ? 'เพิ่มเครื่องพิมพ์ ' : 'แก้ไขเครื่องพิมพ์ ') + f.name,
            payload: { printerId: id, conn: f.conn, host: f.host, usb: f.usb, station: f.station },
        });
        await touch(c, branchId(), 'devices', id, isNew ? 'insert' : 'update');
        return { ok: true, id };
    }

    app.post('/api/printers', handle(async (req) => {
        const ctx = await context(req);
        requirePerm(ctx, 'MENU_EDIT');
        const id = 'PRN-' + crypto.randomBytes(3).toString('hex').toUpperCase();
        const out = await tx((c) => savePrinter(c, ctx, id, true, req.body || {}));
        publish(branchId(), { entity: 'devices', op: 'insert', id });
        return out;
    }));

    app.patch('/api/printers/:id', handle(async (req) => {
        const ctx = await context(req);
        requirePerm(ctx, 'MENU_EDIT');
        const out = await tx((c) => savePrinter(c, ctx, req.params.id, false, req.body || {}));
        publish(branchId(), { entity: 'devices', op: 'update', id: req.params.id });
        return out;
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
