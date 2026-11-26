#!/usr/bin/env python3
"""
Headless Colab VM bootstrap + Maskera v21 GPU sweep + external SUC 3.0 / homograph comparison.

Usage with google-colab-cli:
    colab new -s maskera-v21 --gpu A100
    colab upload -s maskera-v21 /tmp/maskera-v21-src.tar.gz /content/maskera-src.tar.gz
    colab exec -s maskera-v21 --timeout 0 -f training/colab_remote_v21.py
"""
import json
import os
import subprocess
import sys
from pathlib import Path


def run(cmd, cwd=None, env=None):
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

    if not (workdir / "node_modules").exists():
        if workdir.exists():
            run(f"rm -rf {workdir}")
        workdir.mkdir(parents=True, exist_ok=True)
        run(f"tar -xzf {tarball} -C {workdir}")

    node_ver = subprocess.run("node -v", shell=True, capture_output=True, text=True)
    if not node_ver.stdout.strip().startswith("v22."):
        run("curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y -qq nodejs")
    if subprocess.run("which pnpm", shell=True, capture_output=True).returncode != 0:
        run("npm install -g pnpm@10.33.0")

    if subprocess.run(f"{sys.executable} -c 'import transformers, optimum, onnxruntime, seqeval'", shell=True).returncode != 0:
        run(
            "pip install -q --upgrade "
            "'transformers>=4.57,<5' 'datasets>=3.2' 'seqeval>=1.2' 'accelerate>=1.0' "
            "'optimum>=2.0' 'optimum-onnx>=0.1' 'onnx>=1.17' 'onnx-ir>=0.1' 'onnxruntime>=1.20' 'huggingface_hub>=0.30' "
            "&& pip uninstall -y -q diffusers || true"
        )

    env = os.environ.copy()
    env["COREPACK_ENABLE_DOWNLOAD_PROMPT"] = "0"
    env["PY"] = sys.executable

    demo_tar = Path("/content/maskera-demo-src.tar.gz")
    if demo_tar.is_file():
        run(f"tar -xzf {demo_tar} -C {workdir}")
    if not (workdir / "node_modules").exists():
        run("pnpm install --frozen-lockfile", cwd=workdir, env=env)
    run("pnpm --filter @maskera/core build", cwd=workdir, env=env)
    run("pnpm --filter maskera build", cwd=workdir, env=env)

    # Download shipped v20 baseline so the report compares v21 directly against v20
    from huggingface_hub import snapshot_download

    baseline_dir = workdir / "training" / "student-v20-shipped-onnx"
    snapshot_download(
        repo_id="joelhagvall/maskera-sv-ner",
        revision="f417d65c08bcf814f639f8bf9221e30a79a53f39",
        local_dir=str(baseline_dir),
        allow_patterns=[
            "config.json",
            "tokenizer*",
            "special_tokens_map.json",
            "vocab.txt",
            "onnx/model_q4.onnx",
        ],
    )
    print("Downloaded shipped v20 baseline.", flush=True)

    run("sh training/run_v21_sweep.sh", cwd=workdir, env=env)

    # Also run external SUC 3.0 (1000 sentences) + cased/lowercase homographs + clean business 20
    # directly on shipped v20 vs every v21 student!
    eval_dir = workdir / "training" / ".tmp" / "v21-ext"
    eval_dir.mkdir(parents=True, exist_ok=True)
    run(
        f"{sys.executable} -c '"
        "import json; from pathlib import Path; "
        "import sys; sys.path.insert(0, \"training\"); "
        "from benchmark_suc3_external_v20 import build_suc3_sample, load_homograph_suite; "
        f"d = Path(\"{eval_dir}\"); "
        "(d / \"suc_sample.json\").write_text(json.dumps(build_suc3_sample(), ensure_ascii=False)); "
        "(d / \"homo_suite.json\").write_text(json.dumps(load_homograph_suite(Path(\"training/eval/homograph-names.txt\")), ensure_ascii=False)); "
        "print(\"Prepared external SUC 3.0 + homograph eval files\")'",
        cwd=workdir,
        env=env,
    )

    node_eval = workdir / "training" / ".tmp" / "eval_v21_external.mjs"
    node_eval.write_text(
        r'''
import fs from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const evalDir = process.argv[2];
const models = process.argv.slice(3);
const sucSample = JSON.parse(fs.readFileSync(`${evalDir}/suc_sample.json`, "utf8"));
const homoSuite = JSON.parse(fs.readFileSync(`${evalDir}/homo_suite.json`, "utf8"));

const casedHomographWords = [
  ["Bo", "Bo kvar i lägenheten till sista augusti om kontraktet förlängs."],
  ["Stig", "Stig in genom dörren och ta av dig skorna i hallen."],
  ["Sten", "Sten och grus låg utspritt över hela garageuppfarten."],
  ["Björn", "Björn har observerats flera gånger i skogarna i norr."],
  ["Dag", "Dag efter dag fortsatte regnet att falla över åkrarna."],
  ["Liv", "Liv och rörelse fyllde torget hela lördagen."],
  ["Bror", "Bror min har samma abonnemang och betalar samma avgift."],
  ["Klara", "Klara av de viktigaste uppgifterna innan mötet börjar."],
  ["Linda", "Linda in paketet ordentligt med bubbelplast före leverans."],
  ["Axel", "Axel mot axel stod publiken längs hela gatan."],
  ["Max", "Max tio minuter tar det att fylla i hela formuläret."],
  ["Per", "Per månad blir kostnaden tvåhundra kronor enligt prislistan."],
  ["Karl", "Karl nog att ta ansvar för sitt eget beslut var han alltid."],
  ["Mina", "Mina uppgifter stämmer inte i det nya systemet."],
  ["Tom", "Tom på innehåll var kartongen när den kom fram."],
  ["Jack", "Jack i bordsskivan uppstod under transporten i fredags."],
  ["Fred", "Fred och lugn i huset är allt vi önskar oss."],
  ["Rita", "Rita en enkel skiss på hur kablarna ska kopplas in."],
  ["Rosa", "Rosa nyanser på väggarna passade inte riktigt i köket."],
  ["Knut", "Knut på sladden gjorde att laddaren inte räckte fram."],
  ["Maj", "Maj var en ovanligt varm och torr månad i år."],
  ["Juni", "Juni bjuder ofta på ljusa nätter i hela landet."],
  ["Saga", "Saga eller verklighet, berättelsen fängslade alla i rummet."],
  ["Urban", "Urban miljö utan egen parkering kräver andra lösningar."],
  ["Lova", "Lova inte en leveranstid som lagret inte kan hålla."],
  ["Tina", "Tina frysta bär långsamt i kylskåp över natten."],
  ["Dan", "Dan före julafton brukar butikerna vara helt fulla."],
  ["Frank", "Frank och rakt på sak beskrev rapporten bristerna."],
  ["Sanna", "Sanna ord väger tungt när beslut ska fattas."],
  ["Ann", "Ann annars får vi skjuta upp lanseringen en vecka."],
];

const businessClean = [
  "Fakturan på 14 500 kr förfaller den 30 november 2026.",
  "Order #482910 skickades klockan 14:30 och beräknas anlända imorgon.",
  "Vi uppgraderar systemet från version 2.4.1 till 3.0.0 på måndag.",
  "Budgeten för kvartal fyra ligger på 1,2 miljoner kronor inklusive moms.",
  "Projektet omfattar 42 servrar och 128 GB arbetsminne per nod.",
  "Kontrollera artikelnummer 8842-991 innan lagret inventeras.",
  "Mötet är bokat 09:00 till 10:30 i konferensrum 4B.",
  "Priset sänktes med 15 procent under kampanjveckan i oktober.",
  "Databasen har svarstider under 12 ms vid 500 samtidiga förfrågningar.",
  "Lagkravet träder i kraft den 1 januari 2027 enligt förordningen.",
  "Avtalet löper i 24 månader med tre månaders uppsägningstid.",
  "Leveransen innehöll 18 kollin med en totalvikt på 340 kilo.",
  "Koden kompilerar rent utan varningar i TypeScript 5.8 och Node 22.",
  "Räntan justerades med 0,25 procentenheter vid senaste styrelsemötet.",
  "Mätvärdet låg på 98,8 procent under hela testperioden.",
  "Se bilaga 3 på sidan 14 för fullständig tabell över kostnaderna.",
  "Öppettiderna är måndag till fredag 08:00 till 17:00.",
  "Dokumentet uppdaterades senast 2026-05-12 och saknar signaturer.",
  "Förbrukningen sjönk till 420 kWh jämfört med 510 kWh föregående år.",
  "Garantin gäller i tre år från inköpsdatum enligt konsumentköplagen.",
];

const mcpReq = createRequire("/content/maskera/packages/mcp/package.json");
const maskeraMod = await import(pathToFileURL(mcpReq.resolve("maskera")).href);

async function evalModel(modelName) {
  const recognizer = maskeraMod.createNerRecognizer({
    model: modelName,
    dtype: "q4",
    localModelPath: "/content/maskera/training/",
    allowRemoteModels: false,
  });
  const predict = async (text) => {
    const res = await maskeraMod.redactWithNer(text, { recognizer });
    return (res.redactions ?? []).map((e) => ({
      start: e.start,
      end: e.end,
      type: String(e.label),
      isPerson: e.label === "NAMN" || e.label === "PER",
    }));
  };

  let tp = 0, fp = 0, fn = 0, anyHit = 0, totalPrs = 0;
  for (const doc of sucSample.prs500) {
    const preds = await predict(doc.text);
    const pPreds = preds.filter((x) => x.isPerson);
    totalPrs += doc.prs.length;
    const matched = new Set();
    for (const g of doc.prs) {
      if (preds.some((x) => Math.max(g.start, x.start) < Math.min(g.end, x.end))) anyHit++;
      const idx = pPreds.findIndex((x, i) => !matched.has(i) && Math.max(g.start, x.start) < Math.min(g.end, x.end));
      if (idx !== -1) { tp++; matched.add(idx); } else fn++;
    }
    fp += pPreds.length - matched.size;
  }

  let cleanAny = 0, cleanPerson = 0;
  for (const doc of sucSample.clean500) {
    const preds = await predict(doc.text);
    const pPreds = preds.filter((x) => x.isPerson);
    fp += pPreds.length;
    if (preds.length > 0) cleanAny++;
    if (pPreds.length > 0) cleanPerson++;
  }

  let ltp = 0, lfp = 0, lfn = 0, lany = 0;
  for (const doc of sucSample.prs500) {
    const preds = await predict(doc.text.toLowerCase());
    const pPreds = preds.filter((x) => x.isPerson);
    const matched = new Set();
    for (const g of doc.prs) {
      if (preds.some((x) => Math.max(g.start, x.start) < Math.min(g.end, x.end))) lany++;
      const idx = pPreds.findIndex((x, i) => !matched.has(i) && Math.max(g.start, x.start) < Math.min(g.end, x.end));
      if (idx !== -1) { ltp++; matched.add(idx); } else lfn++;
    }
    lfp += pPreds.length - matched.size;
  }

  let hnTot = 0, hnHit = 0, hwFp = 0, casedHwFp = 0, bizFp = 0;
  for (const item of homoSuite.homoNameLower) {
    if (!item.meta.includes("type=homograph")) continue;
    hnTot++;
    const preds = await predict(item.text);
    const g = item.target;
    if (preds.some((x) => Math.max(g.start, x.start) < Math.min(g.end, x.end))) hnHit++;
  }
  for (const item of homoSuite.homoWordLower) {
    const preds = await predict(item.text);
    const g = item.target;
    if (preds.some((x) => Math.max(g.start, x.start) < Math.min(g.end, x.end))) hwFp++;
  }
  const casedFpWords = [];
  for (const [w, text] of casedHomographWords) {
    const preds = await predict(text);
    if (preds.some((x) => Math.max(0, x.start) < Math.min(w.length, x.end))) {
      casedHwFp++;
      casedFpWords.push(w);
    }
  }
  for (const text of businessClean) {
    const preds = await predict(text);
    if (preds.length > 0) bizFp++;
  }

  const r1 = (v) => Math.round(v * 1000) / 10;
  const prf = (t, f_p, f_n) => {
    const p = (t + f_p) ? t / (t + f_p) : 0;
    const r = (t + f_n) ? t / (t + f_n) : 0;
    const f = (p + r) ? (2 * p * r) / (p + r) : 0;
    return { p: r1(p), r: r1(r), f1: r1(f) };
  };
  return {
    suc3Cased: { ...prf(tp, fp, fn), anyRecall: r1(anyHit / totalPrs) },
    suc3Lower: { ...prf(ltp, lfp, lfn), anyRecall: r1(lany / totalPrs) },
    suc3Clean500: { anyFpPct: r1(cleanAny / 500), personFpPct: r1(cleanPerson / 500) },
    homoLowerNameRecallPct: r1(hnHit / hnTot),
    homoLowerWordFpPct: r1(hwFp / homoSuite.homoWordLower.length),
    homoCasedWordFpPct: r1(casedHwFp / casedHomographWords.length),
    homoCasedFpWords: casedFpWords,
    businessClean20FpPct: r1(bizFp / businessClean.length),
  };
}

const out = {};
for (const m of models) {
  out[m] = await evalModel(m);
}
fs.writeFileSync(`${evalDir}/external_results.json`, JSON.stringify(out, null, 2));
console.log("\n=== EXTERNAL SUC 3.0 + HOMOGRAPH RESULTS ===");
console.log(JSON.stringify(out, null, 2));
'''
    )

    v21_models = sorted(
        p.name for p in (workdir / "training").glob("student-v21*-s*-onnx") if (p / "onnx/model_q4.onnx").is_file()
    )
    eval_models = ["student-v20-shipped-onnx", *v21_models]
    run(
        f"node {node_eval} {eval_dir} " + " ".join(eval_models),
        cwd=workdir,
        env=env,
    )

    # Package winning ONNX artifacts + reports for easy download
    tar_targets = [
        "training/.tmp/v21-sweep-report.json",
        "training/.tmp/v21-ext/external_results.json",
        "training/data/source-manifest.json",
        "training/data/privacy-attestation.json",
        *[f"training/{m}" for m in v21_models],
    ]
    run(
        "tar -czf /content/v21-artifacts.tar.gz " + " ".join(tar_targets),
        cwd=workdir,
        env=env,
    )
    print("\n[ALL DONE] Packaged /content/v21-artifacts.tar.gz", flush=True)


if __name__ == "__main__":
    main()
