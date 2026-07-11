#!/bin/sh
# v13 take 2: continuation-label supervision. Take 1 (run_v13.sh) trained the
# student on trimmed-vocab tokenizations (subword replacement p=1.0) and the
# ability DID reach the fp32 weights ("tjulander" tagged by the trimmed
# student), but the rare-surname gate still failed at 84.0% vs v11's 94.9%,
# and fp32/q8/q4 all score within 1pp, so quantization is NOT the cause.
# Bisection showed WHY: continuation subtokens were never supervised (-100),
# so decomposed names come out as incoherent chains ("##ulan" as B-PER, tail
# pieces under minScore) that reconstruct()'s whole-word guard rejects
# wholesale (the v7 lesson, again). Fix: hard labels on ALL student pieces
# (continuations get the I- tag); the word-aligned KL stays first-piece-only
# via a separate kl_mask. Teacher (model-v13) and dropout tokenizer
# (model-v13-trimmed) are reused unchanged: the data did not change.
# Gates identical to run_v13.sh, both on the QUANTIZED artifact.
set -e
cd /Users/joelhagvall/Documents/GitHub/maskera/training
export PYTORCH_ENABLE_MPS_FALLBACK=1 TOKENIZERS_PARALLELISM=false
PY=.venv/bin/python
echo "[1/6] distill student-v13b, continuation labels (log: run_v13b-distill.log)..."
MASKERA_SUBWORD_DROPOUT=1.0 MASKERA_DROPOUT_VOCAB=model-v13-trimmed \
  $PY distill.py 6 student-v13b model-v13 >run_v13b-distill.log 2>&1
echo "[2/6] trim student vocab (20000)..."
$PY trim_vocab.py student-v13b student-v13b-trimmed 20000
echo "[3/6] export onnx..."
rm -rf student-v13b-onnx
$PY export_onnx.py student-v13b-trimmed student-v13b-onnx
echo "[4/6] q4 combo..."
$PY quantize_combo.py student-v13b-onnx
echo "[5/6] gold + gold-real gate + spot probes (quantized artifact)..."
cd /Users/joelhagvall/Documents/GitHub/maskera/apps/demo
cat > _v13b.mjs <<'JS'
import { readFileSync } from "node:fs"; import { resolve } from "node:path"
import { createNerRecognizer } from "maskera"
const TYPES=["PER","LOC","ORG","ADR"], RE=/\[(PER|LOC|ORG|ADR):([^\]]+)\]/g
function gold(p){const o=[];for(let l of readFileSync(p,"utf-8").split("\n")){if(!l.trim()||l.trimStart().startsWith("#"))continue;let t="",pos=0,m;const s=[];RE.lastIndex=0;while((m=RE.exec(l))){t+=l.slice(pos,m.index);const st=t.length;t+=m[2];s.push([st,st+m[2].length,m[1]]);pos=m.index+m[0].length}t+=l.slice(pos);o.push({text:t,spans:s})}return o}
const ov=(a,b)=>Math.max(a[0],b[0])<Math.min(a[1],b[1])
function sc(g,p,ty){const u=new Set();let tp=0;for(const x of g)for(let i=0;i<p.length;i++){if(u.has(i))continue;if(ty&&p[i][2]!==x[2])continue;if(ov(p[i],x)){tp++;u.add(i);break}}return [tp,p.length-tp,g.length-tp]}
const rec=createNerRecognizer({model:"student-v13b-onnx",localModelPath:resolve(process.cwd(),"../../training")+"/",allowLocalModels:true,allowRemoteModels:false,dtype:"q4",device:"cpu",labelMap:g=>g})
await rec.ready
const f=t=>{const[tp,fp,fn]=t,P=tp/(tp+fp||1),R=tp/(tp+fn||1);return (2*P*R/((P+R)||1)).toFixed(3)+` (P ${P.toFixed(2)} R ${R.toFixed(2)})`}
let goldRealRecall=0
for(const [name,path] of [["our","../../training/eval/gold.txt"],["gold-real","../../training/eval/gold-real.txt"]]){
 const ex=gold(resolve(process.cwd(),path)); let A=[0,0,0]
 for(const e of ex){const pr=(await rec.detect(e.text)).filter(d=>TYPES.includes(d.label)).map(d=>[d.start,d.end,d.label]);const r=sc(e.spans,pr,true);A=A.map((v,i)=>v+r[i])}
 if(name==="gold-real"){const[tp,,fn]=A;goldRealRecall=tp/(tp+fn||1)}
 console.log("RESULT "+name+": "+f(A))}
for(const t of ["Sätt in EKG-svar i journalen.","Betalkonto IBAN anges nedan.","Jag jobbar på SEB och handlar på ICA.","Kontoret ligger nära Spotify och Volvo.","hejhej det är fatima igen, hör av dig när du kan","RING LARS NORDSTRÖM","skriv ett mejl till john och lennart","hej jag heter nadia saleh och bor i malmö","jag fick ett brev från inspektionen för strategiska produkter","min faktura från kivra har inte kommit","beslutet från länsstyrelsen i örebro län överklagas","hej det är löfven igen, ringde igår om fakturan","be löfven återkomma imorgon","hej jag heter tjulander och min beställning saknas","RING LÖFVEN OMGÅENDE","ärendet skickades vidare till bygglovsavdelningen i kommunen"]){
 const d=await rec.detect(t); console.log("SPOT: "+t+" -> "+(d.map(x=>x.value+"="+x.label).join(", ")||"(inget)"))}
const FLOOR=Number(process.env.GOLDREAL_RECALL_FLOOR ?? "0.90")
if(goldRealRecall<FLOOR){console.error("GATE FAIL: quantized gold-real recall "+goldRealRecall.toFixed(2)+" < floor "+FLOOR+", do not ship");process.exitCode=1}
else
console.log("GATE PASS: quantized gold-real recall "+goldRealRecall.toFixed(2)+" >= floor "+FLOOR)
JS
node _v13b.mjs || { rm -f _v13b.mjs; echo "[failed gate]"; exit 1; }
rm -f _v13b.mjs
echo "[6/6] rare-surname gate: v13b must BEAT v11 (docs/ROADMAP.md: not just tie)..."
cd /Users/joelhagvall/Documents/GitHub/maskera
MASKERA_MODEL_PATH="$PWD/training" MASKERA_MODEL=student-v13b-onnx \
  node packages/ner/eval/benchmark-rare-surnames.mjs | tee training/run_v13b-raresurnames-v13b.log
node -e '
const fs = require("node:fs")
const parse = (p) => {
  const m = fs.readFileSync(p, "utf8").match(/RESULT masked_recall=([\d.]+) per_recall=([\d.]+) leaks=(\d+)\/(\d+)/)
  if (!m) { console.error("no RESULT line in " + p); process.exit(1) }
  return { masked: +m[1], per: +m[2], leaks: +m[3] }
}
const v13 = parse("training/run_v13b-raresurnames-v13b.log")
const v11 = parse("training/run_v13-raresurnames-v11.log")  // measured this round, same eval file
console.log(`rare-surname masked recall: v13b ${v13.masked} (${v13.leaks} leaks) vs v11 ${v11.masked} (${v11.leaks} leaks); PER-typed ${v13.per} vs ${v11.per}`)
if (v13.masked > v11.masked) console.log("GATE PASS: v13b beats v11 on the rare-surname eval")
else { console.error("GATE FAIL: v13b does not beat v11 on the rare-surname eval, do not ship"); process.exit(1) }
'
echo "[done]"
