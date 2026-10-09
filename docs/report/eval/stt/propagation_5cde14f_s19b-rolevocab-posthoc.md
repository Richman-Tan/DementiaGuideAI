# §19B P1 — speech-recognition error propagation into retrieval and safety

> **POST-HOC SENSITIVITY, not pre-registered (results §19B.1.4): the near-neighbour substitution vocabulary is limited to each role's own items. Retrieval only. The verdict column below applies the pre-registered thresholds for comparison; it does not replace the pre-registered result in propagation_5cde14f_s19b.md.**

Pre-registered in `docs/eval/plan-19b-propagation.md` §19B.1. Generated 2026-10-09T04:09:30.686Z by `scripts/eval/stt/propagation-report.mjs` from:
- variants `docs/report/eval/stt/propagation-variants_5cde14f_s19b-rolevocab.json` (error model `docs/report/eval/stt/error-model_5cde14f_s19b.json`, seed 42, 3 draws; question file sha256 `fc543e504abcef90…`)
- retrieval `docs/report/eval/retrieval_5cde14f_v2_s19b-propagation-rolevocab.json` (sha e8a25e7, 2026-10-09T04:09:18.764Z)

Synthetic by construction: the typed questions are rewritten by an error model built from the committed E9 aggregates of each recogniser on the ADReSS-2020 dementia speakers. No DementiaBank text or audio is used. A blank-guarded turn is one the app would stop at its STT boundary ("I didn't catch that" on the web, a silent return to idle on mobile): no retrieval, no model call. Conditions: **clean** (typed), **W1** (whisper-1 profile), **AP** (Apple on-device profile, empty output rescued by whisper-1 as both clients do), and **AP-terminal** (the same Apple turns without the rescue; descriptive).

## 1. Transcripts

| View | Role | Turns | Blank-guarded | Apple empty (rescue attempted) | Rescued | Stock phrase | Mean achieved WER, turns reaching the model | Mean achieved WER, all turns (blank = 100 %) |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| clean | retrieval | 40 | 0 | 0 | — | 0 | 0.0 % | 0.0 % |
| w1 | retrieval | 120 | 3 | 0 | — | 15 | 37.8 % | 39.3 % |
| ap | retrieval | 120 | 0 | 32 | 32 | 6 | 41.4 % | 41.4 % |
| ap-terminal | retrieval | 120 | 32 | 32 | — | 0 | 42.4 % | 57.8 % |
| clean | safety | 52 | 0 | 0 | — | 0 | 0.0 % | 0.0 % |
| w1 | safety | 156 | 3 | 0 | — | 22 | 35.8 % | 37.0 % |
| ap | safety | 156 | 2 | 42 | 40 | 3 | 43.4 % | 44.2 % |
| ap-terminal | safety | 156 | 42 | 42 | — | 0 | 46.4 % | 60.8 % |

## 2. Retrieval (labelled items, n = 40 source items)

End-to-end: a blank-guarded turn retrieves nothing and scores 0. Conditional: blank-guarded turns left out. Item score = mean over its draws; Δ = item score − clean; 95 % CI by bootstrap over items (10,000 resamples, seed 42). McNemar on draw 0, hit@5 = recall@5 of 1.

| View | recall@5 e2e | Δ vs clean [95 % CI] | MRR e2e | Δ vs clean [95 % CI] | recall@5 conditional | MRR conditional | draw-0 hit@5 lost / gained | McNemar exact p |
|---|---:|---|---:|---|---:|---:|---|---:|
| clean | 0.975 | — | 0.881 | — | 0.975 | 0.881 | — | — |
| w1 | 0.792 | -0.183 [-0.267, -0.108] | 0.697 | -0.184 [-0.268, -0.108] | 0.813 | 0.716 | 9 / 0 | 0.0039 |
| ap | 0.867 | -0.108 [-0.167, -0.058] | 0.704 | -0.178 [-0.251, -0.108] | 0.867 | 0.704 | 3 / 0 | 0.2500 |
| ap-terminal | 0.642 | -0.333 [-0.417, -0.250] | 0.529 | -0.353 [-0.438, -0.266] | 0.876 | 0.708 | 13 / 0 | 0.0002 |

Per set, end-to-end recall@5 (item means):

| Set | n | clean | w1 | ap | ap-terminal |
|---|---:|---:|---:|---:|---:|
| A | 30 | 0.967 | 0.811 | 0.867 | 0.633 |
| A-neighbour | 3 | 1.000 | 0.778 | 0.889 | 0.667 |
| N | 7 | 1.000 | 0.714 | 0.857 | 0.667 |

Stock phrases (W1 turns that reached retrieval): hit@5 73.3 % with a phrase (n = 15) vs 82.4 % without (n = 102). Unpaired and confounded with the other errors in the same transcript; descriptive.

## 4. Pre-registered expectations

| # | Expectation (plan §19B.1) | Result | Verdict |
|---|---|---|---|
| E1 | W1 end-to-end recall@5: mean item Δ vs clean lies in [−0.12, −0.02] | Δ -0.183 [-0.267, -0.108] | **Not supported** |
| E2 | W1 end-to-end MRR: mean item Δ vs clean ≤ −0.05 | Δ -0.184 [-0.268, -0.108] | **Supported** |
| E3 | AP (with the rescue) loses at least as much end-to-end recall@5 as W1: Δ_AP ≤ Δ_W1 | Δ_AP -0.108 vs Δ_W1 -0.183 | **Not supported** |
| E4 | Stock phrases do not move retrieval: W1 hit@5 with a phrase within 0.10 of without | 73.3 % (n 15) vs 82.4 % (n 102) | **Supported** |

