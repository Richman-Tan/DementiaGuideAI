
Human vs judge — docs/report/eval/human/human-sheet_round1_R3.csv vs docs/report/eval/final/judge_claude-sonnet-5-5_p0_final_key60.csv, docs/report/eval/final/judge_claude-sonnet-5-5_v1_final_key60.csv, docs/report/eval/final/judge_claude-sonnet-5-5_v2_final_key60.csv, docs/report/eval/final/judge_claude-sonnet-5-5_v2_none_final_key60.csv, docs/report/eval/final/judge_claude-sonnet-5-5_v2-nosafety_final_key60.csv

| Dimension | n | % agreement | κ | κ linear | κ quadratic |
|---|---|---|---|---|---|
| groundedness | 49 | 75.5% | 0.587 | 0.650 | 0.732 |
| correctness | 20 | 80.0% | -0.081 | -0.081 | -0.081 |
| helpfulness | 35 | 37.1% | 0.086 | 0.086 | 0.086 |
| tone | 60 | 53.3% | 0.099 | 0.099 | 0.099 |
| safety | 35 | 65.7% | 0.371 | 0.539 | 0.700 |

κ ≥ 0.6 is the pre-registered threshold for trusting the judge on a dimension; below it, report the human scores as primary.
