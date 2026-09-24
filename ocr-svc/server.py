"""
CafeFlow — ตัวอ่านสลิป (OCR) รันในเครื่องเซิร์ฟเวอร์ร้าน ไม่ใช้เน็ต
══════════════════════════════════════════════════════════════════
แยกเป็นโปรแกรม Python ต่างหาก เพราะ OCR ที่อ่านภาพถ่ายจอมือถือได้จริง (PaddleOCR)
มีแต่ฝั่ง Python — ลองแล้ว Tesseract/EasyOCR อ่านยอดเงินจากภาพกล้องคีออสก์ไม่ได้

หน้าที่มีอย่างเดียว: รับ path ของภาพ → คืนบรรทัดข้อความที่อ่านได้
การตีความ (ยอดเงิน · วันที่ · ตรงกับออเดอร์ไหม) อยู่ที่ shared/cf-slip-rules.js ฝั่ง Node
จะได้แก้กฎได้โดยไม่ต้องแตะโปรแกรมนี้

    POST /ocr   {"path": "D:/cafeflow/data/slips/2026-09/<sha>.jpg"}
             → {"lines": [{"text": "135.00", "score": 0.99}, ...], "ms": 5900}
    GET  /health

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

from paddleocr import PaddleOCR  # noqa: E402  (ต้องตั้ง env ก่อน import)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SLIP_DIR = os.path.normcase(os.path.join(ROOT, 'data', 'slips'))
PORT = int(os.environ.get('CF_OCR_PORT', '5101'))

# โมเดลตัวเล็ก: หาตำแหน่งตัวหนังสือ (mobile_det) + อ่านภาษาไทย (th mobile_rec)
# วัดกับสลิปจริงแล้ว เร็วกว่าตัวใหญ่ 4 เท่า (~6 วิ/ใบ บน CPU) และอ่านยอดเงินจากภาพเบลอได้ดีกว่า
# enable_mkldnn=False: oneDNN ของ Paddle 3.3 บน Windows พังกับโมเดลชุดนี้ (NotImplementedError)
print('[ocr] กำลังโหลดโมเดล…', flush=True)
OCR = PaddleOCR(
    lang='th',
    text_detection_model_name='PP-OCRv5_mobile_det',
    text_recognition_model_name='th_PP-OCRv5_mobile_rec',
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=False,
    enable_mkldnn=False,
)
# โมเดลตัวเดียวทำงานพร้อมกันหลายงานไม่ได้ — ต่อคิวทีละใบ
LOCK = threading.Lock()


def read_lines(path):
    with LOCK:
        res = OCR.predict(path)
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
            return self._send(200, {'ok': True, 'engine': 'paddleocr'})
        self._send(404, {'error': 'not found'})

    def do_POST(self):
        if self.path != '/ocr':
            return self._send(404, {'error': 'not found'})
        try:
            n = int(self.headers.get('Content-Length') or 0)
            body = json.loads(self.rfile.read(n) or b'{}')
            path = os.path.normcase(os.path.abspath(str(body.get('path') or '')))
            if not path.startswith(SLIP_DIR + os.sep) or not os.path.isfile(path):
                return self._send(400, {'error': 'ไม่พบไฟล์ภาพสลิป'})
            t = time.time()
            lines = read_lines(path)
            self._send(200, {'lines': lines, 'ms': int((time.time() - t) * 1000)})
        except Exception as e:  # ไม่ให้ภาพเสียใบเดียวทำโปรแกรมล่ม
            print('[ocr] error:', e, file=sys.stderr, flush=True)
            self._send(500, {'error': str(e)})

    def log_message(self, fmt, *args):  # ไม่พ่น log ทุก request
        pass


if __name__ == '__main__':
    # setup.bat เรียกด้วย --warmup: โหลดโมเดล (ดาวน์โหลดครั้งแรกตอนยังมีเน็ต) แล้วออกเลย
    if '--warmup' in sys.argv:
        print('[ocr] โมเดลพร้อมใช้แบบไม่ต้องมีเน็ตแล้ว', flush=True)
        sys.exit(0)
    srv = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    print(f'[ocr] พร้อมที่ http://127.0.0.1:{PORT}', flush=True)
    srv.serve_forever()
