"""
Export the fine-tuned Swedish NER model to ONNX and quantize to int8.

Produces a Transformers.js-compatible layout so it can drop into @maskera/ner:
    onnx-model/
      config.json, tokenizer.json, ...
      onnx/model.onnx            (fp32)
      onnx/model_quantized.onnx  (int8)

    uv run python export_onnx.py
"""
import os
import shutil
import sys

import torch
from optimum.onnxruntime import ORTModelForTokenClassification, ORTQuantizer
from optimum.onnxruntime.configuration import AutoQuantizationConfig
from transformers import AutoTokenizer, pipeline

SRC = sys.argv[1] if len(sys.argv) > 1 else "model"
OUT = sys.argv[2] if len(sys.argv) > 2 else "onnx-model"
print(f"== exporting {SRC} -> {OUT} ==")


def mb(path):
    return os.path.getsize(path) / 1e6


# 1. Export to ONNX (fp32)
print("== exporting to ONNX ==")
ort_model = ORTModelForTokenClassification.from_pretrained(SRC, export=True)
ort_model.save_pretrained(OUT)
AutoTokenizer.from_pretrained(SRC).save_pretrained(OUT)

# 2. Dynamic int8 quantization (no calibration data needed)
print("== quantizing (int8 dynamic) ==")
quantizer = ORTQuantizer.from_pretrained(OUT)
qconfig = AutoQuantizationConfig.arm64(is_static=False, per_channel=True)
quantizer.quantize(save_dir=OUT, quantization_config=qconfig)

# 3. Arrange into a Transformers.js-style onnx/ subfolder
onnx_dir = os.path.join(OUT, "onnx")
os.makedirs(onnx_dir, exist_ok=True)
for src_name, dst_name in [("model.onnx", "model.onnx"), ("model_quantized.onnx", "model_quantized.onnx")]:
    src = os.path.join(OUT, src_name)
    if os.path.exists(src):
        shutil.copy(src, os.path.join(onnx_dir, dst_name))

fp32 = os.path.join(OUT, "model.onnx")
int8 = os.path.join(OUT, "model_quantized.onnx")
print("\n== sizes ==")
print(f"  fp32 ONNX: {mb(fp32):6.1f} MB")
if os.path.exists(int8):
    print(f"  int8 ONNX: {mb(int8):6.1f} MB  ({mb(fp32) / mb(int8):.1f}x smaller)")

# 4. Verify quality is preserved on the quantized model
print("\n== quality check (quantized int8) ==")
device = "cpu"
q_model = ORTModelForTokenClassification.from_pretrained(OUT, file_name="model_quantized.onnx")
tok = AutoTokenizer.from_pretrained(OUT)
nlp = pipeline("token-classification", model=q_model, tokenizer=tok,
               aggregation_strategy="simple", device=device)
for s in [
    "Min granne Lars Nordström bor på Kungsholmen och jobbar på Spotify i Stockholm.",
    "Kontakta Thorbjörn Fägerquist på Bromma innan fredag.",
    "Wei Zhang börjar på Northvolt i Skellefteå.",
]:
    print("\n>", s)
    for e in nlp(s):
        print(f"   {e['entity_group']:4} {e['word']!r:28} {e['score']:.2f}")
