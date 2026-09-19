#!/usr/bin/env python3
"""
CafeFlow — สร้างหน้าคีออสก์เป็นไฟล์เดียวสำหรับ Claude Artifact

ทำไมต้องมีสคริปต์ ไม่เขียนมือ:
    ถ้าเขียนแยกอีกชุด พอแก้ราคา/กฎตัวเลือกในแอปจริง อาร์ติแฟกต์จะไม่ตาม
    แล้วเดโมจะโกหกลูกค้า — สคริปต์นี้อ่านไฟล์เดียวกับที่เว็บแอปใช้

โครงคีออสก์ถูกจัดให้ self-contained อยู่แล้ว (ไม่พึ่ง design-system-2
ไม่ใช้ Drawer/Lucide/ลิงก์ข้ามหน้า) สคริปต์จึงแทบเป็นแค่การต่อไฟล์

    python tools/build_kiosk_artifact.py           สร้าง dist/cafeflow-kiosk.html
    python tools/build_kiosk_artifact.py --check   เทียบว่าไฟล์ที่มีตรงกับซอร์สไหม

ใช้ Python เพราะโปรเจกต์นี้รันเซิร์ฟเวอร์ด้วย python -m http.server อยู่แล้ว
จึงมั่นใจได้ว่ามี (ต่างจาก Node ที่ไม่รู้ว่าเครื่องมีไหม)
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / 'app'
OUT = ROOT / 'dist' / 'cafeflow-kiosk.html'

# ── CSS: โทเคนร่วม + reset + ธีม + คีออสก์ ────────────────────────
CSS_FILES = [
    ROOT / 'design-system-2' / 'css' / 'ds-tokens.css',
    ROOT / 'design-system-2' / 'css' / 'ds-base.css',
    APP / 'css' / 'ds-cafeflow-theme.css',
    APP / 'css' / 'cf-kiosk.css',
]

# ── JS: ลำดับสำคัญ — CF_SEED ต้องมีก่อน CFStore.init() ที่ท้ายสุด ──
JS_FILES = [
    APP / 'js' / 'cf-data.js',        # เมนูจริง หมวด กฎตัวเลือก ออเดอร์ตัวอย่าง
    APP / 'js' / 'cf-app.js',         # formatter + CFRules (กฎ §11)
    APP / 'js' / 'cf-orders.js',      # state machine §7 — ห้าม fork
    APP / 'js' / 'cf-kiosk-art.js',
    APP / 'js' / 'cf-kiosk-core.js',
]

# ── สิ่งที่ไม่ไปกับอาร์ติแฟกต์ ──────────────────────────────────────
# cf-store.js  → แทนด้วย shim ในหน่วยความจำ (ตัด localStorage / BroadcastChannel / poll)
# cf-auth.js   → ไม่มีการล็อกอินบนคีออสก์
# cf-print/docs/export/kpi/nav, page-*.js อื่น, design-system-2/ ทั้งหมด
SHIMS = r"""
/* ══════════════════════════════════════════════════════════
   SHIM — แทน cf-store.js และ cf-auth.js
   อาร์ติแฟกต์ไม่มี localStorage ไม่มีการ sync ข้ามแท็บ
   ข้อมูลอยู่ในหน่วยความจำ รีเซ็ตทุกครั้งที่เปิดหน้า
   ══════════════════════════════════════════════════════════ */
window.CFStore = (function () {
    let db = null;
    const subs = [];
    return {
        get db() { return db; },
        init() { if (!db) db = CF_SEED(new Date()); return db; },
        all(e) { return (db && db[e]) || []; },
        byId(e, i) { return this.all(e).find((x) => x.id === i) || null; },
        where(e, f) { return this.all(e).filter(f); },
        settings() { return db.settings; },
        openShift() { return this.all('shifts').find((s) => s.status === 'OPEN') || null; },
        nextId(p, k) { const n = (db.counters[k] || 0) + 1; db.counters[k] = n; return p + n; },
        nextOrderNo() {
            const n = (db.counters.orderSeq || 100) + 1;
            db.counters.orderSeq = n;
            return 'A' + String(n).padStart(3, '0');
        },
        mutate(fn, reason) {
            const v = fn(db);
            db.meta.rev = (db.meta.rev || 0) + 1;
            subs.forEach((cb) => { try { cb({ rev: db.meta.rev, reason }); } catch (e) { console.error(e); } });
            return v;
        },
        subscribe(cb) { subs.push(cb); return () => {}; },
        resetDemo() { db = CF_SEED(new Date()); subs.forEach((cb) => cb({ rev: 0 })); },
        isPersistent() { return true; },
    };
})();

window.CFAuth = { getUser: () => null, getRole: () => null, guard: () => true, can: () => false };
window.refreshIcons = function () {};
window.showToast = function (m) { if (window.CFKiosk) CFKiosk.toast(m, 2400); };
"""

BOOT = r"""
document.body.className = 'cf-kiosk';
CFStore.init();
CFKiosk.boot({ deviceId: 'KIOSK-01', allowDeviceGate: false, demo: true });
"""


def read(p: Path) -> str:
    return p.read_text(encoding='utf-8')


def strip_imports(css: str) -> str:
    """@import ต้องออก — ฟอนต์ถูกโหลดด้วย <link> ในเทมเพลตแทน"""
    return re.sub(r'^\s*@import\s+[^;]+;\s*$', '', css, flags=re.M)


def build() -> str:
    css = '\n'.join(
        '/* ===== %s ===== */\n%s' % (p.name, strip_imports(read(p)))
        for p in CSS_FILES
    )
    js = '\n'.join(
        '/* ===== %s ===== */\n%s' % (p.name, read(p))
        for p in JS_FILES
    )

    html = read(ROOT / 'tools' / 'artifact-template.html')
    for marker, body in (('/*#CSS*/', css), ('/*#SHIMS*/', SHIMS),
                         ('/*#JS*/', js), ('/*#BOOT*/', BOOT)):
        if marker not in html:
            fail('เทมเพลตไม่มี marker %s' % marker)
        html = html.replace(marker, body)
    return html


def fail(msg: str):
    print('BUILD FAILED: ' + msg, file=sys.stderr)
    sys.exit(1)


def strip_comments(src: str) -> str:
    """
    เอาคอมเมนต์ออกก่อนตรวจ
    ไฟล์พวกนี้มีคอมเมนต์เตือนว่า "ห้ามใช้ localStorage" อยู่ — ถ้าไม่ตัดออก
    ด่านตรวจจะไปจับคำเตือนของตัวเองแล้วล้มทั้งที่โค้ดถูกต้อง
    แทนที่ด้วยช่องว่างจำนวนเท่ากันเพื่อให้เลขบรรทัดยังตรง
    """
    def blank(m):
        return re.sub(r'[^\n]', ' ', m.group(0))
    src = re.sub(r'/\*.*?\*/', blank, src, flags=re.S)
    src = re.sub(r'^\s*//[^\n]*', blank, src, flags=re.M)
    return src


def assert_clean(html: str):
    """ด่านตรวจ — อาร์ติแฟกต์ต้องไม่มีอะไรที่ทำงานไม่ได้ในสภาพแวดล้อมนั้น"""
    code = strip_comments(html)
    checks = [
        (r'\bfetch\s*\(',            'มีการเรียก fetch() — อาร์ติแฟกต์บล็อกไว้'),
        (r'XMLHttpRequest',          'มีการใช้ XMLHttpRequest'),
        (r'\blocalStorage\b',        'ยังอ้าง localStorage อยู่ (ต้องผ่าน shim เท่านั้น)'),
        (r'\bsessionStorage\b',      'ยังอ้าง sessionStorage อยู่'),
        (r'\bBroadcastChannel\b',    'ยังอ้าง BroadcastChannel อยู่'),
        (r'href\s*=\s*["\'][^"\'#]*\.html', 'มีลิงก์ไปหน้า .html อื่น — อาร์ติแฟกต์เป็นหน้าเดียว'),
        (r'<script[^>]+\bsrc\s*=',   'มี <script src> ภายนอก — ต้อง inline ทั้งหมด'),
        (r'unpkg\.com|jsdelivr|cdnjs', 'มี CDN ที่ไม่ได้รับอนุญาต'),
    ]
    problems = []
    for pattern, msg in checks:
        for m in re.finditer(pattern, code):
            line = code[:m.start()].count('\n') + 1
            problems.append('  บรรทัด %d: %s  →  %r' % (line, msg, m.group(0)[:40]))

    # stylesheet ภายนอกต้องเป็น Google Fonts เท่านั้น
    for m in re.finditer(r'<link[^>]+href="([^"]+)"', code):
        if not m.group(1).startswith('https://fonts.'):
            problems.append('  stylesheet ภายนอกที่ไม่อนุญาต: %s' % m.group(1))

    if problems:
        fail('เจอปัญหา %d จุด\n%s' % (len(problems), '\n'.join(problems)))

    # หมายเหตุ: CFKioskArt.tile() ปล่อย <img src> แบบไดนามิกจาก product.imageUrl
    # ในอาร์ติแฟกต์ CSP บล็อกรูปจากโดเมนภายนอก → onerror จะพาไปใช้ภาพวาดแทนเอง
    # จึงไม่ถือเป็นปัญหา แต่ต้องรู้ว่ารูปถ่ายจริงจะไม่ขึ้นในเวอร์ชันอาร์ติแฟกต์


def main():
    html = build()
    assert_clean(html)

    if '--check' in sys.argv:
        if not OUT.exists():
            fail('ยังไม่มี %s — รันสคริปต์โดยไม่ใส่ --check ก่อน' % OUT)
        if OUT.read_text(encoding='utf-8') != html:
            fail('%s ไม่ตรงกับซอร์สแล้ว — รันสคริปต์ใหม่ก่อนแชร์' % OUT.name)
        print('OK — %s ตรงกับซอร์ส' % OUT.name)
        return

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding='utf-8')
    kb = len(html.encode('utf-8')) / 1024
    print('สร้าง %s แล้ว (%.0f KB)' % (OUT.relative_to(ROOT), kb))


if __name__ == '__main__':
    main()
