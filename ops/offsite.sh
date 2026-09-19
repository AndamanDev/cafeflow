#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════
# CafeFlow — คัดลอกไฟล์สำรองออกนอกเครื่อง
#
# ไฟล์สำรองที่อยู่ในเครื่องเดียวกับฐานข้อมูล ช่วยตอน "ลบข้อมูลผิด" ได้
# แต่ช่วยตอน "ไฟไหม้ / เครื่องหาย / SSD พัง" ไม่ได้เลย
#
#   ops/offsite.sh /d/cafeflow-backup        คัดลอกไป USB หรือ NAS ที่ mount ไว้
#   ops/offsite.sh rclone:gdrive:cafeflow    คัดลอกขึ้นคลาวด์ผ่าน rclone
#   ops/offsite.sh --check /d/cafeflow-backup  ตรวจว่าปลายทางมีครบและไฟล์ไม่เพี้ยน
#
# ตั้งค่าไว้ล่วงหน้าได้ที่ CF_OFFSITE ใน .env แล้วเรียกเปล่า ๆ
#
# ★ ตรวจ checksum ที่ปลายทางเสมอ — การคัดลอกที่ "ดูเหมือนสำเร็จ" แต่ไฟล์เสีย
#   เกิดได้จริงกับ USB ที่ใกล้พัง และจะรู้ตัวก็ตอนต้องใช้ ซึ่งสายไปแล้ว
# ══════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
[ -f .env ] && set -a && . ./.env && set +a || true

SRC_DIR="${CF_BACKUP_DIR:-$ROOT/backup}"
KEEP="${CF_OFFSITE_KEEP:-30}"

CHECK_ONLY=0
DEST=""
for arg in "$@"; do
    case "$arg" in
        --check) CHECK_ONLY=1 ;;
        *) DEST="$arg" ;;
    esac
done
[ -z "$DEST" ] && DEST="${CF_OFFSITE:-}"

if [ -z "$DEST" ]; then
    cat >&2 <<'MSG'
!! ยังไม่ได้ระบุปลายทาง

   ops/offsite.sh /d/cafeflow-backup          USB หรือ NAS
   ops/offsite.sh rclone:gdrive:cafeflow      คลาวด์ผ่าน rclone

   หรือใส่ CF_OFFSITE=... ไว้ใน .env แล้วเรียกเปล่า ๆ
MSG
    exit 2
fi

files() { ls -1t "$SRC_DIR"/cafeflow-*.dump 2>/dev/null || true; }
[ -z "$(files)" ] && { echo "!! ไม่มีไฟล์สำรองใน $SRC_DIR — รัน ops/backup.sh ก่อน" >&2; exit 1; }

sum_of() {
    if command -v sha256sum > /dev/null; then sha256sum "$1" | cut -d' ' -f1
    else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

# ══════════════════════════════════════════════════════════════════
if [[ "$DEST" == rclone:* ]]; then
    REMOTE="${DEST#rclone:}"
    command -v rclone > /dev/null || { echo "!! ไม่พบคำสั่ง rclone" >&2; exit 1; }

    if [ "$CHECK_ONLY" = 1 ]; then
        echo "ตรวจปลายทาง $REMOTE"
        # rclone check เทียบ checksum ให้เอง ไม่ใช่แค่เทียบขนาดไฟล์
        rclone check "$SRC_DIR" "$REMOTE" --include 'cafeflow-*.dump*' --one-way
        echo "   ✓ ปลายทางมีครบและตรงกับต้นทาง"
        exit 0
    fi

    echo "คัดลอกขึ้น $REMOTE"
    rclone copy "$SRC_DIR" "$REMOTE" --include 'cafeflow-*.dump*' --progress
    rclone check "$SRC_DIR" "$REMOTE" --include 'cafeflow-*.dump*' --one-way
    echo "   ✓ ตรวจแล้วตรงกับต้นทาง"
    rclone delete "$REMOTE" --include 'cafeflow-*.dump*' --min-age "${KEEP}d" || true
    exit 0
fi

# ── ปลายทางเป็นโฟลเดอร์ (USB / NAS ที่ mount ไว้) ────────────────
if [ ! -d "$DEST" ]; then
    # สร้างให้ก็ต่อเมื่อ "โฟลเดอร์แม่" มีอยู่ — ถ้าไม่มี แปลว่า USB ยังไม่ได้เสียบ
    # การสร้างโฟลเดอร์ใหม่บนดิสก์ในเครื่องแล้วคัดลอกลงไป จะได้สำเนาที่อยู่ในเครื่อง
    # เดียวกันโดยที่คนสั่งนึกว่าออกไปข้างนอกแล้ว ซึ่งอันตรายกว่าไม่มีสำเนา
    parent="$(dirname "$DEST")"
    if [ ! -d "$parent" ]; then
        echo "!! ไม่พบ $parent — เสียบ USB หรือ mount ปลายทางก่อน" >&2
        exit 1
    fi
    mkdir -p "$DEST"
fi

if [ "$CHECK_ONLY" = 1 ]; then
    echo "ตรวจปลายทาง $DEST"
    bad=0; n=0
    while IFS= read -r f; do
        [ -z "$f" ] && continue
        b="$(basename "$f")"
        n=$((n + 1))
        if [ ! -f "$DEST/$b" ]; then echo "   ✗ ขาด $b"; bad=$((bad + 1)); continue; fi
        if [ "$(sum_of "$f")" != "$(sum_of "$DEST/$b")" ]; then
            echo "   ✗ ไฟล์เพี้ยน $b"; bad=$((bad + 1))
        fi
    done <<< "$(files)"
    echo "   ตรวจ $n ไฟล์ · ผิดพลาด $bad"
    [ "$bad" -gt 0 ] && exit 1
    echo "   ✓ ปลายทางมีครบและตรงกับต้นทาง"
    exit 0
fi

echo "คัดลอกไป $DEST"
copied=0; skipped=0
while IFS= read -r f; do
    [ -z "$f" ] && continue
    b="$(basename "$f")"
    if [ -f "$DEST/$b" ] && [ "$(sum_of "$f")" = "$(sum_of "$DEST/$b")" ]; then
        skipped=$((skipped + 1)); continue
    fi
    # เขียนเป็นไฟล์ชั่วคราวก่อนแล้วค่อยเปลี่ยนชื่อ — ถ้าถอด USB กลางคัน
    # จะเหลือไฟล์ .part ที่เห็นชัดว่าไม่สมบูรณ์ แทนที่จะเป็นไฟล์ชื่อถูกแต่ข้างในขาด
    cp "$f" "$DEST/$b.part"
    [ -f "$f.counts" ] && cp "$f.counts" "$DEST/$b.counts"
    if [ "$(sum_of "$f")" != "$(sum_of "$DEST/$b.part")" ]; then
        rm -f "$DEST/$b.part"
        echo "!! คัดลอก $b แล้วไฟล์ไม่ตรง — ปลายทางอาจมีปัญหา" >&2
        exit 1
    fi
    mv "$DEST/$b.part" "$DEST/$b"
    copied=$((copied + 1))
    echo "   ✓ $b"
done <<< "$(files)"

echo "   คัดลอกใหม่ $copied ไฟล์ · มีอยู่แล้ว $skipped ไฟล์"

# ลบของเก่าที่ปลายทาง
old=$(find "$DEST" -name 'cafeflow-*.dump' -mtime "+$KEEP" -print -delete 2>/dev/null | wc -l || echo 0)
[ "$old" -gt 0 ] && echo "   ลบไฟล์เก่าที่ปลายทาง $old ไฟล์"

echo "เสร็จ — ปลายทางมี $(ls -1 "$DEST"/cafeflow-*.dump 2>/dev/null | wc -l) ไฟล์"
