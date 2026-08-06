# Roadmap

The thesis: become **the default privacy layer for AI apps in the Nordics**,
not "a Swedish PII model". The model is a detail; the developer experience is
the product.

Forward-looking only. Current numbers live in [`BENCHMARKS.md`](BENCHMARKS.md),
the training journey in [`training/README.md`](../training/README.md), and
per-package history in the changelogs.

## Privacy-clean release line

- [x] Public and pseudo-labelled corpora removed from the active training
      recipe; the v11-v18 sections below remain as historical audit notes only.
- [x] Task training is generator-only. A fail-closed identifier audit rejects
      account, identity, contact, payment, network, and postal identifiers,
      including reserved test values.
- [x] Exact data, generator, audit-code, and pinned KB-BERT revision hashes
      travel with every artifact in `privacy-attestation.json`; train,
      distill, trim, export, and publish reject legacy weights.
- [x] Every q4 quality gate passes and the v19 benchmark snapshot
      carriers have been remeasured and synchronized.
- [x] Publish the attested weights, update the source Hub/npm/demo pins and
      switch every model-status marker from candidate to published.
- [ ] Publish the versioned npm packages after the human completes the
      interactive npm 2FA step. See
      [TRAINING_DATA_PROTECTION.md](TRAINING_DATA_PROTECTION.md).

## Shipped

- **Rules layer** (`@maskera/core`): format-aware structured detectors with
  selective checksums, stable placeholders + restore map, deterministic
  overlap resolution, zero dependencies.
- **Hybrid model layer** (`maskera`): Transformers.js/ONNX, WASM + WebGPU,
  rules win on overlap, full `@maskera/core` re-export (one install, one import).
- **Own Swedish model** (`maskera-sv-ner`): KB-BERT fine-tuned, distilled and
  quantized to ~43 MB, hosted on the Hugging Face Hub as the default.
- **v19 privacy-clean model** (2026-08-06): task training rebuilt from the
  pinned KB-BERT base using only attested generator-produced rows; published
  with identifier rejection, exact provenance hashes and synchronized
  Hub/npm/demo pins.
- **v11 real-register round** (2026-07-10): trained on real informal Swedish
  (SUCX 3.0 sample, MASSIVE sv-SE chat register, SIC2 blogs; all CC BY 4.0).
  Lowercase leaks down 24.8% to 20.5%, the tracked chat misses ("fatima")
  fixed at the weight level, ADR eval a clean sweep (21/21 exact, 0 leaks,
  100% precision), and the lowercase gap to KBLab's lowermix closed at a
  tenth of its size. Journal: [training/README.md](../training/README.md).
- **Eval harness with teeth**: gold corpus + independent set, CI gates on every
  push (span-F1 floor, leak ceiling), weekly canary against the live Hub artifact.
- **Live demo** (`apps/demo`): fully client-side, self-hosted model/runtime/fonts,
  zero external requests, CSP-enforced.
- **Production guide**: [`PRODUCTION.md`](PRODUCTION.md).

## Done: v12, the ORG round (2026-07-10, trained, publish HELD)

The category-level gazetteer round + MultiCoNER v2 sv. Full journal with the
four takes AND the publish-hold decision in
[training/README.md](../training/README.md). The candidate
`training/student-v12-onnx` (q4, 42.7 MB) passes every gate, but a
pre-publish probe found it leaks rare decomposed surnames in the target
register where v11 masks them ("hej jag heter tjulander..." unmasked;
gold-real full leaks 1 -> 4 of 58). v11 stays live; v12's data work carries
into v13.

- [x] Category-level gazetteer (startups, multiword authorities, small-biz
      builder), eval entities excluded; MultiCoNER v2 sv converter with class
      audit (`training/convert_multiconer.mjs`).
- [x] Both v11 authority leaks fixed at the weight level (Inspektionen för
      vård och omsorg, Försvarets materielverk); lowercase probes for the
      leak categories all pass.
- [x] Best model so far on gold-real (94.7 F1), curated (97.0), klintan
      lowercase (80.6 F1, leaks 20.5% -> 19.2%).
- [x] **Root-cause find of the round**: `trim_vocab.py` at 16k cut the
      rare-name tail (bare "Provnamn" regression); fixed by trimming at 20k
      (+3.1 MB). Data-level fixes were tried and measurably rejected.
- [ ] **Missed the round's cased-ORG aspiration**: klintan cased ORG recall
      fell 70.9% -> 67.7% (leaks 11.3% -> 12.5%), the third straight release
      where cased-news leaks crept up (8.4 -> 11.3 -> 12.5). Carry to v13.

## Done: v13 decomposed-surname round (PUBLISHED 2026-07-11)

Full journal incl. the pre-publish battery and the accepted
lowercase-encyclopedic trade in [training/README.md](../training/README.md)
(v13 section). Live artifact: take 4 (`student-v13d-onnx`, sha256 7505b72d).

Everything carried out of this round is consolidated in
[the v14 round](#v14-the-informal-register-round-shipped-2026-07-14) below.

- [x] **Decomposed-surname robustness, the publish blocker.**
  - [x] (1) rare-surname chat-register eval built and baselined:
        `training/eval/rare-surnames.txt` (294 sentences, 98 decomposing
        out-of-training surnames) + `packages/ner/eval/benchmark-rare-surnames.mjs`.
        Masked-at-all: v11 94.9% (15 leaks), v12 90.5% (28): confirms the hold.
  - [x] (2) subword replacement during distillation (`MASKERA_SUBWORD_DROPOUT`),
        student on trimmed-vocab tokenizations, teacher on full, word-aligned
        KL. Take 1 alone scored 84.0% (unsupervised continuation subtokens
        gave incoherent B/I chains that reconstruct() rejects); take 2 added
        continuation I- labels: 92.9%, "tjulander" caught in q4, ALL-CAPS
        leaks 8 -> 2, and record gold sets (our 97.9, gold-real 96.6 F1).
  - [x] (3) publish gate v13 > v11: **PASSED by take 4** (96.6% vs 94.9%,
        10 vs 15 leaks) after take 3's support-register frames (94.2%) and
        take 4's eval-near frames. Best model so far on everything else too:
        gold-real 98.3 F1 / 0.98 recall, klintan cased 91.2 span F1 with the
        three-release leak slide broken (8.7%), lowercase 86.3 / 15.5%
        leaks, cased ORG recall 72.5% (v11: 70.9%).
  - [x] Fresh-frame check run (2026-07-11): `--fresh` variant with 18
        disjoint frames confirms the margin is real off-frame (v13d 94.9%
        vs v11 92.2% masked). Carry-over for the next round: rotate the
        PRIMARY gate eval's frames, and fix PER-TYPING of rare names in
        unseen frames (v13d 68.7% vs v11 74.5% fresh-frame typed; masking
        is ahead, labeling lags).
## v14, the informal-register round (SHIPPED 2026-07-14)

Written 2026-07-13 before any v14 training; checkboxes updated with outcomes
after the round. Shipped as take 1 (`student-v14-onnx`, q4 sha256 f4745c72)
with one documented gate exception (G2, see the gate status below and the
[training journal](../training/README.md) v14 section). Everything carried
out of this round is consolidated in
[the v15 round](#done-v15-the-balanced-replay-round-published-2026-07-16) below.

The through-line from the v13 ledger held: **masking leads; typing and the
informal register lag.** Every number referenced lives in
[BENCHMARKS.md](BENCHMARKS.md).

### First, fix the ruler (before any candidate is trained)

- [x] **Rotate the rare-surname gate eval's frames and re-baseline.** Done
      2026-07-14: the 18 fresh frames are the primary gate
      (`eval/rare-surnames.txt`), the v13 frames live on as secondary
      (`--legacy` -> `eval/rare-surnames-legacy.txt`), same 98 surnames
      (byte-identical promotion, so numbers stay comparable). Shipped-v13
      re-baseline on the rotated primary: 94.9% masked / 15 leaks /
      PER-typed 68.7% (legacy: 96.6% / 10 / 92.5%). The v14 bar is >94.9%.
- [x] **Add a public-term retention metric** (over-redaction on PII-free
      text). Done 2026-07-14: `packages/ner/eval/benchmark-retention.mjs`
      grades the 1,524 entity-free klintan test sentences; v13 measures
      99.95% token retention cased / 99.93% lowercase (11 / 17 false-flag
      spans, several of them gold annotation gaps). Row in BENCHMARKS.md.
- [x] **Add a Rampart row to the competitor table.** Done 2026-07-14 (q4 via
      transformers.js): gold-real redaction recall 0.34, typed F1 0.42,
      ORG recall 0% (it has NO organization label); rare-surname eval 45.2%
      masked (all å/ä/ö surnames leak, NFKD stripping). In BENCHMARKS.md
      with the "why Swedish-specific" read.

### The main bet: pseudo-labeled informal Swedish at scale

- [x] **Flashback/Familjeliv pseudo-labeling** (Språkbanken, CC BY 4.0).
      Done 2026-07-14: 400k sentences streamed from four sections
      (`training/extract_informal.py`), double-labeled with the v13-recipe
      teacher + sbx PI-detection (`pseudo_label.py`, both views stored raw
      in `.benchmark/pseudo-labeled.jsonl`: build once, use twice), sampled
      via `convert_pseudo.mjs` (18k train rows, register-gap strata first).
      Measured deviation from this plan: "high-agreement only" does not
      survive contact with sbx (it confirms 12% of teacher PER spans, 0% of
      ORG on a 5k probe), so the policy is teacher-solo at conf >= 0.97 or
      sbx-confirmed at >= 0.85, sbx-only entities drop the row. Details in
      the training journal (v14 section).
- Rampart datapoint that raises the stakes: its 18.5M-param student reports
  98.4% in-distribution recall trained on ~1.65M rows, while our
  from-scratch small student memorised on 24k synthetic rows. A large
  pseudo-labeled corpus is both v14's register fix AND the prerequisite for
  any future ~15 MB student. Build it once, use it twice.
- Data reserves unchanged: **ai4privacy openpii-1.5m (sv)** for ADR only
      (no ORG label: poison for ORG rounds, see the v12 notes). Dead ends
      already checked, do not re-research: SweLL (research-only),
      MultiNERD/WikiNEuRal (no Swedish), polyglot_ner (unknown license),
      Twittermix (no full-text download). No public Swedish chat/support NER
      dataset exists.

### Targeted weight-level fixes (each needs data in the training mix)

- [x] **Lowercase declarative-prose name frames** (partial). 10
      declarative/encyclopedic frames added to the generator; the probe
      shape is fixed at the weight level ("provnamn har varit engagerad ..."
      tags PER) and gold-real forced-lowercase coverage moved 48 -> 50/58,
      but the FULL fix (>= 51) did not land: both v14 takes leak the same
      bare-lowercase-surname declarative core, and an LC_AUG 0.40 take
      proved the residue is not augmentation-limited. Next lever is either
      distill-side PER weighting or a bare-surname slot CONFINED to
      sentence-initial declarative frames behind a sweep (v12c poisoned
      via prepositional frames; do not skip the sweep).
- [x] **Short-form chat nicknames**: done 2026-07-14. 24-nickname
      gazetteer (micke/bettan themselves excluded so the probe measures
      category generalisation) + 7 chat frames; "micke o bettan kommer vid
      åtta" now tags both PER, lowercase "anna" fixed, LinkedIn corpus
      96.3 -> 98.1 F1 with 0 leaks.
- [ ] **PER-typing of rare names in unseen frames**: NOT attempted at the
      weight level this round (one mechanics change per round; the v14
      candidate is data-only). Where it moved anyway: rotated-primary
      typing v14a 66.3% (still lagging), and the LC_AUG 0.40 take showed
      74.5% is reachable but traded masked recall for it. The distill-side
      B-PER/I-PER consistency weighting stays queued.
- [x] **Cased-news ORG** (met without the SUCX sweep): v14a cased ORG
      recall 77.3% (v13: 72.5%) and cased leaks 7.0% (best ever), with the
      municipal suffix families grown to 50+ instances; the
      "bygglovsavdelningen i kommunen" probe finally tags ORG, so the
      category generalises at 50+ where 10 failed. Short brand names (Voi,
      Northmill, Knowit) remain the open subclass; `SUCX_SHARE` 0.35 was
      not needed this round and stays available.

### Publish gates (all vs the shipped v13 artifact, q4, full pipeline)

Status 2026-07-14, candidate `training/student-v14-onnx` (take 1; the
LC_AUG-0.40 take 2 is graded in the journal and not selected):

1. [x] Rotated rare-surname gate: masked-at-all must BEAT the re-baselined
   v13, not tie it. **PASS: 98.3% / 5 leaks vs 94.9% / 15.**
2. [ ] gold-real forced-lowercase coverage back to >= 51/58 (the v11 level)
   without giving back the chat-register wins. **FAIL by one: 50/58**
   (v13 shipped at 48; the chat wins all held). The open publish question:
   accept 50 documented, or hold for a take 3 with a new lever.
3. [x] klintan leaks: cased <= 8.7%, lowercase <= 15.5%. **PASS: 7.0% /
   15.2%, cased is a release best.**
4. [x] ADR eval stays a clean sweep. **PASS: 100.0 F1, 0 leaks, 0 flags.**
5. [x] Standing CI gates. **PASS: curated 99.5 span F1, 1 leak (Fiktivbolaget).**

### Explicitly NOT this round

- No architecture change and no ~15 MB student yet: that work starts only
  once the pseudo-label corpus exists (see above) and a use case demands
  the size.
- No new entity classes: the four-class scheme (PER/LOC/ORG/ADR) is what the
  placeholder layer and every eval are built around. Structured types keep
  living in the rules layer, where deterministic format logic beats any model
  (Rampart's own ML-side government-ID recall is ~68%; rules are the right tool).

## Done: v18, the density-guard round (PUBLISHED 2026-07-19)

The round the v17 hold prescribed, and the first release whose battery
passes **all five gates with no documented exception** (v14 carried G2,
v15 carried `Festen`). Two levers, both in `training/convert_pseudo.mjs`,
nothing else changed vs v17: an entity-density guard (empty pseudo rows
capped against the ACTUAL appended sample, so the exhausted ~15k-entity
pool can no longer be padded with O rows) and a news-register scrub (rows
where a famous lowercase entity is untagged by the teacher are dropped as
slot poison). Results: G2 **53/58** and rare-surname PER-typing **78.2%**
(both best measured), G1 99.3% masked / 2 leaks (ties v15's best), klintan
cased leaks 7.0% (equal best), ADR a true 35/35 clean sweep with the
`Festen` over-redaction FIXED, curated 0 leaks again, LinkedIn 0 leaks
("KTH" fixed). Documented costs, all ungated: klintan lowercase 14.2% (vs
13.8; 30 new / 25 fixed, ordinary churn, not v17's famous-entity pattern),
a second gold-real leak (sentence-initial bare "Provnamn" in declarative
prose, the standing residue in cased form, weighed explicitly in the
publish decision), and the ALL-CAPS "RING PROVNAMN OMGÅENDE" spot probe
regressed to missed. Numbers: [BENCHMARKS.md](BENCHMARKS.md); full round:
the training journal.

## Done: v15, the balanced-replay round (PUBLISHED 2026-07-16)

Written 2026-07-14, right after the v14 publish. What v14 measurably left on
the table, in priority order; every number is in
[BENCHMARKS.md](BENCHMARKS.md) or the [training journal](../training/README.md).

Status update 2026-07-15: the seed replicate and both isolated v15 levers are
complete. Decomposed-PER weights 1.5 and 2.0 move G2 from 50/58 to 51/58 but
add the same `Festen` -> PERSON false positive; 1.5 also misses
`Centralstationen`. The confined 240/20 bare-surname data candidate raises
student validation F1 from 0.9563 to 0.9573 but moves G2 backward to 49/58,
raises rotated rare-name leaks from 4 to 6, and breaks the ADR clean sweep with
the same `Festen` false positive. A 120/10 half-dose was stopped after its
teacher underperformed the seed baseline. Neither lever ships; v14 remains
live. Detailed tables and the stop rationale are in the training journal.

Final status 2026-07-16 (balanced class replay, SHIPPED as v2 of four doses):
the balanced replay fixed the headline target. Four dose variants were trained
and graded (full battery tables in the training journal); each moved exactly
one borderline sentence-initial span at the cost of another, establishing that
the sentence-initial boundary is **zero-sum across classes**. The shipped
candidate `student-v15-balanced2-onnx` (5-way dose: bare-PER / LOC / ORG /
ADR / common-word negative, 240 each) delivers **G2 = 51/58** (the v11 level,
retiring v14's documented exception), best-ever rare-surname masking (99.3% /
2 leaks) WITH best-ever PER-typing (71.4%), the first zero-leak curated run
(sentence-initial "Fiktivbolaget" fixed after ten releases), and klintan-lowercase
leaks at 13.8% (best ever). Its one documented exception: the ordinary word
`Festen` is tagged PERSON in one ADR-corpus distractor sentence, a harmless
over-redaction (0 leaks; every address metric stays a 100% clean sweep). A
post-publish v5 dose (negatives restored to 25%, funded from ADR) was
rejected at the teacher screen (val F1 0.9657 vs baseline 0.9696, ORG
eroded): the dose-ratio game is played out, and clearing the `Festen`
exception needs a different idea; see the journal.

### The headline target: bare lowercase surnames in declarative prose

- [x] **The G2 residue, shipped as a documented exception, has now had both
      isolated v15 levers tested and rejected** (gold-real
      forced-lowercase 50/58 vs the 51/58 bar; v11 had 51, v13 shipped 48).
      The remaining leaks are 3x bare "provnamn" in declarative shapes
      ("provnamn har varit engagerad i ...") plus rare LOC/ORG. v14
      established two facts the next attempt must respect: full-name
      declarative frames fix the PROBE shape but do not transfer to bare
      surnames, and the residue is NOT augmentation-limited (take 2 at
      LC_AUG 0.40 moved nothing on G2). Two candidate levers, each its own
      run: (a) distill-side B-PER/I-PER consistency weighting on
      decomposed names (also the typing lever below) -- tested at 1.5 and 2.0;
      both reach 51/58 but fail the clean-sweep precision gate, so this lever
      stays off; (b) a bare-surname slot CONFINED to sentence-initial
      declarative frames, behind a
      proper sweep: v12c poisoned via prepositional "till {bare}" shapes,
      and the sweep must show gold-real recall and curated precision hold --
      tested at 240/20; it recovers one `Provnamn` span but loses `Provhuset`
      and `fiktivpartiet`, so G2 falls to 49/58 and precision also
      regresses. Do not continue either one-sided PER lever.
- [ ] **PER-typing of rare names in unseen frames**, still lagging: v14a
      types 66.3% on the rotated primary vs v13's 68.7% (masking, the
      safety metric, is far ahead at 98.3%). The v14b datapoint to reuse:
      74.5% typed is REACHABLE (above v13) but that take traded masked
      recall (98.3 -> 98.0) and cased ORG for it. The distill-side weighting
      has now had its isolated mechanics round: weight 2.0 moves
      rotated-primary PER typing only 63.3% -> 66.0% on the same seed, while
      adding the `Festen` false positive. That trade is rejected.

### Ruler upkeep (cheap, do first again)

- [x] **Rotate the rare-surname gate frames AGAIN if v15 trains eval-near
      frames.** Not required for this mechanics-only sweep: no data changed,
      both runner audits confirmed the held-out surnames remain absent, and
      the v14 primary frames remain clean.
- [x] **Seed replicate of the v14 recipe** (consciously skipped at publish,
      documented in the journal): completed with `MASKERA_SEED=2024` before
      the v15 sweep. The q4 result holds all safety gates and reproduces G2 at
      50/58, so v15 is not building on a lucky seed.
- [x] **Watch the retention drift**: v14 costs a few more false flags than
      v13 (cased 11 -> 16, "hr" tagged ORG among them; 99.95% -> 99.93%
      token retention). Checked across the seed and weight sweep: cased false
      spans are 18 / 16 / 16 and lowercase 21 / 22 / 21 for weights
      1.0 / 1.5 / 2.0. The 240/20 data candidate gives 14 / 22: cased improves
      slightly and lowercase is flat. Retention is not the reason for its
      rejection; G2, rare-name safety, and the clean-sweep precision gate are.

### Next research direction: balanced class replay

- [ ] **Test a cheap teacher-only dose screen before another full student
      run.** Pair each new bare-PER declarative positive with LOC and ORG
      positives in analogous syntax plus capitalized common-word negatives.
      The goal is to preserve the local `Provnamn` gain without shifting the
      boundary away from `Provhuset`, organizations, or ordinary words such
      as `Festen`.
- [ ] **Keep the experiment independent of the rulers.** Do not train exact
      G2 names, `Festen`, `Fiktivbolaget`, or strict-corpus sentences; use category
      analogues and reserve new held-out frames before generation.
- [ ] **Only distill a student if a small dose clears the teacher screen.**
      Require no loss on per-class validation F1 and no new false positives on
      the strict corpora before spending the extra hour on distillation and q4.

### Standing weaknesses (unchanged by v14, keep on the list)

- [ ] **Lowercase still trails cased** on the big held-out set (leaks 14.2%
      vs 7.0%; lowercase ORG 60.1%, v18 numbers). The arc: v14's pseudo
      corpus barely moved the needle (15.5 -> 15.2), v15's balanced replay
      took it to 13.8, naive sample growth was FALSIFIED by the held v17
      round (66k pseudo diluted famous lowercase ORG/LOC, 16.5%), and the
      v18 density guard + news scrub recovered the class (14.2%, ordinary
      churn instead of systematic famous-entity leaks) while taking the
      encyclopedic-lowercase G2 to its best (53/58). The pseudo-pool lever
      is now a legacy result: public pseudo-labelled rows are not eligible for
      the privacy-clean line. What remains is broader generator coverage,
      checked against independently authored fictional evaluation and optional
      partner-side aggregate validation.
- [ ] **Bare-surname declaratives, now in CASED form too**: v18's
      accepted cost is a second gold-real leak, sentence-initial bare
      "Provnamn" in "Provnamn är gift med ...". The lowercase variant is the
      long-standing G2 residue; the cased surfacing is new. Both v15
      one-sided levers failed on this class and the balanced-replay
      dose-ratio game is played out (v5 teacher-screen reject), so the
      next attempt needs a new privacy-clean idea (a targeted synthetic
      category family swept against every precision gate, without copying
      evaluation strings).
- [ ] **Short brand names** (Voi, Northmill, Knowit): the one ORG subclass
      the v12-v14 gazetteer arc did not dent; a LENGTH problem. Candidate
      ideas unchanged: context weighting or a rules-layer assist in
      `@maskera/core`.
- [ ] **The published known misses**: gold-real metonymic "Provhuset"
      (since v13) and, new in v18, gold-real sentence-initial bare
      "Provnamn" in declarative prose (the bare-surname residue in cased
      form; see the entry above). v15's "Festen" over-redaction is FIXED
      by v18. The ALL-CAPS spot probe "RING PROVNAMN OMGÅENDE" regressed to
      missed in v18 (v15 caught it; v11-v14 missed it; a journal spot
      check, not part of a graded corpus). The curated "Fiktivbolaget" classic
      stays fixed (second zero-leak curated run in a row). Nothing here is
      gated; the graded entries are documented in BENCHMARKS.md's
      known-misses table.
- [ ] **Lowercase nicknames mid-sentence are context-dependent** (found by
      the 2026-07-16 free-text probe sweep): "micke på ekonomiavdelningen"
      is caught, "bråket mellan mig och micke i grannsamfälligheten" leaks.
      Both tracked in `corpus-freetext.mjs`; the concrete bar for the next
      informal-register round. Same sweep's precision inventory (87.7% on
      freetext; sentence-initial verbs, "Pat"/"pat", product names,
      "regionchef Syd", departments as ORG) is the negative-frame dose
      candidate list; full findings in training/README.md.
- [x] **Swedish address robustness: RESOLVED at the pipeline level 2026-07-16**
      (the v16 round). Historical failures covered saint/colon prefixes,
      free-word endings, rural/farm shapes, abbreviations, detached letters,
      number ranges and the quay suffix family. Reconstruction widening fixed
      the material house-number boundary; the weight-level candidate was held
      for unrelated gate regressions. On 2026-08-06 every ordinary
      street/number surface was removed from active training/eval and replaced
      with explicit synthetic markers. Historical aggregates remain. Published
      v19 was re-measured on the revised corpus on 2026-08-06:
      100.0% label-agnostic span precision/recall/F1, 0/57 leaks, and all 35
      addresses exact and labeled ADDRESS. One organisation is typed ADDRESS,
      so labeled F1 is 96.5%.

### Unlocked but not started

- [ ] **The ~15 MB student**: requires an architecture/quantization experiment
      on the attested synthetic-only recipe. The old public-text pseudo-label
      pool was deleted and is not an eligible prerequisite.

## Next: independent evaluation and generator coverage

- [ ] **Larger source-isolated synthetic gold set.** The old raw external set
      was removed. Privacy-clean v19 also excludes Swedish NER
      Corpus from task training, but a fresh independently authored fictional
      target-register set is still needed to measure honestly. Plan +
      writer brief ready: [GOLD_SET_PLAN.md](GOLD_SET_PLAN.md),
      [GOLD_SET_STAGE2_PROMPTS.md](GOLD_SET_STAGE2_PROMPTS.md).
- [ ] **Target-domain evaluation** (support / healthcare / legal): collect
      300-500 independently authored, fully fictional annotated messages for
      held-out evaluation, plus optional private aggregate-only partner runs.
      Do not retain consented real messages or append eval rows to task
      training. Error families may inspire generator templates, but exact
      strings and identifiers must not be copied.
- [ ] **A messier eval** to match: tickets, email, chat, OCR noise, lowercase,
      slang, misspellings, so the numbers reflect the target domain, not clean prose.
      Two domain corpora exist: `packages/ner/eval/corpus-linkedin.mjs`
      (32 docs of recruiter mail / posts / bios) and, since 2026-07-16,
      `packages/ner/eval/corpus-freetext.mjs` (29 PII-dense docs in the
      demo's industry registers: HR, kundtjänst, vård, juridik, kommun,
      bank; v15 baseline 91.2 span F1 / 1 leak). Both graded via
      `CORPUS_FILE=`. Remaining: OCR noise and misspellings.
- [ ] **Model-assisted evaluation annotation** to make the above affordable:
      pre-label with the current model or an LLM, then human-correct. Keep the
      resulting corpus outside the training path.
- [ ] **Design-partner evaluation** once a pilot exists. Run the fixed artifact
      inside the partner's environment and export aggregate metrics only; do
      not receive partner text, identifiers, predictions, missed values or
      customer-specific facit, and never move them into model weights.

## Next: coverage & DX

- [x] **Demo publicly deployed:** [maskera.dev](https://maskera.dev).
- [ ] More structured detectors: bank account (clearing + number), IBAN mod-97
      validation, VAT numbers, IPv6.
- [ ] `confidence` scores per detection.
- [ ] `npx maskera` CLI: mask a file or stdin straight from the terminal,
      no code written. The shortest onboarding that exists (beats even
      `npm install` + first snippet), and the natural shape for log masking
      in scripts/CI pipelines. Rules-only mode runs instantly via
      `@maskera/core`; `--ner` downloads the model on first run.
- [ ] `redactStream()` for chat-as-you-type.
- [ ] Smaller model (fewer layers / MiniLM-class, toward ~15 MB) if a use
      case demands it; quality starts to cost below 40 MB with today's data.
      Rampart proves the size class works (14.7 MB, 18.5M params) given
      ~1.65M training rows; the v14 pseudo-label corpus is the prerequisite,
      not an architecture search.

## Framework wrappers: when demand exists

`@maskera/core` already works in React and Node today (it's just functions), so
wrappers are DX conveniences, not capability. Built when real users ask, not
speculatively:

- **`@maskera/node` first** (most LLM calls are server-side): Express middleware
  `app.use(maskera())`, AI-SDK wrappers like `withPrivacyGuard(openai)`.
- **`@maskera/react`** if there's pull: `usePrivacyGuard()` and a
  `<RedactedInput />` showing "3 känsliga uppgifter skyddades".
