# DementiaGuide AI — Research Compendium

This is the **research compendium** for Part IV project #49 (COMPSYS/ELECTENG/SOFTENG
700, 2026), Department of Electrical, Computer, and Software Engineering, University of Auckland.
It holds the source code of the system that was built, the evaluation plans, the scripts that ran
every evaluation, the data and per-run outputs those scripts produced, and the tables behind the
figures. It is the online technical appendix the Part IV handbook asks for, and it is meant to let
a later student or researcher repeat the work. It is submitted on Canvas as
`49_rtan654_jkan172-Compendium.zip` and kept as the git repository
[Richman-Tan/DementiaGuideAI](https://github.com/Richman-Tan/DementiaGuideAI) (private). The zip
holds the repository plus four folders that are not on GitHub (section 1).

It supports two individual final reports, written independently:

| Report | Author |
|---|---|
| *DementiaGuide AI: An Avatar-Based Digital Resource Management System for Dementia Care* (18 Oct 2026) | Richman Tan |
| *DementiaGuide AI: An Avatar-Based Digital Resource Management System for Dementia Care* (18 Oct 2026) | JooHyun Kang |

Supervisor: Assoc. Prof. Jing Sun. Both reports, as submitted, are in the zip's `submissions/`
folder. Unless stated otherwise, the section, table and appendix numbers below refer to Richman
Tan's report.

**What the project built.** DementiaGuide AI is an assistant for family carers of people living
with dementia in Aotearoa New Zealand. A carer asks a question by typing or speaking; the system
retrieves passages from a curated dementia-care library (the WHO iSupport manual plus NZ sources),
and a language model answers **only from those passages**, citing them inline. Safety rules in the
prompt make it send emergencies to 111 first and name NZ helplines. The answer appears on screen
and can be spoken by a 3D avatar whose lip movements follow the speech. It runs on the web (the
evaluated client), iOS and Android.

## Contents

1. [How the compendium is organised](#1-how-the-compendium-is-organised)
2. [Where each result comes from](#2-where-each-result-comes-from)
3. [Running the system](#3-running-the-system)
4. [Reproducing an evaluation](#4-reproducing-an-evaluation)
5. [Test set-up and conditions](#5-test-set-up-and-conditions)
6. [Data: what is included, what is not, and why](#6-data-what-is-included-what-is-not-and-why)
7. [Figures and media](#7-figures-and-media)
8. [Versions](#8-versions)
9. [Further development](#9-further-development)
10. [Licence and third-party terms](#10-licence-and-third-party-terms)
11. [People and contacts](#11-people-and-contacts)

---

## 1. How the compendium is organised

### The Canvas zip

The zip's root folder is this repository, checked out at the submission tag (section 8) with its
full git history in `.git/`. The commit dates are the record that each plan was written before
its run (`git log --follow docs/eval/plan-19j-replication.md`, for example), and the history as a
whole (more than 650 commits from 22 April 2026) is the project's working journal; the meeting
records are in `docs/meetings/`. Four folders are added that are not on GitHub:

| Path | What it is |
|---|---|
| `submissions/` | **Each student's files exactly as submitted on Canvas**, one folder per student (`Richman_Tan_rtan654/`, `JooHyun_Kang_jkan172/`). `submissions/README.md` lists every file with its Canvas assignment, date and SHA-256 checksum. |
| `unity-avatar/UnityAvatarProject/` | **The Unity project** at the submodule commit (section 8): the co-articulation engine, the G2P, the articulation test harness and its fixtures, the scenes, packages and project settings. Its Character Creator characters and its iOS and Android build exports are left out because together they would take the zip over Canvas's 2 GB limit; the complete project is on GitHub at the same commit. |
| `examiners-only/` | **Results that may be assessed but not published** (section 6): the October usability analysis, the report's Figure 5.3, and the perceptual lip-sync test's coded per-rater responses (`e6-responses/`). |
| `media/` | **Video too large for git.** `app-demo_2026-10-11.mp4` is a screen recording of the app on an iPhone (2 min 37 s, with sound): a spoken question answered by the avatar with lip sync, captions and a source, then the chat, Library and Settings screens. `e6-stimuli/` is the perceptual lip-sync test (E6) as the raters saw it: the rating page, the 22 clips, the key that says which clip is which, and the synthesised audio with its timing. |

### Top level

An npm-workspaces monorepo: three apps share one knowledge base and one core library.

| Path | What it is |
|---|---|
| `apps/web/` | **Web app** (Vite + React), deployed on Vercel. The client used in every evaluation and in the usability study. |
| `apps/mobile/` | **Mobile app** (Expo / React Native, iOS and Android). `modules/unity-avatar-module/` embeds the Unity avatar natively. |
| `apps/api/` | **Server-side proxy** (Vercel functions). Holds the provider keys, calls OpenAI and ElevenLabs on the clients' behalf, and stores study and usage data. |
| `packages/core/` | **Shared logic**, imported by all three as `@core/…`: RAG configuration, the prompt, retrieval, citation checking, the voice, speech-synthesis and lip-sync engines. |
| `scripts/` | Tooling: `eval/` (every evaluation), `study/` (usability-study export and analysis), `ingest/` and `migrations/` (building the knowledge base), `lipsync/` (articulation results), `brand/`. |
| `docs/` | All documentation, evaluation plans, results and per-run data (next table). |
| `content/` | Source documents for the knowledge base. `sources/MANIFEST.md` records each document's source, retrieval date, checksum and licence. Third-party documents are git-ignored (section 6); the project's own curated text is committed. |
| `assets/` | The `.glb` avatar models used by the Three.js fallback renderer, and the logo. |
| `unity-avatar/` | The **Unity avatar project**, a git submodule ([Richman-Tan/UnityAvatarProject](https://github.com/Richman-Tan/UnityAvatarProject)): the two Character Creator characters, the co-articulation engine and the articulation test harness. |

### Inside `docs/`

| Path | What it holds |
|---|---|
| `docs/eval/evaluation-plan.md` | **The evaluation plan.** Sections 1–16 are the September design (E1–E12); §17 is the 18 September addendum (DementiaBank, functional verification, capacity, cost); §18 the 8 October reopened evaluations. |
| `docs/eval/plan-19a-…md` to `plan-19k-…md` | **The October follow-up plans** (§19A–§19K), one per run, each committed before the run it describes. |
| `docs/eval/results-*.md` | **Results documents**: what was run, the numbers, and which of the plan's expectations held. `results-2026-09-13.md` covers the September programme; the dated `results-2026-10-*` files cover the October runs. |
| `docs/eval/functional-verification.md`, `scalability.md` | E10 (requirements against evidence) and E11 (capacity per dependency). |
| `docs/eval/README.md` | **How to run the evaluation harness**: every script, its outputs, and the order of work. |
| `docs/report/eval/` | **Per-run outputs**, one file per run: generated answers (`generation_*.json`), retrieval runs (`retrieval_*`), judge scores (`judge_*`), pairwise preferences (`pairwise_*`), safety checks (`safety_*`). Sub-folders: `final/` (the tables used in the report, agreement statistics, cost, load tests), `human/` (human rating sheets and labels), `safety/` (October safety runs), `stt/` (speech recognition), `latency/` (October latency runs), `lipsync/` (articulation harness), `e6/` (perceptual lip-sync test). |
| `docs/report/figures/` | Report figures and lip-sync capture frames (section 7). |
| `docs/study/` | **Usability study design**: protocol, analysis plan, instruments (SUS, Likert items, debrief), tasks, ethics documents, pilot checklist and incident log. The study's results are in the zip's `examiners-only/` (section 6). |
| `docs/rag/` | How the retrieval pipeline is built and sourced, and the research behind it. |
| `docs/testing/` | End-to-end test flows (Playwright for web, Maestro for iOS). |
| `docs/meetings/` | **Meeting records**: notes of the weekly supervisor meetings (May to October 2026), and the material prepared for the 15 July meeting (the answer prompt's versions compared, a 47-question test run, and reference answers checked by the clinical collaborators). |
| `docs/seminar/` | The July conference presentation. |
| `docs/report/midyear-technical-report.md` (+ `.docx`, `.pdf`) | The mid-year technical report, kept for history. |
| `docs/architecture/`, `docs/web/`, `docs/avatar.md`, `docs/android-unity.md`, `docs/voice-latency-streaming.md`, `docs/mobile-app.md`, `docs/design-system.md` | Engineering documentation for the apps and subsystems. Start at `docs/README.md`. |

### Naming conventions

- **Every generated file carries the commit it was produced at**, as a short git sha in its name
  (for example `retrieval_8a92ecd_v2.json`, run at commit `8a92ecd` with prompt `v2`) and in its
  header. Most headers also name the script that wrote the file, the machine and the date; many
  give the exact command to regenerate it.
- **Nothing under `docs/report/eval/` is edited by hand.** A correction is a new run with a new
  file name.
- **Plans come before runs.** Each October plan (`plan-19x-*.md`) states its conditions and its
  expected results, and was committed before any of the calls it describes. The git timestamps are
  the record of what was predicted in advance (the report's Table I.1 lists the dates).
- Prompt and condition names: `p0` (the May 2026 prompt), `v1` (July), `v2` (the production
  prompt, also called `v2-nz-safety`), `v2-nosafety` (`v2` without its safety-rules block),
  `_none` (no retrieval), `_oracle` (the passages labelled relevant supplied directly, in place of retrieval), `_x3` (three samples
  per question at temperature 0.7), `_final` (the September snapshot `8a92ecd`).

---

## 2. Where each result comes from

Each row is one evaluation, with the code the report uses for it. *Plan* is where it was designed;
*Result* is the document that reports it; *Data* is the per-run output behind the numbers;
*Scripts* produced the data. All paths are relative to the repository root; `eval/` means
`docs/eval/` in the Plan and Result columns, `report/eval/` means `docs/report/eval/`, and scripts are
under `scripts/eval/` unless shown otherwise.

### RQ1 — retrieval, grounding and safety

| Code | What | Report | Plan | Result | Data | Scripts |
|---|---|---|---|---|---|---|
| E1 | Retrieval benchmark: is the right passage in the top five? | §5.1, Table A.6 | `evaluation-plan.md` §5, §7 | `results-2026-09-13.md` §1 | `report/eval/retrieval_8a92ecd_*`, `retrieval_e97b0ef_v2_pooled.json`; labels in `report/eval/human/retrieval-labels_R2.json`; agreement in `report/eval/final/agreement_retrieval_R1_vs_R2.md` | `run-retrieval.mjs`, `compare-retrieval.mjs` |
| E1-C | Sentence-level citation check: does each cited passage support its sentence? | §5.1, Table A.7 | `plan-19b-propagation.md` §19B.2 | `report/eval/final/citation-support_s19b.md` | `report/eval/final/citation-*_s19b.*` | `citation-support.mjs`, `lib/citationPairs.js` |
| E2 | Answer-quality matrix: five prompt conditions, with no, production and oracle retrieval | §5.1–5.2, Tables A.1–A.3, Figure A.1 | `evaluation-plan.md` §5 (E2), §6 | `results-2026-09-13.md` §2; tables in `report/eval/final/tables_seeded.md`, `tables_samples.md` | `report/eval/generation_8a92ecd_*`, `judge_gpt-4o-mini_*`, `pairwise_*`; human sheets in `report/eval/human/` | `run-generation.mjs`, `judge.mjs`, `judge-pairwise.mjs`, `human-sheet.mjs`, `agreement.mjs`, `report-tables.mjs` |
| E2-X | Second model judge from another family (`claude-sonnet-5-5`) | §4.3, Tables A.4–A.5 | `evaluation-plan.md` §18 | `results-2026-10-09-reopened.md`; `report/eval/final/judge-crossfamily_claude-sonnet-5-5.md` | `report/eval/final/judge_claude-sonnet-5-5_*_key60.*`, `agreement_*.md` | `judge.mjs`, `agreement.mjs` |
| E2-R3, E2-R4 | Two independent health-care raters of the 60 answer-quality items | §4.3, Table A.4 | `evaluation-plan.md` §18.5, `plan-19f-extension.md` §19F.3 | `report/eval/final/e2-r3_independent-rater.md`, `e2-r4_second-independent-rater.md` | `report/eval/human/human-sheet_round1_R3.*` and R4 equivalents; `report/eval/final/agreement_human_*` | `r3-make-page.mjs`, `r3-validate.mjs`, `r3-summarise.mjs`, `agreement.mjs` |
| E3 | Held-out safety set (56 items not used in development) | §5.2, Tables B.1–B.2 | `evaluation-plan.md` §5 (E3), §8 | `results-2026-09-13.md`; `report/eval/final/safety-report_samples.md`, `safety-report_seeded.md` | `report/eval/generation_8a92ecd_*`, `report/eval/final/safety-report_*.csv`; items in `scripts/eval/questions.heldout.js` | `safety-checks.mjs`, `safety-report.mjs`, `build-phone-allowlist.mjs` |
| E3-X, E3-A | Larger safety set written by another model (`claude-opus-5-5`), and the persona/helpline ablation | §5.2, Tables B.3–B.4 | `plan-19a-safety.md` | `results-2026-10-10-s19.md` §19A; `report/eval/safety/s19a_S1_33e1aa5.md`, `s19a_S2_33e1aa5.md` | `report/eval/safety/generation_33e1aa5_*`, `s19a_*` (writer output, filter log, corpus snapshots); frozen items `scripts/eval/s19a/questions.s19a.frozen.json` | `s19a/` |
| E3-N | Neutral-prompt control: every NZ cue removed from the prompt, same NZ library | §5.2, Table B.5 | `plan-19d-neutral-prompt.md`, `plan-19e-neutral-x3.md` | `results-2026-10-10-s19.md` §19D, `results-2026-10-10-s19e.md` | `report/eval/safety/generation_0214e82_*`, `generation_e5d6dd3_*`, `s19d_*`, `s19e_*` | `s19d/`, `s19e/`, `prompts/neutral19d.js` |
| E3-S | Scope test: the passage-handling clause removed, a scope rule added | §5.2 | `plan-19g-scope.md` | `results-2026-10-12-s19g.md` | listed in the result document | `s19g/`, `prompts/scope19g.js` |
| E3-M | The escalation ablation on `gpt-4.1`, `gpt-4o-mini` and `claude-sonnet-5-5` | §5.2 | `plan-19h-checkback-crossmodel.md` | `results-2026-10-12-s19h.md` | listed in the result document | `s19h/` |
| E3-L | Lead-passage control: the neutral prompt with an NZ emergency passage placed first | §5.2 | `plan-19k-lead-passage.md` | `results-2026-10-15-s19k.md` | listed in the result document; items `scripts/eval/questions.s19k.js` | `s19k/` |

### RQ2 — the voice-and-avatar interface

| Code | What | Report | Plan | Result | Data | Scripts |
|---|---|---|---|---|---|---|
| E4 | Latency by pipeline stage (headless) and typed turns in the browser | §5.3, Figure 5.2 | `evaluation-plan.md` §9 | `results-2026-09-13.md` | `report/eval/final/latency-bench_8ed29d6_mac-wifi-2026-09-13*`, `latency-web_2026-09-19_typed*` | `latency/bench-pipeline.mjs`, `scripts/parse-latency.mjs` |
| E4-S | Spoken-turn latency, headless, fallback recogniser | §5.3, Table E.2 | `evaluation-plan.md` §18.1 | `results-2026-10-09-reopened.md` §2 | `report/eval/latency/spoken-bench_*` (with `_raw.csv` and `_meta.json`), `spoken-bench_days_2026-10-09_to_11.md` | `latency/bench-spoken.mjs`, `latency/compare-days.mjs` |
| E4-B | Spoken-turn latency in Chrome, primary and fallback recognisers | §5.3, Table E.3 | `evaluation-plan.md` §18.4 | `results-2026-10-09-reopened.md` §6 | `report/eval/latency/browser-bench_*` | `latency/bench-browser.mjs`, `latency/browser-bench-server.mjs`, `latency/rtt-probe.mjs` |
| E5 | Articulation harness: 95 automatic checks that the avatar's mouth shapes match the sounds (for example, lips closed on m, b and p) | §5.3, Table E.1 | `evaluation-plan.md` §10 | `report/eval/lipsync/README.md` | `report/eval/lipsync/*.json`, `g2p-ablation_kb100.md` | `scripts/lipsync/`; the Unity harness in `unity-avatar/` (Tools › LipSync › Run All Fixtures) |
| E6 | Perceptual lip-sync test: 15 raters compared the engine with the earlier one and a still face | §5.3, Table E.4 | `evaluation-plan.md` §10; `report/eval/e6/STOPPING-RULE.md` | `report/eval/e6/e6-results_FINAL-2026-10-10_n15.md` | `report/eval/e6/*.json` (aggregates; interim results kept), `e6-dependence-audit_2026-10-11.json`; per-rater responses in the zip's `examiners-only/e6-responses/` and the clips in `media/e6-stimuli/` | `e6-make-stimuli.mjs`, `e6-analyse.mjs`, `e6/`, `scripts/report/reanalyse-e6.py` |
| E7 | Usability study: avatar with voice (Arm A) against text (Arm B), within subjects | §4.4, §5.4, Appendix C | `docs/study/protocol.md`, `analysis-plan.md`; extension `plan-19f-extension.md` | `examiners-only/results-2026-10-12-s19f.md` (zip only, section 6; the report cites it as `docs/eval/results-2026-10-12-s19f.md`) | not included (section 6); instruments in `docs/study/instruments.md`, `tasks.md` | `scripts/study/` |
| E10 | Functional verification: each requirement against the test or measurement that verifies it | §5.6, Appendix D | `evaluation-plan.md` §17.2 | `docs/eval/functional-verification.md` | the test suites (`npm test`), coverage `report/eval/final/coverage_775adeb.md`, end-to-end flows in `docs/testing/` | `coverage-summary.mjs` |
| E11 | Capacity per dependency (proxy, retrieval call, model and speech providers) | §5.6, Table F.1 | `evaluation-plan.md` §17.3 | `docs/eval/scalability.md` | `report/eval/final/load_proxy_5a1a880_*`, `load_rpc_5a1a880_*` | `load/proxy-load.mjs`, `load/rpc-load.mjs` |
| E11-L | Speech-synthesis load test | §5.6, Table F.2 | `plan-19b-propagation.md` §19B.3 | `report/eval/final/load_tts_e72d595_mac-2026-10-09.md` | the same name with `_raw.csv`, `_meta.json` | `load/tts-load.mjs` |
| E12 | Cost per turn and per month | §5.6, Figure 5.6 | `evaluation-plan.md` §17.4 | `report/eval/final/cost_ff2753e.md` | generation files above; prices `scripts/eval/pricing.2026-09.json` | `cost-model.mjs` |

E8 (reliability evidence) was folded into E10.

### RQ3 — speech recognition on dementia speech

| Code | What | Report | Plan | Result | Data | Scripts |
|---|---|---|---|---|---|---|
| E9 | Word-error rate of five recognisers on ADReSS-2020 (78 speakers with dementia, 78 controls), utterances with pauses (a) and trimmed clips (b) | §5.5, Tables G.1–G.2, Figure 5.4 | `evaluation-plan.md` §17.1 | `results-e9-stt-2026-09-18.md` | `report/eval/stt/wer_*.md`, `.csv` (per-speaker aggregates), `error-profile_*.json` | `stt/prepare-adress.py`, `stt/transcribe-local.py`, `stt/transcribe.mjs`, `stt/wer-report.mjs`, `lib/wer.js` |
| E9 (downstream) | Answer quality on questions with simulated recognition errors | Table G.3, Figure G.1 | `evaluation-plan.md` §17.1 | `report/eval/stt/answer-quality_under_asr-error_8a92ecd.md` | `report/eval/retrieval_3a4dde3_*`, `retrieval_5131155_*`, `generation_8a92ecd_v2_perturbed.json` | `stt/perturb-questions.mjs`, `stt/answer-quality-report.mjs` |
| E9-A | Apple's recogniser, on-device | Table G.1 | `evaluation-plan.md` §18.3 | `results-2026-10-09-reopened.md` §1 | `report/eval/stt/wer_e65cdc2_apple-ondevice-en-NZ.*`, `wer_0b81b1c_apple-ondevice-en-US.*` | `stt/transcribe-apple.mjs`, `stt/apple-ondevice/` |
| E9-C | Chrome's recogniser, on-device and offline | §5.5 | `plan-19c-chrome-ondevice.md` | `results-2026-10-10-e9c.md` | `report/eval/stt/wer_bc68ffb_chrome-ondevice-en-NZ.*`, `chrome-ondevice-*.json` (install, offline proofs, diagnostics) | `stt/transcribe-chrome.mjs`, `stt/chrome-ondevice/` |
| E9-P | How recognition errors propagate into retrieval and safety | §5.5, Table G.4 | `plan-19b-propagation.md` §19B.1 | `results-2026-10-10-s19.md` §19B.1; `report/eval/stt/propagation_5cde14f_s19b.md` | `report/eval/stt/propagation*_5cde14f_*`, `error-model_5cde14f_s19b.json`, `report/eval/generation_5cde14f_*`, `retrieval_5cde14f_*` | `stt/build-error-model.mjs`, `stt/perturb-asr.mjs`, `stt/propagation-report.mjs` |
| E9-K | Check-back rule for garbled questions, the escalate-first version, and its replication | §5.5, Figure 5.5, Tables G.6–G.7 | `plan-19h-checkback-crossmodel.md`, `plan-19i-escalate-checkback.md`, `plan-19j-replication.md` | `results-2026-10-12-s19h.md`, `results-2026-10-12-s19i.md`, `results-2026-10-15-s19j.md`; `report/eval/safety/s19j_a7a1abc.md` | `report/eval/stt/error-model-check_s19j.md`; others listed in each result document | `s19h/`, `s19i/`, `s19j/` (including `bootstrap-ci.mjs`, `validate-error-model.mjs`) |

### Other material

| What | Where |
|---|---|
| Threats to validity, per evaluation (report Appendix I) | the "Threats" notes in `docs/eval/evaluation-plan.md` and in each plan |
| Corrections to numbers in the results documents, found on 30 September. The results documents were left as written, so read the two together | `docs/eval/errata-2026-09-30.md` |
| Literature search record: the eight OpenAlex searches of 12 October 2026, their filters and results, and the script that ran them (it marks which results the report cites, so it needs the report's reference list, which is not included) | `docs/report/lit-review/openalex-search-2026-10-12.json`, `scripts/report/openalex-check.py` |
| Question sets used in development (sets A, B, C, I, J, N, S) | `scripts/eval/questions.js` |
| The rubric shared by the model judges and the human raters | `scripts/eval/judges/rubrics.js` |
| The prompt conditions | `scripts/eval/prompts/promptVersions.js`; the production prompt in `packages/core/rag/prompt.js` |
| Retrieval settings (models, weights, thresholds) | `packages/core/rag/ragConfig.js` |

### JooHyun Kang's report

JooHyun's report numbers its research questions differently (RQ1 is the literature review, RQ2 to
RQ7 the evaluations), so this table maps its sections to the codes in the tables above. It does
not use E2-R4, E3-S, E3-M, E3-L or E9-K.

| Report section | What it reports | Codes, or where to look |
|---|---|---|
| §3.2, Appendix E | The knowledge base, its ingestion pipeline and the review-gated intake tool | `scripts/ingest/`, `apps/admin/`, `apps/api/api/admin/ingest.js`, the review-status migration `scripts/migrations/2026-10-07_review_status.sql`; sources in `content/sources/MANIFEST.md` |
| §3.3 | Answer generation and the New Zealand safety rules | `packages/core/rag/prompt.js`; the prompt conditions in `scripts/eval/prompts/promptVersions.js` |
| §4.2 | Corpus, question sets, retrieval labels and speech corpus | E1 (labels), E3 and E3-X (the two held-out sets), E9 (ADReSS-2020); the development set in `scripts/eval/questions.js` |
| §4.3, §5.1 | Judges and human raters, and their agreement | E2, E2-X, E2-R3 |
| §5.1, Table 5.1 | Retrieval benchmark, with the pooled two-annotator labels | E1 |
| §5.1 | Answers with no, production and oracle retrieval; citation validity; the pairwise judge | E2 |
| §5.1 | Sentence-level citation check | E1-C |
| §5.2, Table 5.2, Appendix A | The five prompt conditions on the deterministic gates | E2 (`report/eval/final/tables_samples.md`, `tables_seeded.md`) |
| §5.2, Table B.1 | Original held-out set | E3 |
| §5.2, Table 5.3, Figure 5.1, Table B.2 | Larger held-out set and the component ablation | E3-X, E3-A |
| §5.2 | Neutral prompt | E3-N |
| §5.3, Figure 5.2 | Stage, typed and spoken latency, including the 11 October repeat | E4, E4-S, E4-B |
| §5.3, Figure 5.3 | Articulation checks | E5 |
| §5.3 | Perceptual lip-sync test | E6 |
| §5.4, Table 5.4, Figure 5.4 | Word-error rate of six recognisers | E9, E9-A, E9-C |
| §5.4 | How recognition errors propagate into retrieval and safety | E9-P |
| §5.5, Appendix D | Requirements and test coverage | E10 |
| §5.5 | Capacity | E11, E11-L |
| §5.5, Table 5.5 | Cost per turn, and the gpt-4o-mini alternative | E12; gpt-4o-mini on the gates in `report/eval/final/safety-report_mini-samples.md` |
| §4.4, §5.6, Appendix C, Figure 5.5 | Informal carer study | E7 (Figure 5.5 is drawn from the same results as `examiners-only/`) |
| §4.4, §5.6 | Researchers' written feedback | not included (section 6); the changes made in response are pull requests #82 to #89 (September) and #108 to #112 (October) |
| Appendix F | App screens | `apps/mobile/` |
| §2, Appendix G | Literature review and vector-database comparison | from published sources; nothing to reproduce |

---

## 3. Running the system

The deployed versions, while they stay online:

| What | URL |
|---|---|
| Web app | https://dementiaguide-web.vercel.app |
| Knowledge-base intake tool (admins only) | https://dementiaguide-admin.vercel.app |

To run it yourself:

**Prerequisites:** Node 22 (see `.nvmrc`), an OpenAI API key, and a Supabase project with
pgvector enabled. An ElevenLabs key enables speech with accurate lip sync. Xcode or Android Studio
for mobile.

```bash
git clone --recurse-submodules https://github.com/Richman-Tan/DementiaGuideAI.git
cd DementiaGuideAI
npm install                              # once, at the root; covers every workspace
cp .env.example .env                     # Supabase and OpenAI keys, for mobile and the scripts
cp apps/web/.env.example apps/web/.env   # the web app's equivalents
```

Keys are never committed (`.env` is git-ignored). Create the database schema and load the library
the first time (run order in [scripts/README.md](scripts/README.md)):

```bash
npm run kb:ingest -- --doc curated
```

Then run a client:

```bash
npm run web          # web app (Vite); without keys it runs with canned replies
npm start            # mobile (Expo); npm run ios / npm run android for native builds
```

The Unity avatar needs a native build with the Unity export present (mobile), or the WebGL build
synced in with `npm run sync:unity -w apps/web` (web); otherwise the Three.js avatar is used. The
zip's copy of the Unity project has no characters (section 1), so build the avatar from GitHub. Full
set-up: [docs/mobile-app.md](docs/mobile-app.md), [apps/web/README.md](apps/web/README.md),
[apps/api/README.md](apps/api/README.md).

Checks: `npm test` (Jest and Vitest), `npm run lint`, `npm run typecheck`.

### How an answer is produced

```mermaid
flowchart LR
    mic["Speak"] --> stt["Speech to text<br/><small>browser recogniser,<br/>whisper-1 as fallback</small>"]
    stt --> ret
    txt["Type"] --> ret
    ret["Retrieve<br/><small>hybrid vector + keyword,<br/>top 5 passages</small>"] --> gen["Generate<br/><small>answer only from the<br/>passages, cite them</small>"]
    kb[("Library<br/><small>Supabase pgvector</small>")] -. passages .-> ret
    gen --> check["Check citations<br/>against the passages"]
    check --> screen["Answer on screen"]
    check --> tts["Speech<br/><small>ElevenLabs, sentence<br/>by sentence</small>"]
    tts --> avatar["Lip-synced avatar<br/><small>Unity, or Three.js fallback</small>"]
```

Retrieval details: [docs/rag/README.md](docs/rag/README.md).

---

## 4. Reproducing an evaluation

1. **Find the commit.** Each result file names the commit it was produced at. Check it out
   (`git checkout <sha>`) so the prompt, retrieval settings and scripts are the ones that ran.
2. **Rebuild the library.** The September runs used snapshot `8a92ecd` (453 passages); the
   October runs used the same library with one passage added on 22 September. Download the
   source documents from the URLs in `content/sources/MANIFEST.md` (its checksums confirm they
   are the same files) and run the ingestion scripts at the result's commit (`scripts/ingest/`;
   run order in `scripts/README.md`). `docs/report/kb_chunks_reference.csv` lists the 453
   passages of the September snapshot with a content hash for each, so a rebuilt library can be
   checked against it.
3. **Set the keys** the evaluation needs: `OPENAI_API_KEY` for generation, embeddings,
   `gpt-4o-mini` judging and transcription; `ANTHROPIC_API_KEY` for the Claude judge and the
   Claude runs; `ELEVENLABS_API_KEY` for speech-synthesis latency and load; Supabase keys for
   retrieval.
4. **Run the command** in the result file's header, or the one for that evaluation in
   [docs/eval/README.md](docs/eval/README.md). The generation script takes `--dry-run`, which
   prints the plan and a cost estimate first, and `--resume`, which continues an interrupted run.

**What will and will not match.** Deterministic gates, retrieval metrics, agreement statistics
and every table recomputed from committed files will match exactly. Answers generated again will
not be identical: runs at temperature 0.7 are sampled by design, and even temperature-0 runs with
a fixed seed are not guaranteed to be deterministic by the providers. Hosted models change and are
retired, and the browser's recogniser is a server-side model that changes without notice, so
re-runs measure today's models. Latency depends on the network and the providers' load at the
time. The committed per-run files are the record of what was measured.

---

## 5. Test set-up and conditions

| Item | Value |
|---|---|
| Development and benchmark machine | MacBook, Apple M3, 8 GB memory, macOS 27.0.1; Node v20.19.2; home Wi-Fi in Auckland. Each latency file records the machine, network and a baseline round-trip time to each provider. |
| Browser | Chrome 155.0.8059.39 (E4-B, E9-C) |
| Answer generation | `gpt-4o` (OpenAI), `max_tokens` 600; seeded runs at temperature 0, seed 42; sampled runs three per question at temperature 0.7 (the production setting) |
| Other generation models | `gpt-4o-mini`, `gpt-4.1` (OpenAI) and `claude-sonnet-5-5` (Anthropic), in E3-M and E9-K |
| Embeddings | `text-embedding-3-small` (1,536 dimensions) |
| Model judges | `gpt-4o-mini`; `claude-sonnet-5-5` (E2-X) |
| Safety-item writer | `claude-opus-5-5` (E3-X) |
| Speech recognition | `whisper-1` (the deployed fallback), `gpt-4o-transcribe`, `gpt-4o-mini-transcribe` (API, 19 September 2026); Whisper `large-v2` (MLX 8-bit) and `medium` run locally; Apple's on-device recogniser (en-NZ and en-US); Chrome's on-device recogniser (en-NZ) |
| Speech synthesis | ElevenLabs `eleven_turbo_v2_5`, with character-level timing used for lip sync |
| Avatar | Unity 6000.5.0f1; Character Creator characters Ariana and Aaron; articulation harness at 60 frames per second (`Time.captureFramerate = 60`) |
| Prices | `scripts/eval/pricing.2026-09.json`, checked 18 September 2026 |
| Provider limits (rate limits, concurrency, plan tiers) | `docs/eval/scalability.md`, with the load tests behind them (E11, E11-L) |
| Measurement checks (no physical equipment was used, so these stand in for calibration) | Every latency file records a baseline round-trip time to each provider (`latency/rtt-probe.mjs`). A model judge was used for a dimension only if it agreed with human raters at Cohen's κ of at least 0.6, and none did (E2, E2-X). Retrieval labels were checked by a second annotator (E1). The simulated recognition errors were checked against the real ones (`report/eval/stt/error-model-check_s19j.md`). The articulation harness runs the same fixtures on both characters (E5). |
| Dates | September programme 13–19 September 2026 (articulation runs from July and 19 September); October follow-ups 8–15 October 2026; usability study September and 9–12 October 2026. Each result file gives the dates and times of its runs. |

The usability study used the deployed web app. In September participants took part remotely and
unaided; in October six sessions ran in person on 9–10 October on the clinical collaborator's
laptop, and five carers took part remotely on 11–12 October on their own devices
(`docs/study/protocol.md`).

---

## 6. Data: what is included, what is not, and why

**Included:** the question sets and their expected behaviours; every generated answer, judge
score and safety check; the human rating sheets and the answer key used to unblind them; the
per-speaker recognition results; latency, load and cost records; the perceptual-test aggregates;
and the knowledge-base manifest.

**Not included:**

| What | Why | How to obtain it |
|---|---|---|
| **DementiaBank / ADReSS-2020 audio, reference transcripts and the recognisers' transcripts** | The TalkBank Ground Rules forbid sharing the data with anyone without access. They are kept in the git-ignored `data/dementiabank/`; only per-speaker and per-group aggregates are committed. | Apply for DementiaBank membership through [TalkBank](https://talkbank.org/), then download ADReSS-2020 from the DementiaBank media server and run `scripts/eval/stt/prepare-adress.py` (section 2, E9). |
| **Usability-study records**: session exports, transcripts, free-text answers and per-participant records | The study's data-management plan (`docs/study/ethics/data-management-plan.md`, §6) gives full access to the researcher and the supervisor only, and keeps transcripts from the project partner. Exports are written to the git-ignored `docs/study/results/`. | Held by the author with the study records; available to examiners through the supervisor. |
| **The expert reviewers' written feedback** (1 October 2026) | Held with the study records on the same basis. | As above. |
| **Knowledge-base source documents** (`content/sources/`) | Several are copyrighted; each is committed only if its licence allows redistribution. | Download from the URLs in `content/sources/MANIFEST.md`; the checksums there confirm the file. |
| **API keys and `.env` files** | Secrets. | Use your own keys (section 4). |

**Superseded files.** Some files predate the September evaluation and are kept for history only:
`docs/report/rag_eval_*`, `docs/report/baseline/` and `docs/report/latency_results.csv`
(measurements made before September, superseded by `docs/eval/results-2026-09-13.md`);
`docs/report/700b_evaluation_plan.md` (the plan written after the mid-year report, superseded by
`docs/eval/evaluation-plan.md`); `docs/report/results-discussion-conclusion-draft.md` (a mid-year
working draft);
`docs/study/data-state.md` (a database snapshot of 21 September, before the October round).
`docs/architecture/backend-plan.md` describes the backend as planned before `apps/api/` was built.

**In the Canvas zip only.** Three folders are kept off GitHub. `submissions/` holds both students'
Canvas files: each report is individual and was written independently. `examiners-only/` holds the
results of the October usability round: the analysis (`results-2026-10-12-s19f.md`) and Figure 5.3,
which plots each carer's results and is drawn from the report's Table H.1. The supervisor advised
that this assessed, unpublished evaluation did not need ethics approval, so its results may be
assessed but not published. It also holds the perceptual lip-sync test's responses: 17 files, one per
rater, identified only by a code (R01 to R17) with no free text (two raters had taken part in the
usability study and were excluded as the plan required, leaving the report's 15); the raters were told their answers
would be used only for the project's evaluation. `media/` holds the app demonstration and the
perceptual test's clips, which are too large for git.

---

## 7. Figures and media

| What | Where |
|---|---|
| Schematics: the system architecture and the path of one spoken turn (Figure 3.1), the evaluation design (Figure 4.1) and the co-articulation engine | `docs/report/figures/final/fig3_1_architecture.png`, `fig4_1_evaluation_design.png`, `fig3_3_coarticulation.png`; the answer pipeline as a diagram in section 3 |
| The final report's figures, except Figure 5.3 (per-carer study results; in the zip's `examiners-only/`, section 6) | `docs/report/figures/final/`. All but the app screenshot are drawn from the committed result files by `python3 scripts/report/make-report-figures.py` (needs matplotlib and numpy), then `--only F5 --yardstick-ms 3000` for the latency figure as printed; a re-run matches the committed figures pixel for pixel |
| Mid-year report figures | `docs/report/figures/fig1_checks_passed.png`, `fig2_viseme_montage.png`, `fig3_bilabial_curves.png` (`scripts/make-figures.py`) |
| Lip-sync capture frames (Aaron: bilabial, labiodental, open vowel) | `docs/report/figures/_captures/` |
| Perceptual-test stimuli (22 clips, the rating page and the key) | the zip's `media/e6-stimuli/`; generated by `scripts/eval/e6-make-stimuli.mjs` from `scripts/eval/e6/sentences.json` |
| Conference presentation (July) | `docs/seminar/` |
| App demonstration recording (iPhone, 11 October 2026) | the zip's `media/app-demo_2026-10-11.mp4` (section 1) |

No participant media and no DementiaBank audio are included.

---

## 8. Versions

- **Code and results:** the commit sha in each result file. Key snapshots: `8a92ecd` (the
  September answer-quality matrix and held-out safety set; 453 passages), `33e1aa5` (§19A),
  `0214e82` (§19D), `5cde14f` (§19B propagation), `a7a1abc` (§19J).
- **Unity project:** the submodule commit recorded in this repository
  (`git submodule status`); Unity 6000.5.0f1.
- **This compendium:** the commit tagged `compendium-2026-10-20`, the version submitted on
  20 October 2026 (`git checkout compendium-2026-10-20 && git submodule update --init`).

---

## 9. Further development

What a student or team taking the project on should know, and what both reports suggest doing
next. The reasons are in each report's Chapter 6 and Section 7.3.

**Where to start.** Run the system and its checks (section 3). Continuous integration
(`.github/workflows/ci.yml`) runs typecheck, lint, unit tests, a coverage gate and the Playwright
end-to-end flows on every pull request. New resources enter the library through the intake tool
(`apps/admin/README.md`), which chunks, tags and embeds them the same way as
`scripts/ingest/ingest.mjs`; nothing is cited in chat until a reviewer approves it. Evaluations
run through the harness in `docs/eval/README.md`; write each plan and its expected results down,
and commit them, before the run, as was done here.

**Known open items.**

- Pull request #140 (an interrupted spoken answer no longer speaks over the next one) is open. It
  was held back so that the evaluated system did not change while the study ran.
- Two requirements are not verified: FR-36, the device fallback drills, and FR-37, lip sync checked
  on a device through the native bridge (`docs/eval/functional-verification.md`).
- The mobile app's screens and libraries have no automated tests (0% statement coverage in
  `docs/report/eval/final/coverage_775adeb.md`), against 95.8% for the shared retrieval code and
  99.2% for the voice core.
- The mobile app calls the providers with keys the user enters in Settings; the web app goes
  through the server-side proxy in `apps/api/`. The mobile app should move behind the proxy
  before it is offered to anyone (`docs/mobile-app.md`, "API keys").
- Any further study with carers needs ethics approval (UAHPEC). The study documents in
  `docs/study/ethics/` are a starting point for the application.

**Suggested next steps.**

1. **Correctness of answers**, first, so that no later study shows carers answers of unknown
   correctness: a clinician writes, for a sample of questions, the facts each answer must contain;
   two raters calibrated on example answers score against that list; a judge model is used only
   once it agrees with them. Held-out safety items should be written and reviewed by clinicians
   outside the team.
2. **Grounding:** make the model cite each claim and check support before an answer is shown;
   recalibrate the sentence-level checker (E1-C) on more human-labelled pairs; enlarge the
   retrieval benchmark beyond 33 questions, with annotators who did not build the retriever.
3. **Speech:** measure the live recognisers, including Chrome's cloud recogniser, on consented
   New Zealand speech from carers and people living with dementia; show the transcript and ask
   for confirmation when it is short or uncertain; test the escalate-first rule (E9-K) on those
   real errors.
4. **Responsiveness:** start speech synthesis within each sentence through the WebSocket service
   already built (FR-13) and start retrieval earlier; measure on phones over mobile networks
   rather than one laptop.
5. **Benefit:** an ethics-approved study over several weeks with carers recruited independently,
   with arms for voice without the face and for the library alone. Detecting a 10-point SUS
   difference needs about 20 carers completing both arms (Richman Tan's report, Section 7.3).
   Test shorter spoken answers with the main steps first, which carers asked for.
6. **Content:** more regional, Māori and Pacific resources and content in te reo Māori; a recorded
   licence for every source, more than one reviewer, and a schedule for re-checking phone numbers
   and service details.
7. **Before release:** the privacy and governance work for health information, and the
   personalisation that was out of scope.

---

## 10. Licence and third-party terms

The project's code is proprietary, all rights reserved ([LICENSE](LICENSE)). Access to this
repository is granted for assessment and supervision; that does not grant permission to use, copy,
modify or redistribute the code.

Third-party material keeps its own terms:

- **WHO iSupport for Dementia manual** (2019): CC BY-NC-SA 3.0 IGO (`content/sources/MANIFEST.md`).
- **DementiaBank / ADReSS-2020:** the TalkBank Ground Rules (CC BY-NC-SA). Cite the corpus and,
  for Pitt-derived data, NIA grants AG03705 and AG05133.
- **OpenAI, Anthropic and ElevenLabs** outputs stored here were produced under each provider's
  API terms.
- **Character Creator characters** in the Unity project: Reallusion's licence terms.

DementiaGuide AI provides general information only. It is not a substitute for professional
medical advice, diagnosis or treatment.

---

## 11. People and contacts

| Name | Role | Contact |
|---|---|---|
| Richman Tan | Student; system, voice and avatar pipeline, evaluation programme | rtan654@aucklanduni.ac.nz |
| JooHyun Kang | Student; knowledge base, retrieval, second rater | jkan172@aucklanduni.ac.nz |
| Assoc. Prof. Jing Sun | Supervisor | jing.sun@auckland.ac.nz |

Each report's Statement of Contribution gives the full division of work.
