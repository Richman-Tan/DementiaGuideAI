# 7 Conclusions and Future Work

<!-- TEMPLATE: Budget ≈600 words (≈1 pp). Counted. This is the **last counted section**: the
Canvas template merges "Conclusions and Future Work" into one H1.
Rubric **E** band A: "insightful conclusions and recommendations"; "strong articulation of …
improvements".
Canvas guidance: the conclusion "highlights one or two specific points to which the entire paper
leads" and closes with a take-home message. It introduces no new results or citations. -->

## 7.1 Conclusions

<!-- TEMPLATE: ≈200 words.
- Restate the research problem in one sentence (§1.2).
- Give the two or three findings the report leads to (the §6.2 contributions, in plain words).
- End with a one- or two-sentence take-home message. Candidate direction, from
  `docs/report/lit-review/revised-section-2.md` §2.5: building such an assistant is easy;
  showing that it is trustworthy is the harder and more useful result. -->

TODO(write)

## 7.2 Recommendations

<!-- TEMPLATE: ≈150 words. Concrete, evidence-backed recommendations for anyone deploying a
health assistant of this kind. Each one traces to a result in Ch 5. Candidates:
- test escalation position, not just presence;
- test jurisdiction explicitly;
- for speech from people living with dementia, keep whole utterances and do **not** energy-trim
  inside them (on the production model trimming deleted more speech than the hallucinations it
  removed). Surface empty transcripts to the user rather than answering them;
- gate LLM-judge scores on human agreement before quoting them;
- budget for TTS, not the LLM, in voice deployments.
Keep to 3–5. -->

TODO(write)

## 7.3 Future work

<!-- TEMPLATE: ≈250 words. Order by value.
- The usability study at scale (or at all, if §5.6 took path B), including participants living
  with dementia, with an avatar-without-voice or voice-without-avatar arm so that the avatar's
  own contribution can be isolated.
- Perceptual lip-sync evaluation (E6, designed in `docs/eval/evaluation-plan.md` §5).
- Spoken-turn and on-device latency (the remaining E4 cells), if not done.
- Adaptive personalisation, which was out of scope (§1.4). It answers the portal's original
  outcome and the April RQ2.
- Independent clinical review of the safety set by more than one clinician; a cross-family
  judge.
- Measure the app's actual live path, the primary recogniser plus its trailing-silence
  endpointer, on dementia speech. E9 covered only the fallback, and trailing-silence endpointing
  was not tested.
- ASR evaluation on NZ-accented conversational speech from people living with dementia (the E9
  generalisation gap).
- Corpus maintenance and re-evaluation as sources change.
Each item says what it would establish that this report could not. -->

TODO(write)
