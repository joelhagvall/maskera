#!/bin/sh
# v11 candidate: first round with real target-register data.
#   synthetic (24k) + klintan news (8.5k) + SUCX 3.0 gold sample (14.6k,
#   SUCX_SHARE 0.25) + SIC2 informal blog gold (1.1k) + MASSIVE sv-SE
#   chat-register gold (5.1k, MASSIVE_EMPTY_SHARE 0.3).
# Gate stays on the QUANTIZED artifact (gold-real recall floor 0.90; v5 = 0.95).
set -e
cd /Users/joelhagvall/Documents/GitHub/maskera/training
export PYTORCH_ENABLE_MPS_FALLBACK=1 TOKENIZERS_PARALLELISM=false
PY=.venv/bin/python
echo "[0/6] build data (synthetic + klintan + sucx + sic2 + massive)..."
node generate_data.mjs
node convert_klintan.mjs
node convert_sucx.mjs
node convert_sic2.mjs
node convert_massive.mjs
node audit_data.mjs
echo "[1/6] train teacher model-v11 (log: run_v11-teacher.log)..."
$PY train.py model-v11 >run_v11-teacher.log 2>&1
echo "[2/6] distill student-v11 (log: run_v11-distill.log)..."
$PY distill.py 6 student-v11 model-v11 >run_v11-distill.log 2>&1
echo "[3/6] trim vocab..."
$PY trim_vocab.py student-v11 student-v11-trimmed 16000
echo "[4/6] export onnx..."
rm -rf student-v11-onnx
$PY export_onnx.py student-v11-trimmed student-v11-onnx
echo "[5/6] q4 combo..."
$PY quantize_combo.py student-v11-onnx
echo "[6/6] eval..."
cd /Users/joelhagvall/Documents/GitHub/maskera/apps/demo
cat > _v11.mjs <<'JS'
import { readFileSync } from "node:fs"; import { resolve } from "node:path"
import { createNerRecognizer } from "maskera"
const TYPES=["PER","LOC","ORG","ADR"], RE=/\[(PER|LOC|ORG|ADR):([^\]]+)\]/g
function gold(p){const o=[];for(let l of readFileSync(p,"utf-8").split("\n")){if(!l.trim()||l.trimStart().startsWith("#"))continue;let t="",pos=0,m;const s=[];RE.lastIndex=0;while((m=RE.exec(l))){t+=l.slice(pos,m.index);const st=t.length;t+=m[2];s.push([st,st+m[2].length,m[1]]);pos=m.index+m[0].length}t+=l.slice(pos);o.push({text:t,spans:s})}return o}
const ov=(a,b)=>Math.max(a[0],b[0])<Math.min(a[1],b[1])
function sc(g,p,ty){const u=new Set();let tp=0;for(const x of g)for(let i=0;i<p.length;i++){if(u.has(i))continue;if(ty&&p[i][2]!==x[2])continue;if(ov(p[i],x)){tp++;u.add(i);break}}return [tp,p.length-tp,g.length-tp]}
const rec=createNerRecognizer({model:"student-v11-onnx",localModelPath:resolve(process.cwd(),"../../training")+"/",allowLocalModels:true,allowRemoteModels:false,dtype:"q4",device:"cpu",labelMap:g=>g})
await rec.ready
const f=t=>{const[tp,fp,fn]=t,P=tp/(tp+fp||1),R=tp/(tp+fn||1);return (2*P*R/((P+R)||1)).toFixed(3)+` (P ${P.toFixed(2)} R ${R.toFixed(2)})`}
let goldRealRecall=0
for(const [name,path] of [["our","../../training/eval/gold.txt"],["gold-real","../../training/eval/gold-real.txt"]]){
 const ex=gold(resolve(process.cwd(),path)); let A=[0,0,0]
 for(const e of ex){const pr=(await rec.detect(e.text)).filter(d=>TYPES.includes(d.label)).map(d=>[d.start,d.end,d.label]);const r=sc(e.spans,pr,true);A=A.map((v,i)=>v+r[i])}
 if(name==="gold-real"){const[tp,,fn]=A;goldRealRecall=tp/(tp+fn||1)}
 console.log("RESULT "+name+": "+f(A))}
// acronym + real-org + chat-register spot checks
for(const t of ["Sätt in EKG-svar i journalen.","Betalkonto IBAN anges nedan.","Jag jobbar på SEB och handlar på ICA.","Kontoret ligger nära Spotify och Volvo.","hejhej det är fatima igen, hör av dig när du kan","RING LARS NORDSTRÖM","skriv ett mejl till john och lennart","hej jag heter nadia saleh och bor i malmö"]){
 const d=await rec.detect(t); console.log("SPOT: "+t+" -> "+(d.map(x=>x.value+"="+x.label).join(", ")||"(inget)"))}
// GATE on the quantized artifact (it is what ships): leaks are the safety
// metric, so a run whose q4 gold-real recall regresses must not be accepted.
const FLOOR=Number(process.env.GOLDREAL_RECALL_FLOOR ?? "0.90")
if(goldRealRecall<FLOOR){console.error("GATE FAIL: quantized gold-real recall "+goldRealRecall.toFixed(2)+" < floor "+FLOOR+", do not ship");process.exitCode=1}
else
console.log("GATE PASS: quantized gold-real recall "+goldRealRecall.toFixed(2)+" >= floor "+FLOOR)
JS
node _v11.mjs || { rm -f _v11.mjs; echo "[failed gate]"; exit 1; }
rm -f _v11.mjs
echo "[done]"
