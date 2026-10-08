# §18 results — reopened automated evaluations (2026-10-08/09)

> Pre-specification: `docs/eval/evaluation-plan.md` §18, committed and pushed as `cddb4a1` (2026-10-08 13:51 NZDT) **before any of the three runs**. Tooling: `e65cdc2`. Every number below is read from a committed artefact; each artefact carries its sha, date, models, prices and regeneration command. Nothing here changes the evaluated system (prompt, retrieval, KB, models).

| Evaluation | Status | Headline | Artefacts |
|---|---|---|---|
| E9-A — Apple on-device recogniser, ADReSS-2020 condition (a) | **Run** (primary en-NZ; secondary en-US: see §1.6) | pooled WER control 41.8 % / dementia 58.5 % vs `whisper-1` 26.3 % / 41.9 %; paired Δ +14.5 pp | `docs/report/eval/stt/wer_e65cdc2_apple-ondevice-*` |
| E4-S — headless spoken-turn latency | **Run** without TTS — §18.1 key contingency (no ElevenLabs key) | end of speech → first sentence ready (strict lower bound on first audio): median 4.18 s, p90 7.17 s; 47/60 turns already over 3 s | `docs/report/eval/latency/spoken-bench_e65cdc2_mac-2026-10-09*` |
| E2-X — cross-family judge (Claude) | **Not run** — no Anthropic credential | — | — |

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

In progress at the time of this commit (en-US on-device recognition, same tool and procedure); the result is added in the next commit.

## 2. E4-S — headless spoken-turn latency, fallback recogniser (§18.1)

**Label: headless pipeline, not perceived in-browser latency.** Artefacts: `docs/report/eval/latency/spoken-bench_e65cdc2_mac-2026-10-09{.md,_raw.csv,_meta.json}`.

### 2.1 What was run

| Item | Value |
|---|---|
| Path | the web voice pipeline with the fallback recogniser, call by call from Node, as §18.1 lists it: `whisper-1` upload (`language: 'en'`, webm/opus) → `text-embedding-3-small` → `match_chunks` (50 candidates, `query_text` = transcript) → `capBySourceFamily` → `buildSystemPrompt` (web defaults, read from `SettingsContext.jsx` and asserted: balanced, jargon plain→avoid, warm, carer set-up, inline sources) + `buildUserContent` → `gpt-4o` stream (temperature 0.7, `max_tokens` 600, no history) → `createMarkerStripper` → `createSentenceSplitter` → first sentence |
| TTS | **not run.** `ELEVENLABS_API_KEY` is absent from the root `.env`, the one place the brief allowed keys to come from. The §18.1 key contingency was therefore applied as written: the TTS stage is skipped, `to_first_tts_request` is reported as a strict lower bound on time to first audio, and the headline (`to_first_audio_byte`) is not reported. The request shape the TTS stage would send is still read from `apps/api/api/eleven-tts.js` and asserted: `eleven_turbo_v2_5`, `mp3_44100_64`, Brian, speed 0.78. |
| Audio | 32 clips (30 Set-A, 2 A-neighbour warm-ups), `say -v Karen -o` → 300 ms silence each side → webm/opus mono 48 kHz 32 kbit/s; never played (checked silently with ffprobe/silencedetect). Median clip 4,977 ms. Transcript WER against the question text (sanity check only): median 0.000, max 0.083 |
| Sample | 30 Set-A questions × 2 repeats, round-robin, 5 s pacing, after 2 discarded warm-ups: **n = 60**. 0 failed turns, 0 re-runs (every turn's first attempt was clean) |
| When / where | 2026-10-09 09:09–09:21 NZDT (2026-10-08 20:09–20:21 UTC; the artefact's `date` field is the UTC date). Apple M3 8 GB, macOS 27.0.1, Node 20.19.2, Wi-Fi (en0). Baseline HTTPS round trip: api.openai.com 222 ms, Supabase 32 ms, api.elevenlabs.io 329 ms |
| Commit | `e65cdc2` (the bench script and every app module it imports, as committed) |

### 2.2 Results (ms, n = 60)

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

### 2.3 Expectations (§18.1) against results

| Pre-specified expectation | Result | Verdict |
|---|---|---|
| L1: `stt` (the `whisper-1` upload) is the largest single stage before the model's first token | median 1,697 ms against 797 (first token), 729 (RPC) and 290 (embedding); `stt` was the largest of the four in 49 of 60 turns | **Supported** |
| L2: median `to_first_tts_request` lies between 2.0 and 3.5 s | 4.18 s | **Not supported.** Slower than expected, above the range |
| L3: median `to_first_audio_byte` exceeds 3 s (testable only with the ElevenLabs key) | not measured (no key). Its strict lower bound has a median of 4.18 s, already above 3 s | **Not directly tested.** Implied by the lower bound, but no TTS stage was measured |

### 2.4 Descriptive notes (not pre-specified)

- **The run got faster as it went.** Every stage was slower in repeat 0 than in repeat 1:

  | Stage | Repeat 0 median | Repeat 1 median |
  |---|---:|---:|
  | First sentence ready | 4,894 ms | 3,354 ms |
  | `whisper-1` | 2,129 ms | 1,281 ms |
  | RPC | 1,022 ms | 618 ms |
  | Embedding | 466 ms | 250 ms |

  The RPC and the embedding call have no per-query cache on this path, so the run cannot separate provider or network drift over the 12 minutes from warm-up beyond the two discarded turns. The pooled figure is the pre-specified headline. Repeat 1 alone would sit inside L2's range, and that is not a licence to report it instead.
- **The tail comes from speech-to-text.** The four slowest first-sentence times (10.0–20.9 s) had `whisper-1` uploads of 5.3–16.2 s for clips of 4.3–5.1 s.
- **This run is a lower bound on what a participant waited for**, for these reasons:
  - It has no proxy hop and no TTS, decode or playback.
  - It starts from the end of the upload.
  - The fallback recogniser is the slowest recogniser path; the primary live recognisers deliver their transcript close to the stop.

  It measures the cost of the fallback path. The web client takes that path when the browser has no `SpeechRecognition` (for example Firefox), when live recognition fails to start, or when it rescues an empty live result (`apps/web/src/services/sttWeb.js`).

## 3. E2-X — cross-family judge (§18.2): not run

§18.2's precondition is that `ANTHROPIC_API_KEY` is present. It is not, so this evaluation stops and is reported as not run; the specification stands for when a key exists.
- The root `.env` has no `ANTHROPIC_API_KEY`, the shell environment has none, and the Anthropic CLI (`ant`) is not installed, so no `ant auth login` profile exists either.
- No Claude call was made.
- No result, κ value or direction exists for a Claude judge.
- The κ figures in the report remain gpt-4o-mini's only.

**Ready to run when a key exists.** `judge.mjs --key` was reviewed and fixed before use. The human sheet includes held-out S items (`HM*`), which the default question pool omits, so `--key` now loads the held-out pool and refuses to start unless all 60 rated items are found. The dry run selects exactly §18.2's items:

| Dimension | Items |
|---|---:|
| Groundedness | 49 |
| Correctness | 20 |
| Helpfulness | 35 |
| Tone | 60 |
| Safety | 35 |

Stage 1, about US$1:
```
node scripts/eval/judge.mjs docs/report/eval/generation_8a92ecd_{p0,v1,v2,v2-nosafety,v2_none}_final.json \
  --model claude-sonnet-5-5 --effort medium --key docs/report/eval/human/human-sheet_round1_KEY.csv \
  --tag key60 --out-dir docs/report/eval/final
```
Then `agreement.mjs` against R1 and R2 separately, the κ ≥ 0.6 plus non-degeneracy gate per dimension, and stage 2 (`judge-pairwise.mjs`) only on helpfulness or safety, and only if one of them passes.

## 4. Spend

Prices are from `scripts/eval/pricing.2026-09.json` (checked 2026-09-18): gpt-4o US$2.50 / 10 per 1M tokens, `text-embedding-3-small` US$0.02 per 1M, `whisper-1` US$0.006 per minute.

| Item | Spend (US$) | Basis |
|---|---:|---|
| E4-S, 62 turns including the 2 warm-ups | **0.635** | gpt-4o 0.604, `whisper-1` 0.031, embeddings 0.00002. Computed from each response's returned token usage and the clip durations |
| E9-A, en-NZ and en-US, plus the robustness check | 0 | on-device; nothing sent off the machine |
| E2-X | 0 | not run; no Claude call made |
| Earlier session, 2026-10-08 (tooling, Apple en-NZ pass, audio synthesis, dry runs) | ≈ 0 | **Estimated.** It left no latency, judge or generation output, and every step it ran is local. The provider dashboards were not checked |
| **Total** | **≈ 0.64** | against the US$25 cap |

## 5. Deviations from §18 and limitations

- **E4-S ran without TTS.** That followed the pre-specified key contingency, so its headline (`to_first_audio_byte`, and with it L3) is not reported.
  - The ElevenLabs key was not in the root `.env`. A key does exist in the API app's environment pulled from Vercel production. It was not used, because the brief limits keys to the root `.env` and that key is the production study proxy's credential.
  - With `ELEVENLABS_API_KEY` in the root `.env`, `node scripts/eval/latency/bench-spoken.mjs --tts --tag <new tag>` re-runs the same sample with synthesis. Per §18.1, that run replaces this one as the headline. It would use about 6,000 characters from the plan's credits.
- **E2-X was not run:** there is no Anthropic credential. See §3.
- **The E9-A hypotheses come from the earlier session's pass,** run on code that was not yet committed but was identical to the committed code. Provenance is in §1.1. They were scored after the commit, and the scorer reproduced the committed `whisper-1` figures exactly.
- **E4-S's `date` field is the UTC date** (2026-10-08). The run took place on the morning of 2026-10-09 in New Zealand.
- **Post hoc:** the E9-A robustness re-run (§1.4), the E4-S per-repeat and tail notes (§2.4) and the E9-A deletion share. All are labelled. None replaces a pre-specified figure.
- **Limitations of E4-S:**
  - one machine, one Wi-Fi network, one 12-minute window;
  - synthetic Australian-accented speech, so recognition accuracy is not a finding;
  - no proxy hop, so it cannot speak to the perceived latency of the live recogniser or of the Unity client.
- **Limitations of E9-A:**
  - macOS, not iOS;
  - on-device, while the app requests server-capable recognition;
  - files, not a microphone stream;
  - a US-English corpus heard by an en-NZ model (§1.6 gives the en-US secondary condition);
  - Cookie Theft picture descriptions, not caregiver questions.
