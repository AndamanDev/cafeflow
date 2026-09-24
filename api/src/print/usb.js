/**
 * CafeFlow — ส่งงานพิมพ์เข้าเครื่องพิมพ์ USB (§19)
 * ══════════════════════════════════════════════════════════════════
 * ใช้ได้เฉพาะเครื่องพิมพ์ที่เสียบกับ "เครื่องที่รัน API" เท่านั้น
 * เพราะเซิร์ฟเวอร์เป็นคนส่งงานพิมพ์ ไม่ใช่เบราว์เซอร์ของจอที่กดสั่ง
 *
 *   Windows  ส่งผ่าน print spooler แบบ RAW ด้วย win-raw.ps1 (winspool.drv)
 *            → ต้องลงไดรเวอร์ให้เครื่องพิมพ์ขึ้นใน "Printers & scanners" ก่อน
 *   Linux    เขียน byte ลง /dev/usb/lpN ตรง ๆ → user ที่รัน API ต้องอยู่กลุ่ม lp
 *
 * ไม่ใช้ npm package สำหรับ USB เพราะทุกตัวมี native binding ที่ต้อง build
 * ในเครื่องร้าน — พังตอนอัปเดต Node แล้วไม่มีใครซ่อมเป็น
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const IS_WIN = process.platform === 'win32';
const PS_SCRIPT = path.join(__dirname, 'win-raw.ps1');
const TIMEOUT_MS = 15000;     // spooler ช้ากว่า TCP ตรง โดยเฉพาะงานแรกหลังบูต

/** กันเขียนทับไฟล์อื่นในเครื่อง — ชื่อที่รับจากหน้าเว็บต้องเป็นอุปกรณ์เครื่องพิมพ์จริง */
function isLinuxDevice(p) {
    return /^\/dev\/(usb\/lp|lp)\d+$/.test(String(p || ''));
}

function run(cmd, args, timeoutMs) {
    return new Promise((resolve, reject) => {
        execFile(cmd, args, { timeout: timeoutMs, windowsHide: true, encoding: 'utf8' },
            (err, stdout, stderr) => {
                if (err) {
                    const msg = (stderr || '').trim() || (err.killed ? 'หมดเวลารอเครื่องพิมพ์' : err.message);
                    return reject(new Error(msg));
                }
                resolve(stdout);
            });
    });
}

/** ส่ง byte ESC/POS เข้าเครื่องพิมพ์ USB — ชื่อ (Windows) หรือ path อุปกรณ์ (Linux) */
async function sendUsb(target, buf) {
    if (!target) throw new Error('ยังไม่ได้เลือกเครื่องพิมพ์ USB');

    if (!IS_WIN) {
        if (!isLinuxDevice(target)) throw new Error('ไม่ใช่อุปกรณ์เครื่องพิมพ์: ' + target);
        await fs.promises.writeFile(target, buf);
        return true;
    }

    // ส่ง byte ผ่านไฟล์ชั่วคราว — command line ส่งข้อมูลไบนารีไม่ได้
    // ชื่อเครื่องพิมพ์ไปเป็น argument แยกของ execFile ไม่ผ่าน shell จึงไม่มีทางแทรกคำสั่ง
    const tmp = path.join(os.tmpdir(), 'cafeflow-' + crypto.randomBytes(6).toString('hex') + '.bin');
    await fs.promises.writeFile(tmp, buf);
    try {
        await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
                                     '-File', PS_SCRIPT, '-Printer', target, '-File', tmp], TIMEOUT_MS);
        return true;
    } finally {
        fs.promises.unlink(tmp).catch(() => {});
    }
}

/**
 * เครื่องพิมพ์ที่เครื่องนี้มองเห็น — ใช้เติมตัวเลือกในหน้าตั้งค่า
 * คืน [{ id, label }] โดย id คือค่าที่เก็บลง device.printer_usb
 */
async function listUsbPrinters() {
    if (!IS_WIN) {
        const out = [];
        for (const dir of ['/dev/usb', '/dev']) {
            let names = [];
            try { names = await fs.promises.readdir(dir); } catch { continue; }
            for (const n of names) {
                const p = dir + '/' + n;
                if (isLinuxDevice(p)) out.push({ id: p, label: p });
            }
        }
        return out;
    }

    const script = '[Console]::OutputEncoding=[Text.Encoding]::UTF8; ' +
        'Get-Printer | Select-Object Name,PortName,DriverName | ConvertTo-Json -Compress';
    const raw = (await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
                           TIMEOUT_MS)).trim();
    if (!raw) return [];
    let rows = JSON.parse(raw);
    if (!Array.isArray(rows)) rows = [rows];          // ConvertTo-Json คืนออบเจกต์เดี่ยวเมื่อมีตัวเดียว
    return rows.map((r) => ({
        id: r.Name,
        label: r.Name + (r.PortName ? ' · ' + r.PortName : ''),
        usb: /^USB/i.test(r.PortName || ''),
    }));
}

module.exports = { sendUsb, listUsbPrinters, isLinuxDevice };
