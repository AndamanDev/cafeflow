# MediCore Design System — Starter Kit

ชุดไฟล์หน้าตามาตรฐาน สกัดจากระบบ MediCore IPD ของจริง
**ก๊อปโฟลเดอร์นี้ทั้งก้อนไปวางในโปรเจคใหม่แล้วใช้ได้เลย** — ไม่ต้อง build ไม่มี dependency
(พึ่งแค่ Google Fonts กับ Lucide CDN)

> เปิด **`showcase.html`** ด้วยเบราว์เซอร์ได้ทันที (ดับเบิลคลิกไฟล์ก็ได้) เพื่อดูของจริงทุกชิ้น

---

## 1. เริ่มใช้ใน 3 ขั้น

```
1. ก๊อป design-system/ ทั้งโฟลเดอร์ไปไว้ที่ root ของโปรเจคใหม่
2. ก๊อป design-system/templates/page-basic.html ออกมาเป็น <ชื่อหน้า>.html ที่ root
   แล้วแก้ path CSS/JS จาก  ../css/…       →  design-system/css/…
                            ../js/…        →  design-system/js/…
3. แก้รายการเมนูที่  design-system/js/ds-navbar.js  →  ตัวแปร DS_MENU
```

โครงสร้าง:

```
design-system/
├── css/
│   ├── ds-tokens.css       ← :root เดียวจบ — สี ฟอนต์ ระยะ มุมมน เงา z-index  (ต้องโหลดไฟล์แรก)
│   ├── ds-base.css         ← reset · body · scrollbar · ไอคอน · utility · keyframes
│   ├── ds-navbar.css       ← แถบเมนูบน
│   ├── ds-layout.css       ← โครงหน้า 4 แบบ · context bar · list card
│   ├── ds-components.css   ← ปุ่ม การ์ด ตาราง ฟอร์ม chip KPI tab badge timeline
│   ├── ds-overlays.css     ← drawer · modal · confirm · toast
│   ├── ds-print.css        ← สูตรพิมพ์ A4
│   └── ds-landing.css      ← เฉพาะหน้าแรก (hero · การ์ดโมดูล · ผังงาน)
├── js/
│   ├── ds-navbar.js        ← เมนูบน (แก้ DS_MENU ที่นี่)
│   ├── ds-drawer.js        ← Drawer.open / .confirm
│   ├── ds-toast.js         ← showToast()
│   └── ds-icons.js         ← Lucide loader + refreshIcons()
├── templates/
│   ├── page-basic.html     ← หน้าเลื่อนธรรมดา (หัวข้อ + การ์ด + ตาราง)
│   ├── page-3pane.html     ← workspace 3 คอลัมน์
│   └── page-landing.html   ← หน้าแรก
├── showcase.html           ← คู่มือมีชีวิต — เปิดดูทุกคอมโพเนนต์
└── README.md
```

**ลำดับ `<link>` ห้ามสลับ** (ds-tokens ต้องมาก่อนเสมอ):

```html
<link rel="stylesheet" href="design-system/css/ds-tokens.css">
<link rel="stylesheet" href="design-system/css/ds-base.css">
<link rel="stylesheet" href="design-system/css/ds-navbar.css">
<link rel="stylesheet" href="design-system/css/ds-layout.css">
<link rel="stylesheet" href="design-system/css/ds-components.css">
<link rel="stylesheet" href="design-system/css/ds-overlays.css">
<link rel="stylesheet" href="design-system/css/ds-print.css">
<!-- เฉพาะหน้าแรก -->
<link rel="stylesheet" href="design-system/css/ds-landing.css">
```

โครง `<body>` มาตรฐาน:

```html
<body data-page="ชื่อไฟล์-ไม่มี-.html">   <!-- ใช้ไฮไลต์เมนูใน navbar -->
    <nav id="appNavbar"></nav>
    ...
    <div id="toastContainer" class="toast-container"></div>

    <script src="design-system/js/ds-icons.js"></script>
    <script src="design-system/js/ds-navbar.js"></script>
    <script src="design-system/js/ds-drawer.js"></script>
    <script src="design-system/js/ds-toast.js"></script>
    <script src="js/ชื่อหน้า.js"></script>
</body>
```

---

## 2. บทบาทสี 3 ชั้น ⭐ (เข้าใจข้อนี้ก่อนใช้)

ระบบนี้ใช้สี **3 บทบาทที่ต่างกัน** อยู่ร่วมกันโดยตั้งใจ — **ไม่ใช่ความผิดพลาด**

| บทบาท | โทเคน | สี | ใช้ที่ |
|---|---|---|---|
| **Shell** — โครง | `--brand-navy` | `#0f172a` navy | navbar, hero, หัวข้อ, ตัวอักษรหลัก |
| **Action** — ลิงก์/บันทึก | `--primary` | `#0068FF` ฟ้า | ลิงก์, `.btn-save`, focus ring, ตัวนับใน pane |
| **CTA / Highlight** | `--brand-amber` | `#fbbf24` เหลืองอำพัน | `.btn-primary`, hover การ์ด, focus ของ `.sip-input` |
| **Accent หน้าแรก** | `--purple` | `#7c3aed` ม่วง | โลโก้, hero gradient, แท็บ active, เมนูที่เลือก |

> นี่คือเหตุผลที่ **`.btn-primary` เป็นสีเหลือง แต่ `--primary` เป็นสีฟ้า**
> ถ้าอยากให้ CTA เป็นสีเดียวกับ action ให้แก้ `.btn-primary` ใน `ds-components.css` เป็น `--primary`

**เปลี่ยนสีทั้งระบบ:** แก้แค่ `ds-tokens.css` ที่เดียว ไม่ต้องแตะไฟล์อื่น

---

## 3. สเกลตัวอักษร

| ระดับ | ขนาด | ใช้กับ |
|---|---|---|
| base (body) | **14px** / line-height 1.55 | ทั้งหน้า |
| เนื้อหา / input | **13px** | ข้อความหลัก ค่าในฟอร์ม รายการ |
| meta / label | **12px** | คำอธิบายย่อย label ฟอร์ม หัวตาราง |
| chip / badge | **11px** | ป้ายเล็ก |
| จิ๋ว | 10px | เท่าที่จำเป็น |

> ⚠️ **ห้ามใช้ต่ำกว่า 12px กับเนื้อหาที่ต้องอ่าน** — ทำให้ล้าตา
> เก็บ 10–11px ไว้เฉพาะ chip/badge เท่านั้น

ฟอนต์: `Inter` + `Noto Sans Thai` (Inter ไม่มีสระไทย ตัวอักษรไทยจะตกไปที่ Noto อัตโนมัติ)
ฟอนต์เอกสารพิมพ์: `--font-print` = `Sarabun` / `TH Sarabun PSK`

---

## 4. ไอคอน

**Lucide เท่านั้น · ห้ามใช้ emoji ใน UI** (ยกเว้นเนื้อหาที่ผู้ใช้พิมพ์เอง)

```html
<i data-lucide="pill" class="mi"></i>              <!-- ขนาดตามฟอนต์รอบข้าง -->
<i data-lucide="pill" class="icon-lg icon-amber"></i>  <!-- ขนาดคงที่ + สี -->
```

```js
el.innerHTML = '...' + DSIcons.html('pill', { cls: 'icon-sm' }) + '...';
refreshIcons();   // ⚠️ ต้องเรียกทุกครั้งหลัง render ด้วย innerHTML
```

`.mi` คือ utility ที่มีประโยชน์ที่สุดในชุดนี้ — ทำให้ SVG ประพฤติตัวเหมือนตัวอักษร inline ที่ทุกขนาดฟอนต์

ขนาด: `.icon-xs` 12 · `.icon-sm` 14 · `.icon-md` 16 · `.icon-lg` 20 · `.icon-xl` 28 · `.icon-2xl` 48
สี: `.icon-amber` `.icon-navy` `.icon-primary` `.icon-muted` `.icon-success` `.icon-warning` `.icon-danger`

**ตาราง emoji → Lucide** (ใช้เวลาแปลง mockup เป็นโค้ด):

| emoji | Lucide | | emoji | Lucide |
|---|---|---|---|---|
| 📋 | `clipboard-list` | | ⚠ | `alert-triangle` |
| 📄 | `file-text` | | 🔴 | `alert-circle` |
| 📆 | `calendar` | | 🟢 | `check-circle-2` |
| 📊 | `bar-chart-3` | | ✓ | `check` |
| 🔔 | `bell` | | ✕ | `x` |
| 💬 | `message-square` | | 👁 | `eye` |
| ⏳ | `clock` | | 🚫 | `ban` |
| 🔄 | `refresh-cw` | | 📌 | `pin` |
| ➕ | `plus` | | ⭐ | `star` |
| 🔍 | `search` | | 🏷 | `tag` |
| 🖨 | `printer` | | 💾 | `save` |
| 🗑 | `trash-2` | | ✍ | `pen-line` |
| ⚙ | `settings` | | 🏠 | `home` |

---

## 5. แก้เมนู (navbar)

แก้ที่ `js/ds-navbar.js` → ตัวแปร **`DS_MENU`** ที่เดียวจบ
(ไฮไลต์เมนู active derive จาก `DS_MENU` เอง — ไม่มีตารางแยกให้ลืมอัปเดต)

```js
const DS_MENU = [
    { link: 'index.html', label: 'หน้าแรก', icon: 'home' },

    { group: 'work', label: 'งานประจำวัน', icon: 'listChecks', items: [
        { section: 'หัวข้อคั่น' },
        { href: 'tasks.html', label: 'ตารางงาน', icon: 'checkSquare',
          badge: { text: 'Live', type: 'live' } },
        { sep: true },                       // หรือ { sep: 'strong' } = เส้นหนา
        { href: 'inbox.html', label: 'กล่องข้อความ', icon: 'bell', roles: 'ADMIN' },
    ]},

    { group: 'set', label: '', icon: 'settings', alignRight: true,
      title: 'ตั้งค่า', roles: 'ADMIN', items: [ ... ] },
];
```

- `icon` เลือกจาก object **`DS_ICONS`** ที่หัวไฟล์ (เพิ่มไอคอนใหม่ได้เลย)
- `roles` เว้นว่าง = ทุกคนเห็น · คั่นด้วยช่องว่าง เช่น `'DOCTOR NURSE'`
- `alignRight: true` = เมนูย่อยชิดขวา (เหมาะกับกลุ่มท้ายแถบ)
- `badge.type` = `live` (เขียว) หรือ `new` (เหลือง)

**ผูกผู้ใช้จริง** (เรียกก่อน `DOMContentLoaded`):

```js
DSNavbar.configure({
    brand: 'ชื่อระบบ',
    brandSub: 'คำอธิบายใต้โลโก้',
    getUser:  () => Auth.getUser(),      // { full_name, active_role }
    getRole:  () => Auth.getRole(),      // 'ADMIN'
    onLogout: () => Auth.logout(),
});
```

ไม่ configure → อ่าน `window.Auth` ถ้ามี → ไม่มีอีกก็ใช้ demo user
(ทำให้เปิดหน้าแบบ `file://` ได้โดยไม่ต้องมี backend)

> ⚠️ role gate นี้เป็นแค่ **UX** — ไฟล์ static ใครก็เปิดได้ **ด่านจริงต้องอยู่ที่ server เสมอ**

---

## 6. โครงหน้า 4 แบบ

| แบบ | คลาส | ใช้เมื่อ |
|---|---|---|
| หน้าเลื่อนธรรมดา | `.page-container` + `.page-header` | หน้ารายการ/ตั้งค่า (ค่าเริ่มต้น ไม่ต้องทำอะไรเพิ่ม) |
| 2 คอลัมน์ | `.ds-shell.cols-2` | รายการซ้าย + เนื้อหา |
| 3 คอลัมน์ | `.ds-shell.cols-3` | รายการซ้าย + เนื้อหา + แผงทำงานขวา |
| master-detail + rail | `.ds-shell.rail` | หน้าตั้งค่าที่ย่อเมนูซ้ายเป็นไอคอนได้ |

```html
<body class="ds-shell-page">          <!-- fallback ล็อกการเลื่อนสำหรับเบราว์เซอร์เก่า -->
  <nav id="appNavbar"></nav>
  <div class="ds-shell cols-3" id="shell">
      <aside class="ds-pane-left">
          <div class="ds-pane-header"><h3>…</h3><span class="ds-pane-count">0 รายการ</span></div>
          <div class="ds-pilltabs">…</div>
          <input class="ds-pane-search" placeholder="ค้นหา...">
          <div class="ds-pane-scroll">…</div>
      </aside>
      <main class="ds-pane-main">…</main>
      <aside class="ds-pane-right">…<div class="ds-actions">…</div></aside>
  </div>
```

- ย่อคอลัมน์ซ้าย: `shell.classList.toggle('left-collapsed')`
- **การเลื่อน:** หน้าปกติเลื่อนได้ปกติ · `.ds-shell` เท่านั้นที่ล็อกหน้าไว้แล้วให้แต่ละคอลัมน์เลื่อนเอง
  (กลับด้านจากระบบเดิมที่ล็อกทุกหน้าแล้วต้อง hack override)

**Context bar** — แถบข้อมูลของรายการที่เลือก (sticky) — `.ds-context-bar` + `.ds-context-avatar` +
`.ds-context-name` + `.ds-context-meta` + `.ds-context-aside`
พร้อม `.ds-alert-card` (การ์ดเตือนแดง คลิกได้) ซึ่งเป็น pattern แจ้งเตือนที่เด่นที่สุดของระบบ

---

## 7. คอมโพเนนต์ที่มีให้

ดูของจริงทั้งหมดที่ **`showcase.html`** — สรุปชื่อคลาส:

- **ปุ่ม** — `.btn` + `-primary/-navy/-outline/-ghost/-danger` · `-sm/-lg` · `.btn-save` `.btn-save-send`
  · `.btn-row(.primary/.success/.danger/.accent)` · `.ds-icon-btn(.edit/.neutral)`
- **การ์ด** — `.sip-card(.sip-card-hover)` · `.section-card` + `.section-header` · `.clinical-card` + `.cards-row`
- **KPI** — `.ds-kpi-grid` > `.sip-kpi(.critical)` + `-icon/-value/-label`
- **ตาราง** — `.data-table(.compact)` · `.sip-table` · `.ds-table-grid` (แบบฟอร์มกระดาษ) · `.table-responsive`
- **ฟอร์ม** — `.form-group`/`.form-row` (โปร่ง) · `.sip-input/-select/-textarea/-label` (แน่น)
  · `.ds-toggle` · `.ds-block/.ds-warn/.ds-note`
- **chip/badge** — `.sip-chip-*` · `.status-badge.*` · `.kbadge-*` · `.ds-chip-toggle` · `.ds-badge-urgent`
- **แท็บ** — `.ds-tabs/.ds-tab` (underline) · `.ds-segbar/.ds-seg` (แคปซูล) · `.ds-pilltabs/.ds-pilltab` (pill+นับ)
- **banner** — `.sip-banner-info/-success/-warning/-danger/-draft`
- **stepper / timeline** — `.ds-stepper/.ds-step` · `.ds-timeline-item(.info/.success/.warning/.danger)`
- **ว่าง/โหลด** — `.ds-empty` · `.ds-empty-state` · `.ds-spinner(.ds-spinner-lg)`

### Drawer (idiom หลัก — ใช้แทน modal ในงานที่มีฟอร์ม)

```js
Drawer.open({
  title: 'หัวข้อ',
  width: '560px',                    // ไม่ใส่ = 480px
  contentHtml: '…',
  footerHtml: '<button class="btn btn-primary">บันทึก</button>',
  onOpen:  (bodyEl) => refreshIcons(),
  onClose: () => { /* return false = ยับยั้งการปิด */ },
});
Drawer.close(); Drawer.setContent(html); Drawer.setTitle(t); Drawer.isOpen();

const ok = await Drawer.confirm({ title:'ลบ?', lines:['A-001'], danger:true });
```

รองรับ **drawer ซ้อน drawer** (เปิดซ้อนแล้วปิดจะกลับมาชั้นเดิม)

### Toast

```js
showToast('บันทึกเรียบร้อย');
showToast('บันทึกไม่สำเร็จ', 'error');     // success | error | warning | info
```

---

## 8. พิมพ์เอกสาร

**สูตร A — พิมพ์เฉพาะบางส่วน** (ใช้บ่อยที่สุด):

```html
<div id="dsPrintStage"> …เนื้อหาที่จะพิมพ์… </div>
```
```js
document.body.classList.add('ds-printing');
window.print();
window.onafterprint = () => document.body.classList.remove('ds-printing');
```
ได้ฟรี: หัวตารางซ้ำทุกหน้า · footer ตรึงล่าง (`.ds-print-footer`) · เลขหน้าจริง (`.ds-page-no`)

**สูตร B — พิมพ์ทั้งหน้า:** ใส่ `.no-print` ที่สิ่งที่ไม่ต้องการพิมพ์ · `.print-only` ที่แสดงเฉพาะตอนพิมพ์
โครงแอป (navbar, pane, drawer, toolbar) ถูกซ่อนให้อัตโนมัติ

**พรีวิว A4 บนจอ:** `.ds-paper-viewport` > `.ds-paper`
**เตือนช่องที่ยังไม่กรอก:** ใส่คลาส `.ds-miss` (ขึ้นกรอบแดง + ข้อความ — หายเองตอนพิมพ์)

---

## 9. แพทเทิร์น JS

ไม่มี framework ไม่มี build step — ใช้ **global object ไม่ใช่ IIFE**
เพราะ markup เรียก handler ตรง (`onclick="MyPage.switchTab('x', this)"`)

```js
const MyPage = {
    state: { rows: [], selected: null },
    async loadData() { /* เรียก API */ this.render(); },
    render() { /* วาด DOM */ refreshIcons(); },   // ⚠️ อย่าลืม refreshIcons()
};
window.MyPage = MyPage;
document.addEventListener('DOMContentLoaded', () => MyPage.loadData());

/* helper มาตรฐานทุกหน้า — กัน XSS ตอน render ค่าลง innerHTML */
function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
```

> helper ภายในของ design system ตั้งชื่อขึ้นต้น `ds*` (`dsEsc`, `dsGate`, `dsSlug`)
> จึงไม่ชนกับ `esc()` ที่หน้า app ประกาศเอง

---

## 10. Checklist ก่อนถือว่าหน้าใหม่เสร็จ

- [ ] เปิดหน้าได้ ไม่มี error ใน console
- [ ] ลำดับ `<link>` ถูก (ds-tokens มาก่อน) · ไม่มีสี hex ดิบใน inline style — ใช้ CSS variable
- [ ] `<body data-page="…">` ตรงกับชื่อไฟล์ · เมนูใน navbar ไฮไลต์ถูกกลุ่ม
- [ ] ไอคอน Lucide ขึ้นครบ — เรียก `refreshIcons()` หลัง render ทุกครั้ง · ไม่มี emoji ใน UI
- [ ] ขนาดฟอนต์ตามสเกล (14/13/12/11) · ไม่มีเนื้อหาที่ต้องอ่านต่ำกว่า 12px
- [ ] การเลื่อนถูกต้อง — `.ds-shell` เลื่อนในคอลัมน์ / หน้าธรรมดาเลื่อนทั้งหน้า
- [ ] role gate ที่เมนูถูกต้อง **และมีด่านจริงที่ server ด้วย**
- [ ] ทดสอบจอแคบ (< 820px) แล้วไม่มีอะไรล้นออกนอกจอ
- [ ] ถ้ามีปุ่มพิมพ์ — ลอง print preview แล้วหน้าออกมาถูกต้อง

---

## 11. สิ่งที่จงใจไม่ยกมา + ปัญหาที่แก้แล้ว

ชุดนี้ **ไม่ใช่** การก๊อป CSS เดิมมาทั้งหมด — ระบบเดิมสะสมความซ้ำซ้อนไว้พอสมควร
รายการด้านล่างคือสิ่งที่ตัดออกหรือแก้ไข เผื่อต้องย้อนไปดูของเดิม:

| ปัญหาในระบบเดิม | ที่นี่ทำอย่างไร |
|---|---|
| มี `:root` ประกาศสีทับกัน 6 ไฟล์ ค่าที่ได้ขึ้นกับลำดับ `<link>` ของแต่ละหน้า | ยุบเหลือ `ds-tokens.css` ไฟล์เดียว |
| `--sidebar-w` เป็น `72px` ที่ไฟล์หนึ่ง แต่ `240px` ที่อีกไฟล์ | แยกชื่อชัดเจน: `--sidebar-w` 240 / `--sidebar-w-collapsed` 72 |
| drawer z-index 1000 อยู่ **ใต้** navbar 1100 (navbar บัง drawer) | drawer = 1300 · navbar = 1100 · confirm = 1500 — และลบ hack เดิมทิ้งได้ |
| `body{overflow:hidden}` ถูกบังคับทุกหน้าที่โหลด `doctor.css` ทำให้หน้าธรรมดาต้อง hack `!important` | กลับด้าน — หน้าเลื่อนได้เป็นค่าเริ่มต้น เฉพาะ `.ds-shell` ที่ล็อก |
| ชื่อคลาสโครงหน้าซ้ำซ้อน 4 ชุด (`.main-container` / `.nrs-layout` / `.rxw-shell` / `.cs-root`) ทั้งที่ CSS แทบเหมือนกัน | ยุบเหลือ `.ds-shell` ชุดเดียว + modifier |
| toast มี 4 ชุดพร้อมกัน | เหลือชุดเดียว (pill กลางล่าง ผูกกับ `#toastContainer`) |
| ระบบไอคอน 4 ชุดซ้อนกัน (Lucide + inline `_ic` + `svg-icons.js` + `<symbol>` sprite) | เหลือ Lucide + inline SVG ของ navbar (สำรองกรณี CDN ล่ม) |
| `components.css` (library ที่สมบูรณ์ที่สุด 20 KB) ไม่มีหน้า production ไหนโหลดเลย — เป็น dead code เหมือน `main.css`, `dashboard.css`, `login.css`, `drug-catalog.css` | ไม่ยกมา (หยิบมาเฉพาะ empty state กับ spinner) |
| navbar ไม่มี responsive เลย — เมนูล้นจอต่ำกว่า ~1200px | เพิ่ม media query ให้แถบเมนูเลื่อนแนวนอน |
| `notification-center.js` หา `.nav-right` แต่ navbar สร้าง `.mc-nav-right` → กระดิ่งไม่เคยขึ้น | ไม่ยกมา (ถ้าจะทำใหม่ อย่าลืมแก้ selector) |
| `--font-mono` อ้าง JetBrains Mono / Fira Code แต่ไม่เคยโหลด webfont | เปลี่ยนเป็นฟอนต์ mono ของระบบ (ตรงกับที่ render จริงอยู่แล้ว) |
| navbar ยัด seed script 7 ไฟล์เข้า `<head>` ทุกหน้า | ตัดออก |
| `navbar.js` ผูกกับ `Auth` ตรง ๆ + เมนูเป็น HTML string ในโค้ด | เมนูเป็น config array + auth adapter |

**ไม่ยกมาด้วย:** dark theme (ระบบเดิมมีโทเคน dark แต่ `DARK_PAGES` ว่างเปล่า = เลิกใช้ไปแล้ว)
ถ้าต้องการภายหลัง ให้เพิ่มบล็อก `[data-theme="dark"]` ใน `ds-tokens.css` แล้วสลับด้วย
`document.documentElement.setAttribute('data-theme', 'dark')`

---

## 12. ภาคผนวก — โทเคนเฉพาะโดเมนคลินิก

ท้ายไฟล์ `ds-tokens.css` มีบล็อกโทเคนของระบบโรงพยาบาล (หมวดคำสั่ง CPOE, สถานะคำสั่ง,
ความเร่งด่วน, EWS, แถวคำสั่ง) — **ถ้าโปรเจคใหม่ไม่ใช่ระบบโรงพยาบาล ลบทิ้งได้ทั้งก้อน**

ตารางแปลงสถานะ → (คลาส, ไอคอน, ป้ายไทย) ของระบบเดิม เผื่อต้องใช้ต่อ:

| สถานะ | คลาส badge | ไอคอน Lucide | ป้าย |
|---|---|---|---|
| `DRAFT` | `kbadge-draft` | `edit` | ร่าง — ยังไม่ลงนาม |
| `PENDING` | `kbadge-pending` | `clock` | รอรับคำสั่ง |
| `SCHEDULED` | `kbadge-pending` | `hourglass` | รอกำหนดการ |
| `ACKED` / `ACTIVE` | `kbadge-active` | `check-circle` | Active |
| `IN_PROGRESS` | `kbadge-progress` | `hourglass` | กำลังดำเนินการ |
| `DONE` / `COMPLETED` | `kbadge-done` | `check-circle` | เสร็จสิ้น |
| `SUSPENDED` | `kbadge-alert` | `pause` | พักไว้ |
| `OFF` / `CANCELLED` | `kbadge-off` | `x-circle` | ยกเลิก |
