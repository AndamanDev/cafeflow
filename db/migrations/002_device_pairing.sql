-- ══════════════════════════════════════════════════════════════════
-- CafeFlow — จับคู่อุปกรณ์ (§30)
--
-- ปัญหาที่แก้: ก่อนหน้านี้คีออสก์บอกตัวตนด้วย header `X-CF-Device` ที่ตัวเอง
-- ประกาศเอง ใครก็ตามที่อยู่บน LAN (รวมลูกค้าที่ต่อ Wi-Fi ร้าน) จึงยิงสร้าง
-- ออเดอร์จริงเข้าคิวครัวได้ — ต้องพิสูจน์ตัวตนด้วยของที่ผู้จัดการเป็นคนออกให้
--
-- กลไก: ผู้จัดการกด "จับคู่" ที่หลังบ้าน → ได้รหัส 6 หลักอายุสั้น
--        → ไปกรอกที่เครื่องคีออสก์ → เครื่องได้ token ยาวเก็บใน cookie httpOnly
-- ══════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE device
    -- รหัสจับคู่อายุสั้น เก็บเป็น hash — หลุดจากฐานแล้วเอาไปใช้ไม่ได้
    ADD COLUMN IF NOT EXISTS pair_code_hash       text,
    ADD COLUMN IF NOT EXISTS pair_code_expires_at timestamptz,
    ADD COLUMN IF NOT EXISTS pair_code_by         text,
    -- ผลของการจับคู่
    ADD COLUMN IF NOT EXISTS paired_at            timestamptz,
    ADD COLUMN IF NOT EXISTS paired_ip            inet;

-- token ของอุปกรณ์ (คอลัมน์ pairing_token_hash มีอยู่แล้วจาก 001)
-- ต้องหาเจอเร็วตอนตรวจทุก request ที่คีออสก์ยิงเข้ามา
CREATE INDEX IF NOT EXISTS ix_device_token ON device (pairing_token_hash)
    WHERE pairing_token_hash IS NOT NULL;

COMMIT;
