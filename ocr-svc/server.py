"""
CafeFlow — ตัวอ่านสลิป (OCR) รันในเครื่องเซิร์ฟเวอร์ร้าน ไม่ใช้เน็ต
══════════════════════════════════════════════════════════════════
แยกเป็นโปรแกรม Python ต่างหาก เพราะ OCR ที่อ่านภาพถ่ายจอมือถือได้จริง (PaddleOCR)
มีแต่ฝั่ง Python — ลองแล้ว Tesseract/EasyOCR อ่านยอดเงินจากภาพกล้องคีออสก์ไม่ได้

หน้าที่มีอย่างเดียว: รับ path ของภาพ → คืนบรรทัดข้อความที่อ่านได้
การตีความ (ยอดเงิน · วันที่ · ตรงกับออเดอร์ไหม) อยู่ที่ shared/cf-slip-rules.js ฝั่ง Node
จะได้แก้กฎได้โดยไม่ต้องแตะโปรแกรมนี้

    POST /ocr   {"path": "D:/cafeflow/data/slips/2026-09/<sha>.jpg", "flip": false}
             → {"lines": [{"text": "135.00", "score": 0.99}, ...], "ms": 1000, "engine": "openvino"}
    GET  /health → {"ok": true, "engine": "openvino" | "paddleocr"}

ตัวรันมีสองแบบ — โมเดลเดียวกัน ค่าที่อ่านได้เท่ากัน (CF_OCR_ENGINE · ops/run-cafeflow.ps1 เลือกให้):
    openvino  ตัวเร่งของ Intel ผ่าน ov_engine.py · venv แยก .venv-ov (setup-openvino.bat)
              วัด i3-6100U ของร้าน 12/10/2569: ~1.0 วิ/ใบ · ตรงกับ paddle 15/15 ใบ
    paddle    PaddleOCR + mkldnn · venv .venv (setup.bat) · i3 เดียวกัน ~3.3 วิ/ใบ — ตัวสำรอง

ฟังเฉพาะ 127.0.0.1 — มีแต่เซิร์ฟเวอร์ Node ในเครื่องเดียวกันที่เรียก
อ่านได้เฉพาะไฟล์ในโฟลเดอร์ data/slips ของร้าน กันการสั่งให้เปิดไฟล์อื่นในเครื่อง

ถ้าโปรแกรมนี้ล่มหรือไม่ได้เปิด ร้านยังขายได้ปกติ — การ์ดแคชเชียร์แค่ไม่มีผลตรวจจากภาพ
"""
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ห้ามไปเช็กโมเดลกับเน็ตตอนเปิด — ร้านอาจไม่มีเน็ต (โมเดลโหลดไว้แล้วตอนติดตั้ง)
os.environ.setdefault('PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK', 'True')

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SLIP_DIR = os.path.normcase(os.path.join(ROOT, 'data', 'slips'))
# ชุดภาพทดสอบความแม่นยำ (ไม่ใช่สลิปของออเดอร์จริง) — แยกไว้ ไม่ปนกับภาพที่ระบบจัดการ
DATASET_DIR = os.path.normcase(os.path.join(ROOT, 'data', 'slip-dataset'))
PORT = int(os.environ.get('CF_OCR_PORT', '5101'))

# โมเดลตัวเล็ก: หาตำแหน่งตัวหนังสือ (mobile_det) + อ่านภาษาไทย (th mobile_rec)
# วัดกับสลิปจริงแล้ว เร็วกว่าตัวใหญ่ 4 เท่า และอ่านยอดเงินจากภาพเบลอได้ดีกว่า
# enable_mkldnn=True (ตัวเร่ง CPU oneDNN): ~1.9 วิ/ใบ — ปิดไว้ ~8.9 วิ/ใบ (สลิปจริง 56 ใบ ผลอ่านตรงกันทุกใบ 12/10/2569)
# ★ ต้องคู่กับ paddlepaddle 3.2.2 (requirements.txt) — 3.3.x เปิด mkldnn แล้วพัง
#   (NotImplementedError ConvertPirAttribute2RuntimeAttribute) ห้ามอัปเกรดโดยไม่วัดใหม่
ENGINE = 'openvino' if os.environ.get('CF_OCR_ENGINE', 'paddle').lower() == 'openvino' else 'paddleocr'
print(f'[ocr] กำลังโหลดโมเดล ({ENGINE})…', flush=True)
if ENGINE == 'openvino':
    import ov_engine  # noqa: E402
    OCR = ov_engine.create()
else:
    from paddleocr import PaddleOCR  # noqa: E402  (ต้องตั้ง env ก่อน import)
    OCR = PaddleOCR(
        lang='th',
        text_detection_model_name='PP-OCRv5_mobile_det',
        text_recognition_model_name='th_PP-OCRv5_mobile_rec',
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        enable_mkldnn=True,
    )
# โมเดลตัวเดียวทำงานพร้อมกันหลายงานไม่ได้ — ต่อคิวทีละใบ
LOCK = threading.Lock()


def read_lines(path, flip=False):
    import cv2
    import numpy as np
    img = cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError('เปิดภาพไม่ได้')
    if flip:
        # ภาพกลับด้านแบบกระจก → พลิกซ้ายขวาก่อนอ่าน (Node ขอเมื่ออ่านรอบแรกไม่เจอทั้งยอดและวันที่)
        img = cv2.flip(img, 1)
    with LOCK:
        if ENGINE == 'openvino':
            return ov_engine.read_lines(OCR, img)
        res = OCR.predict(img)
    lines = []
    for r in res:
        for text, score in zip(r['rec_texts'], r['rec_scores']):
            if text and text.strip():
                lines.append({'text': text.strip(), 'score': round(float(score), 3)})
    return lines


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        data = json.dumps(body, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/health':
            return self._send(200, {'ok': True, 'engine': ENGINE})
        self._send(404, {'error': 'not found'})

    def do_POST(self):
        if self.path != '/ocr':
            return self._send(404, {'error': 'not found'})
        try:
            n = int(self.headers.get('Content-Length') or 0)
            body = json.loads(self.rfile.read(n) or b'{}')
            path = os.path.normcase(os.path.abspath(str(body.get('path') or '')))
            inside = path.startswith(SLIP_DIR + os.sep) or path.startswith(DATASET_DIR + os.sep)
            if not inside or not os.path.isfile(path):
                return self._send(400, {'error': 'ไม่พบไฟล์ภาพสลิป'})
            t = time.time()
            lines = read_lines(path, bool(body.get('flip')))
            self._send(200, {'lines': lines, 'ms': int((time.time() - t) * 1000), 'engine': ENGINE})
        except Exception as e:  # ไม่ให้ภาพเสียใบเดียวทำโปรแกรมล่ม
            print('[ocr] error:', e, file=sys.stderr, flush=True)
            self._send(500, {'error': str(e)})

    def log_message(self, fmt, *args):  # ไม่พ่น log ทุก request
        pass


if __name__ == '__main__':
    # setup.bat เรียกด้วย --warmup: โหลดโมเดล (ดาวน์โหลดครั้งแรกตอนยังมีเน็ต) แล้วออกเลย
    if '--warmup' in sys.argv:
        print(f'[ocr] โมเดลพร้อมใช้แบบไม่ต้องมีเน็ตแล้ว ({ENGINE})', flush=True)
        sys.exit(0)
    srv = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    print(f'[ocr] พร้อมที่ http://127.0.0.1:{PORT} ({ENGINE})', flush=True)
    srv.serve_forever()
