/**
 * CafeFlow — ล็อกอินจริง
 * ══════════════════════════════════════════════════════════════════
 * แทนที่การเทียบรหัสผ่านดิบในเบราว์เซอร์ของโปรโตไทป์
 *
 *   POST /api/auth/login   { username, password }  → ตั้ง cookie + คืนข้อมูลผู้ใช้
 *   POST /api/auth/logout
 *   GET  /api/auth/me
 *   POST /api/auth/password          { current, next }  เปลี่ยนรหัสของตัวเอง
 *   POST /api/users/:id/password     { next }           แอดมินตั้งรหัสให้คนอื่น
 *   GET  /api/users/weak-passwords                      บัญชีที่ยังใช้รหัสตั้งต้น
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

/**
 * หน้าที่ลูกค้าใช้ (คีออสก์ · จอคิว) ห้ามได้สิทธิ์พนักงานเด็ดขาด
 * cookie ของ session ใช้ร่วมทั้งเบราว์เซอร์ — ถ้ามีคนเผลอล็อกอินพนักงานไว้ในเครื่องคีออสก์
 * ทุกอย่างที่ลูกค้ากดจะกลายเป็นพนักงานกด (เช่นยืนยันรับเงินเอง) หน้าพวกนี้จึงประกาศตัว
 * แล้วเซิร์ฟเวอร์ไม่ดู session พนักงานเลย ใช้ได้แค่ตัวตนของเครื่องที่จับคู่ไว้
 *
 * header ปลอมได้ก็จริง แต่ทางเดียวที่ปลอมได้คือ "ลดสิทธิ์ตัวเอง" — ไม่มีทางใช้เพิ่มสิทธิ์
 */
const PUBLIC_CLIENTS = ['kiosk', 'display'];
const isPublicClient = (req) => PUBLIC_CLIENTS.includes(String(req.headers['x-cf-client'] || ''));

async function currentUser(query, req) {
    if (isPublicClient(req)) return null;
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

/** รหัสตั้งต้นจาก seed — ใครยังใช้อยู่ต้องถูกบังคับเปลี่ยน */
const SEED_PASSWORD = 'demo';

/** คืนข้อความผิดพลาด หรือ null ถ้าใช้ได้ */
function passwordProblem(pw, username) {
    pw = String(pw || '');
    if (pw.length < 6) return 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร';
    if (pw.toLowerCase() === SEED_PASSWORD) return 'ห้ามใช้รหัสผ่านตั้งต้น';
    if (username && pw.toLowerCase() === String(username).toLowerCase()) {
        return 'รหัสผ่านต้องไม่เหมือนชื่อผู้ใช้';
    }
    return null;
}

const hashPassword = (pw) => argon2.hash(pw, { type: argon2.argon2id });

function registerAuth(app, { query, branchId }) {
    const { CFPerms } = require('../../../shared/cf-perms.js');
    const fail = (reply, code, msg) => reply.code(code).send({ error: msg });

    /** บันทึกลง audit — ใช้ query ตรงได้เพราะเป็นคำสั่งเดียว ไม่ต้องอยู่ทรานแซกชันร่วมกับอะไร */
    async function auditPw(req, actor, target, reason) {
        const { audit } = require('./orders');
        await audit({ query }, branchId(), {
            eventType: 'USER_PASSWORD', actorKind: 'USER', actorUserId: actor.id,
            ip: (req.ip || '').replace(/^::ffff:/, '') || null,
            reason, payload: { userId: target.id, username: target.username },
        });
    }

    /** เปลี่ยนรหัสของตัวเอง — ต้องรู้รหัสเดิม กันคนที่เดินมาเจอหน้าจอที่ล็อกอินค้างไว้ */
    app.post('/api/auth/password', async (req, reply) => {
        const u = await currentUser(query, req);
        if (!u) return fail(reply, 401, 'ยังไม่ได้เข้าสู่ระบบ');
        const { current, next } = req.body || {};
        if (!(await argon2.verify(u.password_hash, String(current || '')))) {
            return fail(reply, 400, 'รหัสผ่านเดิมไม่ถูกต้อง');
        }
        const bad = passwordProblem(next, u.username);
        if (bad) return fail(reply, 400, bad);
        if (await argon2.verify(u.password_hash, String(next))) {
            return fail(reply, 400, 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม');
        }

        await query('UPDATE app_user SET password_hash = $2, updated_at = now() WHERE id = $1',
            [u.id, await hashPassword(String(next))]);
        // ตัด session อื่นของบัญชีนี้ทั้งหมด — ถ้าเปลี่ยนเพราะรหัสหลุด คนที่ใช้อยู่ต้องหลุดด้วย
        await query(
            `UPDATE session SET revoked_at = now()
              WHERE user_id = $1 AND revoked_at IS NULL AND token_hash <> $2`,
            [u.id, u.token_hash]);
        await auditPw(req, u, u, 'เปลี่ยนรหัสผ่านของตัวเอง');
        return { ok: true };
    });

    /** แอดมินตั้งรหัสใหม่ให้ผู้ใช้อื่น — ใช้ตอนพนักงานลืมรหัส หรือเพิ่งรับเข้าทำงาน */
    app.post('/api/users/:id/password', async (req, reply) => {
        const me = await currentUser(query, req);
        if (!me) return fail(reply, 401, 'ยังไม่ได้เข้าสู่ระบบ');
        if (!CFPerms.can(me.role, 'USER_MANAGE')) return fail(reply, 403, 'บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้');

        const t = (await query('SELECT * FROM app_user WHERE id = $1 AND branch_id = $2',
            [req.params.id, branchId()])).rows[0];
        if (!t) return fail(reply, 404, 'ไม่พบผู้ใช้');
        const next = String((req.body || {}).next || '');
        const bad = passwordProblem(next, t.username);
        if (bad) return fail(reply, 400, bad);

        await query('UPDATE app_user SET password_hash = $2, updated_at = now() WHERE id = $1',
            [t.id, await hashPassword(next)]);
        // ตั้งให้คนอื่น → ตัดทุก session ของคนนั้น (ยกเว้นตั้งให้ตัวเอง ไม่งั้นหลุดจากหน้าที่กดอยู่)
        await query(
            `UPDATE session SET revoked_at = now()
              WHERE user_id = $1 AND revoked_at IS NULL AND token_hash <> $2`,
            [t.id, me.token_hash]);
        await auditPw(req, me, t, 'ตั้งรหัสผ่านใหม่ให้ ' + t.username);
        return { ok: true };
    });

    /** บัญชีที่ยังใช้รหัสตั้งต้น — หน้าภาพรวมใช้เตือนแอดมินก่อนเปิดร้าน */
    app.get('/api/users/weak-passwords', async (req, reply) => {
        const me = await currentUser(query, req);
        if (!me) return fail(reply, 401, 'ยังไม่ได้เข้าสู่ระบบ');
        if (!CFPerms.can(me.role, 'USER_MANAGE')) return fail(reply, 403, 'บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้');
        const users = (await query(
            'SELECT id, username, name_th, password_hash FROM app_user WHERE branch_id = $1 AND active ORDER BY username',
            [branchId()])).rows;
        const weak = [];
        for (const u of users) {
            if (await argon2.verify(u.password_hash, SEED_PASSWORD)) {
                weak.push({ id: u.id, username: u.username, name: u.name_th });
            }
        }
        return { users: weak };
    });

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
        return { ok: true, user: publicUser(u), mustChangePassword: password.toLowerCase() === SEED_PASSWORD };
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

module.exports = { registerAuth, currentUser, isPublicClient, publicUser, COOKIE, hashToken };
