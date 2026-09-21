# Final report — readiness against the rubric

Written 2026-09-21 against [`final-report-rubric.md`](final-report-rubric.md) and the
2026 P4P Handbook (ECSE). This is a gap analysis, not a claim that anything is
finished. Every "have" below names a committed artefact; anything without one is
listed as a gap.

## Submission constraints (handbook, not in this repo)

| Item | Value |
|---|---|
| **Final Research Report** | **Sunday 18 Oct 2026, 11:59 pm** — individual submission, **100 % of the grade** |
| Length | 8,000–13,000 words (typically 12,000), **max 30 pages**, Introduction → Future Work inclusive |
| Format | Times New Roman 12 pt; template on Canvas |
| Required sections | Title Page, Abstract, Signed Statement of Contribution, Acknowledgements, Table of Contents, Glossary of Terms, *Introduction*, *Literature Review*, *Middle sections*, *Discussion*, *Conclusions*, *Future Work*, References, Appendices |
| **Research Compendium** | **Tuesday 20 Oct 2026** — joint submission with JooHyun Kang; must include a ReadMe describing structure, organisation and contents; must allow replication by future researchers |
| Display Day poster | Friday 9 Oct 2026 (joint); Display Day Thursday 22 Oct |
| Completion checklist | Tuesday 27 Oct, 5:00 pm — **work is not assessed without it** |
| Late penalty | 0.5 % per hour (48 h late = −24 marks) |

Two consequences that shape everything below:

1. **The report is individual; the project is joint.** The report must read as
   independently written and the Statement of Contribution must delineate what is
   Richman's work. The evaluation programme (E1–E12) is the strongest individual
   claim available and should be framed that way.
2. **30 pages is binding.** The proposed evaluation chapter
   (`docs/eval/evaluation-plan.md` §15) has thirteen subsections. All of it will
   not fit alongside a 5–6 page literature review, methods, discussion and future
   work. The compendium is where the overflow goes — that is what it is for.

## Where the mark lives

| Criterion | Weight | Readiness |
|---|---:|---|
| D — Execution, Findings & Evaluation | 30 % | **Strong.** Most of the evidence exists and is sha-stamped. |
| E — Interpretation, Contribution / Impact | 25 % | **Weak in the repo.** Almost nothing written; the highest-value gap. |
| C — Study Design | 20 % | **Strong**, but stated as an engineering plan, not justified from theory/literature. |
| A — Literature & Field Knowledge | 10 % | **Unknown.** No literature review or bibliography exists in this repo. |
| B — Problem Definition & Research Framing | 10 % | **Not in the repo.** No stated research question, aims or objectives. |
| F — Technical Writing | 5 % | Depends on the write-up; the compendium half is nearly ready. |

Roughly 45 % of the mark (A, B, E) rests on writing that does not yet exist in any
form the repository can verify. 50 % (C, D) rests on work that largely does.

---

## A — Literature & Field Knowledge (10 %)

**Have:** `docs/rag/rag-industry-research.md` (retrieval practice),
`docs/seminar/seminar-research.md`, the citations already used in
`docs/report/results-discussion-conclusion-draft.md` §7 (Chattopadhyay 2020,
Rampioni 2021, Stara 2021, Laranjo 2018, Cohen & Massaro 1993) and its §H
references addendum.

**Gaps:**

- No bibliography or literature review lives in this repo — it is in the April
  submission and the Word drafts outside it. Whether it reaches the A band
  ("evaluation of relevance and implications", "connections across the field")
  cannot be checked from here.
- The April literature review predates the two biggest additions to the project:
  **the user study** and **E9 (ASR on dementia speech)**. The ADReSS-2020 /
  DementiaBank literature — published WER on impaired speech, the ADReSS
  challenge papers, dysarthric/disordered-speech ASR — is not cited anywhere in
  the repo, and E9's results are meaningless without it. The A band wants prior
  work *evaluated*; E9 is the one place where a direct comparison to published
  numbers is possible.
- Same for the evaluation methodology: LLM-as-judge validity, inter-annotator
  agreement conventions, SUS norms. These are used but not sourced.

## B — Problem Definition & Research Framing (10 %)

**Have:** thirteen *evaluation* questions (EQ1–EQ13, `docs/eval/evaluation-plan.md`
§3) which are well-formed and aligned to experiments.

**Gap:** EQs are not research questions. Nowhere in the repo is there a research
question, an aims-and-objectives statement, or a problem statement for the report.
The rubric's A band wants a gap in the literature identified and a coherent
progression from that gap to the research direction. That document exists only in
the April submission, and it needs rewriting to match what the project actually
became (a voice avatar with a measured safety and retrieval programme, plus an
impaired-speech robustness study). This is the cheapest 10 % on the list and it is
currently unwritten.

## C — Study Design (20 %)

**Have:** this is the best-documented part of the project.
`docs/eval/evaluation-plan.md` is a genuine pre-registered design — conditions,
metrics, statistics chosen in advance (bootstrap CIs, Mann–Whitney with Cliff's δ,
paired Wilcoxon, McNemar, Holm correction), ablations, priorities, and an explicit
"designed, not run" convention. `docs/study/protocol.md` and the UAHPEC pack cover
the human study design. `docs/eval/functional-verification.md` and
`docs/eval/scalability.md` add the two designs the supervisor asked for.

**Gaps:**

- The design is justified as engineering, not from theory or literature. The A
  band asks for "strong synthesis of theory, methods, and procedures". Why WER on
  a picture-description corpus is the right proxy, why an LLM judge needs human
  agreement to be credible, why a within-subjects Latin square — each needs a
  citation, not just a rationale.
- The plan's §15 chapter structure needs cutting to fit 30 pages.

## D — Study Execution, Findings & Evaluation (30 %)

**Have — executed, with committed artefacts:**

| Evaluation | Evidence |
|---|---|
| E1 retrieval + second annotator | `docs/report/eval/final/agreement_retrieval_R1_vs_R2.md`, `human/retrieval-labels_R2.json` |
| E2 answer-quality matrix (6 conditions × 3 samples) | `docs/report/eval/generation_8a92ecd_*.json`, `tables_samples.md`, judge CSVs |
| E3 safety | `safety-report_samples.md`, `safety_rubric_2026-09-13_vs_2026-09-14.md`, `docs/eval/results-2026-09-13.md` |
| E4 latency (bench + web typed) | `latency-bench_8ed29d6_*.md`, `latency-web_2026-09-19_typed.*` |
| E5 lip-sync objective | `docs/report/eval/lipsync/2026091*.json`, `g2p-ablation_kb100.md` |
| E9 ASR on dementia speech | `docs/eval/results-e9-stt-2026-09-18.md` (four recognisers, two conditions, perturbation study) |
| E10 functional verification | `docs/eval/functional-verification.md` (38 requirements), `coverage_775adeb.md` (57 files / 502 cases) |
| E11 scalability | `docs/eval/scalability.md`, `load_rpc_*.md`, `load_proxy_*.md` |
| E12 cost | `cost_ff2753e.md` |

**Gaps, in order of how much they cost:**

1. **E7 user study — no analysable data.** The DB holds 6 pilot sessions and one
   stopped-early session; `study-results/` holds a synthetic file. The A band
   wants "sufficient scope and breadth", and this is a caregiver-support app
   evaluated entirely without caregivers. It is also 25 % of criterion E's
   "real-world connection". **This is the single largest risk to the grade** and
   it is the one with a hard lead time (recruit → consent → run → analyse).
2. **Figures.** Only three exist (`docs/report/figures/fig1–3`), all lip-sync,
   all from July. The D band explicitly penalises missing diagrams and graphs.
   E9 (WER by group, error decomposition, degradation curve), E2 (condition
   matrix), E4 (latency stages), E11 (capacity) and E12 (cost breakdown) all
   have data and no figure. `scripts/make-figures.py` exists to extend.
3. **E4 incomplete** — spoken turns, iPhone Wi-Fi/cellular, and the flag
   ablation are not run. The typed web numbers alone under-describe the voice
   product that the report is about.
4. **E6 perceptual lip-sync** — not run; report as designed-not-run or drop it.
5. **Comparison with literature.** The A band asks for "critical interpretation,
   comparison with literature". E9's numbers can be compared to published ADReSS
   WER directly; nothing else currently is.

## E — Interpretation, Contribution / Impact (25 %)

**Have:** `docs/report/results-discussion-conclusion-draft.md` — but that is a
mid-year draft written before E1–E12. The project's actual discipline about
proportionate claims (the whisper-1 correction that overturned an earlier
conclusion; the κ-is-a-design-artefact distinction; "designed, not run" labelling)
is exactly what the A band rewards: *"claims are proportionate to findings"*.

**Gaps:**

- **No contribution statement exists.** What does this project add? Candidates
  worth arguing: a measured safety-prompt ablation on a dementia-care assistant;
  the first (as far as the repo's literature knows) WER measurement of a
  deployed consumer STT stack on ADReSS split by recogniser *and* endpointing
  policy, with a downstream retrieval-degradation curve; a cost model showing
  TTS, not the LLM, dominates a spoken-turn's price. None of these are written
  down as contributions.
- **No synthesis section.** §5.13 of the plan ("answers to EQ1–EQ13; what is and
  is not claimed") is designed but unwritten.
- **Limitations** are scattered across per-evaluation threats sections and not
  consolidated.

## F — Technical Writing & Research Communication (5 %)

**Have:** the repo is a near-complete research compendium already — sha-stamped
artefacts, regeneration commands in every report header, `docs/README.md` as an
index.

**Gaps:** the compendium needs its own ReadMe (structure, organisation, contents,
how to replicate) and must be assembled as a joint submission with JooHyun by
20 Oct. `data/` is git-ignored and DementiaBank audio must **not** be
redistributed — the compendium ships the scripts and aggregates, not the corpus,
and must say so.

---

## Verdict

**For criterion D (30 %) — yes, we have what we need,** minus the user study,
figures, and the remaining E4 cells.

**For criteria A, B and E (45 %) — no.** None of that writing exists in a form
this repo can verify, and E in particular (25 %) has no contribution statement,
no synthesis and no consolidated limitations. That is not a data problem; it is
a writing problem, and 27 days is enough time for it if it starts now.

**The one item with a hard lead time is the user study.** Everything else can be
written or generated on demand. If real participant data is not going to exist,
that decision should be made now so the report can be framed around a system
evaluation with a piloted-but-not-run study, rather than promising a study that
arrives empty.

### Ordered by mark-per-hour

1. Decide the user-study question (run it, or frame the report without it).
2. Write the research question / aims / objectives (criterion B, 10 %, ~1 day).
3. Write the contribution + synthesis + limitations sections (criterion E, 25 %).
4. Extend the literature review to cover ADReSS/impaired-speech ASR and
   evaluation methodology, and cite it in the design chapter (criteria A + C).
5. Generate the missing figures (criterion D).
6. Finish E4 (spoken, iPhone, ablation).
7. Assemble the compendium ReadMe.
