# E2-X — cross-family judge, `claude-sonnet-5-5` (plan §18.2)

Pre-specification: `docs/eval/evaluation-plan.md` §18.2, committed as `cddb4a1` before any judging. The Gemini deviation (`b1030da`) was withdrawn in `99566dc` before Claude judged any item, so the original specification applies unchanged.

## Run

| Item | Value |
|---|---|
| Judge | `claude-sonnet-5-5`, Anthropic Messages API; effort `medium`; server-side refusal fallback `"default"`. Temperature cannot be set on this model, as §18.2 declares |
| Prompts and rubric | `scripts/eval/judge.mjs` and `judges/rubrics.js`, RUBRIC_VERSION 2026-09-14, unchanged. Blinded: no condition id, prompt version or file name reaches the judge |
| Items | the 60 human-rated items (`human/human-sheet_round1_KEY.csv`) from the seeded `generation_8a92ecd_*_final.json` files, on their applicable dimensions: groundedness 49, correctness 20, helpfulness 35, tone 60, safety 35 |
| When | 2026-10-09 11:12–11:15 NZDT (the files' `generatedAt` is UTC, 2026-10-08) |
| Code | `99566dc`, plus three changes committed with these results: `judge.mjs` rows now record `error` and `refused`; `judgeClient.mjs` keeps the unused Gemini adapter; `agreement.mjs --judge-a/--judge-b` accept several files per side. None touches the Claude call, the prompts or the scoring |
| Outcome | 60 of 60 answers scored; 0 errors, 0 refusals, 0 unparsed dimensions |
| Spend | **US$0.70** (265,084 input and 17,250 output tokens at US$2 / 10 per million) |

Regenerate:
```
node scripts/eval/judge.mjs docs/report/eval/generation_8a92ecd_{p0,v1,v2,v2-nosafety,v2_none}_final.json \
  --model claude-sonnet-5-5 --key docs/report/eval/human/human-sheet_round1_KEY.csv --tag key60 --out-dir docs/report/eval/final
node scripts/eval/agreement.mjs --a docs/report/eval/human/human-sheet_round1_R1.csv \
  --key docs/report/eval/human/human-sheet_round1_KEY.csv --judge docs/report/eval/final/judge_claude-sonnet-5-5_*_key60.csv
```

## Stage 1 — the gate

Unweighted Cohen's κ, categories {0, 1, 2}. Full tables, with linear and quadratic κ: `agreement_human-R1_vs_claude-sonnet-5-5.md`, `agreement_human-R2_vs_claude-sonnet-5-5.md`.

| Dimension | n | κ vs R1 | κ vs R2 | Degenerate (one value on ≥ 95 % of items)? | Gate |
|---|---:|---:|---:|---|---|
| Groundedness | 49 | −0.097 | 0.012 | no | **fail** |
| Correctness | 20 | 0.459 | 0.318 | **yes**: R1 gives 19 of 20 a 2 | **fail** |
| Helpfulness | 35 | 0.017 | 0.040 | no | **fail** |
| Tone | 60 | 0.039 | −0.043 | no | **fail** |
| Safety | 35 | −0.139 | −0.019 | no | **fail** |

**No dimension passes.** For comparison, the two raters agree with each other at κ 0.69, 0.64, 0.93, 0.63 and 0.64 on the same five dimensions (`agreement_human_R1_vs_R2.md`). So the human ratings are consistent with each other, and the judge does not reproduce them.

## Stage 2 — not run

§18.2 runs the position-swapped pairwise comparison only on helpfulness or safety, and only if that dimension passes. Neither passed, so no pairwise call was made. **No judge-based direction between conditions exists.** Per-condition judge means are not reported, as §18.2 requires.

## Descriptive, as §18.2 specifies

Judge–judge agreement with gpt-4o-mini on the same 60 items (`agreement_claude-sonnet-5-5_vs_gpt-4o-mini.md`): groundedness κ 0.126, correctness 0.459, helpfulness 0.000, tone 0.000, safety 0.076. For helpfulness and tone, κ is exactly 0 because gpt-4o-mini gave every one of these items a 2.

## Expectations (§18.2) against results

| Pre-specified expectation | Result | Verdict |
|---|---|---|
| No dimension is expected to pass with confidence | none passed | **Consistent** |
| Directionally, Claude's κ against *both* raters exceeds gpt-4o-mini's on groundedness and safety (gpt-4o-mini: groundedness 0.015 / 0.001, safety −0.035 / −0.035 against R1 / R2) | groundedness −0.097 / 0.012; safety −0.139 / −0.019. Higher than gpt-4o-mini against R2 and lower against R1, on both dimensions | **Not supported.** All eight values lie within 0.14 of zero, so neither judge is better than chance here |

## Why the judge disagrees (descriptive, not pre-specified; pooled over all 60 items, never split by condition)

The judge is **stricter than both raters on every dimension**. The two judges fail in opposite ways: gpt-4o-mini put almost everything at the ceiling, while Claude uses the whole scale but marks down answers that both raters gave a 2.

| Dimension | Judge 0 / 1 / 2 | R1 0 / 1 / 2 | R2 0 / 1 / 2 | Judge lower than R1 / higher | Judge lower than R2 / higher |
|---|---|---|---|---|---|
| Groundedness (49) | 7 / 18 / 24 | 5 / 5 / 39 | 1 / 8 / 40 | 22 / 8 | 22 / 4 |
| Correctness (20) | 0 / 3 / 17 | 0 / 1 / 19 | 0 / 2 / 18 | 2 / 0 | 2 / 1 |
| Helpfulness (35) | 0 / 26 / 9 | 1 / 8 / 26 | 1 / 9 / 25 | 19 / 3 | 18 / 3 |
| Tone (60) | 0 / 26 / 34 | 0 / 8 / 52 | 2 / 5 / 53 | 22 / 4 | 24 / 5 |
| Safety (35) | 5 / 11 / 19 | 0 / 3 / 32 | 0 / 3 / 32 | 16 / 3 | 15 / 2 |

**Reading.** On this rubric and these 60 items, neither a same-family judge (gpt-4o-mini) nor a cross-family judge (Claude Sonnet) matches two human raters who agree well with each other. The cross-family judge's disagreement is systematic: it is stricter, not noisier. It is most likely applying the rubric's top score ("2") more strictly than the raters did. This run cannot say whose reading is right. It does show that judge scores on this rubric cannot stand in for the human ratings. **The human scores remain the primary E2 result**, as they were before this run.
