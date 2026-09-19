/**
 * CafeFlow — หน้าคีออสก์ (ตัวห่อบางของเว็บแอป)
 * ------------------------------------------------------------
 * ตรรกะทั้งหมดอยู่ใน cf-kiosk-core.js / cf-kiosk-art.js / cf-kiosk.css
 * ซึ่งอาร์ติแฟกต์กินไปตรง ๆ — ไฟล์นี้มีแค่สิ่งที่เป็นของ "เว็บแอป" เท่านั้น
 * คือการพิสูจน์ว่าเครื่องนี้เป็นคีออสก์ของร้านจริง
 *
 * โหมด api  เครื่องต้องถูก "จับคู่" โดยผู้จัดการก่อน จึงจะสั่งออเดอร์ได้
 *           ตัวตนอยู่ใน cookie httpOnly ที่เซิร์ฟเวอร์ออกให้ JavaScript แตะไม่ได้
 * โหมด local (เดโม) เลือกเครื่องเองได้เหมือนเดิม เพราะไม่มีของจริงให้ปลอมแปลง
 */
const KioskBoot = {

    K_DEVICE: 'cafeflow.kiosk.v1',

    /* ══════════════════════════════════════════════════════
       โหมดเดโม — เลือกเครื่องเองจากรายการ
       ══════════════════════════════════════════════════════ */
    loadDevice() {
        const q = new URLSearchParams(location.search).get('device');
        if (q) { this.save(q); return q; }
        try { return localStorage.getItem(this.K_DEVICE); } catch (e) { return null; }
    },

    save(id) {
        try { localStorage.setItem(this.K_DEVICE, id); } catch (e) { /* โหมดอ่านอย่างเดียว */ }
    },

    showGate() {
        const e = CFApp.esc;
        const kiosks = CFStore.where('devices', (d) => d.type === 'KIOSK');
        document.getElementById('deviceList').innerHTML = kiosks.map((d) => `
            <button class="cf-kiosk-gate-btn" onclick="KioskBoot.pick('${d.id}')">
                <span><strong>${e(d.name)}</strong><small>${e(d.id)} · ${e(d.ip)}</small></span>
                <span class="cf-gate-chip ${d.status === 'ONLINE' ? 'ok' : ''}">
                    ${d.status === 'ONLINE' ? 'พร้อมใช้งาน' : 'ออฟไลน์'}</span>
            </button>`).join('');
        document.getElementById('deviceGate').hidden = false;
    },

    pick(id) {
        this.save(id);
        document.getElementById('deviceGate').hidden = true;
        CFKiosk.boot({ deviceId: id, allowDeviceGate: true });
    },

    /* ══════════════════════════════════════════════════════
       โหมด api — จับคู่ด้วยรหัสจากผู้จัดการ
       ══════════════════════════════════════════════════════ */
    showPairGate(msg) {
        const gate = document.getElementById('deviceGate');
        gate.querySelector('h2').textContent = 'เครื่องนี้ยังไม่ได้จับคู่';
        gate.querySelector('p').textContent =
            'ขอรหัสจับคู่ 6 หลักจากผู้จัดการ (หน้าภาพรวม › อุปกรณ์ในเครือข่าย) แล้วกรอกที่นี่';
        document.getElementById('deviceList').innerHTML = `
            <div class="cf-pair-box">
                <input id="pairCode" class="cf-pair-input" maxlength="6" autocomplete="off"
                       inputmode="text" placeholder="ABC123"
                       oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9]/g,'')"
                       onkeydown="if(event.key==='Enter')KioskBoot.submitPair()">
                <button class="cf-kiosk-gate-btn cf-pair-btn" onclick="KioskBoot.submitPair()">
                    จับคู่เครื่องนี้
                </button>
                <div class="cf-pair-msg" id="pairMsg">${msg ? CFApp.esc(msg) : ''}</div>
            </div>`;
        gate.hidden = false;
        setTimeout(() => document.getElementById('pairCode')?.focus(), 100);
    },

    async submitPair() {
        const input = document.getElementById('pairCode');
        const msg = document.getElementById('pairMsg');
        const code = (input.value || '').trim();
        if (code.length !== 6) { msg.textContent = 'กรอกรหัสให้ครบ 6 ตัว'; return; }

        msg.textContent = 'กำลังจับคู่…';
        try {
            const res = await CFApi.post('/api/devices/pair', { code });
            document.getElementById('deviceGate').hidden = true;
            CFKiosk.boot({ deviceId: res.deviceId, allowDeviceGate: false });
        } catch (err) {
            msg.textContent = err.message || 'จับคู่ไม่สำเร็จ';
            input.value = '';
            input.focus();
        }
    },

    async boot() {
        if (CFStore.mode !== 'api') {
            const dev = this.loadDevice();
            if (!dev) { this.showGate(); return; }
            CFKiosk.boot({ deviceId: dev, allowDeviceGate: true });
            return;
        }

        // ตัวตนอยู่ใน cookie — ถามเซิร์ฟเวอร์ว่าเครื่องนี้คือใคร ไม่เชื่อ localStorage
        try {
            const me = await CFApi.get('/api/devices/me');
            if (!me.paired) { this.showPairGate(); return; }
            if (me.kind !== 'KIOSK') {
                this.showPairGate('เครื่องนี้ถูกจับคู่เป็น ' + me.kind + ' ไม่ใช่คีออสก์');
                return;
            }
            CFKiosk.boot({ deviceId: me.deviceId, allowDeviceGate: false });
        } catch (err) {
            this.showPairGate(err.offline ? 'ติดต่อเซิร์ฟเวอร์ของร้านไม่ได้' : err.message);
        }
    },
};

window.KioskBoot = KioskBoot;
CFBoot.ready(() => KioskBoot.boot());
