/**
 * CafeFlow — STORE
 * ------------------------------------------------------------
 * ฐานข้อมูลร่วมของทั้งแอปบน localStorage
 *
 * หลักการ:
 *   • เก็บเป็นก้อนเดียว → เขียนแบบ atomic, reset ง่าย, ทำ versioning ง่าย
 *   • ทุกการเขียนต้องผ่าน CFStore.mutate() เท่านั้น
 *     (ที่เดียวที่ stringify + setItem และที่เดียวที่ bump rev)
 *   • sync ข้ามแท็บ 3 ชั้น เพราะ KDS กับ Cashier อยู่คนละแท็บ
 *
 * ทุก access ห่อ try/catch — Safari โยน SecurityError ทันทีบน file://
 * ถ้าเข้าไม่ได้จะ fallback เป็น DB ในหน่วยความจำ เดโมยังเดินได้ แค่ไม่ sync
 */
(function () {
    const K_DB   = 'cafeflow.db.v1';
    const K_REV  = 'cafeflow.rev.v1';
    const SCHEMA = 2;   // bump เมื่อโครงสร้างข้อมูลเปลี่ยน (v2 = ราคาแยกตามแบบเสิร์ฟ)

    let _mem = null;          // fallback เมื่อ localStorage ใช้ไม่ได้
    let _usable = true;       // localStorage ใช้ได้ไหม
    const subs = [];
    let bc = null;
    let pollTimer = null;

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
     * และตัวจับเวลา KDS จะขึ้นเป็นหลักสิบชั่วโมง
     */
    function rebaseDates(db) {
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

    /** โหลดจาก disk ใหม่เมื่อรู้ว่ามีแท็บอื่นเขียน */
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

    function startSync() {
        // ชั้นที่ 1 — storage event ฟังที่คีย์ rev (คีย์เล็ก ไม่ต้อง parse payload สองรอบ)
        window.addEventListener('storage', (e) => {
            if (e.key === K_REV) applyRemote(parseInt(e.newValue, 10));
        });

        // ชั้นที่ 2 — BroadcastChannel (opaque origin บน file:// โยน error ได้ตอน construct)
        try {
            bc = new BroadcastChannel('cafeflow');
            bc.onmessage = (ev) => { if (ev.data && ev.data.rev) applyRemote(ev.data.rev); };
        } catch (e) { bc = null; }

        // ชั้นที่ 3 — poll ตัวนับ rev ทุก 1.5 วินาที
        // ตัวนี้คือตัวที่ทำงานแน่นอนทุกเบราว์เซอร์บน file:// ห้ามตัดทิ้ง
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(() => {
            const r = parseInt(lsGet(K_REV), 10);
            if (!isNaN(r)) applyRemote(r);
        }, 1500);
    }

    window.CFStore = {
        db: null,

        init() {
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
                if (rebaseDates(db)) this._persist('rebase');   // เลื่อนวันแล้วต้องเขียนกลับ
            }

            if (!_usable) _mem = this.db;
            startSync();
            return this.db;
        },

        /* ── อ่าน ─────────────────────────────────────────── */
        all(entity)        { return (this.db && this.db[entity]) || []; },
        byId(entity, id)   { return this.all(entity).find((x) => x.id === id) || null; },
        where(entity, fn)  { return this.all(entity).filter(fn); },
        settings()         { return this.db.settings; },

        /** รอบที่เปิดอยู่ (§27) */
        openShift() { return this.all('shifts').find((s) => s.status === 'OPEN') || null; },

        /* ── เขียน — ทางเดียวที่แก้ข้อมูลได้ ──────────────── */
        mutate(fn, reason) {
            if (!this.db) this.init();
            const result = fn(this.db);
            this.db.meta.rev = (this.db.meta.rev || 0) + 1;
            this._persist(reason);
            notify({ rev: this.db.meta.rev, reason: reason || null, origin: 'local' });
            return result;
        },

        _persist(reason) {
            const rev = this.db.meta.rev;
            const ok = lsSet(K_DB, JSON.stringify(this.db));
            if (ok) {
                lsSet(K_REV, String(rev));
                if (bc) { try { bc.postMessage({ rev }); } catch (e) { /* ช่องทางสำรอง ล้มได้ */ } }
            } else {
                _mem = this.db;   // เก็บไว้ในหน่วยความจำอย่างน้อยให้แท็บนี้เดินต่อ
            }
        },

        /* ── สมัครรับการเปลี่ยนแปลง ───────────────────────── */
        subscribe(cb) {
            subs.push(cb);
            return () => { const i = subs.indexOf(cb); if (i >= 0) subs.splice(i, 1); };
        },

        /* ── ตัวนับ id ──────────────────────────────────── */
        nextId(prefix, counterKey) {
            const n = (this.db.counters[counterKey] || 0) + 1;
            this.db.counters[counterKey] = n;
            return prefix + n;
        },

        /** เลขออเดอร์ถัดไป A121, A122, ... */
        nextOrderNo() {
            const n = (this.db.counters.orderSeq || 100) + 1;
            this.db.counters.orderSeq = n;
            return 'A' + String(n).padStart(3, '0');
        },

        /* ── รีเซ็ตเดโม ──────────────────────────────────── */
        resetDemo() {
            try { localStorage.removeItem(K_DB); localStorage.removeItem(K_REV); } catch (e) { /* ไม่เป็นไร */ }
            this.db = null;
            _mem = null;
            location.href = location.pathname;   // ตัด query string เช่น ?reset=1 ทิ้งไปด้วย
        },

        isPersistent() { return _usable; },
    };
})();
