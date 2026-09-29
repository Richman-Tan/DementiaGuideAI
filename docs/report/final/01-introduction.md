# 1 Introduction

<!-- TEMPLATE: Budget ≈900 words (≈1.5 pp). Counted. Rubric **B** (10 %) and A (10 %).
B band A: "strong critique of literature identifying clear and significant gaps … clear, coherent
problem statement … well-formulated and aligned research questions and hypotheses."
Canvas guidance ("Report writing: Introduction"): descend the funnel from broad to specific and
end on the research question(s). The Discussion (§6.1) climbs back up and must restate these RQs
in the same words.
Source: `docs/report/lit-review/revised-section-2.md` (2,400 words, drafted 2026-09-21)
compresses into §1.2–1.4. Do not paste the April text: it was submitted through Turnitin, and it
also frames a different project (`docs/report/lit-review/alignment.md`). -->

## 1.1 Context

<!-- TEMPLATE: ≈130 words. Dementia prevalence (global, then NZ); carers carry most of the
information burden; information is dispersed and of uneven jurisdictional fit.
Evidence and citations (vault notes → keys in 08-references.md):
[@who-dementia], [@adi-statistics], [@nz-dementia-services], [@sallim2015], [@collinskishita2020].
Keep numbers to one or two, each cited. -->

TODO(write)

## 1.2 Problem statement

<!-- TEMPLATE: ≈180 words. Three moves, taken from `docs/report/lit-review/revised-section-2.md`
§2.1:
(1) Existing digital resources are fragmented and static, and conversational agents are weakly
    validated.
(2) Generative assistants answer fluently without grounds, and in the idiom of their training
    data. The NZ story is 111 vs 000 and Dementia NZ vs an Australian helpline. This project
    measured exactly that failure (evidence: `docs/eval/results-2026-09-13.md` §2.1–2.2).
(3) The speech path is least reliable for the population it is meant to help.
End with the research problem, verbatim from revised §2.1. Criticise the *literature*, not
products, in a way that sets up the Chapter 2 gap table (§2.7). -->

TODO(redraft: from `docs/report/lit-review/revised-section-2.md` §2.1)

## 1.3 Research questions, aim and objectives

<!-- TEMPLATE: ≈300 words.
- List RQ1–RQ7 from `docs/report/lit-review/revised-section-2.md` §2.2 (≈195 words verbatim).
- State the aim in one sentence (revised §2.3).
- Objectives: one sentence in prose ("eight objectives, one per RQ plus the build; Table 4.1").
  The per-objective detail goes in a column of Table 4.1 (T1) to fit the budget.
- **RQ7 must be reworded, whichever path §5.6 takes.** Arm A is avatar **plus voice**; Arm B is
  text. An arm difference cannot be attributed to the avatar alone. Use wording like: "How do
  caregivers rate the usability and usefulness of the voice-and-avatar interface compared with a
  text interface, in a pilot-scale study?" If path B is taken, make it "the design and piloting
  of…" or move it to Future Work. Rubric B and C both penalise a question the report cannot
  answer.

**Pre-specified expectations** (the "hypotheses" in the B band-A descriptor).
- Use "pre-specified", defined once: committed to the repository before the run that tests it,
  **not** externally registered. Do not write "pre-registered", except when quoting the study
  protocol's own term.
- Give each expectation's source and date in a column of T1, and its verdict (held / not held)
  in another. Only expectations dated **before** their run count. Never write one afterwards.
- Sources:
  - RQ2 / RQ3: `docs/eval/evaluation-plan.md` §5 E2 "Hypotheses" H2.1–H2.4 and E3 "H3".
    - Date them by commit, not by the plan's own "approved 2026-09-12" header: the plan was
      first committed in e7d3516 (13 Sep 11:42), before the first artefacts in 8ed29d6
      (13 Sep 12:21).
    - Classify each part honestly:
      - **H2.3, v1 part** (Australian services, 000): a confirmation of what was observed in
        July, not a test.
      - **H2.3, P0 part** ("P0 has the highest in-scope refusal rate"): a genuinely new test, and it was
        **not held** (P0 refused none, `docs/eval/results-2026-09-13.md` §2.1/§2.5). Say so.
      - **H2.4** (the `v2−SAFETY` ablation, built for this run): a genuinely new test. It held
        for 111-first and dosing.
      - **H2.3, third clause** ("v2 fixes both without lowering groundedness"): a new test; judge
        it under the judge rule (§4.3) and the deterministic gates.
      - **H2.1** (RAG > no-RAG on NZ-service correctness and citations): a genuinely new test,
        since no no-RAG baseline existed before (`docs/eval/evaluation-plan.md` §1). Restate its
        "lower phone-number hallucination" clause as "fewer phone numbers outside the verified NZ
        list".
      - **H2.2** (oracle ≈ production) and **H3** (held-out safety): genuinely new tests.
    - Put the confirmatory weight on the genuinely new tests.
  - RQ4: the E5 acceptance thresholds (`docs/eval/evaluation-plan.md` §10) are **not** a
    prediction. The engine was built to them and passed them in July (the plan's §1: "meets its
    own spec"). Label them in T1 as "acceptance criteria; the September runs confirm they still
    hold", with the verdict "confirmation". E4 had **no**
    pre-specified latency threshold; see §4.5.
  - RQ7: the success criteria in `docs/study/protocol.md` §7.1, including the ≥30 % time
    reduction, which was pre-specified as likely to fail. **Caveat:** that file's header calls
    it a working draft that the approved UAHPEC protocol overrides. Check the criteria against
    the approved protocol before calling them pre-specified (see §4.4).
  - RQ5: **directional** only. `docs/eval/evaluation-plan.md` §17.1 records that dementia
    speech "is transcribed worse by every published ASR system". It was committed in df006c9
    (18 Sep 16:33), before the first E9 run in c17459a (18 Sep 21:57). No numeric threshold
    was set.
  - RQ6: nothing pre-specified (E10–E12 were added 2026-09-18). Say so rather than inventing an
    expectation. -->

TODO(redraft: from `docs/report/lit-review/revised-section-2.md` §2.2–2.3)

## 1.4 Scope

<!-- TEMPLATE: ≈140 words. Condense the in/out-of-scope table and the "Data used" paragraph from
`docs/report/lit-review/revised-section-2.md` §2.4.
Must keep:
- personalisation is out of scope (implemented as user-set preferences, not evaluated);
- no diagnosis, clinical decision support, care-outcome claims or model training;
- the three data sources — NZ/iSupport corpus, ADReSS-2020 under TalkBank rules, UAHPEC study.
This also corrects the April §2.4 claim of "no clinical data". The full table can go in an
appendix if space is short. -->

TODO(redraft: from `docs/report/lit-review/revised-section-2.md` §2.4)

## 1.5 Contributions

<!-- TEMPLATE: ≈100 words. A preview list of 3–4 items, word-for-word consistent with §6.2 (write
§6.2 first, then copy). Candidates and exclusions come from `docs/report/lit-review/alignment.md`
§6. Frame the evaluation programme as the primary contribution (revised §2.5: "not that it can be
built, but that it can be measured"). -->

TODO(blocked: write after §6.2)

## 1.6 Report structure

<!-- TEMPLATE: ≈50 words. One sentence per chapter. -->

TODO(write: last)
