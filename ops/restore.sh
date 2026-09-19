#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════
# CafeFlow — กู้คืนฐานข้อมูล
#
#   ops/restore.sh                     กู้จากไฟล์ล่าสุดใน backup/
#   ops/restore.sh backup/xxx.dump     กู้จากไฟล์ที่ระบุ
#   ops/restore.sh --yes               ไม่ต้องถามยืนยัน (ใช้ในสคริปต์อัตโนมัติ)
#
# ⚠️ คำสั่งนี้ "ลบข้อมูลปัจจุบันทิ้งทั้งหมด" แล้วเขียนทับด้วยไฟล์สำรอง
#    ใช้ตอนเครื่องพัง ย้ายเครื่อง หรือซ้อมกู้เท่านั้น
# ══════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CONTAINER="${CF_DB_CONTAINER:-cafeflow-db}"
DB="${PGDATABASE:-cafeflow}"
USER="${PGUSER:-cafeflow}"
OUT_DIR="${CF_BACKUP_DIR:-$ROOT/backup}"

FILE=""
ASSUME_YES=0
for arg in "$@"; do
    case "$arg" in
        --yes|-y) ASSUME_YES=1 ;;
        *) FILE="$arg" ;;
    esac
done

if [ -z "$FILE" ]; then
    FILE="$(ls -1t "$OUT_DIR"/cafeflow-*.dump 2>/dev/null | head -1 || true)"
fi
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
    echo "!! ไม่พบไฟล์สำรอง — ระบุไฟล์เอง หรือรัน ops/backup.sh ก่อน" >&2
    exit 1
fi

echo "จะกู้จาก: $FILE"
[ -f "$FILE.counts" ] && { echo "   ไฟล์นี้บันทึกไว้ว่ามี:"; sed 's/^/     /' "$FILE.counts"; }

# รอฐานข้อมูลพร้อม — เครื่องเพิ่งบูตอาจยังไม่ขึ้น
for i in $(seq 1 60); do
    if docker exec "$CONTAINER" pg_isready -U "$USER" -d postgres > /dev/null 2>&1; then break; fi
    [ "$i" = 60 ] && { echo "!! ฐานข้อมูลไม่พร้อมภายใน 60 วินาที" >&2; exit 1; }
    sleep 1
done

if [ "$ASSUME_YES" != 1 ]; then
    echo
    echo "!! ข้อมูลปัจจุบันในฐาน '$DB' จะถูกลบทิ้งทั้งหมด"
    printf "พิมพ์ YES เพื่อยืนยัน: "
    read -r ans
    [ "$ans" = "YES" ] || { echo "ยกเลิก"; exit 1; }
fi

echo "กำลังกู้..."
# ตัดการเชื่อมต่อค้างก่อน ไม่งั้น DROP SCHEMA จะรอไม่รู้จบเมื่อ API ยังต่ออยู่
docker exec "$CONTAINER" psql -U "$USER" -d postgres -q -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity
      WHERE datname = '$DB' AND pid <> pg_backend_pid();" > /dev/null

docker exec "$CONTAINER" psql -U "$USER" -d "$DB" -q -c \
    "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" > /dev/null

# pg_restore เตือนเรื่อง owner/acl เป็นปกติเพราะ dump ถูกสร้างด้วย --no-owner
docker exec -i "$CONTAINER" pg_restore -U "$USER" -d "$DB" --no-owner --no-acl \
    < "$FILE" > /tmp/cf-restore.log 2>&1 || true

AFTER="/tmp/cf-restore-counts"
docker exec "$CONTAINER" psql -U "$USER" -d "$DB" -t -A -F',' -c "
SELECT 'cf_order', count(*) FROM cf_order
UNION ALL SELECT 'order_item', count(*) FROM order_item
UNION ALL SELECT 'payment', count(*) FROM payment
UNION ALL SELECT 'product', count(*) FROM product
UNION ALL SELECT 'product_price', count(*) FROM product_price
UNION ALL SELECT 'shift', count(*) FROM shift
UNION ALL SELECT 'audit_log', count(*) FROM audit_log
ORDER BY 1;" > "$AFTER"

echo "   กู้แล้วมี:"
sed 's/^/     /' "$AFTER"

if [ -f "$FILE.counts" ]; then
    if diff -q "$FILE.counts" "$AFTER" > /dev/null; then
        echo "   ✓ ตรงกับตอนสำรองทุกตาราง"
    else
        echo "!! ไม่ตรงกับตอนสำรอง:" >&2
        diff "$FILE.counts" "$AFTER" >&2 || true
        echo "   ดูรายละเอียดที่ /tmp/cf-restore.log" >&2
        exit 1
    fi
fi

echo
echo "กู้เสร็จแล้ว — สตาร์ท API ใหม่ด้วย: cd api && npm start"
