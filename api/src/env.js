/**
 * อ่าน .env ที่รากโปรเจกต์
 * เขียนเองสิบบรรทัดแทนการลง dotenv — ลด dependency ที่ต้องดูแลในระบบที่รันในร้าน
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function loadEnv(file) {
    const p = file || path.join(ROOT, '.env');
    if (!fs.existsSync(p)) return false;
    for (const raw of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const i = line.indexOf('=');
        if (i < 1) continue;
        const key = line.slice(0, i).trim();
        let val = line.slice(i + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
        // ค่าที่ตั้งมาจากภายนอก (docker/systemd) ต้องชนะไฟล์ .env เสมอ
        if (process.env[key] === undefined) process.env[key] = val;
    }
    return true;
}

module.exports = { loadEnv, ROOT };
