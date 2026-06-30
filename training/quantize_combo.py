"""
Push the trimmed model smaller: int8 the embedding table (Gather) AND q4 the
transformer MatMuls. After vocab-trimming the embeddings are small, so now the
~42M MatMul params dominate — and q4 (4-bit) on those is the real lever.

    int8-everything (current ship): ~56 MB
    target here (q4 matmul + int8 embed): ~33 MB

    uv run python quantize_combo.py
"""
import os

import onnx
from onnxruntime.quantization import QuantType, quantize_dynamic
from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer

SRC = "student-trimmed-onnx/model.onnx"  # fp32 trimmed
TMP = "student-trimmed-onnx/_embed_int8.onnx"
OUT = "student-trimmed-onnx/onnx/model_q4.onnx"


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
print(f"  int8 (current ship) : {mb('student-trimmed-onnx/onnx/model_quantized.onnx'):6.1f} MB")
print(f"  q4 matmul + int8 emb : {mb(OUT):6.1f} MB")
os.remove(TMP)
