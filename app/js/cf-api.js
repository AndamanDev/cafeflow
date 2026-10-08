/**
 * CafeFlow — ตัวคุยกับเซิร์ฟเวอร์ในร้าน
 * ══════════════════════════════════════════════════════════════════
 * ที่เดียวในฝั่งเบราว์เซอร์ที่รู้จัก HTTP — หน้าเว็บทั้ง 9 หน้าไม่เคยเห็นไฟล์นี้
 * มันคุยผ่าน CFStore เหมือนเดิมทุกประการ
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

    /**
     * 401 แบบ "ต้องล็อกอินใหม่" บนหน้าพนักงาน → พาไปหน้าเข้าสู่ระบบ แทนการขึ้นแค่ข้อความ
     * ไม่รวม 401 อื่น (รหัสผ่านผิดตอนล็อกอิน · อุปกรณ์ยังไม่จับคู่)
     * ไม่ทำกับคีออสก์ / จอคิว (CF_CLIENT) และหน้าเข้าสู่ระบบเอง · ต้องเคยล็อกอินอยู่ กันวนซ้ำ
     */
    const LOGIN_MSGS = ['ต้องเข้าสู่ระบบก่อน', 'ยังไม่ได้เข้าสู่ระบบ', 'ต้องเข้าสู่ระบบ หรือจับคู่อุปกรณ์ก่อน'];
    function loginExpired(msg) {
        return LOGIN_MSGS.includes(msg) && !window.CF_CLIENT && !!window.CFAuth
            && !/login\.html$/.test(location.pathname) && window.CFAuth.isLoggedIn();
    }

    async function request(method, path, body, opts) {
        opts = opts || {};
        const headers = { Accept: 'application/json' };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
        if (deviceId()) headers['X-CF-Device'] = deviceId();
        // หน้าของลูกค้าประกาศตัว → เซิร์ฟเวอร์ไม่ใช้ session พนักงานที่อาจค้างในเบราว์เซอร์นี้
        if (window.CF_CLIENT) headers['X-CF-Client'] = window.CF_CLIENT;

        // ★ ต้องมีเพดานเวลา — สายที่ค้างครึ่งทาง (Wi-Fi หลุด / เซิร์ฟเวอร์เพิ่งรีสตาร์ท) fetch จะรอจน OS ตัดเอง
        //   ซึ่งนานหลายนาที ระหว่างนั้นม่าน "กำลังส่งออเดอร์…" ของคีออสก์ค้างจนลูกค้าเดินหนี
        //   ส่งซ้ำได้ปลอดภัย: สร้างออเดอร์ผูก clientUuid ไว้ กดใหม่ได้ใบเดิม
        const ctl = new AbortController();
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, opts.timeout || 20000);
        if (opts.signal) {
            if (opts.signal.aborted) ctl.abort();
            else opts.signal.addEventListener('abort', () => ctl.abort(), { once: true });
        }

        let res, text;
        try {
            res = await fetch(baseUrl() + path, {
                method,
                headers,
                credentials: 'same-origin',   // session อยู่ใน cookie httpOnly
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: ctl.signal,
            });
            text = await res.text();
        } catch (err) {
            // ผู้เรียกยกเลิกเอง — ส่งต่อแบบเดิม ไม่ใช่ปัญหาการเชื่อมต่อ
            if (!timedOut && opts.signal && opts.signal.aborted) throw err;
            // แยก "เซิร์ฟเวอร์ตอบว่าไม่ได้" ออกจาก "ต่อเซิร์ฟเวอร์ไม่ติด"
            // สองอย่างนี้ผู้ใช้ต้องเห็นข้อความคนละแบบ
            const e = new Error(timedOut ? 'เซิร์ฟเวอร์ในร้านตอบช้าเกินไป — ลองอีกครั้ง' : 'ติดต่อเซิร์ฟเวอร์ในร้านไม่ได้');
            e.offline = true;
            e.timeout = timedOut;
            e.cause = err;
            throw e;
        } finally {
            clearTimeout(timer);
        }

        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

        if (!res.ok) {
            const e = new Error((data && (data.message || data.error)) || ('HTTP ' + res.status));
            e.status = res.status;
            e.data = data;
            if (res.status === 401 && loginExpired(e.message)) window.CFAuth.toLogin('expired');
            throw e;
        }
        return data;
    }

    /** รับการเปลี่ยนแปลงผ่านสายกลางใน SharedWorker — คืนฟังก์ชันสำหรับเลิกรับ */
    function sharedStream(onChange, onState) {
        const w = new SharedWorker('js/cf-stream-worker.js', { name: 'cafeflow-stream' });
        const port = w.port;
        port.onmessage = (ev) => {
            const m = ev.data || {};
            if (m.type === 'change') {
                try { onChange(JSON.parse(m.data)); } catch (err) { console.warn('[CFApi] stream payload เสีย', err); }
            } else if (m.type === 'state') {
                if (onState) onState(m.state);
            }
        };
        port.start();
        // worker อยู่คนละ scope กับหน้า — ต้องส่ง URL เต็ม
        port.postMessage({ type: 'start', url: new URL(baseUrl() + '/api/stream', location.href).href });

        let stopped = false;
        let disposed = false;        // ผู้เรียกเลิกเองแล้ว — กลับจาก bfcache ก็ไม่ต้องต่อใหม่
        const stop = () => {
            if (stopped) return;
            stopped = true;
            try { port.postMessage({ type: 'stop' }); } catch (e) { /* แท็บกำลังปิด */ }
        };
        // แท็บปิดแล้ว worker ไม่รู้เอง — ต้องบอกก่อนไป ไม่งั้นสายค้างทั้งที่ไม่มีใครฟัง
        window.addEventListener('pagehide', stop);
        // กลับมาจาก back/forward cache — หน้าเดิมฟื้นขึ้นมาโดยไม่โหลดใหม่ ต้องขอสายคืน
        window.addEventListener('pageshow', (e) => {
            if (!e.persisted || !stopped || disposed) return;
            stopped = false;
            port.postMessage({ type: 'start', url: new URL(baseUrl() + '/api/stream', location.href).href });
        });
        return () => { disposed = true; stop(); };
    }

    /**
     * เฝ้าดูว่าเซิร์ฟเวอร์มีหน้าเว็บเวอร์ชันใหม่ไหม — เรียก onChange ครั้งเดียวเมื่อเปลี่ยน
     * ตัวเลขแรกที่ได้คือเวอร์ชันของหน้านี้ (ไม่ใช่ตัวที่ติดมากับ HTML) จึงไม่ต้องแก้ไฟล์ทุกหน้า
     */
    function watchVersion(onChange, intervalMs) {
        let mine = null, fired = false;
        const check = () => request('GET', '/api/version').then((r) => {
            if (!r || !r.version) return;
            if (mine === null) { mine = r.version; return; }
            if (r.version !== mine && !fired) { fired = true; onChange(r.version); }
        }).catch(() => { /* เซิร์ฟเวอร์รีสตาร์ท/เน็ตหลุด — รอบหน้าลองใหม่ */ });
        check();
        return setInterval(check, intervalMs || 30000);
    }

    /**
     * UUID v4 — ใช้เป็น clientUuid กันออเดอร์ซ้ำ
     * crypto.randomUUID() มีเฉพาะหน้า https / localhost — จอในร้านเปิดผ่าน http://<IP เครื่องหลัก>
     * ซึ่งเบราว์เซอร์ไม่นับว่าปลอดภัย จึงไม่มีให้ใช้ (ตัวสำรองเดิมได้ค่าที่ไม่ใช่ UUID → เซิร์ฟเวอร์ตอบ 400)
     * getRandomValues ใช้ได้ทุกหน้า
     */
    function uuid() {
        if (window.crypto && crypto.randomUUID && window.isSecureContext) return crypto.randomUUID();
        const b = crypto.getRandomValues(new Uint8Array(16));
        b[6] = (b[6] & 0x0f) | 0x40;   // version 4
        b[8] = (b[8] & 0x3f) | 0x80;   // variant 10xx
        const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
        return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    }

    window.CFApi = {
        watchVersion,
        baseUrl,
        uuid,

        get:  (p, o)    => request('GET', p, undefined, o),
        post: (p, b, o) => request('POST', p, b, o),
        put:  (p, b, o) => request('PUT', p, b, o),
        patch:(p, b, o) => request('PATCH', p, b, o),

        /** ก้อนข้อมูลตั้งต้น — รูปทรงดูที่ api/src/serialize/snapshot.js */
        bootstrap(hours) {
            return request('GET', '/api/bootstrap' + (hours ? '?hours=' + hours : ''));
        },

        health() { return request('GET', '/api/health'); },

        /**
         * เครื่องนี้จับคู่อยู่ไหม — page บอกเซิร์ฟเวอร์ว่าเป็นหน้าอะไร (kiosk / display)
         * ถ้ายังไม่จับคู่ เซิร์ฟเวอร์จดไว้ว่าเครื่องนี้ค้างหน้าขอรหัส หน้าภาพรวมจะเตือนผู้จัดการ
         */
        deviceMe(page) {
            return request('GET', '/api/devices/me' + (page ? '?page=' + encodeURIComponent(page) : ''));
        },

        /** ถามซ้ำทุก 15 วิระหว่างค้างหน้าขอรหัส — ให้คำเตือนบนหน้าภาพรวมยังอยู่ (หายเองถ้าเงียบเกิน 60 วิ) */
        keepWaiting(page) {
            clearInterval(this._waitT);
            this._waitT = setInterval(() => this.deviceMe(page).then((me) => {
                if (me && me.paired) clearInterval(this._waitT);
            }).catch(() => {}), 15000);
        },
        stopWaiting() { clearInterval(this._waitT); },

        /** ข้อความบอกสาเหตุที่หลุดการจับคู่ — แสดงบนหน้าขอรหัสของเครื่อง */
        pairReasonText(me) {
            if (!me || me.paired) return '';
            const here = location.host;
            return me.reason === 'REVOKED'
                ? 'เครื่องนี้เคยจับคู่แล้ว แต่สิทธิ์ถูกยกเลิก หรือมีการจับคู่อุปกรณ์ตัวนี้ใหม่ที่เครื่องอื่น — ขอรหัสใหม่จากผู้จัดการ'
                : 'ไม่พบข้อมูลการจับคู่ในเบราว์เซอร์นี้ (ข้อมูลเบราว์เซอร์ถูกล้าง หรือเปิดคนละที่อยู่กับตอนจับคู่) ' +
                  '· ที่อยู่ที่เปิดอยู่ตอนนี้: ' + here + (me.ip ? ' · IP เครื่องนี้: ' + me.ip : '');
        },

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
            // ทุกแท็บใช้สายเดียวกันผ่าน SharedWorker — ดูเหตุผลใน cf-stream-worker.js
            if (typeof SharedWorker === 'function') {
                try { return sharedStream(onChange, onState); }
                catch (err) { console.warn('[CFApi] SharedWorker ใช้ไม่ได้ — เปิดสายของแท็บนี้เอง', err); }
            }

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
