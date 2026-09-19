/**
 * CafeFlow — ล็อกอินจริง
 * ══════════════════════════════════════════════════════════════════
 * แทนที่การเทียบรหัสผ่านดิบในเบราว์เซอร์ของโปรโตไทป์
 *
 *   POST /api/auth/login   { username, password }  → ตั้ง cookie + คืนข้อมูลผู้ใช้
 *   POST /api/auth/logout
 *   GET  /api/auth/me
 *
 * session token ถูก hash ก่อนเก็บลงฐาน — ฐานข้อมูลรั่วแล้วคนอ่านยังสวมสิทธิ์ไม่ได้
 * cookie เป็น httpOnly จึงอยู่นอกมือของ JavaScript ทุกตัวในหน้า
 */
'use strict';
const crypto = require('crypto');
const argon2 = require('argon2');

const COOKIE = 'cf_session';
const TTL_HOURS = 12;               // ยาวพอครอบหนึ่งกะ แต่ไม่ค้างข้ามวัน

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

/** หน่วงเมื่อรหัสผิด — กันการไล่เดารหัสจากในร้าน */
const fails = new Map();
function penalty(key) {
    const n = fails.get(key) || 0;
    return Math.min(n * 400, 3000);
}

async function currentUser(query, req) {
    const raw = req.cookies && req.cookies[COOKIE];
    if (!raw) return null;
    const r = await query(
        `SELECT u.*, s.token_hash FROM session s
           JOIN app_user u ON u.id = s.user_id
          WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
            AND u.active`,
        [hashToken(raw)]);
    return r.rows[0] || null;
}

function publicUser(u) {
    return {
        id: u.id, username: u.username, name: u.name_th, role: u.role,
        overrideLimit: u.override_limit == null ? null : Number(u.override_limit),
        active: u.active,
    };
}

function registerAuth(app, { query, branchId }) {
    app.post('/api/auth/login', async (req, reply) => {
        const username = String((req.body && req.body.username) || '').trim().toLowerCase();
        const password = String((req.body && req.body.password) || '');
        const key = username + '|' + req.ip;

        const wait = penalty(key);
        if (wait) await new Promise((r) => setTimeout(r, wait));

        const r = await query(
            'SELECT * FROM app_user WHERE branch_id = $1 AND lower(username) = $2',
            [branchId(), username]);
        const u = r.rows[0];

        // ข้อความเดียวกันทั้งกรณีไม่มีบัญชีและรหัสผิด — ไม่บอกใบ้ว่าชื่อไหนมีจริง
        const deny = () => {
            fails.set(key, (fails.get(key) || 0) + 1);
            return reply.code(401).send({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        };
        if (!u) { await argon2.hash('dummy'); return deny(); }   // ใช้เวลาเท่ากันเสมอ
        if (!(await argon2.verify(u.password_hash, password))) return deny();
        if (!u.active) return reply.code(403).send({ error: 'บัญชีนี้ถูกปิดการใช้งาน' });

        fails.delete(key);

        const token = crypto.randomBytes(32).toString('base64url');
        await query(
            `INSERT INTO session (token_hash, user_id, device_id, expires_at, last_seen_at)
             VALUES ($1, $2, $3, now() + ($4 || ' hours')::interval, now())`,
            [hashToken(token), u.id, req.headers['x-cf-device'] || null, String(TTL_HOURS)]);

        reply.setCookie(COOKIE, token, {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            maxAge: TTL_HOURS * 3600,
            // ร้านใช้ http บน LAN — เปิด secure เมื่อมี https จริงเท่านั้น
            secure: process.env.CF_COOKIE_SECURE === '1',
        });
        return { ok: true, user: publicUser(u) };
    });

    app.post('/api/auth/logout', async (req, reply) => {
        const raw = req.cookies && req.cookies[COOKIE];
        if (raw) {
            await query('UPDATE session SET revoked_at = now() WHERE token_hash = $1',
                [hashToken(raw)]);
        }
        reply.clearCookie(COOKIE, { path: '/' });
        return { ok: true };
    });

    app.get('/api/auth/me', async (req, reply) => {
        const u = await currentUser(query, req);
        if (!u) return reply.code(401).send({ error: 'ยังไม่ได้เข้าสู่ระบบ' });
        await query('UPDATE session SET last_seen_at = now() WHERE token_hash = $1',
            [hashToken(req.cookies[COOKIE])]);
        return { user: publicUser(u) };
    });
}

module.exports = { registerAuth, currentUser, publicUser, COOKIE, hashToken };
