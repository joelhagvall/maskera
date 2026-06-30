"""
Publish the distilled Swedish NER model to the Hugging Face Hub, so the demo and
all future @maska packages can point at one hosted source.

Prereqs:
    uv pip install huggingface_hub
    huggingface-cli login          # or set HF_TOKEN in the environment

Usage:
    uv run python push_to_hub.py [repo_id]
    # default repo_id: joelhagvall/maska-sv-ner  (change to your HF username)

Uploads the contents of ./student-onnx (ONNX weights + tokenizer + config) plus
MODEL_CARD.md as the repo README. Run export_onnx.py first to produce student-onnx.
"""
import os
import shutil
import sys

from huggingface_hub import HfApi

REPO_ID = sys.argv[1] if len(sys.argv) > 1 else "joelhagvall/maska-sv-ner"
SRC = "student-onnx"

if not os.path.isdir(SRC):
    raise SystemExit(f"'{SRC}/' not found — run: uv run python export_onnx.py student-model student-onnx")

# Use the model card as the repo README.
shutil.copy("MODEL_CARD.md", os.path.join(SRC, "README.md"))

# Don't upload the large fp32 ONNX — the int8 is what ships.
ignore = ["model.onnx", "onnx/model.onnx", "ort_config.json"]

api = HfApi()
print(f"== creating/ensuring repo {REPO_ID} ==")
api.create_repo(REPO_ID, repo_type="model", exist_ok=True)

print(f"== uploading {SRC}/ -> {REPO_ID} (skipping fp32 weights) ==")
api.upload_folder(
    folder_path=SRC,
    repo_id=REPO_ID,
    repo_type="model",
    ignore_patterns=ignore,
    commit_message="Upload maska-sv-ner (distilled Swedish PII NER, int8 ONNX)",
)
print(f"== done: https://huggingface.co/{REPO_ID} ==")
print("Now point @maska/ner at it: createNerRecognizer({ model: '" + REPO_ID + "', dtype: 'q8' })")
