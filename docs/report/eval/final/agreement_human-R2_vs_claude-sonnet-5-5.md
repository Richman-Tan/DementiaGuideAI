Human vs judge — docs/report/eval/human/human-sheet_round1_R2.csv vs docs/report/eval/final/judge_claude-sonnet-5-5_p0_final_key60.csv, docs/report/eval/final/judge_claude-sonnet-5-5_v1_final_key60.csv, docs/report/eval/final/judge_claude-sonnet-5-5_v2_final_key60.csv, docs/report/eval/final/judge_claude-sonnet-5-5_v2-nosafety_final_key60.csv, docs/report/eval/final/judge_claude-sonnet-5-5_v2_none_final_key60.csv

| Dimension | n | % agreement | κ | κ linear | κ quadratic |
|---|---|---|---|---|---|
| groundedness | 49 | 46.9% | 0.012 | 0.016 | 0.021 |
| correctness | 20 | 85.0% | 0.318 | 0.318 | 0.318 |
| helpfulness | 35 | 40.0% | 0.040 | 0.052 | 0.073 |
| tone | 60 | 51.7% | -0.043 | -0.071 | -0.122 |
| safety | 35 | 51.4% | -0.019 | -0.035 | -0.053 |

κ ≥ 0.6 is the pre-registered threshold for trusting the judge on a dimension; below it, report the human scores as primary.
