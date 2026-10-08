# §18 results — reopened automated evaluations (2026-10-08/09)

> Pre-specification: `docs/eval/evaluation-plan.md` §18, committed and pushed as `cddb4a1` (2026-10-08 13:51 NZDT) **before any of the three runs**. Tooling: `e65cdc2`. Every number below is read from a committed artefact; each artefact carries its sha, date, models, prices and regeneration command. Nothing here changes the evaluated system (prompt, retrieval, KB, models).

**Update, 9 Oct 2026 (later the same day).** Once the keys were available, the two evaluations that had stopped at their key contingency were run as pre-specified:
- **E4-S with TTS** (§2.0), which replaces the first run as the headline, as §18.1 says;
- **E2-X** (§3), with the judge §18.2 originally named. A short-lived Gemini deviation (`b1030da`) was withdrawn in `99566dc` before Claude judged any item.

| Evaluation | Status | Headline | Artefacts |
|---|---|---|---|
| E9-A — Apple on-device recogniser, ADReSS-2020 condition (a) | **Run** (primary en-NZ; secondary en-US also run, §1.6) | pooled WER control 41.8 % / dementia 58.5 % vs `whisper-1` 26.3 % / 41.9 %; paired Δ +14.5 pp | `docs/report/eval/stt/wer_e65cdc2_apple-ondevice-en-NZ.*`, `wer_0b81b1c_apple-ondevice-en-US.*` |
| E4-S — headless spoken-turn latency | **Run with TTS** (headline, §2.0); the earlier run without TTS is kept as a second sample (§2.1–2.4) | end of speech → **first audio byte: median 4.25 s, p90 5.14 s; 60/60 turns over 3 s**. L1, L2 and L3 supported | `docs/report/eval/latency/spoken-bench_3ec1cc0_mac-2026-10-09-tts*`; first run `spoken-bench_e65cdc2_mac-2026-10-09*` |
| E2-X — cross-family judge (`claude-sonnet-5-5`) | **Run**, stage 1 only | **no dimension passes the κ ≥ 0.6 gate** (best: correctness κ 0.46 / 0.32 against R1 / R2, and degenerate); stage 2 not run. The judge is stricter than both raters on every dimension | `docs/report/eval/final/judge-crossfamily_claude-sonnet-5-5.md` and the files it lists |

## 1. E9-A — Apple's on-device recogniser on dementia speech (§18.3)

### 1.1 What was run

| Item | Value |
|---|---|
| Recogniser | `SFSpeechRecognizer`, macOS 27.0.1 (build 26A434), Apple M3 8 GB; `scripts/eval/stt/apple-ondevice/AppleOnDeviceSTT.swift` driven by `scripts/eval/stt/transcribe-apple.mjs` |
| Governance | every request sets `requiresOnDeviceRecognition = true`; the tool refuses to start unless `supportsOnDeviceRecognition` is true for the locale, and every batch re-checks the tool's confirmation. Audio read from the cut WAV files (`SFSpeechURLRecognitionRequest`), never played, never sent to any server. Hypotheses and cache stay in the git-ignored `data/dementiabank/` |
| Request | locale **en-NZ** (the iOS app's), `shouldReportPartialResults = false`, `addsPunctuation = false`, `taskHint = .unspecified`, no contextual strings; hypothesis = final `bestTranscription.formattedString` |
| Sample | condition (a): 2,063 utterance cuts, 156 speakers (78 dementia / 78 control), scored against the unchanged `data/dementiabank/references.csv` |
| Scorer | `scripts/eval/stt/wer-report.mjs`, unchanged — the same scorer and normalisation as E9. The `whisper-1` condition (a) file was re-scored in the same call and reproduces the committed `wer_57ad032_whisper-1.md` exactly (mean 30.0 % / 43.0 %), so the comparison is like for like |
| Outcomes | 2,063 / 2,063 files returned a result; 0 errors (so the one-retry rule never fired); **439 "no speech detected"** results (`kAFAssistantErrorDomain` 1110), scored as empty hypotheses (deletions), as §18.3 fixes in advance |
| Cost | US$0 (local) |

**Provenance of the hypotheses.** The recognition pass ran on 2026-10-08 from 14:04:55 to 14:22:44 NZDT (per-file cache timestamps), in the session that wrote the tooling, after the §18 commit. The tooling was then uncommitted; its last edit was at 14:03:50, before the run started, and it was committed unchanged (apart from `judge.mjs`, which E9-A does not use) as `e65cdc2`. The cached results are therefore the output of the committed method and were reused rather than re-run, as the brief allows. They were scored on 2026-10-09.

### 1.2 Results — fillers stripped (primary policy), `wer_e65cdc2_apple-ondevice-en-NZ.md`

| Group | Speakers | Ref words | Mean WER (95 % CI over speakers) | Median | Pooled WER | Sub | Del | Ins |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| control | 78 | 9,194 | 44.5 % (38.2–51.1) | 33.8 % | **41.8 %** | 10.1 % | 30.4 % | 1.3 % |
| dementia | 78 | 7,870 | 57.5 % (51.9–63.0) | 55.5 % | **58.5 %** | 9.2 % | 48.4 % | 0.9 % |

- Dementia vs control, per-speaker WER: Mann–Whitney U = 2102.5, z = 3.33, p < 0.001, Cliff's δ = 0.31 (78 vs 78).
- WER vs MMSE: Spearman ρ = −0.204, p = 0.010, n = 155.
- Fillers kept (secondary policy): pooled 43.4 % / 59.8 %; U = 2148.5, p = 0.002, δ = 0.29.
- Paired against `whisper-1` condition (a), per-speaker WER, fillers stripped: mean Δ (Apple − `whisper-1`) **+14.5 pp**, Wilcoxon p < 0.001, rank-biserial 0.81, n = 156.
- Stock phrases / empty outputs (hallucination table): control 0.1 % (1) / 17.0 % (178), dementia 0.0 % (0) / 24.0 % (244). `whisper-1` condition (a): 5.7 % / 1.3 % and 11.4 % / 3.0 %.
- Error character: deletions are 73 % of Apple's errors in control speech and 83 % in dementia speech (from the S/D/I counts in the per-speaker CSV); 57.6 % of deleted words are function words.
- Speed: local recognition median 309 ms per cut, real-time factor 0.12. (The report template labels this "API round trip"; for this recogniser it is on-device processing time.)

### 1.3 Expectations (§18.3) against results

| Pre-specified expectation | Result | Verdict |
|---|---|---|
| A1: dementia WER exceeds control WER (Mann–Whitney p < 0.05, δ > 0) | p < 0.001, δ = 0.31 | **Supported** |
| A2: pooled WER higher than `whisper-1` condition (a) (26.3 % control, 41.9 % dementia) in both groups, with a positive paired Δ | 41.8 % and 58.5 %; Δ +14.5 pp, p < 0.001 | **Supported** |
| A3: stock-phrase rate falls below `whisper-1`'s while the empty-output rate rises above it | phrases 0.1 % / 0.0 % (vs 5.7 % / 11.4 %); empty 17.0 % / 24.0 % (vs 1.3 % / 3.0 %) | **Supported** (both halves) |

Reading: Apple's on-device model fails the other way from Whisper. It almost never invents text, but it returns nothing for about a fifth of the utterances, and more often for dementia speech. Its error is mostly deletion. The dementia–control gap (δ = 0.31) is the same size as `whisper-1`'s (δ = 0.31); the on-device recogniser is worse for both groups, not specifically worse for dementia speech.

### 1.4 Robustness check (not pre-specified)

Because the "no speech" share was much larger than expected, the same binary was re-run on 2026-10-09 to check that these results were properly the recogniser's and not an artefact of the harness. This check is reported only to support the reading above; it does not change any scored hypothesis.
- 60 randomly chosen "no speech" cuts (40 drawn from all of them, plus 20 with eight or more reference words), in one batch: 59 again returned "no speech".
- 10 of those cuts, each in a fresh process: all 10 again returned "no speech". So the result is not carried over from an earlier request.
- 40 random cuts that had a transcript: 39 produced a byte-identical hypothesis, and none became empty.

The check used a seeded random draw; the procedure is recorded here rather than as a script.

### 1.5 Label and what it stands for

**"Apple on-device recogniser on macOS."** The iOS app's primary recogniser is expo-speech-recognition, which uses SFSpeechRecognizer. It is started with `lang: 'en-NZ'` and **`requiresOnDeviceRecognition: false`** (`apps/mobile/src/lib/stt/expoSpeechRecognition.js`, line 207). iOS may therefore use Apple's **server** recognition for the app's users, so this on-device result is a **proxy** for what iOS users get, not a measurement of it. Other differences from the app:
- the app streams microphone audio with partials, where this run reads files;
- macOS was used, not iOS.

The web app's primary recogniser (Chrome's Web Speech API) is not measured, under the data rules.

### 1.6 Secondary condition — en-US

**Run**, because time permitted: the same tool, request settings, cuts and scorer, with locale en-US, the corpus's accent. The pass took 760 s on 2026-10-09 and returned 2,063 results with 0 errors, 464 of them "no speech". It was scored in one call together with en-NZ and `whisper-1`, so the paired rows compare the same speakers. The report is `wer_0b81b1c_apple-ondevice-en-US.md`; the scorer and transcriber at `0b81b1c` are unchanged from `e65cdc2`.

| Group | Pooled WER en-US (en-NZ) | Mean WER en-US (95 % CI) | Del | Empty outputs en-US (en-NZ) |
|---|---:|---|---:|---:|
| control | 42.2 % (41.8 %) | 45.4 % (39.2–51.8) | 30.7 % | 18.4 % (17.0 %) |
| dementia | 58.9 % (58.5 %) | 58.0 % (52.5–63.5) | 48.3 % | 25.0 % (24.0 %) |

- Dementia vs control: Mann–Whitney p < 0.001, δ = 0.31. Spearman ρ against MMSE = −0.205, p = 0.009. Fillers kept: 43.8 % / 60.2 %, δ = 0.29.
- Paired, per speaker:
  - en-US − en-NZ = **+0.7 pp** (Wilcoxon p = 0.005, rank-biserial 0.31);
  - en-US − `whisper-1` = +15.1 pp (p < 0.001).

Reading: matching the locale to the corpus accent does not help. en-US is marginally *worse* than en-NZ, by under one point, so A2's suggested reason, "an en-NZ model hearing US English", does not explain the gap to `whisper-1`. The size of the on-device model, and its tendency to return nothing, remain the explanation the data allow. §18 fixed no expectation for this condition, so it is descriptive.

## 2. E4-S — headless spoken-turn latency, fallback recogniser (§18.1)

**Label: headless pipeline, not perceived in-browser latency.** Artefacts: headline run `docs/report/eval/latency/spoken-bench_3ec1cc0_mac-2026-10-09-tts{.md,_raw.csv,_meta.json}`; first run `spoken-bench_e65cdc2_mac-2026-10-09{.md,_raw.csv,_meta.json}`.

### 2.0 Headline run, with TTS

Same path, sample, audio clips and pacing as the first run (§2.1), with the TTS stage added: ElevenLabs REST `/with-timestamps`, `eleven_turbo_v2_5`, `mp3_44100_64`, Brian, `{stability 0.4, similarity_boost 0.75, style 0.2, speed 0.78}`, the request shape asserted from `apps/api/api/eleven-tts.js`. The audio was written to memory and never played.

- **When / where:** 2026-10-09 09:46–09:57 NZDT, at commit `3ec1cc0`; the same Mac and Wi-Fi as the first run. Baseline HTTPS round trip: api.openai.com 202 ms, Supabase 49 ms, api.elevenlabs.io 304 ms.
- **Sample:** n = 60 measured turns after 2 discarded warm-ups; 0 failed, 0 re-run.

| Stage or milestone (ms, n = 60) | median | p90 | p95 | max |
|---|---:|---:|---:|---:|
| Speech-to-text, `whisper-1` upload | 1,540 | 2,294 | 2,482 | 3,290 |
| Query embedding | 214 | 421 | 496 | 808 |
| Retrieval RPC `match_chunks` | 545 | 835 | 871 | 1,372 |
| LLM request → first token | 776 | 1,048 | 1,078 | 1,348 |
| TTS request → first audio byte | 765 | 1,020 | 1,462 | 2,674 |
| End of speech → first sentence ready = first TTS request | 3,337 | 4,239 | 4,372 | 5,476 |
| **End of speech → first audio byte (headline)** | **4,250** | **5,138** | 5,476 | 6,220 |
| End of speech → first audio playable | 4,492 | 5,399 | 6,107 | 7,306 |

Against the post-hoc 3 s yardstick (report §4.5): the first audio byte came later than 3 s in **60 of 60 turns**. The first sentence was ready later than 3 s in 47 of 60.

| Pre-specified expectation (§18.1) | Result | Verdict |
|---|---|---|
| L1: `stt` is the largest single stage before the model's first token | median 1,540 ms against 776, 545 and 214; largest of the four in 59 of 60 turns | **Supported** |
| L2: median `to_first_tts_request` lies between 2.0 and 3.5 s | 3.34 s | **Supported**, near the top of the range |
| L3: median `to_first_audio_byte` exceeds 3 s | 4.25 s | **Supported** |

**Run-to-run variability (descriptive).** The two runs started 37 minutes apart on the same machine and network. Their L2 verdicts differ: the first run's median first-sentence time was 4.18 s, this run's 3.34 s. The gap is mostly in the network-bound stages (`whisper-1` 1,697 → 1,540 ms; RPC 729 → 545 ms; embedding 290 → 214 ms) and in the first run's long speech-to-text tail. Within this run, repeat 0 and repeat 1 differ less: first sentence at 3,688 vs 3,097 ms, first audio byte at 4,398 vs 3,971 ms. Per §18.1 this run is the headline, and the first run stays reported as a second sample. Read together, they show that a single 12-minute run fixes the median first-sentence time only to within about a second, and L2's 3.5 s bound falls inside that spread. L3 holds in both runs: in the first on its lower bound (median 4.18 s), here on the measured first audio byte.

### 2.1 First run, without TTS — what was run

| Item | Value |
|---|---|
| Path | the web voice pipeline with the fallback recogniser, call by call from Node, as §18.1 lists it: `whisper-1` upload (`language: 'en'`, webm/opus) → `text-embedding-3-small` → `match_chunks` (50 candidates, `query_text` = transcript) → `capBySourceFamily` → `buildSystemPrompt` (web defaults, read from `SettingsContext.jsx` and asserted: balanced, jargon plain→avoid, warm, carer set-up, inline sources) + `buildUserContent` → `gpt-4o` stream (temperature 0.7, `max_tokens` 600, no history) → `createMarkerStripper` → `createSentenceSplitter` → first sentence |
| TTS | **not run in this first run.** `ELEVENLABS_API_KEY` is absent from the root `.env`, the one place the brief allowed keys to come from. The §18.1 key contingency was therefore applied as written: the TTS stage is skipped, `to_first_tts_request` is reported as a strict lower bound on time to first audio, and the headline (`to_first_audio_byte`) is not reported. The request shape the TTS stage would send is still read from `apps/api/api/eleven-tts.js` and asserted: `eleven_turbo_v2_5`, `mp3_44100_64`, Brian, speed 0.78. |
| Audio | 32 clips (30 Set-A, 2 A-neighbour warm-ups), `say -v Karen -o` → 300 ms silence each side → webm/opus mono 48 kHz 32 kbit/s; never played (checked silently with ffprobe/silencedetect). Median clip 4,977 ms. Transcript WER against the question text (sanity check only): median 0.000, max 0.083 |
| Sample | 30 Set-A questions × 2 repeats, round-robin, 5 s pacing, after 2 discarded warm-ups: **n = 60**. 0 failed turns, 0 re-runs (every turn's first attempt was clean) |
| When / where | 2026-10-09 09:09–09:21 NZDT (2026-10-08 20:09–20:21 UTC; the artefact's `date` field is the UTC date). Apple M3 8 GB, macOS 27.0.1, Node 20.19.2, Wi-Fi (en0). Baseline HTTPS round trip: api.openai.com 222 ms, Supabase 32 ms, api.elevenlabs.io 329 ms |
| Commit | `e65cdc2` (the bench script and every app module it imports, as committed) |

### 2.2 First run — results (ms, n = 60)

| Stage | median | mean | p90 | p95 | max |
|---|---:|---:|---:|---:|---:|
| Speech-to-text, `whisper-1` upload | **1,697** | 2,288 | 3,470 | 5,418 | 16,150 |
| Query embedding | 290 | 474 | 851 | 1,112 | 2,158 |
| Retrieval RPC `match_chunks` | 729 | 960 | 1,755 | 2,160 | 3,522 |
| LLM request → first token | 797 | 964 | 1,353 | 1,863 | 3,605 |
| LLM request → first sentence | 1,016 | 1,174 | 1,686 | 2,114 | 3,839 |
| **End of speech → first LLM token** | 3,950 | 4,687 | 6,771 | 9,978 | 20,695 |
| **End of speech → first sentence ready = first TTS request** (lower bound on first audio) | **4,179** | 4,897 | **7,170** | 10,129 | 20,915 |

Against the post-hoc 3 s yardstick (report §4.5):
- First token later than 3 s: 44 of 60 turns (73.3 %).
- First sentence ready later than 3 s: **47 of 60 (78.3 %)**. Synthesis can only add time, so at least 78.3 % of these turns would deliver their first audio byte later than 3 s.

### 2.3 First run — expectations (§18.1) against results

| Pre-specified expectation | Result | Verdict |
|---|---|---|
| L1: `stt` (the `whisper-1` upload) is the largest single stage before the model's first token | median 1,697 ms against 797 (first token), 729 (RPC) and 290 (embedding); `stt` was the largest of the four in 49 of 60 turns | **Supported** |
| L2: median `to_first_tts_request` lies between 2.0 and 3.5 s | 4.18 s | **Not supported.** Slower than expected, above the range |
| L3: median `to_first_audio_byte` exceeds 3 s (testable only with the ElevenLabs key) | not measured (no key). Its strict lower bound has a median of 4.18 s, already above 3 s | **Not directly tested.** Implied by the lower bound, but no TTS stage was measured |

### 2.4 First run — descriptive notes (not pre-specified)

- **The run got faster as it went.** Every stage was slower in repeat 0 than in repeat 1:

  | Stage | Repeat 0 median | Repeat 1 median |
  |---|---:|---:|
  | First sentence ready | 4,894 ms | 3,354 ms |
  | `whisper-1` | 2,129 ms | 1,281 ms |
  | RPC | 1,022 ms | 618 ms |
  | Embedding | 466 ms | 250 ms |

  The RPC and the embedding call have no per-query cache on this path, so the run cannot separate provider or network drift over the 12 minutes from warm-up beyond the two discarded turns. The pooled figure is the pre-specified headline. Repeat 1 alone would sit inside L2's range, and that is not a licence to report it instead.
- **The tail comes from speech-to-text.** The four slowest first-sentence times (10.0–20.9 s) had `whisper-1` uploads of 5.3–16.2 s for clips of 4.3–5.1 s.
- **What it bounds.** For a turn on the fallback path, this run is a lower bound on the wait:
  - it has no proxy hop and no TTS, decode or playback;
  - its clock starts at the start of the upload, standing in for the end of recording, so MediaRecorder finalisation is excluded.

  For a turn on a primary live recogniser, which delivers its transcript close to the stop, most of the `stt` stage (median 1.7 s) would not be paid, so the wait could be shorter. This run does not measure that path. It measures the cost of the fallback path. The web client takes that path when the browser has no `SpeechRecognition` (for example Firefox), when live recognition fails to start, or when it rescues an empty live result (`apps/web/src/services/sttWeb.js`).

## 3. E2-X — cross-family judge (§18.2)

Full write-up: `docs/report/eval/final/judge-crossfamily_claude-sonnet-5-5.md`.

**History.** At first this evaluation stopped at its precondition, because there was no Anthropic credential.
- The author then chose a free judge. The deviation to `gemini-3.8-flash` was committed before judging (`b1030da`).
- Gemini's free tier allows 20 requests per model per day, so that run scored only 7 of the 60 items.
- The author then supplied an Anthropic credential, and the deviation was withdrawn (`99566dc`) before Claude judged any item. The 7 Gemini scores were never compared with the human ratings, and they are discarded.

**Run.** `claude-sonnet-5-5`, effort `medium`, refusal fallback `"default"`, the unchanged rubric and blinded prompts. It covered the 60 rated items (groundedness 49, correctness 20, helpfulness 35, tone 60, safety 35). It ran 2026-10-09 11:12–11:15 NZDT with 0 errors, 0 refusals and 0 unparsed scores, at a cost of US$0.70.

**Stage 1 — the gate.** Unweighted κ per rater:

| Dimension | n | κ vs R1 | κ vs R2 | Degenerate? | Gate |
|---|---:|---:|---:|---|---|
| Groundedness | 49 | −0.097 | 0.012 | no | fail |
| Correctness | 20 | 0.459 | 0.318 | yes (R1 19 of 20 at 2) | fail |
| Helpfulness | 35 | 0.017 | 0.040 | no | fail |
| Tone | 60 | 0.039 | −0.043 | no | fail |
| Safety | 35 | −0.139 | −0.019 | no | fail |

**No dimension passes.** The two raters agree with each other at κ 0.63–0.93 on the same items.

**Stage 2 — not run.** §18.2 runs it only on a passing helpfulness or safety, so no judge-based direction between conditions exists. No per-condition judge mean is reported.

**Expectations.**
- "No dimension is expected to pass": **consistent**.
- "Claude's κ against both raters exceeds gpt-4o-mini's on groundedness and safety": **not supported**. Claude is higher against R2 and lower against R1 on both, and all eight values lie within 0.14 of zero.

**Descriptive.**
- Judge–judge κ against gpt-4o-mini: groundedness 0.126, correctness 0.459, helpfulness 0.000, tone 0.000, safety 0.076.
- Pooled over all 60 items, the judge is **stricter than both raters on every dimension**. Helpfulness, for example: the judge gave a 2 to 9 of 35 answers, and the raters to 26 and 25.
- gpt-4o-mini failed by putting nearly everything at the ceiling. Claude fails the other way: it uses the whole scale but marks down answers both raters gave a 2.

**What this means for the report.** Neither a same-family nor a cross-family judge can stand in for the human ratings on this rubric. **The human scores remain the primary E2 result.** The report's judge κ statement now covers two judges, not one.

## 4. Spend

Prices are from `scripts/eval/pricing.2026-09.json` (checked 2026-09-18): gpt-4o US$2.50 / 10 per 1M tokens, `text-embedding-3-small` US$0.02 per 1M, `whisper-1` US$0.006 per minute.

| Item | Spend (US$) | Basis |
|---|---:|---|
| E4-S first run, 62 turns including the 2 warm-ups | **0.635** | gpt-4o 0.604, `whisper-1` 0.031, embeddings 0.00002. Computed from each response's returned token usage and the clip durations |
| E9-A, en-NZ and en-US, plus the robustness check | 0 | on-device; nothing sent off the machine |
| E4-S headline run with TTS, 62 turns | **0.630** | gpt-4o 0.599, `whisper-1` 0.031, embeddings 0.00002; ElevenLabs 6,200 characters from the plan's credits |
| E2-X, `claude-sonnet-5-5`, 60 calls | **0.70** | 265,084 input and 17,250 output tokens at US$2 / 10 per 1M (Anthropic list price, 2026-10-08) |
| E2-X, withdrawn Gemini run | 0 | free tier |
| Earlier session, 2026-10-08 (tooling, Apple en-NZ pass, audio synthesis, dry runs) | ≈ 0 | **Estimated.** It left no latency, judge or generation output, and every step it ran is local. The provider dashboards were not checked |
| **Total** | **≈ 1.97** | against the US$25 cap |

## 5. Deviations from §18 and limitations

- **E4-S first ran without TTS,** under the pre-specified key contingency, because the ElevenLabs key was not yet in the root `.env`. Once the key was added, the same sample was re-run with synthesis (§2.0). That run is the headline, as §18.1 requires, and the first run is kept as a second sample.
- **E2-X: a judge deviation was made and withdrawn, both before the replacement judge scored anything.** Gemini was chosen for cost (`b1030da`). Its free-tier daily cap stopped it at 7 of 60 items. It was replaced by the originally specified `claude-sonnet-5-5` (`99566dc`), and the 7 partial scores were discarded unexamined. See §3.
- **E2-X code provenance:** the judge ran from `99566dc` with three uncommitted changes, committed alongside the results: the `error`/`refused` row fields, the unused Gemini adapter, and multi-file `--judge-a/--judge-b`. None touches the Claude call, the prompts or the scoring.
- **The E9-A hypotheses come from the earlier session's pass,** run on code that was not yet committed but was identical to the committed code. Provenance is in §1.1. They were scored after the commit, and the scorer reproduced the committed `whisper-1` figures exactly.
- **E4-S's `date` field is the UTC date** (2026-10-08). Both runs took place on the morning of 2026-10-09 in New Zealand.
- **Post hoc:** the E9-A robustness re-run (§1.4), the E4-S per-repeat, tail and run-to-run notes (§2.0, §2.4), the E2-X pooled score distributions (§3) and the E9-A deletion share. All are labelled. None replaces a pre-specified figure.
- **Limitations of E4-S:**
  - one machine, one Wi-Fi network, two 12-minute windows on one morning;
  - synthetic Australian-accented speech, so recognition accuracy is not a finding;
  - no proxy hop, so it cannot speak to the perceived latency of the live recogniser or of the Unity client.
- **Limitations of E9-A:**
  - macOS, not iOS;
  - on-device, while the app requests server-capable recognition;
  - files, not a microphone stream;
  - a US-English corpus heard by an en-NZ model (§1.6 gives the en-US secondary condition);
  - Cookie Theft picture descriptions, not caregiver questions.
