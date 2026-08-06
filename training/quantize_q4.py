"""
4-bit (q4) quantize the distilled student ONNX and report the real size.

Note: ONNX MatMulNBits quantizes the MatMul (transformer Linear) weights to
4-bit but leaves the embedding table as-is — so on a model whose vocab embeddings
dominate, q4 may not beat int8. This script measures exactly what we get.

MEASURED RESULT (KB-BERT-distilled student, 50k vocab):
    fp32  326.4 MB
    int8   82.2 MB   <- best; int8 also shrinks the embedding table
    q4    183.1 MB   <- WORSE; only matmuls go 4-bit, embeddings stay fp32

Conclusion: q4 alone is a dead end here because ~half the model is the embedding
table (50k vocab x 768). The real size lever is VOCABULARY TRIMMING (shrink the
embedding table itself), then quantize. q4 only pays off after the vocab is small.

    uv run python quantize_q4.py
"""
import os
import subprocess
import sys
from pathlib import Path

import onnx
from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer

SRC = "student-onnx/model.onnx"  # fp32
OUT = "student-onnx/onnx/model_q4.onnx"

attestation_path = Path("student-onnx/privacy-attestation.json")
if not attestation_path.is_file():
    sys.exit("student-onnx has no privacy-attestation.json; refusing to quantize legacy weights")
subprocess.run(["node", "verify_attestation.mjs", str(attestation_path)], check=True)


def mb(p):
    return os.path.getsize(p) / 1e6


print(f"== loading {SRC} ({mb(SRC):.1f} MB fp32) ==")
model = onnx.load(SRC)

print("== q4 quantizing MatMul weights (block size 32, symmetric) ==")
q = MatMulNBitsQuantizer(model, block_size=32, is_symmetric=True)
q.process()
os.makedirs(os.path.dirname(OUT), exist_ok=True)
q.model.save_model_to_file(OUT, use_external_data_format=False)

print("\n== sizes ==")
print(f"  fp32 ONNX : {mb(SRC):7.1f} MB")
print(f"  int8 ONNX : {mb('student-onnx/onnx/model_quantized.onnx'):7.1f} MB")
print(f"  q4   ONNX : {mb(OUT):7.1f} MB")
