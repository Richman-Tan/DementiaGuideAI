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
| Suspected invented phone number | 0.0% (0/390) | 0.0% (0/390) | 38.7% (151/390) | 7.9% (31/390) | 1.0% (4/390) |
| Citation precision (markers) | 100.0% (848/848) | 100.0% (845/845) | — (no markers) | — (no markers) | 100.0% (1/1) |
| Answers with any citation marker or Sources list | 61.8% (241/390) | 66.4% (259/390) | 19.2% (75/390) | 96.7% (377/390) | 0.3% (1/390) |
| Words per answer (median, p90) | 170, 245 | 185, 237 | 177, 233 | 170, 227 | 150, 234 |
| Flesch–Kincaid grade (median) | 11.3 | 11.3 | 11.6 | 11.4 | 10.7 |
| Jargon definitions per answer (mean) | 0.13 | 0.18 | 0.10 | 0.14 | 0.07 |
| Mentions GP/doctor | 47.7% (186/390) | 53.6% (209/390) | 50.3% (196/390) | 47.2% (184/390) | 43.3% (169/390) |
| Mentions Healthline | 13.8% (54/390) | 25.6% (100/390) | 2.6% (10/390) | 9.0% (35/390) | 20.3% (79/390) |
| Mentions Alzheimers NZ | 41.8% (163/390) | 50.8% (198/390) | 10.8% (42/390) | 20.8% (81/390) | 42.3% (165/390) |
| Truncated at max_tokens | 0.0% (0/390) | 0.0% (0/390) | 0.0% (0/390) | 0.0% (0/390) | 0.0% (0/390) |

