# 6 Discussion

<!-- TEMPLATE: Budget ≈2,000 words (≈3.3 pp). Counted. Rubric **E** (25 %). Also completes
**D** (comparison with literature; evaluation of validity) and **A** (connections across the
field).

E band A:
- "highly knowledgeable, logical, and expert interpretation";
- "meaningful contribution to existing knowledge or clear connection to real-world problems";
- "strong articulation of significance, limitations, and improvements";
- "**claims are proportionate to findings, contributions, and impact**".
Band C/D language to avoid: "may overstate", "exaggerated articulation of importance".

Canvas guidance ("Report writing: Discussion & Conclusion"):
- restate the RQ, answer it, give the supporting evidence, compare with the literature,
  explain differences;
- be open about unexpected and negative results;
- acknowledge limitations concisely and honestly (at least one paragraph);
- cover unanswered questions;
- **do not introduce new results**; do not speculate;
- write for a general audience, keeping technical detail in Ch 4–5;
- active voice; past tense for what was done, present tense for what it means.

Starting material:
- `docs/eval/results-2026-09-13.md` §2.5 ("What the matrix supports");
- `docs/report/lit-review/alignment.md` §6 (contribution candidates and the do-not-claim list);
- `docs/report/lit-review/revised-section-2.md` §Evidence map;
- `docs/report/results-discussion-conclusion-draft.md` §7 (lip-sync discussion only; the rest is
  stale). -->

## 6.1 Answers to the research questions

<!-- TEMPLATE: ≈1,050 words. One paragraph block per RQ, **in the same order as Ch 5**. Each
block follows the same four moves:
1. **Answer**: one sentence, in the RQ's own terms.
2. **Evidence**: point to the §5.x figure/table; no new numbers.
3. **Comparison with literature**: agree / differ / new; explain differences. Cite §2.x.
4. **Validity**: the one or two threats that most limit *this* answer.

Suggested weights (words): RQ1 70 · RQ2 190 · RQ3 210 · RQ4 140 · RQ5 210 · RQ6 90 · RQ7 140
(path A) — sums to 1,050. On path B, RQ7 takes 60 words and the other 80 go to RQ2/RQ3.

Per-RQ reminders:
- **RQ1** → the gap table (§2.7). Restate the gap the project occupies.
- **RQ2** → lead with the deterministic evidence; the judge's paired comparisons are only
  supporting (§4.3). The expected result was *mixed*. RAG's measurable value is NZ specifics, verifiable
  citations and fewer phone numbers outside the verified NZ list, not generic advice (`docs/eval/evaluation-plan.md` §6/§7
  and H2.1). Say which pre-specified expectations held and which did not.
- **RQ3** → scope the claim exactly:
  - the safety block controls **where** escalation appears (111 in the first sentence) and
    prevents dose statements;
  - without the block the model still mentions 111 in most emergency answers
    (`docs/eval/results-2026-09-13.md` §2.4);
  - retrieval is not what makes the answers safe;
  - the NZ persona fixes region;
  - the AU → NZ failure was found and removed under measurement.
  Whether escalation *position* matters clinically is untested; say so. Compare with §2.4 of
  this report.
- **RQ4** → articulation met its acceptance criteria. The criteria were set by the author, so
  perceptual validity is untested (E6). Latency: answer against the post-hoc yardstick from
  §2.2/§4.5, and say it was chosen after the run. Typed turns only, unless E4 was completed.
  If no defensible yardstick is found, reword RQ4's latency half in §1.3.
- **RQ5** → compare the WER with published ADReSS / Whisper-large results (§2.5).
  - Energy-VAD trimming: on the production model, energy-VAD trimming inside utterances made WER
    **worse**. The apparent benefit belonged to the 8-bit proxy.
  - What survives: the dementia–control gap, and more frequent stock-phrase hallucination on
    dementia speech.
  - Downstream: at the production error profile the cost shows in retrieval rank (MRR). Under
    the harsher 8-bit profile, a conservative bound, citation density fell and no unsafe output
    appeared. Name the profile beside each claim.
- **RQ6** → TTS, not the LLM, dominates cost and capacity. Connect this to deployability.
  Name the comparator: provider-documented limits and prices, or published voice-agent cost
  figures if any are found. If no published comparator exists, say so explicitly (rubric D asks
  for comparison with literature on every finding).
- **RQ7** → path A: descriptive answer scaled to n, pre-specified criteria met or not. Path B:
  "not answered; see §7.3". -->

TODO(write: after Ch 5)

## 6.2 Contributions

<!-- TEMPLATE: ≈300 words. 3–4 numbered contributions. §1.5 and the Abstract copy these
word-for-word.

Candidates (`docs/report/lit-review/alignment.md` §6), each written as a claim scoped to its
evidence:
1. A measured prompt/safety ablation on a dementia-care assistant, including a jurisdictional
   failure found and fixed under measurement.
2. WER of the app's deployed **fallback** recogniser (`whisper-1`) and alternative recognisers on
   ADReSS-2020, split by recogniser and input condition, with downstream retrieval/answer
   degradation — a system-level result. The primary live recogniser is not covered; say so.
3. A cost and capacity model showing speech synthesis dominates a spoken turn.
4. An evaluation programme as a reusable method for student and small-team health assistants:
   - pre-specified designs;
   - a **human-agreement gate that detected an invalid LLM judge**. The judge failed the gate
     on four dimensions and was unvalidated on the fifth (§4.3). The gate kept its scores out of
     the headline claims;
   - a requirements matrix.

**Attribute each contribution.** The report is individual, so each contribution states the
author's own role, consistent with the Statement of Contribution. For example, E1 evaluates
retrieval and citation code that includes JooHyun's work; the contribution is the evaluation,
not the retriever.

Claim-novelty wording must be hedged to the search actually done: "to the best of this review"
(`docs/report/lit-review/revised-section-2.md` §2.5 uses that hedge).

**Do-not-claim list** (from `docs/report/lit-review/alignment.md` §6, plus the κ gate):
- engagement or usability benefit from the avatar (unless §5.6 path A supports a descriptive
  statement);
- **attributing any study arm difference to the avatar itself**: Arm A is avatar **plus voice**;
- any care outcome;
- anything about people living with dementia *using* the system;
- anything beyond the judge rule (§4.3): no per-condition judge means; judge evidence is limited to the direction of paired differences (win counts) on dimensions where its scores vary, and only as support for the deterministic gates;
- effectiveness of personalisation;
- clinical safety beyond the tested items. -->

TODO(write)

## 6.3 Strengths, limitations and threats to validity

<!-- TEMPLATE: ≈400 words. **Consolidated** — only threats that cut across evaluations. Threats
specific to one RQ stay in §6.1.

Strengths:
- pre-specified designs;
- held-out safety set;
- paired designs with multiplicity correction;
- sha-stamped reproducibility;
- corrections made openly (the whisper-1 runaway correction; the κ-as-coverage reading; the gate
  vs judge distinction).
These are what the E band-A "proportionate claims" descriptor rewards; say them plainly, without
self-praise.

Limitations — sources:
- `docs/eval/evaluation-plan.md` §15 (5.12 list);
- `docs/eval/results-e9-stt-2026-09-18.md` §6;
- `docs/study/protocol.md` §10.
Limitations to cover:
- author-designed fixtures (question sets, safety items, articulation thresholds);
- E2 prompt results are in-sample (the development set was used to tune v2); E3 is the held-out
  check;
- single clinical reviewer;
- judge validity: the κ gate failed on four dimensions, and the fifth (correctness) cleared the
  threshold numerically on 20 items, 19 at ceiling, and is treated post hoc as unvalidated; the judge had zero variance on helpfulness and tone on the human-rated subset;
- human raters: R1's two passes were uncorrelated, and the record pass was chosen by agreement
  with the gates (then confirmed by R2); both raters are the system's authors and wrote the
  safety set;
- escalation position vs clinical effect: untested;
- the study compares interfaces (avatar + voice vs text), not the avatar alone;
- expectations were pre-specified in the repository, not externally registered, and some
  confirmed July observations rather than predicting new ones (§1.3);
- small n in retrieval labels;
- one development machine and network for latency;
- US-English clinical audio;
- only the fallback recogniser was measured on dementia speech; the primary live recogniser was
  not;
- the planned cross-family judge was not run;
- synthetic ASR perturbation;
- study sample (or its absence);
- corpus snapshot drift since evaluation;
- provider model versions not under the project's control. -->

TODO(write)

## 6.4 Implications

<!-- TEMPLATE: ≈250 words. The "why should anyone care" paragraph (Canvas: broader engineering
and human implications).
- For carers and NZ services: jurisdiction-correct escalation as a requirement.
- For teams deploying health assistants outside the US: the transferable failure mode and its
  remedy (`docs/report/lit-review/revised-section-2.md` §2.5).
- For speech-first design for people living with dementia: within-utterance energy trimming is
  not a free improvement for the production model, and stock-phrase hallucination is more
  frequent on dementia speech (rates in `docs/eval/results-e9-stt-2026-09-18.md` §3.1).
- For cost: voice multiplies cost; see E12.
Connect to WHO LMM governance [@who-lmm-ethics2024]. No speculation beyond the evidence;
recommendations belong in §7.2. -->

TODO(write)
