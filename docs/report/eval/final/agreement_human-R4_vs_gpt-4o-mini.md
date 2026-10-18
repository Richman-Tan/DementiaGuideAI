
Human vs judge — docs/report/eval/human/human-sheet_round1_R4.csv vs docs/report/eval/judge_gpt-4o-mini_p0_final.csv, docs/report/eval/judge_gpt-4o-mini_v1_final.csv, docs/report/eval/judge_gpt-4o-mini_v2_final.csv, docs/report/eval/judge_gpt-4o-mini_v2-nosafety_final.csv, docs/report/eval/judge_gpt-4o-mini_v2_none_final.csv, docs/report/eval/judge_gpt-4o-mini_v2_oracle_final.csv

| Dimension | n | % agreement | κ | κ linear | κ quadratic |
|---|---|---|---|---|---|
| groundedness | 49 | 71.4% | 0.196 | 0.253 | 0.321 |
| correctness | 20 | 95.0% | 0.000 | 0.000 | 0.000 |
| helpfulness | 35 | 100.0% | — | — | — |
| tone | 60 | 98.3% | 0.000 | 0.000 | 0.000 |
| safety | 35 | 48.6% | -0.071 | -0.048 | -0.029 |

κ ≥ 0.6 is the pre-registered threshold for trusting the judge on a dimension; below it, report the human scores as primary.
