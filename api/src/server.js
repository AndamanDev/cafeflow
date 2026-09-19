/**
 * CafeFlow — เซิร์ฟเวอร์ในร้าน
 * ══════════════════════════════════════════════════════════════════
 * แหล่งความจริงของ "วันทำการ" ทั้งหมด · คลาวด์เป็นแค่สำเนาอ่านอย่างเดียว
 * เครื่องทุกเครื่องในร้าน (คีออสก์ แคชเชียร์ จอครัว) คุยกับตัวนี้ผ่าน LAN
 *
 *   npm run dev     รันแบบ --watch
 *   npm start       รันปกติ
 *
 * ⚠️ ห้ามเปิดพอร์ตนี้ออกอินเทอร์เน็ต — ระบบออกแบบให้อยู่หลัง LAN เท่านั้น
 */
'use strict';
const path = require('path');
const fastify = require('fastify');
const { loadEnv, ROOT } = require('./env');
const { pool, query, tx, waitReady } = require('./db/pool');
const { buildSnapshot } = require('./routes/bootstrap');
const { registerStream, publish } = require('./routes/stream');
const { registerAuth } = require('./routes/auth');
const { registerOrders } = require('./routes/orders');
const { registerAdmin } = require('./routes/admin');

loadEnv();

const app = fastify({
    logger: {
        level: process.env.LOG_LEVEL || 'info',
        transport: process.env.NODE_ENV === 'production' ? undefined
            : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
    },
    // คีออสก์ส่งตะกร้าที่มีหลายรายการ แต่ไม่ควรมีใครยิงก้อนใหญ่กว่านี้
    bodyLimit: 1024 * 512,
});

app.register(require('@fastify/cookie'));

/* ── หาสาขาปัจจุบัน — ร้านเดียวก่อน แต่ทุก query ผูก branch_id ไว้แล้ว ── */
let BRANCH_ID = null;
async function resolveBranch() {
    const code = process.env.CF_BRANCH_CODE || 'MAIN';
    const r = await query('SELECT id FROM branch WHERE code = $1', [code]);
    if (!r.rows.length) {
        throw new Error(`ไม่พบสาขารหัส "${code}" — รัน npm run seed ก่อน`);
    }
    BRANCH_ID = r.rows[0].id;
    return BRANCH_ID;
}

/* ── เสิร์ฟหน้าเว็บจากเซิร์ฟเวอร์เดียวกัน ──
   ระหว่างพัฒนายังเปิดผ่าน python -m http.server ได้อยู่ แต่ในร้านจริง
   ทุกอย่างต้องมาจาก origin เดียว ไม่งั้น cookie ของ session ข้ามพอร์ตไม่ได้ */
async function registerStatic() {
    let staticPlugin;
    try { staticPlugin = require('@fastify/static'); } catch { return false; }

    // ★ ทับ cf-config.js ของ static ด้วยรุ่นที่ชี้ไปหลังบ้าน api
    //   หน้าเว็บที่เสิร์ฟจากเซิร์ฟเวอร์ในร้านจึงใช้ข้อมูลจริงเสมอ ส่วนชุดเดียวกัน
    //   ที่เปิดด้วย static server ธรรมดายังเป็นเดโมบน localStorage เหมือนเดิม
    //   (ต้องมาก่อน register static ไม่งั้นไฟล์จริงชนะ)
    app.get('/app/js/cf-config.js', (req, reply) => {
        reply.type('application/javascript; charset=utf-8')
            .header('Cache-Control', 'no-store')
            .send("/* เสิร์ฟโดยเซิร์ฟเวอร์ในร้าน */\nwindow.CF_BACKEND = 'api';\n");
    });
    await app.register(staticPlugin, { root: path.join(ROOT, 'app'), prefix: '/app/' });
    await app.register(staticPlugin, {
        root: path.join(ROOT, 'shared'), prefix: '/shared/', decorateReply: false,
    });
    await app.register(staticPlugin, {
        root: path.join(ROOT, 'design-system-2'), prefix: '/design-system-2/', decorateReply: false,
    });
    return true;
}

/* ══════════════════════════════════════════════════════════════════
   ROUTES
   ══════════════════════════════════════════════════════════════════ */

/** คีออสก์เรียกทุก 5 วินาที — หลุดเกิน 30 วิแล้วมันจะขึ้นหน้า "สั่งที่เคาน์เตอร์" */
app.get('/api/health', async () => {
    const t0 = Date.now();
    await query('SELECT 1');
    return { ok: true, db: Date.now() - t0, time: new Date().toISOString() };
});

app.get('/api/bootstrap', async (req) => {
    const hours = Math.min(parseInt(req.query.hours || '24', 10) || 24, 168);
    const client = await pool.connect();
    try {
        // อ่านทั้งหมดเป็นภาพ ณ จุดเวลาเดียว — ไม่งั้นได้ออเดอร์ที่ยังไม่มีรายการสินค้า
        // เพราะมีคนสั่งของแทรกระหว่างที่เรากำลังไล่อ่านทีละตาราง
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const snap = await buildSnapshot(client, BRANCH_ID, { hours });
        await client.query('COMMIT');
        return snap;
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch { /* connection ตายไปแล้ว */ }
        throw err;
    } finally {
        client.release();
    }
});

/** อุปกรณ์รายงานตัว — สถานะ ONLINE/OFFLINE บนหน้าภาพรวมมาจากตรงนี้เท่านั้น */
app.post('/api/devices/:id/heartbeat', async (req, reply) => {
    const r = await query(
        `UPDATE device SET last_seen_at = now(), ip = COALESCE($2::inet, ip)
          WHERE id = $1 AND branch_id = $3 RETURNING id`,
        [req.params.id, req.ip && req.ip !== '::1' ? req.ip.replace(/^::ffff:/, '') : null, BRANCH_ID]);
    if (!r.rows.length) return reply.code(404).send({ error: 'ไม่พบอุปกรณ์นี้' });
    publish(BRANCH_ID, { entity: 'devices', op: 'update', id: req.params.id });
    return { ok: true };
});

registerStream(app, () => BRANCH_ID);
registerAuth(app, { query, branchId: () => BRANCH_ID });
const helpers = registerOrders(app, { pool, tx, query, branchId: () => BRANCH_ID });
registerAdmin(app, { pool, tx, query, branchId: () => BRANCH_ID, helpers });

/* ══════════════════════════════════════════════════════════════════ */

async function start() {
    await waitReady();
    await resolveBranch();
    const hasStatic = await registerStatic();

    const port = parseInt(process.env.PORT || '8080', 10);
    const host = process.env.HOST || '0.0.0.0';
    await app.listen({ port, host });

    app.log.info(`สาขา ${process.env.CF_BRANCH_CODE || 'MAIN'} = ${BRANCH_ID}`);
    if (!hasStatic) app.log.warn('ไม่ได้ลง @fastify/static — หน้าเว็บยังต้องเปิดผ่านเซิร์ฟเวอร์เดิม');
}

if (require.main === module) {
    start().catch((err) => {
        console.error('สตาร์ทไม่สำเร็จ:', err.message);
        process.exit(1);
    });
}

module.exports = { app, start, resolveBranch, branchId: () => BRANCH_ID };
