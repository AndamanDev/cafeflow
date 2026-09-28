-- ══════════════════════════════════════════════════════════════════
-- CafeFlow — แคชเชียร์ทิ้งงานพิมพ์ที่ไม่ต้องพิมพ์แล้วได้ (§19)
--
-- งานที่พิมพ์ไม่ออก (FAILED) ค้างเตือนอยู่จนกว่าจะมีคนจัดการ บางใบไม่ต้องพิมพ์ซ้ำแล้ว
-- (เช่น ครัวทำไปแล้วจากจอ KDS) — CANCELLED เก็บไว้เป็นประวัติแต่ไม่เตือนอีก
-- ══════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE print_job DROP CONSTRAINT IF EXISTS print_job_status_check;
ALTER TABLE print_job ADD CONSTRAINT print_job_status_check
    CHECK (status IN ('QUEUED','PRINTING','DONE','FAILED','CANCELLED'));

COMMIT;
