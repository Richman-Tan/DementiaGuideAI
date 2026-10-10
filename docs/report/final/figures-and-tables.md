# Figures and tables — plan

<!-- TEMPLATE: Rubric **D** band A: "diagrams, graphs and tables included where appropriate to
support evaluation". The band-C descriptor penalises "some lack of supporting material … where
diagrams, graphs and tables would have been helpful". Only three figures exist today, all
lip-sync, all from July (`docs/report/rubric/readiness.md` §D item 2).

Canvas guidance ("Presenting data: Tables and figures"):
- tables and figures stand alone;
- define acronyms and units in them;
- use the same terms as the text;
- refer to each one in the text and place it near that reference;
- captions carry a number, a description and a source, in one consistent style;
- do not duplicate the same data in a table and a figure.

Template captions: LaTeX `caption` package, bold label, footnotesize. Put table captions above
tables and figure captions below figures, and keep this consistent.

Numbering: by chapter (Figure 5.1, Table 5.1) or sequential — pick one. Items inside an
appendix are numbered per appendix (Table A.1, Figure B.1).

**Page allowance** (from README.md): ≈6.25 pp for everything in the core, including 0.4 pp for
the path-A study figures. The "Size" column is
the planned fraction of a page; keep the total within the allowance. Items marked *optional* are
cut first.

**Producer** (Handbook §7): if a figure was produced solely by JooHyun, its caption must cite
JooHyun's report ([@kang2026report] in 08-references.md). Figures may be shared between the two
reports.

The Display Day poster (due 9 Oct) can reuse F1, F4, F7 and F9. Make each once, at poster and
report resolution. -->

| # | Type | Draft caption (no numbers until drafted) | § | Size (pp) | Source data | Generator | Producer | Priority | Status |
|---|---|---|---|---:|---|---|---|---|---|
| F0 | Screenshot | The built application: a caregiver question answered with inline citations, beside the avatar (web). | 3.1 | 0.3 | Live app (`apps/web/`) | Screenshot; crop to text width | Richman | must | TODO(write) |
| F1 | Diagram | System architecture: clients, API, shared core, retrieval store and external providers, with the path of one spoken turn. | 3.1 | 0.8 | Traced pipeline `docs/eval/evaluation-plan.md` §2.1; `README.md` Mermaid (stale STT) | New — draw (diagram tool or Mermaid → SVG) | TODO(decide) | must | TODO(write) |
| T1 | Table | Research questions with their objectives, evaluations, measures, baselines, evidence type, pre-specified expectation (source, date) and verdict. | 4.1 | 0.6 | `docs/report/lit-review/revised-section-2.md` §Evidence map; `docs/eval/evaluation-plan.md` §4, §5 | Hand-written | Richman | must | TODO(write) |
| T2 | Table | Existing systems and studies against the properties this project targets (grounded, NZ-specific, safety escalation, voice, avatar, accuracy-evaluated, impaired-speech-evaluated). | 2.7 | 0.6 | Ch 2 sources | Hand-written | Richman | must | TODO(blocked: Ch 2 sources) |
| T3 | Table | Retrieval quality on the labelled set: single-label and pooled-label, hybrid vs dense-only, capped vs uncapped. | 5.1 | 0.3 | `docs/eval/results-2026-09-13.md` §1; `docs/report/eval/retrieval_e97b0ef_v2_pooled.json` | Hand-written from the results file | Richman | must | TODO(write) |
| F3 | Chart (paired bars / dot plot) | Effect of retrieval: production vs no-retrieval vs oracle retrieval on the **deterministic** measures (citation availability and precision, phone number not in the verified NZ list, gate pass). No judge means (§4.3). | 5.1 | 0.4 | `docs/report/eval/final/tables_seeded.md`; `docs/eval/results-2026-09-13.md` §2.1 | Extend `scripts/make-figures.py` | Richman | must | TODO(write) |
| T4 | Table | Held-out safety robust-pass by prompt condition (P0, v1, v2−SAFETY, v2, v2 without retrieval), overall and for the key categories. | 5.2 | 0.35 | `docs/report/eval/final/safety-report_samples.md`; `docs/eval/results-2026-09-13.md` §2.2 | Hand-written; full per-category table in Appendix B | Richman | must | TODO(write) |
| F4 | Chart (grouped bars) | Prompt generations and the safety-block ablation on the development set: 111-first rate, dose statements, Australian-service and foreign-emergency mentions. Must not duplicate T4 (different set, different measures). | 5.2 | 0.35 | `docs/eval/results-2026-09-13.md` §2.1; `docs/report/eval/final/tables_samples.md` | Extend `scripts/make-figures.py` | Richman | must | TODO(write) |
| F5 | Chart (box plot per stage) | Latency by pipeline stage (headless benchmark), with end-to-end typed time to first token in the browser and the post-hoc yardstick (§4.5) marked. | 5.3 | 0.35 | `docs/report/eval/final/latency-bench_8ed29d6_mac-wifi-2026-09-13_raw.csv`; `docs/report/eval/final/latency-web_2026-09-19_typed_raw.csv` | Extend `scripts/make-figures.py` | Richman | must | TODO(write) |
| F6 | Chart | Articulation acceptance checks passed: co-articulation engine for both characters (September runtime), beside the July legacy keyframe baseline (one character; the July run lacks the 10-check `g2p_pipeline` fixture, so the totals differ — `docs/report/eval/lipsync/README.md`). | 5.3 | 0.35 | `docs/report/eval/lipsync/20260919_102343.json`, `docs/report/eval/lipsync/20260919_102750.json`, `docs/report/eval/lipsync/20260711_231911.json` | Exists as `docs/report/figures/fig1_checks_passed.png` (July runs). Regenerate from the September runs via `scripts/make-figures.py`, or caption it as July. | Richman | must | TODO(redraft) |
| F6b | Chart | Bilabial closure curves (engine vs legacy). | 5.3 | 0.35 | July runs (per-frame curves; **not** regenerable from the committed per-check JSONs) | Exists: `docs/report/figures/fig3_bilabial_curves.png`; caption as July | Richman | optional | have |
| F2 | Image montage | Viseme montage of the avatar. | 3.5 | 0.4 | `docs/report/figures/_captures/` | Exists: `docs/report/figures/fig2_viseme_montage.png` | Richman | optional (F0 takes its place) | have |
| F7 | Chart (stacked bars with CIs) | Fallback recogniser (`whisper-1`) WER by speaker group and input condition, stacked by substitutions, deletions and insertions. | 5.4 | 0.35 | `docs/report/eval/stt/wer_57ad032_whisper-1.csv`, `docs/report/eval/stt/wer_0419750_whisper-1.csv`; `docs/eval/results-e9-stt-2026-09-18.md` §3.1, §4 | Extend `scripts/make-figures.py` | Richman | must | TODO(write) |
| T6 | Table | Recogniser comparison on energy-VAD-trimmed speech (condition b): pooled WER by group for each recogniser, paired against `whisper-1`. | 5.4 | 0.2 | `docs/eval/results-e9-stt-2026-09-18.md` §4.1; `docs/report/eval/stt/wer_*.md` | Hand-written | Richman | must | TODO(write) |
| F8 | Chart (line) | Retrieval recall@5 and MRR as a function of injected ASR error at the **production-model** error profile; the 8-bit-profile answer-quality result noted as a conservative bound. | 5.4 | 0.3 | `docs/report/eval/retrieval_3a4dde3_v2_perturbed-whisper1.json`; `docs/report/eval/stt/error-profile_57ad032_whisper-1.json`; `docs/eval/results-e9-stt-2026-09-18.md` §5.1 | Extend `scripts/make-figures.py` | Richman | must | TODO(write) |
| T5 | Table | Capacity per dependency: enforced limit, turns per minute supported, measured behaviour under load; binding constraint marked. | 5.5 | 0.3 | `docs/eval/scalability.md` §2, §4 | Hand-written | Richman | must | TODO(write) |
| F9 | Chart (stacked bar) | Cost of a typed and a spoken turn by component, at plan rates. | 5.5 | 0.3 | `docs/report/eval/final/cost_ff2753e.md` | Extend `scripts/make-figures.py` | Richman | must | TODO(write) |
| F10–F12 | Charts (paired per-participant, combined into one panel) | Time on task, SUS and task success per interface, per participant. | 5.6 | 0.4 | `docs/study/results/` (git-ignored exports) | `scripts/study/make-study-figures.py` (writes fig4–fig6) | Richman | path A only | TODO(blocked: E7 gate) |

<!-- TEMPLATE: Planned core size, excluding optional items:
- Ch 3: F0 0.3 + F1 0.8 = 1.1
- Ch 4: T1 0.6
- Ch 2: T2 0.6
- Ch 5: T3 0.3 + F3 0.4 + T4 0.35 + F4 0.35 + F5 0.35 + F6 0.35 + F7 0.35 + T6 0.2 + F8 0.3
  + T5 0.3 + F9 0.3 = 3.55, plus 0.4 for path A = 3.95
Total: 5.85 pp, or 6.25 pp with path A. This matches the README allowance. T1 and T2 carry citations in their cells and may run long. If they exceed 0.6 pp, move
the verdict column of T1 into §6.1 prose.

Figure conventions for `scripts/make-figures.py` extensions:
- one function per figure;
- read committed artefacts only;
- print the source path and sha into the PNG metadata or the log;
- 300 dpi; width 16 cm (full text width) or 8 cm;
- Times-compatible font;
- palette readable in greyscale (Canvas/S1 guidance: figures must print well without colour).
The existing script reads git-ignored Unity test output for F6/F6b. Switch F6 to the committed
`docs/report/eval/lipsync/*.json` so the compendium can regenerate it. F6b needs per-frame data
that is not committed: add the raw logs to the compendium, or keep the July PNG with its
provenance stated. -->
