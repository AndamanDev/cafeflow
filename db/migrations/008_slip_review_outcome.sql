-- ══════════════════════════════════════════════════════════════════
-- CafeFlow — บันทึกว่าแคชเชียร์ตัดสินสลิปแต่ละใบอย่างไร
--
-- เทียบกับผลที่ระบบอ่านได้ (verdict) เพื่อวัดความแม่นจริงของการตรวจสลิป:
-- ระบบเตือนแดงแต่คนยืนยัน = เตือนผิด · ระบบว่าผ่านแต่คนปฏิเสธ = หลุด
-- ดูได้ที่ GET /api/reports/slip-accuracy และการ์ดบนหน้าภาพรวม
-- ══════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE payment_slip
    ADD COLUMN IF NOT EXISTS review_outcome text
        CHECK (review_outcome IS NULL OR review_outcome IN ('CONFIRMED','REJECTED'));

COMMIT;
