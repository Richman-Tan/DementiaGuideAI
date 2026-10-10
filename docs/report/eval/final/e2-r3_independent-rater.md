# E2-R3 — independent health-care rater (plan §18.5)

Pre-specification: `docs/eval/evaluation-plan.md` §18.5, committed and pushed as `327cbeb` (C2 clarification `fae1d30`) before the rating link was shared. Summary written by `scripts/eval/r3-summarise.mjs` at `c5b1154` on 2026-10-10.

R3 is **a health-care worker independent of the project**. No name, workplace or job title is recorded here.

| Item | Value |
|---|---|
| Items | the 60 round-1 items, same order and rubric wording (2026-09-13) as R1 and R2; 199 judgements |
| Sheet | `docs/report/eval/human/human-sheet_round1_R3.csv`, validated by `r3-validate.mjs` (complete, eligible, ≥ 30 on-screen minutes) |
| Page | `r3-rating-1.0`; rated 2026-10-10 to 2026-10-10, 1 sitting(s), 46.1 on-screen minutes |
| Regenerate | `analyse-r3.sh` (author's folder), or the five `agreement.mjs` calls listed in §18.5, then `node scripts/eval/r3-summarise.mjs` |

## A1 — R3 against R1 and R2 (primary)

Unweighted Cohen's κ, categories {0,1,2}; tables with linear and quadratic κ in `agreement_human_R1_vs_R3.md` and `agreement_human_R2_vs_R3.md`. "n.a." marks a comparison that is not assessable (one side gives one value on ≥ 95 % of the items).

| Dimension | n | κ R3–R1 | κ R3–R2 | κ R1–R2 (for reference) | % agreement R3–R1 / R3–R2 |
|---|---:|---:|---:|---:|---|
| groundedness | 49 | -0.070 | -0.055 | 0.692 | 38.8 % / 42.9 % |
| correctness | 20 | -0.053 (n.a.) | -0.071 (n.a.) | 0.643 | 90 % / 85 % |
| helpfulness | 35 | -0.085 | -0.099 | 0.930 | 65.7 % / 62.9 % |
| tone | 60 | -0.171 | -0.150 | 0.627 | 30 % / 28.3 % |
| safety | 35 | -0.094 | -0.094 | 0.635 | 65.7 % / 65.7 % |

## A2 — judges against R3 (descriptive)

The κ ≥ 0.6 gate stays defined against R1 and R2 (§5, §18.2); these values cannot pass or fail it.

| Dimension | κ gpt-4o-mini–R3 | κ claude-sonnet-5-5–R3 |
|---|---:|---:|
| groundedness | 0.171 | 0.587 |
| correctness | -0.053 (n.a.) | -0.081 (n.a.) |
| helpfulness | 0.000 (n.a.) | 0.086 |
| tone | 0.000 (n.a.) | 0.099 |
| safety | -0.017 | 0.371 |

## A3 — score distributions (pooled over the 60 items, never split by condition)

| Dimension | R3 0 / 1 / 2 | R1 0 / 1 / 2 | R2 0 / 1 / 2 | Claude 0 / 1 / 2 | Claude below R3 / above R3 |
|---|---|---|---|---|---|
| groundedness (49) | 4 / 22 / 23 | 5 / 5 / 39 | 1 / 8 / 40 | 7 / 18 / 24 | 7 / 5 |
| correctness (20) | 0 / 1 / 19 (one value ≥ 95 %) | 0 / 1 / 19 | 0 / 2 / 18 | 0 / 3 / 17 | 3 / 1 |
| helpfulness (35) | 0 / 4 / 31 | 1 / 8 / 26 | 1 / 9 / 25 | 0 / 26 / 9 | 22 / 0 |
| tone (60) | 0 / 38 / 22 | 0 / 8 / 52 | 2 / 5 / 53 | 0 / 26 / 34 | 8 / 20 |
| safety (35) | 6 / 3 / 26 | 0 / 3 / 32 | 0 / 3 / 32 | 5 / 11 / 19 | 9 / 3 |

Overall means over the 199 judgements: R3 **1.56**, R1 1.81, R2 1.82, Claude judge 1.46.

## A4 — R3 against R1's set-aside first pass (descriptive)

| Dimension | κ R3–R1 pass 2 (record) | κ R3–R1 pass 1 |
|---|---:|---:|
| groundedness | -0.070 | 0.204 |
| correctness | -0.053 | 0.083 |
| helpfulness | -0.085 | 0.044 |
| tone | -0.171 | -0.023 |
| safety | -0.094 | 0.009 |

## Conclusions re-checked (C1–C5, as §18.5 defines "holds")

| Dimension | C1 human instrument | C2 failure is the judges' | C3 Claude stricter |
|---|---|---|---|
| groundedness | does not hold | not supported | holds (7 below / 5 above) |
| correctness | not assessable | not assessable | holds (3 below / 1 above) |
| helpfulness | does not hold | not supported | holds (22 below / 0 above) |
| tone | does not hold | not supported | does not hold (8 below / 20 above) |
| safety | does not hold | not supported | holds (9 below / 3 above) |

- **C3 overall** ("stricter than the raters on every dimension"): **does not hold** — not on tone.
- **C4** (human scores near the ceiling): **does not hold** — R3 mean 1.56 against the cut of 1.64.
- **C5** (R1's second pass is the record): **does not hold** — κ(R3, pass 2) > κ(R3, pass 1) on 0 of 5 dimensions (none); a dimension that is not assessable counts against.

Per §18.5, a conclusion the results state for "every dimension" is restated in the report for the dimensions where it holds above, and not kept where it does not.

## Expectations (X1–X7)

| # | Expectation | Result | Verdict |
|---|---|---|---|
| X1 | R3's overall mean is below both R1's and R2's | R3 1.56; R1 1.81, R2 1.82 | **supported** |
| X2 | on ≥ 3 of groundedness, helpfulness, tone, safety, R3's κ against both R1 and R2 is below the R1–R2 κ | 4 of 4 | **supported** |
| X3 | C1 holds on helpfulness | C1 helpfulness: does not hold | **not supported** |
| X4 | neither judge reaches κ 0.6 against R3 on any dimension | max κ: gpt-4o-mini 0.171, claude-sonnet-5-5 0.587 | **supported** |
| X5 | C3 holds on at least 4 of the 5 dimensions | 4 of 5 | **supported** |
| X6 | C5 holds | 0 of 5 dimensions | **not supported** |
| X7 | R3 gives 2 to at least 18 of the 20 correctness items | 19 of 20 | **supported** |
