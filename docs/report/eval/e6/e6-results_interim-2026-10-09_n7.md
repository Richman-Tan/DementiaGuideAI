# E6 perceptual lip-sync test: results

Generated 2026-10-09T03:12:26.128Z by `scripts/eval/e6-analyse.mjs` from 9 CSV file(s); stimuli set `e6-2026-10-08-b02737` (Unity build 356c7acb203d, 60 fps, recorded at b8b808d).

**Raters analysed: 7** · main trials: 70 (engine vs legacy, 10 sentences) · control trials: 7 (engine vs static mouth).

**Exclusions (pre-specified):**

- R01 (R01-muzzpfw6-2x0v): took part in the usability study — excluded (plan: raters are not study participants)
- R02 (R02-muzzz1ui-gs9): took part in the usability study — excluded (plan: raters are not study participants)


> Fewer than 10 raters: treat every test below as descriptive. The plan's target is about 15.

## Primary analyses (engine vs legacy)

| Measure | Engine | Legacy | Test | Statistic | p | Holm p |
|---|---|---|---|---|---|---|
| Chose as more natural (trials) | 39/70 = 55.7% (95% CI 44.1–66.8%) | 31/70 | exact binomial vs 50% | k = 39 of 70 | 0.403 | 0.806 |
| Synchronisation, 1–5: median (IQR) of all ratings | 4.0 (3.0–4.0) | 4.0 (3.0–4.0) | Wilcoxon signed-rank on rater means (exact permutation) | n = 6, W+ = 19.5, r = 0.86 | 0.094 | 0.281 |
| Naturalness, 1–5: median (IQR) of all ratings | 4.0 (3.0–4.0) | 3.0 (3.0–4.0) | Wilcoxon signed-rank on rater means (exact permutation) | n = 7, W+ = 19.0, r = 0.36 | 0.516 | 0.806 |

Median of rater means: synchronisation engine 3.80 vs legacy 3.60 (median difference 0.20); naturalness engine 3.50 vs legacy 3.40 (median difference 0.10). W+ sums the ranks of raters who rated the engine higher; r is the matched-pairs rank-biserial correlation (−1 to 1, positive favours the engine). Raters whose mean difference is exactly zero drop out of the Wilcoxon test, as is standard.

**Rater-level check on preference** (trials are nested in raters): 4 rater(s) chose the engine in most pairs, 2 chose legacy in most, 1 split evenly; sign test p = 0.688; median per-rater engine share 60%.

## Per sentence (descriptive)

| Sentence | Engine chosen | Sync median E / L | Naturalness median E / L | Text |
|---|---|---|---|---|
| S01 | 1/7 | 3.0 / 4.0 | 4.0 / 4.0 | Use a calm, slow voice and get to the person's eye level. |
| S02 | 4/7 | 4.0 / 4.0 | 4.0 / 4.0 | Avoid long daytime naps, which reduce the drive to sleep at night. |
| S03 | 5/7 | 4.0 / 4.0 | 3.0 / 3.0 | Brightly coloured plates that contrast with the food help the person see and identify what they are eating. |
| S04 | 5/7 | 4.0 / 4.0 | 4.0 / 3.0 | Maintain at least one activity each week that is purely for your own enjoyment. |
| S05 | 4/7 | 4.0 / 4.0 | 4.0 / 4.0 | Hearing a familiar, calm voice provides comfort regardless of whether the language is fully comprehended. |
| S06 | 0/7 | 3.0 / 4.0 | 3.0 / 4.0 | Phone calls, video calls, and brief visits sustain the relationships that provide emotional resilience. |
| S07 | 6/7 | 4.0 / 3.0 | 3.0 / 3.0 | Shared responsibility is more sustainable than one person carrying the full burden. |
| S08 | 5/7 | 4.0 / 4.0 | 4.0 / 4.0 | Personalise the bedroom door with a meaningful photograph or familiar object so the person can identify their room. |
| S09 | 4/7 | 4.0 / 3.0 | 3.0 / 3.0 | Mirror the person's body language subtly to create a sense of connection and ease. |
| S10 | 5/7 | 4.0 / 4.0 | 4.0 / 3.0 | If someone does a task differently than you would, resist correcting unless it is genuinely unsafe. |

## Checks

- Position bias: the left clip was chosen in 12/70 main trials (17.1%, binomial p < 0.001); left/right was randomised per participant and pair.
- Choice–rating consistency: in 68/70 main trials the chosen clip also had the higher or equal naturalness rating.
- Exposure: plays per clip median 1 (range 1–2); the page required each clip to be watched to the end at least once.

## Control pair: engine vs static mouth (manipulation check, not pooled)

Engine chosen in 6/7 trials (85.7%, 95% CI 48.7–97.4%, binomial p = 0.125). Synchronisation median engine 4.0 vs static 1.0; naturalness 3.0 vs 1.0.
Rater(s) who preferred the static mouth: R05 — reported, not excluded (no exclusion rule was set on this check).

## How to read this

- The engine is the co-articulation engine the app ships; legacy is the keyframe track it replaced. Both use the same ElevenLabs audio, the same Unity build and the same recording method; only the lip-sync message differs.
- By design the raters are colleagues and peers, blind to condition, not carers: the result is about perceived lip-sync quality, not about usefulness to carers.
- A preference CI that excludes 50% means raters reliably told the conditions apart in the engine's favour (or against it). A CI that includes 50% is not evidence that the two are the same: with about 15 raters, small differences cannot be detected.
