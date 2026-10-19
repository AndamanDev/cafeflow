/**
 * CafeFlow — สรุปผลวัดตัวอ่านสลิป (ops\tools\bench-ocr.bat เรียก)
 *   node compare.js <paddle.json> <openvino.json>
 * เวลา + ค่าที่อ่านได้ (ยอด · วันเวลา · บัญชีผู้รับ) ด้วยกฎตัวจริง shared/cf-slip-rules.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { CFSlipRules } = require(path.join(__dirname, '..', '..', 'shared', 'cf-slip-rules.js'));

const load = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const [P, O] = process.argv.slice(2).map(load);
const ev = (l) => {
    const d = CFSlipRules.findDate(l), rv = CFSlipRules.findParties(l).receiver;
    return { amount: CFSlipRules.findAmount(l), date: d ? `${d.d}/${d.m}/${d.y} ${d.hh}:${d.mm}` : null, tail: (rv && rv.tail) || null };
};
const stat = (j) => {
    const ms = j.rows.map((r) => r.ms);
    return { avg: ms.reduce((a, b) => a + b, 0) / ms.length / 1000, min: Math.min(...ms) / 1000, max: Math.max(...ms) / 1000 };
};

console.log('\n  ==================== ผลวัดตัวอ่านสลิป ====================\n');
if (!P) { console.log('  ไม่มีผลของตัวปัจจุบัน (paddle)'); process.exit(1); }
const p = stat(P);
console.log(`  ภาพสลิป ${P.rows.length} ใบ\n`);
console.log('                      เฉลี่ย     เร็วสุด    ช้าสุด');
console.log(`  ตัวปัจจุบัน (Paddle)  ${p.avg.toFixed(2)} วิ   ${p.min.toFixed(2)}     ${p.max.toFixed(2)}`);
if (!O) { console.log('\n  ไม่มีผลของ OpenVINO — ติดตั้งไม่สำเร็จ ดูข้อความด้านบน'); process.exit(0); }
const o = stat(O);
console.log(`  OpenVINO            ${o.avg.toFixed(2)} วิ   ${o.min.toFixed(2)}     ${o.max.toFixed(2)}`);
const faster = Math.round((1 - o.avg / p.avg) * 100);
console.log(`\n  OpenVINO ${faster >= 0 ? 'เร็วกว่า ' + faster : 'ช้ากว่า ' + -faster}%`);

const byFile = new Map(O.rows.map((r) => [r.file, r]));
let same = 0;
const diffs = [];
for (const r of P.rows) {
    const a = ev(r.lines), b = ev(byFile.get(r.file).lines);
    if (a.amount === b.amount && a.date === b.date && a.tail === b.tail) same++;
    else diffs.push(`    ${path.basename(r.file).slice(0, 16)}  Paddle ${a.amount} | ${a.date} | ${a.tail}\n                      OpenVINO ${b.amount} | ${b.date} | ${b.tail}`);
}
console.log(`  อ่านค่า (ยอด/วันที่/บัญชีผู้รับ) ตรงกัน ${same}/${P.rows.length} ใบ`);
if (diffs.length) console.log('\n  ใบที่อ่านต่างกัน:\n' + diffs.join('\n'));
console.log('\n  >> ถ่ายรูปหน้าจอนี้ส่งให้ช่าง\n');
