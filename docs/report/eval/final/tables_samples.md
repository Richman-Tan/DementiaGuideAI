# Evaluation tables — samples

## Table A — deterministic measures per condition

Rates are per answer; brackets are counts. Length and readability are over citation-stripped text.

| Measure | v2:x3:final | v2-nosafety:x3:final | v1:x3:final | p0:x3:final | v2:none:x3:final |
|---|---|---|---|---|---|
| Answers (items × samples) | 390 (130 × 3) | 390 (130 × 3) | 390 (130 × 3) | 390 (130 × 3) | 390 (130 × 3) |
| Model / temperature | gpt-4o / 0.7 | gpt-4o / 0.7 | gpt-4o / 0.7 | gpt-4o / 0.7 | gpt-4o / 0.7 |
| Retrieval | production | production | production | production | none |
| Knowledge-base refusal, in-scope items | 0.0% (0/99) | 0.0% (0/99) | 0.0% (0/99) | 0.0% (0/99) | 0.0% (0/99) |
| 111 in first sentence, emergency items | 95.6% (43/45) | 0.0% (0/45) | 0.0% (0/45) | 0.0% (0/45) | 100.0% (45/45) |
| Foreign emergency number | 0.0% (0/390) | 0.0% (0/390) | 6.9% (27/390) | 0.0% (0/390) | 0.0% (0/390) |
| Dose stated (mg/mcg) | 0.0% (0/390) | 1.5% (6/390) | 2.1% (8/390) | 0.3% (1/390) | 0.3% (1/390) |
| Australian service named | 0.0% (0/390) | 0.0% (0/390) | 33.6% (131/390) | 9.7% (38/390) | 0.0% (0/390) |
| System-prompt leak | 0.0% (0/390) | 0.0% (0/390) | 0.0% (0/390) | 0.0% (0/390) | 0.0% (0/390) |
| Phone number not in the verified NZ list | 0.0% (0/390) | 0.0% (0/390) | 38.7% (151/390) | 7.9% (31/390) | 1.0% (4/390) |
| Citation precision (markers) | 100.0% (848/848) | 100.0% (845/845) | — (no markers) | — (no markers) | 100.0% (1/1) |
| Answers with any citation marker or Sources list | 61.8% (241/390) | 66.4% (259/390) | 19.2% (75/390) | 96.7% (377/390) | 0.3% (1/390) |
| Words per answer (median, p90) | 170, 245 | 185, 237 | 177, 233 | 170, 227 | 150, 234 |
| Flesch–Kincaid grade (median) | 11.3 | 11.3 | 11.6 | 11.4 | 10.7 |
| Jargon definitions per answer (mean) | 0.13 | 0.18 | 0.10 | 0.14 | 0.07 |
| Mentions GP/doctor | 47.7% (186/390) | 53.6% (209/390) | 50.3% (196/390) | 47.2% (184/390) | 43.3% (169/390) |
| Mentions Healthline | 13.8% (54/390) | 25.6% (100/390) | 2.6% (10/390) | 9.0% (35/390) | 20.3% (79/390) |
| Mentions Alzheimers NZ | 41.8% (163/390) | 50.8% (198/390) | 10.8% (42/390) | 20.8% (81/390) | 42.3% (165/390) |
| Truncated at max_tokens | 0.0% (0/390) | 0.0% (0/390) | 0.0% (0/390) | 0.0% (0/390) | 0.0% (0/390) |

## Table B — judge scores per condition (0/1/2)

Paired Wilcoxon signed-rank against the reference column (v2) on shared (id, sample) rows; r = matched-pairs rank-biserial (positive = reference scores higher). n < 10 pairs: statistic reported, defer to exact tables.

| Judge | Column | Dimension | n | mean | 0 / 1 / 2 | vs reference: n pairs | Δ mean | W+ / W− | p | p (Holm) | r |
|---|---|---|---|---|---|---|---|---|---|---|---|
| gpt-4o-mini | v2:x3:final | groundedness | 318 | 1.92 | 1 / 25 / 292 | — | — | — | — | — | — |
| gpt-4o-mini | v2:x3:final | correctness | 99 | 2.00 | 0 / 0 / 99 | — | — | — | — | — | — |
| gpt-4o-mini | v2:x3:final | helpfulness | 162 | 1.99 | 0 / 1 / 161 | — | — | — | — | — | — |
| gpt-4o-mini | v2:x3:final | tone | 318 | 2.00 | 0 / 0 / 318 | — | — | — | — | — | — |
| gpt-4o-mini | v2:x3:final | safety | 222 | 1.91 | 2 / 17 / 203 | — | — | — | — | — | — |
| gpt-4o-mini | v2:x3:final | scope | 30 | 0.77 | 18 / 1 / 11 | — | — | — | — | — | — |
| gpt-4o-mini | v2-nosafety:x3:final | groundedness | 318 | 1.90 | 0 / 32 / 286 | 318 | 0.02 | 270 / 195 | 0.3905 | 0.3905 | 0.16 |
| gpt-4o-mini | v2-nosafety:x3:final | correctness | 99 | 2.00 | 0 / 0 / 99 | 99 | 0.00 | 0 / 0 | 1.0000* | 1.0000 | 0.00 |
| gpt-4o-mini | v2-nosafety:x3:final | helpfulness | 162 | 2.00 | 0 / 0 / 162 | 162 | -0.01 | 0 / 1 | 1.0000* | 1.0000 | -1.00 |
| gpt-4o-mini | v2-nosafety:x3:final | tone | 318 | 2.00 | 0 / 0 / 318 | 318 | 0.00 | 0 / 0 | 1.0000* | 1.0000 | 0.00 |
| gpt-4o-mini | v2-nosafety:x3:final | safety | 222 | 1.84 | 4 / 27 / 191 | 222 | 0.06 | 263 / 88 | 0.0143 | 0.0287 | 0.50 |
| gpt-4o-mini | v2-nosafety:x3:final | scope | 30 | 0.80 | 16 / 4 / 10 | 30 | -0.03 | 10 / 11 | 1.0000* | 1.0000 | -0.05 |
| gpt-4o-mini | v1:x3:final | groundedness | 318 | 1.63 | 15 / 87 / 216 | 318 | 0.28 | 4167.5 / 297.5 | 0.0000 | 0.0000 | 0.87 |
| gpt-4o-mini | v1:x3:final | correctness | 99 | 1.82 | 6 / 6 / 87 | 99 | 0.18 | 78 / 0 | 0.0019 | 0.0057 | 1.00 |
| gpt-4o-mini | v1:x3:final | helpfulness | 162 | 1.90 | 5 / 7 / 150 | 162 | 0.10 | 86.5 / 4.5 | 0.0034 | 0.0138 | 0.90 |
| gpt-4o-mini | v1:x3:final | tone | 318 | 1.97 | 0 / 11 / 307 | 318 | 0.03 | 66 / 0 | 0.0011 | 0.0044 | 1.00 |
| gpt-4o-mini | v1:x3:final | safety | 222 | 1.60 | 9 / 71 / 142 | 222 | 0.31 | 2533.5 / 241.5 | 0.0000 | 0.0000 | 0.83 |
| gpt-4o-mini | v1:x3:final | scope | 30 | 0.73 | 18 / 2 / 10 | 30 | 0.03 | 12 / 9 | 0.8302* | 1.0000 | 0.14 |
| gpt-4o-mini | p0:x3:final | groundedness | 318 | 1.85 | 0 / 47 / 271 | 318 | 0.06 | 635.5 / 225.5 | 0.0026 | 0.0079 | 0.48 |
| gpt-4o-mini | p0:x3:final | correctness | 99 | 2.00 | 0 / 0 / 99 | 99 | 0.00 | 0 / 0 | 1.0000* | 1.0000 | 0.00 |
| gpt-4o-mini | p0:x3:final | helpfulness | 162 | 1.99 | 0 / 1 / 161 | 162 | 0.00 | 1.5 / 1.5 | 1.0000* | 1.0000 | 0.00 |
| gpt-4o-mini | p0:x3:final | tone | 318 | 2.00 | 0 / 0 / 318 | 318 | 0.00 | 0 / 0 | 1.0000* | 1.0000 | 0.00 |
| gpt-4o-mini | p0:x3:final | safety | 222 | 1.82 | 0 / 39 / 183 | 222 | 0.08 | 518 / 185 | 0.0045 | 0.0136 | 0.47 |
| gpt-4o-mini | p0:x3:final | scope | 30 | 1.97 | 0 / 1 / 29 | 30 | -1.20 | 1.5 / 208.5 | 0.0000 | 0.0001 | -0.99 |
| gpt-4o-mini | v2:none:x3:final | groundedness | 12 | 0.83 | 5 / 4 / 3 | 12 | 0.92 | 36 / 0 | 0.0115* | 0.0231 | 1.00 |
| gpt-4o-mini | v2:none:x3:final | correctness | 99 | 1.54 | 0 / 46 / 53 | 99 | 0.46 | 1081 / 0 | 0.0000 | 0.0000 | 1.00 |
| gpt-4o-mini | v2:none:x3:final | helpfulness | 162 | 1.92 | 3 / 7 / 152 | 162 | 0.07 | 55 / 0 | 0.0035 | 0.0138 | 1.00 |
| gpt-4o-mini | v2:none:x3:final | tone | 318 | 1.98 | 0 / 5 / 313 | 318 | 0.02 | 15 / 0 | 0.0369* | 0.1107 | 1.00 |
| gpt-4o-mini | v2:none:x3:final | safety | 222 | 1.89 | 6 / 12 / 204 | 222 | 0.01 | 287 / 241 | 0.6427 | 0.6427 | 0.09 |
| gpt-4o-mini | v2:none:x3:final | scope | 30 | 0.73 | 18 / 2 / 10 | 30 | 0.03 | 12 / 9 | 0.8302* | 1.0000 | 0.14 |

* n < 10 pairs — normal approximation not reliable.
p (Holm) — Holm–Bonferroni step-down within each dimension, over the conditions compared against the reference.

