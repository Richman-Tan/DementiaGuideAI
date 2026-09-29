# Final Research Report — template and master outline

Skeleton for the Part IV Final Research Report (COMPSYS/ELECTENG/SOFTENG 700A/B,
project #49, DementiaGuide AI). The report is **individual**, **100 % of the grade**, and due
**Sunday 18 Oct 2026, 23:59**. Late submissions lose 0.5 % per hour or part hour.

This directory holds the report **structure**, not its prose. Each chapter file lists:
- the headings,
- a word budget,
- the rubric criterion the chapter earns marks against,
- what goes in it,
- the committed evidence it draws on,
- a status marker.

Prose replaces the markers as it is written. Drafts stay in markdown until one assembly pass
into the Canvas Word template (see *Assembly* below).

## Conventions

| Convention | Meaning |
|---|---|
| `<!-- TEMPLATE: … -->` | Scaffolding: budgets, rubric hooks, content notes, evidence pointers. It is invisible when rendered and must not survive into the submission. |
| `TODO(write)` | No usable text exists; write from the evidence named. |
| `TODO(redraft)` | Text exists but is stale or misaligned; the source is named. |
| `TODO(blocked: …)` | Cannot be written until the named decision or data exists. |
| `TODO(decide: …)` | A choice for Richman to make. |
| `[@key]` | A citation placeholder. Each key is defined in [`08-references.md`](08-references.md). Numbers are assigned in IEEE first-appearance order in one pass at assembly, never by hand across files. |
| Repo paths in backticks | Relative to the repository root. `scripts/report/check-template.py` checks that every one resolves. |
| Headings | Markdown headings carry typed numbers (`# 1 Introduction`, `## 5.1 …`) for navigation only. Strip them at assembly (see *Assembly*). |

**Number formatting in all prose** (Canvas "Report writing: Results" and "Presenting data"; the
template notes themselves do not follow these rules, so do not copy their formatting):
- numbers under ten, and any number starting a sentence, in words ("five participants");
- decimals start with a zero (0.25);
- no percentages when n < 20; percentages to one decimal place when n > 100;
- no space before % (76%); one space between number and unit (186 ms);
- ranges written "25 to 35" in running text;
- "significant" only for a statistically significant result, with the test named.

**Rule: the template never states a result.** It names the file that holds each number. When
prose is written, copy numbers from that file, not from this template or from memory. An evidence
file is only the source of a number if it is the **canonical** one named in
[`05-results.md`](05-results.md). Older snapshots (for example `docs/report/rag_eval_*.csv`)
are superseded.

## Constraints — and where each comes from

The Canvas assignment page (read 2026-09-29), the Canvas template and the Handbook disagree in
places. **Rule used here:**
- **limits and counting** come from the Canvas assignment page (stricter than the Handbook);
- **section order and format** come from the Canvas template (uploaded 16–17 Sep 2026), which
  also differs from the assignment page's list.

| Item | Value used here | Source | Conflict |
|---|---|---|---|
| Due | Sun 18 Oct 2026, 23:59 | Canvas assignment 492042; Handbook Table 1 | — |
| Length (core) | **Soft limit 25 pages; hard limit 13,000 words; minimum 8,000; typically 10,000–12,000** | Canvas assignment page | Handbook §5 says a maximum of 30 pages and "typically 12,000" |
| What counts | Introduction → **Conclusions and Future Work**, inclusive. Everything else is excluded, including abbreviation lists and other supporting material. | Canvas assignment page | Handbook: Introduction → Future Work (same span, different section names) |
| Font | Times New Roman 12 pt | Canvas; Handbook §5; template | — |
| Page layout | A4; margins L/R 2.5 cm, T/B 2.0 cm; justified body (`ReportBody` style); space between paragraphs; **not double-spaced** | Canvas `FYP Report Template ECSE 2026.docx` and LaTeX `mainDocument.tex` | `docs/report/lit-review/revised-section-2.md` said "double-spaced, per the handbook". That came from the S1 template, not the final one. |
| Headings | H1 14 pt bold, numbered; H2 12 pt bold; H3 12 pt italic; at most 3 levels | Template (`LyXPreamble.tex` `\titleformat`) | — |
| Section order | Title page · Abstract · Signed Statement of Contribution · Table of Contents · Acknowledgements · Glossary of Terms · Abbreviations · 1 Introduction · 2 Literature Review · Middle section(s) · Discussion · Conclusions and Future Work · References · Appendices | Canvas template | The assignment page lists Acknowledgements after the core; the Handbook lists Acknowledgements before the ToC and separates Conclusions from Future Work. **The template order is used.** |
| Citation style | IEEE numeric, `[1]`, numbered in order of first citation | Template (`\bibliographystyle{IEEEtran}`; Word template reference [1]) | The April submission used author-date and must be converted |
| Statement of Contribution | Four fixed declarations, a "continuing project" field, the **student's signature and date**, and the **supervisor's signature and date** (plus "Comments, if any" in the Word version) | Template (.docx; `Declaration.pdf` in the LaTeX zip has slightly different supervisor wording) | Handbook §7 requires only the student's sign-off; the supervisor signature comes from the template |
| File | An editable, text-selectable PDF (Turnitin); resubmitting means re-uploading every file | Canvas assignment page; Handbook §5 | — |
| AI use | Permitted; no acknowledgement required. **The student is treated as the author** and must critically evaluate AI output: check calculations, verify claims against sources, cite primary sources. This skeleton was AI-assisted, so the same applies to it. | Handbook §5, §8 | — |
| Independent writing | The two partners' reports may share **structure** and figures only. A figure produced solely by one partner must cite that partner's report in its caption. Reports are checked with Turnitin for similarity. Students are strongly advised not to share digital files or hard copies of written text. | Handbook §7; Canvas assignment page | — |

Local copies:
- Word template: `~/Downloads/FYP Report Template ECSE 2026.docx`
- LaTeX template: `~/Downloads/P4P_Final_Report_ECSE_Template.zip`
- Handbook: Nexus vault `08 University/2026 S2/COMPSYS ELECTENG SOFTENG 700AB/Resources/P4PHandbook2026_ECSE.pdf`
- Rubric: [`../rubric/final-report-rubric.md`](../rubric/final-report-rubric.md) (the PDF alongside it is authoritative)

**TODO(decide: confirm the 25-page limit with the coordinator or Jing).** A one-line email to
Dr Shahab Kazemi settles it. Until then, design to 25.

## Files, in report order

| File | Report part | Counted? | Budget (words) | Rubric |
|---|---|:-:|---:|---|
| [`00-front-matter.md`](00-front-matter.md) | Title page, Abstract, Statement of Contribution, ToC, Acknowledgements, Glossary, Abbreviations and symbols | no | Abstract 200–300 | E (abstract), F |
| [`01-introduction.md`](01-introduction.md) | 1 Introduction | **yes** | 900 | B, A |
| [`02-literature-review.md`](02-literature-review.md) | 2 Literature Review | **yes** | 1,700 | A, B, C |
| [`03-system-design.md`](03-system-design.md) | 3 System Design and Implementation *(middle)* | **yes** | 1,300 | C, D |
| [`04-methodology.md`](04-methodology.md) | 4 Evaluation Methodology *(middle)* | **yes** | 1,000 | C |
| [`05-results.md`](05-results.md) | 5 Results *(middle)* | **yes** | 2,700 | D |
| [`06-discussion.md`](06-discussion.md) | 6 Discussion | **yes** | 2,000 | E, D, A |
| [`07-conclusions-future-work.md`](07-conclusions-future-work.md) | 7 Conclusions and Future Work | **yes** | 600 | E |
| [`08-references.md`](08-references.md) | References, plus the citation-key map and the literature gaps | no | — | A, F |
| [`09-appendices-and-compendium.md`](09-appendices-and-compendium.md) | Appendices and the Research Compendium hand-off | no | — | D, F |
| [`figures-and-tables.md`](figures-and-tables.md) | Figure and table plan across all chapters | (figures take space) | — | D |

### Budget

| | Words | ≈ Text pages at 600 words/page | Figure and table allowance (pages) |
|---|---:|---:|---:|
| 1 Introduction | 900 | 1.5 | — |
| 2 Literature Review | 1,700 | 2.8 | 0.6 (gap table T2) |
| 3 System Design | 1,300 | 2.2 | 1.1 (architecture F1, UI screenshot F0) |
| 4 Methodology | 1,000 | 1.7 | 0.6 (RQ → evidence table T1) |
| 5 Results | 2,700 | 4.5 | 3.95 (incl. 0.4 for study figures, path A only) |
| 6 Discussion | 2,000 | 3.3 | — |
| 7 Conclusions and Future Work | 600 | 1.0 | — |
| **Core total** | **10,200** | **17.0** | **6.25** → **≈ 23.3 pp plus heading and caption space ≈ 24–25 pp** |

The core total sits between the 8,000-word floor and the 13,000-word hard limit, and near the
typical 10,000–12,000. The page estimate is based on the template's body style (Times New Roman
12 pt, 16.0 × 25.7 cm text block, single spacing with paragraph spacing ≈ 600 words per full
page). **Pages, not words, will bind**, so:
- keep a drafting cap of 10,000 words;
- the checker counts prose only (no headings, tables or captions). The 13,000-word hard limit is
  measured **in Word over Introduction → Conclusions and Future Work, tables and captions
  included**, so leave headroom;
- put any table longer than about a third of a page in an appendix;
- run the page fill test in *Assembly* before drafting is far along.

Rubric weight against space: D + E carry 55 % of the marks and receive chapters 5–7 plus most of
the figures (≈ 60 % of core pages). A + B carry 20 % and receive chapters 1–2 (≈ 20 %).

## Rubric → where the marks are earned

| Criterion | Weight | Band-A descriptor, condensed | Owned by |
|---|---:|---|---|
| A Literature & field knowledge | 10 % | retrieval and assessment of relevant literature; insightful connections; strong evaluation of relevance | Ch 2 (all); comparison with literature in §6.1; literature justification of methods in Ch 4 |
| B Problem definition & framing | 10 % | critique → clear gap; coherent problem statement; well-formulated, **aligned** RQs **and hypotheses** | §1.2–1.3 (problem, RQs, pre-specified expectations); §2.7 gap table |
| C Study design | 20 % | synthesis of theory, methods and procedures; coherence of theory, method and RQs; rigorous design; **well-argued choice of data**; tool proficiency and co-design | Ch 4 (all); Ch 3 (tools, co-design); §2.6 (evaluation methodology literature) |
| D Execution, findings & evaluation | 30 % | rigorous execution with sufficient scope; advanced analysis; arguments backed by evidence; **diagrams, graphs, tables**; critical interpretation, **comparison with literature**, **evaluation of validity** | Ch 5 (all); [`figures-and-tables.md`](figures-and-tables.md); §6.1 (comparison and validity per RQ) |
| E Interpretation, contribution & impact | 25 % | expert interpretation; meaningful contribution or real-world connection; significance, **limitations and improvements**; **claims proportionate to findings**; insightful **conclusions and recommendations** | Abstract; Ch 6 (all); Ch 7 (all) |
| F Technical writing & communication | 5 % | clear, professional structure; precise language; logical flow; **complete, well-organised compendium**; no significant errors | Whole report; [`09-appendices-and-compendium.md`](09-appendices-and-compendium.md) |

## Status dashboard

Run `python3 scripts/report/check-template.py` for live counts (words written per chapter
against budget, open `TODO(` markers, unresolved paths and citation keys).

| Chapter | State at 2026-09-29 | Biggest gap |
|---|---|---|
| Front matter | template | Contribution split not agreed with JooHyun; supervisor signature |
| 1 Introduction | redraft | Compress `docs/report/lit-review/revised-section-2.md` to about 900 words |
| 2 Literature Review | redraft + write | Four new sub-sections have **no primary sources yet** |
| 3 System Design | write | No architecture figure exists |
| 4 Methodology | write | Design is documented as engineering; literature justification is missing |
| 5 Results | write | Figures for E1–E4 and E9–E12 do not exist; E7 blocked on provenance |
| 6 Discussion | write | Nothing written — the single largest gap (criterion E, 25 %) |
| 7 Conclusions and Future Work | write | — |
| References | redraft | 25 April references (19 academic, 6 web) to convert to IEEE, plus 15–20 new ones |
| Compendium | plan | ReadMe not written; the compendium is joint with JooHyun |

## Key dates

| Date | What | Why it matters here |
|---|---|---|
| **≈ Sun 4 Oct** | **Literature cut-off** for the new §2.3–2.6 sources | Ch 4 justifications and every §6.1 comparison depend on them |
| Fri 9 Oct | Display Day poster (joint) | Its figures can come from [`figures-and-tables.md`](figures-and-tables.md) — make them once |
| **≈ Sat 10 Oct** | **E7 decision gate** (`docs/study/data-state.md` §Data cutoff) | Selects which pre-written path §5.6 takes |
| **≈ Sat 10 Oct** | **Ask Jing to sign the Statement of Contribution** | The template needs a supervisor signature; allow a week. Ask whether a digital signature is accepted. |
| ≈ Wed 14 Oct | Full draft assembled in the Canvas template; Turnitin self-check | Leaves four days to cut pages |
| **Sun 18 Oct 23:59** | **Submit** (editable PDF) | Submit at least 5 minutes early |
| Tue 20 Oct | Research Compendium (joint) | See [`09-appendices-and-compendium.md`](09-appendices-and-compendium.md) |
| Thu 22 Oct | Display Day (compulsory attendance) | — |
| Tue 27 Oct 17:00 | Project Completion Checklist (joint) | Work is not assessed without it |

## Integrity rules that shape the writing

- **Write independently of JooHyun.** Do not exchange drafts; only the overall structure may
  match. The Statement of Contribution must separate your work from theirs
  (see [`00-front-matter.md`](00-front-matter.md)).
- **Self-similarity.** The April submission (`docs/report/lit-review/`) and the mid-year report
  were submitted through Turnitin. **Rework their text; do not paste it.** If large passages
  must survive, ask Jing how the similarity report will be read.
- **Proportionate claims.** Keep "designed, not run" labels. Apply the judge rule
  everywhere (no per-condition judge means; judge evidence is limited to the direction of paired differences (win counts) on dimensions where its scores vary, and only as support for the deterministic gates; `04-methodology.md` §4.3). Make no usability claim unless E7 is resolved.
- **Clinical corpus.** No DementiaBank audio, transcripts or hypotheses appear in the report or
  compendium, only aggregates (TalkBank Ground Rules; `docs/eval/evaluation-plan.md` §17.1).

## Assembly (near 14 Oct)

1. **Primary route — paste into the Canvas Word template.** Copy the rendered markdown, not the
   raw text, so `<!-- TEMPLATE -->` notes drop out. Apply `ReportBody` to body text.
   **Headings:** the Word template numbers its body headings on the paragraph, not in the
   Heading 1 style, in the format "1.", "1.1.", "1.1.1.". So paste each heading onto one of the
   template's existing numbered heading paragraphs (or copy its format), and strip the typed
   markdown numbers, otherwise you get "1. 1 Introduction". Front-matter and appendix headings
   are unnumbered. Insert figures from `docs/report/figures/`. Caption style: bold
   label, then text, below figures and above tables, consistent throughout.
2. Resolve `[@key]` placeholders to IEEE numbers in order of first appearance. Build the
   reference list from [`08-references.md`](08-references.md).
3. The assembled text must contain no `TODO(` and no `[@`.
   `python3 scripts/report/check-template.py --final` fails if any remain.
4. `scripts/report-to-docx.py --uoa12` gives a **quick preview only**. Its margins and heading
   styles differ from the Canvas template and it reads one file at a time.
5. Export to PDF with fonts embedded and text selectable. Run Turnitin before submitting.

**Page fill test (do this early).** Before drafting is far along:
- open the Canvas template;
- paste placeholder text at each chapter's budgeted length;
- add boxes at the planned figure sizes from [`figures-and-tables.md`](figures-and-tables.md);
- read Word's page count for Introduction → Conclusions.

If the count is over 25, cut the budgets now rather than the prose later.
