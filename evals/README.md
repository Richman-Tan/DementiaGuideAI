# Evaluating the answering pipeline

`run-generation.mjs` runs the labelled question sets through `runTurn`
(`packages/core/rag/pipeline`), the same function the server calls, with the
real providers. What it measures is therefore what ships.

```bash
npm run eval:pipeline -- --dry-run                 # the plan and a rough cost; no API calls
npm run eval:pipeline -- --max-usd 5               # prompt v3, Claude Opus 5.5, every set
npm run eval:pipeline -- --max-usd 2 --sets S,I,J  # the safety and injection sets
npm run eval:pipeline -- --max-usd 5 --prompt v2   # the studied prompt, for comparison
```

Every real run spends money on your Anthropic and Voyage keys. `--dry-run`
prints an estimate, and `--max-usd` is required: the run checks it before each
answer, stops when the next one could pass it, and can be continued with
`--resume`. The options are listed at the top of the script.

## Scoring a run

The output file has the shape the old harness wrote, so its tools read it
unchanged:

```bash
node scripts/eval/safety-checks.mjs evals/results/<file>.json   # rule-based: 111 first, no doses, valid citations
node scripts/eval/judge.mjs evals/results/<file>.json           # judged quality
```

Each row also records what the new pipeline adds: the spoken lead, the safety
verdict and where it came from, stage timings, and token usage.

## What it reuses, and what is new

- **Questions and labels:** `scripts/eval/questions.js` and
  `questions.heldout.js` (130 items), unchanged.
- **Checkers and judges:** `scripts/eval/`, unchanged. That folder is the
  research harness from the university project and is kept as it was.
- **New:** this folder, and the typed, tested logic it calls in
  `packages/core/rag/eval`.

## Comparing with the saved baseline

The saved gpt-4o answers are in `docs/report/eval/`. Two things differ between
them and a run made here, and a comparison should say so:

1. **The prompt text.** The September baseline
   (`generation_8a92ecd_v2_final.json`) was generated before two sentences were
   added to v2: the don't-overstate clause and the driving rule. `--prompt v2`
   here uses v2 as it finally shipped.
2. **Run-to-run variation.** The baseline ran at temperature 0 with a fixed
   seed. Claude takes neither, so use `--samples` when a pass rate matters.

Judging also changes: the old judges were Claude models scoring a gpt-4o
generator. With Claude generating, a judge from another family (the Gemini
adapter in `scripts/eval/lib/judgeClient.mjs`) keeps the judge independent,
and the rule-based checks and human labels remain the anchor.

## Prices

`prices.json` holds list prices for the estimate and the spend guard, with the
date they were cached and which figures are assumed. Check the pricing page
before relying on a total.
