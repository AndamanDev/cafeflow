-- ══════════════════════════════════════════════════════════════════
-- CafeFlow — โครงฐานข้อมูลเริ่มต้น
--
-- หลักที่ยึด
--   1. branch_id อยู่ทุกตารางที่เป็นข้อมูลดำเนินงานตั้งแต่วันแรก
--      (ใส่ทีหลัง = ต้องไล่แก้ทุก query ทั้งระบบ)
--   2. enum ใช้ text + CHECK ไม่ใช่ PG enum — เพิ่ม/ลด/เปลี่ยนชื่อค่าได้ด้วย
--      migration ธรรมดา และฐานร้านกับฐานคลาวด์ที่เวอร์ชันเหลื่อมกันไม่ระเบิด
--   3. เก็บ snapshot ของบิลไว้เสมอ (ชื่อ ราคา ป้ายตัวเลือก) แก้เมนูย้อนหลัง
--      แล้วบิลเก่าต้องไม่เปลี่ยน
-- ══════════════════════════════════════════════════════════════════

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- rev เดียวทั้งฐาน ใช้ตอบ ?since= ของ SSE
-- ไม่ใช้ timestamp เพราะนาฬิกาเพี้ยนนิดเดียวก็ทำให้ client พลาด event ไปเงียบ ๆ
CREATE SEQUENCE IF NOT EXISTS global_rev;

-- ── สาขา ──────────────────────────────────────────────────────────
CREATE TABLE branch (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code            text NOT NULL UNIQUE,
    name_th         text NOT NULL,
    address         text,
    tax_id          text,
    -- ร้านยังไม่จด VAT — เก็บช่องไว้ ไม่ได้เปิดใช้ (ดูหมายเหตุที่ cf_order.vat_amount)
    vat_registered  boolean NOT NULL DEFAULT false,
    vat_percent     numeric(5,2) NOT NULL DEFAULT 7,
    promptpay_id    text,                 -- ใช้สร้าง QR ตามยอดชำระ
    timezone        text NOT NULL DEFAULT 'Asia/Bangkok',
    active          boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── ผู้ใช้และสิทธิ์ (§29) ──────────────────────────────────────────
CREATE TABLE app_user (
    id              text PRIMARY KEY,
    branch_id       uuid NOT NULL REFERENCES branch(id),
    username        text NOT NULL,
    password_hash   text NOT NULL,        -- argon2id — ห้ามเก็บรหัสดิบเด็ดขาด
    pin_hash        text,                 -- ล็อกอินเร็วที่เคาน์เตอร์
    name_th         text NOT NULL,
    role            text NOT NULL CHECK (role IN ('ADMIN','MANAGER','CASHIER','KITCHEN','VIEWER')),
    -- null = ไม่จำกัดวงเงินยืนยันแทน · 0 = ทำไม่ได้เลย (ตรงกับโมเดลเดิม)
    override_limit  numeric(10,2),
    active          boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_user_username ON app_user (branch_id, lower(username));

-- ── อุปกรณ์ (§30) ─────────────────────────────────────────────────
CREATE TABLE device (
    id                  text PRIMARY KEY,
    branch_id           uuid NOT NULL REFERENCES branch(id),
    kind                text NOT NULL CHECK (kind IN ('KIOSK','CASHIER','KDS','PRINTER','DISPLAY')),
    name_th             text NOT NULL,
    ip                  inet,
    assigned_station    text CHECK (assigned_station IN ('BAR','KITCHEN','BAKERY','DESSERT')),
    assigned_cashier    text,
    -- เครื่องพิมพ์: ต่อตรงด้วย ESC/POS ผ่าน TCP 9100
    printer_host        inet,
    printer_port        integer NOT NULL DEFAULT 9100,
    paper_width         text NOT NULL DEFAULT '80mm' CHECK (paper_width IN ('58mm','80mm')),
    fallback_printer_id text,             -- เครื่องสำรองเมื่อตัวหลักเสีย (§19)
    pairing_token_hash  text,
    active              boolean NOT NULL DEFAULT true,
    -- heartbeat จริง ไม่ใช่ค่าคงที่แบบในโปรโตไทป์
    last_seen_at        timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now()
);

-- ── เมนู (§10, §11) ───────────────────────────────────────────────
CREATE TABLE category (
    id         text PRIMARY KEY,
    branch_id  uuid NOT NULL REFERENCES branch(id),
    name_th    text NOT NULL,
    name_en    text,
    sort       integer NOT NULL DEFAULT 0,
    active     boolean NOT NULL DEFAULT true
);

CREATE TABLE product (
    id           text PRIMARY KEY,
    branch_id    uuid NOT NULL REFERENCES branch(id),
    category_id  text NOT NULL REFERENCES category(id),
    group_th     text,                    -- กลุ่มย่อยบนป้ายหน้าร้าน ไม่ใช่ FK
    name_th      text NOT NULL,
    name_en      text,
    image_url    text,
    art_key      text,                    -- ภาพวาดสำรองเมื่อไม่มีรูปถ่าย
    station      text NOT NULL CHECK (station IN ('BAR','KITCHEN','BAKERY','DESSERT')),
    active       boolean NOT NULL DEFAULT true,
    sold_out     boolean NOT NULL DEFAULT false,
    recommended  boolean NOT NULL DEFAULT false,
    avail_from   time,                    -- เมนูตามช่วงเวลา (§37 ข้อ 9)
    avail_to     time,
    sort         integer NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    deleted_at   timestamptz              -- ลบแบบอ่อน บิลเก่าต้องยัง join ได้
);
CREATE INDEX ix_product_cat ON product (branch_id, category_id) WHERE deleted_at IS NULL;

-- ★ ราคาแยกตาราง ไม่ใช่คอลัมน์เดียว
--   ป้ายหน้าร้านมีสามคอลัมน์ ร้อน/เย็น/ปั่น และช่องที่เป็น '–' คือไม่มีขาย
--   "ไม่มีแถว" จึงแปลว่าไม่ขายแบบนั้น ซึ่งต่างจากราคา 0 — CHECK บังคับไว้ด้วย
CREATE TABLE product_price (
    product_id  text NOT NULL REFERENCES product(id) ON DELETE CASCADE,
    serve_type  text NOT NULL CHECK (serve_type IN ('HOT','ICED','FRAPPE','STD')),
    price       numeric(10,2) NOT NULL CHECK (price > 0),
    PRIMARY KEY (product_id, serve_type)
);

CREATE TABLE modifier_group (
    id         text PRIMARY KEY,
    branch_id  uuid NOT NULL REFERENCES branch(id),
    name_th    text NOT NULL,
    type       text NOT NULL CHECK (type IN ('SINGLE','MULTI')),
    required   boolean NOT NULL DEFAULT false,
    sort       integer NOT NULL DEFAULT 0,
    active     boolean NOT NULL DEFAULT true
);

CREATE TABLE modifier_option (
    id           text PRIMARY KEY,
    group_id     text NOT NULL REFERENCES modifier_group(id) ON DELETE CASCADE,
    name_th      text NOT NULL,
    short_label  text,                    -- ใช้บนใบเสร็จ 58 มม. ที่มีราว 22 ตัวอักษร
    price_delta  numeric(10,2) NOT NULL DEFAULT 0,
    is_default   boolean NOT NULL DEFAULT false,
    sort         integer NOT NULL DEFAULT 0,
    active       boolean NOT NULL DEFAULT true
);
-- กลุ่มหนึ่งมีค่าเริ่มต้นได้ตัวเดียว ไม่งั้นคีออสก์เลือกให้ลูกค้ามั่ว
CREATE UNIQUE INDEX uq_mo_default ON modifier_option (group_id) WHERE is_default;

-- กฎผูกกับ "แบบเสิร์ฟ" หรือ "หมวด" อย่างใดอย่างหนึ่ง (§11) ไม่ hard-code ต่อสินค้า
CREATE TABLE modifier_rule (
    id           text PRIMARY KEY,
    branch_id    uuid NOT NULL REFERENCES branch(id),
    group_id     text NOT NULL REFERENCES modifier_group(id) ON DELETE CASCADE,
    serve_type   text CHECK (serve_type IN ('HOT','ICED','FRAPPE','STD')),
    category_id  text REFERENCES category(id),
    sort         integer NOT NULL DEFAULT 0,
    CONSTRAINT rule_one_axis CHECK (num_nonnulls(serve_type, category_id) = 1)
);

-- ── ค่าตั้งค่า เก็บเป็น key/value ────────────────────────────────
-- ไม่ทำเป็น 30 คอลัมน์เพราะชุดค่าตั้งงอกตลอด (คีย์ kiosk* 8 ตัวเพิ่มทีหลัง)
-- API ประกอบกลับเป็น object เดียวให้หน้าเว็บ หน้าเว็บจึงไม่รู้สึกว่าเปลี่ยน
CREATE TABLE app_setting (
    branch_id   uuid NOT NULL REFERENCES branch(id),
    key         text NOT NULL,
    value       jsonb NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  text,
    PRIMARY KEY (branch_id, key)
);

-- ── รอบขาย (§27) ─────────────────────────────────────────────────
CREATE TABLE shift (
    id             text PRIMARY KEY,
    branch_id      uuid NOT NULL REFERENCES branch(id),
    business_date  date NOT NULL,
    opened_at      timestamptz NOT NULL,
    closed_at      timestamptz,
    opened_by      text REFERENCES app_user(id),
    closed_by      text REFERENCES app_user(id),
    opening_cash   numeric(10,2) NOT NULL DEFAULT 0,
    -- ยอดที่คาดว่าควรมีถูก snapshot ตอนปิด ไม่คำนวณใหม่ทีหลัง
    -- ไม่งั้นแก้ออเดอร์ย้อนหลังแล้วส่วนต่างของกะที่ปิดไปแล้วขยับตาม
    expected_cash  numeric(10,2),
    actual_cash    numeric(10,2),
    status         text NOT NULL CHECK (status IN ('OPEN','CLOSED')),
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_shift_one_open ON shift (branch_id) WHERE status = 'OPEN';

-- ── ★ ตัวออกเลขออเดอร์ ───────────────────────────────────────────
-- ไม่ใช้ SEQUENCE เพราะ sequence เผาเลขทิ้งเมื่อ rollback
-- และ "บิลข้ามเลข" คือธงแดงทางบัญชีที่อธิบายยากกว่าการรอ lock สั้น ๆ
CREATE TABLE order_seq (
    branch_id      uuid NOT NULL REFERENCES branch(id),
    business_date  date NOT NULL,
    last_no        integer NOT NULL,
    PRIMARY KEY (branch_id, business_date)
);

-- ── ออเดอร์ (§7) ─────────────────────────────────────────────────
-- ชื่อ cf_order เพราะ order เป็นคำสงวนของ SQL
CREATE TABLE cf_order (
    id               text PRIMARY KEY,          -- O-260919-A121 (อ่านออกตอนไล่ audit)
    branch_id        uuid NOT NULL REFERENCES branch(id),
    order_no         text NOT NULL,             -- A121 — ตัวที่ลูกค้าเห็น รีเซ็ตทุกวันทำการ
    business_date    date NOT NULL,
    -- คีออสก์ส่งมาเอง: retry เพราะ Wi-Fi สะดุดต้องไม่กลายเป็นสองออเดอร์
    client_uuid      uuid NOT NULL,
    shift_id         text REFERENCES shift(id),
    kiosk_id         text,
    cashier_id       text REFERENCES app_user(id),
    dining_option    text NOT NULL CHECK (dining_option IN ('DINE_IN','TAKE_AWAY')),
    status           text NOT NULL CHECK (status IN (
                        'DRAFT','ORDER_CONFIRMED','WAITING_CASH','WAITING_PAYMENT',
                        'PAYMENT_TIMEOUT','PAYMENT_REVIEW','PAYMENT_FAILED','PAID',
                        'SENT_TO_KITCHEN','PREPARING','READY','SERVED','COMPLETED',
                        'CANCELLED','VOIDED','REFUNDED')),
    prev_status      text,
    payment_method   text CHECK (payment_method IN ('CASH','QR')),
    subtotal         numeric(10,2) NOT NULL DEFAULT 0,
    discount         numeric(10,2) NOT NULL DEFAULT 0,
    -- ยังไม่จด VAT จึงเป็น 0 เสมอ · เก็บช่องไว้เพราะวันที่จดแล้วต้องเป็นค่าที่
    -- "แช่ไว้ตอนออกบิล" ไม่ใช่คำนวณสดตอนพิมพ์ ไม่งั้นแก้ % แล้วบิลเก่าเปลี่ยนตาม
    vat_amount       numeric(10,2) NOT NULL DEFAULT 0,
    total            numeric(10,2) NOT NULL DEFAULT 0,
    cancel_reason    text,
    reprint_count    integer NOT NULL DEFAULT 0,
    -- เวลาเป็นคอลัมน์จริง ไม่ใช่ jsonb — ทุกตัวต้อง index ได้และต้องลบกันเพื่อหา lead time
    created_at       timestamptz NOT NULL DEFAULT now(),
    paid_at          timestamptz,
    sent_at          timestamptz,
    preparing_at     timestamptz,
    ready_at         timestamptz,
    served_at        timestamptz,
    completed_at     timestamptz,
    cancelled_at     timestamptz,
    voided_at        timestamptz,
    refunded_at      timestamptz,
    rev              bigint NOT NULL DEFAULT nextval('global_rev'),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_order_no     ON cf_order (branch_id, business_date, order_no);
CREATE UNIQUE INDEX uq_order_client ON cf_order (branch_id, client_uuid);
CREATE INDEX ix_order_open ON cf_order (branch_id, status)
    WHERE status NOT IN ('COMPLETED','CANCELLED','VOIDED','REFUNDED');
CREATE INDEX ix_order_created ON cf_order (branch_id, created_at DESC);
CREATE INDEX ix_order_shift   ON cf_order (shift_id);

CREATE TABLE order_item (
    id             text PRIMARY KEY,
    order_id       text NOT NULL REFERENCES cf_order(id) ON DELETE CASCADE,
    line_no        integer NOT NULL,
    product_id     text NOT NULL REFERENCES product(id),
    -- snapshot: ปิดขายสินค้าไปแล้วบิลเก่าต้องยังพิมพ์ซ้ำได้
    name_snapshot  text NOT NULL,
    serve_type     text NOT NULL CHECK (serve_type IN ('HOT','ICED','FRAPPE','STD')),
    qty            integer NOT NULL CHECK (qty > 0),
    unit_price     numeric(10,2) NOT NULL,
    station        text NOT NULL CHECK (station IN ('BAR','KITCHEN','BAKERY','DESSERT')),
    item_status    text NOT NULL DEFAULT 'DRAFT'
                   CHECK (item_status IN ('DRAFT','QUEUED','PREPARING','READY','VOID')),
    UNIQUE (order_id, line_no)
);
CREATE INDEX ix_item_order   ON order_item (order_id);
CREATE INDEX ix_item_station ON order_item (station, item_status);

-- group_id/option_id จงใจไม่ทำ FK — เป็น snapshot ไม่ใช่ความสัมพันธ์
-- ลบตัวเลือก "นมโอ๊ต" ทิ้งแล้วบิลเก่าต้องยังพิมพ์คำว่านมโอ๊ตได้
CREATE TABLE order_item_modifier (
    id             bigserial PRIMARY KEY,
    order_item_id  text NOT NULL REFERENCES order_item(id) ON DELETE CASCADE,
    sort           integer NOT NULL DEFAULT 0,
    group_id       text,
    option_id      text,
    label          text NOT NULL,
    short_label    text,
    price_delta    numeric(10,2) NOT NULL DEFAULT 0
);
CREATE INDEX ix_oim_item ON order_item_modifier (order_item_id);

-- ★ สถานะรายสถานี — ออเดอร์เป็น READY ต่อเมื่อทุกแถวของมัน READY (§21)
-- แยกเป็นตารางเพื่อให้เช็คเงื่อนไขนั้นในทรานแซกชันเดียวกับที่อัปเดต
-- ไม่งั้นสองสถานีกด READY พร้อมกันจะแข่งกันเขียนแล้วผลลัพธ์ไม่แน่นอน
CREATE TABLE order_station_status (
    order_id    text NOT NULL REFERENCES cf_order(id) ON DELETE CASCADE,
    station     text NOT NULL CHECK (station IN ('BAR','KITCHEN','BAKERY','DESSERT')),
    status      text NOT NULL CHECK (status IN ('QUEUED','PREPARING','READY')),
    printed_at  timestamptz,
    ready_at    timestamptz,
    ready_by    text,
    PRIMARY KEY (order_id, station)
);
CREATE INDEX ix_oss_queue ON order_station_status (station, status) WHERE status <> 'READY';

-- ── การชำระเงิน (§12, §14, §16) ──────────────────────────────────
CREATE TABLE payment (
    id               text PRIMARY KEY,
    branch_id        uuid NOT NULL REFERENCES branch(id),
    order_id         text NOT NULL REFERENCES cf_order(id),
    method           text NOT NULL CHECK (method IN ('CASH','QR')),
    amount           numeric(10,2) NOT NULL,
    received         numeric(10,2),        -- เงินสดที่รับมา
    change_amount    numeric(10,2),        -- เงินทอน
    ref              text,                 -- เลขอ้างอิงจากธนาคาร
    bank             text,
    tx_at            timestamptz,
    -- นาฬิกาเครื่องเพี้ยนทำให้กฎ "โอนหลังออก QR" ตัดสินผิด เก็บค่าไว้ให้ audit แยกออก
    clock_offset_ms  integer,
    status           text NOT NULL CHECK (status IN ('PENDING','REVIEW','PAID','FAILED','REFUNDED')),
    verified_by      text,                 -- users.id หรือ 'SYSTEM'
    override_by      text REFERENCES app_user(id),
    override_reason  text,
    override_at      timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
-- ★ กันจ่ายซ้ำที่ระดับฐานข้อมูล ไม่ใช่ if ใน JS
CREATE UNIQUE INDEX uq_pay_paid ON payment (order_id) WHERE status = 'PAID';
CREATE UNIQUE INDEX uq_pay_ref  ON payment (branch_id, bank, ref)
    WHERE ref IS NOT NULL AND status IN ('PAID','REVIEW');
CREATE INDEX ix_pay_order ON payment (order_id);

-- QR ที่ออกให้ออเดอร์ — ยอดถูกฝังใน payload ลูกค้าจึงพิมพ์ยอดผิดไม่ได้
CREATE TABLE payment_qr (
    id           bigserial PRIMARY KEY,
    order_id     text NOT NULL REFERENCES cf_order(id) ON DELETE CASCADE,
    payment_id   text REFERENCES payment(id),
    target       text NOT NULL,            -- PromptPay ID ที่ใช้ตอนนั้น
    amount       numeric(10,2) NOT NULL,
    payload      text NOT NULL,            -- สตริง EMVCo ที่เข้า QR จริง
    created_at   timestamptz NOT NULL DEFAULT now(),
    expires_at   timestamptz NOT NULL,
    cancelled_at timestamptz               -- แก้ตะกร้าแล้วต้องยกเลิกใบเดิมเสมอ
);
CREATE INDEX ix_qr_order ON payment_qr (order_id);

CREATE TABLE payment_slip (
    id              bigserial PRIMARY KEY,
    order_id        text NOT NULL REFERENCES cf_order(id) ON DELETE CASCADE,
    payment_id      text REFERENCES payment(id),
    image_path      text NOT NULL,
    -- รูปเดิมอัปซ้ำถูกปฏิเสธตั้งแต่ก่อนเข้า OCR ด้วยซ้ำ
    sha256          char(64) NOT NULL UNIQUE,
    uploaded_by     text,
    ocr_status      text NOT NULL DEFAULT 'QUEUED'
                    CHECK (ocr_status IN ('QUEUED','RUNNING','DONE','ERROR')),
    ocr_engine      text,
    ocr_raw         jsonb,
    ocr_ms          integer,
    parsed_amount   numeric(10,2),
    parsed_tx_at    timestamptz,
    parsed_ref      text,
    parsed_bank     text,
    parsed_source   text CHECK (parsed_source IN ('BARCODE','TEXT')),
    checks          jsonb,                 -- ผลกฎ 4 ข้อ
    verdict         text CHECK (verdict IN ('PASS','WARN','FAIL')),
    reviewed_by     text REFERENCES app_user(id),
    reviewed_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Audit (§8) — ทุกการเปลี่ยนสถานะต้องมีร่องรอย ────────────────
CREATE TABLE audit_log (
    id             bigserial PRIMARY KEY,
    branch_id      uuid NOT NULL REFERENCES branch(id),
    ts             timestamptz NOT NULL DEFAULT now(),
    event_type     text NOT NULL,
    order_id       text,
    old_status     text,
    new_status     text,
    -- แยกผู้กระทำที่เป็นคนออกจาก SYSTEM/KIOSK เพื่อให้ FK เป็นของจริง
    -- โดยไม่ต้องใส่ผู้ใช้ปลอมชื่อ SYSTEM ลงตาราง app_user
    actor_kind     text NOT NULL CHECK (actor_kind IN ('USER','SYSTEM','KIOSK')),
    actor_user_id  text REFERENCES app_user(id),
    CONSTRAINT actor_consistent CHECK ((actor_kind = 'USER') = (actor_user_id IS NOT NULL)),
    device_id      text,
    reason         text,
    source_ip      inet,                   -- จาก request จริง ไม่ hard-code
    payload        jsonb
);
CREATE INDEX ix_audit_ts    ON audit_log (branch_id, ts DESC);
CREATE INDEX ix_audit_order ON audit_log (order_id);
CREATE INDEX ix_audit_type  ON audit_log (branch_id, event_type, ts DESC);

-- ── งานพิมพ์ (§19) ───────────────────────────────────────────────
CREATE TABLE print_job (
    id           bigserial PRIMARY KEY,
    branch_id    uuid NOT NULL REFERENCES branch(id),
    order_id     text,
    device_id    text,
    doc_type     text NOT NULL CHECK (doc_type IN ('KITCHEN_SLIP','RECEIPT','PAYMENT_TICKET','CLOSING')),
    paper_width  text NOT NULL DEFAULT '80mm',
    payload      bytea,
    status       text NOT NULL DEFAULT 'QUEUED'
                 CHECK (status IN ('QUEUED','PRINTING','DONE','FAILED')),
    attempts     integer NOT NULL DEFAULT 0,
    last_error   text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    printed_at   timestamptz
);
CREATE INDEX ix_print_queue ON print_job (status, id) WHERE status IN ('QUEUED','PRINTING');

-- ── โครงสร้างพื้นฐาน ─────────────────────────────────────────────
CREATE TABLE session (
    token_hash   char(64) PRIMARY KEY,
    user_id      text NOT NULL REFERENCES app_user(id),
    device_id    text,
    issued_at    timestamptz NOT NULL DEFAULT now(),
    expires_at   timestamptz NOT NULL,
    revoked_at   timestamptz,
    last_seen_at timestamptz
);
CREATE INDEX ix_session_user ON session (user_id) WHERE revoked_at IS NULL;

-- กดปุ่มรัว / retry ต้องได้ผลลัพธ์เดิม ไม่ใช่ทำงานซ้ำ
CREATE TABLE idempotency (
    key         text PRIMARY KEY,
    endpoint    text NOT NULL,
    response    jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- ป้อน SSE: client ถาม ?since=<rev> แล้วได้เฉพาะสิ่งที่เปลี่ยนหลังจากนั้น
CREATE TABLE change_log (
    id         bigserial PRIMARY KEY,
    branch_id  uuid NOT NULL,
    entity     text NOT NULL,
    entity_id  text NOT NULL,
    op         text NOT NULL CHECK (op IN ('insert','update','delete')),
    rev        bigint NOT NULL,
    at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_change_since ON change_log (branch_id, id);

-- คิวซิงก์ขึ้นคลาวด์ (transactional outbox)
-- เขียนพร้อมข้อมูลจริงในทรานแซกชันเดียว เน็ตหลุดก็แค่กองไว้ ร้านไม่สะดุด
CREATE TABLE outbox (
    id          bigserial PRIMARY KEY,
    branch_id   uuid NOT NULL,
    entity      text NOT NULL,
    entity_id   text NOT NULL,
    op          text NOT NULL,
    payload     jsonb NOT NULL,
    row_rev     bigint NOT NULL,
    attempts    integer NOT NULL DEFAULT 0,
    last_error  text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    synced_at   timestamptz
);
CREATE INDEX ix_outbox_pending ON outbox (id) WHERE synced_at IS NULL;

COMMIT;
