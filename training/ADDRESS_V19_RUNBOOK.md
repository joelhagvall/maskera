# Privacy-clean address release runbook

This runbook produced the synthetic-only v19 release. Historical OSM and
ordinary-street address experiments are retired and are not release inputs.

## Non-negotiable rules

- Every generated and annotated ADR span must contain an explicit synthetic
  marker accepted by `assertSyntheticAddressSpans` (`Maskera`, `Provdata`,
  `Fiktiv`, `Exempeldata`, `Syntet`, `Testkorpus`, `Dataskyddstest`,
  `Nollpost` or another reviewed marker family).
- Do not use a randomly composed ordinary Swedish street plus house number;
  it can accidentally resolve to a real property.
- No postcodes, property designations, case ids, vehicle registrations,
  contacts, account values or other record-linkable numbers enter task data.
- Do not use public address corpora, map exports, customer text, eval strings
  or pseudo-labels for training, distillation or vocabulary selection.
- Candidate logs retain aggregates only and are deleted after grading.

## Build and audit

From `training/`:

```bash
BALANCED_REPLAY_TRAIN_ROWS=1200 BALANCED_REPLAY_VAL_ROWS=200 \
HARD_NEGATIVE_TRAIN_ROWS=2800 HARD_NEGATIVE_VAL_ROWS=560 \
  node generate_data.mjs 60000 4000
node audit_data.mjs
node privacy_attestation.mjs
node verify_attestation.mjs data/privacy-attestation.json
node --test privacy_guard.test.mjs privacy_attestation.test.mjs
```

The manifest must state `addressPolicy: explicit-synthetic-marker`. Any data,
generator, privacy-guard, audit, attestation-builder or verifier change after
that point invalidates the run and requires regeneration and retraining.

## Train and grade

```bash
MASKERA_SEED=1337 CANDIDATE=v19-privacy-precision2 ./run_v14.sh
```

The historical filename is retained for compatibility; the script itself is
the privacy-clean runner. It trains from the pinned KB-BERT revision, carries
the attestation through teacher, student, trim, ONNX and q4, and runs:

1. aggregate synthetic-gold type F1 and masked-recall floors;
2. aggregate-only rare-surname coverage;
3. attestation, data and repository-fixture audits;
4. synthetic curated, ADR and LinkedIn-style regression corpora.

Do not weaken a gate to select a candidate. A failed gate is a publish hold.

## Selection and publication boundary

- Delete run logs after extracting aggregate results.
- Verify the final ONNX directory's `privacy-attestation.json` against the
  current checkout.
- Rebuild and verify the whitepaper after any metric or provenance change.
- Run `MODEL_SRC=student-v19-privacy-precision2-onnx DRY_RUN=1 ./scripts/publish-model.sh`
  only after all gates pass.
- A local candidate is not published. Hub upload, Hub SHA retrieval, npm model
  revision pin, demo file hashes/bytes, changeset and npm release are one
  coordinated publication. External upload requires explicit approval and npm
  publication remains a human interactive step.

The attestation covers Maskera's task-specific processing, not KB-BERT's
earlier pretraining corpus. See `docs/TRAINING_DATA_PROTECTION.md`.
