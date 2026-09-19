/**
 * CafeFlow — ตัวคุยกับเซิร์ฟเวอร์ในร้าน
 * ══════════════════════════════════════════════════════════════════
 * ที่เดียวในฝั่งเบราว์เซอร์ที่รู้จัก HTTP — หน้าเว็บทั้ง 9 หน้าไม่เคยเห็นไฟล์นี้
 * มันคุยผ่าน CFStore เหมือนเดิมทุกประการ
 *
 * ⚠️ ไฟล์นี้ต้องไม่ถูกฝังในอาร์ติแฟกต์คีออสก์ (มี fetch — ด่านตรวจของ
 *    build_kiosk_artifact.py จะล้ม build ให้เห็นเองถ้าเผลอใส่เข้าไป)
 */
(function () {
    'use strict';

    /** ฐาน URL ของ API — หน้าเว็บเสิร์ฟจาก origin เดียวกับ API ในร้านจริง */
    function baseUrl() {
        const q = new URLSearchParams(location.search).get('api');
        if (q) return q.replace(/\/$/, '');
        if (window.CF_API_BASE) return String(window.CF_API_BASE).replace(/\/$/, '');
        return '';          // origin เดียวกัน
    }

    /** เครื่องนี้คือใคร — ใช้ประกอบ heartbeat และผูกออเดอร์กับจุดสั่ง */
    function deviceId() {
        return window.CF_DEVICE_ID || null;
    }

    async function request(method, path, body, opts) {
        opts = opts || {};
        const headers = { Accept: 'application/json' };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
        if (deviceId()) headers['X-CF-Device'] = deviceId();

        let res;
        try {
            res = await fetch(baseUrl() + path, {
                method,
                headers,
                credentials: 'same-origin',   // session อยู่ใน cookie httpOnly
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: opts.signal,
            });
        } catch (err) {
            // แยก "เซิร์ฟเวอร์ตอบว่าไม่ได้" ออกจาก "ต่อเซิร์ฟเวอร์ไม่ติด"
            // สองอย่างนี้ผู้ใช้ต้องเห็นข้อความคนละแบบ
            const e = new Error('ติดต่อเซิร์ฟเวอร์ในร้านไม่ได้');
            e.offline = true;
            e.cause = err;
            throw e;
        }

        const text = await res.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

        if (!res.ok) {
            const e = new Error((data && (data.message || data.error)) || ('HTTP ' + res.status));
            e.status = res.status;
            e.data = data;
            throw e;
        }
        return data;
    }

    window.CFApi = {
        baseUrl,

        get:  (p, o)    => request('GET', p, undefined, o),
        post: (p, b, o) => request('POST', p, b, o),
        put:  (p, b, o) => request('PUT', p, b, o),
        patch:(p, b, o) => request('PATCH', p, b, o),

        /** ก้อนข้อมูลตั้งต้น รูปทรงเดียวกับ CF_SEED */
        bootstrap(hours) {
            return request('GET', '/api/bootstrap' + (hours ? '?hours=' + hours : ''));
        },

        health() { return request('GET', '/api/health'); },

        heartbeat() {
            const id = deviceId();
            return id ? request('POST', '/api/devices/' + encodeURIComponent(id) + '/heartbeat', {})
                      : Promise.resolve(null);
        },

        /**
         * เปิดสายรับการเปลี่ยนแปลงจากเซิร์ฟเวอร์
         * EventSource จัดการ reconnect + Last-Event-ID ให้เอง เราจึงไม่ต้องเขียน backoff
         * คืนฟังก์ชันสำหรับปิดสาย
         */
        stream(onChange, onState) {
            let es = null;
            let closed = false;

            const open = () => {
                if (closed) return;
                es = new EventSource(baseUrl() + '/api/stream');
                es.addEventListener('open', () => onState && onState('online'));
                es.addEventListener('change', (ev) => {
                    try { onChange(JSON.parse(ev.data)); } catch (err) { console.warn('[CFApi] stream payload เสีย', err); }
                });
                es.addEventListener('error', () => {
                    // EventSource จะต่อใหม่เองถ้ายังไม่ถูกปิด — แค่บอกสถานะให้ UI รู้
                    onState && onState(es.readyState === 2 ? 'offline' : 'reconnecting');
                    if (es.readyState === 2 && !closed) { es.close(); setTimeout(open, 3000); }
                });
            };
            open();

            return () => { closed = true; if (es) es.close(); };
        },
    };
})();
