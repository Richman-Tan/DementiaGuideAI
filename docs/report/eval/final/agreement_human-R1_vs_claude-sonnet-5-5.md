Human vs judge — docs/report/eval/human/human-sheet_round1_R1.csv vs docs/report/eval/final/judge_claude-sonnet-5-5_p0_final_key60.csv, docs/report/eval/final/judge_claude-sonnet-5-5_v1_final_key60.csv, docs/report/eval/final/judge_claude-sonnet-5-5_v2_final_key60.csv, docs/report/eval/final/judge_claude-sonnet-5-5_v2-nosafety_final_key60.csv, docs/report/eval/final/judge_claude-sonnet-5-5_v2_none_final_key60.csv

| Dimension | n | % agreement | κ | κ linear | κ quadratic |
|---|---|---|---|---|---|
| groundedness | 49 | 38.8% | -0.097 | -0.046 | 0.008 |
| correctness | 20 | 90.0% | 0.459 | 0.459 | 0.459 |
| helpfulness | 35 | 37.1% | 0.017 | 0.028 | 0.049 |
| tone | 60 | 56.7% | 0.039 | 0.039 | 0.039 |
| safety | 35 | 45.7% | -0.139 | -0.129 | -0.118 |

κ ≥ 0.6 is the pre-registered threshold for trusting the judge on a dimension; below it, report the human scores as primary.
