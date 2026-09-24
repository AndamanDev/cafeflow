-- ══════════════════════════════════════════════════════════════════
-- CafeFlow — เครื่องพิมพ์ต่อได้ทั้ง LAN และ USB (§19)
--
-- เดิมเครื่องพิมพ์ต่อได้ทางเดียวคือ TCP 9100 ผ่าน printer_host
-- ร้านเล็กส่วนมากซื้อเครื่องพิมพ์ใบเสร็จแบบ USB มาเสียบเครื่องแคชเชียร์
-- จึงต้องเลือกได้ว่าเครื่องไหนต่อแบบไหน
--
-- USB ใช้ได้เฉพาะเครื่องพิมพ์ที่เสียบกับเครื่องที่รัน API เท่านั้น
-- เพราะเซิร์ฟเวอร์เป็นคนส่งงานพิมพ์ ไม่ใช่เบราว์เซอร์
-- ══════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE device
    ADD COLUMN IF NOT EXISTS printer_conn text NOT NULL DEFAULT 'NETWORK'
        CHECK (printer_conn IN ('NETWORK','USB')),
    -- Windows: ชื่อเครื่องพิมพ์ตามที่ Windows เห็น · Linux: /dev/usb/lp0
    ADD COLUMN IF NOT EXISTS printer_usb  text;

COMMIT;
