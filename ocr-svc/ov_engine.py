"""
CafeFlow — ตัวอ่านสลิปแบบ OpenVINO (ตัวเร่งของ Intel) · server.py ใช้เมื่อ CF_OCR_ENGINE=openvino
══════════════════════════════════════════════════════════════════
โมเดลเดียวกับตัว paddle (PP-OCRv5_mobile_det + th_PP-OCRv5_mobile_rec) แปลงเป็น ONNX ไว้ใน onnx/
ขั้นเตรียมภาพ/หาบรรทัด/ถอดตัวอักษรใช้ RapidOCR — ตั้งค่าให้ตรงกับ inference.yml ของ PaddleOCR
วัด 12/10/2569: เครื่องร้าน i3-6100U 1.04 วิ/ใบ (paddle + mkldnn 3.31) ตรงกัน 15/15 ใบ ·
               dev จำกัด 4 thread สลิป 57 ใบ 1.02 วิ (paddle 3.37) ไม่มีใบที่เดิมถูกแล้วใหม่ผิด

ที่มาของไฟล์ใน onnx/ (แปลงครั้งเดียว — บน Windows paddle2onnx DLL ชน ต้องทำใน Docker):
    docker run --rm -v %USERPROFILE%\\.paddlex\\official_models:/models:ro -v %CD%\\onnx:/out python:3.11 bash -c
      "pip install paddlepaddle==3.2.2 paddle2onnx==2.1.0 && paddle2onnx --model_dir /models/<ชื่อโมเดล>
       --model_filename inference.json --params_filename inference.pdiparams --save_file /out/<ชื่อโมเดล>.onnx --opset_version 14"
    th_keys.txt = PostProcess.character_dict ใน th_PP-OCRv5_mobile_rec/inference.yml (524 ตัว)

ต้องติดตั้ง requirements-openvino.txt (venv แยก .venv-ov) · ครั้งแรก RapidOCR โหลดโมเดลตั้งต้นของมันเอง (ต้องมีเน็ต) แล้วเก็บไว้
"""
import os

from rapidocr import EngineType, RapidOCR

HERE = os.path.dirname(os.path.abspath(__file__))
ONNX = os.path.join(HERE, 'onnx')


def create(threads=-1):
    return RapidOCR(params={
        'Global.use_cls': False, 'Global.text_score': 0.0, 'Global.log_level': 'error',
        'Global.max_side_len': 4000, 'Global.min_side_len': 1,
        'Det.engine_type': EngineType.OPENVINO, 'Det.model_path': os.path.join(ONNX, 'PP-OCRv5_mobile_det.onnx'),
        # ตรงกับ PaddleOCR PP-OCRv5_mobile_det: limit min 64 · ImageNet mean/std · DB thresh .3 box .6 unclip 1.5 · ไม่ dilate
        'Det.limit_type': 'min', 'Det.limit_side_len': 64,
        'Det.mean': [0.485, 0.456, 0.406], 'Det.std': [0.229, 0.224, 0.225],
        'Det.thresh': 0.3, 'Det.box_thresh': 0.6, 'Det.unclip_ratio': 1.5, 'Det.use_dilation': False,
        'Rec.engine_type': EngineType.OPENVINO, 'Rec.model_path': os.path.join(ONNX, 'th_PP-OCRv5_mobile_rec.onnx'),
        'Rec.rec_keys_path': os.path.join(ONNX, 'th_keys.txt'), 'Rec.rec_img_shape': [3, 48, 320], 'Rec.rec_batch_num': 6,
        'EngineConfig.openvino.inference_num_threads': threads,
        'EngineConfig.openvino.performance_hint': 'LATENCY',
    })


def read_lines(ocr, img):
    """img = ภาพ BGR (numpy) · คืนบรรทัดแบบเดียวกับ server.py: [{text, score}]"""
    r = ocr(img)
    return [{'text': t.strip(), 'score': round(float(s), 3)}
            for t, s in zip(r.txts or [], r.scores or []) if t and t.strip()]
