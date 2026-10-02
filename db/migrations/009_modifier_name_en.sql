-- ══════════════════════════════════════════════════════════════════
-- CafeFlow — ชื่อภาษาอังกฤษของกลุ่มตัวเลือก / ตัวเลือก (คีออสก์โหมด English)
--
-- สินค้าและหมวดมี name_en อยู่แล้ว ตัวเลือก (ความหวาน · น้ำแข็ง · ท็อปปิ้ง) ยังไม่มี
-- ว่างไว้ได้ — คีออสก์แสดงชื่อไทยแทน
-- คำแปลด้านล่างเติมให้ข้อมูลตั้งต้นของร้าน (ร้านที่ seed ใหม่ได้จาก seed-data.js)
-- ══════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE modifier_group  ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE modifier_option ADD COLUMN IF NOT EXISTS name_en text;

UPDATE modifier_group g SET name_en = v.en FROM (VALUES
    ('MG-ADDON',  'Add-ons'),
    ('MG-BEAN',   'Coffee beans'),
    ('MG-ICE',    'Ice'),
    ('MG-MATCHA', 'Matcha grade'),
    ('MG-SWEET',  'Sweetness')
) AS v(id, en) WHERE g.id = v.id AND g.name_en IS NULL;

UPDATE modifier_option o SET name_en = v.en FROM (VALUES
    ('MO-A-OAT',   'Oat milk'),
    ('MO-A-SODA',  'Soda'),
    ('MO-A-SYRUP', 'Syrup (strawberry / vanilla / caramel / brown sugar)'),
    ('MO-A-KONJ',  'Brown sugar konjac / caramel konjac / jelly'),
    ('MO-A-PALM',  'Toddy palm'),
    ('MO-A-SHOT',  'Extra espresso shot'),
    ('MO-B-STD',   'Thai / Lao premium (medium-dark roast)'),
    ('MO-B-BRA',   'Brazil (medium-dark roast)'),
    ('MO-B-ETH',   'Ethiopia (light-medium roast)'),
    ('MO-B-DOI',   'Doi Chang (medium-dark roast)'),
    ('MO-I-N',     'Regular ice'),
    ('MO-I-L',     'Less ice'),
    ('MO-I-S',     'Ice on the side'),
    ('MO-M-STD',   'Regular matcha'),
    ('MO-M-CER',   'Ceremonial grade matcha'),
    ('MO-S0',      '0% sweet'),
    ('MO-S25',     '25% sweet'),
    ('MO-S50',     '50% sweet'),
    ('MO-S75',     '75% sweet'),
    ('MO-S100',    '100% sweet')
) AS v(id, en) WHERE o.id = v.id AND o.name_en IS NULL;

COMMIT;
