/**
 * CafeFlow — สาย SSE เส้นเดียวที่ทุกแท็บใช้ร่วมกัน (SharedWorker)
 * ══════════════════════════════════════════════════════════════════
 * ทำไมต้องรวม: เบราว์เซอร์เปิดการเชื่อมต่อ HTTP/1.1 ไปเซิร์ฟเวอร์เดียวกันได้แค่ 6 เส้น
 * (นับรวมทุกแท็บ) และ SSE จองไว้หนึ่งเส้นตลอดเวลา — เปิดแคชเชียร์ + KDS + ภาพรวม
 * + คีออสก์ + จอคิว ในเครื่องเดียวแล้ว เส้นเกือบหมด หน้าใหม่ต้องรอคิวโหลดไฟล์ทีละไฟล์
 *
 * worker นี้ถือ EventSource ไว้เส้นเดียว แล้วกระจายให้ทุกแท็บผ่าน MessagePort
 *
 * ข้อความจากแท็บ:  { type: 'start', url }  ·  { type: 'stop' }
 * ข้อความถึงแท็บ:  { type: 'change', data }  ·  { type: 'state', state }
 */
'use strict';

const ports = new Set();
let es = null;
let url = null;
let state = null;
let retry = null;

function broadcast(msg) {
    for (const p of ports) {
        try { p.postMessage(msg); } catch (e) { ports.delete(p); }
    }
}

function setState(s) {
    state = s;
    broadcast({ type: 'state', state: s });
}

function open() {
    if (es || !url || !ports.size) return;
    es = new EventSource(url);
    es.addEventListener('open', () => setState('online'));
    es.addEventListener('change', (ev) => broadcast({ type: 'change', data: ev.data }));
    es.addEventListener('error', () => {
        // EventSource ต่อใหม่เองถ้ายังไม่ถูกปิด (readyState 0) — ปิดถาวรแล้ว (2) ต้องเปิดเอง
        setState(es.readyState === 2 ? 'offline' : 'reconnecting');
        if (es.readyState === 2) {
            es.close();
            es = null;
            clearTimeout(retry);
            retry = setTimeout(open, 3000);
        }
    });
}

function close() {
    clearTimeout(retry);
    if (es) { es.close(); es = null; }
    state = null;
}

self.onconnect = (e) => {
    const port = e.ports[0];
    port.onmessage = (ev) => {
        const m = ev.data || {};
        if (m.type === 'start') {
            ports.add(port);
            url = m.url;
            if (es && state) port.postMessage({ type: 'state', state });
            open();
        } else if (m.type === 'stop') {
            ports.delete(port);
            if (!ports.size) close();       // ไม่มีแท็บเหลือ — ไม่ต้องจองสายไว้
        }
    };
    port.start();
};
