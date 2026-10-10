# Addendum 2026-10-11 — §19F: usability extension to 15 family carers (E7-X) and a second independent rater (E2-R4)

> Committed and pushed on branch `eval/s19f-extension` **before any new study session and before the
> H03 rating link is sent**. Nothing here changes the evaluated system or any earlier result. The
> earlier results stay as reported; these are additions.

## 19F.1 Why

Every external examiner of the draft report named two limits of the human evidence: five family
carers in the October usability round (the protocol targeted 8–12), and an answer-quality instrument
on which the two authors agree but the one independent rater (§18.5, R3) agrees with neither. This
addendum extends both, with stopping rules and analyses fixed now.

## 19F.2 E7-X — more family carers in the October usability round

**Who.** Current or recent family carers of a person living with dementia (protocol §3.2), not
involved in building or evaluating DementiaGuide, not an E2 or E6 rater, and not an earlier study
participant. Care workers (paid carers, support workers, nurses) are the protocol's second group and
are reported separately, as P14 was. People with no caring experience are not enrolled.

**Stopping rule (fixed now).** Recruit until **15 family carers in total** have completed both arms
(10 more than the five of 9–10 October), or until **Thursday 15 October 2026, 18:00 NZDT**, whichever
comes first. Care workers: up to **6 in total** (5 more), same deadline. No session starts after the
deadline. The sample is whatever is complete at that point; no interim analysis of the new sessions
is made before it.

**Procedure.** As on 9 October (results §5.6; report §4.4): in person, one participant at a time, on
the laptop provided by the clinical collaborator; the author sets the session up and is not in the
room; consent in the app before any task; the October harness unchanged (shorter task panel, full
instructions up front, Firefox admitted, avatar locked). The deployed app is the build P16 used: the
last app change, the spoken-number fix (PR #129, deployed 20:49 NZDT on 9 October), precedes every
new session, and no app change is made until the extension closes. Session codes continue from P17.

**Analyses.**
- **Primary, unchanged:** the protocol's success criteria (§7.1, committed 18 August 2026) on all
  family carers: median Arm A SUS ≥ 68; mean Arm A Likert ≥ 4 on the analysis script's definition,
  with the mean of all ratings as sensitivity; Arm A time per task ≥ 30% below Arm B; no safety-gate
  hit. Time per task is reported with and without tasks in which the browser tab was hidden for more
  than 30 s, as the report already does.
- **Added now, before the new data (exploratory):** a two-sided Wilcoxon signed-rank test on each
  carer's SUS difference (A − B), with the median difference and the count of carers rating A higher,
  equal and lower. Because the first five carers' results are known, every analysis is also reported
  on the **new carers alone**.
- **Safety reading:** every consented answer read, as before.

**Expectations (directional, able to fail).**
- **Z1.** Median Arm A SUS stays below 68.
- **Z2.** More family carers rate Arm A lower than Arm B on SUS than higher.
- **Z3.** No safety-gate hit in any new session.

## 19F.3 E2-R4 — a second independent rater

**Who and what.** One more health-care worker meeting all four §18.5 conditions, rating on the same
page (`dementiaguide-r3.vercel.app`, page version `r3-rating-1.0`, unchanged) with code **H03**: the
same 60 items, order and rubric as R1, R2 and R3. The rater must not have seen R3's file or talked with
R3 about the items.

**Exclusion rules.** Exactly §18.5's (incomplete or altered sheet; eligibility or consent missing;
under 30 on-screen minutes; duplicates; and a deadline): a file received after **Friday 16 October
2026 (NZDT)** is not used.

**Analyses** (`agreement.mjs` unchanged; R4's sheet saved as `human-sheet_round1_R4.csv`):
- **B1 (primary).** Unweighted Cohen's κ per dimension, R4 against R3: do two independent health-care
  raters apply the rubric alike? A dimension **holds** for independent raters if κ(R3, R4) ≥ 0.6, the
  report's existing threshold; a dimension where either rater gives one value on ≥ 95% of items is
  not assessable.
- **B2 (descriptive).** R4 against R1 and against R2.
- **B3 (descriptive).** Each judge against R4.
- **Never computed:** per-condition means or rankings (12 items per condition cannot rank conditions;
  §18.5).

**Expectations (directional, able to fail).**
- **Y1.** κ(R3, R4) ≥ 0.6 on at least two of groundedness, helpfulness, tone and safety.
- **Y2.** On at least three of those four, R4 agrees more with R3 than with either author.

## 19F.4 Reporting

Results go to `docs/eval/results-2026-10-15-s19f.md` and into the report whatever they show. If a
stopping rule ends either part with fewer people than hoped, the number reached is reported with the
reason. Study data stay out of the repository except the aggregate tables the export scripts write.
