#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════
# CafeFlow — สำรองฐานข้อมูล
#
# ใช้ pg_dump "จากใน container" เสมอ เพื่อให้เวอร์ชันของ pg_dump ตรงกับ
# เวอร์ชันของเซิร์ฟเวอร์เป๊ะ — pg_dump รุ่นเก่ากว่าฐานจะปฏิเสธงานทันที
# และเป็นสาเหตุที่สคริปต์สำรองพังหลังอัปเกรด Postgres บ่อยที่สุด
#
#   ops/backup.sh                สำรองหนึ่งครั้ง
#   ops/backup.sh --verify       สำรองแล้วกู้ลงฐานชั่วคราวเพื่อพิสูจน์ว่าไฟล์ใช้ได้
#
# ⚠️ ไฟล์สำรองที่ไม่เคยถูกกู้ ไม่นับว่าเป็นไฟล์สำรอง
#    --verify จึงควรรันอย่างน้อยวันละครั้ง ไม่ใช่แค่ตอนติดตั้ง
# ══════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CONTAINER="${CF_DB_CONTAINER:-cafeflow-db}"
DB="${PGDATABASE:-cafeflow}"
USER="${PGUSER:-cafeflow}"
OUT_DIR="${CF_BACKUP_DIR:-$ROOT/backup}"
KEEP_DAYS="${CF_BACKUP_KEEP_DAYS:-14}"

mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$OUT_DIR/cafeflow-$STAMP.dump"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    echo "!! ไม่พบ container '$CONTAINER' ที่กำลังทำงาน" >&2
    exit 1
fi

echo "กำลังสำรอง $DB → $(basename "$FILE")"
# -Fc = custom format: บีบอัดในตัว กู้ทีละตารางได้ และกู้ขนานได้
docker exec "$CONTAINER" pg_dump -U "$USER" -d "$DB" -Fc --no-owner --no-acl \
    > "$FILE"

SIZE=$(wc -c < "$FILE")
if [ "$SIZE" -lt 4096 ]; then
    echo "!! ไฟล์เล็กผิดปกติ ($SIZE ไบต์) — น่าจะสำรองไม่สำเร็จ" >&2
    rm -f "$FILE"
    exit 1
fi

# บันทึกจำนวนแถวไว้ข้าง ๆ เพื่อใช้เทียบตอนกู้ ว่าได้ข้อมูลกลับมาครบจริง
docker exec "$CONTAINER" psql -U "$USER" -d "$DB" -t -A -F',' -c "
SELECT 'cf_order', count(*) FROM cf_order
UNION ALL SELECT 'order_item', count(*) FROM order_item
UNION ALL SELECT 'payment', count(*) FROM payment
UNION ALL SELECT 'product', count(*) FROM product
UNION ALL SELECT 'product_price', count(*) FROM product_price
UNION ALL SELECT 'shift', count(*) FROM shift
UNION ALL SELECT 'audit_log', count(*) FROM audit_log
ORDER BY 1;" > "$FILE.counts"

echo "   ขนาด $(( SIZE / 1024 )) KB · จำนวนแถว:"
sed 's/^/     /' "$FILE.counts"

# ── ลบไฟล์เก่า ──
find "$OUT_DIR" -name 'cafeflow-*.dump' -mtime "+$KEEP_DAYS" -print -delete 2>/dev/null \
    | sed 's/^/   ลบไฟล์เก่า /' || true

# ── พิสูจน์ว่าไฟล์กู้ได้จริง ──
if [ "${1:-}" = "--verify" ]; then
    SCRATCH="cafeflow_verify_$$"
    echo "   ตรวจสอบด้วยการกู้ลงฐานชั่วคราว $SCRATCH"
    docker exec "$CONTAINER" psql -U "$USER" -d postgres -q -c "CREATE DATABASE $SCRATCH;"
    # ทิ้งฐานชั่วคราวเสมอ แม้สคริปต์จะล้มกลางคัน
    trap 'docker exec "$CONTAINER" psql -U "$USER" -d postgres -q -c "DROP DATABASE IF EXISTS $SCRATCH;" >/dev/null 2>&1 || true' EXIT

    docker exec -i "$CONTAINER" pg_restore -U "$USER" -d "$SCRATCH" --no-owner --no-acl \
        < "$FILE" > /dev/null 2>&1 || true   # pg_restore เตือนเรื่อง owner เป็นปกติ

    docker exec "$CONTAINER" psql -U "$USER" -d "$SCRATCH" -t -A -F',' -c "
    SELECT 'cf_order', count(*) FROM cf_order
    UNION ALL SELECT 'order_item', count(*) FROM order_item
    UNION ALL SELECT 'payment', count(*) FROM payment
    UNION ALL SELECT 'product', count(*) FROM product
    UNION ALL SELECT 'product_price', count(*) FROM product_price
    UNION ALL SELECT 'shift', count(*) FROM shift
    UNION ALL SELECT 'audit_log', count(*) FROM audit_log
    ORDER BY 1;" > "$FILE.verified"

    if diff -q "$FILE.counts" "$FILE.verified" > /dev/null; then
        echo "   ✓ กู้แล้วจำนวนแถวตรงกันทุกตาราง — ไฟล์นี้ใช้ได้จริง"
        rm -f "$FILE.verified"
    else
        echo "!! กู้แล้วข้อมูลไม่ตรง:" >&2
        diff "$FILE.counts" "$FILE.verified" >&2 || true
        exit 1
    fi
fi

echo "เสร็จ: $FILE"
