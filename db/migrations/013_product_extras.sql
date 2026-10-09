-- ══════════════════════════════════════════════════════════════════
-- CafeFlow — ข้อมูลเสริมของสินค้า: คำอธิบาย · สต็อก · ต้นทุน
--
-- คำอธิบาย     ขึ้นที่หน้าเลือกตัวเลือกบนคีออสก์ ("เข้ม หอมช็อกโกแลต") — ว่างได้
-- สต็อก         NULL = ไม่นับ (ขายได้ไม่จำกัด เช่นกาแฟ) · ตัวเลข = เหลือกี่ชิ้น (เบเกอรี่)
--               ตัดตอนสร้างออเดอร์ · ถึง 0 แล้วระบบตั้ง "หมดวันนี้" เอง · ยกเลิกก่อนเข้าครัวคืนสต็อก
-- ต้นทุน        ต่อแบบเสิร์ฟ (เย็นใช้แก้ว+น้ำแข็ง ต้นทุนไม่เท่าร้อน) — NULL = ยังไม่ได้ใส่
-- unit_cost     ต้นทุน ณ วันที่ขาย เก็บในบิล — แก้ต้นทุนทีหลังแล้วกำไรย้อนหลังต้องไม่เปลี่ยน
--
-- ช่วงเวลาขาย (avail_from/avail_to) กับลำดับ (sort) มีตั้งแต่ 001 แล้ว
-- ══════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE product
    ADD COLUMN IF NOT EXISTS description_th text,
    ADD COLUMN IF NOT EXISTS description_en text,
    ADD COLUMN IF NOT EXISTS stock_qty integer CHECK (stock_qty IS NULL OR stock_qty >= 0);

ALTER TABLE product_price
    ADD COLUMN IF NOT EXISTS cost numeric(10,2) CHECK (cost IS NULL OR cost >= 0);

ALTER TABLE order_item
    ADD COLUMN IF NOT EXISTS unit_cost numeric(10,2) CHECK (unit_cost IS NULL OR unit_cost >= 0);

COMMIT;
