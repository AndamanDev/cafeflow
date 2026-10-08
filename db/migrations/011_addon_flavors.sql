-- ══════════════════════════════════════════════════════════════════
-- CafeFlow — แยกท็อปปิ้งไซรัป / บุก / เจลลี่ เป็นรายรส (รสละ +฿20)
--
-- เดิม "ไซรัป (สตรอว์เบอร์รี / วานิลลา / ...)" กับ "บุก... / เจลลี่" เป็นตัวเลือกเดียว
-- พนักงานไม่รู้ว่าลูกค้าเอารสไหน · ตัวเดิมเปลี่ยนชื่อเป็นรสแรก (ไม่ลบ — ออเดอร์เก่ายังอ้าง id อยู่)
-- ร้านที่ seed ใหม่ได้จาก seed-data.js อยู่แล้ว ไฟล์นี้สำหรับฐานที่มีข้อมูลเดิม
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- ตัวเดิม → รสแรก (เปลี่ยนเฉพาะที่ยังเป็นชื่อรวม — ร้านที่แก้ชื่อเองแล้วไม่ทับ)
UPDATE modifier_option
   SET name_th = 'ไซรัปสตรอว์เบอร์รี', name_en = 'Strawberry syrup', short_label = 'ไซรัปสตรอว์ฯ'
 WHERE id = 'MO-A-SYRUP' AND (name_th LIKE 'ไซรัป (%' OR name_th = 'ไซรัปสตรอว์เบอร์รี');
UPDATE modifier_option
   SET name_th = 'บุกบราวน์ชูการ์', name_en = 'Brown sugar konjac', short_label = 'บุกบราวน์ฯ'
 WHERE id = 'MO-A-KONJ' AND (name_th LIKE '% / %' OR name_th = 'บุกบราวน์ชูการ์');

-- รสใหม่ — ใส่เฉพาะร้านที่มีกลุ่มท็อปปิ้งตั้งต้น
INSERT INTO modifier_option (id, group_id, name_th, name_en, short_label, price_delta, is_default, sort)
SELECT v.id, 'MG-ADDON', v.th, v.en, v.short, 20, false, v.sort
  FROM (VALUES
    ('MO-A-SYR-VAN',  'ไซรัปวานิลลา',      'Vanilla syrup',     'ไซรัปวานิลลา', 4),
    ('MO-A-SYR-CAR',  'ไซรัปคาราเมล',      'Caramel syrup',     'ไซรัปคาราเมล', 5),
    ('MO-A-SYR-BRS',  'ไซรัปบราวน์ชูการ์', 'Brown sugar syrup', 'ไซรัปบราวน์ฯ', 6),
    ('MO-A-KONJ-CAR', 'บุกคาราเมล',        'Caramel konjac',    'บุกคาราเมล',   8),
    ('MO-A-JELLY',    'เจลลี่',             'Jelly',             'เจลลี่',        9)
  ) AS v(id, th, en, short, sort)
 WHERE EXISTS (SELECT 1 FROM modifier_group WHERE id = 'MG-ADDON')
ON CONFLICT (id) DO NOTHING;

-- เรียงใหม่ให้รสเดียวกันอยู่ติดกัน (เดิม sort 3–6 ชนกับรสใหม่)
UPDATE modifier_option o SET sort = v.sort FROM (VALUES
    ('MO-A-SYRUP', 3), ('MO-A-KONJ', 7), ('MO-A-PALM', 10), ('MO-A-SHOT', 11)
) AS v(id, sort) WHERE o.id = v.id;

COMMIT;
