"""
Run Microsoft Presidio (Swedish spaCy + Swedish ID rules) and OpenAI Privacy
Filter (q4 ONNX) over the independent corpora and write their detections in
the shared format for score.mjs.

Both predictors are imported from training/benchmark_suc3_external_v20.py, so
they are configured exactly as in the published SUC comparison.

Output: tmp/indep/preds/<system>/<corpus>.jsonl with
  {"id": str, "preds": [{"start", "end", "label"}]}

Run with the bench venv (Python 3.13, presidio-analyzer==2.2.366,
sv_core_news_lg==3.8.0, onnxruntime 1.32.0, tokenizers 0.23.3):
  bench/.venv/bin/python bench/independent/run_python_systems.py tmp/indep/corpora/*.jsonl
"""

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "training"))
from benchmark_suc3_external_v20 import load_openai_predictor, load_presidio_predictor  # noqa: E402

SYSTEMS = {
    "presidio": load_presidio_predictor,
    "openai-privacy-filter": load_openai_predictor,
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("corpora", nargs="+")
    parser.add_argument("--out-dir", default="tmp/indep/preds")
    parser.add_argument("--systems", default=",".join(SYSTEMS))
    args = parser.parse_args()

    for system in args.systems.split(","):
        predict = SYSTEMS[system]()
        out_dir = Path(args.out_dir) / system
        out_dir.mkdir(parents=True, exist_ok=True)
        for corpus in args.corpora:
            rows = [json.loads(line) for line in open(corpus, encoding="utf-8") if line.strip()]
            started = time.perf_counter()
            with open(out_dir / Path(corpus).name, "w", encoding="utf-8") as f:
                for row in rows:
                    preds = [{"start": p["start"], "end": p["end"], "label": p["type"]} for p in predict(row["text"])]
                    f.write(json.dumps({"id": row["id"], "preds": preds}, ensure_ascii=False) + "\n")
            print(f"{system} {Path(corpus).stem}: {len(rows)} texts in {time.perf_counter() - started:.1f} s", flush=True)


if __name__ == "__main__":
    main()
