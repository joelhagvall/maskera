#!/usr/bin/env python3
"""
Reusable headless Colab GPU runner for Maskera training sweeps.

Self-bootstraps a fresh Colab VM (from /content/maskera-src.tar.gz) or reuses an
already-warm VM, runs training/run_gpu_sweep.sh with the given preset/env, and
packages the resulting ONNX q4 artifacts and report into
/content/<prefix>-artifacts.tar.gz.

Usage:
    python3 training/colab_runner.py --prefix v22f [--preset training/presets/v22f.env]
"""
import argparse
import os
import shlex
import subprocess
import sys
from pathlib import Path

SHIPPED_HF_REPO = "joelhagvall/maskera-sv-ner"
SHIPPED_HF_REV = "5bd47f3031fea64eb1ae98f77ebfc67882f792fa"


def run(cmd: str, cwd: Path | None = None, env: dict[str, str] | None = None) -> None:
    print(f"\n$ {cmd}", flush=True)
    proc = subprocess.Popen(
        cmd,
        shell=True,
        cwd=cwd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    assert proc.stdout is not None
    for line in proc.stdout:
        sys.stdout.write(line)
        sys.stdout.flush()
    rc = proc.wait()
    if rc != 0:
        raise subprocess.CalledProcessError(rc, cmd)


def bootstrap_vm(workdir: Path, env: dict[str, str]) -> None:
    tarball = Path("/content/maskera-src.tar.gz")
    if not (workdir / "package.json").is_file():
        if not tarball.is_file():
            sys.exit(f"Missing uploaded source snapshot at {tarball}")
        if workdir.exists():
            run(f"rm -rf {shlex.quote(str(workdir))}")
        workdir.mkdir(parents=True, exist_ok=True)
        run(f"tar -xzf {shlex.quote(str(tarball))} -C {shlex.quote(str(workdir))}")
    elif tarball.is_file() and tarball.stat().st_mtime > (workdir / "package.json").stat().st_mtime:
        # Overlay updated repo sources on a warm VM while preserving node_modules & models.
        run(f"tar -xzf {shlex.quote(str(tarball))} -C {shlex.quote(str(workdir))}")

    node_ver = subprocess.run("node -v", shell=True, capture_output=True, text=True)
    if not node_ver.stdout.strip().startswith("v22."):
        run("curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y -qq nodejs")
    if subprocess.run("which pnpm", shell=True, capture_output=True).returncode != 0:
        run("npm install -g pnpm@10.33.0")

    if (
        subprocess.run(
            f"{sys.executable} -c 'import transformers, datasets, accelerate, seqeval, optimum, onnx, onnxruntime, huggingface_hub'",
            shell=True,
        ).returncode
        != 0
    ):
        run(
            "pip install -q --upgrade "
            "'transformers>=4.57,<5' 'datasets>=3.2' 'seqeval>=1.2' 'accelerate>=1.0' "
            "'optimum>=2.0' 'optimum-onnx>=0.1' 'onnx>=1.17' 'onnx-ir>=0.1' 'onnxruntime>=1.20' 'huggingface_hub>=0.30' "
            "&& pip uninstall -y -q diffusers || true"
        )

    if not (workdir / "node_modules").exists():
        run("pnpm install --frozen-lockfile", cwd=workdir, env=env)

    baseline_dir = workdir / "training" / "student-v21-shipped-onnx"
    if not (baseline_dir / "onnx" / "model_q4.onnx").is_file():
        from huggingface_hub import snapshot_download

        snapshot_download(
            repo_id=SHIPPED_HF_REPO,
            revision=SHIPPED_HF_REV,
            local_dir=str(baseline_dir),
            allow_patterns=[
                "config.json",
                "tokenizer*",
                "special_tokens_map.json",
                "vocab.txt",
                "onnx/model_q4.onnx",
            ],
        )
        print("Downloaded shipped baseline for side-by-side grading.", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Headless Colab GPU runner for Maskera sweeps")
    parser.add_argument("--prefix", required=True, help="Candidate prefix, e.g. v22f")
    parser.add_argument("--preset", default="", help="Optional preset .env path relative to repo root")
    parser.add_argument("--workdir", default="/content/maskera", help="Remote repo checkout directory")
    args = parser.parse_args()

    import torch

    run("nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv")
    if not torch.cuda.is_available():
        sys.exit("No CUDA GPU attached on this Colab runtime.")
    print(
        f"PyTorch {torch.__version__}, CUDA {torch.version.cuda}, bf16={torch.cuda.is_bf16_supported()}",
        flush=True,
    )

    workdir = Path(args.workdir)
    env = os.environ.copy()
    env["COREPACK_ENABLE_DOWNLOAD_PROMPT"] = "0"
    env["PY"] = sys.executable
    env["CANDIDATE_PREFIX"] = args.prefix

    bootstrap_vm(workdir, env)

    sweep_cmd = "sh training/run_gpu_sweep.sh"
    if args.preset:
        sweep_cmd += f" --preset {shlex.quote(args.preset)}"
    run(sweep_cmd, cwd=workdir, env=env)

    prefix = args.prefix
    models = sorted(
        p.name
        for p in (workdir / "training").glob(f"student-{prefix}-s*-onnx")
        if (p / "onnx/model_q4.onnx").is_file()
    )
    if not models:
        sys.exit(f"No student-{prefix}-s*-onnx/onnx/model_q4.onnx artifacts produced.")

    tar_out = f"/content/{prefix}-artifacts.tar.gz"
    tar_targets = [
        f"training/.tmp/{prefix}-sweep-report.json",
        "training/data/source-manifest.json",
        "training/data/privacy-attestation.json",
        *[f"training/{m}" for m in models],
    ]
    run(
        f"tar --exclude='student-{prefix}-s*-onnx/model.onnx' -czf {shlex.quote(tar_out)} "
        + " ".join(shlex.quote(t) for t in tar_targets),
        cwd=workdir,
        env=env,
    )
    print(f"\n[ALL DONE] Packaged {tar_out}", flush=True)


if __name__ == "__main__":
    main()
