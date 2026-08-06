"""
Push the trimmed model smaller: int8 the embedding table (Gather) AND q4 the
transformer MatMuls. After vocab-trimming the embeddings are small, so now the
~42M MatMul params dominate — and q4 (4-bit) on those is the real lever.

    int8-everything (current ship): ~56 MB
    target here (q4 matmul + int8 embed): ~33 MB

    uv run python quantize_combo.py
"""
import os
import subprocess
import sys
from pathlib import Path

import onnx
from onnxruntime.quantization import QuantType, quantize_dynamic
from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer

# usage: quantize_combo.py [onnx_dir]
DIR = sys.argv[1] if len(sys.argv) > 1 else "student-trimmed-onnx"
SRC = f"{DIR}/model.onnx"  # fp32 trimmed
TMP = f"{DIR}/_embed_int8.onnx"
OUT = f"{DIR}/onnx/model_q4.onnx"

attestation_path = Path(DIR) / "privacy-attestation.json"
if not attestation_path.is_file():
    sys.exit(f"{DIR} has no privacy-attestation.json; refusing to quantize legacy weights")
subprocess.run(["node", "verify_attestation.mjs", str(attestation_path)], check=True)


def mb(p):
    return os.path.getsize(p) / 1e6


print(f"== src {mb(SRC):.1f} MB fp32 ==")

# 1. int8-quantize only the embedding lookup (Gather)
print("== int8 on embeddings (Gather) ==")
quantize_dynamic(SRC, TMP, op_types_to_quantize=["Gather"], weight_type=QuantType.QInt8)
print(f"   after embed-int8: {mb(TMP):.1f} MB")

# 2. q4-quantize the transformer MatMul weights
print("== q4 on MatMul weights ==")
model = onnx.load(TMP)
q = MatMulNBitsQuantizer(model, block_size=32, is_symmetric=True)
q.process()
os.makedirs(os.path.dirname(OUT), exist_ok=True)
q.model.save_model_to_file(OUT, use_external_data_format=False)

print("\n== sizes ==")
int8 = f"{DIR}/onnx/model_quantized.onnx"
if os.path.exists(int8):
    print(f"  int8                 : {mb(int8):6.1f} MB")
print(f"  q4 matmul + int8 emb : {mb(OUT):6.1f} MB")
os.remove(TMP)
