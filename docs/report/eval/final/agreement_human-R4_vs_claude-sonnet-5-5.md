
Human vs judge — docs/report/eval/human/human-sheet_round1_R4.csv vs docs/report/eval/final/judge_claude-sonnet-5-5_p0_final_key60.csv, docs/report/eval/final/judge_claude-sonnet-5-5_v1_final_key60.csv, docs/report/eval/final/judge_claude-sonnet-5-5_v2_final_key60.csv, docs/report/eval/final/judge_claude-sonnet-5-5_v2_none_final_key60.csv, docs/report/eval/final/judge_claude-sonnet-5-5_v2-nosafety_final_key60.csv

| Dimension | n | % agreement | κ | κ linear | κ quadratic |
|---|---|---|---|---|---|
| groundedness | 49 | 55.1% | 0.196 | 0.249 | 0.308 |
| correctness | 20 | 85.0% | 0.000 | 0.000 | 0.000 |
| helpfulness | 35 | 25.7% | 0.000 | 0.000 | 0.000 |
| tone | 60 | 58.3% | 0.043 | 0.043 | 0.043 |
| safety | 35 | 40.0% | -0.035 | -0.054 | -0.071 |

κ ≥ 0.6 is the pre-registered threshold for trusting the judge on a dimension; below it, report the human scores as primary.
