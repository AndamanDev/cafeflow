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
const { registerPayments } = require('./routes/payments');
const { registerReports } = require('./routes/reports');
const { registerMedia } = require('./routes/media');
const { registerDevices } = require('./routes/devices');
const { registerDisplay } = require('./routes/display');
const { startWorker } = require('./print/worker');

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
// รูปสินค้าอัปจากเครื่องได้ — ขนาดสูงสุดคุมไว้ที่ตัว route อีกชั้น
app.register(require('@fastify/multipart'), { limits: { fileSize: 12 * 1024 * 1024, files: 1 } });

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
   หน้าเว็บเปิดผ่านเซิร์ฟเวอร์นี้เท่านั้น — ทุกอย่างต้องมาจาก origin เดียว
   ไม่งั้น cookie ของ session ข้ามพอร์ตไม่ได้ */
async function registerStatic() {
    let staticPlugin;
    try { staticPlugin = require('@fastify/static'); } catch { return false; }

    await app.register(staticPlugin, { root: path.join(ROOT, 'app'), prefix: '/app/' });
    await app.register(staticPlugin, {
        root: path.join(ROOT, 'shared'), prefix: '/shared/', decorateReply: false,
    });
    await app.register(staticPlugin, {
        root: path.join(ROOT, 'design-system-2'), prefix: '/design-system-2/', decorateReply: false,
    });
    // รูปสินค้าที่อัปโหลดไว้ — ชื่อไฟล์เป็น sha256 ของเนื้อไฟล์
    // เนื้อไม่มีวันเปลี่ยนภายใต้ชื่อเดิม จึงให้เบราว์เซอร์ cache ได้ยาว ๆ
    const mediaRoot = path.join(ROOT, 'data', 'media');
    require('fs').mkdirSync(mediaRoot, { recursive: true });
    await app.register(staticPlugin, {
        root: mediaRoot, prefix: '/media/', decorateReply: false,
        maxAge: 31536000000, immutable: true,
    });
    return true;
}

/* ══════════════════════════════════════════════════════════════════
   ROUTES
   ══════════════════════════════════════════════════════════════════ */

/** คีออสก์เรียกทุก 5 วินาที — หลุดเกิน 30 วิแล้วมันจะขึ้นหน้า "สั่งที่เคาน์เตอร์" */
/**
 * เวอร์ชันของหน้าเว็บ — ลายนิ้วมือจากเวลาแก้ไขล่าสุดของไฟล์ที่หน้าเว็บโหลด
 * ทุกจอถามเป็นระยะ ถ้าเปลี่ยนแปลว่ามีการอัปเดต → โหลดใหม่เอง (ไม่ต้องไล่กด F5 ทุกเครื่อง)
 * ไม่ต้องล็อกอิน: บอกแค่ตัวเลข ไม่มีข้อมูลร้าน · คำนวณใหม่ไม่เกินทุก 5 วินาที
 */
let _ver = { at: 0, v: '' };
function webVersion() {
    if (Date.now() - _ver.at < 5000) return _ver.v;
    const fs = require('fs');
    let n = 0, max = 0;
    const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) walk(p);
            else if (/\.(js|css|html)$/.test(e.name)) { n++; max = Math.max(max, fs.statSync(p).mtimeMs); }
        }
    };
    for (const d of ['app', 'shared', 'design-system-2']) {
        try { walk(path.join(ROOT, d)); } catch { /* ไม่มีโฟลเดอร์ก็ข้าม */ }
    }
    _ver = { at: Date.now(), v: Math.round(max).toString(36) + '-' + n };
    return _ver.v;
}
app.get('/api/version', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    return { version: webVersion() };
});

app.get('/api/health', async () => {
    const t0 = Date.now();
    await query('SELECT 1');
    return { ok: true, db: Date.now() - t0, time: new Date().toISOString() };
});

app.get('/api/bootstrap', async (req, reply) => {
    // ★ ต้องเป็นพนักงานที่ล็อกอิน หรืออุปกรณ์ที่จับคู่แล้วเท่านั้น
    //   ก้อนนี้มีทั้งยอดขาย รายชื่อพนักงาน และค่าตั้งของร้าน — ก่อนหน้านี้เปิดให้
    //   ใครก็ได้ที่อยู่บน LAN อ่าน ซึ่งเป็นช่องเดียวกับที่ปิดไปแล้วฝั่งการเขียน
    const { currentUser } = require('./routes/auth');
    const { currentDevice } = require('./routes/devices');
    const user = await currentUser(query, req);
    const dev = user ? null : await currentDevice(query, req);

    // จอแสดงคิวถูกกันออกโดยตั้งใจ — มันเป็นทีวีที่แขวนให้คนทั้งร้านเห็นและ
    // เสียบทิ้งไว้โดยไม่มีใครดูแล ไม่ควรถือยอดขายกับรายชื่อพนักงานไว้ในเครื่อง
    // จอใช้ /api/display ที่ส่งเฉพาะเลขคิวกับสถานะแทน
    const NEEDS_SNAPSHOT = ['KIOSK', 'CASHIER', 'KDS'];
    if (!user && !(dev && NEEDS_SNAPSHOT.includes(dev.kind))) {
        return reply.code(401).send({ error: 'ต้องเข้าสู่ระบบ หรือจับคู่อุปกรณ์ก่อน' });
    }

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
    // เครื่องรายงานได้เฉพาะตัวเอง และต้องจับคู่แล้ว — ไม่งั้นใครก็ทำให้เครื่อง
    // ที่ปิดอยู่ดูเหมือนออนไลน์ได้ ซึ่งทำให้หน้าภาพรวมโกหก
    const { currentDevice } = require('./routes/devices');
    const dev = await currentDevice(query, req);
    const { currentUser } = require('./routes/auth');
    const user = dev ? null : await currentUser(query, req);
    if (!dev && !user) return reply.code(401).send({ error: 'อุปกรณ์นี้ยังไม่ได้จับคู่' });
    if (dev && dev.id !== req.params.id) {
        return reply.code(403).send({ error: 'รายงานสถานะแทนเครื่องอื่นไม่ได้' });
    }

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
registerPayments(app, { pool, tx, query, branchId: () => BRANCH_ID, helpers });
registerReports(app, { pool, tx, query, branchId: () => BRANCH_ID, helpers });
registerMedia(app, { query, branchId: () => BRANCH_ID, root: ROOT, helpers });
registerDevices(app, { query, tx, branchId: () => BRANCH_ID, helpers });
registerDisplay(app, { query, branchId: () => BRANCH_ID, helpers });

/* ══════════════════════════════════════════════════════════════════ */

async function start() {
    await waitReady();
    await resolveBranch();
    const hasStatic = await registerStatic();

    const port = parseInt(process.env.PORT || '8080', 10);
    const host = process.env.HOST || '::';     // dual-stack — ดูเหตุผลใน .env.example
    await app.listen({ port, host });

    // ตัวเดินคิวพิมพ์ — เริ่มหลังรู้สาขาแล้วเท่านั้น
    startWorker(pool, () => BRANCH_ID, {
        onDone: (job, ok, err) => {
            if (!ok) app.log.warn(`[print] งาน ${job.id} (${job.doc_type}) ล้ม: ${err}`);
        },
    });

    // อ่านสลิปด้วย OCR เบื้องหลัง — อ่านเสร็จแล้วบอกทุกจอให้การ์ดแคชเชียร์อัปเดตเอง
    const { startOcrWorker } = require('./ocr/worker');
    const { touch } = require('./routes/orders');
    startOcrWorker(pool, {
        url: process.env.CF_OCR_URL,
        onDone: async (o) => {
            await touch(pool, o.branch_id, 'orders', o.id, 'update');
            publish(o.branch_id, { entity: 'orders', op: 'update', id: o.id });
        },
    });

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
