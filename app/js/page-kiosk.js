/**
 * CafeFlow — หน้าคีออสก์ (ตัวห่อบางของเว็บแอป)
 * ------------------------------------------------------------
 * ตรรกะทั้งหมดอยู่ใน cf-kiosk-core.js / cf-kiosk-art.js / cf-kiosk.css
 * ซึ่งอาร์ติแฟกต์กินไปตรง ๆ — ไฟล์นี้มีแค่สิ่งที่เป็นของ "เว็บแอป" เท่านั้น
 * คือการจำว่าเครื่องนี้คือคีออสก์ตัวไหน
 */
const KioskBoot = {

    K_DEVICE: 'cafeflow.kiosk.v1',

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

    boot() {
        const dev = this.loadDevice();
        if (!dev) { this.showGate(); return; }
        CFKiosk.boot({ deviceId: dev, allowDeviceGate: true });
    },
};

window.KioskBoot = KioskBoot;
CFBoot.ready(() => KioskBoot.boot());
