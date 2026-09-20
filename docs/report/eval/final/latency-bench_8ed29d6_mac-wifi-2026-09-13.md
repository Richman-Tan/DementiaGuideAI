# Headless latency benchmark — mac-wifi-2026-09-13 (8ed29d6, 2026-09-13)

Condition v2, retrieval production, style balanced, 30 questions × 2 repeats. Warm rows exclude the first (cold) run. State the network and location alongside these numbers.

| Stage | n | median | mean | p90 | p95 | sd | min | max | cold (first run) |
|---|---|---|---|---|---|---|---|---|---|
| embed | 59 | 186 | 195 | 225 | 243 | 29 | 158 | 286 | 214 |
| rpc | 59 | 543 | 571 | 690 | 811 | 90 | 455 | 910 | 796 |
| llm_ttft | 59 | 584 | 656 | 812 | 866 | 245 | 488 | 2269 | 571 |
| llm_total | 59 | 2502 | 2574 | 3159 | 3599 | 543 | 1869 | 4335 | 3400 |
