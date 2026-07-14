#!/bin/sh
# v14 TAKE 2 (v14b): identical to run_v14.sh except LC_AUG 0.35 -> 0.40.
# Take 1 (v14a) passed G1 (98.3% vs 94.9%), G3 (7.0/15.2 vs ceilings
# 8.7/15.5), G4 (ADR 100, 0 leaks), G5 (curated 99.5, 1 leak: Klarna) but
# failed G2 by ONE sentence (gold-real forced-lowercase coverage 50/58 vs
# 51): remaining leaks are bare lowercase surnames in declarative prose
# ("lofven har varit engagerad ...") plus rare LOC/ORG. Bare-surname slots
# are banned (v12c poison), so the remaining safe lever is whole-sentence
# lowercase augmentation; v10 says sweep it and watch cased precision,
# which gates G3/G5 do. If cased precision falls >1pp vs take 1, 0.40 was
# too high (the v10 lesson) regardless of G2.
# v14b: the informal-register round (docs/ROADMAP.md "Next: v14b"). Ruler was
# fixed FIRST (frame rotation, this round's precondition): the rare-surname
# gate now runs on the rotated primary frames (eval/rare-surnames.txt = the
# v13 fresh-frame set, never trained on), re-baselined for the SHIPPED v13
# artifact at 94.9% masked / 15 leaks (run_v14-raresurnames-rebaseline-v13.log).
#
# Levers in this candidate, all data-side (distill mechanics identical to the
# v13 take-4 recipe: subword replacement 1.0 + continuation I- labels + 20k
# trim; one-mechanics-change-per-round, per the journal):
#   1. ensemble pseudo-labeled informal corpus (Flashback/Familjeliv via
#      extract_informal.py + pseudo_label.py + convert_pseudo.mjs), sampled
#      toward lowercase-PER rows: the ROADMAP main bet;
#   2. lowercase declarative/encyclopedic PER frames (the accepted v13
#      regression) + nickname gazetteer/chat frames in generate_data.mjs;
#   3. municipal AUTHORITIES to 50+ across -avdelningen/-förvaltningen/
#      -nämnden/-kontoret.
#
# Publish gates (docs/ROADMAP.md v14b, all on the QUANTIZED artifact):
#   G1 rotated rare-surname masked recall STRICTLY ABOVE the v13 re-baseline
#   G2 gold-real forced-lowercase coverage >= 51/58 (v11 level)
#   G3 klintan leaks: cased <= 8.7%, lowercase <= 15.5%
#   G4 ADR clean sweep (graded via run-eval.mjs corpus-adr, step 10)
#   G5 standing CI gates (curated span F1 >= 0.90, leak ceiling 0.08)
set -e
cd /Users/joelhagvall/Documents/GitHub/maskera/training
export PYTORCH_ENABLE_MPS_FALLBACK=1 TOKENIZERS_PARALLELISM=false
PY=.venv/bin/python
export LC_AUG=0.40  # take 2: the only change vs run_v14.sh (see header note)
echo "[0/10] build data (synthetic + klintan + sucx + sic2 + massive + multiconer + pseudo)..."
node generate_data.mjs
node convert_klintan.mjs
node convert_sucx.mjs
node convert_sic2.mjs
node convert_massive.mjs
node convert_multiconer.mjs
node convert_pseudo.mjs
node audit_data.mjs
# The rare-surname eval only measures generalisation if its surnames stay out
# of the training data; re-check after every data build (convert_pseudo.mjs
# also pre-filters them, so a failure here means a converter regressed).
node gen_rare_surname_eval.mjs --check
echo "[1/10] train teacher model-v14b (log: run_v14b-teacher.log)..."
$PY train.py model-v14b >run_v14b-teacher.log 2>&1
echo "[2/10] trim teacher vocab -> dropout tokenizer (log: run_v14b-trimtok.log)..."
$PY trim_vocab.py model-v14b model-v14b-trimmed 20000 >run_v14b-trimtok.log 2>&1
echo "[3/10] distill student-v14b with subword replacement (log: run_v14b-distill.log)..."
MASKERA_SUBWORD_DROPOUT=1.0 MASKERA_DROPOUT_VOCAB=model-v14b-trimmed \
  $PY distill.py 6 student-v14b model-v14b >run_v14b-distill.log 2>&1
echo "[4/10] trim student vocab (20000)..."
$PY trim_vocab.py student-v14b student-v14b-trimmed 20000
echo "[5/10] export onnx..."
rm -rf student-v14b-onnx
$PY export_onnx.py student-v14b-trimmed student-v14b-onnx
echo "[6/10] q4 combo..."
$PY quantize_combo.py student-v14b-onnx
echo "[7/10] gold + gold-real (+ forced-lowercase coverage) gates + spot probes (q4)..."
cd /Users/joelhagvall/Documents/GitHub/maskera/apps/demo
cat > _v14b.mjs <<'JS'
import { readFileSync } from "node:fs"; import { resolve } from "node:path"
import { createNerRecognizer } from "maskera"
const TYPES=["PER","LOC","ORG","ADR"], RE=/\[(PER|LOC|ORG|ADR):([^\]]+)\]/g
function gold(p){const o=[];for(let l of readFileSync(p,"utf-8").split("\n")){if(!l.trim()||l.trimStart().startsWith("#"))continue;let t="",pos=0,m;const s=[];RE.lastIndex=0;while((m=RE.exec(l))){t+=l.slice(pos,m.index);const st=t.length;t+=m[2];s.push([st,st+m[2].length,m[1]]);pos=m.index+m[0].length}t+=l.slice(pos);o.push({text:t,spans:s})}return o}
const ov=(a,b)=>Math.max(a[0],b[0])<Math.min(a[1],b[1])
function sc(g,p,ty){const u=new Set();let tp=0;for(const x of g)for(let i=0;i<p.length;i++){if(u.has(i))continue;if(ty&&p[i][2]!==x[2])continue;if(ov(p[i],x)){tp++;u.add(i);break}}return [tp,p.length-tp,g.length-tp]}
const rec=createNerRecognizer({model:"student-v14b-onnx",localModelPath:resolve(process.cwd(),"../../training")+"/",allowLocalModels:true,allowRemoteModels:false,dtype:"q4",device:"cpu",labelMap:g=>g})
await rec.ready
const f=t=>{const[tp,fp,fn]=t,P=tp/(tp+fp||1),R=tp/(tp+fn||1);return (2*P*R/((P+R)||1)).toFixed(3)+` (P ${P.toFixed(2)} R ${R.toFixed(2)})`}
let goldRealRecall=0
for(const [name,path] of [["our","../../training/eval/gold.txt"],["gold-real","../../training/eval/gold-real.txt"]]){
 const ex=gold(resolve(process.cwd(),path)); let A=[0,0,0]
 for(const e of ex){const pr=(await rec.detect(e.text)).filter(d=>TYPES.includes(d.label)).map(d=>[d.start,d.end,d.label]);const r=sc(e.spans,pr,true);A=A.map((v,i)=>v+r[i])}
 if(name==="gold-real"){const[tp,,fn]=A;goldRealRecall=tp/(tp+fn||1)}
 console.log("RESULT "+name+": "+f(A))}
// G2: gold-real FORCED-LOWERCASE coverage (masked-at-all, any label). The
// accepted v13 regression was 48/58 vs v11's 51/58; v14b must restore >= 51.
{
 const ex=gold(resolve(process.cwd(),"../../training/eval/gold-real.txt"))
 let covered=0, total=0
 for(const e of ex){const pr=await rec.detect(e.text.toLowerCase())
  for(const g of e.spans){total++;if(pr.some(d=>ov([d.start,d.end],g)))covered++}}
 console.log(`RESULT goldreal_lower_coverage=${covered}/${total}`)
 if(covered<51){console.error("GATE FAIL (G2): forced-lowercase coverage "+covered+"/58 < 51, the v11 level");process.exitCode=1}
 else console.log("GATE PASS (G2): forced-lowercase coverage "+covered+"/"+total+" >= 51")
}
// spot checks: v13 battery probes + the v14b targets (nickname chat pair,
// lowercase declarative name frame, linkedin lowercase first name)
for(const t of ["Sätt in EKG-svar i journalen.","Betalkonto IBAN anges nedan.","Jag jobbar på SEB och handlar på ICA.","Kontoret ligger nära Spotify och Volvo.","hejhej det är fatima igen, hör av dig när du kan","RING LARS NORDSTRÖM","skriv ett mejl till john och lennart","hej jag heter nadia saleh och bor i malmö","jag fick ett brev från inspektionen för strategiska produkter","min faktura från kivra har inte kommit","beslutet från länsstyrelsen i örebro län överklagas","hej det är löfven igen, ringde igår om fakturan","be löfven återkomma imorgon","hej jag heter tjulander och min beställning saknas","RING LÖFVEN OMGÅENDE","ärendet skickades vidare till bygglovsavdelningen i kommunen","micke o bettan kommer vid åtta","löfven har varit engagerad i arbetarrörelsen hela sitt liv","anna har lång erfarenhet av rekrytering och hr"]){
 const d=await rec.detect(t); console.log("SPOT: "+t+" -> "+(d.map(x=>x.value+"="+x.label).join(", ")||"(inget)"))}
const FLOOR=Number(process.env.GOLDREAL_RECALL_FLOOR ?? "0.90")
if(goldRealRecall<FLOOR){console.error("GATE FAIL: quantized gold-real recall "+goldRealRecall.toFixed(2)+" < floor "+FLOOR+", do not ship");process.exitCode=1}
else
console.log("GATE PASS: quantized gold-real recall "+goldRealRecall.toFixed(2)+" >= floor "+FLOOR)
JS
node _v14b.mjs | tee ../../training/run_v14b-goldgates.log || { rm -f _v14b.mjs; echo "[failed gate]"; exit 1; }
rm -f _v14b.mjs
echo "[8/10] G1 rotated rare-surname gate: v14b must BEAT the v13 re-baseline..."
cd /Users/joelhagvall/Documents/GitHub/maskera
MASKERA_MODEL_PATH="$PWD/training" MASKERA_MODEL=student-v14b-onnx \
  node packages/ner/eval/benchmark-rare-surnames.mjs | tee training/run_v14b-raresurnames-v14b.log
BENCHMARK_FILE=training/eval/rare-surnames-legacy.txt MASKERA_MODEL_PATH="$PWD/training" MASKERA_MODEL=student-v14b-onnx \
  node packages/ner/eval/benchmark-rare-surnames.mjs | tee training/run_v14b-raresurnames-v14b-legacy.log
node -e '
const fs = require("node:fs")
const parse = (p) => {
  const m = fs.readFileSync(p, "utf8").match(/RESULT masked_recall=([\d.]+) per_recall=([\d.]+) leaks=(\d+)\/(\d+)/)
  if (!m) { console.error("no RESULT line in " + p); process.exit(1) }
  return { masked: +m[1], per: +m[2], leaks: +m[3] }
}
const v14b = parse("training/run_v14b-raresurnames-v14b.log")
const v13 = parse("training/run_v14-raresurnames-rebaseline-v13.log")
console.log(`rotated rare-surname masked recall: v14b ${v14b.masked} (${v14b.leaks} leaks) vs v13 ${v13.masked} (${v13.leaks} leaks); PER-typed ${v14b.per} vs ${v13.per}`)
if (v14b.masked > v13.masked) console.log("GATE PASS (G1): v14b beats the re-baselined v13")
else { console.error("GATE FAIL (G1): v14b does not beat the re-baselined v13, do not ship"); process.exit(1) }
'
echo "[9/10] G3 klintan leak ceilings (cased <= 8.7%, lowercase <= 15.5%)..."
MASKERA_MODEL_PATH="$PWD/training" MASKERA_MODEL=student-v14b-onnx \
  node packages/ner/eval/benchmark-swedish-ner.mjs | tee training/run_v14b-klintan-cased.log
LOWERCASE=1 MASKERA_MODEL_PATH="$PWD/training" MASKERA_MODEL=student-v14b-onnx \
  node packages/ner/eval/benchmark-swedish-ner.mjs | tee training/run_v14b-klintan-lower.log
node -e '
const fs = require("node:fs")
const leak = (p) => {
  const m = fs.readFileSync(p, "utf8").match(/leaks \(missed\):\s+\d+\s+\((\d+\.?\d*)% of gold\)/)
  if (!m) { console.error("no leak line in " + p); process.exit(1) }
  return +m[1]
}
const cased = leak("training/run_v14b-klintan-cased.log")
const lower = leak("training/run_v14b-klintan-lower.log")
console.log(`klintan leaks: cased ${cased}% (ceiling 8.7), lowercase ${lower}% (ceiling 15.5)`)
if (cased <= 8.7 && lower <= 15.5) console.log("GATE PASS (G3): no new leak slide")
else { console.error("GATE FAIL (G3): klintan leak ceiling exceeded"); process.exit(1) }
'
echo "[10/10] strict harness (G5 curated + G4 ADR + linkedin) + retention..."
MASKERA_MODEL_PATH="$PWD/training" MASKERA_MODEL=student-v14b-onnx MASKERA_F1_FLOOR=0.90 \
  node packages/ner/eval/run-eval.mjs | tee training/run_v14b-strict-curated.log
CORPUS_FILE=./corpus-adr.mjs MASKERA_MODEL_PATH="$PWD/training" MASKERA_MODEL=student-v14b-onnx \
  node packages/ner/eval/run-eval.mjs | tee training/run_v14b-strict-adr.log
CORPUS_FILE=./corpus-linkedin.mjs MASKERA_MODEL_PATH="$PWD/training" MASKERA_MODEL=student-v14b-onnx \
  node packages/ner/eval/run-eval.mjs | tee training/run_v14b-strict-linkedin.log
MASKERA_MODEL_PATH="$PWD/training" MASKERA_MODEL=student-v14b-onnx \
  node packages/ner/eval/benchmark-retention.mjs | tee training/run_v14b-retention-v14b.log
LOWERCASE=1 MASKERA_MODEL_PATH="$PWD/training" MASKERA_MODEL=student-v14b-onnx \
  node packages/ner/eval/benchmark-retention.mjs | tee training/run_v14b-retention-v14b-lower.log
echo "[done] v14b candidate complete; grade the full battery before any publish decision."
