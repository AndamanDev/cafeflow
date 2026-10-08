-- ══════════════════════════════════════════════════════════════════
-- CafeFlow — กันข้อมูลผิดที่ระดับฐาน (ไม่พึ่งแค่ if ใน JS)
--
-- 1. ยอดเงินห้ามติดลบ — บั๊กคำนวณส่วนลด/เงินทอนจะถูกปฏิเสธทันที ไม่ไปโผล่ตอนปิดรอบ
-- 2. รอบที่ปิดแล้วต้องมีเวลาปิด
-- 3. ออเดอร์ต้องอยู่ในรอบเสมอ — ไม่งั้นเงินไม่เข้ายอด "เงินสดที่ควรมี" ของรอบไหนเลย
--    ถ้ายังมีออเดอร์ไม่มีรอบ migration นี้จะหยุด — ล้างข้อมูลทดสอบ (npm run clear-tx)
--    หรือเปิดรอบให้ระบบยกออเดอร์ค้างเข้ารอบก่อน แล้วรัน npm run migrate ใหม่
-- 4. index ที่ขาดสำหรับ query ที่ใช้บ่อย
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1–2. CHECK — เพิ่มเฉพาะตัวที่ยังไม่มี (รันซ้ำบนฐานที่แก้มือแล้วได้) ──
DO $$
DECLARE
    c record;
BEGIN
    FOR c IN SELECT * FROM (VALUES
        ('cf_order',   'ck_order_money',   'subtotal >= 0 AND discount >= 0 AND vat_amount >= 0 AND total >= 0'),
        ('order_item', 'ck_item_price',    'unit_price >= 0'),
        ('payment',    'ck_payment_money', 'amount >= 0 AND (received IS NULL OR received >= 0) AND (change_amount IS NULL OR change_amount >= 0)'),
        ('payment_qr', 'ck_qr_amount',     'amount > 0'),
        ('shift',      'ck_shift_money',   'opening_cash >= 0 AND (actual_cash IS NULL OR actual_cash >= 0)'),
        ('shift',      'ck_shift_closed',  'status <> ''CLOSED'' OR closed_at IS NOT NULL')
    ) AS t(tbl, name, expr)
    LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c.name) THEN
            -- ข้อมูลเก่าผิดอยู่แล้ว → migration ล้มพร้อมชื่อ constraint ให้รู้ว่าต้องแก้ตารางไหน
            EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (%s)', c.tbl, c.name, c.expr);
        END IF;
    END LOOP;
END $$;

-- ── 3. ออเดอร์ต้องมีรอบ ──
DO $$
DECLARE
    n integer;
BEGIN
    SELECT count(*) INTO n FROM cf_order WHERE shift_id IS NULL;
    IF n > 0 THEN
        RAISE EXCEPTION 'มีออเดอร์ % รายการที่ไม่มีรอบ — ล้างข้อมูลทดสอบ (npm run clear-tx) หรือเปิดรอบก่อน แล้วรัน migrate ใหม่', n;
    END IF;
    ALTER TABLE cf_order ALTER COLUMN shift_id SET NOT NULL;
END $$;

-- ── 4. index ──
CREATE INDEX IF NOT EXISTS ix_slip_order     ON payment_slip (order_id);
CREATE INDEX IF NOT EXISTS ix_session_expiry ON session (expires_at);
CREATE INDEX IF NOT EXISTS ix_change_at      ON change_log (at);
-- ตัวกวาด QR หมดอายุรันทุก 5 วิ — ดูเฉพาะใบที่ยังไม่ยกเลิก
CREATE INDEX IF NOT EXISTS ix_qr_open_expiry ON payment_qr (expires_at) WHERE cancelled_at IS NULL;

COMMIT;
