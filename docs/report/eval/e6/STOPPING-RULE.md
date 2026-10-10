# E6 stopping rule, fixed before any further rating (2026-10-10 10:10 NZDT)

The plan's E6 design (`docs/eval/evaluation-plan.md`, E6; e7d3516, 13 Sep 2026) set a target of about 15 raters but no stopping rule. The analysis was run at:
- 7 raters, 9 Oct (`e6-results_interim-2026-10-09_n7.md`);
- 10 raters, 10 Oct (`e6-results_2026-10-10_n10.md`);
- 11 raters, 10 Oct (`e6-results_interim-2026-10-10_n11.md`).

**Rule, committed now, before any further ratings exist:**
- The **final** E6 analysis runs **once**: when **15 valid raters** have been received, or at **23:59 NZDT on Wednesday 14 October 2026**, whichever comes first.
- Until then, new rating files are only checked for validity (complete, new code and person, not a usability-study participant). The statistics are not run.
- The analysis tool, tests, exclusions and Holm adjustment are unchanged (`scripts/eval/e6-analyse.mjs`).
- The report presents the final analysis as the E6 result and lists every earlier look (7, 10 and 11 raters). The repeated looks are stated as a caveat on the p-values. If the final analysis cannot run, the 11-rater analysis is reported as interim.

Rater-code note: the file `e6_R3_2026-10-09T21-06-55-993Z.csv` carries code "R3"; the intended code was R13, a new person distinct from R03 (author, 10 Oct 2026). The file is unaltered.

## Final analysis: run once at 15 valid raters (2026-10-10 11:16 NZDT)

- **Trigger:** the 15th valid rater arrived on 10 Oct, with R14–R17 received together. The final analysis was then run **once**, as the rule requires, with the unchanged tool, exclusions and Holm adjustment. File: `e6-results_FINAL-2026-10-10_n15.md`.
- **Results:**
  - **Preference:** engine chosen **107/150 = 71.3 %** (95 % CI 63.6–78.0 %), exact binomial p < 0.001 (Holm < 0.001).
  - **Synchronisation:** rater means 3.90 vs 3.50; Wilcoxon p < 0.001 (Holm 0.002), r = 0.92.
  - **Naturalness:** 3.60 vs 2.90; p = 0.003 (Holm 0.003), r = 0.83.
  - **Rater-level sign test:** 11 raters favoured the engine, 3 legacy, 1 tie; p = 0.057.
  - **Control:** engine chosen over a static mouth in 14/15 trials.
- **Heterogeneity (descriptive, disclosed):** per-rater engine share was 0.4–0.7 for the eight raters who rated on 9 Oct (R03–R10). It was 0.8–1.0 for the seven who rated on the morning of 10 Oct (R11, R12, R13 under code "R3", R14–R17). The conclusion does not depend on the later raters: the 11-rater interim look was already significant after Holm. The earlier looks (7, 10, 11 raters) are disclosed.
