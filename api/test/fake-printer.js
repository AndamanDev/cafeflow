/**
 * เครื่องพิมพ์จำลอง — รับ byte ทาง TCP 9100 แล้วถอด raster กลับเป็นภาพ
 *
 * มีไว้เพื่อ "ดูว่ากระดาษจะออกมาหน้าตาแบบไหน" โดยไม่ต้องมีเครื่องจริง
 * ตรวจได้ทั้งความถูกต้องของคำสั่ง ESC/POS และการจัดหน้าภาษาไทย
 *
 *   node test/fake-printer.js 9100 out/
 */
'use strict';
const net = require('net');
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');

/** ถอดคำสั่ง ESC/POS กลับเป็นรายการที่อ่านออก + ภาพ */
function decode(buf) {
    const cmds = [];
    const bands = [];
    let i = 0;
    while (i < buf.length) {
        const b = buf[i];
        if (b === 0x1B && buf[i + 1] === 0x40) { cmds.push('ESC @ (init)'); i += 2; continue; }
        if (b === 0x1B && buf[i + 1] === 0x64) { cmds.push(`ESC d ${buf[i + 2]} (feed)`); i += 3; continue; }
        if (b === 0x1B && buf[i + 1] === 0x70) { cmds.push('ESC p (เปิดลิ้นชัก)'); i += 5; continue; }
        if (b === 0x1D && buf[i + 1] === 0x56) { cmds.push('GS V (ตัดกระดาษ)'); i += 4; continue; }
        if (b === 0x1D && buf[i + 1] === 0x76 && buf[i + 2] === 0x30) {
            const bytesPerRow = buf[i + 4] | (buf[i + 5] << 8);
            const h = buf[i + 6] | (buf[i + 7] << 8);
            const start = i + 8;
            const len = bytesPerRow * h;
            bands.push({ bytesPerRow, h, data: buf.subarray(start, start + len) });
            cmds.push(`GS v 0 (raster ${bytesPerRow * 8}×${h})`);
            i = start + len;
            continue;
        }
        cmds.push(`?? 0x${b.toString(16)}`);
        i++;
    }
    return { cmds, bands };
}

/** ประกอบแถบ raster ทั้งหมดกลับเป็นภาพเดียว */
function toPng(bands) {
    if (!bands.length) return null;
    const width = bands[0].bytesPerRow * 8;
    const height = bands.reduce((s, b) => s + b.h, 0);
    const canvas = createCanvas(width, height);
    const c = canvas.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, width, height);
    const img = c.getImageData(0, 0, width, height);

    let row = 0;
    for (const band of bands) {
        for (let y = 0; y < band.h; y++, row++) {
            for (let x = 0; x < width; x++) {
                const bit = band.data[y * band.bytesPerRow + (x >> 3)] & (0x80 >> (x & 7));
                if (bit) {
                    const o = (row * width + x) * 4;
                    img.data[o] = img.data[o + 1] = img.data[o + 2] = 0;
                    img.data[o + 3] = 255;
                }
            }
        }
    }
    c.putImageData(img, 0, 0);
    return canvas.toBuffer('image/png');
}

function start(port = 9100, outDir = 'out', label = 'printer') {
    fs.mkdirSync(outDir, { recursive: true });
    let n = 0;
    const server = net.createServer((sock) => {
        const chunks = [];
        sock.on('data', (d) => chunks.push(d));
        sock.on('end', () => {
            const buf = Buffer.concat(chunks);
            const { cmds, bands } = decode(buf);
            const png = toPng(bands);
            const file = path.join(outDir, `${label}-${++n}.png`);
            if (png) fs.writeFileSync(file, png);
            console.log(`[${label}] รับ ${buf.length} ไบต์ · ${cmds.join(' | ')}` +
                        (png ? ` → ${file}` : ''));
        });
    });
    server.listen(port, '127.0.0.1', () => console.log(`[${label}] ฟังอยู่ที่ 127.0.0.1:${port}`));
    return server;
}

if (require.main === module) {
    start(parseInt(process.argv[2] || '9100', 10), process.argv[3] || 'out',
          process.argv[4] || 'printer');
}

module.exports = { start, decode, toPng };
