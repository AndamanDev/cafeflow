-- ══════════════════════════════════════════════════════════════════
-- CafeFlow — รับสลิปด้วยการสแกน QR ที่คีออสก์ (§14 §17)
--
-- ตาราง payment_slip ออกแบบไว้สำหรับ "รูปสลิป + OCR" จึงบังคับ image_path/sha256
-- การสแกน QR บนจอมือถือลูกค้าไม่มีรูปให้เก็บ — ได้แค่ payload ของ QR
--
-- เลขอ้างอิงห้ามซ้ำทั้งระบบ: สลิปใบเดียวใช้จ่ายได้ออเดอร์เดียว
-- (กันลูกค้าแคปสลิปเก่าหรือสลิปของเพื่อนมาใช้ซ้ำ)
-- ══════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE payment_slip
    ALTER COLUMN image_path DROP NOT NULL,
    ALTER COLUMN sha256     DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS qr_payload text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_slip_ref ON payment_slip (parsed_ref)
    WHERE parsed_ref IS NOT NULL;

COMMIT;
