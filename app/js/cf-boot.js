/**
 * CafeFlow — ลำดับการเปิดหน้า
 * ══════════════════════════════════════════════════════════════════
 * ข้อมูลมาจากเซิร์ฟเวอร์ การ boot จึงเป็น async เสมอ — แต่เราไม่อยากให้
 * ทุกหน้าต้องรู้เรื่องนั้น จึงรวมไว้ที่นี่ที่เดียว (ดึง snapshot แล้วตรวจสิทธิ์)
 *
 *   ใน <head>          CFBoot.gate('PAY_RECEIVE')
 *   ท้าย page-*.js     CFBoot.ready(() => XPage.boot())
 */
(function () {
    'use strict';

    let readyPromise = null;
    const waiting = [];
    let failed = null;

    function showFatal(msg, detail) {
        const el = document.createElement('div');
        el.setAttribute('role', 'alert');
        el.style.cssText = 'position:fixed;inset:0;z-index:99999;display:grid;place-items:center;' +
            'background:#F5F5F5;font-family:Anuphan,system-ui,sans-serif;padding:24px;text-align:center';
        el.innerHTML =
            '<div style="max-width:460px">' +
            '<div style="font-size:22px;font-weight:700;color:#23282D;margin-bottom:10px">' + msg + '</div>' +
            '<div style="font-size:15px;color:#6B7280;line-height:1.7">' + (detail || '') + '</div>' +
            '<button style="margin-top:20px;min-height:48px;padding:0 28px;border-radius:10px;border:0;' +
            'background:#06C755;color:#fff;font-size:16px;font-weight:700;font-family:inherit;cursor:pointer" ' +
            'onclick="location.reload()">ลองใหม่</button></div>';
        document.body.appendChild(el);
    }

    window.CFBoot = {
        /**
         * เรียกใน <head> — เริ่มโหลดข้อมูลทันทีโดยไม่รอ DOM
         * ถ้าไม่มี session ก็เด้งไปหน้าล็อกอินเลยโดยไม่ต้องรอเน็ต
         */
        gate(permission, opts) {
            if (readyPromise) return readyPromise;
            opts = opts || {};

            readyPromise = (async () => {
                // หน้าที่เปิดได้ก่อนล็อกอิน (เช่นหน้าล็อกอินเอง) ต้องไม่ดึง snapshot
                // เพราะ /api/bootstrap ต้องมีตัวตนก่อน — จะกลายเป็นไก่กับไข่
                if (opts.publicPage) return;

                // ไม่มี session → เด้งก่อนดึงข้อมูล: /api/bootstrap ต้องล็อกอินก่อน
                // ถ้าไปดึงก่อนจะได้ 401 กลายเป็นจอ error แทนที่จะไปหน้าล็อกอิน
                const needsLogin = window.CFAuth && permission !== false;
                if (needsLogin && !CFAuth.isLoggedIn()) {
                    CFAuth.toLogin();
                    throw new Error('redirecting');
                }

                try {
                    await CFStore.init();
                } catch (err) {
                    // มี session ในเบราว์เซอร์ แต่เซิร์ฟเวอร์ไม่รับแล้ว (หมดอายุ/ถูกเพิกถอน)
                    if (needsLogin && err && err.status === 401) {
                        CFAuth.toLogin();
                        throw new Error('redirecting');
                    }
                    throw err;
                }

                // ตรวจสิทธิ์หลังข้อมูลพร้อม (ตาราง users อยู่ใน snapshot)
                // นี่เป็นด่านระดับ UX เท่านั้น — เซิร์ฟเวอร์ต้องตรวจซ้ำทุก endpoint เสมอ
                if (window.CFAuth && permission !== false) {
                    if (!CFAuth.guard(permission)) throw new Error('redirecting');
                }
            })();

            readyPromise.catch((err) => {
                if (err && err.message === 'redirecting') return;   // กำลังเด้งไปหน้าอื่น
                failed = err;
                const offline = err && err.offline;
                const show = () => showFatal(
                    offline ? 'ติดต่อเซิร์ฟเวอร์ของร้านไม่ได้' : 'เปิดหน้านี้ไม่สำเร็จ',
                    offline ? 'ตรวจสอบว่าเครื่องนี้ต่อกับเครือข่ายของร้านอยู่ และเซิร์ฟเวอร์เปิดอยู่'
                            : (err && err.message) || '');
                if (document.body) show();
                else document.addEventListener('DOMContentLoaded', show);
            });

            return readyPromise;
        },

        /** เรียกแทน document.addEventListener('DOMContentLoaded', …) ท้าย page-*.js */
        ready(fn) {
            waiting.push(fn);
            const run = () => {
                if (failed) return;
                (readyPromise || Promise.resolve()).then(() => {
                    while (waiting.length) {
                        const f = waiting.shift();
                        try { f(); } catch (e) { console.error('[CFBoot] boot ล้ม', e); }
                    }
                }).catch(() => { /* gate จัดการแสดงข้อผิดพลาดไปแล้ว */ });
            };
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
            else run();
        },

        /** true เมื่อข้อมูลพร้อมแล้ว — ใช้ตอนเขียนโค้ดที่อาจถูกเรียกก่อน boot */
        isReady() { return !!(CFStore.db && !failed); },
    };
})();
