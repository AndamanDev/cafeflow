/**
 * CafeFlow — STORE
 * ══════════════════════════════════════════════════════════════════
 * ฐานข้อมูลร่วมของทั้งแอป — ข้อมูลจริงอยู่ที่เซิร์ฟเวอร์ในร้าน
 * โหลดมา cache ในหน่วยความจำ แล้วรับการเปลี่ยนแปลงผ่าน SSE
 *
 * **สิ่งสำคัญที่สุดของไฟล์นี้: ฟังก์ชันอ่าน (all/byId/where/settings/openShift)
 *   เป็น synchronous** — หน้าเว็บอ่านจาก cache ได้ทันทีโดยไม่ต้อง await ทุกจุด
 *   ส่วนการเขียนทุกอย่างผ่าน cmd() ให้เซิร์ฟเวอร์ตัดสิน แล้วดึงภาพจริงกลับมา
 */
(function () {
    let _online = true;       // ต่อเซิร์ฟเวอร์ติดอยู่ไหม
    const subs = [];
    let bc = null;
    let pollTimer = null;
    let stopStream = null;
    let refreshing = null;

    function notify(info) {
        subs.slice().forEach((cb) => { try { cb(info); } catch (e) { console.error('[CFStore] subscriber ล้ม', e); } });
    }

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

        /**
         * เตรียมข้อมูลให้พร้อมใช้ — คืน Promise เสมอ
         * ตัวเรียกควรใช้ CFBoot.ready() แทนการเรียกตรง
         */
        async init() {
            if (this.db) return this.db;
            await refresh('init');
            startApiSync();
            return this.db;
        },

        /* ── อ่าน — ห้ามเปลี่ยนลายเซ็น หน้าเว็บทุกหน้าพึ่งอยู่ ── */
        all(entity)        { return (this.db && this.db[entity]) || []; },
        byId(entity, id)   { return this.all(entity).find((x) => x.id === id) || null; },
        where(entity, fn)  { return this.all(entity).filter(fn); },
        settings()         { return this.db.settings; },

        /** รอบที่เปิดอยู่ (§27) */
        openShift() { return this.all('shifts').find((s) => s.status === 'OPEN') || null; },

        /* ── เขียน ─────────────────────────────────────────── */
        /**
         * คำสั่งเขียนแบบมีชื่อ — เซิร์ฟเวอร์เป็นผู้ตัดสินและคืนผลจริงกลับมา
         *   await CFStore.cmd('POST', '/api/orders', {...})
         */
        async cmd(method, path, body, opts) {
            const out = await CFApi[method.toLowerCase()](path, body, opts);
            await refresh('local');       // ดึงภาพจริงกลับมาแทนการเดาเอง
            return out;
        },

        /* ── สมัครรับการเปลี่ยนแปลง ───────────────────────── */
        subscribe(cb) {
            subs.push(cb);
            return () => { const i = subs.indexOf(cb); if (i >= 0) subs.splice(i, 1); };
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
        isOnline() { return _online; },
    };
})();
