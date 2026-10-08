-- ══════════════════════════════════════════════════════════════════
-- CafeFlow — เพดานจำนวนตัวเลือกของกลุ่ม "เลือกได้หลายอย่าง"
--
-- เช่น ท็อปปิ้งเลือกได้สูงสุด 3 อย่าง · NULL = ไม่จำกัด (เหมือนเดิม)
-- ใช้กับกลุ่ม MULTI เท่านั้น — SINGLE เลือกได้ 1 อยู่แล้ว
-- ══════════════════════════════════════════════════════════════════
BEGIN;

ALTER TABLE modifier_group ADD COLUMN IF NOT EXISTS max_select integer
    CHECK (max_select IS NULL OR max_select >= 1);

-- ค่าตั้งต้นของร้าน: ท็อปปิ้งเพิ่มสูงสุด 3 อย่าง
UPDATE modifier_group SET max_select = 3 WHERE id = 'MG-ADDON' AND max_select IS NULL;

COMMIT;
