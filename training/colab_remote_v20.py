#!/usr/bin/env python3
"""
Headless Colab VM bootstrap + Maskera v20 GPU sweep runner.

Designed for `google-colab-cli`:
    colab new -s maskera-v20 --gpu A100
    colab upload -s maskera-v20 /tmp/maskera-src.tar.gz /content/maskera-src.tar.gz
    colab exec -s maskera-v20 --timeout 0 -f training/colab_remote_v20.py
"""
import os
import subprocess
import sys
from pathlib import Path


def run(cmd, cwd=None, env=None):
    print(f"\n$ {cmd}", flush=True)
    subprocess.run(cmd, shell=True, cwd=cwd, env=env, check=True)


def main():
    import torch

    run("nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv")
    if not torch.cuda.is_available():
        sys.exit("No CUDA GPU attached on this Colab runtime.")
    print(
        f"PyTorch {torch.__version__}, CUDA {torch.version.cuda}, "
        f"bf16={torch.cuda.is_bf16_supported()}",
        flush=True,
    )

    workdir = Path("/content/maskera")
    tarball = Path("/content/maskera-src.tar.gz")
    if not tarball.is_file():
        sys.exit(f"Missing uploaded source snapshot at {tarball}")

    if workdir.exists():
        run(f"rm -rf {workdir}")
    workdir.mkdir(parents=True, exist_ok=True)
    run(f"tar -xzf {tarball} -C {workdir}")

    # Install Node 22 + pnpm 10.33.0 if missing
    node_ver = subprocess.run("node -v", shell=True, capture_output=True, text=True)
    if not node_ver.stdout.strip().startswith("v22."):
        run("curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y -qq nodejs")
    run("npm install -g pnpm@10.33.0")

    # Install Python NLP + ONNX dependencies without touching Colab's CUDA PyTorch
    run(
        "pip install -q --upgrade "
        "'transformers>=4.57,<5' 'datasets>=3.2' 'seqeval>=1.2' 'accelerate>=1.0' "
        "'optimum>=2.0' 'optimum-onnx>=0.1' 'onnx>=1.17' 'onnx-ir>=0.1' 'onnxruntime>=1.20' 'huggingface_hub>=0.30' "
        "&& pip uninstall -y -q diffusers || true"
    )

    env = os.environ.copy()
    env["COREPACK_ENABLE_DOWNLOAD_PROMPT"] = "0"
    env["PY"] = sys.executable

    run("pnpm install --frozen-lockfile", cwd=workdir, env=env)
    run("pnpm --filter @maskera/core build", cwd=workdir, env=env)
    run("pnpm --filter maskera build", cwd=workdir, env=env)

    # Fetch shipped v19 baseline from Hugging Face so the report compares directly
    from huggingface_hub import snapshot_download

    baseline_dir = workdir / "training" / "student-v19-privacy-precision2-onnx"
    snapshot_download(
        repo_id="joelhagvall/maskera-sv-ner",
        revision="7a0063375d1baabf66cf9a357dad5f46aea7008e",
        local_dir=str(baseline_dir),
        allow_patterns=[
            "config.json",
            "tokenizer*",
            "special_tokens_map.json",
            "vocab.txt",
            "onnx/model_q4.onnx",
        ],
    )
    print("Downloaded v19 baseline.", flush=True)

    run("sh training/run_v20_sweep.sh", cwd=workdir, env=env)


if __name__ == "__main__":
    main()
