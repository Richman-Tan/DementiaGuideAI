# §19B P2 — sentence-level citation support

Pre-registered in `docs/eval/plan-19b-propagation.md` §19B.2. Generated 2026-10-09T03:33:37.315Z by `scripts/eval/citation-support.mjs report`. Checker `claude-sonnet-5-5` (effort medium, refusal fallback default (server-side-fallback-2026-07-01)), run 2026-10-09T03:30:29.224Z → 2026-10-09T03:33:31.136Z at `f34d899`; 743572 input / 52443 output tokens, **US$2.01** at US$2/10 per 1M (2026-10-08 (plan §18.2)). Answers: the seeded `generation_8a92ecd_{v2,v2-nosafety,v2_oracle}_final.json` (gpt-4o, temperature 0, seed 42). Unit: one (sentence, cited passage) pair. Regenerate: `node scripts/eval/citation-support.mjs extract && … passages && … judge && … report [--labels <csv>]`.

Pairs: 661 extracted; 0 excluded because the cited chunk's recorded content_hash differs from the 2026-09-13 snapshot; 661 judged (568 on a hash-verified passage, 93 on an iSupport passage with no hash recorded on either side — plan §19B.2 clarification); 661 scored; 0 unscored (0 refused, 0 errors or unparsed).

## Validation gate

**Not assessed: the author's labels have not been returned.** Under the pre-registered rule only the pooled rate below may be reported, as a descriptive, unvalidated checker result. Per-condition rates are not computed.

## Pooled support across all answers (661 pairs, 194 answers)

**Descriptive, checker-judged, not validated** (gate not met or not assessed).

| Verdict | Pairs | Share | 95 % CI (bootstrap over answers) |
|---|---:|---:|---|
| supported | 435 | 65.8 % | 61.5 % – 70.2 % |
| partial | 200 | 30.3 % | 26.1 % – 34.4 % |
| not_supported | 26 | 3.9 % | 2.5 % – 5.5 % |

Sensitivity (pre-registered in the clarification): hash-verified passages only, 568 pairs — supported 70.8 % [66.3 %–75.1 %], partial 26.2 % [22.1 %–30.5 %], not_supported 3.0 % [1.7 %–4.4 %].

Sentence level (secondary; a sentence takes the best verdict among the passages it cites): 522 cited sentences — supported 76.4 %, partial 22.2 %, not_supported 1.3 %.

