# Front matter

<!-- TEMPLATE: Not counted towards the 25 pp / 13,000 words. Order is fixed by the Canvas
template: Title page → (title + name +) Abstract → Signed Statement of Contribution → Table of
Contents → Acknowledgements → Glossary of Terms → Abbreviations. Roman page numbers; arabic
numbering starts at the Introduction. -->

## Title page

<!-- TEMPLATE: The Canvas Word template's fields, with its labels verbatim. The heading "RESEARCH
PROJECT REPORT" is fixed. The Word title text box also has "TYPE OF REPORT" above the title and
spare title lines 2/3. Only the UoA logo is LaTeX-only. -->

| Field | Value |
|---|---|
| Heading | RESEARCH PROJECT REPORT |
| Type of report | TODO(decide: confirm the wording, e.g. "Final Research Report") |
| Project title | TODO(decide: title) |
| Author | Richman Tan |
| Co-worker | JooHyun Kang |
| Supervisor | Assoc. Prof. Jing Sun |
| Department | Department of Electrical, Computer, and Software Engineering |
| Institution | The University of Auckland |
| Date | TODO(write: submission date, DD Month YYYY) |

<!-- TEMPLATE: Title options.
- Portal title (April): "DementiaGuide AI: An Avatar-Based Digital Resource Management System for
  Dementia Care". It describes the April framing, and personalisation, which is now out of scope.
- Proposed in `docs/report/lit-review/revised-section-2.md` §"Also change elsewhere":
  "DementiaGuide AI: building and evaluating a retrieval-grounded avatar assistant for dementia
  care". It matches what was measured.
- Keep "usability" out of the title unless E7 passes its gate (see 05-results.md §5.6).
- The April title page named the wrong department (Civil & Environmental). This one must say
  ECSE. -->

## Abstract

<!-- TEMPLATE: 200–300 words (Canvas "Report writing: Abstract"). Rubric **E** (the rubric maps
the Abstract to criterion E), so the proportionate-claims check applies here most of all.
Write it last. Shape is broad → specific → broad, one or two sentences per move:
1. Context: dementia-care information need; NZ specificity.
2. Gap: generative assistants answer fluently without grounds or jurisdiction; speech path
   unmeasured for people living with dementia.
3. What was built: retrieval-grounded, safety-gated, voice + lip-synced avatar assistant (web +
   mobile).
4. How it was evaluated: the evaluation programme, named by what it measures, not by E-numbers.
5. Key results: 3–4 headline numbers, each copied from its canonical file (05-results.md).
6. Contribution and implication: one sentence, matching 06-discussion.md §6.2 exactly.
Checks before finalising:
- every number appears in Ch 5;
- no usability or engagement claim unless §5.6 took path A;
- no care-outcome claim;
- "significant" only with a test;
- the number-formatting rules in README.md *Conventions*;
- the judge rule (§4.3): no per-condition judge means; judge evidence is limited to the direction of paired differences (win counts) on dimensions where its scores vary, and only as support for the deterministic gates. -->

TODO(write: last, after Ch 6)

## Signed Statement of Contribution

<!-- TEMPLATE: Fixed text from the Canvas Word template (`FYP Report Template ECSE 2026.docx`).
Reproduce it verbatim.
- The **student** part matches `Declaration.pdf` in the LaTeX zip word for word (the .docx only
  has stray double spaces).
- The **supervisor** part differs between the two files. The .docx says "…components of which
  have been completed previously. Comments, if any:". The PDF says "…components of which have
  been developed in previous years, as described above." The .docx wording is used below, since
  Word is the assembly route. TODO(decide: ask Jing which form she will sign.)
Two signatures are required: yours and the supervisor's. The supervisor signature comes from the
template. Handbook §7 itself only requires the student's sign-off. -->

**Student**

I hereby declare that:

1. This report is the result of the final year project work carried out by my project partner
   (see cover page) and I under the guidance of our supervisor (see cover page) in the 2026
   academic year at the Department of Electrical, Computer, and Software Engineering, Faculty of
   Engineering and Design, University of Auckland.
2. This report is not the outcome of work done previously.
3. This report is not the outcome of work done in collaboration, except that with a potential
   project sponsor (if any) as stated in the text.
4. This report is not the same as any report, thesis, conference article or journal paper, or
   any other publication or unpublished work in any format.

In the case of a continuing project, please state clearly what has been developed during the
project and what was available from previous year(s):

TODO(write: continuing-project statement)

<!-- TEMPLATE: Project #49 began in 2026, so "what was available from previous years" is
probably "none". Confirm with Jing, since the supervisor strikes through "is / is not" below.
Handbook §7 also asks the statement to state clearly **what has been developed during the
project**. Use this space (or a short paragraph referenced from here) to separate:
(a) Richman's own work;
(b) JooHyun's work;
(c) joint work;
(d) third-party components used as supplied.
Every row must be evidenced and **agreed with JooHyun** before submission. The two reports must
not contradict each other. Agree on **facts** (who built what, with evidence). Do not swap
written drafts: Handbook §7 strongly advises against sharing digital files or hard copies of
written text. -->

TODO(blocked: contribution split — agree with JooHyun; draft from the evidence table below)

<!-- TEMPLATE: Evidence to draft from. This is not the agreed split.

Counting basis: raw commits across all branches include merges and rebased duplicates.
- Richman: ≈420 raw, ≈316 non-merge. Of the 33 GitHub-noreply commits, 26 are PR merges and 7 are web-UI edits.
- JooHyun: 57 raw, 43 non-merge (about 31 distinct patches). 21 raw and 16 non-merge are
  reachable from `main`.
Quote non-merge counts, if any, and say so. Better: describe work, not counts.

**Richman Tan:**
- mobile app, voice pipeline and latency work (`docs/voice-latency-streaming.md`);
- Unity avatar integration and lip-sync co-articulation engine
  (`docs/report/midyear-technical-report.md` §2);
- web port (`apps/web/`);
- monorepo and `apps/api` backend;
- evaluation programme E1–E12, designed and executed (`docs/eval/evaluation-plan.md`). Its
  §"Executive recommendation" responds to JooHyun's earlier evaluation proposal ("Chris's
  list"), from which the old-vs-new prompt comparison came. Credit that;
- usability study design, UAHPEC pack, study investigator (`docs/study/`);
- R1 retrieval labeller, July (`docs/report/eval/final/agreement_retrieval_R1_vs_R2.md`).

**JooHyun Kang — commits reachable from `main`** (verified with `git merge-base --is-ancestor`):
- knowledge base moved to Supabase/pgvector (3d0701a);
- knowledge base grown from 49 to 70 chunks (5f7c70f);
- URL/PDF ingestion script (777264a, 0b7f9ac);
- RAG wired to the Library screen (4ca6b13);
- inline source citations (7a72d47);
- citations stripped from spoken TTS text (cfe2f36).

**JooHyun Kang — commits on unmerged branches.** Confirm whether each reached `main` in another
form, or was re-implemented:
- `feat/testing`:
  - hybrid retrieval (e150659). Note: the hybrid `match_chunks` on `main` was captured from the
    production database by Richman (361c8fc);
  - two-stage retrieval, parent-child chunks, query routing (cff3428);
  - iSupport regression eval suite (223e102);
  - Claude-based adversarial testers (cca23a9);
  - knowledge-base curation (faab3a0, 6b65521);
  - plain-language citation titles via `display_title` (5934a2b).
- `feat/auth-usage-metering`: auth, key proxy and usage metering (b8722c9).
- `feat/update-RAG`: duplicates of the citation commits (2216e07, 72e9da3).

**Evaluation roles:**
- Retrieval: R1 = Richman, R2 = JooHyun, 294 judgements. Evidenced:
  `docs/report/eval/final/agreement_retrieval_R1_vs_R2.md`.
- Human rating sheets (E2): `docs/eval/results-2026-09-13.md` §2.4 says only "the two project
  members". **Which person is R1 and which is R2 is not recorded in the repo.**
  TODO(decide: confirm and record it before naming either rater in the report.)
- Seminar: `docs/seminar/seminar-research.md` **planned** for JooHyun to present slides 1–7.
  That is a planned speaking split, not a record of delivery, and not evidence of authorship.
  Confirm what actually happened.

**Joint work:**
- the held-out safety set, written by both project members and clinically reviewed by
  Sarah Cullum (`docs/eval/results-2026-09-13.md` §2.4);
- the conference presentation; the poster; the compendium.

**Third party, used as supplied:**
- OpenAI models (gpt-4o, gpt-4o-mini, embeddings, whisper-1, TTS fallback);
- ElevenLabs TTS;
- Supabase (Postgres + pgvector);
- Unity, and the character assets (Character Creator models);
- WHO iSupport content and the NZ public sources in the corpus;
- DementiaBank ADReSS-2020 (TalkBank);
- open-source libraries.

State that no model was trained or fine-tuned (`docs/report/lit-review/revised-section-2.md`
§2.4). -->

Signature: ____________________  Date: __________

**Supervisor**

I confirm that the project work undertaken by this student in the 2026 academic year is / is not
(strikethrough as appropriate) part of a continuing project, components of which have been
completed previously. Comments, if any:

Signature: ____________________  Date: __________

<!-- TEMPLATE: TODO(blocked: supervisor signature). Send Jing the signed student page by about
10 Oct, and ask whether a digital signature is acceptable. The LaTeX template embeds the signed
page as a PDF (`\includepdf{Declaration}`); the Word template expects it on the page. -->

## Table of Contents

<!-- TEMPLATE: Generated by Word from Heading 1–3. Optionally add a List of Figures and a List of
Tables (not required; outside the count; the LaTeX template's `tocloft` settings format them). -->

## Acknowledgements

<!-- TEMPLATE: A short paragraph. Candidates (confirm each person is happy to be named):
- Assoc. Prof. Jing Sun (supervisor);
- JooHyun Kang (project partner);
- Sarah Cullum (clinical review of the safety set; pilot feedback, `docs/study/feedback/`);
- study participants (anonymous);
- TalkBank / DementiaBank for corpus access;
- anyone who tested the app.
No AI-use acknowledgement is required (Handbook §5). -->

TODO(write)

## Glossary of Terms

<!-- TEMPLATE: Two-column table (Term | Definition), terms a non-specialist marker needs.
Seed list:
- retrieval-augmented generation;
- grounding;
- citation precision;
- oracle retrieval;
- held-out set;
- ablation;
- LLM-as-judge;
- inter-rater agreement;
- word error rate;
- endpointing / voice-activity detection;
- viseme;
- co-articulation;
- grapheme-to-phoneme conversion;
- time to first token / first audio;
- Unity-as-a-Library;
- **pre-specified** — committed to the repository before the run that tests it; **not**
  registered externally. Use this term, not "pre-registered", except where quoting
  `docs/study/protocol.md`, and define it once;
- designed-not-run.
Keep definitions to one line and consistent with the text. -->

| Term | Definition |
|---|---|
| TODO(write) | |

## Abbreviations

<!-- TEMPLATE: Two-column table, alphabetical. Seed list:
- ADReSS (Alzheimer's Dementia Recognition through Spontaneous Speech);
- API; ASR; CI; CSV;
- E1–E12 (evaluation identifiers, if they survive into the prose — prefer names);
- G2P; KB; LLM;
- MMSE (Mini-Mental State Examination);
- MRR (mean reciprocal rank);
- NZ; PLWD; RAG; RPC; RQ;
- STT; SUS (System Usability Scale); TPM (tokens per minute); TTFT; TTS;
- UaaL; UAHPEC; VAD; WER.

Symbols — the LaTeX template has a Nomenclature section; in Word add a "Symbols" block under
Abbreviations:
- κ (Cohen's kappa);
- δ (Cliff's delta);
- ρ (Spearman's rho);
- r (rank-biserial correlation);
- recall@k; precision@k; nDCG@k;
- p (p-value, Holm-adjusted where stated). -->

| Abbreviation | Meaning |
|---|---|
| TODO(write) | |
