/**
 * GET /api/stream — ดันการเปลี่ยนแปลงไปหาทุกหน้าจอในร้าน (SSE)
 * ══════════════════════════════════════════════════════════════════
 * เลือก SSE ไม่ใช่ WebSocket เพราะ:
 *   · ต้องการทางเดียว server→client เท่านั้น (การเขียนไปทาง HTTP POST อยู่แล้ว)
 *   · EventSource มี auto-reconnect + Last-Event-ID มาในตัวของเบราว์เซอร์
 *   · ไม่ต้องลงไลบรารีเพิ่มใน Node และผ่าน proxy ได้ง่ายกว่า
 *
 * ฝั่ง client ยังมีสามชั้นเหมือนเดิม: SSE → BroadcastChannel → poll
 * ชั้น poll ไม่ได้หายไป แค่เปลี่ยนจากทุก 1.5 วิ เป็นกันเหนียวตอน SSE ตาย
 */
'use strict';

/** ผู้ฟังที่ยังต่ออยู่ — Map<branchId, Set<reply>> */
const clients = new Map();

/** ประวัติย่อ ๆ ไว้ตอบ Last-Event-ID ของคนที่หลุดไปแป๊บเดียว */
const history = [];
const HISTORY_MAX = 500;
let seq = 0;

function registerStream(app, getBranchId) {
    app.get('/api/stream', (req, reply) => {
        const branchId = getBranchId();

        reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            // nginx ในร้านจะ buffer SSE จนไม่มีอะไรถึง client ถ้าไม่บอกให้ปิด
            'X-Accel-Buffering': 'no',
        });
        reply.raw.write('retry: 3000\n\n');

        if (!clients.has(branchId)) clients.set(branchId, new Set());
        clients.get(branchId).add(reply.raw);

        // ส่งของที่พลาดไประหว่างหลุด ให้จอครัวไม่ตกตั๋ว
        const since = parseInt(req.headers['last-event-id'] || req.query.since || '0', 10);
        if (since > 0) {
            for (const e of history) {
                if (e.id > since && e.branchId === branchId) writeEvent(reply.raw, e);
            }
        }

        // ping กัน proxy/โน้ตบุ๊กตัดการเชื่อมต่อที่เงียบเกิน 60 วิ
        const ping = setInterval(() => {
            try { reply.raw.write(': ping\n\n'); } catch { /* ปิดไปแล้ว */ }
        }, 20000);

        req.raw.on('close', () => {
            clearInterval(ping);
            const set = clients.get(branchId);
            if (set) set.delete(reply.raw);
        });
    });

    /** ให้ client ที่ SSE ตายไล่เก็บย้อนหลังได้ */
    app.get('/api/changes', async (req) => {
        const since = parseInt(req.query.since || '0', 10);
        const branchId = getBranchId();
        return {
            lastId: seq,
            changes: history.filter((e) => e.id > since && e.branchId === branchId)
                .map(({ id, entity, op, entityId }) => ({ id, entity, op, id_: entityId })),
        };
    });
}

function writeEvent(raw, e) {
    try {
        raw.write(`id: ${e.id}\nevent: change\ndata: ${JSON.stringify(e.data)}\n\n`);
    } catch { /* การเชื่อมต่อตายระหว่างเขียน — ตัวจัดการ close จะเก็บกวาดเอง */ }
}

/**
 * แจ้งทุกจอว่ามีอะไรเปลี่ยน
 * ส่งแค่ "อะไรเปลี่ยน" ไม่ส่งข้อมูลเต็ม — client ค่อยดึงส่วนที่ต้องการเอง
 * (ก้อนเต็มทำให้ payload บวมและเกิดคำถามว่า client ที่ไม่มีสิทธิ์ควรเห็นไหม)
 */
function publish(branchId, { entity, op, id, rev }) {
    const e = {
        id: ++seq, branchId, entity, op, entityId: id,
        data: { entity, op, id, rev: rev || null, at: Date.now() },
    };
    history.push(e);
    if (history.length > HISTORY_MAX) history.shift();

    const set = clients.get(branchId);
    if (set) for (const raw of set) writeEvent(raw, e);
    return e.id;
}

/** จำนวนจอที่ต่ออยู่ — ใช้บนหน้าภาพรวมและตอนไล่ปัญหา */
function listenerCount(branchId) {
    const set = clients.get(branchId);
    return set ? set.size : 0;
}

module.exports = { registerStream, publish, listenerCount };
