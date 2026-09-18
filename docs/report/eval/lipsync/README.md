# Unity lip-sync harness — extracted results

Source: `unity-avatar/UnityAvatarProject/TestResults/lipsync/<run>/*_metrics.json` (git-ignored; extracted by `scripts/lipsync/summarise-testresults.mjs`). Checks: bilabial `V_Explosive ≥ 0.90` (open shapes ≤ 0.15, jaw ≤ 0.20) ±60 ms; labiodental `V_Dental_Lip ≥ 0.80`; tongue ≥ 0.30; vowel peak ≥ 0.35 ±80 ms; silence < 0.10; segment-end decay ≤ 250 ms. Jitter RMS is reported, not gated. Runs with fewer than 60 samples per fixture are marked suspect (sampler starvation, not lip-sync regressions).

| Run | Character | Total | bilabials | dental | g2p_pipeline | hello | labiodental | rounded | sibilant_rhotic | silence_gaps | min samples | jitter range | suspect |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 20260711_231911 | — (pre-2026-09-19 runs did not record it; Aaron was the only character until 2026-07-19) | 37/85 | 6/17 | 4/13 | — | 4/11 | 9/16 | 4/6 | 6/13 | 4/9 | 151 | 0.0056–0.0125 |  |
| 20260711_233652 | — (pre-2026-09-19 runs did not record it; Aaron was the only character until 2026-07-19) | 81/85 | 14/17 | 13/13 | — | 11/11 | 16/16 | 6/6 | 13/13 | 8/9 | 28 | 0.0112–0.0185 | yes |
| 20260711_234109 | — (pre-2026-09-19 runs did not record it; Aaron was the only character until 2026-07-19) | 85/85 | 17/17 | 13/13 | — | 11/11 | 16/16 | 6/6 | 13/13 | 9/9 | 152 | 0.0105–0.0180 |  |
| 20260711_234245 | — (pre-2026-09-19 runs did not record it; Aaron was the only character until 2026-07-19) | 41/41 | 17/17 | 13/13 | — | 11/11 | — | — | — | — | 183 | 0.0112–0.0191 |  |
| 20260711_234601 | — (pre-2026-09-19 runs did not record it; Aaron was the only character until 2026-07-19) | 85/85 | 17/17 | 13/13 | — | 11/11 | 16/16 | 6/6 | 13/13 | 9/9 | 150 | 0.0108–0.0187 |  |
| 20260711_235432 | — (pre-2026-09-19 runs did not record it; Aaron was the only character until 2026-07-19) | 93/95 | 17/17 | 13/13 | 8/10 | 11/11 | 16/16 | 6/6 | 13/13 | 9/9 | 150 | 0.0103–0.0209 |  |
| 20260711_235629 | — (pre-2026-09-19 runs did not record it; Aaron was the only character until 2026-07-19) | 95/95 | 17/17 | 13/13 | 10/10 | 11/11 | 16/16 | 6/6 | 13/13 | 9/9 | 151 | 0.0113–0.0275 |  |
| 20260712_000426 | — (pre-2026-09-19 runs did not record it; Aaron was the only character until 2026-07-19) | 95/95 | 17/17 | 13/13 | 10/10 | 11/11 | 16/16 | 6/6 | 13/13 | 9/9 | 147 | 0.0115–0.0270 |  |
| 20260713_211740 | — (pre-2026-09-19 runs did not record it; Aaron was the only character until 2026-07-19) | 11/11 | — | — | — | 11/11 | — | — | — | — | 201 | 0.0212–0.0212 |  |
| 20260714_085204 | — (pre-2026-09-19 runs did not record it; Aaron was the only character until 2026-07-19) | 11/11 | — | — | — | 11/11 | — | — | — | — | 206 | 0.0128–0.0128 |  |
| 20260714_085841 | — (pre-2026-09-19 runs did not record it; Aaron was the only character until 2026-07-19) | 11/11 | — | — | — | 11/11 | — | — | — | — | 199 | 0.0129–0.0129 |  |
| 20260714_090704 | — (pre-2026-09-19 runs did not record it; Aaron was the only character until 2026-07-19) | 95/95 | 17/17 | 13/13 | 10/10 | 11/11 | 16/16 | 6/6 | 13/13 | 9/9 | 151 | 0.0112–0.0267 |  |
| 20260714_091054 | — (pre-2026-09-19 runs did not record it; Aaron was the only character until 2026-07-19) | 95/95 | 17/17 | 13/13 | 10/10 | 11/11 | 16/16 | 6/6 | 13/13 | 9/9 | 152 | 0.0111–0.0267 |  |
| 20260719_203101 | — (pre-2026-09-19 runs did not record it; Aaron was the only character until 2026-07-19) | 11/11 | — | — | — | 11/11 | — | — | — | — | 218 | 0.0147–0.0147 |  |
| 20260817_102703 | — (pre-2026-09-19 runs did not record it; Aaron was the only character until 2026-07-19) | 38/95 | 6/17 | 6/13 | 5/10 | 3/11 | 4/16 | 3/6 | 8/13 | 3/9 | 16 | 0.0025–0.0046 | yes |
| 20260817_103030 | — (pre-2026-09-19 runs did not record it; Aaron was the only character until 2026-07-19) | 28/95 | 4/17 | 4/13 | 2/10 | 5/11 | 5/16 | 2/6 | 4/13 | 2/9 | 11 | 0.0022–0.0046 | yes |
| 20260817_104252 | — (pre-2026-09-19 runs did not record it; Aaron was the only character until 2026-07-19) | 43/95 | 5/17 | 5/13 | 5/10 | 7/11 | 7/16 | 4/6 | 7/13 | 3/9 | 14 | 0.0039–0.0073 | yes |
| 20260817_104545 | — (pre-2026-09-19 runs did not record it; Aaron was the only character until 2026-07-19) | 95/95 | 17/17 | 13/13 | 10/10 | 11/11 | 16/16 | 6/6 | 13/13 | 9/9 | 164 | 0.0115–0.0292 |  |
| 20260817_142857 | — (pre-2026-09-19 runs did not record it; Aaron was the only character until 2026-07-19) | 73/73 | 17/17 | 13/13 | 10/10 | 11/11 | 16/16 | 6/6 | — | — | 164 | 0.0115–0.0292 |  |
| 20260817_144400 | — (pre-2026-09-19 runs did not record it; Aaron was the only character until 2026-07-19) | 95/95 | 17/17 | 13/13 | 10/10 | 11/11 | 16/16 | 6/6 | 13/13 | 9/9 | 164 | 0.0115–0.0292 |  |
| 20260919_102343 | aaron | 95/95 | 17/17 | 13/13 | 10/10 | 11/11 | 16/16 | 6/6 | 13/13 | 9/9 | 164 | 0.0115–0.0292 |  |
| 20260919_102750 | ariana | 95/95 | 17/17 | 13/13 | 10/10 | 11/11 | 16/16 | 6/6 | 13/13 | 9/9 | 164 | 0.0115–0.0292 |  |
