#!/bin/sh
# v13 take 4 SEED REPLICATE (v13d2): same data, same mechanics as
# run_v13d.sh (the gate-passing candidate, seed 1337), but MASKERA_SEED=2024
# for teacher + distillation. Purpose: measure recipe stability, NOT select
# a candidate (the journal rule stands: do not pick seeds on the gold
# corpora). If this replicate also passes both gates, the take-4 recipe is
# robust rather than a lucky draw; if it does not, that fragility must be
# known before any publish. Data build is skipped: data/ already holds the
# deterministic take-4 build and nothing changed.
set -e
cd /Users/joelhagvall/Documents/GitHub/maskera/training
export PYTORCH_ENABLE_MPS_FALLBACK=1 TOKENIZERS_PARALLELISM=false
PY=.venv/bin/python
echo "[0/8] data build skipped (unchanged take-4 build on disk); surname check..."
node gen_rare_surname_eval.mjs --check
export MASKERA_SEED=2024
echo "[1/8] train teacher model-v13d2 (log: run_v13d2-teacher.log)..."
$PY train.py model-v13d2 >run_v13d2-teacher.log 2>&1
echo "[2/8] trim teacher vocab -> dropout tokenizer (log: run_v13d2-trimtok.log)..."
# Only the TOKENIZER of this dir is used (distill subword replacement); the
# kept-20k set is deterministic given the data, so it equals the student trim
# in step 4. The trimmed teacher WEIGHTS are known-blind, never distilled from.
$PY trim_vocab.py model-v13d2 model-v13d2-trimmed 20000 >run_v13d2-trimtok.log 2>&1
echo "[3/8] distill student-v13d2 with subword replacement (log: run_v13d2-distill.log)..."
MASKERA_SUBWORD_DROPOUT=1.0 MASKERA_DROPOUT_VOCAB=model-v13d2-trimmed \
  $PY distill.py 6 student-v13d2 model-v13d2 >run_v13d2-distill.log 2>&1
echo "[4/8] trim student vocab (20000, the v12 take-4 lesson)..."
$PY trim_vocab.py student-v13d2 student-v13d2-trimmed 20000
echo "[5/8] export onnx..."
rm -rf student-v13d2-onnx
$PY export_onnx.py student-v13d2-trimmed student-v13d2-onnx
echo "[6/8] q4 combo..."
$PY quantize_combo.py student-v13d2-onnx
echo "[7/8] gold + gold-real gate + spot probes (quantized artifact)..."
cd /Users/joelhagvall/Documents/GitHub/maskera/apps/demo
cat > _v13d2.mjs <<'JS'
import { readFileSync } from "node:fs"; import { resolve } from "node:path"
import { createNerRecognizer } from "maskera"
const TYPES=["PER","LOC","ORG","ADR"], RE=/\[(PER|LOC|ORG|ADR):([^\]]+)\]/g
function gold(p){const o=[];for(let l of readFileSync(p,"utf-8").split("\n")){if(!l.trim()||l.trimStart().startsWith("#"))continue;let t="",pos=0,m;const s=[];RE.lastIndex=0;while((m=RE.exec(l))){t+=l.slice(pos,m.index);const st=t.length;t+=m[2];s.push([st,st+m[2].length,m[1]]);pos=m.index+m[0].length}t+=l.slice(pos);o.push({text:t,spans:s})}return o}
const ov=(a,b)=>Math.max(a[0],b[0])<Math.min(a[1],b[1])
function sc(g,p,ty){const u=new Set();let tp=0;for(const x of g)for(let i=0;i<p.length;i++){if(u.has(i))continue;if(ty&&p[i][2]!==x[2])continue;if(ov(p[i],x)){tp++;u.add(i);break}}return [tp,p.length-tp,g.length-tp]}
const rec=createNerRecognizer({model:"student-v13d2-onnx",localModelPath:resolve(process.cwd(),"../../training")+"/",allowLocalModels:true,allowRemoteModels:false,dtype:"q4",device:"cpu",labelMap:g=>g})
await rec.ready
const f=t=>{const[tp,fp,fn]=t,P=tp/(tp+fp||1),R=tp/(tp+fn||1);return (2*P*R/((P+R)||1)).toFixed(3)+` (P ${P.toFixed(2)} R ${R.toFixed(2)})`}
let goldRealRecall=0
for(const [name,path] of [["our","../../training/eval/gold.txt"],["gold-real","../../training/eval/gold-real.txt"]]){
 const ex=gold(resolve(process.cwd(),path)); let A=[0,0,0]
 for(const e of ex){const pr=(await rec.detect(e.text)).filter(d=>TYPES.includes(d.label)).map(d=>[d.start,d.end,d.label]);const r=sc(e.spans,pr,true);A=A.map((v,i)=>v+r[i])}
 if(name==="gold-real"){const[tp,,fn]=A;goldRealRecall=tp/(tp+fn||1)}
 console.log("RESULT "+name+": "+f(A))}
// spot checks: acronym + real-org + chat + leak-category probes, PLUS the
// v12 publish-hold regression probes (decomposed rare surnames, bare Löfven)
for(const t of ["Sätt in EKG-svar i journalen.","Betalkonto IBAN anges nedan.","Jag jobbar på SEB och handlar på ICA.","Kontoret ligger nära Spotify och Volvo.","hejhej det är fatima igen, hör av dig när du kan","RING LARS NORDSTRÖM","skriv ett mejl till john och lennart","hej jag heter nadia saleh och bor i malmö","jag fick ett brev från inspektionen för strategiska produkter","min faktura från kivra har inte kommit","beslutet från länsstyrelsen i örebro län överklagas","hej det är löfven igen, ringde igår om fakturan","be löfven återkomma imorgon","hej jag heter tjulander och min beställning saknas","RING LÖFVEN OMGÅENDE","ärendet skickades vidare till bygglovsavdelningen i kommunen"]){
 const d=await rec.detect(t); console.log("SPOT: "+t+" -> "+(d.map(x=>x.value+"="+x.label).join(", ")||"(inget)"))}
// GATE on the quantized artifact (it is what ships): leaks are the safety
// metric, so a run whose q4 gold-real recall regresses must not be accepted.
const FLOOR=Number(process.env.GOLDREAL_RECALL_FLOOR ?? "0.90")
if(goldRealRecall<FLOOR){console.error("GATE FAIL: quantized gold-real recall "+goldRealRecall.toFixed(2)+" < floor "+FLOOR+", do not ship");process.exitCode=1}
else
console.log("GATE PASS: quantized gold-real recall "+goldRealRecall.toFixed(2)+" >= floor "+FLOOR)
JS
node _v13d2.mjs || { rm -f _v13d2.mjs; echo "[failed gate]"; exit 1; }
rm -f _v13d2.mjs
echo "[8/8] rare-surname gate: v13 must BEAT v11 (docs/ROADMAP.md: not just tie)..."
cd /Users/joelhagvall/Documents/GitHub/maskera
MASKERA_MODEL_PATH="$PWD/training" MASKERA_MODEL=student-v13d2-onnx \
  node packages/ner/eval/benchmark-rare-surnames.mjs | tee training/run_v13d2-raresurnames-v13d2.log
MASKERA_MODEL_PATH="$PWD/training" MASKERA_MODEL=student-v11-onnx \
  node packages/ner/eval/benchmark-rare-surnames.mjs | tee training/run_v13-raresurnames-v11.log
node -e '
const fs = require("node:fs")
const parse = (p) => {
  const m = fs.readFileSync(p, "utf8").match(/RESULT masked_recall=([\d.]+) per_recall=([\d.]+) leaks=(\d+)\/(\d+)/)
  if (!m) { console.error("no RESULT line in " + p); process.exit(1) }
  return { masked: +m[1], per: +m[2], leaks: +m[3] }
}
const v13 = parse("training/run_v13d2-raresurnames-v13d2.log")
const v11 = parse("training/run_v13-raresurnames-v11.log")
console.log(`rare-surname masked recall: v13 ${v13.masked} (${v13.leaks} leaks) vs v11 ${v11.masked} (${v11.leaks} leaks); PER-typed ${v13.per} vs ${v11.per}`)
if (v13.masked > v11.masked) console.log("GATE PASS: v13 beats v11 on the rare-surname eval")
else { console.error("GATE FAIL: v13 does not beat v11 on the rare-surname eval, do not ship"); process.exit(1) }
'
echo "[done]"
