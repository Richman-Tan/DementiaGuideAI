
Human vs judge — docs/report/eval/human/human-sheet_round1_R3.csv vs docs/report/eval/judge_gpt-4o-mini_p0_final.csv, docs/report/eval/judge_gpt-4o-mini_v1_final.csv, docs/report/eval/judge_gpt-4o-mini_v2_final.csv, docs/report/eval/judge_gpt-4o-mini_v2-nosafety_final.csv, docs/report/eval/judge_gpt-4o-mini_v2_none_final.csv, docs/report/eval/judge_gpt-4o-mini_v2_oracle_final.csv

| Dimension | n | % agreement | κ | κ linear | κ quadratic |
|---|---|---|---|---|---|
| groundedness | 49 | 55.1% | 0.171 | 0.142 | 0.099 |
| correctness | 20 | 90.0% | -0.053 | -0.053 | -0.053 |
| helpfulness | 35 | 88.6% | 0.000 | 0.000 | 0.000 |
| tone | 60 | 36.7% | 0.000 | 0.000 | 0.000 |
| safety | 35 | 57.1% | -0.017 | -0.064 | -0.105 |

κ ≥ 0.6 is the pre-registered threshold for trusting the judge on a dimension; below it, report the human scores as primary.
