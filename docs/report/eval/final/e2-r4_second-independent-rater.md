# E2-R4: a second independent health-care rater (plan §19F.3)

**Plan.** `docs/eval/plan-19f-extension.md` §19F.3, committed and pushed as `cef29c4` (11 Oct
2026) before the rating link was sent.

**Rater.** R4 (code H03) is a second health-care worker independent of the project. No name,
workplace or job title is recorded here.

| Item | Value |
|---|---|
| Items | The 60 round-1 items, in the same order and with the same rubric and page (`r3-rating-1.0`) as R1, R2 and R3; 199 judgements |
| Sheet | `docs/report/eval/human/human-sheet_round1_R4.csv` |
| Validation | Validated by `scripts/eval/r3-validate.mjs` with §18.5's exclusion rules: complete and unaltered, every eligibility statement and consent answered "yes", 61.8 on-screen minutes (minimum 30), received 12 Oct 2026, before the 16 Oct deadline |
| Agreement | `scripts/eval/agreement.mjs`, unchanged. Tables: `agreement_human_R3_vs_R4.md`, `agreement_human_R1_vs_R4.md`, `agreement_human_R2_vs_R4.md`, `agreement_human-R4_vs_gpt-4o-mini.md`, `agreement_human-R4_vs_claude-sonnet-5-5.md` |

**Assessability.** A dimension is not assessable when either rater gives one value on at least 95%
of its items (§19F.3).

| Dimension | Share of R4's items at the top score |
|---|---|
| Correctness | 20 of 20 |
| Helpfulness | 35 of 35 |
| Tone | 59 of 60 |

Those three dimensions are therefore **not assessable**. Groundedness and safety are assessable.

## B1 (primary): R4 against R3

Unweighted Cohen's κ, categories {0, 1, 2}.

| Dimension | n | % agreement | κ R3–R4 |
|---|---:|---:|---:|
| Groundedness | 49 | 59.2% | **0.278** |
| Correctness | 20 | 95.0% | n.a. (ceiling) |
| Helpfulness | 35 | 88.6% | n.a. (ceiling) |
| Tone | 60 | 38.3% | n.a. (R4 at ceiling) |
| Safety | 35 | 51.4% | **−0.055** |

No dimension **holds** for independent raters (κ ≥ 0.6).

## B2 (descriptive): R4 against the project members

| Dimension | κ R1–R4 | κ R2–R4 |
|---|---:|---:|
| Groundedness | −0.091 | −0.091 |
| Correctness | n.a. | n.a. |
| Helpfulness | n.a. | n.a. |
| Tone | n.a. | n.a. |
| Safety | −0.021 | −0.021 |

## B3 (descriptive): the judges against R4

| Dimension | κ gpt-4o-mini–R4 | κ claude-sonnet-5-5–R4 |
|---|---:|---:|
| Groundedness | 0.196 | 0.196 |
| Safety | −0.071 | −0.035 |

The other dimensions are not assessable.

## Score levels

| Rater | Mean of 199 scores | Zeros on safety | Top-score tone |
|---|---:|---:|---:|
| R1 | 1.81 | 0 | 52 |
| R2 | 1.82 | 0 | 53 |
| R3 | 1.56 | 6 | 22 |
| R4 | 1.81 | 9 | 59 |

R4 scored as high overall as the members but gave more safety zeros than any other rater.

## Expectations (§19F.3)

| | Expectation | Result |
|---|---|---|
| Y1 | κ(R3, R4) ≥ 0.6 on at least two of groundedness, helpfulness, tone and safety | **Not supported.** Groundedness is 0.28, safety is −0.06, and helpfulness and tone are not assessable |
| Y2 | On at least three of those four, R4 agrees more with R3 than with either member | **Not supported.** It held on groundedness only: 0.28 against −0.09 |

## Reading

Two independent health-care workers agreed neither with the project members nor, beyond fair
agreement on groundedness, with each other. Their disagreement on safety is complete: both gave
zeros, but not to the same answers.

The failure therefore lies in the instrument, not only in who rates. The instrument is a
three-point scale with most answers at the top, no example answers and no calibration round. Only the
two members reach the 0.6 threshold with each other. No pair that includes an independent rater
reaches it on any assessable dimension, whether the other side is a person or a judge.

The answer-quality ratings cannot serve as a reference for any judge or claim.
