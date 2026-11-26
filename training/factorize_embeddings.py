"""
Low-rank factorize the word-embedding table of an exported ONNX student, then
quantize it the same way as quantize_combo.py (int8 Gather + q4 MatMuls).

The vocab x 768 table is the largest single tensor in the shipped q4 (15.4 MB
of 42.7 MB). Rampart Edge's recipe replaces it with a vocab x r table plus an
r -> 768 projection, initialized from the SVD of the pretrained table:

    E (V x H)  ~=  U_r (V x r)  @  (S_r Vt_r) (r x H)

U_r has orthonormal columns of even magnitude, so per-tensor int8 on the Gather
keeps precision. The r x H projection carries the singular values; it is tiny
(r * H floats) and stays fp32 so q4 blocks never mix large and small rows.

If the source table already has rank <= r (a model trained with the factorized
embedding and saved merged), the factorization is exact.

    uv run python factorize_embeddings.py <src_onnx_dir> <out_dir> <rank>
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import onnx
from onnx import helper, numpy_helper
from onnxruntime.quantization import QuantType, quantize_dynamic
from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer

if len(sys.argv) != 4:
    sys.exit("usage: factorize_embeddings.py <src_onnx_dir> <out_dir> <rank>")
SRC, OUT, RANK = Path(sys.argv[1]), Path(sys.argv[2]), int(sys.argv[3])
EMBED = "bert.embeddings.word_embeddings.weight"
PROJ = "bert.embeddings.word_embeddings.proj"
PROJ_NODE = "/bert/embeddings/word_embeddings/Proj"

attestation_path = SRC / "privacy-attestation.json"
if not attestation_path.is_file():
    sys.exit(f"{SRC} has no privacy-attestation.json; refusing to factorize legacy weights")
subprocess.run(["node", "verify_attestation.mjs", str(attestation_path)], check=True)


def mb(path):
    return os.path.getsize(path) / 1e6


OUT.mkdir(parents=True, exist_ok=True)
(OUT / "onnx").mkdir(exist_ok=True)
for name in ("config.json", "special_tokens_map.json", "tokenizer.json",
             "tokenizer_config.json", "vocab.txt", "privacy-attestation.json"):
    shutil.copy2(SRC / name, OUT / name)

model = onnx.load(SRC / "model.onnx")
graph = model.graph
init = next(t for t in graph.initializer if t.name == EMBED)
table = numpy_helper.to_array(init).astype(np.float64)
vocab, hidden = table.shape
if not 0 < RANK < hidden:
    sys.exit(f"rank must be in 1..{hidden - 1}")

u, s, vt = np.linalg.svd(table, full_matrices=False)
energy = float((s[:RANK] ** 2).sum() / (s ** 2).sum())
lookup = u[:, :RANK].astype(np.float32)
proj = (s[:RANK, None] * vt[:RANK]).astype(np.float32)
rel_err = float(np.linalg.norm(table - lookup @ proj) / np.linalg.norm(table))
print(f"== {vocab}x{hidden} -> {vocab}x{RANK} + {RANK}x{hidden}: "
      f"energy {energy:.4f}, relative error {rel_err:.4f} ==")

init.CopyFrom(numpy_helper.from_array(lookup, EMBED))
graph.initializer.append(numpy_helper.from_array(proj, PROJ))

gather_idx, gather = next(
    (i, n) for i, n in enumerate(graph.node) if n.op_type == "Gather" and n.input[0] == EMBED
)
gathered = gather.output[0]
projected = f"{gathered}_proj"
for node in graph.node:
    for i, name in enumerate(node.input):
        if name == gathered:
            node.input[i] = projected
graph.node.insert(gather_idx + 1, helper.make_node("MatMul", [gathered, PROJ], [projected], name=PROJ_NODE))
onnx.checker.check_model(model)

fp32 = OUT / "model.onnx"
onnx.save(model, fp32)
print(f"   fp32: {mb(fp32):.1f} MB")

# Same recipe as quantize_combo.py, except the fp32 projection is excluded.
tmp = OUT / "_embed_int8.onnx"
quantize_dynamic(fp32, tmp, op_types_to_quantize=["Gather"], weight_type=QuantType.QInt8)
q = MatMulNBitsQuantizer(onnx.load(tmp), block_size=32, is_symmetric=True,
                         nodes_to_exclude=[PROJ_NODE])
q.process()
q4 = OUT / "onnx" / "model_q4.onnx"
q.model.save_model_to_file(str(q4), use_external_data_format=False)
tmp.unlink()
print(f"   q4 matmul + int8 emb: {mb(q4):.1f} MB")
