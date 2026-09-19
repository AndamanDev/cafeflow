/**
 * CafeFlow — อัปโหลดรูปสินค้าจากเครื่อง
 * ══════════════════════════════════════════════════════════════════
 * เป็นช่องทางที่สามของรูปสินค้า ต่อจาก "ลิงก์รูป" และ "ภาพวาดประกอบ"
 * ร้านส่วนใหญ่ถ่ายรูปด้วยมือถือแล้วไม่มีที่ฝากรูป การให้ใส่แต่ลิงก์
 * จึงแปลว่าไม่มีใครใส่รูปเลย
 *
 * ★ ย่อรูปก่อนเก็บเสมอ
 *   รูปจากมือถือใบละ 3–8 MB · การ์ดบนคีออสก์ใช้จริงไม่เกิน ~600px
 *   ถ้าเก็บของเดิมไว้ คีออสก์ที่โหลดการ์ด 16 ใบจะดึงข้อมูลเป็นสิบเมกะไบต์
 *   ทุกครั้งที่เปลี่ยนหมวด — ช้าจนลูกค้าเดินหนี
 *
 * ★ ตั้งชื่อไฟล์ด้วย sha256 ของเนื้อไฟล์ (content-addressed)
 *   อัปรูปเดิมซ้ำจึงไม่กินที่เพิ่ม และ cache ได้ตลอดกาลเพราะเนื้อไม่มีวันเปลี่ยน
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const { ApiError } = require('./orders');

const MAX_BYTES = 12 * 1024 * 1024;     // รูปจากมือถือรุ่นใหม่ใหญ่ได้ถึงราว 10 MB
const MAX_EDGE = 720;                   // ด้านยาวสุดหลังย่อ — พอสำหรับการ์ดและ hero
const QUALITY = 0.82;

const ALLOWED = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg',
    'image/png': 'png', 'image/webp': 'webp',
};

/** ตรวจชนิดไฟล์จาก "เนื้อไฟล์" ไม่ใช่จากนามสกุลหรือ header ที่ client บอกมา */
function sniff(buf) {
    if (buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
    if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png';
    if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF'
        && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
    return null;
}

/**
 * ย่อให้ด้านยาวสุดไม่เกิน MAX_EDGE แล้วเข้ารหัสใหม่
 * ไม่ขยายรูปที่เล็กอยู่แล้ว — ขยายแล้วได้แค่ไฟล์ใหญ่ขึ้นโดยไม่ชัดขึ้น
 */
async function shrink(buf) {
    // ⚠️ ต้องใช้ loadImage() เท่านั้น
    //    `new Image(); img.src = buffer` คืนขนาดภาพถูกต้องก็จริง แต่ drawImage()
    //    จะไม่วาดอะไรเลย ได้ไฟล์เปล่าที่ "ดูเหมือนสำเร็จ" ทุกอย่าง — ทั้ง HTTP 200
    //    ทั้งขนาดไฟล์ดูสมเหตุสมผล เจอได้ก็ต่อเมื่อเปิดรูปที่เก็บไว้มาดูจริง
    let img;
    try {
        img = await loadImage(buf);
    } catch {
        throw new ApiError(400, 'อ่านไฟล์รูปไม่ได้ — ไฟล์อาจเสียหาย');
    }
    if (!img.width || !img.height) throw new ApiError(400, 'อ่านไฟล์รูปไม่ได้');

    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));

    const canvas = createCanvas(w, h);
    const c = canvas.getContext('2d');
    // รูปโปร่งใส (PNG) ต้องมีพื้นขาว ไม่งั้นกลายเป็นดำบนการ์ดที่พื้นอ่อน
    c.fillStyle = '#fff';
    c.fillRect(0, 0, w, h);
    c.drawImage(img, 0, 0, w, h);

    const data = await canvas.encode('webp', Math.round(QUALITY * 100));

    // ด่านกันไฟล์เปล่า — เราเทสีขาวทับก่อนวาดเสมอ ผลลัพธ์จึงต้องทึบ 100%
    // ถ้าโปร่งใสแปลว่าไม่มีอะไรถูกวาดลงไปเลย (บั๊กที่ "ดูเหมือนสำเร็จ" ทุกอย่าง)
    const back = await loadImage(data);
    const probe = createCanvas(back.width, back.height);
    probe.getContext('2d').drawImage(back, 0, 0);
    const px = probe.getContext('2d').getImageData(0, 0, back.width, back.height).data;
    let opaque = 0;
    for (let i = 3; i < px.length; i += 4 * 97) { if (px[i] === 255) opaque++; }
    const sampled = Math.ceil(px.length / (4 * 97));
    if (opaque < sampled * 0.9) {
        throw new ApiError(500, 'ย่อรูปแล้วได้ไฟล์เปล่า — ไม่บันทึก');
    }

    return { data, width: w, height: h, ext: 'webp', srcW: img.width, srcH: img.height };
}

function mediaDir(root) {
    const dir = path.join(root, 'data', 'media', 'products');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function registerMedia(app, deps) {
    const { branchId, root } = deps;
    const { context, requirePerm, handle } = deps.helpers;

    app.post('/api/media/upload', handle(async (req) => {
        const ctx = await context(req);
        requirePerm(ctx, 'MENU_EDIT');

        const file = await req.file({ limits: { fileSize: MAX_BYTES, files: 1 } });
        if (!file) throw new ApiError(400, 'ไม่พบไฟล์ที่อัปโหลด');

        let buf;
        try {
            buf = await file.toBuffer();
        } catch (err) {
            if (err.code === 'FST_REQ_FILE_TOO_LARGE') {
                throw new ApiError(413, `ไฟล์ใหญ่เกิน ${Math.round(MAX_BYTES / 1024 / 1024)} MB`);
            }
            throw err;
        }
        if (!buf || !buf.length) throw new ApiError(400, 'ไฟล์ว่าง');

        const kind = sniff(buf);
        if (!kind || !ALLOWED[kind]) {
            throw new ApiError(415, 'รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP');
        }

        const out = await shrink(buf);
        const sha = crypto.createHash('sha256').update(out.data).digest('hex').slice(0, 32);
        const name = `${sha}.${out.ext}`;
        const dest = path.join(mediaDir(root), name);
        if (!fs.existsSync(dest)) fs.writeFileSync(dest, out.data);

        req.log.info(`[media] ${file.filename} ${buf.length}B ${out.srcW}×${out.srcH}` +
                     ` → ${out.data.length}B ${out.width}×${out.height}`);

        return {
            url: '/media/products/' + name,
            width: out.width, height: out.height,
            bytes: out.data.length, originalBytes: buf.length,
        };
    }));

    /**
     * ลบรูปที่ไม่มีสินค้าใดใช้แล้ว — เรียกเองเมื่อต้องการคืนพื้นที่
     * ไม่ลบอัตโนมัติตอนแก้สินค้า เพราะรูปเดียวกันอาจถูกใช้หลายสินค้า
     * (ชื่อไฟล์เป็น hash ของเนื้อ รูปเดิมซ้ำจึงเป็นไฟล์เดียวกัน)
     */
    app.post('/api/media/gc', handle(async (req) => {
        const ctx = await context(req);
        requirePerm(ctx, 'MENU_EDIT');

        const used = new Set((await deps.query(
            `SELECT image_url FROM product
              WHERE branch_id = $1 AND image_url LIKE '/media/products/%'`,
            [branchId()])).rows.map((r) => path.basename(r.image_url)));

        const dir = mediaDir(root);
        let removed = 0, kept = 0, freed = 0;
        for (const f of fs.readdirSync(dir)) {
            if (used.has(f)) { kept++; continue; }
            const st = fs.statSync(path.join(dir, f));
            // เว้นไฟล์ที่เพิ่งอัปไว้ — อาจกำลังกรอกฟอร์มค้างอยู่ยังไม่ได้กดบันทึก
            if (Date.now() - st.mtimeMs < 3600 * 1000) { kept++; continue; }
            freed += st.size;
            fs.unlinkSync(path.join(dir, f));
            removed++;
        }
        return { removed, kept, freedKB: Math.round(freed / 1024) };
    }));
}

module.exports = { registerMedia, shrink, sniff, mediaDir, MAX_BYTES, MAX_EDGE };
