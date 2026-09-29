# 5 Results

<!-- TEMPLATE: Budget ≈2,700 words (≈4.5 pp text + ≈3.95 pp figures/tables). Counted. Third
"middle section". Rubric **D** (30 %), the largest criterion.

Band A:
- "rigorous and efficient execution … with sufficient scope and breadth";
- "advanced application of data analysis";
- "well-formulated arguments based on strong and sustained evidence";
- "diagrams, graphs and tables included where appropriate";
- "critical interpretation, comparison with literature, and evaluation of validity".
Comparison with literature and validity live in §6.1, which mirrors this chapter one to one.

**Ordered by research question**, not by experiment number.

**Structure of every subsection:**
1. *Setup* (2–3 sentences: conditions, n, metric, the evidence type from §4.3), followed by one
   line: **"Expectation (source, date) → held / not held / none pre-specified"**. The verdict
   also goes into Table 4.1.
2. Results, factually: the most important result first; figure/table referenced in the text.
3. Nothing interpretive: no "shows that the design works" (Canvas "Report writing: Results").

**Judge rule, for every subsection (§4.3):** no per-condition judge means; judge evidence is limited to the direction of paired differences (win counts) on dimensions where its scores vary, and only as support for the deterministic gates. On the 60 human-rated items the
judge gave every helpfulness and tone answer a 2 (zero variance on that subset). Across the full
matrix both sit near ceiling. Paired win counts on helpfulness remain admissible under the rule,
but roughly half the helpfulness pairs flipped when positions were swapped
(`docs/eval/results-2026-09-13.md` §2.3), so treat them as weak.

**Beware of the evidence map.** The RQ2/RQ3 lines of the evidence map in
`docs/report/lit-review/revised-section-2.md` quote judge means ("correctness 1.54 vs 2.00",
"judged safety 1.84 vs 1.91"). Do **not** carry those into the report as levels.

**Canvas results rules — check each subsection before calling it done:**
- [ ] past tense; general → specific; most → least important
- [ ] "significant" only with a test and its p-value; otherwise "substantial", "considerable"
- [ ] CIs where the analysis plan specified them
- [ ] no percentages when n < 20; percentages to one decimal place when n > 100; no space
      before % (76%); one space between number and unit (186 ms)
- [ ] numbers under ten, and any number starting a sentence, in words ("five participants");
      decimals start with a zero (0.25)
- [ ] ranges written "25 to 35", not "25–35", in running text
- [ ] numbers in the text do not merely repeat the table; state the key one and point at the
      table
- [ ] every figure/table is numbered, captioned (number, description, source), and referenced

**Canonical sources.** Copy numbers only from the files named in each subsection. The results
documents are the index:
- `docs/eval/results-2026-09-13.md` (E1–E5; snapshot 8a92ecd);
- `docs/eval/results-e9-stt-2026-09-18.md` (E9);
- `docs/eval/functional-verification.md` (E10);
- `docs/eval/scalability.md` (E11);
- `docs/report/eval/final/cost_ff2753e.md` (E12);
- `docs/study/data-state.md` (E7).
**Do not use** the mid-year numbers in `docs/report/results-discussion-conclusion-draft.md` §6.9
or `docs/report/midyear-technical-report.md` §3–4. They are superseded; the repo inventory marks
them stale.

The §7 "Pending" table in `docs/eval/results-2026-09-13.md` is itself stale: it lists the Unity
re-run as not run, but §4 of the same file reports it done on 2026-09-19.

Large tables (full E2 matrix, per-category safety, E10 requirements) go to appendices (see
09-appendices-and-compendium.md) and are referenced from here. -->

## 5.1 Retrieval and grounding (RQ2)

<!-- TEMPLATE: ≈450 words + Figure 5.1 (F3) and Table 5.1 (T3).

Setup:
- E1: 33 labelled questions; production `retrieve()`; recall@k, precision@5, MRR; single-label
  and pooled-label scoring; the dense-only and uncapped variants.
- E2 RAG conditions: v2 with retrieval vs `v2:none` (no retrieval) vs `v2:oracle` (labelled
  chunks). Deterministic gates, plus paired judge comparisons (§4.3).

Report:
(a) Retrieval quality, including:
    - the second annotator's result;
    - the null result for the keyword component of hybrid retrieval;
    - the recall@1 drift as the corpus grew.
(b) What removing retrieval changed, and what oracle retrieval changed.
    - **Lead with the deterministic evidence:** citation availability and precision; "phone
      number not in the verified NZ list" (use the results file's label, not "hallucination":
      the no-RAG numbers are unverified, not shown to be invented; results §2.1); and oracle vs
      production parity (H2.2).
    - Then the judge evidence, under the judge rule above. The Holm-adjusted tests in results
      §2.3/§6 may be cited as the test of that direction, but never alongside the means.

Evidence:
- `docs/eval/results-2026-09-13.md` §1, §2.1, §2.3;
- `docs/report/eval/final/agreement_retrieval_R1_vs_R2.md`;
- `docs/report/eval/retrieval_e97b0ef_v2_pooled.json`;
- `docs/report/eval/retrieval_8a92ecd_v2_dense.csv`, `docs/report/eval/retrieval_8a92ecd_v2_cap-none.csv`;
- `docs/report/eval/final/tables_seeded.md`;
- `docs/report/eval/pairwise_gpt-4o-mini_v2_final_vs_v2_none_final.json`.

Validity notes to carry into §6.1:
- n = 33;
- the second annotator labels for coverage, so κ measures exhaustiveness (§1 of the results
  file);
- judge absolute scores are not quoted. -->

TODO(write)

## 5.2 Prompt design and safety (RQ3)

<!-- TEMPLATE: ≈550 words + Table 5.2 (T4: safety by prompt condition) and Figure 5.2 (F4).
This is likely the report's strongest result; give it room.

Setup:
- E2 prompt generations P0 → v1 → v2, plus `v2−SAFETY` (safety block removed), on the
  development set;
- E3: the held-out safety set, three samples per item at production temperature, robust-pass
  criterion, per category with Wilson CIs.

Report:
(a) Item-level pass/fail by prompt generation (McNemar).
(b) Region leaks (Australian services, foreign emergency numbers) under v1 vs v2.
(c) The safety-block ablation: 111-first rate and dose statements with and without the block.
(d) Held-out robust-pass by condition, including `v2:none`. **Report plainly that the no-RAG
    condition was nearly as safe** — the finding is that safety comes from the prompt, not the
    corpus.
(e) Gate vs judge on emergency items: they measure different things (position vs presence of
    "111"); the 2026-09-14 rubric tightening.

Evidence:
- `docs/eval/results-2026-09-13.md` §2.1, §2.2, §2.3, §2.5;
- `docs/report/eval/final/safety-report_samples.md`, `docs/report/eval/final/safety-report_seeded.md`;
- `docs/report/eval/final/safety_rubric_2026-09-13_vs_2026-09-14.md`;
- `docs/report/eval/pairwise_gpt-4o-mini_v2_final_vs_v1_final.json`.

Validity notes for §6.1:
- the development set was used while tuning v2, so the E2 prompt results are **in-sample**; the
  held-out set (E3) is the out-of-sample check;
- the held-out items were written by the team (in-sample with respect to authorship);
- the safety block's measured effect is on **escalation position and dosing**. Without the
  block, the model still mentions 111 in most emergency answers (results §2.4 table), and
  whether position matters clinically is untested;
- three samples per item;
- clinical review by one collaborator. -->

TODO(write)

## 5.3 Responsiveness and articulation (RQ4)

<!-- TEMPLATE: ≈400 words + Figure 5.3 (F5 latency stages) and Figure 5.4 (reuse
`docs/report/figures/fig1_checks_passed.png`; F6).

Setup:
- E4: headless stage benchmark (n per stage), plus browser end-to-end typed turns (n = 30).
- E5: Unity harness on both characters on the current runtime, against the acceptance
  criteria the engine was built to (a confirmation, not a prediction; §1.3). The baseline is the
  legacy keyframe track (July run only); plus the G2P ablation.

Report:
(a) Per-stage median/p90 and time to first token, set against the post-hoc yardstick named in
    §4.5 (no latency threshold was pre-specified).
(b) Acceptance checks passed by the engine, per character, on the current runtime (the two
    September runs). The **legacy** baseline exists only as the July run
    (`docs/report/eval/lipsync/20260711_231911.json`, earlier runtime, one character). The
    planned legacy re-run on the current runtime was not done (results §4). So compare engine
    and legacy only as "July legacy vs September engine", and note the different check counts
    (the totals differ because the July run lacks the `g2p_pipeline` fixture —
    `docs/report/eval/lipsync/README.md`; take both counts from the JSON files).
(c) Jitter, reported although not gated (the mid-year report already disclosed the jitter
    regression — keep it).
(d) G2P divergence.

**E4 is partial.** Spoken turns, iPhone Wi-Fi/cellular and the flag ablation were not run
(`docs/report/rubric/readiness.md` §D item 3). Decide by 10 Oct which applies:
- *If run by the cutoff:* add the spoken rows and the ablation.
- *Fallback, pre-written:* "End-to-end latency was measured for typed turns in the browser;
  spoken-turn and on-device latency were designed (§4.5) but not measured within the project,
  and the stage benchmark bounds the spoken path from below." Carry to §6.3 and §7.3.
Also report E6 as designed-not-run in one sentence.

Evidence:
- `docs/eval/results-2026-09-13.md` §3, §4;
- `docs/report/eval/final/latency-bench_8ed29d6_mac-wifi-2026-09-13.md`;
- `docs/report/eval/final/latency-web_2026-09-19_typed.csv`;
- `docs/report/eval/lipsync/20260919_102343.json`, `docs/report/eval/lipsync/20260919_102750.json`
  (engine, September); `docs/report/eval/lipsync/20260711_231911.json` (legacy, July);
- `docs/report/eval/lipsync/g2p-ablation_kb100.md`;
- figures `docs/report/figures/fig1_checks_passed.png` and
  `docs/report/figures/fig3_bilabial_curves.png` (July runs — regenerate from the 2026-09-19
  runs, or caption as July). -->

TODO(write)

## 5.4 Speech recognition on dementia speech (RQ5)

<!-- TEMPLATE: ≈550 words + Figure 5.5 (F7 fallback-recogniser WER by group × condition),
Table 5.3 (T6 recogniser comparison) and Figure 5.6 (F8 degradation curve). This is the second-strongest result, and the one with the clearest
comparison with literature (§2.5).

Setup:
- ADReSS-2020 participant speech, dementia vs control;
- the recogniser measured is `whisper-1`, the app's deployed **fallback**. The primary live
  recogniser was not measured (§3.4). Every E9 sentence must say "fallback recogniser", not
  "the app's recogniser";
- two input conditions: (a) utterance cuts with pauses; (b) energy-VAD-trimmed (within-utterance)
  chunks — not the app's endpointer (§4.2);
- three recognisers on condition (a) and four on condition (b), five in all, including the
  fallback `whisper-1` (results §4);
- WER with S/D/I decomposition, bootstrap CIs, Mann–Whitney + Cliff's δ, Spearman ρ with MMSE;
- a perturbation study of retrieval and answer quality at the measured error profile.

Report:
(a) WER by group and condition for the fallback recogniser (`whisper-1`).
(b) The recogniser comparison on the energy-VAD-trimmed condition (b).
(c) Hallucination and runaway behaviour on pause-heavy audio, and the correction. The earlier
    "endpointing helps" conclusion came from the **local 8-bit proxy** (Whisper large-v2, MLX
    8-bit). The production `whisper-1` does not show the runaway loops at that rate, and was
    worse with energy-VAD trimming (`docs/eval/results-e9-stt-2026-09-18.md` §3.1, §4). Call
    the runaway "a property of the local 8-bit proxy build". Do not call it a quantisation
    artefact: the results file does not separate quantisation from the MLX build, and its own
    probes found 8-bit output identical to fp16.
(d) Downstream, at each perturbation level: retrieval MRR, citation density, and unsafe output
    (none).
    - **Canonical error profile: the production model's**
      (`docs/report/eval/stt/error-profile_57ad032_whisper-1.json`; retrieval re-run
      `docs/report/eval/retrieval_3a4dde3_v2_perturbed-whisper1.json`; results file §5.1
      "Re-derived from the production model").
    - The answer-quality run (§5.2 of the results file) used the harsher 8-bit-proxy profile
      (`docs/report/eval/stt/error-profile_ecdceaf_local-large-v2-mlx-8bit.json`). Label it a
      **conservative bound**.
    - The two source files disagree on which columns are trustworthy.
      `docs/report/eval/stt/answer-quality_under_asr-error_8a92ecd.md` names correctness and the
      gates; results §5.2 names the gates and the citation count, and puts the judge at ceiling.
      Flag the conflict, and lead with the gates and the citation count, which both files
      accept.

Evidence:
- `docs/eval/results-e9-stt-2026-09-18.md` §2–5;
- `docs/report/eval/stt/wer_57ad032_whisper-1.md`, `docs/report/eval/stt/wer_0419750_whisper-1.md`;
- `docs/report/eval/stt/wer_7b44f14_gpt-4o-transcribe.md`, `docs/report/eval/stt/wer_b5b0401_gpt-4o-mini-transcribe.md`;
- `docs/report/eval/stt/answer-quality_under_asr-error_8a92ecd.md` (8-bit profile: conservative
  bound);
- `docs/report/eval/stt/error-profile_57ad032_whisper-1.json`;
- `docs/report/eval/retrieval_3a4dde3_v2_perturbed-whisper1.json`.
- the proxy and comparator runs for (c): `docs/report/eval/stt/wer_ecdceaf_local-large-v2-mlx-8bit.md`
  (a), `docs/report/eval/stt/wer_4c732bf_local-large-v2-mlx-8bit.md` (b),
  `docs/report/eval/stt/wer_0419750_local-medium-mlx.md`;
- the 8-bit-profile retrieval perturbation: `docs/report/eval/retrieval_5131155_v2_perturbed.json`.
**Condition mapping (results §4):** `wer_57ad032_whisper-1.md` is condition (a), pauses included,
2,063 utterances. `wer_0419750_whisper-1.md` is condition (b), energy-VAD-trimmed, 1,973 clips.
The evidence map in `docs/report/lit-review/revised-section-2.md`, and the E9 results line in
`docs/eval/evaluation-plan.md` §17.1, both mix the two profiles: the MRR
figure is from the `whisper-1` profile, and the −30 % citations figure is from the 8-bit profile.
Name the profile beside every number.

Do not carry forward the 8-bit proxy's "endpointing helps" reading. On the production model,
energy-VAD trimming made WER **worse** (results §3.1 "Corrected by the production model").

Threats for §6.1: `docs/eval/results-e9-stt-2026-09-18.md` §6 (US-English picture description,
investigator speech, normalisation, the 8-bit proxy) and §5 (the perturbation is synthetic, not
real app turns). -->

TODO(write)

## 5.5 Verification, capacity and cost (RQ6)

<!-- TEMPLATE: ≈400 words + Table 5.4 (T5 capacity per dependency) and Figure 5.7 (F9 cost per
turn by component). Full requirements matrix → Appendix D.

Setup:
- E10: 38 functional requirements, each with a verification level;
- coverage;
- E11: capacity model plus measured load tests;
- E12: priced token/character counts per typed and spoken turn, plus the `gpt-4o-mini`
  condition.

Report:
(a) Requirements verified and not verified. Name the unverified ones.
(b) The binding capacity constraint and the order of the rest.
(c) Cost per typed vs spoken turn and what dominates; per session and per user-month.
(d) What the cheaper model changed, on the **deterministic gates** only
    (`docs/report/eval/safety_8a92ecd_v2_mini-final.csv`,
    `docs/report/eval/final/safety-report_mini-samples.md`).
    - There is no pairwise v2-vs-mini judge file. The only judged data for mini is absolute and
      self-judged (gpt-4o-mini judging gpt-4o-mini).
    - If you use it at all, compute per-item paired directions from
      `docs/report/eval/judge_gpt-4o-mini_v2_final.json` and
      `docs/report/eval/judge_gpt-4o-mini_v2_mini-final.json`, under the judge rule, and flag
      them as self-judged.

Evidence:
- `docs/eval/functional-verification.md` §Matrix, §Coverage;
- `docs/report/eval/final/coverage_775adeb.md`;
- `docs/eval/scalability.md` §4;
- `docs/report/eval/final/load_rpc_5a1a880_2026-09-18.md`, `docs/report/eval/final/load_proxy_5a1a880_2026-09-18.md`;
- `docs/report/eval/final/cost_ff2753e.md`;
- `docs/report/eval/final/safety-report_mini-samples.md`;
- `docs/report/eval/generation_8a92ecd_v2_x3_mini-final.json` (the sampled run behind the cost
  headline and the safety report); `docs/report/eval/generation_8a92ecd_v2_mini-final.json`
  (seeded);
- `docs/report/eval/judge_gpt-4o-mini_v2_mini-final.json`: the only judged quality data for
  the mini condition. `cost_ff2753e.md` points to an E2-tables column `v2:mini-final` that
  **does not exist** in `tables_seeded.md` or `tables_samples.md`. Fix that pointer, or build
  the column before citing it. The judge is gpt-4o-mini judging gpt-4o-mini (§4.2e).
E8 → E10 note: "Reliability (E8) is reported through functional verification" — one clause, so
the evaluation numbering has no unexplained hole. -->

TODO(write)

## 5.6 Usability (RQ7) — conditional

<!-- TEMPLATE: ≈350 words if path A, ≈80 words if path B.

**Decision gate ≈ 10 Oct** (`docs/study/data-state.md` §Data cutoff).

Before any number is reported, two conditions must hold:
1. `docs/study/data-state.md` §Open provenance question records, per participant, who took part
   and when;
2. the sessions ran under an approved protocol. The server-side architecture needed an ethics
   **amendment** (`docs/study/protocol.md` header; `docs/study/ethics/amendment-request.md`,
   which still has placeholder fields). Sessions run before an amendment was approved need
   Jing's advice before they are reported. The state at 2026-09-21:
- 7 sessions; three ran the full protocol;
- six carry `is_pilot = true`;
- P01, P03 and P05 fall on documented dry-run dates;
- P06's turn data is contaminated by the automated E4 batch.

**Path A — provenance resolved with real participants:**
- frame it as a **pilot-scale** comparison of the voice-and-avatar interface with the text
  interface. Any arm difference cannot be attributed to the avatar alone;
- report n and roles;
- report the Arm A **typed-turn count** (`typed_turns` in the task export) as the manipulation
  check: typed turns in Arm A bypass speech and the avatar (`docs/study/protocol.md` §5.2);
- per participant, descriptively: SUS per arm; the four pre-specified Likert items; task
  success; time on task (only for sessions whose turn data is valid);
- preference;
- debrief themes, quoted briefly;
- each pre-specified criterion (`docs/study/protocol.md` §7.1, **as checked against the approved
  protocol**) stated as met / not met;
- **no percentages, no inferential tests** (n far below 10 pairs; `docs/eval/evaluation-plan.md`
  §14);
- figures from `scripts/study/make-study-figures.py` (F10–F12).

**Path B — not resolved, or no analysable real sessions (pre-written):**
"A within-subjects usability study was designed, approved by UAHPEC [amendment status: TODO(decide)] and piloted
(§4.4). At the
data cutoff, no sessions met the protocol's inclusion criteria for reporting, so no usability
result is claimed. The instruments and analysis plan are provided in Appendix C and the
compendium."
Then:
- RQ7 is reworded in §1.3 or moved to Future Work (§7.3);
- Objective 8 is marked unmet;
- the Abstract and Title carry no usability claim.

Evidence:
- `docs/study/data-state.md`, `docs/study/analysis-plan.md` §1, §3, §5;
- `docs/study/results/`;
- `scripts/study/analyse-study.mjs`, `scripts/study/safety-scan-transcripts.mjs`.
`docs/study/README.md`'s status table is stale (lines ≈60–73). Do not quote it. -->

TODO(blocked: E7 provenance — `docs/study/data-state.md`)
