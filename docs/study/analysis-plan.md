# Analysis Plan

**Pre-specified. Written before any data is collected, and not revised afterwards.**

Companion to `protocol.md` §7. The point of writing this in advance is that it
removes the freedom to choose, after seeing the data, the analysis that flatters the
system. If something here turns out to be the wrong choice, change it and **say in
the report that it was changed and why**.

---

## 1. Reporting discipline

Carried over from `docs/rag/rag-evaluation-plan.md`, which already governs how this
project reports evaluation numbers.

- **Counts and medians, never percentages**, at n < 20. "7 of 11 participants" —
  never "64 %".
- **The word "significant" is used only if a test was run and met.** Not as a synonym
  for "large" or "noticeable".
- Individual-level data is shown wherever it fits: at this n a dot plot of all
  participants is more honest, and more informative, than a bar of means.
- Every table states its n. Sessions that dropped out partway are counted and
  reported, not silently excluded.

---

## 2. Data preparation

1. `scripts/study/export-study-data.mjs` pulls `study_sessions` and `study_events`
   into tidy CSVs keyed by participant code.
2. Exclusions, applied before any analysis and reported as a count:
   - pilot sessions (never included);
   - sessions that did not complete both arms;
   - individual tasks where a technical failure prevented an answer (recorded as a
     technical failure, **not** as a task failure — conflating the two would blame
     the participant for the system's error).
3. Task success is scored from transcripts against the rubric in `tasks.md` §2,
   with interface markers stripped so the scorer is blind to arm where possible.
4. `scripts/study/safety-scan-transcripts.mjs` runs over every transcript before any
   other analysis. A hit stops the analysis and is reported first.

---

## 3. Primary analysis — the two arms

### 3.1 Effectiveness

**Table 1 — Task success by arm**

| | Complete | Partial | Failed | n tasks |
|---|---|---|---|---|
| Arm A (avatar) | | | | |
| Arm B (text) | | | | |

Plus a count of the participants whose self-report disagreed with the rubric score,
split by direction. Over-reporting success on a partial answer is the direction that
matters for a healthcare information tool and is discussed regardless of size.

### 3.2 Efficiency

**Table 2 — Time on task and turns**

| | Median time (s) | Min–max | Median turns | Min–max |
|---|---|---|---|---|
| Arm A | | | | |
| Arm B | | | | |

Paired per participant, since the design is within-subjects. Plot each participant's
two times as a connected pair — with n ≈ 12 the individual lines carry more
information than the medians.

Wilcoxon signed-rank on the paired times **only if** n ≥ 10 complete pairs. If it is
run, report the statistic, the exact p, and the n. If it is not run, say so and
report descriptively.

### 3.3 Usability

**Table 3 — SUS and Likert by arm**

| | Median SUS | Min–max | Trust | Engagement | Helpfulness | Clarity |
|---|---|---|---|---|---|---|
| Arm A | | | | | | |
| Arm B | | | | | | |

Likert items reported as medians with the full response distribution, not means.

### 3.4 Order and set effects

The Latin square exists to control these, so check that it worked: task success and
time by arm-order cell, and by task set. If a set turns out to be materially harder,
report it as a limitation rather than adjusting for it post hoc.

---

## 4. Secondary analysis

### 4.1 Role contrast

Caregivers versus care and health workers, on the same tables, reported descriptively
only. n is far too small for an interaction test. This addresses the personalisation
question: whether workers and family carers rate the same answers differently.

### 4.2 Latency

**Table 4 — Voice pipeline latency, live sessions**

Median and min–max per stage over all Arm A turns: `stt_ms`, `rag_ms`,
`llm_to_token_ms`, `first_sentence_ms`, `tts_first_ms`, `to_first_audio_ms`. State n
turns, and note that browser, device and network varied between participants.

This discharges item 2 of `docs/report/700b_evaluation_plan.md` from real sessions
rather than a scripted run, which is stronger evidence than the protocol originally
asked for. The mid-year Table 4 figures (n = 4 turns, one iPhone, Wi-Fi) become a
controlled-condition comparison point.

**Report against the REST text-to-speech path.** The study build cannot use the
ElevenLabs WebSocket path (`protocol.md` §10.4), so these numbers are not comparable
to those in `docs/voice-latency-streaming.md`.

### 4.3 Reliability and fallbacks

Counts of: speech-recognition failures, Whisper fallbacks, text-to-speech cascade
fallbacks, empty retrievals, avatar load failures, and unrecoverable errors. Reported
per arm. In an unmoderated study these are the interpretation that stops a usability
score being misread — a low Arm A score with a high fallback count is a reliability
finding, not an avatar finding.

### 4.4 Qualitative

Thematic analysis of the five debrief questions plus the PLWD group's responses.
Inductive coding, themes reported with participant counts and illustrative quotes.
With n ≈ 20 the appropriate claim is "several participants described…", never a
percentage.

Debrief question 4 is analysed separately as a safety signal (`instruments.md` §6).

---

## 5. Success criteria

Declared in `protocol.md` §7.1. Recorded here as a table to be filled in with the
result, whatever it is.

| Criterion | Target | Result | Met? |
|---|---|---|---|
| Usability | SUS ≥ 68 and mean Likert ≥ 4 on Arm A | | |
| Efficiency | ≥ 30 % lower median time on task, Arm A vs B | | |
| Safety | Zero safety-gate hits across all transcripts | | |

**On the efficiency criterion.** It is the most likely of the three to fail, for
reasons that are known in advance: measured time to first audio is 2.7–7.6 s against
a text path that streams sooner, and spoken answers are consumed at speaking rate
rather than reading rate. If it fails, report it plainly, and be careful not to
retreat to a claim the data does not support. A defensible conclusion in that case
is that the avatar interface was *preferred* or *more accessible* without being
*faster* — but only if the usability and qualitative data actually show that.

---

## 6. Outputs

| Output | Produced by |
|---|---|
| Tables 1–4 | `scripts/study/analyse-study.mjs` |
| Paired time-on-task plot, SUS distribution, task success bars | `scripts/study/make-study-figures.py` → `docs/report/figures/` |
| Safety scan report | `scripts/study/safety-scan-transcripts.mjs` |
| Thematic codes and quotes | Manual, recorded in `docs/study/results/` |

Figures follow the conventions already used by `scripts/make-figures.py` so the
final report is visually consistent with the mid-year submission.

---

## 7. What would make this study wrong

Recorded in advance, so it is checked rather than remembered.

- **Answer quality differing between arms.** Both arms use the same knowledge base,
  prompt and retrieval, but speech recognition errors change the *query*, so Arm A
  may retrieve differently. Compare retrieved chunk ids across arms for matched
  tasks; if they diverge materially, the comparison is measuring speech recognition
  rather than interface.
- **Self-selection.** Volunteers are more technology-confident than the target
  population. The background confidence item quantifies this — report its
  distribution, do not assume it away.
- **The novelty of the avatar.** A first encounter with a talking 3D avatar inflates
  engagement ratings. A single session cannot separate novelty from durable value.
  State it; do not claim sustained engagement.
- **Single-rater scoring.** One person scores every transcript against the rubric. A
  second rater on a 20 % sample, with agreement reported, would materially strengthen
  this and should be arranged if the supervisor's time allows.
