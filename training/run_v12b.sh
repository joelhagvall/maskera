#!/bin/sh
# v12 take 2: recovery finetune after the trim-mismatch diagnosis.
# Take 1 failed the gate at 0.8996 gold-real recall; bisection (q4 = q8 = fp32,
# teacher 1.00 on every miss, pre-trim student 1.00, trimmed student misses)
# located the damage in trim_vocab.py: the student is distilled with the full
# 50k vocab where rare names ("Löfven") are single tokens, then trimming makes
# them decompose (L ##ö ##f ##ven) at inference, a tokenization the weights
# never trained on. v11 survived the same mismatch on the margin; the v12 mix
# made it visible.
# Fix: one epoch of finetune_student.py on the TRIMMED student, so its own
# trimmed tokenizer decomposes the rare-name tail of klintan/SUCX during
# training, giving real signal for decomposed capitalized names.
set -e
cd /Users/joelhagvall/Documents/GitHub/maskera/training
export PYTORCH_ENABLE_MPS_FALLBACK=1 TOKENIZERS_PARALLELISM=false
PY=.venv/bin/python
echo "[1/4] recovery finetune student-v12-trimmed -> student-v12b-trimmed (log: run_v12b-finetune.log)..."
$PY finetune_student.py student-v12-trimmed student-v12b-trimmed 1 1e-5 >run_v12b-finetune.log 2>&1
echo "[2/4] export onnx..."
rm -rf student-v12b-onnx
$PY export_onnx.py student-v12b-trimmed student-v12b-onnx
echo "[3/4] q4 combo..."
$PY quantize_combo.py student-v12b-onnx
echo "[4/4] eval..."
cd /Users/joelhagvall/Documents/GitHub/maskera/apps/demo
cat > _v12b.mjs <<'JS'
import { readFileSync } from "node:fs"; import { resolve } from "node:path"
import { createNerRecognizer } from "maskera"
const TYPES=["PER","LOC","ORG","ADR"], RE=/\[(PER|LOC|ORG|ADR):([^\]]+)\]/g
function gold(p){const o=[];for(let l of readFileSync(p,"utf-8").split("\n")){if(!l.trim()||l.trimStart().startsWith("#"))continue;let t="",pos=0,m;const s=[];RE.lastIndex=0;while((m=RE.exec(l))){t+=l.slice(pos,m.index);const st=t.length;t+=m[2];s.push([st,st+m[2].length,m[1]]);pos=m.index+m[0].length}t+=l.slice(pos);o.push({text:t,spans:s})}return o}
const ov=(a,b)=>Math.max(a[0],b[0])<Math.min(a[1],b[1])
function sc(g,p,ty){const u=new Set();let tp=0;for(const x of g)for(let i=0;i<p.length;i++){if(u.has(i))continue;if(ty&&p[i][2]!==x[2])continue;if(ov(p[i],x)){tp++;u.add(i);break}}return [tp,p.length-tp,g.length-tp]}
const rec=createNerRecognizer({model:"student-v12b-onnx",localModelPath:resolve(process.cwd(),"../../training")+"/",allowLocalModels:true,allowRemoteModels:false,dtype:"q4",device:"cpu",labelMap:g=>g})
await rec.ready
const f=t=>{const[tp,fp,fn]=t,P=tp/(tp+fp||1),R=tp/(tp+fn||1);return (2*P*R/((P+R)||1)).toFixed(3)+` (P ${P.toFixed(2)} R ${R.toFixed(2)})`}
let goldRealRecall=0
for(const [name,path] of [["our","../../training/eval/gold.txt"],["gold-real","../../training/eval/gold-real.txt"]]){
 const ex=gold(resolve(process.cwd(),path)); let A=[0,0,0]
 for(const e of ex){const pr=(await rec.detect(e.text)).filter(d=>TYPES.includes(d.label)).map(d=>[d.start,d.end,d.label]);const r=sc(e.spans,pr,true);A=A.map((v,i)=>v+r[i])}
 if(name==="gold-real"){const[tp,,fn]=A;goldRealRecall=tp/(tp+fn||1)}
 console.log("RESULT "+name+": "+f(A))}
for(const t of ["Sätt in EKG-svar i journalen.","Betalkonto IBAN anges nedan.","Jag jobbar på SEB och handlar på ICA.","Kontoret ligger nära Spotify och Volvo.","hejhej det är fatima igen, hör av dig när du kan","RING LARS NORDSTRÖM","skriv ett mejl till john och lennart","hej jag heter nadia saleh och bor i malmö","jag fick ett brev från inspektionen för strategiska produkter","min faktura från kivra har inte kommit","beslutet från länsstyrelsen i örebro län överklagas","Löfven har varit engagerad i Socialdemokraterna sedan ungdomen.","Den 6 mars 2018 besökte Löfven Vita huset."]){
 const d=await rec.detect(t); console.log("SPOT: "+t+" -> "+(d.map(x=>x.value+"="+x.label).join(", ")||"(inget)"))}
const FLOOR=Number(process.env.GOLDREAL_RECALL_FLOOR ?? "0.90")
if(goldRealRecall<FLOOR){console.error("GATE FAIL: quantized gold-real recall "+goldRealRecall.toFixed(2)+" < floor "+FLOOR+", do not ship");process.exitCode=1}
else
console.log("GATE PASS: quantized gold-real recall "+goldRealRecall.toFixed(2)+" >= floor "+FLOOR)
JS
node _v12b.mjs || { rm -f _v12b.mjs; echo "[failed gate]"; exit 1; }
rm -f _v12b.mjs
echo "[done]"
