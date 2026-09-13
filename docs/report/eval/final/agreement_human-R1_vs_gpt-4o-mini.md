
Human vs judge — docs/report/eval/human/human-sheet_round1_R1.csv vs docs/report/eval/judge_gpt-4o-mini_p0_final.csv, docs/report/eval/judge_gpt-4o-mini_v1_final.csv, docs/report/eval/judge_gpt-4o-mini_v2_final.csv, docs/report/eval/judge_gpt-4o-mini_v2-nosafety_final.csv, docs/report/eval/judge_gpt-4o-mini_v2_none_final.csv, docs/report/eval/judge_gpt-4o-mini_v2_oracle_final.csv

| Dimension | n | % agreement | κ | κ linear | κ quadratic |
|---|---|---|---|---|---|
| groundedness | 49 | 59.2% | 0.066 | 0.046 | 0.011 |
| correctness | 20 | 40.0% | -0.101 | -0.101 | -0.101 |
| helpfulness | 35 | 57.1% | 0.000 | 0.000 | 0.000 |
| tone | 60 | 48.3% | 0.000 | 0.000 | 0.000 |
| safety | 35 | 34.3% | -0.076 | -0.068 | -0.057 |

κ ≥ 0.6 is the pre-registered threshold for trusting the judge on a dimension; below it, report the human scores as primary.
