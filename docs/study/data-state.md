# Study data — state of the database

Snapshot taken 2026-09-21 by querying `study_sessions` and `study_events` directly
with the service role key. **Study data itself is git-ignored** and never enters the
repository (`ethics/data-management-plan.md` §6); this file records only session
counts and completeness so the report has a citable provenance record. No participant
content, no transcripts, no identifying detail.

Regenerate the underlying export with
`node scripts/study/export-study-data.mjs [--include-pilot]`.

## Sessions

7 sessions, 534 events.

| P# | `is_pilot` | group | started (UTC) | completed | last step | turns | SUS | Likert | post-task |
|---|---|---|---|---|---|---:|---:|---:|---:|
| P01 | true | pilot | 2026-09-02 00:10 | 2026-09-02 00:21 | debrief | 6 | 2 arms | 2 | 6 |
| P02 | true | pilot | 2026-09-08 02:19 | — | armbrief | 7 | — | — | 1 |
| P03 | true | pilot | 2026-09-08 19:56 | 2026-09-08 20:06 | debrief | 3 | 2 arms | 2 | 6 |
| P04 | true | pilot | 2026-09-15 12:41 | — | task | 1 | — | — | — |
| P05 | true | pilot | 2026-09-01 09:06 | — | task | 0 | — | — | — |
| P06 | true | pilot | 2026-09-15 22:41 | 2026-09-15 22:50 | debrief | 11 + **32** | 2 arms | 2 | 6 |
| P07 | false | caregiver | 2026-09-16 00:46 | 2026-09-17 02:54 | task (stopped early) | 0 | — | — | — |

## What is and is not analysable

**Three sessions ran the full protocol** — P01, P03 and P06 each reached `debrief`,
with `session_complete`, six `task_start`/`task_end` pairs, six post-task responses,
**SUS for both arms** and two Likert blocks. That is a complete within-subjects run of
the instrument, which is what the analysis plan needs.

**Four did not.** P02 stopped at the second arm brief (one task, one post-task
response). P04 and P05 barely started. P07 was stopped early with no turns.

**P06's turn data is contaminated and must be excluded.** Its 11 turns on 15 Sep are
the human session; the **32 turns dated 18 Sep (UTC)** are the automated E4 latency
batch driven into this session by `latency-web_2026-09-19_typed`. P06's
questionnaire data is unaffected (SUS, Likert and post-task responses are all stamped
15 Sep), but its turn count, task timings and efficiency measures are not participant
data and must not be reported as such.

So, subject to the provenance question below: **n = 3 for SUS, Likert and post-task
measures; n = 2 (P01, P03) for task efficiency and turn counts.**

## Open provenance question — must be resolved before anything is reported

Six of the seven sessions carry `is_pilot = true` and `participant_group = 'pilot'`.
`scripts/study/export-study-data.mjs` excludes them by default, and
`pilot-checklist.md` states pilot sessions exist to debug the protocol and are never
reported.

On 2026-09-21 the user stated that the sessions in the database are real user
studies. That contradicts the stored flag, and the flag is what an examiner reading
this repository would see. Two things follow:

1. **The flag cannot simply be flipped.** Whether a session is participant data is a
   research-integrity question, not a boolean. It needs a per-participant record of
   who took part and when, and any correction to the flag has to be dated and
   attributed in this file.
2. **P06 is not recoverable as a participant session for turn-level measures**
   regardless of how the flag is resolved, because of the automated batch above.
   Its questionnaire responses are separable and may be.

Recruitment is ongoing as at 2026-09-21. Until the provenance is recorded here, the
report states that the study is in progress and makes no usability claim.

## Data cutoff

The final report is due **18 Oct 2026**. Analysis, figures and write-up need roughly
a week, so the practical cutoff for including a session is about **10 Oct**.
Anything collected after that is reported as collected-but-not-analysed.
