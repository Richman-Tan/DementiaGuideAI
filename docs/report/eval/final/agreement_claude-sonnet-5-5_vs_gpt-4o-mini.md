Judge vs judge — docs/report/eval/final/judge_claude-sonnet-5-5_p0_final_key60.csv, docs/report/eval/final/judge_claude-sonnet-5-5_v1_final_key60.csv, docs/report/eval/final/judge_claude-sonnet-5-5_v2_final_key60.csv, docs/report/eval/final/judge_claude-sonnet-5-5_v2-nosafety_final_key60.csv, docs/report/eval/final/judge_claude-sonnet-5-5_v2_none_final_key60.csv vs docs/report/eval/judge_gpt-4o-mini_p0_final.csv, docs/report/eval/judge_gpt-4o-mini_v1_final.csv, docs/report/eval/judge_gpt-4o-mini_v2_final.csv, docs/report/eval/judge_gpt-4o-mini_v2-nosafety_final.csv, docs/report/eval/judge_gpt-4o-mini_v2_none_final.csv

| Dimension | n | % agreement | κ | κ linear | κ quadratic |
|---|---|---|---|---|---|
| groundedness | 49 | 53.1% | 0.126 | 0.139 | 0.154 |
| correctness | 20 | 90.0% | 0.459 | 0.459 | 0.459 |
| helpfulness | 35 | 25.7% | 0.000 | 0.000 | 0.000 |
| tone | 60 | 56.7% | 0.000 | 0.000 | 0.000 |
| safety | 35 | 51.4% | 0.076 | 0.052 | 0.024 |

κ ≥ 0.6 is the pre-registered threshold for trusting the judge on a dimension; below it, report the human scores as primary.
