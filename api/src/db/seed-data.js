/**
 * CafeFlow — ข้อมูลตั้งต้นของร้าน (ใช้โดย seed.js เท่านั้น)
 * ------------------------------------------------------------
 * สาขา/ค่าตั้ง ผู้ใช้ อุปกรณ์ หมวด สินค้า กลุ่มตัวเลือก และกฎตัวเลือก
 * เดิมอยู่ที่ app/js/cf-data.js ฝั่งเบราว์เซอร์ — หน้าเว็บอ่านจากเซิร์ฟเวอร์อย่างเดียวแล้ว
 * ข้อมูลชุดนี้จึงย้ายมาอยู่ฝั่งเซิร์ฟเวอร์ที่เดียวที่ใช้มัน
 * ไม่มีออเดอร์/การชำระเงินตัวอย่าง — ร้านจริงต้องเริ่มจากศูนย์
 *
 * เมนูถอดจากป้ายหน้าร้านจริง — ดูหมายเหตุที่หัวข้อ PRODUCTS
 * โครงสร้างอิง CafeFlow_System_Design_AndamanTech.md
 *   §10 menu · §11 modifier · §18 routing · §29 roles · §30 devices
 *
 * รหัสผ่านตั้งต้น 'demo' ต้องตรงกับ SEED_PASSWORD ใน routes/auth.js —
 * ผู้ใช้ที่ยังใช้รหัสนี้จะถูกบังคับให้เปลี่ยนก่อนใช้งาน
 */
'use strict';

/** คืนชุดใหม่ทุกครั้ง — ตัวเรียกแก้ไขได้โดยไม่กระทบรอบถัดไป */
function seedData() {
    /* ── ผู้ใช้ (§29) ──────────────────────────────────────── */
    const users = [
        { id: 'U-1', username: 'admin',   password: 'demo', name: 'ศิริพร ก.',  role: 'ADMIN',   active: true, overrideLimit: null },
        { id: 'U-2', username: 'manager', password: 'demo', name: 'ธนกฤต ว.',   role: 'MANAGER', active: true, overrideLimit: null },
        { id: 'U-3', username: 'cashier', password: 'demo', name: 'ปิยะดา ส.',  role: 'CASHIER', active: true, overrideLimit: 500 },
        { id: 'U-4', username: 'kitchen', password: 'demo', name: 'อนุชา พ.',   role: 'KITCHEN', active: true, overrideLimit: 0 },
        { id: 'U-5', username: 'viewer',  password: 'demo', name: 'ผู้ชมข้อมูล', role: 'VIEWER',  active: true, overrideLimit: 0 },
    ];

    /* ── อุปกรณ์ (§30) ───────────────────────────────────────
       สถานะ ONLINE/OFFLINE และเวลาเห็นล่าสุดไม่อยู่ในนี้ — ของจริงมาจาก heartbeat เท่านั้น */
    const devices = [
        { id: 'KIOSK-01',   type: 'KIOSK',   name: 'คีออสก์ 01',      ip: '192.168.1.21', assignedStation: null,  assignedCashier: 'CASHIER-01' },
        { id: 'KIOSK-02',   type: 'KIOSK',   name: 'คีออสก์ 02',      ip: '192.168.1.22', assignedStation: null,  assignedCashier: 'CASHIER-01' },
        { id: 'KIOSK-03',   type: 'KIOSK',   name: 'คีออสก์ 03',      ip: '192.168.1.23', assignedStation: null,  assignedCashier: 'CASHIER-01' },
        { id: 'CASHIER-01', type: 'CASHIER', name: 'เคาน์เตอร์ 01',   ip: '192.168.1.31', assignedStation: null,  assignedCashier: null },
        { id: 'BAR-KDS',    type: 'KDS',     name: 'จอครัว — บาร์',   ip: '192.168.1.41', assignedStation: 'BAR', assignedCashier: null },
        { id: 'BAR-PRN',    type: 'PRINTER', name: 'เครื่องพิมพ์บาร์', ip: '192.168.1.51', assignedStation: 'BAR', assignedCashier: null },
        { id: 'DISPLAY-01', type: 'DISPLAY', name: 'จอแสดงคิว',       ip: '192.168.1.61', assignedStation: null,  assignedCashier: null },
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

    /* ── ค่าตั้งร้าน — seed.js แยก shopName/branch/address/taxId/vatPercent
          ไปตาราง branch ที่เหลือเป็น key/value ใน app_setting ── */
    const settings = {
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
           อ่านผ่าน CFKiosk.cfg() ที่ merge CF_KIOSK_DEFAULTS เสมอ
           ร้านที่ยังไม่มีคีย์พวกนี้ในฐานข้อมูลจึงไม่พัง */
        kioskOrientation: 'PORTRAIT',   // PORTRAIT | LANDSCAPE
        kioskScale: 1,                  // ตัวคูณขนาด: จอ 21" ควรใช้ 1.25, 32" ใช้ 0.95
        kioskFrame: true,               // กรอบจำลอง 9:16 บนจอคอม
        kioskDiningMode: 'ASK',         // ASK = ถามลูกค้า · DINE_IN/TAKE_AWAY = ข้ามหน้าถาม
        kioskUpsell: true,              // หน้าแนะนำเมนูก่อนชำระ (ครั้งเดียวต่อออเดอร์)
        kioskImages: true,              // แสดงรูปสินค้า
        kioskIdleSec: 90,               // ไม่มีการใช้งานแล้วกลับหน้าแรก
        kioskDoneSec: 12,               // ปิดหน้าสรุปออเดอร์อัตโนมัติ
    };

    return {
        settings, users, devices, categories, products,
        modifierGroups, modifierOptions, modifierRules,
    };
}

module.exports = { seedData };
