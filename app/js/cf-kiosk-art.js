/**
 * CafeFlow — KIOSK ART
 * ------------------------------------------------------------
 * ภาพประกอบสินค้าและไอคอนของหน้าคีออสก์
 *
 * ทำไมเป็น SVG sprite ไม่ใช่ไฟล์รูป:
 *   โปรเจกต์ไม่มีไฟล์รูปสินค้าเลย และคีออสก์ต้องทำงานได้ตอนเน็ตล่ม
 *   sprite ฉีดครั้งเดียวตอน boot แล้วการ์ดแต่ละใบอ้างด้วย <use> ~90 ไบต์
 *   (ถ้า inline SVG เต็มทุกใบจะเป็น ~900 ไบต์/ใบ)
 *
 * ร้านที่มีรูปถ่ายจริงใส่ product.imageUrl ได้ ภาพวาดจะกลายเป็น fallback ให้อัตโนมัติ
 *
 * ⚠️ ใช้ในหน้าคีออสก์ซึ่งไม่โหลด ds-overlays / lucide และไม่มีพนักงานล็อกอิน —
 *    ห้ามอ้าง Drawer / showToast ของ DS / refreshIcons / CFAuth / *.html โดยตรง
 */
const CFKioskArt = {

    /* ══════════════════════════════════════════════════════
       ภาพประกอบสินค้า 12 แบบ + 2 แบบสำหรับหน้าเลือกรูปแบบรับ
       viewBox 0 0 120 120 · เส้นใช้ currentColor (tile คุมสี)
       ส่วนที่เป็น "ของเหลว" ใช้ var(--art-a) ให้ต่างกันตามหมวด
       ══════════════════════════════════════════════════════ */
    KEYS: ['espresso', 'latte', 'icedcup', 'frappe', 'hottea', 'icedtea', 'matcha',
           'soda', 'lemonade', 'choco', 'croissant', 'plate', 'cake'],

    LABEL: {
        espresso: 'แก้วกาแฟดำ', latte: 'กาแฟนมมีชั้น', icedcup: 'แก้วเย็นมีหลอด', frappe: 'แก้วปั่นวิปครีม',
        hottea: 'ถ้วยชาร้อน', icedtea: 'ชาเย็นมะนาว', matcha: 'มัทฉะ',
        soda: 'โซดา', lemonade: 'น้ำเลม่อน', choco: 'ช็อกโกแลตร้อน',
        croissant: 'ครัวซองต์', plate: 'จานอาหาร', cake: 'เค้ก',
    },

    SPRITE: `
<svg id="cfkSprite" aria-hidden="true" focusable="false"
     style="position:absolute;width:0;height:0;overflow:hidden">
  <defs>

  <!-- แก้วกาแฟร้อน + จานรอง -->
  <symbol id="cfa-espresso" viewBox="0 0 120 120">
    <path d="M32 44h44v24a22 22 0 0 1-22 22h0a22 22 0 0 1-22-22V44Z" fill="var(--art-a)"/>
    <path d="M32 44h44v24a22 22 0 0 1-22 22h0a22 22 0 0 1-22-22V44Z" fill="none" stroke="currentColor" stroke-width="4"/>
    <path d="M76 52h8a10 10 0 0 1 0 20h-8" fill="none" stroke="currentColor" stroke-width="4"/>
    <path d="M22 96h64" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
    <path d="M44 24c0 6-6 6-6 12M56 20c0 7-6 7-6 14M68 24c0 6-6 6-6 12"
          fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" opacity=".55"/>
  </symbol>

  <!-- แก้วเย็นมีหลอด + น้ำแข็ง -->
  <symbol id="cfa-icedcup" viewBox="0 0 120 120">
    <path d="M38 40h44l-5 54a8 8 0 0 1-8 7H51a8 8 0 0 1-8-7L38 40Z" fill="var(--art-a)"/>
    <path d="M38 40h44l-5 54a8 8 0 0 1-8 7H51a8 8 0 0 1-8-7L38 40Z" fill="none" stroke="currentColor" stroke-width="4"/>
    <rect x="32" y="31" width="56" height="10" rx="5" fill="none" stroke="currentColor" stroke-width="4"/>
    <path d="M70 31 78 12" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
    <rect x="49" y="54" width="13" height="13" rx="3" fill="#fff" opacity=".75"/>
    <rect x="63" y="70" width="11" height="11" rx="3" fill="#fff" opacity=".6"/>
  </symbol>

  <!-- แก้วปั่น + วิปครีม + โดม -->
  <symbol id="cfa-frappe" viewBox="0 0 120 120">
    <path d="M38 50h44l-5 44a8 8 0 0 1-8 7H51a8 8 0 0 1-8-7L38 50Z" fill="var(--art-a)"/>
    <path d="M38 50h44l-5 44a8 8 0 0 1-8 7H51a8 8 0 0 1-8-7L38 50Z" fill="none" stroke="currentColor" stroke-width="4"/>
    <path d="M36 50h48a24 24 0 0 0-24-22 24 24 0 0 0-24 22Z" fill="#fff" opacity=".85"/>
    <path d="M36 50h48a24 24 0 0 0-24-22 24 24 0 0 0-24 22Z" fill="none" stroke="currentColor" stroke-width="4"/>
    <path d="M60 28V12" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
    <circle cx="60" cy="10" r="5" fill="currentColor" opacity=".5"/>
  </symbol>

  <!-- ลาเต้/คาปูชิโน: แก้วใสเห็นชั้นนม -->
  <symbol id="cfa-latte" viewBox="0 0 120 120">
    <path d="M34 34h52l-4 60a9 9 0 0 1-9 8H47a9 9 0 0 1-9-8l-4-60Z" fill="#F3E3CE"/>
    <path d="M37 66h46l-2 28a9 9 0 0 1-9 8H48a9 9 0 0 1-9-8l-2-28Z" fill="var(--art-a)"/>
    <path d="M34 34h52l-4 60a9 9 0 0 1-9 8H47a9 9 0 0 1-9-8l-4-60Z" fill="none" stroke="currentColor" stroke-width="4"/>
    <path d="M36 52h48" stroke="currentColor" stroke-width="3" opacity=".35"/>
    <path d="M37 66h46" stroke="currentColor" stroke-width="3" opacity=".35"/>
    <ellipse cx="60" cy="34" rx="26" ry="7" fill="#fff" opacity=".9"/>
    <ellipse cx="60" cy="34" rx="26" ry="7" fill="none" stroke="currentColor" stroke-width="4"/>
  </symbol>

  <!-- ถ้วยชาร้อน + ป้ายถุงชา -->
  <symbol id="cfa-hottea" viewBox="0 0 120 120">
    <path d="M30 48h48v22a24 24 0 0 1-24 24h0a24 24 0 0 1-24-24V48Z" fill="var(--art-a)"/>
    <path d="M30 48h48v22a24 24 0 0 1-24 24h0a24 24 0 0 1-24-24V48Z" fill="none" stroke="currentColor" stroke-width="4"/>
    <path d="M78 56h7a9 9 0 0 1 0 18h-7" fill="none" stroke="currentColor" stroke-width="4"/>
    <path d="M20 100h68" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
    <path d="M64 48V30h14v12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".7"/>
    <rect x="70" y="24" width="16" height="12" rx="2" fill="#fff" stroke="currentColor" stroke-width="3"/>
  </symbol>

  <!-- ชาเย็น + มะนาวเสียบขอบแก้ว -->
  <symbol id="cfa-icedtea" viewBox="0 0 120 120">
    <path d="M40 38h40l-4 56a8 8 0 0 1-8 7H52a8 8 0 0 1-8-7l-4-56Z" fill="var(--art-a)"/>
    <path d="M40 38h40l-4 56a8 8 0 0 1-8 7H52a8 8 0 0 1-8-7l-4-56Z" fill="none" stroke="currentColor" stroke-width="4"/>
    <path d="M74 38 84 14" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
    <path d="M36 38a13 13 0 0 1 13-13v13" fill="#fff" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/>
    <rect x="50" y="56" width="12" height="12" rx="3" fill="#fff" opacity=".7"/>
  </symbol>

  <!-- มัทฉะ: ถ้วยชาวาน + ฟอง -->
  <symbol id="cfa-matcha" viewBox="0 0 120 120">
    <path d="M26 50h68v14a34 34 0 0 1-34 34h0a34 34 0 0 1-34-34V50Z" fill="var(--art-a)"/>
    <path d="M26 50h68v14a34 34 0 0 1-34 34h0a34 34 0 0 1-34-34V50Z" fill="none" stroke="currentColor" stroke-width="4"/>
    <ellipse cx="60" cy="50" rx="34" ry="9" fill="#fff" opacity=".8"/>
    <ellipse cx="60" cy="50" rx="34" ry="9" fill="none" stroke="currentColor" stroke-width="4"/>
    <circle cx="50" cy="48" r="4" fill="currentColor" opacity=".25"/>
    <circle cx="66" cy="52" r="3" fill="currentColor" opacity=".25"/>
    <path d="M86 22v18" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity=".6"/>
    <path d="M80 22h12" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity=".6"/>
  </symbol>

  <!-- โซดา: ขวด + ฟอง -->
  <symbol id="cfa-soda" viewBox="0 0 120 120">
    <path d="M50 16h20v14l8 14v50a8 8 0 0 1-8 8H50a8 8 0 0 1-8-8V44l8-14V16Z" fill="var(--art-a)"/>
    <path d="M50 16h20v14l8 14v50a8 8 0 0 1-8 8H50a8 8 0 0 1-8-8V44l8-14V16Z" fill="none" stroke="currentColor" stroke-width="4"/>
    <path d="M46 14h28" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
    <circle cx="55" cy="62" r="5" fill="#fff" opacity=".7"/>
    <circle cx="68" cy="74" r="4" fill="#fff" opacity=".6"/>
    <circle cx="56" cy="84" r="3.5" fill="#fff" opacity=".55"/>
  </symbol>

  <!-- น้ำเลม่อน: แก้วเตี้ย + มะนาวครึ่งซีก -->
  <symbol id="cfa-lemonade" viewBox="0 0 120 120">
    <path d="M36 44h48l-5 50a8 8 0 0 1-8 7H49a8 8 0 0 1-8-7l-5-50Z" fill="var(--art-a)"/>
    <path d="M36 44h48l-5 50a8 8 0 0 1-8 7H49a8 8 0 0 1-8-7l-5-50Z" fill="none" stroke="currentColor" stroke-width="4"/>
    <circle cx="82" cy="32" r="16" fill="#fff" opacity=".9"/>
    <circle cx="82" cy="32" r="16" fill="none" stroke="currentColor" stroke-width="4"/>
    <path d="M82 16v32M66 32h32M71 21l22 22M93 21 71 43"
          stroke="currentColor" stroke-width="2.5" opacity=".55"/>
    <path d="M44 62h32" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".6"/>
  </symbol>

  <!-- ช็อกโกแลตร้อน: มัก + มาร์ชแมลโลว์ -->
  <symbol id="cfa-choco" viewBox="0 0 120 120">
    <path d="M28 44h48v34a20 20 0 0 1-20 20h-8a20 20 0 0 1-20-20V44Z" fill="var(--art-a)"/>
    <path d="M28 44h48v34a20 20 0 0 1-20 20h-8a20 20 0 0 1-20-20V44Z" fill="none" stroke="currentColor" stroke-width="4"/>
    <path d="M76 54h9a11 11 0 0 1 0 22h-9" fill="none" stroke="currentColor" stroke-width="4"/>
    <rect x="36" y="38" width="13" height="10" rx="3" fill="#fff" stroke="currentColor" stroke-width="3"/>
    <rect x="55" y="38" width="13" height="10" rx="3" fill="#fff" stroke="currentColor" stroke-width="3"/>
    <path d="M40 22c0 5-5 5-5 10M56 18c0 6-5 6-5 12"
          fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" opacity=".5"/>
  </symbol>

  <!-- ครัวซองต์ -->
  <symbol id="cfa-croissant" viewBox="0 0 120 120">
    <path d="M16 78c10-30 34-44 44-44s34 14 44 44c-10 8-22 6-28-2-6 8-16 8-16 8s-10 0-16-8c-6 8-18 10-28 2Z"
          fill="var(--art-a)"/>
    <path d="M16 78c10-30 34-44 44-44s34 14 44 44c-10 8-22 6-28-2-6 8-16 8-16 8s-10 0-16-8c-6 8-18 10-28 2Z"
          fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>
    <path d="M44 46c4 8 4 18 2 26M76 46c-4 8-4 18-2 26"
          fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".5"/>
  </symbol>

  <!-- จานอาหาร: เส้นพาสต้าขด -->
  <symbol id="cfa-plate" viewBox="0 0 120 120">
    <ellipse cx="60" cy="68" rx="46" ry="30" fill="#fff" opacity=".85"/>
    <ellipse cx="60" cy="68" rx="46" ry="30" fill="none" stroke="currentColor" stroke-width="4"/>
    <ellipse cx="60" cy="66" rx="30" ry="19" fill="var(--art-a)"/>
    <path d="M40 66c6-8 16-10 22-4s16 4 20-4M40 74c8-6 14-2 20 0s14 2 20-6"
          fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".55"/>
    <circle cx="70" cy="58" r="5" fill="currentColor" opacity=".35"/>
  </symbol>

  <!-- เค้กชิ้น: มองจากด้านข้าง เห็นชั้นครีมและเชอร์รี่ -->
  <symbol id="cfa-cake" viewBox="0 0 120 120">
    <path d="M26 66 96 44v44a6 6 0 0 1-6 6H32a6 6 0 0 1-6-6V66Z" fill="var(--art-a)"/>
    <path d="M26 80 96 58" stroke="#fff" stroke-width="8" opacity=".8"/>
    <path d="M26 66 96 44" stroke="#fff" stroke-width="9" opacity=".95" stroke-linecap="round"/>
    <path d="M26 66 96 44v44a6 6 0 0 1-6 6H32a6 6 0 0 1-6-6V66Z"
          fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>
    <path d="M26 80 96 58" stroke="currentColor" stroke-width="2.5" opacity=".38"/>
    <circle cx="78" cy="42" r="8" fill="#fff" stroke="currentColor" stroke-width="3.5"/>
    <path d="M78 34c2-6 7-7 10-6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
  </symbol>

  <!-- กินที่ร้าน: จาน + ส้อม + มีด -->
  <symbol id="cfa-dinein" viewBox="0 0 120 120">
    <circle cx="60" cy="60" r="30" fill="var(--art-a)"/>
    <circle cx="60" cy="60" r="30" fill="none" stroke="currentColor" stroke-width="4"/>
    <circle cx="60" cy="60" r="19" fill="none" stroke="currentColor" stroke-width="3" opacity=".5"/>
    <path d="M18 20v26a8 8 0 0 0 8 8h0V20M22 20v20M30 20v20"
          fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
    <path d="M26 54v46" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
    <path d="M98 20c-6 6-8 14-8 22a8 8 0 0 0 8 8V20Z" fill="currentColor" opacity=".8"/>
    <path d="M96 50v50" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
  </symbol>

  <!-- กลับบ้าน: ถุงกระดาษ -->
  <symbol id="cfa-takeaway" viewBox="0 0 120 120">
    <path d="M28 40h64l-6 62a6 6 0 0 1-6 6H40a6 6 0 0 1-6-6L28 40Z" fill="var(--art-a)"/>
    <path d="M28 40h64l-6 62a6 6 0 0 1-6 6H40a6 6 0 0 1-6-6L28 40Z" fill="none" stroke="currentColor" stroke-width="4"/>
    <path d="M44 40V28a16 16 0 0 1 32 0v12" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
    <path d="M28 58h64" stroke="currentColor" stroke-width="3" opacity=".4"/>
  </symbol>

  </defs>
</svg>`,

    mount() {
        if (document.getElementById('cfkSprite')) return;
        document.body.insertAdjacentHTML('afterbegin', this.SPRITE);
    },

    /* ══════════════════════════════════════════════════════
       สีพื้น tile ต่อหมวด — [อ่อน, เข้ม, สีของเหลว]
       ปลายเข้มเลือกให้มืดกว่าพื้นหน้า (#F5F5F5) พอที่ tile จะไม่ละลายหาย
       ══════════════════════════════════════════════════════ */
    TINT: {
        'C-COFFEE':  ['#F6EADC', '#E3C9A6', '#8C5A32'],
        'C-TEA':     ['#F4F7E8', '#D9E4B8', '#B07A2E'],
        'C-MATCHA':  ['#EDF6EA', '#C6E2BC', '#6FA84A'],
        'C-CHOCO':   ['#F2E8E2', '#D9BDAB', '#7A4A31'],
        'C-SODA':    ['#E9F4F9', '#BFE0EC', '#3E9BC4'],
        'C-VALUE':   ['#EFFBF4', '#CDEBD9', '#159C5A'],
        'C-RECO':    ['#EFF4FD', '#CBDCF8', '#3579EA'],
        'C-BAKERY':  ['#FBF2E3', '#EBD5AE', '#C89546'],
        'C-FOOD':    ['#F7EFEA', '#E3C9B8', '#C3703C'],
        'C-DESSERT': ['#FBEEF3', '#EDCBDA', '#C4568B'],
    },
    TINT_FALLBACK: ['#F2F3F2', '#DCDFDD', '#6B7B73'],

    /**
     * สีของเหลว/เนื้ออาหาร — ผูกกับภาพ ไม่ใช่หมวด
     * หมวด "เมนูแนะนำ" มีสีประจำหมวดเป็นน้ำเงิน แต่ในแก้วเป็นกาแฟ
     * ถ้าใช้สีหมวดมาระบายจะได้กาแฟสีฟ้า
     */
    ART_COLOR: {
        espresso: '#5A3418', latte: '#B07A45', icedcup: '#A2703F', frappe: '#C6A279',
        hottea:   '#C08A36', icedtea: '#C87A2E', matcha:  '#6FA84A',
        soda:     '#3E9BC4', lemonade:'#DFB733', choco:   '#6E4029',
        croissant:'#D8A24A', plate:  '#C3703C', cake:    '#C4568B',
        dinein:   '#C3703C', takeaway:'#C89546',
    },

    /* ── ตารางเลือกภาพ: หมวด × แบบเสิร์ฟ ── */
    BY_CAT: {
        'C-COFFEE':  { HOT: 'espresso', ICED: 'icedcup',  FRAPPE: 'frappe' },
        'C-TEA':     { HOT: 'hottea',   ICED: 'icedtea',  FRAPPE: 'frappe' },
        'C-MATCHA':  { HOT: 'matcha',   ICED: 'matcha',   FRAPPE: 'frappe' },
        'C-CHOCO':   { HOT: 'choco',    ICED: 'choco',    FRAPPE: 'frappe' },
        'C-SODA':    { ICED: 'soda',    FRAPPE: 'frappe' },
        'C-VALUE':   { HOT: 'hottea',   ICED: 'icedtea',  FRAPPE: 'frappe' },
        'C-RECO':    { HOT: 'espresso', ICED: 'icedcup',  FRAPPE: 'frappe' },
        'C-BAKERY':  { STD: 'croissant' },
        'C-FOOD':    { STD: 'plate' },
        'C-DESSERT': { STD: 'cake' },
    },

    /** กฎจากชื่อสินค้า — ใช้ก่อนตาราง เพราะชื่อบอกได้ตรงกว่าหมวด */
    KEYWORD: [
        [/เลม่อน|เลมอน|ยูซุ|มะนาว|lemon|yuzu|lime/i, 'lemonade'],
        [/ลาเต้|คาปู|มัคคิอาโต|มอคค่า|มอคคา|latte|cappu|macchiato|mocha/i, 'latte'],
        [/โซดา|soda/i,                                'soda'],
        [/มัทฉะ|ชาเขียว|matcha/i,                     'matcha'],
        [/ช็อก|โกโก้|มอลต์|choco|malt/i,              'choco'],
        [/ครัวซอง|croissant|แซนด์|sandwich/i,         'croissant'],
        [/เค้ก|บราวนี่|cake|brownie/i,                'cake'],
    ],

    /**
     * เลือกภาพให้สินค้า — ลำดับ: imageUrl → artKey → ชื่อ → หมวด×แบบเสิร์ฟ → icedcup
     * คืน { imageUrl } หรือ { key }
     */
    resolve(product, serveType) {
        if (!product) return { key: 'icedcup' };
        if (product.imageUrl) return { imageUrl: product.imageUrl, key: this._byRule(product, serveType) };
        if (product.artKey && this.KEYS.includes(product.artKey)) return { key: product.artKey };
        return { key: this._byRule(product, serveType) };
    },

    _byRule(product, serveType) {
        const name = (product.nameTh || '') + ' ' + (product.nameEn || '');
        // ของกินไม่ควรโดนกฎคีย์เวิร์ดของเครื่องดื่มลาก (เช่น "เค้กมะนาว" ต้องได้เค้ก)
        const isFood = ['C-BAKERY', 'C-FOOD', 'C-DESSERT'].includes(product.categoryId);
        if (!isFood) {
            for (const [re, key] of this.KEYWORD) if (re.test(name)) return key;
        }
        const table = this.BY_CAT[product.categoryId];
        if (table) {
            const sv = serveType && table[serveType] ? serveType
                     : Object.keys(table)[0];
            if (table[sv]) return table[sv];
        }
        return isFood ? 'plate' : 'icedcup';
    },

    tintOf(product) {
        return this.TINT[product && product.categoryId] || this.TINT_FALLBACK;
    },

    /**
     * HTML ของ tile หนึ่งใบ
     * <img> กับ <svg> อยู่ด้วยกันเสมอ — ลิงก์ตายแล้ว onerror ใส่ .is-broken
     * ซึ่งซ่อน img และเผย svg · fallback จึงอยู่ใน DOM ไม่ใช่ใน JS
     */
    tile(product, serveType, cls) {
        const r = this.resolve(product, serveType);
        const [t1, t2, fallbackA] = this.tintOf(product);
        const a = this.ART_COLOR[r.key] || fallbackA;
        const style = `--t1:${t1};--t2:${t2};--art-a:${a}`;
        const svg = `<svg class="cfk-art" viewBox="0 0 120 120" aria-hidden="true"><use href="#cfa-${r.key}"/></svg>`;
        const img = r.imageUrl
            ? `<img class="cfk-img" src="${CFApp.esc(r.imageUrl)}" alt="" loading="lazy" decoding="async"
                    onerror="this.closest('.cfk-media').classList.add('is-broken')">`
            : '';
        return `<span class="cfk-media ${cls || ''}" style="${style}">${svg}${img}</span>`;
    },

    /* ══════════════════════════════════════════════════════
       ไอคอน UI — inline ทั้งหมด ไม่พึ่ง Lucide CDN
       (refreshIcons() ของ DS เดินทั้ง document ทุกครั้ง แพงเกินไปกับกริดสินค้า)
       ══════════════════════════════════════════════════════ */
    ICON: {
        back:     '<path d="M19 12H5M12 19l-7-7 7-7"/>',
        up:       '<path d="M12 19V5M5 12l7-7 7 7"/>',
        check:    '<path d="M20 6 9 17l-5-5"/>',
        plus:     '<path d="M12 5v14M5 12h14"/>',
        minus:    '<path d="M5 12h14"/>',
        close:    '<path d="M18 6 6 18M6 6l12 12"/>',
        cart:     '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
        cash:     '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
        qr:       '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM19 19h2v2h-2zM14 19h2v2h-2zM19 14h2v2h-2z"/>',
        timer:    '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
        alert:    '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
        chef:     '<path d="M6 13.9A4 4 0 0 1 7.4 6a5.1 5.1 0 0 1 1.1-1.5 5 5 0 0 1 7 0A5.1 5.1 0 0 1 16.6 6 4 4 0 0 1 18 13.9V21H6Z"/><path d="M6 17h12"/>',
        pencil:   '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
        trash:    '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
        next:     '<path d="m9 18 6-6-6-6"/>',
        store:    '<path d="M3 9 5 3h14l2 6"/><path d="M4 9h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9Z"/><path d="M9 21v-6h6v6"/>',
    },

    /** คืน <svg> เป็น string — ขนาดคุมด้วย CSS ผ่านคลาส */
    icon(name, cls) {
        const d = this.ICON[name];
        if (!d) return '';
        return `<svg class="cfk-ic ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                     aria-hidden="true">${d}</svg>`;
    },
};

window.CFKioskArt = CFKioskArt;
