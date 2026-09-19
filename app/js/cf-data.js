/**
 * CafeFlow — SEED DATA
 * ------------------------------------------------------------
 * CF_SEED(now) คืนฐานข้อมูลเดโมชุดใหม่ทุกครั้ง
 * เป็น "ฟังก์ชัน" ไม่ใช่ค่าคงที่ เพื่อให้ timestamp อิงเวลาที่ seed จริง
 * (ไม่งั้นเปิดเดโมวันถัดไปจะเห็น dashboard ว่างและ timer KDS 20 ชั่วโมง)
 *
 * เมนูถอดจากป้ายหน้าร้านจริง — ดูหมายเหตุที่หัวข้อ PRODUCTS
 * โครงสร้างอิง CafeFlow_System_Design_AndamanTech.md
 *   §8 audit · §10 menu · §11 modifier · §18 routing · §29 roles · §30 devices
 */

/* ══════════════════════════════════════════════════════════
   ค่าคงที่ที่ใช้ร่วมทั้งแอป — ย้ายไป shared/cf-consts.js แล้ว
   (CF_STATIONS · CF_SERVE · CF_SERVE_ORDER · CF_STATUS · CF_DINING ·
    CF_DINING_MODES · CF_DINING_MODE · CF_KIOSK_DEFAULTS · CF_KIOSK_SIZES)
   เซิร์ฟเวอร์ Node ต้องใช้ชุดเดียวกับเบราว์เซอร์ — shared/ จึงต้องโหลดก่อนไฟล์นี้เสมอ
   ══════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════
   SEED
   ══════════════════════════════════════════════════════════ */
function CF_SEED(now) {
    const T = now instanceof Date ? now : new Date();
    const iso = (minsAgo) => new Date(T.getTime() - minsAgo * 60000).toISOString();
    const todayAt = (h, m) => {
        const d = new Date(T);
        d.setHours(h, m || 0, 0, 0);
        return d.toISOString();
    };

    /* ── ผู้ใช้ (§29) ──────────────────────────────────────── */
    const users = [
        { id: 'U-1', username: 'admin',   password: 'demo', name: 'ศิริพร ก.',  role: 'ADMIN',   active: true, overrideLimit: null },
        { id: 'U-2', username: 'manager', password: 'demo', name: 'ธนกฤต ว.',   role: 'MANAGER', active: true, overrideLimit: null },
        { id: 'U-3', username: 'cashier', password: 'demo', name: 'ปิยะดา ส.',  role: 'CASHIER', active: true, overrideLimit: 500 },
        { id: 'U-4', username: 'kitchen', password: 'demo', name: 'อนุชา พ.',   role: 'KITCHEN', active: true, overrideLimit: 0 },
        { id: 'U-5', username: 'viewer',  password: 'demo', name: 'ผู้ชมข้อมูล', role: 'VIEWER',  active: true, overrideLimit: 0 },
    ];

    /* ── อุปกรณ์ (§30) ─────────────────────────────────────── */
    const devices = [
        { id: 'KIOSK-01',   type: 'KIOSK',   name: 'คีออสก์ 01',      ip: '192.168.1.21', assignedStation: null,  assignedCashier: 'CASHIER-01', lastSeen: iso(0),   status: 'ONLINE' },
        { id: 'KIOSK-02',   type: 'KIOSK',   name: 'คีออสก์ 02',      ip: '192.168.1.22', assignedStation: null,  assignedCashier: 'CASHIER-01', lastSeen: iso(0),   status: 'ONLINE' },
        { id: 'KIOSK-03',   type: 'KIOSK',   name: 'คีออสก์ 03',      ip: '192.168.1.23', assignedStation: null,  assignedCashier: 'CASHIER-01', lastSeen: iso(42),  status: 'OFFLINE' },
        { id: 'CASHIER-01', type: 'CASHIER', name: 'เคาน์เตอร์ 01',   ip: '192.168.1.31', assignedStation: null,  assignedCashier: null,         lastSeen: iso(0),   status: 'ONLINE' },
        { id: 'BAR-KDS',    type: 'KDS',     name: 'จอครัว — บาร์',   ip: '192.168.1.41', assignedStation: 'BAR', assignedCashier: null,         lastSeen: iso(0),   status: 'ONLINE' },
        { id: 'BAR-PRN',    type: 'PRINTER', name: 'เครื่องพิมพ์บาร์', ip: '192.168.1.51', assignedStation: 'BAR', assignedCashier: null,         lastSeen: iso(1),   status: 'ONLINE' },
        { id: 'DISPLAY-01', type: 'DISPLAY', name: 'จอแสดงคิว',       ip: '192.168.1.61', assignedStation: null,  assignedCashier: null,         lastSeen: iso(95),  status: 'OFFLINE' },
    ];

    /* ── หมวดเมนู (§10) — ตามป้ายหน้าร้าน ─────────────────── */
    const categories = [
        { id: 'C-COFFEE',  nameTh: 'กาแฟ',            nameEn: 'Coffee',      sort: 1, active: true },
        { id: 'C-TEA',     nameTh: 'ชา',              nameEn: 'Tea',         sort: 2, active: true },
        { id: 'C-MATCHA',  nameTh: 'มัทฉะ',           nameEn: 'Matcha',      sort: 3, active: true },
        { id: 'C-CHOCO',   nameTh: 'ช็อกโกแลต',       nameEn: 'Chocolate',   sort: 4, active: true },
        { id: 'C-SODA',    nameTh: 'โซดา & เลม่อน',   nameEn: 'Soda & Lemon', sort: 5, active: true },
        { id: 'C-VALUE',   nameTh: 'ประหยัดสุดคุ้ม',  nameEn: 'Value',       sort: 6, active: true },
        { id: 'C-RECO',    nameTh: 'เมนูแนะนำ',       nameEn: 'Recommended', sort: 7, active: true },
        { id: 'C-BAKERY',  nameTh: 'เบเกอรี่',        nameEn: 'Bakery',      sort: 8, active: true },
        { id: 'C-FOOD',    nameTh: 'อาหาร',           nameEn: 'Food',        sort: 9, active: true },
        { id: 'C-DESSERT', nameTh: 'ของหวาน',         nameEn: 'Dessert',     sort: 10, active: true },
    ];

    /* ── กลุ่มตัวเลือก + ตัวเลือก (§11) ──────────────────────
       ผูกกับ "แบบเสิร์ฟ" และ "หมวด" ด้วยกฎ ไม่ hard-code ต่อสินค้า */
    const modifierGroups = [
        { id: 'MG-SWEET',  nameTh: 'ระดับความหวาน',  type: 'SINGLE', required: true },
        { id: 'MG-ICE',    nameTh: 'น้ำแข็ง',         type: 'SINGLE', required: true },
        { id: 'MG-ADDON',  nameTh: 'ท็อปปิ้งเพิ่ม',   type: 'MULTI',  required: false },
        { id: 'MG-BEAN',   nameTh: 'เมล็ดกาแฟพิเศษ',  type: 'SINGLE', required: false },
        { id: 'MG-MATCHA', nameTh: 'เกรดมัทฉะ',       type: 'SINGLE', required: false },
    ];

    const modifierOptions = [
        { id: 'MO-S0',   groupId: 'MG-SWEET', nameTh: 'หวาน 0%',   shortLabel: 'ห.0%',   priceDelta: 0, isDefault: false, sort: 1 },
        { id: 'MO-S25',  groupId: 'MG-SWEET', nameTh: 'หวาน 25%',  shortLabel: 'ห.25%',  priceDelta: 0, isDefault: false, sort: 2 },
        { id: 'MO-S50',  groupId: 'MG-SWEET', nameTh: 'หวาน 50%',  shortLabel: 'ห.50%',  priceDelta: 0, isDefault: false, sort: 3 },
        { id: 'MO-S75',  groupId: 'MG-SWEET', nameTh: 'หวาน 75%',  shortLabel: 'ห.75%',  priceDelta: 0, isDefault: false, sort: 4 },
        { id: 'MO-S100', groupId: 'MG-SWEET', nameTh: 'หวาน 100%', shortLabel: 'ห.100%', priceDelta: 0, isDefault: true,  sort: 5 },

        { id: 'MO-I-N',  groupId: 'MG-ICE',   nameTh: 'น้ำแข็งปกติ',      shortLabel: 'นข.ปกติ', priceDelta: 0, isDefault: true,  sort: 1 },
        { id: 'MO-I-L',  groupId: 'MG-ICE',   nameTh: 'น้ำแข็งน้อย',      shortLabel: 'นข.น้อย', priceDelta: 0, isDefault: false, sort: 2 },
        { id: 'MO-I-S',  groupId: 'MG-ICE',   nameTh: 'แยกน้ำ / น้ำแข็ง', shortLabel: 'แยกนข.',  priceDelta: 0, isDefault: false, sort: 3 },

        /* ADD ON — ตามป้ายจริง */
        { id: 'MO-A-OAT',   groupId: 'MG-ADDON', nameTh: 'นมโอ๊ต',              shortLabel: 'โอ๊ต',   priceDelta: 10, isDefault: false, sort: 1 },
        { id: 'MO-A-SODA',  groupId: 'MG-ADDON', nameTh: 'โซดา',                shortLabel: 'โซดา',   priceDelta: 10, isDefault: false, sort: 2 },
        { id: 'MO-A-SYRUP', groupId: 'MG-ADDON', nameTh: 'ไซรัป (สตรอว์เบอร์รี / วานิลลา / คาราเมล / บราวน์ชูการ์)', shortLabel: 'ไซรัป', priceDelta: 20, isDefault: false, sort: 3 },
        { id: 'MO-A-KONJ',  groupId: 'MG-ADDON', nameTh: 'บุกบราวน์ชูการ์ / บุกคาราเมล / เจลลี่',    shortLabel: 'บุก/เจลลี่', priceDelta: 20, isDefault: false, sort: 4 },
        { id: 'MO-A-PALM',  groupId: 'MG-ADDON', nameTh: 'ตาลโตนด',             shortLabel: 'ตาลโตนด', priceDelta: 20, isDefault: false, sort: 5 },
        { id: 'MO-A-SHOT',  groupId: 'MG-ADDON', nameTh: 'เพิ่มช็อตกาแฟ',       shortLabel: '+ช็อต',  priceDelta: 20, isDefault: false, sort: 6 },

        /* กาแฟพิเศษ SPECIAL COFFEE */
        { id: 'MO-B-STD',  groupId: 'MG-BEAN', nameTh: 'กาแฟไทย / ลาวพรีเมี่ยม (คั่วกลาง-เข้ม)', shortLabel: 'ไทย/ลาว', priceDelta: 0,  isDefault: true,  sort: 1 },
        { id: 'MO-B-BRA',  groupId: 'MG-BEAN', nameTh: 'กาแฟบราซิล (คั่วกลาง-เข้ม)',             shortLabel: 'บราซิล',  priceDelta: 20, isDefault: false, sort: 2 },
        { id: 'MO-B-ETH',  groupId: 'MG-BEAN', nameTh: 'กาแฟเอธิโอเปีย (คั่วอ่อน-กลาง)',         shortLabel: 'เอธิโอเปีย', priceDelta: 20, isDefault: false, sort: 3 },
        { id: 'MO-B-DOI',  groupId: 'MG-BEAN', nameTh: 'กาแฟดอยช้าง (คั่วกลาง-เข้ม)',            shortLabel: 'ดอยช้าง', priceDelta: 20, isDefault: false, sort: 4 },

        /* ADD มัทฉะเกรดพิธีการ +20 */
        { id: 'MO-M-STD',  groupId: 'MG-MATCHA', nameTh: 'มัทฉะปกติ',           shortLabel: 'ปกติ',    priceDelta: 0,  isDefault: true,  sort: 1 },
        { id: 'MO-M-CER',  groupId: 'MG-MATCHA', nameTh: 'มัทฉะเกรดพิธีการ',    shortLabel: 'พิธีการ', priceDelta: 20, isDefault: false, sort: 2 },
    ];

    /**
     * กฎ §11 — ผูกกับ "แบบเสิร์ฟ" (serveType) หรือ "หมวด" (categoryId)
     *   เย็น  → หวาน · น้ำแข็ง · ท็อปปิ้ง
     *   ปั่น  → หวาน · ท็อปปิ้ง        (ปั่นแล้วไม่มีน้ำแข็งแยก)
     *   ร้อน  → หวาน · ท็อปปิ้ง
     *   ปกติ (อาหาร) → ไม่มี
     *   หมวดกาแฟ → เมล็ดพิเศษ · หมวดมัทฉะ → เกรดมัทฉะ
     */
    const modifierRules = [
        { id: 'R-I1', serveType: 'ICED',   groupId: 'MG-SWEET', sort: 1 },
        { id: 'R-I2', serveType: 'ICED',   groupId: 'MG-ICE',   sort: 2 },
        { id: 'R-I3', serveType: 'ICED',   groupId: 'MG-ADDON', sort: 9 },
        { id: 'R-F1', serveType: 'FRAPPE', groupId: 'MG-SWEET', sort: 1 },
        { id: 'R-F2', serveType: 'FRAPPE', groupId: 'MG-ADDON', sort: 9 },
        { id: 'R-H1', serveType: 'HOT',    groupId: 'MG-SWEET', sort: 1 },
        { id: 'R-H2', serveType: 'HOT',    groupId: 'MG-ADDON', sort: 9 },
        { id: 'R-C1', categoryId: 'C-COFFEE', groupId: 'MG-BEAN',   sort: 5 },
        { id: 'R-C2', categoryId: 'C-MATCHA', groupId: 'MG-MATCHA', sort: 5 },
    ];

    /* ══════════════════════════════════════════════════════
       PRODUCTS — ถอดจากป้ายหน้าร้าน
       ------------------------------------------------------
       P(id, groupTh, nameTh, nameEn, categoryId, [ร้อน, เย็น, ปั่น], station)
       null = ป้ายเขียน '–' คือไม่มีขายแบบนั้น (ห้ามแปลงเป็น 0)
       ══════════════════════════════════════════════════════ */
    const products = [];
    const P = (id, groupTh, nameTh, nameEn, categoryId, [hot, iced, frappe], station, extra) => {
        const prices = {};
        if (hot    != null) prices.HOT = hot;
        if (iced   != null) prices.ICED = iced;
        if (frappe != null) prices.FRAPPE = frappe;
        products.push(Object.assign({
            id, groupTh, nameTh, nameEn, categoryId, prices,
            station: station || 'BAR', active: true, soldOut: false,
        }, extra || {}));
    };
    /** ของที่ไม่มีแกนร้อน/เย็น/ปั่น (อาหาร เบเกอรี่ ของหวาน) */
    const PS = (id, groupTh, nameTh, nameEn, categoryId, price, station, extra) => {
        products.push(Object.assign({
            id, groupTh, nameTh, nameEn, categoryId, prices: { STD: price },
            station, active: true, soldOut: false,
        }, extra || {}));
    };

    /* ── COFFEE · HOUSE BLEND (ลาว-โบลาเวน) ── */
    P('P-HB1', 'HOUSE BLEND', 'เอสเปรสโซ่',        'Espresso',             'C-COFFEE', [50, 50, 70]);
    P('P-HB2', 'HOUSE BLEND', 'อเมริกาโน',         'Americano',            'C-COFFEE', [50, 50, 70]);
    P('P-HB3', 'HOUSE BLEND', 'คาปูชิโน',          'Cappuccino',           'C-COFFEE', [50, 50, 70]);
    P('P-HB4', 'HOUSE BLEND', 'ลาเต้',             'Latte',                'C-COFFEE', [50, 50, 70]);
    P('P-HB5', 'HOUSE BLEND', 'ดาร์คมอคค่า',       'Dark Mocha',           'C-COFFEE', [70, 70, 90]);
    P('P-HB6', 'HOUSE BLEND', 'ไวท์มอคค่า',        'White Mocha',          'C-COFFEE', [70, 70, 90]);
    P('P-HB7', 'HOUSE BLEND', 'คาราเมลมัคคิอาโต้', 'Caramel Macchiato',    'C-COFFEE', [75, 75, 95]);
    P('P-HB8', 'HOUSE BLEND', 'ซอลเต็ดคาราเมลลาเต้', 'Salted Caramel Latte', 'C-COFFEE', [null, 75, 95]);

    /* ── COFFEE · AMERICANO (เย็นอย่างเดียว) ── */
    P('P-AM1', 'AMERICANO', 'อเมริกาโน โซดา',              'Americano Soda',             'C-COFFEE', [null, 60, null]);
    P('P-AM2', 'AMERICANO', 'อเมริกาโน ฮันนี่',            'Americano Honey',            'C-COFFEE', [null, 70, null]);
    P('P-AM3', 'AMERICANO', 'อเมริกาโน ฮันนี่เลมอน',       'Americano Honey Lemon',      'C-COFFEE', [null, 75, null]);
    P('P-AM4', 'AMERICANO', 'อเมริกาโน ฮันนี่เลมอนโซดา',   'Americano Honey Lemon Soda', 'C-COFFEE', [null, 80, null]);
    P('P-AM5', 'AMERICANO', 'อเมริกาโน ยูซุ',              'Americano Yuzu',             'C-COFFEE', [null, 70, null]);
    P('P-AM6', 'AMERICANO', 'อเมริกาโน โคโคนัท',           'Americano Coconut',          'C-COFFEE', [null, 70, null]);
    P('P-AM7', 'AMERICANO', 'อเมริกาโน โคโคนัทโซดา',       'Americano Coconut Soda',     'C-COFFEE', [null, 80, null]);
    P('P-AM8', 'AMERICANO', 'อเมริกาโน ยูซุโซดา',          'Americano Yuzu Soda',        'C-COFFEE', [null, 80, null]);

    /* ── COFFEE · SIGNATURE ── */
    P('P-SG1', 'SIGNATURE COFFEE', 'กาแฟสูตรอาม่า (ต้นตำรับ SINCE 1951)', 'Ama Signature', 'C-COFFEE', [null, 55, null]);
    P('P-SG2', 'SIGNATURE COFFEE', 'กาแฟ Cafe de Conner',                 'Cafe de Conner', 'C-COFFEE', [null, 60, null]);
    P('P-SG3', 'SIGNATURE COFFEE', 'คาปูโอลคาโน่ (MUST TRY)',             'Cappu Volcano',  'C-COFFEE', [null, 70, null]);

    /* ── TEA ── */
    P('P-TE1', 'TEA', 'ชาดำเย็นพรีเมี่ยม',  'Premium Iced Black Tea', 'C-TEA', [null, 50, null]);
    P('P-TE2', 'TEA', 'ชามะนาวพรีเมี่ยม',   'Premium Lemon Tea',      'C-TEA', [null, 50, null]);
    P('P-TE3', 'TEA', 'ชามะนาวสูตร 2',      'Lemon Tea Recipe 2',     'C-TEA', [null, 55, null]);
    P('P-TE4', 'TEA', 'ชาพีช',              'Peach Tea',              'C-TEA', [null, 50, null]);
    P('P-TE5', 'TEA', 'ชาเอิร์ลเกรย์',      'Earl Grey',              'C-TEA', [55, 60, null]);
    P('P-TE6', 'TEA', 'ชาเขียวน้ำผึ้ง',     'Green Tea Honey',        'C-TEA', [null, 65, null]);
    P('P-TE7', 'TEA', 'ชาดำน้ำผึ้ง',        'Black Tea Honey',        'C-TEA', [null, 65, null]);
    P('P-TE8', 'TEA', 'ชาอู่หลงน้ำผึ้ง',    'Oolong Honey',           'C-TEA', [null, 65, null]);

    /* ── TEA WITH MILK ── */
    P('P-TM1', 'TEA WITH MILK', 'ชานมพรีเมี่ยม',    'Premium Milk Tea',  'C-TEA', [50, 50, 70]);
    P('P-TM2', 'TEA WITH MILK', 'ชานมไทยใส่สี',     'Thai Milk Tea',     'C-TEA', [null, 50, 70]);
    P('P-TM3', 'TEA WITH MILK', 'ชาซีลอนศรีลังกา',  'Ceylon Milk Tea',   'C-TEA', [60, 60, 80]);

    /* ── TWO TONE / TRIPLE LADY ── */
    P('P-TT1', 'TWO TONE',    'ทูโทน ชานม / กาแฟ / โกโก้ / มัทฉะ', 'Two Tone',    'C-TEA', [null, 70, 90]);
    P('P-TL1', 'TRIPLE LADY', 'ทริปเปิลเลดี้ (เย็น)',              'Triple Lady', 'C-TEA', [null, 75, null]);

    /* ── CHOCOLATE ── */
    P('P-CH1', 'CHOCOLATE', 'ช็อกมอลต์',          'Choco Malt',       'C-CHOCO', [50, 50, 70]);
    P('P-CH2', 'CHOCOLATE', 'ดาร์คช็อกโกแลต',     'Dark Chocolate',   'C-CHOCO', [50, 50, 70]);
    P('P-CH3', 'CHOCOLATE', 'ไวท์มอลต์',          'White Malt',       'C-CHOCO', [60, 60, 80]);
    P('P-CH4', 'CHOCOLATE', 'ช็อกโกแลตเบลเยี่ยม', 'Belgian Chocolate','C-CHOCO', [70, 70, 90]);

    /* ── SODA ── */
    P('P-SD1', 'SODA', 'บ๊วยญี่ปุ่นโซดา',        'Ume Soda',            'C-SODA', [null, 50, 60]);
    P('P-SD2', 'SODA', 'ลิ้นจี่โซดา',            'Lychee Soda',         'C-SODA', [null, 50, 60]);
    P('P-SD3', 'SODA', 'สตรอว์เบอร์รีโซดา',      'Strawberry Soda',     'C-SODA', [null, 50, 60]);
    P('P-SD4', 'SODA', 'น้ำมะนาวโซดา',           'Lime Soda',           'C-SODA', [null, 50, 60]);
    P('P-SD5', 'SODA', 'บลูโคลาโซดา',            'Blue Cola Soda',      'C-SODA', [null, 50, 60]);
    P('P-SD6', 'SODA', 'บ๊วยน้ำผึ้งมะนาวโซดา',   'Ume Honey Lime Soda', 'C-SODA', [null, 60, 70]);
    P('P-SD7', 'SODA', 'ส้มยูสุโซดา',            'Yuzu Soda',           'C-SODA', [null, 60, 70]);
    P('P-SD8', 'SODA', 'ส้มแมนดารินโซดา',        'Mandarin Soda',       'C-SODA', [null, 60, 70]);
    P('P-SD9', 'SODA', 'น้ำผึ้งมะนาวโซดา',       'Honey Lime Soda',     'C-SODA', [null, 65, 75]);

    /* ── LEMON (สด) ── */
    P('P-LM1', 'LEMON (สด)', 'น้ำเลม่อน (สด)',          'Fresh Lemonade',       'C-SODA', [null, 65, null]);
    P('P-LM2', 'LEMON (สด)', 'น้ำเลม่อนน้ำผึ้ง (สด)',   'Fresh Honey Lemonade', 'C-SODA', [null, 75, null]);
    P('P-LM3', 'LEMON (สด)', 'น้ำเลม่อนน้ำผึ้งโซดา',    'Honey Lemon Soda',     'C-SODA', [null, 80, null]);

    /* ── เมนูประหยัดสุดคุ้ม ── */
    P('P-VL1', 'ประหยัดสุดคุ้ม', 'ชาไทยโบราณ',        'Thai Tea (Classic)',  'C-VALUE', [null, 35, 45]);
    P('P-VL2', 'ประหยัดสุดคุ้ม', 'ชามะนาวไทยโบราณ',   'Thai Lemon Tea',      'C-VALUE', [null, 35, 45]);
    P('P-VL3', 'ประหยัดสุดคุ้ม', 'ชาดำไทยโบราณ',      'Thai Black Tea',      'C-VALUE', [null, 35, 45]);
    P('P-VL4', 'ประหยัดสุดคุ้ม', 'ชาเนสที',           'Nestea',              'C-VALUE', [null, 35, 45]);
    P('P-VL5', 'ประหยัดสุดคุ้ม', 'เนสกาแฟ',           'Nescafe',             'C-VALUE', [null, 35, 45]);
    P('P-VL6', 'ประหยัดสุดคุ้ม', 'นมชมพู',            'Pink Milk',           'C-VALUE', [null, 35, 45]);
    P('P-VL7', 'ประหยัดสุดคุ้ม', 'น้ำแดงโซดา',        'Red Soda',            'C-VALUE', [null, 35, 45]);
    P('P-VL8', 'ประหยัดสุดคุ้ม', 'น้ำแดงโซดามะนาว',   'Red Soda Lime',       'C-VALUE', [null, 40, 55]);

    /* ── MATCHA SERIES ── */
    P('P-MA1', 'MATCHA SERIES', 'ไลท์มัทฉะ',                'Light Matcha',        'C-MATCHA', [null, 50, null]);
    P('P-MA2', 'MATCHA SERIES', 'เพียวมัทฉะ + น้ำแร่',      'Pure Matcha Sparkling','C-MATCHA', [null, 55, null]);
    P('P-MA3', 'MATCHA SERIES', 'มัทฉะมะนาว',               'Matcha Lime',         'C-MATCHA', [null, 60, null]);
    P('P-MA4', 'MATCHA SERIES', 'มัทฉะลาเต้',               'Matcha Latte',        'C-MATCHA', [null, 70, 80]);
    P('P-MA5', 'MATCHA SERIES', 'มัทฉะน้ำผึ้งมะนาว',        'Matcha Honey Lime',   'C-MATCHA', [null, 70, null]);
    P('P-MA6', 'MATCHA SERIES', 'มัทฉะเลม่อน (สด)',         'Matcha Fresh Lemon',  'C-MATCHA', [null, 75, null]);
    P('P-MA7', 'MATCHA SERIES', 'มัทฉะน้ำพร้าว',            'Matcha Coconut',      'C-MATCHA', [null, 75, null]);
    P('P-MA8', 'MATCHA SERIES', 'มัทฉะเลม่อนน้ำผึ้ง (สด)',  'Matcha Honey Lemon',  'C-MATCHA', [null, 80, null]);

    /* ── RECOMMENDED MENU ── */
    P('P-RC1', 'RECOMMENDED', 'COCONUT ปั่น + เอสเปรสโซ่',   'Coconut + Espresso',     'C-RECO', [null, null, 80], 'BAR', { recommended: true });
    P('P-RC2', 'RECOMMENDED', 'COCONUT ปั่น + ชาเขียวมัทฉะ', 'Coconut + Matcha',       'C-RECO', [null, null, 80], 'BAR', { recommended: true });
    P('P-RC3', 'RECOMMENDED', 'COCONUT ปั่น + ชาเขียว',      'Coconut + Green Tea',    'C-RECO', [null, null, 80], 'BAR', { recommended: true });
    P('P-RC4', 'RECOMMENDED', 'YUZU ปั่น + เอสเปรสโซ่',      'Yuzu + Espresso',        'C-RECO', [null, null, 85], 'BAR', { recommended: true });
    P('P-RC5', 'RECOMMENDED', 'YUZU ปั่น + ชาเขียวมัทฉะ',    'Yuzu + Matcha',          'C-RECO', [null, null, 85], 'BAR', { recommended: true });
    // TODO: ยืนยันชื่อจากป้ายจริง — แถวนี้ถูกบังบนรูปที่ใช้ถอดเมนู
    P('P-RC6', 'RECOMMENDED', 'ชาไทย CLOUD',                 'Thai Tea Cloud',         'C-RECO', [null, 89, null], 'BAR', { recommended: true });
    P('P-RC7', 'RECOMMENDED', 'เอสเปรสโซ่ CLOUD',            'Espresso Cloud',         'C-RECO', [null, 89, null], 'BAR', { recommended: true });
    P('P-RC8', 'RECOMMENDED', 'ชาเขียวมัทฉะ CLOUD',          'Matcha Cloud',           'C-RECO', [null, 89, null], 'BAR', { recommended: true });
    P('P-RC9', 'RECOMMENDED', 'ชาเย็น CLOUD',                'Iced Tea Cloud',         'C-RECO', [null, 89, null], 'BAR', { recommended: true });

    /* ── ของกิน — ป้ายที่ได้มาเป็นป้ายเครื่องดื่มอย่างเดียว
          คงชุดนี้ไว้เพื่อให้ routing หลายสถานี (§18, §21) ยังมีตัวอย่าง ── */
    PS('P-BK1', 'เบเกอรี่', 'ครัวซองต์เนยสด',    'Butter Croissant',    'C-BAKERY',  65, 'BAKERY');
    PS('P-BK2', 'เบเกอรี่', 'แซนด์วิชแฮมชีส',    'Ham Cheese Sandwich', 'C-BAKERY',  75, 'BAKERY', { soldOut: true });
    PS('P-FD1', 'อาหาร',    'สปาเกตตีคาโบนาร่า', 'Spaghetti Carbonara', 'C-FOOD',   145, 'KITCHEN');
    PS('P-FD2', 'อาหาร',    'ข้าวผัดกุ้ง',       'Shrimp Fried Rice',   'C-FOOD',   130, 'KITCHEN');
    PS('P-DS1', 'ของหวาน',  'เค้กช็อกโกแลตลาวา', 'Chocolate Lava Cake', 'C-DESSERT', 95, 'DESSERT');
    PS('P-DS2', 'ของหวาน',  'ชีสเค้กนิวยอร์ก',   'NY Cheesecake',       'C-DESSERT', 90, 'DESSERT');
    PS('P-DS3', 'ของหวาน',  'บราวนี่อัลมอนด์',   'Almond Brownie',      'C-DESSERT', 70, 'DESSERT', { active: false });

    /* ── รอบการขาย (§27) ──────────────────────────────────── */
    const shifts = [{
        id: 'SH-' + T.toISOString().slice(0, 10).replace(/-/g, '') + '-01',
        openedAt: todayAt(8, 0), closedAt: null,
        openedBy: 'U-3', closedBy: null,
        openingCash: 2000, actualCash: null,
        status: 'OPEN',
    }];
    const shiftId = shifts[0].id;

    /* ══════════════════════════════════════════════════════
       ออเดอร์
       ══════════════════════════════════════════════════════ */
    const orders = [], orderItems = [], payments = [], auditLogs = [];
    let seqItem = 0, seqPay = 0, seqAudit = 0;

    const audit = (o, eventType, oldStatus, newStatus, minsAgo, actor, reason) => {
        auditLogs.push({
            id: 'AU-' + (++seqAudit),
            ts: iso(minsAgo),
            eventType, orderId: o,
            oldStatus: oldStatus || null, newStatus: newStatus || null,
            actor: actor || 'U-3', device: 'CASHIER-01',
            reason: reason || null, sourceIp: '192.168.1.31',
        });
    };

    /** spec.items = [[productId, serveType, qty, [optionIds]], ...] */
    const mkOrder = (spec) => {
        const id = 'O-' + spec.no;
        let subtotal = 0;
        const stations = new Set();

        spec.items.forEach(([pid, serveType, qty, optIds]) => {
            const p = products.find((x) => x.id === pid);
            const base = p.prices[serveType];
            if (base == null) throw new Error('seed: ' + pid + ' ไม่มีแบบเสิร์ฟ ' + serveType);

            const mods = (optIds || []).map((oid) => {
                const o = modifierOptions.find((x) => x.id === oid);
                return { groupId: o.groupId, optionId: o.id, label: o.nameTh, shortLabel: o.shortLabel, priceDelta: o.priceDelta };
            });
            const unitPrice = base + mods.reduce((s, m) => s + m.priceDelta, 0);
            subtotal += unitPrice * qty;
            stations.add(p.station);
            orderItems.push({
                id: 'OI-' + (++seqItem), orderId: id, productId: p.id,
                nameSnapshot: p.nameTh, serveType, qty, unitPrice,
                station: p.station, mods,
                itemStatus: spec.itemStatus || 'QUEUED',
            });
        });

        const stationStatus = {};
        [...stations].forEach((s) => { stationStatus[s] = (spec.stationStatus && spec.stationStatus[s]) || 'QUEUED'; });

        orders.push(Object.assign({
            id, orderNo: spec.no, shiftId,
            createdAt: iso(spec.minsAgo),
            kioskId: spec.kiosk, cashierId: spec.cashierId || null,
            status: spec.status, prevStatus: null,
            paymentMethod: spec.method,
            subtotal, discount: 0, total: subtotal,
            stationStatus, reprintCount: 0,
            ts: spec.ts || {},
            cancelReason: spec.cancelReason || null,
        }, spec.extra || {}));

        audit(id, 'ORDER_CREATED', null, 'ORDER_CONFIRMED', spec.minsAgo, 'KIOSK', 'สร้างที่ ' + spec.kiosk);
        return id;
    };

    const pay = (orderId, spec) => {
        payments.push(Object.assign({
            id: 'PM-' + (++seqPay), orderId,
            method: spec.method, amount: spec.amount,
            received: spec.received || null, change: spec.change || null,
            ref: spec.ref || null, bank: spec.bank || null, txAt: spec.txAt || null,
            verifiedBy: spec.verifiedBy || null,
            overrideBy: spec.overrideBy || null, overrideReason: spec.overrideReason || null, overrideAt: spec.overrideAt || null,
            status: spec.status || 'PAID', createdAt: spec.createdAt,
        }));
    };

    /* ── รอชำระเงินสด (§24) ── */
    mkOrder({ no: 'A118', minsAgo: 3, kiosk: 'KIOSK-02', status: 'WAITING_CASH', method: 'CASH',
        items: [['P-VL1', 'ICED', 2, ['MO-S25', 'MO-I-S']], ['P-BK1', 'STD', 1, []]] });
    mkOrder({ no: 'A119', minsAgo: 2, kiosk: 'KIOSK-01', status: 'WAITING_CASH', method: 'CASH',
        items: [['P-HB2', 'ICED', 1, ['MO-S0', 'MO-I-N', 'MO-B-STD']]] });
    mkOrder({ no: 'A120', minsAgo: 1, kiosk: 'KIOSK-02', status: 'WAITING_CASH', method: 'CASH',
        items: [['P-FD1', 'STD', 1, []], ['P-TE2', 'ICED', 2, ['MO-S50', 'MO-I-L']]] });

    /* ── รอตรวจสอบการชำระ (§16) ── */
    const rv = mkOrder({ no: 'A117', minsAgo: 9, kiosk: 'KIOSK-01', status: 'PAYMENT_REVIEW', method: 'QR',
        items: [['P-HB4', 'ICED', 1, ['MO-S50', 'MO-I-N', 'MO-B-DOI']], ['P-DS1', 'STD', 1, []]] });
    pay(rv, { method: 'QR', amount: 180, ref: 'TX20260919-88421', bank: 'KBANK', txAt: iso(8), status: 'REVIEW', createdAt: iso(9) });
    audit(rv, 'PAYMENT_TIMEOUT', 'WAITING_PAYMENT', 'PAYMENT_TIMEOUT', 8, 'SYSTEM', 'เกิน 60 วินาที');
    audit(rv, 'STATUS_CHANGE', 'PAYMENT_TIMEOUT', 'PAYMENT_REVIEW', 8, 'U-3', 'ลูกค้าแจ้งว่าชำระแล้ว');

    /* ── กำลังทำอยู่ที่ครัว ── */
    const k1 = mkOrder({ no: 'A114', minsAgo: 7, kiosk: 'KIOSK-01', status: 'PREPARING', method: 'QR',
        cashierId: 'U-3',
        items: [['P-VL1', 'ICED', 2, ['MO-S25', 'MO-I-S']], ['P-HB2', 'HOT', 1, ['MO-S0']]],
        ts: { paidAt: iso(6), sentAt: iso(6) } });
    pay(k1, { method: 'QR', amount: 120, ref: 'TX20260919-88390', bank: 'SCB', txAt: iso(6), verifiedBy: 'SYSTEM', createdAt: iso(6) });
    audit(k1, 'PAYMENT_VERIFIED', 'WAITING_PAYMENT', 'PAID', 6, 'SYSTEM', 'ตรวจสลิปอัตโนมัติ');
    audit(k1, 'STATUS_CHANGE', 'PAID', 'SENT_TO_KITCHEN', 6, 'SYSTEM', 'ส่งเข้า BAR');

    const k2 = mkOrder({ no: 'A115', minsAgo: 5, kiosk: 'KIOSK-02', status: 'PREPARING', method: 'CASH',
        cashierId: 'U-3',
        items: [['P-FD2', 'STD', 1, []], ['P-MA4', 'FRAPPE', 1, ['MO-S50', 'MO-M-CER']], ['P-DS2', 'STD', 1, []]],
        stationStatus: { BAR: 'READY' },
        ts: { paidAt: iso(4), sentAt: iso(4) } });
    pay(k2, { method: 'CASH', amount: 320, received: 500, change: 180, createdAt: iso(4), verifiedBy: 'U-3' });
    audit(k2, 'PAYMENT_RECEIVED', 'WAITING_CASH', 'PAID', 4, 'U-3', 'รับเงินสด 500 ทอน 180');
    audit(k2, 'STATION_READY', null, null, 2, 'U-4', 'BAR พร้อมแล้ว — รออีก 2 สถานี');

    const k3 = mkOrder({ no: 'A116', minsAgo: 11, kiosk: 'KIOSK-01', status: 'PREPARING', method: 'CASH',
        cashierId: 'U-3', items: [['P-FD1', 'STD', 2, []]],
        ts: { paidAt: iso(10), sentAt: iso(10) } });
    pay(k3, { method: 'CASH', amount: 290, received: 300, change: 10, createdAt: iso(10), verifiedBy: 'U-3' });
    audit(k3, 'PAYMENT_RECEIVED', 'WAITING_CASH', 'PAID', 10, 'U-3', 'รับเงินสด');

    /* ── พร้อมรับ ── */
    const readySpecs = [
        [['P-HB1', 'ICED', 1, ['MO-S0', 'MO-I-N']]],
        [['P-MA4', 'ICED', 2, ['MO-S75', 'MO-I-N', 'MO-A-KONJ']]],
        [['P-BK1', 'STD', 2, []], ['P-HB4', 'HOT', 1, ['MO-S50']]],
    ];
    readySpecs.forEach((items, i) => {
        const mins = 15 + i * 2;
        const id = mkOrder({ no: 'A' + (111 + i), minsAgo: mins, kiosk: i % 2 ? 'KIOSK-02' : 'KIOSK-01',
            status: 'READY', method: i % 2 ? 'CASH' : 'QR', cashierId: 'U-3',
            items,
            stationStatus: { BAR: 'READY', BAKERY: 'READY' },
            itemStatus: 'READY',
            ts: { paidAt: iso(mins - 0.7 - i * 0.4), sentAt: iso(mins - 0.7 - i * 0.4), readyAt: iso(2 + i) } });
        const amt = orders.find((o) => o.id === id).total;
        pay(id, i % 2
            ? { method: 'CASH', amount: amt, received: Math.ceil(amt / 100) * 100, change: Math.ceil(amt / 100) * 100 - amt, createdAt: iso(mins), verifiedBy: 'U-3' }
            : { method: 'QR', amount: amt, ref: 'TX20260919-883' + (10 + i), bank: 'KBANK', txAt: iso(mins), verifiedBy: 'SYSTEM', createdAt: iso(mins) });
        audit(id, 'STATUS_CHANGE', 'PREPARING', 'READY', 2 + i, 'U-4', 'ทุกสถานีพร้อม');
    });

    /* ── เสร็จสิ้นแล้ว (ให้ dashboard/closing มียอดจริง) ── */
    const menuPool = [
        [['P-HB1', 'ICED', 1, ['MO-S0', 'MO-I-N']]],
        [['P-VL1', 'ICED', 2, ['MO-S25', 'MO-I-S']]],
        [['P-HB4', 'ICED', 1, ['MO-S50', 'MO-I-N']], ['P-BK1', 'STD', 1, []]],
        [['P-FD1', 'STD', 1, []], ['P-TE2', 'ICED', 1, ['MO-S50', 'MO-I-N']]],
        [['P-MA4', 'FRAPPE', 1, ['MO-S50', 'MO-A-OAT']]],
        [['P-DS1', 'STD', 1, []], ['P-HB2', 'HOT', 1, ['MO-S0']]],
        [['P-RC7', 'ICED', 1, ['MO-S50', 'MO-I-N']], ['P-DS2', 'STD', 1, []]],
        [['P-SD1', 'ICED', 2, ['MO-S50', 'MO-I-N']]],
    ];
    for (let i = 0; i < 24; i++) {
        // i=0 คือใหม่สุด (40 นาทีก่อน) จึงได้เลขสูงสุด — เลขออเดอร์ไล่ตามเวลาจริง
        // ช่วง A081-A104 สงวนไว้ ไม่ให้ชนกับ A105 (ยกเลิก) และ A111+ (ที่ยังทำอยู่)
        const no = 'A' + String(104 - i).padStart(3, '0');
        const mins = 40 + i * 9;
        const method = i % 3 === 0 ? 'CASH' : 'QR';
        // กระจายเวลาแต่ละช่วงให้ต่างกันจริง ไม่งั้นค่าเฉลี่ยบน dashboard ออกมากลมเป๊ะแบบข้อมูลปลอม
        const tWait = 0.6 + (i % 5) * 0.5;
        const tPrep = 2.5 + (i % 6) * 1.1;
        const tPick = 0.8 + (i % 3) * 0.7;
        const id = mkOrder({ no, minsAgo: mins, kiosk: i % 2 ? 'KIOSK-02' : 'KIOSK-01',
            status: 'COMPLETED', method, cashierId: 'U-3',
            items: menuPool[i % menuPool.length],
            stationStatus: { BAR: 'READY', KITCHEN: 'READY', BAKERY: 'READY', DESSERT: 'READY' },
            itemStatus: 'READY',
            ts: { paidAt: iso(mins - tWait), sentAt: iso(mins - tWait),
                  readyAt: iso(mins - tWait - tPrep), servedAt: iso(mins - tWait - tPrep - tPick) } });
        const amt = orders.find((o) => o.id === id).total;
        pay(id, method === 'CASH'
            ? { method: 'CASH', amount: amt, received: Math.ceil(amt / 100) * 100, change: Math.ceil(amt / 100) * 100 - amt, createdAt: iso(mins), verifiedBy: 'U-3' }
            : { method: 'QR', amount: amt, ref: 'TX20260919-87' + String(100 + i), bank: i % 2 ? 'SCB' : 'KBANK', txAt: iso(mins), verifiedBy: 'SYSTEM', createdAt: iso(mins) });
    }

    /* ── ยกเลิก + คืนเงิน (ให้ closing มีรายการหักจริง) ── */
    const cx = mkOrder({ no: 'A105', minsAgo: 33, kiosk: 'KIOSK-03', status: 'CANCELLED', method: 'CASH',
        items: [['P-SD3', 'FRAPPE', 1, ['MO-S50']]], cancelReason: 'ลูกค้ายกเลิก — รอนานเกินไป' });
    audit(cx, 'STATUS_CHANGE', 'WAITING_CASH', 'CANCELLED', 30, 'U-3', 'ลูกค้ายกเลิก — รอนานเกินไป');

    const rf = mkOrder({ no: 'A080', minsAgo: 256, kiosk: 'KIOSK-01', status: 'REFUNDED', method: 'QR',
        cashierId: 'U-3', items: [['P-HB5', 'ICED', 1, ['MO-S50', 'MO-I-N']]],
        cancelReason: 'ชงผิดรายการ — คืนเงินเต็มจำนวน',
        ts: { paidAt: iso(255) } });
    pay(rf, { method: 'QR', amount: 70, ref: 'TX20260919-87055', bank: 'KBANK', txAt: iso(255), verifiedBy: 'SYSTEM', status: 'REFUNDED', createdAt: iso(255) });
    audit(rf, 'STATUS_CHANGE', 'COMPLETED', 'REFUNDED', 240, 'U-2', 'ชงผิดรายการ — คืนเงินเต็มจำนวน');

    /* ── เรียงเหตุการณ์ใหม่ล่าสุดอยู่บน ── */
    auditLogs.sort((a, b) => (a.ts < b.ts ? 1 : -1));

    return {
        meta: { schema: 2, seededAt: T.toISOString().slice(0, 10), rev: 1 },
        settings: {
            shopName: 'CafeFlow Demo Cafe',
            branch: 'สาขาสำนักงานใหญ่',
            address: '99/1 ถ.ศรีสุนทร ต.เชิงทะเล อ.ถลาง จ.ภูเก็ต 83110',
            taxId: '0835566001234',
            vatPercent: 7,
            qrTimeoutSec: 60,
            cashMode: 'A',
            kdsWarnMin: 3,
            kdsDangerMin: 6,
            receiptWidth: '80mm',
            kitchenSlipWidth: '58mm',
            closingWidth: '80mm',
            cashierOverrideLimit: 500,

            /* ── คีออสก์ (§9, §35) — จอสัมผัส 21-32 นิ้ว Full HD ──
               อ่านผ่าน CFKiosk.cfg() ที่ merge DEFAULTS เสมอ
               ฐานข้อมูลเก่าที่ยังไม่มีคีย์พวกนี้จึงไม่พัง และไม่ต้อง bump SCHEMA */
            kioskOrientation: 'PORTRAIT',   // PORTRAIT | LANDSCAPE
            kioskScale: 1,                  // ตัวคูณขนาด: จอ 21" ควรใช้ 1.25, 32" ใช้ 0.95
            kioskFrame: true,               // กรอบจำลอง 9:16 บนจอคอม
            kioskDiningMode: 'ASK',         // ASK = ถามลูกค้า · DINE_IN/TAKE_AWAY = ข้ามหน้าถาม
            kioskUpsell: true,              // หน้าแนะนำเมนูก่อนชำระ (ครั้งเดียวต่อออเดอร์)
            kioskImages: true,              // แสดงรูปสินค้า
            kioskIdleSec: 90,               // ไม่มีการใช้งานแล้วกลับหน้าแรก
            kioskDoneSec: 12,               // ปิดหน้าสรุปออเดอร์อัตโนมัติ
        },
        counters: { orderSeq: 120, auditSeq: seqAudit, paymentSeq: seqPay, itemSeq: seqItem },
        users, devices, categories, products,
        modifierGroups, modifierOptions, modifierRules,
        orders, orderItems, payments, shifts, auditLogs,
    };
}


/* ให้เซิร์ฟเวอร์ require() ไปใช้ seed ฐานข้อมูลจริงได้ — เบราว์เซอร์ข้ามบรรทัดนี้ */
if (typeof module === 'object' && module.exports) module.exports = { CF_SEED };
