/**
 * CafeFlow — หน้าคีออสก์ (ตัวห่อบางของเว็บแอป)
 * ------------------------------------------------------------
 * ตรรกะหน้าจอทั้งหมดอยู่ใน cf-kiosk-core.js / cf-kiosk-art.js / cf-kiosk.css
 * ไฟล์นี้มีแค่การพิสูจน์ว่าเครื่องนี้เป็นคีออสก์ของร้านจริง
 *
 * เครื่องต้องถูก "จับคู่" โดยผู้จัดการก่อน จึงจะสั่งออเดอร์ได้
 * ตัวตนอยู่ใน cookie httpOnly ที่เซิร์ฟเวอร์ออกให้ JavaScript แตะไม่ได้
 * (ไม่มีการเลือกเครื่องเองจากรายการ — ไม่งั้นใครบน LAN ก็สวมเป็นคีออสก์ได้)
 */
const KioskBoot = {

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
            await this.start(res.deviceId);
        } catch (err) {
            msg.textContent = err.message || 'จับคู่ไม่สำเร็จ';
            input.value = '';
            input.focus();
        }
    },

    /**
     * ดึง snapshot แล้วเปิดหน้าจอลูกค้า — ต้องทำหลังรู้ว่าเครื่องจับคู่แล้วเท่านั้น
     * เพราะ /api/bootstrap ตอบ 401 กับเครื่องที่ยังไม่จับคู่ (kiosk.html จึงเรียก
     * CFBoot.gate แบบ publicPage ไม่ให้ดึงตั้งแต่ใน <head> แล้วขึ้นจอ error ทับด่านจับคู่)
     */
    async start(deviceId) {
        await CFStore.init();
        document.getElementById('deviceGate').hidden = true;
        CFKiosk.boot({ deviceId });
    },

    async boot() {
        // ตัวตนอยู่ใน cookie — ถามเซิร์ฟเวอร์ว่าเครื่องนี้คือใคร ไม่เชื่อ localStorage
        try {
            const me = await CFApi.get('/api/devices/me');
            if (!me.paired) { this.showPairGate(); return; }
            if (me.kind !== 'KIOSK') {
                this.showPairGate('เครื่องนี้ถูกจับคู่เป็น ' + me.kind + ' ไม่ใช่คีออสก์');
                return;
            }
            await this.start(me.deviceId);
        } catch (err) {
            this.showPairGate(err.offline ? 'ติดต่อเซิร์ฟเวอร์ของร้านไม่ได้' : err.message);
        }
    },
};

window.KioskBoot = KioskBoot;
CFBoot.ready(() => KioskBoot.boot());
