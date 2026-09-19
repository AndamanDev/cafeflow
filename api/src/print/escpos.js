/**
 * CafeFlow — คำสั่ง ESC/POS
 * ══════════════════════════════════════════════════════════════════
 * ★ เราส่งข้อความไทยเป็น "ภาพ" ไม่ใช่ตัวอักษร
 *
 * เหตุผล: โหมดตัวอักษรของเครื่องพิมพ์ความร้อนต้องเลือก code page ให้ตรงรุ่น
 * (TIS-620 / CP874 / รหัสเฉพาะของผู้ผลิต) และสระบน-ล่างกับวรรณยุกต์ที่ซ้อนกัน
 * มักออกมาเพี้ยนหรือกินที่ผิดบรรทัด ต่างกันทุกยี่ห้อ ทุกรุ่น
 *
 * การส่งเป็นบิตแมปได้ผลเหมือนกันทุกเครื่อง 100% แลกกับช้าลงราว 1 วินาทีต่อใบ
 * ซึ่งยอมรับได้ และยังได้โลโก้ ฟอนต์สวย และคุม layout ได้เต็มที่เป็นของแถม
 */
'use strict';

const ESC = 0x1B, GS = 0x1D;

/** เริ่มงานใหม่ — ล้างค่าที่ค้างจากงานก่อน */
const init = () => Buffer.from([ESC, 0x40]);

/** เลื่อนกระดาษ n บรรทัด (ก่อนตัดต้องเลื่อนพอให้พ้นใบมีด) */
const feed = (n) => Buffer.from([ESC, 0x64, Math.max(0, Math.min(255, n))]);

/** ตัดกระดาษแบบเหลือติ่ง — ดึงขาดง่ายกว่าตัดขาดและกระดาษไม่ร่วงลงพื้น */
const cut = () => Buffer.from([GS, 0x56, 66, 0x00]);

/** เปิดลิ้นชักเก็บเงิน (§27) — พัลส์ที่ขา 2 */
const kickDrawer = () => Buffer.from([ESC, 0x70, 0x00, 25, 250]);

/**
 * ส่งบิตแมป 1 บิต — GS v 0
 *   bits  = Buffer ที่ 1 บิต = 1 จุด (1 = ดำ) เรียงซ้ายไปขวา บนลงล่าง
 *   width = ความกว้างเป็นจุด ต้องหารด้วย 8 ลงตัว
 *
 * ⚠️ เครื่องพิมพ์หลายรุ่นมีลิมิตความสูงต่อคำสั่ง จึงซอยเป็นแถบละ 255 จุด
 *    ถ้าส่งรวดเดียวยาว ๆ บางรุ่นพิมพ์ครึ่งใบแล้วหยุดเฉย ๆ โดยไม่แจ้ง error
 */
function raster(bits, width, height, bandHeight = 255) {
    const bytesPerRow = width / 8;
    if (!Number.isInteger(bytesPerRow)) {
        throw new Error('ความกว้างของบิตแมปต้องหารด้วย 8 ลงตัว: ' + width);
    }
    const out = [];
    for (let y0 = 0; y0 < height; y0 += bandHeight) {
        const h = Math.min(bandHeight, height - y0);
        const slice = bits.subarray(y0 * bytesPerRow, (y0 + h) * bytesPerRow);
        out.push(Buffer.from([
            GS, 0x76, 0x30, 0x00,
            bytesPerRow & 0xFF, (bytesPerRow >> 8) & 0xFF,
            h & 0xFF, (h >> 8) & 0xFF,
        ]), slice);
    }
    return Buffer.concat(out);
}

/** ประกอบงานพิมพ์หนึ่งใบให้พร้อมส่งเข้าเครื่อง */
function document({ bitmap, width, height, openDrawer = false, feedLines = 4 }) {
    const parts = [init(), raster(bitmap, width, height), feed(feedLines)];
    if (openDrawer) parts.push(kickDrawer());
    parts.push(cut());
    return Buffer.concat(parts);
}

module.exports = { init, feed, cut, kickDrawer, raster, document };
