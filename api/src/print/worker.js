/**
 * CafeFlow — คิวงานพิมพ์ (§19)
 * ══════════════════════════════════════════════════════════════════
 * ทำไมต้องมีคิว ไม่ยิงเข้าเครื่องพิมพ์ตรง ๆ:
 *   เครื่องพิมพ์กระดาษหมด ฝาเปิด หรือสายหลุด เป็นเรื่องปกติของหน้าร้าน
 *   ถ้ายิงตรงแล้วล้ม ตั๋วใบนั้นหายไปเลยและไม่มีใครรู้จนลูกค้ามาทวง
 *   คิวทำให้ลองใหม่ได้ ตกไปเครื่องสำรองได้ และเห็นว่าค้างอยู่กี่ใบ
 *
 * งานพิมพ์ถูกสร้าง "ในทรานแซกชันเดียวกับที่ออเดอร์เข้าครัว" — ถ้าออเดอร์ถูก
 * rollback ตั๋วต้องไม่ถูกพิมพ์ด้วย
 */
'use strict';
const net = require('net');
const { sendUsb } = require('./usb');

const RETRY_MAX = 3;
const RETRY_DELAY_MS = [1000, 4000, 10000];   // ถอยห่างขึ้นเรื่อย ๆ
const CONNECT_TIMEOUT_MS = 5000;

/**
 * ส่ง byte เข้าเครื่องพิมพ์ผ่าน TCP 9100 (RAW / JetDirect)
 *
 * ⚠️ เครื่องพิมพ์ความร้อนส่วนใหญ่ "ไม่ตอบอะไรกลับ" — เขียนสำเร็จไม่ได้แปลว่า
 *    กระดาษออก อาจกระดาษหมดอยู่ก็ได้ เราจึงยืนยันได้แค่ว่าส่งถึงเครื่องแล้ว
 *    ส่วนสถานะจริงต้องให้คนดู นี่คือข้อจำกัดของโปรโตคอล ไม่ใช่ของโค้ด
 */
function sendRaw(host, port, buf, timeoutMs = CONNECT_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const sock = new net.Socket();
        let settled = false;
        const done = (err) => {
            if (settled) return;
            settled = true;
            sock.destroy();
            err ? reject(err) : resolve(true);
        };
        sock.setTimeout(timeoutMs, () => done(new Error('เครื่องพิมพ์ไม่ตอบใน ' + timeoutMs + ' มิลลิวินาที')));
        sock.on('error', done);
        sock.connect(port, host, () => {
            sock.write(buf, () => {
                // รอให้ buffer ระบายก่อนปิด ไม่งั้นบางรุ่นพิมพ์ไม่ครบใบ
                sock.end(() => done(null));
            });
        });
    });
}

/**
 * ปลายทางของเครื่องพิมพ์หนึ่งตัว — null เมื่อยังตั้งค่าไม่ครบ
 * (LAN ต้องมี IP · USB ต้องเลือกเครื่องแล้ว)
 */
function targetOf(d, fallback) {
    if (d.printer_conn === 'USB') {
        return d.printer_usb ? { conn: 'USB', usb: d.printer_usb, name: d.name_th, fallback } : null;
    }
    return d.printer_host ? { conn: 'NETWORK', host: d.printer_host, port: d.printer_port || 9100,
                              name: d.name_th, fallback } : null;
}

function sendTo(t, buf) {
    return t.conn === 'USB' ? sendUsb(t.usb, buf) : sendRaw(t.host, t.port, buf);
}

/** สร้างงานพิมพ์ — เรียกภายในทรานแซกชันของผู้เรียกเสมอ */
async function enqueue(c, branchId, { orderId, deviceId, docType, paperWidth, payload }) {
    const r = await c.query(
        `INSERT INTO print_job (branch_id, order_id, device_id, doc_type, paper_width, payload)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [branchId, orderId || null, deviceId || null, docType,
         paperWidth || '80mm', payload || null]);
    return r.rows[0].id;
}

/**
 * หาเครื่องพิมพ์ของสถานี — ไม่เจอตัวหลักให้ใช้ตัวสำรอง (§19)
 * สลิปครัวที่พิมพ์ไม่ออกแปลว่าครัวไม่รู้ว่ามีออเดอร์ ร้ายแรงกว่าพิมพ์ผิดเครื่อง
 */
async function printerFor(c, branchId, station) {
    // ⚠️ ห้ามเรียงด้วย `ORDER BY (assigned_station = $2) DESC`
    //    เครื่องที่ assigned_station เป็น NULL จะได้ผลเป็น NULL ไม่ใช่ false
    //    และ Postgres เรียง NULL ไว้หน้าสุดในโหมด DESC → สลิปครัวไปโผล่ที่เคาน์เตอร์
    //    (เจอจริงตอนทดสอบกับเครื่องพิมพ์จำลอง)
    const r = await c.query(
        `SELECT * FROM device
          WHERE branch_id = $1 AND kind = 'PRINTER' AND active
            AND ($2::text IS NULL OR assigned_station = $2 OR assigned_station IS NULL)
          ORDER BY CASE WHEN assigned_station IS NOT DISTINCT FROM $2 THEN 0
                        WHEN assigned_station IS NULL THEN 1 ELSE 2 END, id
          LIMIT 1`, [branchId, station || null]);
    return r.rows[0] || null;
}

/**
 * เดินคิวหนึ่งรอบ
 * ทำทีละใบโดยตั้งใจ — เครื่องพิมพ์ตัวเดียวรับงานขนานไม่ได้อยู่แล้ว
 * และการเรียงลำดับสำคัญกับครัว (ตั๋วต้องออกตามลำดับที่สั่ง)
 */
async function drain(pool, branchId, { onDone } = {}) {
    const jobs = await pool.query(
        `SELECT j.*, d.printer_conn, d.printer_host, d.printer_port, d.printer_usb,
                d.fallback_printer_id, d.name_th AS printer_name
           FROM print_job j LEFT JOIN device d ON d.id = j.device_id
          WHERE j.branch_id = $1 AND j.status = 'QUEUED' AND j.attempts < $2
          ORDER BY j.id LIMIT 20`, [branchId, RETRY_MAX]);

    let printed = 0;
    for (const job of jobs.rows) {
        if (!job.payload) {
            await pool.query(
                `UPDATE print_job SET status = 'FAILED', last_error = $2 WHERE id = $1`,
                [job.id, 'ไม่มีข้อมูลสำหรับพิมพ์']);
            continue;
        }

        // ลองตัวหลักก่อน ไม่ผ่านค่อยตกไปตัวสำรอง
        const targets = [];
        const primary = targetOf({ printer_conn: job.printer_conn, printer_host: job.printer_host,
                                   printer_port: job.printer_port, printer_usb: job.printer_usb,
                                   name_th: job.printer_name }, false);
        if (primary) targets.push(primary);
        if (job.fallback_printer_id) {
            const fb = (await pool.query('SELECT * FROM device WHERE id = $1 AND active',
                [job.fallback_printer_id])).rows[0];
            const t = fb && targetOf(fb, true);
            if (t) targets.push(t);
        }
        if (!targets.length) {
            await pool.query(
                `UPDATE print_job SET attempts = attempts + 1, last_error = $2,
                        status = CASE WHEN attempts + 1 >= $3 THEN 'FAILED' ELSE 'QUEUED' END
                  WHERE id = $1`,
                [job.id, 'ยังไม่ได้ตั้งค่าเครื่องพิมพ์ของสถานีนี้', RETRY_MAX]);
            continue;
        }

        let ok = false, lastErr = null, usedFallback = false;
        for (const t of targets) {
            try {
                await sendTo(t, job.payload);
                ok = true;
                usedFallback = t.fallback;
                break;
            } catch (err) {
                lastErr = `${t.name || t.host || t.usb}: ${err.message}`;
            }
        }

        if (ok) {
            await pool.query(
                `UPDATE print_job SET status = 'DONE', printed_at = now(),
                        attempts = attempts + 1,
                        last_error = CASE WHEN $2 THEN 'พิมพ์ที่เครื่องสำรอง' ELSE NULL END
                  WHERE id = $1`, [job.id, usedFallback]);
            printed++;
        } else {
            await pool.query(
                `UPDATE print_job SET attempts = attempts + 1, last_error = $2,
                        status = CASE WHEN attempts + 1 >= $3 THEN 'FAILED' ELSE 'QUEUED' END
                  WHERE id = $1`, [job.id, lastErr, RETRY_MAX]);
        }
        if (onDone) onDone(job, ok, lastErr);
    }
    return printed;
}

/** เดินคิวเรื่อย ๆ — ช่วงถอยห่างมาจาก RETRY_DELAY_MS ของใบที่ล้มล่าสุด */
function startWorker(pool, getBranchId, { intervalMs = 2000, onDone } = {}) {
    let stopped = false;
    let timer = null;
    const tick = async () => {
        if (stopped) return;
        try {
            await drain(pool, getBranchId(), { onDone });
        } catch (err) {
            console.error('[print-worker]', err.message);
        }
        if (!stopped) timer = setTimeout(tick, intervalMs);
    };
    timer = setTimeout(tick, intervalMs);
    if (timer.unref) timer.unref();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
}

module.exports = { sendRaw, sendTo, targetOf, enqueue, printerFor, drain, startWorker,
                   RETRY_MAX, RETRY_DELAY_MS };
