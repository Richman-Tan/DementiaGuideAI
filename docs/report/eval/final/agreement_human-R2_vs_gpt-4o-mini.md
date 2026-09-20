
Human vs judge — docs/report/eval/human/human-sheet_round1_R2.csv vs docs/report/eval/judge_gpt-4o-mini_p0_final.csv, docs/report/eval/judge_gpt-4o-mini_v1_final.csv, docs/report/eval/judge_gpt-4o-mini_v2_final.csv, docs/report/eval/judge_gpt-4o-mini_v2-nosafety_final.csv, docs/report/eval/judge_gpt-4o-mini_v2_none_final.csv, docs/report/eval/judge_gpt-4o-mini_v2_oracle_final.csv

| Dimension | n | % agreement | κ | κ linear | κ quadratic |
|---|---|---|---|---|---|
| groundedness | 49 | 69.4% | 0.001 | 0.039 | 0.096 |
| correctness | 20 | 95.0% | 0.643 | 0.643 | 0.643 |
| helpfulness | 35 | 71.4% | 0.000 | 0.000 | 0.000 |
| tone | 60 | 88.3% | 0.000 | 0.000 | 0.000 |
| safety | 35 | 68.6% | -0.035 | 0.037 | 0.131 |

κ ≥ 0.6 is the pre-registered threshold for trusting the judge on a dimension; below it, report the human scores as primary.
