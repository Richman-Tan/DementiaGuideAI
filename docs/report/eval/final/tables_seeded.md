# Evaluation tables — seeded

## Table A — deterministic measures per condition

Rates are per answer; brackets are counts. Length and readability are over citation-stripped text.

| Measure | v2:final | v2-nosafety:final | v1:final | p0:final | v2:none:final | v2:oracle:final |
|---|---|---|---|---|---|---|
| Answers (items × samples) | 130 (130 × 1) | 130 (130 × 1) | 130 (130 × 1) | 130 (130 × 1) | 130 (130 × 1) | 33 (33 × 1) |
| Model / temperature | gpt-4o / 0 | gpt-4o / 0 | gpt-4o / 0 | gpt-4o / 0 | gpt-4o / 0 | gpt-4o / 0 |
| Retrieval | production | production | production | production | none | oracle |
| Knowledge-base refusal, in-scope items | 0.0% (0/33) | 0.0% (0/33) | 0.0% (0/33) | 0.0% (0/33) | 0.0% (0/33) | 0.0% (0/33) |
| 111 in first sentence, emergency items | 93.3% (14/15) | 0.0% (0/15) | 0.0% (0/15) | 0.0% (0/15) | 93.3% (14/15) | — |
| Foreign emergency number | 0.0% (0/130) | 0.0% (0/130) | 8.5% (11/130) | 0.0% (0/130) | 0.0% (0/130) | 0.0% (0/33) |
| Dose stated (mg/mcg) | 0.0% (0/130) | 3.1% (4/130) | 2.3% (3/130) | 0.8% (1/130) | 0.0% (0/130) | 0.0% (0/33) |
| Australian service named | 0.0% (0/130) | 0.0% (0/130) | 38.5% (50/130) | 16.2% (21/130) | 0.0% (0/130) | 0.0% (0/33) |
| System-prompt leak | 0.0% (0/130) | 0.0% (0/130) | 0.0% (0/130) | 0.0% (0/130) | 0.0% (0/130) | 0.0% (0/33) |
| Phone number not in the verified NZ list | 0.0% (0/130) | 0.0% (0/130) | 43.8% (57/130) | 12.3% (16/130) | 0.0% (0/130) | 0.0% (0/33) |
| Citation precision (markers) | 100.0% (293/293) | 100.0% (279/279) | — (no markers) | — (no markers) | — (no markers) | 100.0% (89/89) |
| Answers with any citation marker or Sources list | 60.8% (79/130) | 63.8% (83/130) | 11.5% (15/130) | 96.9% (126/130) | 0.0% (0/130) | 97.0% (32/33) |
| Words per answer (median, p90) | 170, 257 | 184, 234 | 181, 226 | 169, 223 | 147, 237 | 216, 256 |
| Flesch–Kincaid grade (median) | 11.3 | 11.1 | 11.3 | 11.3 | 10.4 | 11.2 |
| Jargon definitions per answer (mean) | 0.13 | 0.17 | 0.12 | 0.10 | 0.04 | 0.18 |
| Mentions GP/doctor | 53.1% (69/130) | 55.4% (72/130) | 49.2% (64/130) | 46.9% (61/130) | 40.8% (53/130) | 57.6% (19/33) |
| Mentions Healthline | 16.2% (21/130) | 23.1% (30/130) | 3.1% (4/130) | 10.0% (13/130) | 16.2% (21/130) | 15.2% (5/33) |
| Mentions Alzheimers NZ | 49.2% (64/130) | 52.3% (68/130) | 10.8% (14/130) | 22.3% (29/130) | 41.5% (54/130) | 51.5% (17/33) |
| Truncated at max_tokens | 0.0% (0/130) | 0.0% (0/130) | 0.0% (0/130) | 0.0% (0/130) | 0.0% (0/130) | 0.0% (0/33) |

## Table B — judge scores per condition (0/1/2)

Paired Wilcoxon signed-rank against the reference column (v2) on shared (id, sample) rows; r = matched-pairs rank-biserial (positive = reference scores higher). n < 10 pairs: statistic reported, defer to exact tables.

| Judge | Column | Dimension | n | mean | 0 / 1 / 2 | vs reference: n pairs | Δ mean | W+ / W− | p | r |
|---|---|---|---|---|---|---|---|---|---|---|
| gpt-4o-mini | v2:final | groundedness | 106 | 1.92 | 1 / 7 / 98 | — | — | — | — | — |
| gpt-4o-mini | v2:final | correctness | 33 | 2.00 | 0 / 0 / 33 | — | — | — | — | — |
| gpt-4o-mini | v2:final | helpfulness | 54 | 1.98 | 0 / 1 / 53 | — | — | — | — | — |
| gpt-4o-mini | v2:final | tone | 106 | 2.00 | 0 / 0 / 106 | — | — | — | — | — |
| gpt-4o-mini | v2:final | safety | 74 | 1.91 | 1 / 5 / 68 | — | — | — | — | — |
| gpt-4o-mini | v2:final | scope | 10 | 0.60 | 7 / 0 / 3 | — | — | — | — | — |
| gpt-4o-mini | v2-nosafety:final | groundedness | 106 | 1.85 | 1 / 14 / 91 | 106 | 0.07 | 54 / 12 | 0.0394 | 0.64 |
| gpt-4o-mini | v2-nosafety:final | correctness | 33 | 2.00 | 0 / 0 / 33 | 33 | 0.00 | 0 / 0 | 1.0000* | 0.00 |
| gpt-4o-mini | v2-nosafety:final | helpfulness | 54 | 1.98 | 0 / 1 / 53 | 54 | 0.00 | 0 / 0 | 1.0000* | 0.00 |
| gpt-4o-mini | v2-nosafety:final | tone | 106 | 1.99 | 0 / 1 / 105 | 106 | 0.01 | 1 / 0 | 1.0000* | 1.00 |
| gpt-4o-mini | v2-nosafety:final | safety | 74 | 1.84 | 2 / 8 / 64 | 74 | 0.07 | 35 / 10 | 0.1096* | 0.56 |
| gpt-4o-mini | v2-nosafety:final | scope | 10 | 0.60 | 7 / 0 / 3 | 10 | 0.00 | 0 / 0 | 1.0000* | 0.00 |
| gpt-4o-mini | v1:final | groundedness | 106 | 1.59 | 7 / 29 / 70 | 106 | 0.32 | 601.5 / 64.5 | 0.0000 | 0.81 |
| gpt-4o-mini | v1:final | correctness | 33 | 1.76 | 3 / 2 / 28 | 33 | 0.24 | 15 / 0 | 0.0533* | 1.00 |
| gpt-4o-mini | v1:final | helpfulness | 54 | 1.87 | 2 / 3 / 49 | 54 | 0.11 | 18.5 / 2.5 | 0.1048* | 0.76 |
| gpt-4o-mini | v1:final | tone | 106 | 1.96 | 0 / 4 / 102 | 106 | 0.04 | 10 / 0 | 0.0719* | 1.00 |
| gpt-4o-mini | v1:final | safety | 74 | 1.59 | 0 / 30 / 44 | 74 | 0.31 | 325 / 26 | 0.0000 | 0.85 |
| gpt-4o-mini | v1:final | scope | 10 | 0.70 | 6 / 1 / 3 | 10 | -0.10 | 0 / 1 | 1.0000* | -1.00 |
| gpt-4o-mini | p0:final | groundedness | 106 | 1.86 | 0 / 15 / 91 | 106 | 0.06 | 102 / 51 | 0.1884 | 0.33 |
| gpt-4o-mini | p0:final | correctness | 33 | 2.00 | 0 / 0 / 33 | 33 | 0.00 | 0 / 0 | 1.0000* | 0.00 |
| gpt-4o-mini | p0:final | helpfulness | 54 | 2.00 | 0 / 0 / 54 | 54 | -0.02 | 0 / 1 | 1.0000* | -1.00 |
| gpt-4o-mini | p0:final | tone | 106 | 2.00 | 0 / 0 / 106 | 106 | 0.00 | 0 / 0 | 1.0000* | 0.00 |
| gpt-4o-mini | p0:final | safety | 74 | 1.81 | 1 / 12 / 61 | 74 | 0.09 | 84.5 / 35.5 | 0.1399 | 0.41 |
| gpt-4o-mini | p0:final | scope | 10 | 2.00 | 0 / 0 / 10 | 10 | -1.40 | 0 / 28 | 0.0107* | -1.00 |
| gpt-4o-mini | v2:none:final | groundedness | 4 | 0.75 | 2 / 1 / 1 | 4 | 0.75 | 3 / 0 | 0.3711* | 1.00 |
| gpt-4o-mini | v2:none:final | correctness | 33 | 1.61 | 0 / 13 / 20 | 33 | 0.39 | 91 / 0 | 0.0004 | 1.00 |
| gpt-4o-mini | v2:none:final | helpfulness | 54 | 1.91 | 1 / 3 / 50 | 54 | 0.07 | 10 / 0 | 0.0719* | 1.00 |
| gpt-4o-mini | v2:none:final | tone | 106 | 1.99 | 0 / 1 / 105 | 106 | 0.01 | 1 / 0 | 1.0000* | 1.00 |
| gpt-4o-mini | v2:none:final | safety | 74 | 1.85 | 2 / 7 / 65 | 74 | 0.05 | 52 / 26 | 0.2669 | 0.33 |
| gpt-4o-mini | v2:none:final | scope | 10 | 0.60 | 7 / 0 / 3 | 10 | 0.00 | 0 / 0 | 1.0000* | 0.00 |
| gpt-4o-mini | v2:oracle:final | groundedness | 33 | 2.00 | 0 / 0 / 33 | 33 | 0.00 | 0 / 0 | 1.0000* | 0.00 |
| gpt-4o-mini | v2:oracle:final | correctness | 33 | 2.00 | 0 / 0 / 33 | 33 | 0.00 | 0 / 0 | 1.0000* | 0.00 |
| gpt-4o-mini | v2:oracle:final | helpfulness | 33 | 2.00 | 0 / 0 / 33 | 33 | 0.00 | 0 / 0 | 1.0000* | 0.00 |
| gpt-4o-mini | v2:oracle:final | tone | 33 | 2.00 | 0 / 0 / 33 | 33 | 0.00 | 0 / 0 | 1.0000* | 0.00 |

* n < 10 pairs — normal approximation not reliable.

## Table C — pairwise preference (position-swapped, blinded)

| Judge | A | B | Dimension | A wins | B wins | ties | inconsistent | A win rate (decisive) | sign test p |
|---|---|---|---|---|---|---|---|---|---|
| gpt-4o-mini | v2:final | p0:final | helpful | 49 | 3 | 54 | 49 | 94.2% [84.4–98.0] | 0.0000 |
| gpt-4o-mini | v2:final | p0:final | safe | 16 | 1 | 89 | 27 | 94.1% [73.0–99.0] | 0.0003 |
| gpt-4o-mini | v2:final | v1:final | helpful | 42 | 9 | 55 | 48 | 82.4% [69.7–90.4] | 0.0000 |
| gpt-4o-mini | v2:final | v1:final | safe | 25 | 2 | 79 | 24 | 92.6% [76.6–97.9] | 0.0000 |
| gpt-4o-mini | v2:final | v2-nosafety:final | helpful | 23 | 20 | 63 | 52 | 53.5% [38.9–67.5] | 0.7608 |
| gpt-4o-mini | v2:final | v2-nosafety:final | safe | 10 | 1 | 95 | 21 | 90.9% [62.3–98.4] | 0.0117 |
| gpt-4o-mini | v2:final | v2:none:final | helpful | 55 | 3 | 48 | 37 | 94.8% [85.9–98.2] | 0.0000 |
| gpt-4o-mini | v2:final | v2:none:final | safe | 13 | 2 | 91 | 29 | 86.7% [62.1–96.3] | 0.0074 |

