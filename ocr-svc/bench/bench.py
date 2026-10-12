"""
CafeFlow — วัดความเร็วตัวอ่านสลิปบนเครื่องนี้ (ใช้ผ่าน ops\\bench-ocr.bat)
    python bench.py paddle   <out.json>     ← รันด้วย ocr-svc\\.venv   (ตัวที่ร้านใช้อยู่)
    python bench.py openvino <out.json>     ← รันด้วย ocr-svc\\.venv-ov (ตัวทดลอง)
ใช้สลิปจริงของเครื่องนี้ใน data\\slips (ล่าสุด 15 ใบ) · น้อยกว่า 5 ใบ ใช้ data\\slip-dataset เพิ่ม
"""
import glob
import json
import os
import sys
import time

os.environ.setdefault('PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK', 'True')
import cv2  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SVC = os.path.dirname(HERE)
ROOT = os.path.dirname(SVC)
sys.path.insert(0, SVC)

mode, out_path = sys.argv[1], sys.argv[2]
N = 15

files = sorted(glob.glob(os.path.join(ROOT, 'data', 'slips', '*', '*.jpg')), key=os.path.getmtime, reverse=True)[:N]
if len(files) < 5:
    files += sorted(glob.glob(os.path.join(ROOT, 'data', 'slip-dataset', '*', '*.jp*g')))[:N - len(files)]
if not files:
    sys.exit('ไม่พบภาพสลิปใน data\\slips — สแกนสลิปที่ตู้ก่อนอย่างน้อย 1 ใบ')

if mode == 'paddle':
    from paddleocr import PaddleOCR
    # ค่าเดียวกับ server.py ทุกตัว
    ocr = PaddleOCR(lang='th', text_detection_model_name='PP-OCRv5_mobile_det',
                    text_recognition_model_name='th_PP-OCRv5_mobile_rec', use_doc_orientation_classify=False,
                    use_doc_unwarping=False, use_textline_orientation=False, enable_mkldnn=True)
    read = lambda img: [t.strip() for r in ocr.predict(img) for t in r['rec_texts'] if t and t.strip()]
else:
    import ov_engine
    ocr = ov_engine.create()
    read = lambda img: [x['text'] for x in ov_engine.read_lines(ocr, img)]

imgs = [cv2.imdecode(np.fromfile(f, np.uint8), cv2.IMREAD_COLOR) for f in files]
print(f'[{mode}] อุ่นเครื่อง...', flush=True)
read(imgs[0]); read(imgs[0])
rows = []
for i, (f, img) in enumerate(zip(files, imgs)):
    t = time.time(); lines = read(img); ms = int((time.time() - t) * 1000)
    rows.append({'file': os.path.relpath(f, ROOT), 'ms': ms, 'lines': lines})
    print(f'[{mode}] {i + 1}/{len(files)}  {ms / 1000:.2f} วิ', flush=True)
json.dump({'mode': mode, 'rows': rows}, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False)
