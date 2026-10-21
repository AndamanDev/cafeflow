// ภาพหน้าจอสำหรับคู่มือ — Edge headless + CDP
// ★ ไม่แตะข้อมูลจริง: ออเดอร์ตัวอย่างใส่เข้าคำตอบ /api/bootstrap และ /api/display ในเบราว์เซอร์นี้เท่านั้น
//   คำขอเขียนทุกตัว (POST/PATCH/PUT/DELETE) ถูกตัดทิ้งก่อนถึงเซิร์ฟเวอร์ → ไม่มีอะไรบันทึก/ไม่มีอะไรพิมพ์
//   session ชั่วคราวถูกเพิกถอนตอนจบ
// usage: node docs/manual/print/take-screenshots.js   (ระบบต้องเปิดอยู่ · ภาพลง docs/manual/print/img แล้วรัน build-pdf.bat)
const path = require('path'), fs = require('fs'), crypto = require('crypto'), { spawn } = require('child_process');
const { query, pool } = require(path.join(__dirname, '..', '..', '..', 'api', 'src', 'db', 'pool.js'));
const outDir = process.argv[2] || path.join(__dirname, 'img'); fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = 'http://localhost:8080/app/';

/* ── ออเดอร์ตัวอย่าง ── */
function demo(snap) {
    const now = new Date(snap.meta.serverTime);
    const ago = (min) => new Date(now.getTime() - min * 60000).toISOString();
    const shift = snap.shifts.find((s) => s.status === 'OPEN') || snap.shifts[0];
    const P = Object.fromEntries(snap.products.map((p) => [p.id, p]));
    const pick = (id, serve) => { const p = P[id]; const st = serve || Object.keys(p.prices)[0]; return { p, st, price: p.prices[st] }; };
    const SWEET = { groupId: 'MG-SWEET', optionId: 'MO-S50', label: 'หวาน 50%', shortLabel: 'ห.50%', priceDelta: 0 };
    const spec = [
        // [เลข, สถานะ, วิธีจ่าย, นาทีก่อน, [[สินค้า, แบบ, จำนวน]], stationStatus]
        ['A002', 'COMPLETED', 'QR', 95, [['P-CH1', 'ICED', 1], ['P-BK1', null, 1]]],
        ['A003', 'COMPLETED', 'CASH', 80, [['P-AM2', null, 2]]],
        ['A004', 'COMPLETED', 'QR', 64, [['P-CH2', 'FRAPPE', 1]]],
        ['A005', 'COMPLETED', 'CASH', 51, [['P-AM5', null, 1], ['P-BK2', null, 1]]],
        ['A006', 'COMPLETED', 'QR', 40, [['P-AM3', null, 1]]],
        ['A007', 'READY', 'QR', 14, [['P-CH1', 'HOT', 1], ['P-BK1', null, 1]]],
        ['A008', 'READY', 'CASH', 11, [['P-AM6', null, 2]]],
        ['A009', 'PREPARING', 'QR', 7, [['P-CH2', 'ICED', 1], ['P-BK2', null, 1]], { BAR: 'READY', BAKERY: 'PENDING' }],
        ['A010', 'SENT_TO_KITCHEN', 'QR', 4, [['P-AM4', null, 1], ['P-CH1', 'FRAPPE', 1]]],
        ['A011', 'SENT_TO_KITCHEN', 'CASH', 2, [['P-AM7', null, 1]]],
        ['A012', 'WAITING_CASH', 'CASH', 1, [['P-AM8', null, 1], ['P-BK1', null, 2]]],
        ['A013', 'PAYMENT_REVIEW', 'QR', 1, [['P-CH2', 'HOT', 1]]],
        ['A014', 'WAITING_PAYMENT', 'QR', 0, [['P-AM2', null, 1]]],
    ];
    const orders = [], orderItems = [], payments = [];
    for (const [no, status, method, min, items, stationStatus] of spec) {
        const id = 'O-DEMO-' + no;
        let total = 0;
        items.forEach(([pid, serve, qty], k) => {
            const { p, st, price } = pick(pid, serve);
            total += price * qty;
            orderItems.push({ id: id + '-I' + (k + 1), orderId: id, productId: pid, nameSnapshot: p.nameTh, serveType: st, qty, unitPrice: price,
                              station: p.station, mods: p.station === 'BAR' ? [SWEET] : [], itemStatus: 'PENDING' });
        });
        const paid = !['WAITING_CASH', 'WAITING_PAYMENT', 'PAYMENT_REVIEW'].includes(status);
        const stations = [...new Set(items.map(([pid]) => P[pid].station))];
        orders.push({ id, orderNo: no, shiftId: shift.id, businessDate: snap.meta.serverTime.slice(0, 10), createdAt: ago(min),
                      kioskId: 'KIOSK-0' + (1 + (orders.length % 2)), cashierId: null, diningOption: orders.length % 3 ? 'DINE_IN' : 'TAKE_AWAY',
                      status, prevStatus: null, paymentMethod: method, subtotal: total, discount: 0, total,
                      stationStatus: stationStatus || Object.fromEntries(stations.map((s) => [s, status === 'READY' || status === 'COMPLETED' ? 'READY' : 'PENDING'])),
                      reprintCount: 0, recallAt: null, recallCount: 0, ts: { createdAt: ago(min), paidAt: paid ? ago(min - 1) : null },
                      cancelReason: null, helpAt: null, helpReason: null, helpAckAt: null });
        if (paid) payments.push({ id: 'PAY-DEMO-' + no, orderId: id, method, amount: total, received: method === 'CASH' ? Math.ceil(total / 100) * 100 : null,
                                  change: method === 'CASH' ? Math.ceil(total / 100) * 100 - total : null, ref: null, bank: null, txAt: ago(min - 1),
                                  verifiedBy: null, overrideBy: null, overrideReason: null, overrideAt: null, status: 'CONFIRMED', createdAt: ago(min - 1) });
    }
    snap.orders = snap.orders.filter((o) => !['PAYMENT_TIMEOUT'].includes(o.status)).concat(orders);
    snap.orderItems = snap.orderItems.concat(orderItems);
    snap.payments = snap.payments.concat(payments);
    const paidO = orders.filter((o) => payments.some((p) => p.orderId === o.id));
    const sum = (f) => paidO.filter(f).reduce((a, o) => a + o.total, 0);
    const s = { sales: sum(() => true), cash: sum((o) => o.paymentMethod === 'CASH'), qr: sum((o) => o.paymentMethod === 'QR'), orderCount: paidO.length,
                avgOrder: Math.round(sum(() => true) / paidO.length), waitingPay: 2, waitingCash: 1, paymentReview: 1, preparing: 3, ready: 2 };
    for (const t of [snap.reports.summary, snap.reports.today && snap.reports.today.summary]) if (t) Object.assign(t, s);
    if (snap.reports.cashControl) Object.assign(snap.reports.cashControl, { cashSales: s.cash, expected: snap.reports.cashControl.opening + s.cash });
    // จอทุกตัวออนไลน์ — ภาพคู่มือไม่ควรมีแถบเตือนจากสถานะเครื่องจริงตอนถ่าย
    snap.devices.forEach((d) => Object.assign(d, { status: 'ONLINE', lastSeen: snap.meta.serverTime, paired: true }));
    return snap;
}

(async () => {
    const u = (await query("SELECT id, name_th, role FROM app_user WHERE active AND role = 'ADMIN' ORDER BY id LIMIT 1")).rows[0];
    const token = crypto.randomBytes(32).toString('base64url');
    const th = crypto.createHash('sha256').update(token).digest('hex');
    await query("INSERT INTO session (token_hash, user_id, expires_at, last_seen_at) VALUES ($1,$2, now() + interval '20 minutes', now())", [th, u.id]);
    const snap = demo(await (await fetch('http://localhost:8080/api/bootstrap', { headers: { cookie: 'cf_session=' + token } })).json());
    const prof = path.join(require('os').tmpdir(), 'cafeflow-manual-shots'); fs.rmSync(prof, { recursive: true, force: true });
    const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        ['--headless=new', '--disable-gpu', '--remote-debugging-port=9335', '--user-data-dir=' + prof, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
    let ws, blocked = 0;
    try {
        let tgt;
        for (let i = 0; i < 40 && !tgt; i++) { await sleep(250); try { tgt = (await (await fetch('http://127.0.0.1:9335/json')).json()).find((t) => t.type === 'page'); } catch {} }
        ws = new WebSocket(tgt.webSocketDebuggerUrl); await new Promise((r) => ws.onopen = r);
        let id = 0; const pend = {}; const loaded = []; let cur = '';
        const cdp = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
        const fulfill = (requestId, obj) => cdp('Fetch.fulfillRequest', { requestId, responseCode: 200,
            responseHeaders: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }], body: Buffer.from(JSON.stringify(obj)).toString('base64') });
        ws.onmessage = async (m) => {
            const d = JSON.parse(m.data);
            if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; }
            if (d.method === 'Runtime.exceptionThrown') console.log('JS-ERROR', cur, (d.params.exceptionDetails.exception || {}).description || d.params.exceptionDetails.text);
            if (d.method === 'Page.loadEventFired') { loaded.forEach((f) => f()); loaded.length = 0; }
            if (d.method === 'Fetch.requestPaused') {
                const { requestId, request } = d.params; const url = request.url;
                if (request.method !== 'GET') { blocked++; return cdp('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }); }
                if (/\/api\/bootstrap/.test(url)) return fulfill(requestId, snap);
                if (/\/api\/devices\/me/.test(url)) return fulfill(requestId, { paired: true, kind: /display/.test(url) ? 'DISPLAY' : 'KIOSK',
                                                                               deviceId: /display/.test(url) ? 'DISPLAY-01' : 'KIOSK-01', name: 'demo' });
                if (/\/api\/display(\?|$)/.test(url)) {
                    const r = await (await fetch(url, { headers: { cookie: 'cf_session=' + token } })).json().catch(() => ({}));
                    r.preparing = ['A009', 'A010', 'A011'].map((orderNo) => ({ orderNo }));
                    r.ready = ['A007', 'A008'].map((orderNo) => ({ orderNo, recallAt: null }));
                    return fulfill(requestId, r);
                }
                return cdp('Fetch.continueRequest', { requestId });
            }
        };
        const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: '(async()=>{' + expr + '})()', awaitPromise: true, returnByValue: true }); return r.result && r.result.result && r.result.result.value; };
        const go = async (url) => { const p = new Promise((r) => loaded.push(r)); await cdp('Page.navigate', { url }); await Promise.race([p, sleep(8000)]); await sleep(1800); };
        const size = (w, h) => cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
        const shot = async (name) => {
            const r = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
            fs.writeFileSync(path.join(outDir, name + '.jpg'), Buffer.from(r.result.data, 'base64')); console.log('shot', name);
        };
        await cdp('Page.enable'); await cdp('Runtime.enable');
        await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/*', requestStage: 'Request' }] });

        // หน้าเข้าสู่ระบบ — ก่อนใส่ cookie
        await size(1280, 760); cur = 'login'; await go(BASE + 'login.html'); await shot('login');

        await cdp('Network.enable');
        await cdp('Network.setCookie', { name: 'cf_session', value: token, url: 'http://localhost:8080/', httpOnly: true });
        await ev(`localStorage.setItem('cafeflow.session.v1', JSON.stringify({userId:${JSON.stringify(u.id)},name:${JSON.stringify(u.name_th)},role:'ADMIN',at:new Date().toISOString()}))`);

        const steps = [
            ['dashboard', 'dashboard.html', ''],
            ['cashier', 'cashier.html', ''],
            ['cashier-cash', 'cashier.html', `CashierPage.openReceiveCash('O-DEMO-A012'); await new Promise(r=>setTimeout(r,900));`],
            ['cashier-ready', 'cashier.html', `const t=[...document.querySelectorAll('button,.tab,[data-tab]')].find(b=>/พร้อมรับ/.test(b.textContent)&&b.offsetParent); t&&t.click(); await new Promise(r=>setTimeout(r,700));`],
            ['kds', 'kds.html', ''],
            ['orders', 'orders.html', ''],
            ['closing', 'closing.html', ''],
            ['menu', 'menu.html', ''],
            ['menu-product', 'menu.html', `MenuPage.openProduct('P-CH1'); await new Promise(r=>setTimeout(r,900));`],
            ['reports', 'reports.html', ''],
            ['set-shop', 'dashboard.html?shop=1', `await new Promise(r=>setTimeout(r,900));`],
            ['set-users', 'dashboard.html?users=1', `await new Promise(r=>setTimeout(r,900));`],
            ['set-devices', 'dashboard.html?devices=1', `await new Promise(r=>setTimeout(r,900));`],
            ['set-printers', 'dashboard.html?printers=1', `await new Promise(r=>setTimeout(r,900));`],
            ['set-kiosk', 'dashboard.html?kiosk=1', `await new Promise(r=>setTimeout(r,900));`],
            ['display', 'display.html', ''],
        ];
        for (const [name, page, js] of steps) {
            cur = name; await go(BASE + page);
            if (js) await ev(js);
            await shot(name);
        }

        // คีออสก์ — จอแนวตั้ง
        await size(720, 1280); cur = 'kiosk';
        await go(BASE + 'kiosk.html'); await sleep(1200); await shot('kiosk-start');
        await ev("CFKiosk.start()"); await sleep(900); await shot('kiosk-dining');
        await ev("CFKiosk.setDining('DINE_IN')"); await sleep(1200); await shot('kiosk-menu');
        await ev("CFKiosk.openItem('P-CH1')"); await sleep(1200); await shot('kiosk-item');
        console.log('blocked write requests:', blocked);
    } finally {
        try { ws && ws.close(); } catch {}
        edge.kill();
        await query('UPDATE session SET revoked_at = now() WHERE token_hash = $1', [th]);
        await pool.end();
    }
})().catch((e) => { console.error(e); process.exit(1); });
