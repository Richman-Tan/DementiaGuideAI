# E4-S across days — per-day medians and spread

Pre-registered in `docs/eval/plan-19b-propagation.md` §19B.4. Generated 2026-10-10T20:53:08.729Z at `cbb9a33` by `scripts/eval/latency/compare-days.mjs`. **Headless pipeline, not perceived in-browser latency.**

Regenerate: `node scripts/eval/latency/compare-days.mjs --run 2026-10-09=docs/report/eval/latency/spoken-bench_3ec1cc0_mac-2026-10-09-tts_raw.csv --run 2026-10-10=docs/report/eval/latency/spoken-bench_c9724fd_mac-2026-10-10-tts_raw.csv --run 2026-10-11=docs/report/eval/latency/spoken-bench_cbb9a33_mac-2026-10-11-tts_raw.csv --out docs/report/eval/latency/spoken-bench_days_2026-10-09_to_11.md`. No API call; spend for each day is in that run's own report.

| Day (NZDT) | Raw file | Measured turns | First turn (UTC) | Last turn (UTC) |
|---|---|---:|---|---|
| 2026-10-09 | `spoken-bench_3ec1cc0_mac-2026-10-09-tts_raw.csv` | 60 | 2026-10-08T20:47:14.796Z | 2026-10-08T20:57:47.939Z |
| 2026-10-10 | `spoken-bench_c9724fd_mac-2026-10-10-tts_raw.csv` | 60 | 2026-10-09T20:42:46.653Z | 2026-10-09T20:52:11.061Z |
| 2026-10-11 | `spoken-bench_cbb9a33_mac-2026-10-11-tts_raw.csv` | 60 | 2026-10-10T20:42:51.949Z | 2026-10-10T20:52:23.749Z |

| Stage or milestone (ms) | 2026-10-09 median [95 % CI] | 2026-10-10 median [95 % CI] | 2026-10-11 median [95 % CI] | 2026-10-09 p90 | 2026-10-10 p90 | 2026-10-11 p90 | Spread of medians (max − min) |
|---|---:|---:|---:|---:|---:|---:|---:|
| Speech-to-text, whisper-1 upload | 1,540 [1,392–1,607] | 1,000 [910–1,214] | 1,283 [995–1,429] | 2,294 | 1,635 | 1,782 | 541 |
| Query embedding | 214 [201–226] | 190 [184–198] | 246 [208–284] | 421 | 412 | 527 | 56 |
| Retrieval RPC | 545 [531–600] | 502 [494–517] | 526 [521–550] | 835 | 637 | 711 | 43 |
| LLM request → first token | 776 [730–788] | 726 [708–766] | 551 [523–623] | 1,048 | 1,150 | 817 | 225 |
| TTS request → first audio byte | 765 [738–800] | 720 [697–740] | 741 [705–781] | 1,020 | 820 | 877 | 45 |
| End of speech → first sentence ready | 3,337 [3,181–3,498] | 2,772 [2,554–2,900] | 2,896 [2,698–3,053] | 4,239 | 3,670 | 3,762 | 565 |
| **End of speech → first audio byte (headline)** | 4,250 [3,985–4,451] | 3,485 [3,286–3,615] | 3,549 [3,461–3,882] | 5,138 | 4,442 | 4,544 | 766 |
| End of speech → first audio playable | 4,492 [4,180–4,686] | 3,635 [3,416–3,817] | 3,751 [3,598–4,149] | 5,399 | 4,564 | 4,857 | 857 |

Share of turns over 3,000 ms:

| Milestone | 2026-10-09 | 2026-10-10 | 2026-10-11 |
|---|---:|---:|---:|
| to_first_tts_request_ms | 47 / 60 | 17 / 60 | 25 / 60 |
| to_first_audio_byte_ms | 60 / 60 | 51 / 60 | 53 / 60 |

| # | Expectation (plan §19B.4) | Result | Verdict |
|---|---|---|---|
| D1 | L3 holds on every day: median first audio byte > 3,000 ms | 2026-10-09 4,250; 2026-10-10 3,485; 2026-10-11 3,549 | **Supported** |
| D2 | The spread of the per-day median first audio byte is ≤ 1,000 ms | 766 ms over 3 days | **Supported** |
| D3 | L1 holds on every day: whisper-1 is the largest median stage before the first token | 2026-10-09 yes; 2026-10-10 yes; 2026-10-11 yes | **Supported** |

Days are compared descriptively; no test is run (one 12-minute window per day, one machine, one network). The CI is a bootstrap over that day's turns and does not cover day-to-day variation, which is what the spread shows.
