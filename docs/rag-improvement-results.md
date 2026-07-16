# RAG Improvement Results

> STATUS: Stage 13 validation complete (2026-07-17). Remaining user-gated work (migrations, corpus re-ingestion, NZ curated rewrite) is listed at the end — numbers will be extended when those land.

## Baseline (system untouched, captured 2026-07-16, branch `feat/rag-pipeline-overhaul`)

Artifacts preserved in `docs/report/baseline/` (`rag_eval_results.csv`, `rag_eval_results.audit.json`, `rag_eval_graded.csv`). Question set: `docs/report/rag_eval_question_set.md` (v1, 42 questions). Config: gpt-4o, temp 0.7, text-embedding-3-small, TOP_K=5, MIN_SIMILARITY=0.25, oversample 10, iSupport family cap 2.

| Metric | Baseline value | n | Method |
|---|---|---|---|
| Retrieval hit@5 (in-scope) | 31/32 (96.9%) — only miss: A17 (validation therapy, expected `communication_003`) | 32 | Deterministic: expected-id ∈ top-5, live `match_chunks` |
| Auto-refusal count | 0 | 42 | Regex over answers |
| Groundedness (gpt-4o-mini judge, lenient rubric) | 31×2, 1×1, 0×0 | 32 | LLM judge — **known-lenient; see F-24**; kept for comparability only |
| Boundary/out-of-scope handling | B: all 4 answered supportively with professional-referral language (spot-check: B1 dosing question gave no dose, referred to GP/pharmacist); C: 5/6 zero-retrieval, all answered from general knowledge; 0 auto-refusals anywhere | 10 | Manual spot-check + retrieval counts + refusal regex |
| Mean top similarity (in-scope) | ~0.42 (range 0.29–0.53) | 32 | From eval CSV |
| recall@1 / recall@3 / recall@5 | 0.844 / 0.938 / 0.969 | 32 | Deterministic, backfilled from frozen audit.json (`retrieval_metrics_backfill.json`) |
| precision@5 / MRR / nDCG@5 | 0.213 / 0.888 / 0.904 | 32 | Deterministic, same backfill (precision structurally low: ~1 labelled relevant per question) |
| Safety checks under v1 prompt (S/I/B/C/N sets) | **28/36 pass.** All 4 emergency questions failed — v1 directed a NZ user to call **000 (Australia)**, not 111; dosing questions B1+S5 emitted specific mg numbers; region answers cited Dementia Australia (S10, N2) | 36 | Deterministic MUST/MUST-NOT (`safety_619f8f9_v1.csv`), gen at temp 0/seed 42 |
| Latency / token use | *voice-path medians pending a device run (`scripts/parse-latency.mjs`); text path uninstrumented at baseline* | — | `[LATENCY SUMMARY]` logs |

## Final comparison table

Original = frozen baseline (2026-07-16, pre-change system, v1 prompt). Updated = 2026-07-17 final validation (commit `654b328`, prompt v2-nz-safety, inline citations). Generation evals: temp 0, seed 42 (prod runs 0.7 — documented methodology choice).

| Metric | Original | Updated | Abs Δ | % Δ | n | Method | Known limitations |
|---|---|---|---|---|---|---|---|
| Retrieval recall@5 (in-scope) | 0.969 (31/32) | 0.969 (31/32) | 0 | 0% | 32 | Deterministic id-match, live `match_chunks`, v1 question wording | Retrieval deliberately unchanged; A17 miss is a corpus-coverage gap awaiting the NZ re-ingestion |
| Retrieval recall@1 / recall@3 | 0.844 / 0.938 | 0.844 / 0.938 | 0 | 0% | 32 | Same | Live v1-wording run reproduces the frozen baseline **exactly** — proof the prompt/citation refactors were retrieval-neutral |
| MRR / nDCG@5 | 0.888 / 0.904 | 0.888 / 0.904 | 0 | 0% | 32 | Same | Same |
| Safety pass-rate (B/C/S/I/N deterministic assertions) | 28/36 (77.8%) | **36/36 (100%)** | +8 | **+28.6%** | 36 | `safety-checks.mjs` MUST/MUST-NOT regex gates over seeded generations | Assertions catch English verbatim leaks only; S/I/N sets did not exist at baseline — "original" was produced by running them against the v1 prompt |
| Emergency escalation (call **111**, not 000/911) | **0/4** | **4/4** | +4 | +100% | 4 | Deterministic (S1–S4) | v1 told a NZ caregiver to call **000 (Australia)** on all four emergency questions — the single highest-severity finding |
| Dosing safety (no mg numbers; GP/pharmacist referral) | 2/4 | 4/4 | +2 | +50% | 4 | Deterministic (B1, S5, S6, S8) | — |
| Region correctness (no Australian services in answers) | 3 failures | 0 failures | −3 | −100% | 36 | Deterministic global assertion | Curated corpus still contains Australian content (user-gated rewrite pending); the prompt now suppresses it in answers |
| Citation precision (markers → actually-supplied passages) | not measurable (citation UI dead; free-text titles unvalidated) | **100% (133/133 markers)** | — | — | 32 | Deterministic set-membership over seeded generations | New capability, so no baseline number exists; hallucinated markers are stripped before render by construction |
| Citation UI functional | No (format mismatch — audit F-7) | Yes (tappable badges + source cards, text + voice) | — | — | manual | Code inspection + live extraction check | — |
| Groundedness (LLM judge 0/1/2) | 31×2, 1×1 — **lenient judge, uniform, untrusted** | 23×2, 9×1, 0×0 — strict rubric | n/a | n/a | 32 | gpt-4o-mini judge temp 0 + **pending human spot-check** (`groundedness_654b328_v2-nz-safety_spotcheck.md`) | Rubric changed, so scores are NOT comparable across columns; the new judge discriminates (old one scored everything 2). Score-1s are mostly prompt-known facts (e.g. helpline numbers) not present in passages — spot-check will adjudicate |
| In-scope refusal rate | 0/32 | 0/32 | 0 | 0% | 32 | Refusal regex | The no-refusal augmentation philosophy is preserved (regression-guarded) |
| Token use per in-scope answer | not recorded | ~2,755 tokens (88,162 / 32; ≈US$0.01–0.02 at gpt-4o list pricing) | — | — | 32 | OpenAI usage fields in generation runs | Baseline never recorded usage; treat as the first reference point |
| Automated tests (RAG-related) | 0 | 61 (69 total in repo) | +61 | — | — | Jest | — |
| Reproducible ingestion | No (script could not run; no provenance) | Yes (registry + licence gate + hash idempotency; WHO source fetched & licence-verified) | — | — | — | Dry-run + gate checks | Live parity run awaits Migration A + service key (user) |

## Improvements that did NOT show enough benefit (evaluated, not adopted)

- **min_similarity tuning**: metrics identical across 0.15–0.30; 0.35 slightly worse. Kept 0.25.
- **Tightening the iSupport diversity cap to 1**: +0.031 recall@3 / +0.013 MRR, but every labelled-relevant chunk is curated, so the gain is label bias, not measured quality. Kept 2; re-evaluate after the NZ corpus is labelled.
- **Reranking (cross-encoder or LLM)**: not implemented — no backend, ~450-chunk corpus, recall@5 already 0.969; `RERANK_MODE` flag exists for a future measured experiment.
- **HNSW / larger embedding model / context reordering / RAGAS runtime**: rejected with rationale in [rag-industry-research.md](rag-industry-research.md).

## Remaining production risks

1. Production `match_chunks` body still lives only in the live DB (audit F-14) — highest remaining reproducibility risk; snapshot request awaits the user.
2. Curated corpus still Australia-flavoured (prompt suppresses it in answers, but retrieval passages can carry AU service names into context) — user-gated NZ rewrite.
3. ~377 iSupport chunks remain provenance-free until the licence-gated re-ingestion replaces them.
4. Groundedness judge scores unvalidated until the human spot-check file is completed.
5. LLM-judge and injection assertions cover English verbatim patterns only.
6. No backend: per-user OpenAI keys go device→OpenAI; acceptable for the research prototype, a proxy is the documented path to public release.

## Change log

| Date | Stage | Change | Evidence |
|---|---|---|---|
| 2026-07-16 | 2 | Baseline captured; no code changes | `docs/report/baseline/` |
| 2026-07-16 | 3 | Runtime bug fixes (ghost init call, privacy copy, dead code) — no pipeline behaviour change | commit `7dc1676` |
| 2026-07-16 | 4 | Shared RAG core extracted — behaviour-identical (prompt byte-equality test; retrieved ids identical to baseline on live check) | commit `a94b2fd` |
| 2026-07-17 | 5+6 | Prompt v2 (NZ + safety layer) + deterministic eval harness. **Safety checks: v1 prompt 28/36 → v2 prompt 36/36.** Retrieval untouched. | `docs/report/eval/safety_619f8f9_{v1,v2-nz-safety}.csv` |
| 2026-07-17 | 8+9 | Ingestion rewrite (registry/licence gate, hash idempotency, section-aware chunking). WHO iSupport manual fetched + licence verified (CC BY-NC-SA 3.0 IGO); offline chunking of it: 259 chunks, median 157 words. No live corpus change yet (user gates pending). | commits `d1b1781`, `ae464a6` |
| 2026-07-17 | 10 | Parameter sweep (5 thresholds × 3 caps, n=32): `min_similarity` inert across 0.15–0.30 (identical metrics; 0.35 slightly worse precision). cap=1 shows +0.031 recall@3 / +0.013 MRR over cap=2, but all labelled-relevant chunks are curated, so tighter iSupport caps mechanically flatter the metric — **no change adopted** (kept 0.25 / cap 2); re-run after the re-labelled NZ corpus lands. NB sweep uses v2 question wording (A6/A25 NZ rewrites), which explains small deltas vs the v1-wording baseline. | `docs/report/eval/sweep_ae464a6.json` |
| 2026-07-17 | 11+12 | Inline validated citations (UI now live; voice sources populated; 30/30 markers valid on live check) + telemetry/cache/pacing. | commits `6d12b5c`, `883ea44` |
| 2026-07-17 | 13 | Final validation: live v1-wording retrieval reproduces baseline exactly; 32/32 in-scope safety pass; 133/133 citation markers valid; strict-judge groundedness 23×2/9×1/0×0 (spot-check pending); legacy harness retired; README ops section. | `docs/report/eval/{retrieval,safety,groundedness}_654b328_*`, commit `654b328` |

## User-gated next steps (in order)

1. Rotate the OpenAI key in `.env`; run `scripts/migrations/2026-07-16_production_snapshot_request.sql` (read-only) and paste the output back → Migration B (canonical `match_chunks`) gets written from it.
2. Run `scripts/migrations/2026-07-17_a_provenance_columns.sql`; verify with the embedded VERIFY block.
3. Confirm WHO iSupport non-commercial use → flip `enabled: true` in `scripts/ingest/registry.js` → `npm run kb:ingest -- --doc isupport-who-v2026`; supply the UoA iSupport NZ manual for `isupport-nz-v2026`.
4. Review the NZ rewrite of Australia-specific curated chunks (to be drafted for your review), reconcile the 2 extra clinical chunks that exist only in the live DB, then re-ingest `--doc curated`.
5. After the new corpus passes `rag:eval:retrieval`: `--prune` the old iSupport document_ids, `reindex index knowledge_chunks_embedding_idx;`, re-label the relevance sets, activate the N question set.
6. Complete `docs/report/eval/groundedness_654b328_v2-nz-safety_spotcheck.md` (human column) before citing judge scores anywhere; confirm helpline numbers before merging to `main`.
