#!/bin/sh
set -e
cd /Users/joelhagvall/Documents/GitHub/maskera/training
export PYTORCH_ENABLE_MPS_FALLBACK=1 TOKENIZERS_PARALLELISM=false
PY=.venv/bin/python
echo "[1/6] waiting for teacher (model-v3)..."
while ! grep -qa "saved model to model-v3" teacherv3.log 2>/dev/null; do sleep 10; done
echo "[2/6] distilling student-v3 from model-v3..."
$PY distill.py 6 student-v3 model-v3 >/dev/null 2>&1
echo "[3/6] trimming vocab..."
$PY trim_vocab.py student-v3 student-v3-trimmed 16000 >/dev/null 2>&1
echo "[4/6] exporting onnx..."
$PY export_onnx.py student-v3-trimmed student-v3-onnx >/dev/null 2>&1
echo "[5/6] q4 combo..."
$PY quantize_combo.py student-v3-onnx >/dev/null 2>&1
echo "[6/6] evaluating..."
cd /Users/joelhagvall/Documents/GitHub/maskera/apps/demo
cat > _ev3.mjs <<'JS'
import { readFileSync } from "node:fs"; import { resolve } from "node:path"
import { createNerRecognizer } from "maskera"
const TYPES=["PER","LOC","ORG","ADR"], RE=/\[(PER|LOC|ORG|ADR):([^\]]+)\]/g
function gold(p){const o=[];for(let l of readFileSync(p,"utf-8").split("\n")){if(!l.trim()||l.trimStart().startsWith("#"))continue;let t="",pos=0,m;const s=[];RE.lastIndex=0;while((m=RE.exec(l))){t+=l.slice(pos,m.index);const st=t.length;t+=m[2];s.push([st,st+m[2].length,m[1]]);pos=m.index+m[0].length}t+=l.slice(pos);o.push({text:t,spans:s})}return o}
const ov=(a,b)=>Math.max(a[0],b[0])<Math.min(a[1],b[1])
function sc(g,p,typed){const u=new Set();let tp=0;for(const x of g)for(let i=0;i<p.length;i++){if(u.has(i))continue;if(typed&&p[i][2]!==x[2])continue;if(ov(p[i],x)){tp++;u.add(i);break}}return [tp,p.length-tp,g.length-tp]}
const ex=gold(resolve(process.cwd(),"../../training/eval/gold.txt"))
const rec=createNerRecognizer({model:"student-v3-onnx",localModelPath:resolve(process.cwd(),"../../training")+"/",allowLocalModels:true,allowRemoteModels:false,dtype:"q4",device:"cpu"})
await rec.ready
let A=[0,0,0],B=[0,0,0]
for(const e of ex){const pr=(await rec.detect(e.text)).filter(d=>TYPES.includes(d.label)).map(d=>[d.start,d.end,d.label]);let r=sc(e.spans,pr,true);A=[A[0]+r[0],A[1]+r[1],A[2]+r[2]];r=sc(e.spans,pr,false);B=[B[0]+r[0],B[1]+r[1],B[2]+r[2]]}
const f=(t)=>{const[tp,fp,fn]=t,P=tp/(tp+fp),R=tp/(tp+fn);return (2*P*R/(P+R)).toFixed(3)+" (P "+P.toFixed(2)+" R "+R.toFixed(2)+")"}
console.log("RESULT type-aware F1: "+f(A))
console.log("RESULT redaction recall (any label): "+f(B))
JS
node _ev3.mjs; rm -f _ev3.mjs
echo "[done]"
