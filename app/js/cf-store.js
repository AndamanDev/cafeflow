/**
 * CafeFlow — STORE
 * ══════════════════════════════════════════════════════════════════
 * ฐานข้อมูลร่วมของทั้งแอป มีสองหลังบ้าน เลือกได้ตอนโหลดหน้า
 *
 *   local  (เดิม)  ข้อมูลอยู่ใน localStorage ของเบราว์เซอร์เครื่องนี้
 *                  ใช้สำหรับเดโม/ออฟไลน์ และเป็นค่าเริ่มต้นจนกว่า API จะครบทุกคำสั่ง
 *   api    (ใหม่)  ข้อมูลจริงอยู่ที่เซิร์ฟเวอร์ในร้าน โหลดมา cache ในหน่วยความจำ
 *                  แล้วรับการเปลี่ยนแปลงผ่าน SSE
 *
 * **สิ่งสำคัญที่สุดของไฟล์นี้: ฟังก์ชันอ่าน (all/byId/where/settings/openShift)
 *   ยังเป็น synchronous และให้ผลเหมือนเดิมทั้งสองหลังบ้าน**
 *   หน้าเว็บ 9 หน้า ~132 จุดที่อ่านข้อมูลจึงไม่ต้องแก้แม้แต่บรรทัดเดียว
 *
 * เลือกหลังบ้าน: `?backend=api` บน URL · หรือ `window.CF_BACKEND = 'api'`
 */
(function () {
    const K_DB   = 'cafeflow.db.v1';
    const K_REV  = 'cafeflow.rev.v1';
    const SCHEMA = 2;   // ใช้เฉพาะหลังบ้าน local (api ใช้ migration ของฐานข้อมูลแทน)

    function pickBackend() {
        const q = new URLSearchParams(location.search).get('backend');
        if (q === 'api' || q === 'local') return q;
        if (window.CF_BACKEND === 'api' || window.CF_BACKEND === 'local') return window.CF_BACKEND;
        return 'local';
    }
    const MODE = pickBackend();

    let _mem = null;          // fallback เมื่อ localStorage ใช้ไม่ได้
    let _usable = true;
    let _online = true;       // หลังบ้าน api: ต่อเซิร์ฟเวอร์ติดอยู่ไหม
    const subs = [];
    let bc = null;
    let pollTimer = null;
    let stopStream = null;
    let refreshing = null;

    /* ── ชั้นห่อ localStorage ที่ไม่มีวันโยน ───────────────── */
    function lsGet(k) {
        if (!_usable) return null;
        try { return localStorage.getItem(k); }
        catch (e) { _usable = false; console.warn('[CFStore] localStorage ใช้ไม่ได้ — ใช้หน่วยความจำแทน', e); return null; }
    }
    function lsSet(k, v) {
        if (!_usable) return false;
        try { localStorage.setItem(k, v); return true; }
        catch (e) { _usable = false; console.warn('[CFStore] เขียน localStorage ไม่ได้', e); return false; }
    }

    const todayISO = () => new Date().toISOString().slice(0, 10);

    /**
     * เลื่อนทุก timestamp ในฐานข้อมูลไปข้างหน้าตามจำนวนวันที่ผ่านไป
     * ถ้าไม่ทำ: เปิดเดโมวันถัดไปจะเจอ dashboard ว่างเปล่า (ไม่มีออเดอร์ "วันนี้")
     *
     * ⚠️ ของเดโมล้วน ๆ — หลังบ้าน api ห้ามเรียกเด็ดขาด
     *    ถ้าหลุดไปรันกับข้อมูลจริงมันจะเขียนทับ timestamp ทั้งฐาน
     */
    function rebaseDates(db) {
        if (MODE !== 'local') return false;
        const seeded = db.meta && db.meta.seededAt;
        if (!seeded || seeded === todayISO()) return false;

        const deltaMs = new Date(todayISO()).getTime() - new Date(seeded).getTime();
        if (deltaMs <= 0) { db.meta.seededAt = todayISO(); return true; }

        const shift = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(s))
            ? new Date(new Date(s).getTime() + deltaMs).toISOString() : s;

        const walk = (node) => {
            if (Array.isArray(node)) { node.forEach(walk); return; }
            if (!node || typeof node !== 'object') return;
            Object.keys(node).forEach((k) => {
                const v = node[k];
                if (typeof v === 'string') node[k] = shift(v);
                else if (v && typeof v === 'object') walk(v);
            });
        };
        ['orders', 'orderItems', 'payments', 'shifts', 'auditLogs', 'devices'].forEach((c) => walk(db[c]));
        db.meta.seededAt = todayISO();
        return true;
    }

    function freshDb() { return CF_SEED(new Date()); }

    function notify(info) {
        subs.slice().forEach((cb) => { try { cb(info); } catch (e) { console.error('[CFStore] subscriber ล้ม', e); } });
    }

    /* ══════════════════════════════════════════════════════
       หลังบ้าน LOCAL — sync ข้ามแท็บ 3 ชั้น
       ══════════════════════════════════════════════════════ */
    function applyRemote(remoteRev) {
        const cur = CFStore.db ? CFStore.db.meta.rev : 0;
        if (remoteRev != null && remoteRev <= cur) return;   // กันยิงซ้ำจาก 3 ช่องทาง
        const raw = lsGet(K_DB);
        if (!raw) return;
        try {
            const next = JSON.parse(raw);
            if (next.meta.rev <= cur) return;
            CFStore.db = next;
            notify({ rev: next.meta.rev, origin: 'remote' });
        } catch (e) { console.warn('[CFStore] อ่านข้อมูลจากแท็บอื่นไม่สำเร็จ', e); }
    }

    function startLocalSync() {
        window.addEventListener('storage', (e) => {
            if (e.key === K_REV) applyRemote(parseInt(e.newValue, 10));
        });
        try {
            bc = new BroadcastChannel('cafeflow');
            bc.onmessage = (ev) => { if (ev.data && ev.data.rev) applyRemote(ev.data.rev); };
        } catch (e) { bc = null; }

        // ชั้นที่ 3 — ตัวที่ทำงานแน่นอนทุกเบราว์เซอร์บน file:// ห้ามตัดทิ้ง
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(() => {
            const r = parseInt(lsGet(K_REV), 10);
            if (!isNaN(r)) applyRemote(r);
        }, 1500);
    }

    /* ══════════════════════════════════════════════════════
       หลังบ้าน API
       ══════════════════════════════════════════════════════ */

    /**
     * ดึง snapshot ใหม่ทั้งก้อน
     * ที่ยังไม่ทำ delta รายแถวเพราะก้อนทั้งหมดราว 20–100 KB บน LAN ซึ่งเร็วกว่า
     * ความซับซ้อนของการ merge ทีละแถว และไม่มีทางหลุด sync — จะทำ delta เมื่อวัดแล้วว่าช้าจริง
     */
    function refresh(reason) {
        if (refreshing) return refreshing;       // ยิงซ้อนกันไม่ได้ ไม่งั้นได้ภาพเก่าทับภาพใหม่
        refreshing = CFApi.bootstrap()
            .then((snap) => {
                const prev = CFStore.db ? CFStore.db.meta.rev : -1;
                CFStore.db = snap;
                _online = true;
                if (snap.meta.rev !== prev) {
                    notify({ rev: snap.meta.rev, origin: reason || 'remote' });
                }
                return snap;
            })
            .catch((err) => {
                if (err.offline) _online = false;
                notify({ origin: 'offline', error: err });
                throw err;
            })
            .finally(() => { refreshing = null; });
        return refreshing;
    }

    function startApiSync() {
        let debounce = null;
        stopStream = CFApi.stream(
            () => {
                // รวมหลาย event ที่มาติด ๆ กันให้ดึง snapshot รอบเดียว
                clearTimeout(debounce);
                debounce = setTimeout(() => refresh('remote').catch(() => {}), 120);
            },
            (state) => {
                const was = _online;
                _online = state === 'online';
                if (was !== _online) notify({ origin: _online ? 'online' : 'offline' });
                if (_online && !was) refresh('reconnect').catch(() => {});
            });

        // แท็บอื่นในเครื่องเดียวกันไม่ต้องเปิด SSE ซ้ำ ใช้ช่องนี้บอกกันเอง
        try {
            bc = new BroadcastChannel('cafeflow');
            bc.onmessage = (ev) => { if (ev.data && ev.data.poke) refresh('remote').catch(() => {}); };
        } catch (e) { bc = null; }

        // กันเหนียวตอน SSE ตายเงียบ ๆ (proxy บางตัวตัดสายโดยไม่แจ้ง)
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(() => refresh('poll').catch(() => {}), 15000);
    }

    window.CFStore = {
        db: null,
        mode: MODE,

        /**
         * เตรียมข้อมูลให้พร้อมใช้
         * หลังบ้าน local คืนค่าทันที (เหมือนเดิม) · หลังบ้าน api คืน Promise
         * ตัวเรียกควรใช้ CFBoot.ready() แทนการเรียกตรง เพื่อให้เขียนเหมือนกันทั้งสองแบบ
         */
        init() {
            if (MODE === 'api') return this.initAsync();
            if (this.db) return this.db;

            let db = null;
            const raw = lsGet(K_DB);
            if (raw) {
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed && parsed.meta && parsed.meta.schema === SCHEMA) db = parsed;
                    else console.info('[CFStore] schema ไม่ตรง — seed ใหม่');
                } catch (e) { console.warn('[CFStore] ข้อมูลเดิมเสีย — seed ใหม่', e); }
            }

            if (!db) {
                db = freshDb();
                this.db = db;
                this._persist('seed');
            } else {
                this.db = db;
                if (rebaseDates(db)) this._persist('rebase');
            }

            if (!_usable) _mem = this.db;
            startLocalSync();
            return this.db;
        },

        async initAsync() {
            if (this.db) return this.db;
            await refresh('init');
            startApiSync();
            return this.db;
        },

        /* ── อ่าน — เหมือนกันทั้งสองหลังบ้าน ห้ามเปลี่ยนลายเซ็น ── */
        all(entity)        { return (this.db && this.db[entity]) || []; },
        byId(entity, id)   { return this.all(entity).find((x) => x.id === id) || null; },
        where(entity, fn)  { return this.all(entity).filter(fn); },
        settings()         { return this.db.settings; },

        /** รอบที่เปิดอยู่ (§27) */
        openShift() { return this.all('shifts').find((s) => s.status === 'OPEN') || null; },

        /* ── เขียน ─────────────────────────────────────────── */
        mutate(fn, reason) {
            if (MODE === 'api') {
                // ส่ง closure ข้ามเน็ตไม่ได้ในทางหลักการ — ต้องเรียกคำสั่งที่มีชื่อแทน
                // ดังขึ้นมาเลยดีกว่าปล่อยให้แก้เฉพาะในหน่วยความจำแล้วหายตอนรีเฟรช
                throw new Error(
                    '[CFStore] หลังบ้าน api ใช้ mutate() ไม่ได้ — ใช้ CFStore.cmd() แทน' +
                    (reason ? ' (จุดที่เรียก: ' + reason + ')' : ''));
            }
            if (!this.db) this.init();
            const result = fn(this.db);
            this.db.meta.rev = (this.db.meta.rev || 0) + 1;
            this._persist(reason);
            notify({ rev: this.db.meta.rev, reason: reason || null, origin: 'local' });
            return result;
        },

        /**
         * คำสั่งเขียนแบบมีชื่อ — เซิร์ฟเวอร์เป็นผู้ตัดสินและคืนผลจริงกลับมา
         *   await CFStore.cmd('POST', '/api/orders', {...})
         */
        async cmd(method, path, body, opts) {
            if (MODE !== 'api') throw new Error('[CFStore] cmd() ใช้ได้เฉพาะหลังบ้าน api');
            const out = await CFApi[method.toLowerCase()](path, body, opts);
            await refresh('local');       // ดึงภาพจริงกลับมาแทนการเดาเอง
            return out;
        },

        _persist(reason) {
            const rev = this.db.meta.rev;
            const ok = lsSet(K_DB, JSON.stringify(this.db));
            if (ok) {
                lsSet(K_REV, String(rev));
                if (bc) { try { bc.postMessage({ rev }); } catch (e) { /* ช่องทางสำรอง ล้มได้ */ } }
            } else {
                _mem = this.db;
            }
        },

        /* ── สมัครรับการเปลี่ยนแปลง ───────────────────────── */
        subscribe(cb) {
            subs.push(cb);
            return () => { const i = subs.indexOf(cb); if (i >= 0) subs.splice(i, 1); };
        },

        /* ── ตัวนับ id — หลังบ้าน api ให้เซิร์ฟเวอร์ออกเลขเท่านั้น ── */
        nextId(prefix, counterKey) {
            if (MODE === 'api') throw new Error('[CFStore] เลขเอกสารต้องออกจากเซิร์ฟเวอร์');
            const n = (this.db.counters[counterKey] || 0) + 1;
            this.db.counters[counterKey] = n;
            return prefix + n;
        },

        nextOrderNo() {
            if (MODE === 'api') throw new Error('[CFStore] เลขออเดอร์ต้องออกจากเซิร์ฟเวอร์');
            const n = (this.db.counters.orderSeq || 100) + 1;
            this.db.counters.orderSeq = n;
            return 'A' + String(n).padStart(3, '0');
        },

        /* ── รีเซ็ตเดโม ──────────────────────────────────── */
        resetDemo() {
            if (MODE === 'api') { console.warn('[CFStore] รีเซ็ตข้อมูลจริงจากหน้าเว็บไม่ได้'); return; }
            try { localStorage.removeItem(K_DB); localStorage.removeItem(K_REV); } catch (e) { /* ไม่เป็นไร */ }
            this.db = null;
            _mem = null;
            location.href = location.pathname;
        },

        /**
         * ใส่แถวที่ดึงมาเพิ่มเข้า cache (เช่นออเดอร์เก่าที่ค้นเจอแต่อยู่นอกหน้าต่าง 24 ชม.)
         * แทนที่แถวที่ id ซ้ำ ไม่ใช่เพิ่มซ้อน — ไม่งั้นหน้าจอจะเห็นออเดอร์เดียวกันสองใบ
         *
         * ⚠️ แถวที่ใส่ด้วยวิธีนี้จะหายไปเมื่อ refresh snapshot รอบถัดไป ซึ่งถูกต้องแล้ว
         *    เพราะมันอยู่นอกขอบเขตที่ snapshot รับผิดชอบ
         */
        hydrate(patch) {
            if (!this.db || !patch) return;
            for (const [entity, rows] of Object.entries(patch)) {
                if (!Array.isArray(rows) || !Array.isArray(this.db[entity])) continue;
                const byId = new Map(this.db[entity].map((r) => [r.id, r]));
                rows.forEach((r) => byId.set(r.id, r));
                this.db[entity] = [...byId.values()];
            }
            notify({ origin: 'hydrate' });
        },

        refresh,
        isOnline()     { return MODE === 'api' ? _online : true; },
        isPersistent() { return MODE === 'api' ? true : _usable; },
    };
})();
