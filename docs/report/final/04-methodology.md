# 4 Evaluation Methodology

<!-- TEMPLATE: Budget ≈1,000 words (≈1.7 pp + 0.6 pp Table 4.1). Counted. Second "middle
section".

Rubric **C** (20 %) band A:
- "strong justification (through theory and/or best practice) of study design";
- "clear coherence between theory, methodology, and research/study questions";
- "rigorous study design and method development";
- "well-argued choice of data".

This chapter holds only the **shared** design. Experiment-specific setup (conditions, n, the
metric used) is written as a 2–3 sentence "Setup" at the top of each §5.x, so the marker does not
flip between chapters.

The readiness gap to close (`docs/report/rubric/readiness.md` §C): the design is documented as
engineering, not justified from literature. **Every design choice below should carry a citation
to §2.3–2.6.**

Canvas guidance ("Report writing: Methodology"): enough detail to replicate. Justify choices;
save results for Ch 5.

Source of truth: `docs/eval/evaluation-plan.md`, approved 2026-09-12; E9–E12 were added in the
§17 addendum on 2026-09-18. -->

## 4.1 Evaluation design

<!-- TEMPLATE: ≈120 words + **Table 4.1** (figures-and-tables.md T1).
Table 4.1 columns:
- RQ;
- objective (the Objectives 1–8 detail moved here from §1.3);
- evaluation;
- what is measured;
- comparison/baseline;
- evidence type (deterministic gate / judge / human / benchmark);
- pre-specified expectation, with its source and date (see §1.3);
- verdict: held / not held / none pre-specified. This is filled in after Ch 5, and closes the
  hypothesis loop for every RQ, not only RQ2 and RQ7.
Mapping, from `docs/report/lit-review/revised-section-2.md` §Evidence map and
`docs/eval/evaluation-plan.md` §4:
- RQ1 → literature (§2.7);
- RQ2 → E1, E2;
- RQ3 → E2, E3;
- RQ4 → E4, E5;
- RQ5 → E9;
- RQ6 → E10, E11, E12;
- RQ7 → E7.
Also state:
- E6 (perceptual lip-sync) was designed but not run;
- E8 (reliability) was superseded by E10 (`docs/eval/evaluation-plan.md` §4, §17.2).
Prose: why a programme of targeted measurements rather than one user study. The supervisor asked
that the study be only one component (`docs/eval/evaluation-plan.md` §Context). Why ablations: to
separate what retrieval contributes from what prompt design contributes. -->

TODO(write)

## 4.2 Data: choice and justification

<!-- TEMPLATE: ≈350 words, raised from 220 by moving E10–E12 procedure detail out of §4.5. This is
the rubric-C "well-argued choice of data" item: argue, do not list.

(a) Knowledge corpus.
- What it is and why: iSupport is an evidence-based WHO programme [@who-isupport2019]; NZ
  sources give jurisdictional correctness.
- Frozen at the evaluated snapshot (sha in `docs/eval/results-2026-09-13.md` header).

(b) Question sets.
- Development set by category, and a **held-out** safety set written before further prompt
  changes and clinically reviewed.
- Counts and categories: `docs/eval/results-2026-09-13.md` header;
  `scripts/eval/questions.js`; `scripts/eval/questions.heldout.js`.
- Design: `docs/eval/evaluation-plan.md` §5 E3.
- Be candid: the held-out items were written by the project team, so they are author-designed
  fixtures. That is a threat, carried to §6.3.

(c) Retrieval labels.
- 33 labelled questions; second annotator; pooled graded labels.
- `docs/report/eval/final/agreement_retrieval_R1_vs_R2.md`.

(d) Speech corpus.
- ADReSS-2020: why a standard, balanced, MMSE-annotated clinical corpus rather than self-recorded
  audio (comparability with published results, ethics). Cite §2.5.
- What the two input conditions test:
  - (a) utterance cuts with pauses: the analogue of the fallback upload (whole recording, sent
    after the user stops);
  - (b) the challenge's energy-VAD chunks: **within-utterance trimming**. This is *not* the app's
    live path or its trailing-silence endpointer, neither of which was measured.
  - Do not use the stale line in `docs/eval/results-e9-stt-2026-09-18.md` §3.1 that calls (b)
    "the analogue of what the app's live recogniser and endpointer deliver". The paragraph just
    before it contradicts it.
- Limitations: US-English picture description, not NZ conversational queries.
- Source: `docs/eval/evaluation-plan.md` §17.1.

(e) Judge model.
- The plan's primary judge was a **cross-family** (Claude) model (`docs/eval/evaluation-plan.md`
  §5, judge protocol step 1). It was **not run** (`docs/eval/results-2026-09-13.md` §7). Say so,
  and say that gpt-4o-mini therefore judged gpt-4o-mini's own generations in the cost–quality
  column (self-preference risk, §2.6).
- Why gpt-4o-mini, blinded.
- Why its absolute scores are gated on human agreement (§4.3). -->

TODO(write)

## 4.3 Measures and analysis

<!-- TEMPLATE: ≈200 words. Cite §2.6 for each choice.

Three evidence types, and what each can support:
(i) **Deterministic gates**: regex/positional checks such as 111-in-first-sentence, dose-leak,
    region-leak, and "phone number not in the verified NZ list". Objective; strongest. Code:
    `scripts/eval/lib/checks.js`, `scripts/eval/lib/textMetrics.js`,
    `scripts/eval/safety-report.mjs`. (`scripts/eval/safety-checks.mjs` scores a saved generation run; the
    study-transcript scan is `scripts/study/safety-scan-transcripts.mjs`.)
(ii) **Blinded LLM judge** (gpt-4o-mini, 0/1/2 rubric).
    - The plan fixed a rule in advance: a dimension with judge–human κ < 0.6 is reported from
      human scores, not the judge's.
    - The judge **failed** that gate on four dimensions: groundedness, helpfulness, tone and
      safety, where κ is about 0 against both raters.
    - On **correctness** it cleared the threshold numerically against both raters, but on only
      20 items, 19 of them identical ceiling scores. The results file calls the value an
      artefact and treats the judge as unvalidated there too. Say that this is a post-hoc
      judgement, not the pre-fixed rule (`docs/eval/results-2026-09-13.md` §2.4).
    - On the 60 human-rated items it gave every helpfulness and tone answer a 2, which is **zero
      variance on that subset**. Across the full matrix, helpfulness does vary a little (results
      §2.3). A uniform offset cancels in a paired comparison; a ceiling does not.
    - **The judge rule** (use this exact sentence wherever the judge is mentioned): no per-condition judge means; judge evidence is limited to the direction of paired differences (win counts) on dimensions where its scores vary, and only as support for the deterministic gates.
(iii) **Human raters.** Two raters, blinded to condition, 60 items.
    - Inter-rater κ ≥ 0.6 on all five dimensions.
    - Three caveats must appear here and in §6.3:
      1. R1 scored the set twice and **the two passes are uncorrelated** (test–retest statistics in
         `docs/eval/results-2026-09-13.md` §2.4). Pass 2 is the record. It was chosen before R2's sheet existed, because
         it agreed with the deterministic gates; R2's independent sheet then confirmed the
         choice.
      2. **Both raters are the system's authors**, and they also wrote the held-out safety set.
      3. The rater sample is too small per condition to rank conditions (same file, §2.4
         "What the human scores still do not support").

Statistics chosen in advance (`docs/eval/evaluation-plan.md` §14 table and §5 for E1–E7; §4
and §17.1 for E9):
- bootstrap CIs;
- paired Wilcoxon with rank-biserial r for ordinal judge scores;
- McNemar for paired binary gates;
- Wilson CIs for small-n pass rates;
- Mann–Whitney with Cliff's δ and Spearman ρ for E9;
- Holm correction across the judge comparisons (`docs/eval/results-2026-09-13.md` §6).

Reporting rules for small n (`docs/study/analysis-plan.md` §1; Canvas results guidance): counts
and medians, **no percentages when n < 20**. -->

TODO(write)

## 4.4 Usability study design

<!-- TEMPLATE: ≈150 words. Written the same way whichever E7 path §5.6 takes — the design earns C
marks even if no result is reported.
Cover:
- within-subjects, Arm A (avatar **plus voice**; typed input is still possible) vs Arm B (text).
  The design therefore compares interfaces; it cannot isolate the avatar's effect. Say so here;
  the protocol records the typed-turn count per task as the manipulation check
  (`docs/study/protocol.md` §5.2);
- Latin-square order;
- unmoderated remote sessions;
- six tasks with expected source chunks;
- SUS; four pre-specified Likert items plus two secondary; task success; time on task; turns;
  debrief;
- participant groups: carers, care workers, and people living with dementia under extra
  safeguards;
- UAHPEC approval. **Check the status before writing:** `docs/study/protocol.md` says the
  approved protocol governs where they differ, and that the server-side architecture needs an
  ethics **amendment** (`docs/study/ethics/amendment-request.md`; the plan records it as
  unfiled). State the amendment status truthfully;
- the success criteria from `docs/study/protocol.md` §7.1. Verify them against the
  **approved** protocol before calling them pre-specified.
Sources: `docs/study/protocol.md` §2–§7.1, `docs/study/instruments.md`, `docs/study/tasks.md`,
`docs/study/ethics/`.
Cite SUS norms from §2.6. -->

TODO(write)

## 4.5 Engineering evaluations

<!-- TEMPLATE: ≈100 words — how each was measured, not what was found. Keep this short. Detailed
E10–E12 procedure goes in Appendix D or the compendium, and the words saved fund §4.2.
- E4 latency: headless stage benchmark plus browser end-to-end typed turns; percentiles
  (`docs/eval/evaluation-plan.md` §9). **No latency threshold was pre-specified.** Name the
  yardstick taken from §2.2 (turn-taking and voice-assistant norms) and label it honestly as
  chosen after the run. Without it, RQ4's "responsive enough" cannot be answered.
- E5 articulation: Unity harness with acceptance thresholds that the engine was **built to**
  (it already passed them in July). The engine's author wrote both the fixtures and the
  thresholds, which is why they are presented as "acceptance criteria" rather than an
  independent test (`docs/eval/evaluation-plan.md` §10). The harness source is not in git, so
  the thresholds cannot be dated against the runs. G2P ablation.
- E10: requirements-to-evidence matrix with verification levels; coverage
  (`docs/eval/functional-verification.md` §Verification levels).
- E11: capacity model per dependency from enforced limits, plus measured RPC/proxy load tests
  (`docs/eval/scalability.md` §1–3).
- E12: measured token/character counts priced from a dated price sheet
  (`scripts/eval/pricing.2026-09.json`, `scripts/eval/cost-model.mjs`). -->

TODO(write)

## 4.6 Reproducibility and ethics

<!-- TEMPLATE: ≈80 words.
Reproducibility:
- every result file is stamped with the commit sha that produced it;
- it carries its regeneration command;
- it is committed (`docs/report/eval/`); the compendium carries these.
Ethics:
- UAHPEC approval for the study (reference number from the approval letter:
  TODO(write: UAHPEC ref));
- TalkBank Ground Rules for DementiaBank: aggregates only;
- the API-data basis for sending ADReSS audio to OpenAI recognisers, signed off by the supervisor
  on 2026-09-19 (`docs/eval/evaluation-plan.md` §17.1).
State that no participant data leaves the study database except as aggregates. -->

TODO(write)
