-- ══════════════════════════════════════════════════════════════════
-- CafeFlow — เลิกใช้บทบาท VIEWER "ผู้ชมข้อมูล" (ผู้ใช้เลือก 21/10/2569)
--
-- บทบาทนี้มีสิทธิ์ดูรายงานแบบจำกัด แต่หน้ารายงานเปิดได้เฉพาะคนที่แก้ราคาได้ → ใช้งานจริงไม่ได้
-- บัญชีที่เป็น VIEWER อยู่: ตัด session · ปิดใช้งาน · ย้ายไปบทบาทที่สิทธิ์น้อยที่สุด (KITCHEN = เห็นแค่จอครัว)
-- ไม่ลบบัญชี — ประวัติ (audit / ออเดอร์) อาจอ้างถึงอยู่ · แอดมินเปิดใช้ใหม่ได้ถ้าต้องการ
-- ══════════════════════════════════════════════════════════════════
UPDATE session SET revoked_at = now()
 WHERE revoked_at IS NULL AND user_id IN (SELECT id FROM app_user WHERE role = 'VIEWER');

UPDATE app_user SET role = 'KITCHEN', active = false WHERE role = 'VIEWER';

ALTER TABLE app_user DROP CONSTRAINT IF EXISTS app_user_role_check;
ALTER TABLE app_user ADD CONSTRAINT app_user_role_check
    CHECK (role IN ('ADMIN', 'MANAGER', 'CASHIER', 'KITCHEN'));
