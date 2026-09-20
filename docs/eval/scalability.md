# E11 — Scalability: capacity model and load tests

> Added 2026-09-18 (supervisor review). Repo facts at `5a1a880`. Plan tiers per the
> deployment owner: **Vercel Pro, ElevenLabs Starter/Creator, Supabase Free.**
> Provider limits were read on 2026-09-18 and must be re-checked before publication.

## 1. What one turn costs the infrastructure

Traced from `apps/web/src/voice/useVoiceConversation.js`, `apps/web/src/services/openaiClient.js`, `apps/api/api/*` and `packages/core/rag/ragConfig.js`.

| Turn | Calls | Notes |
|---|---|---|
| Typed | 1 embed (`/api/embed`) → 1 Supabase `match_chunks` RPC (**direct from the client with the anon key, not via the proxy**) → 1 `gpt-4o` stream (`/api/chat`, ~2,425 prompt + ~207 completion tokens measured) | 3 requests |
| Spoken (study/REST path) | as typed, plus 0–2 speculative embeds, plus **one ElevenLabs REST request per sentence segment, fired as each sentence arrives** (`addSegment` pushes `tts()` into a promise queue without waiting; ~10 segments per answer, ~105 chars each) | ~13 requests; up to ~10 TTS requests in flight per user |
| Fallbacks | Whisper (`/api/transcribe`) only on empty live result; `tts-1` (`/api/speech`) per failing sentence | 0 in the normal path |

Session lifecycle and telemetry (`/api/study/*`) are batched and mostly unmetered.

## 2. Capacity model per dependency

| Dependency | Limit | What it allows | Source |
|---|---|---|---|
| **ElevenLabs TTS concurrency** | Free 2 · Starter 3 · Creator 5 · Pro 10 · Scale 15 concurrent requests, per model family; PAYG does not raise it | With ~10 parallel requests per spoken answer, **one speaking user can saturate Starter and two saturate Creator**; excess requests queue or fail into the `tts-1` fallback (no alignment → static mouth) | help.elevenlabs.io "How many Text to Speech requests can I make" |
| **OpenAI gpt-4o tokens/min** | project tier recorded as 30k TPM (`docs/eval/README.md` E2 rate-limit note); Tier 1 200k, Tier 2 450k, Tier 3 800k | 2,632 tokens/turn → **~11 turns/min at 30k**, ~76 at 200k, ~170 at 450k; 429s surface to the client as 429 (`chat.js`) | platform.openai.com/settings/limits (verify) |
| **Supabase Free** | shared Nano compute, 500 MB, pooled PostgREST connections; ivfflat `lists=10` over 453 chunks; projects pause after 7 days idle | Not binding at study scale; the index comment says revisit past ~10k rows. **Idle pause is a reliability risk between study sessions.** Client calls bypass the proxy meter | `scripts/migrations/000_supabase-setup.sql` |
| **Vercel Pro (web)** | 1 TB fast data transfer included, US$0.15/GB after; 233 MiB Unity data with `max-age=86400` | **~4,100 cold Unity loads/month included**; a returning participant re-downloads daily; ≈ US$0.036 per cold load beyond the allowance | `apps/web/vercel.json`, `apps/web/scripts/sync-unity-webgl.mjs` |
| **Vercel Pro (api)** | function duration/memory on platform defaults (nothing pinned); streaming chat held open for the whole completion (client ceiling 60 s) | Function concurrency scales automatically; cost is per active CPU time; no hard user ceiling here | `apps/api/README.md` |
| **Study meter** | 4,000 requests per access code per UTC day; **one Postgres row per (code, day) updated on every metered request** (`bump_study_usage`) | ~89 sessions/day at 45 requests/session on the single shared code; the row update is serialised, so it is a latency floor under concurrency — measured in §3.2 | `apps/api/api/_lib/guard.js`, `scripts/migrations/2026-08-18_study_tables.sql` |
| Client device | 233 MiB download + WebGL memory; brotli decode native (~4 s) only when the `Content-Encoding: br` header is served (JS fallback ≈ 20 min) | Bounds who can use the avatar arm at all; measured in §3.3 | `apps/web/vite.config.js` |

**Binding constraint:** ElevenLabs TTS concurrency, then the OpenAI TPM tier. Two design facts drive it: per-sentence TTS requests are issued in parallel (≈10× concurrency per user), and retrieval is called directly by the client so the proxy meter does not bound Supabase.

**Recommendations (not implemented here):** serialise TTS requests per client to a queue depth of 1–2 (concurrency ≈ number of simultaneously speaking users); move embed + `match_chunks` server-side (already the top latency lever in `docs/voice-latency-streaming.md`); one access code per participant; pin `maxDuration` for the chat function; keep the Supabase project warm during the study window.

## 3. Measured

### 3.1 Retrieval RPC under concurrency — `scripts/eval/load/rpc-load.mjs`
One query embedding computed once; `match_chunks` via PostgREST with the anon key; stages of 1/5/10/25/50 concurrent workers × 30 s; hard request cap in code. Reports p50/p95/p99, throughput, error rate → `docs/report/eval/final/load_rpc_<sha>.md`. Read-only; run while the study is not active; date and network recorded.

### 3.2 Proxy + meter overhead — `scripts/eval/load/proxy-load.mjs`
`POST /api/embed` (the cheapest metered route) with the study code and an allowlisted `Origin`, stages 1/10/25 × 15 s, ≤ 600 requests total (well inside the daily pool). Measures Vercel function + guard + `bump_study_usage` latency vs concurrency and whether the single-row meter serialises → `load_proxy_<sha>.md`.

### 3.3 Client load
Unity WebGL cold and warm load time and peak memory in Chrome at unthrottled / 50 Mbps / 10 Mbps (DevTools throttling), and one phone browser if available. Ties the 233 MiB figure to a user-visible number.

### 3.4 Corpus scaling (optional)
Scratch table `knowledge_chunks_scale` with 4.5k and 45k synthetic rows (perturbed copies), same index and RPC → latency vs corpus size; table dropped afterwards. The only item that writes to the database; never touches `knowledge_chunks`.

### Not measured, and why
`/api/chat` under concurrency: real money, and the ceiling it would hit is the TPM tier already in §2. Reported as a modelled number.

## 4. Results (run 2026-09-18, sha `5a1a880`, MacBook on home Wi-Fi in Auckland, study not running)

### 4.1 Retrieval RPC — `docs/report/eval/final/load_rpc_5a1a880_2026-09-18.md`
3,008 requests, zero errors, 50 rows returned every time.

| concurrency | requests | p50 ms | p95 ms | p99 ms | max ms | req/s |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 52 | 349 | 531 | 1042 | 1432 | 2.6 |
| 5 | 280 | 346 | 611 | 978 | 1224 | 13.8 |
| 10 | 641 | 279 | 541 | 810 | 961 | 31.4 |
| 25 | 928 | 526 | 853 | 1191 | 1429 | 45.2 |
| 50 | 1107 | 927 | 1325 | 1681 | 2257 | 53.0 |

Reading: throughput saturates around 50 req/s on the Free tier while p50 rises from ~350 ms to ~930 ms between 10 and 50 concurrent callers. At one retrieval per turn that is ~50 turns/s of retrieval capacity — far above the ElevenLabs and OpenAI ceilings in §2 — so the shared Nano compute, not the 453-row index, is what saturates, and it is not the binding constraint. Absolute latency includes the laptop-to-Supabase network path; the stage-to-stage change is the signal.

### 4.2 Proxy + meter — `docs/report/eval/final/load_proxy_5a1a880_2026-09-18.md`
`POST /api/embed` with the study code; 288 requests of the 600 cap (288 of the 4,000 daily pool on 2026-09-18); zero 429s; cold warm-up call 3.9 s.

| concurrency | requests | p50 ms | p95 ms | p99 ms | max ms | req/s |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 7 | 1443 | 1819 | 1839 | 1844 | 0.7 |
| 10 | 72 | 1233 | 1937 | 2630 | 2631 | 7.8 |
| 25 | 208 | 913 | 1452 | 1620 | 6542 | 21.8 |

Reading: per-request latency does not rise with concurrency and throughput scales roughly linearly as Vercel adds instances, so the single-row `bump_study_usage` meter is **not** serialising at this scale (the concern in §2 is bounded, not confirmed). The ~1.2 s floor is the NZ→US round trip plus the guard's Postgres RPC plus the OpenAI embedding call; the 6.5 s maximum at 25 concurrent is instance cold start, which is the user-visible cost of a serverless proxy for the first request of a burst.

### 4.3 Client load — measured 2026-09-19 on two machines
Read from the Resource Timing API on the deployed site (`dementiaguide-web.vercel.app`), which loads the Unity avatar on the landing page. The cold figure on the Mac is a direct cache-bypassing fetch of the data file from the page (`cache: 'no-store'`), because the app's own load was already cached in that profile.

| | MacBook (Apple M3, 8 GB), Chrome, home Wi-Fi, Auckland | A Windows Chrome connected to the account (hardware and network unrecorded) |
|---|---:|---:|
| `unity.data.unityweb` transfer | 244.5 MB brotli → 308.8 MB decoded | same |
| Cold fetch of the data file | **21.3 s** (462 ms to first byte; ≈ 92 Mbit/s on the wire) | 6.4 s (≈ 305 Mbit/s) |
| Warm load (same day, `max-age=86400`) | served from cache (300 B of headers) | served from cache |
| `unity.wasm.unityweb` | 9.4 MB → 51.9 MB decoded, cached 0.29 s | 0.53 s cold, 0.49 s cached |
| DOMContentLoaded / load event (warm) | 267 / 655 ms | 156 / 166 ms |
| JS heap after the avatar is up | 371 MB | 715–829 MB |

Decoded size exceeding transfer size confirms the brotli `Content-Encoding` header is honoured and the decode is native (FR-20); the JS fallback would be a ~20-minute stall. The two connections bracket what a participant on a good home connection sees: **6–21 s for the first load**, then cached for the day. Time on slower links is arithmetic from the transfer size: 244.5 MB is 1,956 Mbit, so ≈ 39 s at 50 Mbit/s and ≈ 3.3 min at 10 Mbit/s, plus decode. The study protocol already warms this download during the information and consent screens; these numbers say why. The heap figure varies with the machine (371 MB on the Mac, up to 829 MB on the Windows machine) and, together with the WebGL allocation, rules out low-memory phones for the avatar arm.

### 4.4 Corpus scaling
Not run (optional).
