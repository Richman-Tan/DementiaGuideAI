# §19J results: replication of the check-back result (E9-K3)

## Part A — gpt-4o, three samples at temperature 0.7, 307 garbled turns (82 emergency)

| Measure | (a) v2 | (k) check-back | (e) escalate-first |
|---|---|---|---|
| 111 first, emergency answers | 148/246 (60.2%; 53.9–66.1) | 149/246 (60.6%; 54.3–66.5) | 161/246 (65.4%; 59.3–71.1) |
| Checks back, all answers | 14/921 (1.5%; 0.9–2.5) | 192/921 (20.8%; 18.3–23.6) | 83/921 (9.0%; 7.3–11.0) |
| Passes every gate, all answers | 820/921 (89.0%; 86.9–90.9) | 798/921 (86.6%; 84.3–88.7) | 809/921 (87.8%; 85.6–89.8) |

Sign tests on per-turn counts (turns where the second condition was higher / lower; two-sided exact p):
- 111 first, (e) vs (k): 18/8, p 0.0755
- 111 first, (e) vs (a): 22/11, p 0.0801
- 111 first, (k) vs (a): 13/14, p 1.0000
- checks back, (e) vs (a): 45/2, p < 0.0001

- J1 (e) puts 111 first more often than (k), sign test p < 0.05 → not supported
- J2 (e)'s 111-first rate ≥ (a)'s − 5 points: 65.4 vs 60.2 → supported
- J3 (e) checks back more often than (a), sign test p < 0.05, and on ≥ 10% of answers: 9.0% → not supported
- J4 (k) puts 111 first less often than (a), sign test p < 0.05 → not supported

## Part B — one answer per turn on two other models

| Model | 111 first of 82: (a) / (e) | McNemar (a only / e only, p) | Checks back of 307: (a) / (e) | McNemar (a only / e only, p) | Passes every gate: (a) / (e) |
|---|---|---|---|---|---|
| gpt-4.1 | 70 / 74 | 0/4, 0.1250 | 1 / 9 | 0/8, 0.0078 | 286 / 285 of 307 |
| claude-sonnet-5-5 | 54 / 63 | 3/12, 0.0352 | 42 / 110 | 12/80, < 0.0001 | 279 / 277 of 307 |

- J5 gpt-4.1: (e) 111 first ≥ (a) − 2 (74 vs 70) → supported
- J6 gpt-4.1: (e) checks back more than (a), McNemar p < 0.05 (9 vs 1, p 0.0078) → supported
- J5 claude-sonnet-5-5: (e) 111 first ≥ (a) − 2 (63 vs 54) → supported
- J6 claude-sonnet-5-5: (e) checks back more than (a), McNemar p < 0.05 (110 vs 42, p < 0.0001) → supported
