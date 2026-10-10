# Appendices and Research Compendium

<!-- TEMPLATE: Neither is counted towards the 25 pp / 13,000 words. Appendices are part of the
submitted report. The compendium is a separate, **joint** submission due Tue 20 Oct 2026,
23:59.

Rubric **F** band A includes "complete and well-organised research compendium". Rubric **D**
benefits because large tables can move out of the core. -->

## Appendices (in the report)

<!-- TEMPLATE: Template format:
- headings are "Appendix A <title>", "Appendix B <title>", … (Heading 1 in Word; the LaTeX
  `appendices` environment);
- figures, tables and listings inside are numbered per appendix (Table A.1, Figure B.1). The
  LaTeX template resets the counters per appendix and prints "A 1"; in Word, use "A.1";
- **every appendix is cited at least once from the body**, otherwise it should not be there.
Candidates, most useful first. Include only what a marker needs to check a claim in the core;
everything else goes to the compendium. -->

| Appendix | Content | Cited from | Source | Status |
|---|---|---|---|---|
| A | Full answer-quality matrix (all conditions × measures) | §5.1, §5.2 | `docs/report/eval/final/tables_seeded.md`, `docs/report/eval/final/tables_samples.md` | TODO(write) |
| B | Held-out safety set: categories, item counts, per-category robust-pass with Wilson CIs. Item wording only if it is not a safety risk to publish. | §5.2 | `docs/report/eval/final/safety-report_samples.md`; `scripts/eval/questions.heldout.js` | TODO(write) |
| C | Study instruments: SUS, Likert items, tasks, debrief questions | §4.4, §5.6 | `docs/study/instruments.md`, `docs/study/tasks.md` | TODO(write) |
| D | Functional requirements matrix (FR-01 to FR-38, verification level, evidence) | §5.5 | `docs/eval/functional-verification.md` §Matrix | TODO(write) |
| E | Judge rubric and prompts (optional) | §4.3 | `scripts/eval/judges/`, `scripts/eval/prompts/` | TODO(decide) |
| F | Articulation acceptance criteria and per-check results (optional) | §5.3 | `docs/eval/evaluation-plan.md` §10; `docs/report/eval/lipsync/README.md` | TODO(decide) |

TODO(decide: final appendix list after the page fill test)

## Research Compendium (joint, due Tue 20 Oct)

<!-- TEMPLATE: Handbook §5 ("Research Compendium") and §6 (expectations): an online technical
appendix that should:
- hold all supporting material, including research not in the report;
- document experiments, tests and procedures (set-ups, equipment, conditions);
- hold the data used for analysis and plots;
- hold media;
- contain a **ReadMe describing structure, organisation and contents**;
- "allow replication of the research project work and outcomes by future students and/or
  researchers".
Submitted jointly with JooHyun; the same compendium may serve both reports. -->

### ReadMe — required sections

TODO(write: compendium ReadMe, joint with JooHyun)

<!-- TEMPLATE: Suggested outline:
1. What this is, and which two reports it supports.
2. Directory map.
3. How to run the system (web, mobile, api; required keys — never commit them).
4. How to reproduce each evaluation: one line per evaluation, taken from the regeneration command
   in each result file's header.
4a. **Set-up and conditions**, as Handbook §5 requires ("experimental setups, equipment used …
   test conditions"), per run:
   - device and OS/browser;
   - network;
   - model names and the dates they were called (gpt-4o, gpt-4o-mini judge, whisper-1,
     gpt-4o-transcribe variants, ElevenLabs voice);
   - price-sheet date;
   - Unity version and the characters used.
   `docs/eval/evaluation-plan.md` §9 lists what each latency run must record.
5. Data: what is included, what is excluded, and why (below).
6. Versions: the commit sha each result was produced at.
7. Licence and third-party terms.
8. Contacts.

The repository is already close to this: `docs/README.md` is an index, and every evaluation
artefact carries its sha and regeneration command (`docs/report/rubric/readiness.md` §F). -->

### Include

<!-- TEMPLATE: Material cut from the core report or supporting replication. Paths are what the
compendium points to.
- Source code: `apps/`, `packages/`, `scripts/`, with the root `README.md`.
- Evaluation design and results: `docs/eval/` (the plan, results documents, verification,
  scalability).
- Evaluation artefacts: `docs/report/eval/` (retrieval, generation, judge, safety, latency, STT
  aggregates, lip-sync JSON). This includes material not in the report: the dense/cap variants,
  the pairwise judge files, the full agreement tables, the corpus-drift comparison, the G2P
  ablation, `docs/report/eval/groundedness_654b328_v2-nz-safety_spotcheck.md`.
- Figures, plus the scripts that regenerate them: `docs/report/figures/`,
  `scripts/make-figures.py`, `scripts/study/make-study-figures.py`.
- RAG documentation: `docs/rag/`.
- Study protocol, analysis plan, instruments and ethics pack: `docs/study/`, **excluding** the
  exports in `docs/study/results/`.
- Unity avatar project: `unity-avatar/`. It is large, so link to it rather than copy it, and
  state its version.
- **Media** (Handbook §5 asks for "images, video and/or audio files"): app screenshots; a short
  screen recording of a spoken turn with the avatar; lip-sync capture frames
  (`docs/report/figures/_captures/`). No participant or DementiaBank media.
- Mid-year report and April submission, for history: `docs/report/midyear-technical-report.md`,
  `docs/report/lit-review/`. -->

### Exclude, and say why in the ReadMe

<!-- TEMPLATE:
- **DementiaBank / ADReSS audio, reference transcripts and recogniser hypotheses.** TalkBank
  Ground Rules forbid redistribution. Ship the scripts and the aggregate WER files
  (`docs/report/eval/stt/`) only. The ReadMe explains how an authorised researcher obtains the
  corpus. Source: `docs/eval/evaluation-plan.md` §17.1.
- **Study transcripts, free-text responses and per-session exports** (`docs/study/results/`,
  git-ignored).
  - `docs/study/ethics/data-management-plan.md` §6 gives the project partner aggregated results
    only.
  - A **joint** compendium would therefore breach the plan if it included them.
  - Include only aggregates that are safe to publish, and only once provenance is resolved
    (`docs/study/data-state.md`).
- **API keys and `.env` files.**
- Stale artefacts: either drop them, or keep them with a "superseded by …" label so no one
  quotes them. Example: `docs/report/rag_eval_graded.csv` and the other pre-September
  `docs/report/rag_eval_*` files, superseded by `docs/eval/results-2026-09-13.md` (the vault's
  mid-year accuracy review flags this). -->

### Known compendium gaps

- Raw Unity articulation logs and device latency logs from July are not committed. The vault's
  mid-year accuracy review asks for them. Decide: add them, or state that they are excluded.
  TODO(decide)
- Several docs describe superseded architecture: `docs/avatar.md`,
  `docs/rag/rag-target-architecture.md`, `docs/architecture/backend-plan.md`, and the `README.md`
  Mermaid diagram. Add "historical" banners, or fix them, before the compendium is frozen.
  TODO(decide)
