# Voice Latency Streaming Overhaul

> STATUS: Live on device (2026-07-18, branch `feat/voice-latency-streaming`, commits `3a433ef..cf50136` + Unity submodule `480e68f`, `472e2d6`). Measured on-device: 2.7–4.5s to first audio on the Unity avatar's legacy-TTS path (was 7.6s cold / est. 5s+ per turn pre-overhaul), STT finalization 37–181ms (was 700–1500ms). Open items at the bottom.

## Problem

The gap between the user finishing speaking and the avatar starting to answer was the app's biggest UX problem: ~2.2–5.5s, all of it a strictly sequential chain — expo-av recording teardown → Whisper file upload → a hardcoded 750ms client throttle → embedding round trip → Supabase vector search → gpt-4o time-to-first-token → wait for a full first sentence → whole-sentence blocking TTS → WebView MP3 decode. The May 2026 concurrent play loop only overlapped sentences 2..N; first audio never overlapped anything.

Target: ~0.8–1.5s to first audio by streaming every stage, with the constraint that the curated NZ RAG corpus, the v2-nz-safety prompt, and the timestamp-driven viseme lip sync stay exactly as they are.

## Architecture

Every stage streams, and every stage falls back independently to the previous blocking behaviour — worst case equals the old pipeline.

```
user talks ──► expo-speech-recognition partials (en-NZ, continuous)
                 │  onPartial → speculative RAG (fires on 600ms-stable partial)
tap-stop ─────► session.stop() → final transcript in ~40–180ms
                 ├─ speculativeRag.resolve(final) → chunks reused on lexical match
                 ├─ ElevenLabs WS opened in parallel (hides in LLM TTFT)     [streaming mode]
                 └─ chatStream(skipThrottle, preRetrievedChunks)
LLM tokens ────► marker-stripped → sentence splitter (shared module)
                 ├─ [streaming] tokens → WS immediately; flush() at boundaries;
                 │   per-chunk alignment → viseme frames → WebView PCM scheduling
                 └─ [legacy]    per-sentence REST tts() → ordered play queue
```

### Mode selection (per turn)

`streaming` iff ALL of: `voiceConfig.VOICE_STREAMING_TTS` && user setting `fastVoiceMode` && ElevenLabs key present && **no Azure creds** (Azure keeps its higher-fidelity phoneme-viseme REST path) && renderer exposes `supportsStreamingAudio` (AvatarVRM yes; **UnityAvatarBridge deliberately not** — the Unity renderer always runs the legacy per-sentence path) && no sticky `ttsDegraded` from an earlier WS failure this session.

## Components

| Stage | Files | What changed |
|---|---|---|
| Streaming STT | `src/lib/stt/sttService.js`, `expoSpeechRecognition.js`, `whisperFallback.js` | expo-speech-recognition (SDK-54 pin **3.1.3** — v56.x needs iOS 16.4 and gets silently skipped by autolinking) streams partials while the user talks; `recordingOptions.persist` keeps audio so an empty live transcript is rescued through Whisper; sticky `sttDegraded` falls back wholesale after a start failure. Single mic owner per turn (no parallel expo-av recording — AVAudioSession contention). |
| Hands-free (opt-in) | same + `SettingsContext.handsFreeMode` | Own endpointing: ≥1 partial, then 1.2s of no-partial-change + volume < 0 → auto-stop; 8s lead-silence gives up; re-arms after each completed response; mic stays off while the avatar speaks (echo). |
| Speculative RAG | `src/lib/rag/speculativeRetrieval.js` | Fires `search()` when a partial (≥4 words) is stable 600ms mid-listening (900→600ms after device testing; quick taps leave no gap). Max 2 fires/turn. Reuse gate: token Jaccard ≥ 0.8 or token-prefix with ≤25% char growth. `chatStream({ preRetrievedChunks })` skips the hot-path search; prompt/citation construction is byte-identical (telemetry path `voice-speculative`). |
| Hot-path cleanup | `src/lib/openaiService.js`, `src/lib/net/withTimeout.js`, `src/lib/voice/prewarm.js` | `skipThrottle` for voice turns (750ms `_throttle` kept for text chat). Timeouts everywhere: embed 5s / Supabase RPC 4s (→ **degrade to zero chunks and answer anyway** — v2 prompt handles no-passage turns), Whisper 15s, LLM XHR 60s + 12s TTFB watchdog, ElevenLabs REST 10s. Pre-warm on VoiceScreen mount + `startRecording()` (5min debounce): SecureStore key reads + one tiny authed request per host (openai/supabase/elevenlabs) to warm TLS pools. |
| Streaming TTS | `src/lib/tts/elevenLabsStreamService.js`, `ttsMode.js` | One WS session per turn: `stream-input`, `eleven_flash_v2_5`, `pcm_22050`, `chunk_length_schedule [90,120,160,250]`, auto_mode off. `open()` fires alongside the LLM request. Tokens forwarded word-buffered with word-level `normalizeSpokenText` (equivalent to the REST path's pass — all its patterns are word-bounded). `flush()` at sentence boundaries deliberately does NOT push the held word (it belongs to the next sentence). Per-chunk `alignment` → `streamingVisemeAccumulator`. Watchdogs: open 3s, audio-stall 6s → `onError` once → sticky `markTtsDegraded()` + unspoken sentences replayed through the REST cascade from the last-shown subtitle. |
| Streaming visemes | `src/lib/lipsync/streamingVisemeAccumulator.js`, `createVisemeTimeline.js` (`streaming` option) | Per-chunk alignment → absolute-stream-time frames; runtime detection of chunk- vs stream-relative timestamps; trailing partial words carried across chunks so G2P sees whole words; `streaming: true` skips `applyFinalLowering` (would droop the mouth mid-sentence). Returns per-char absolute times — the subtitle-timing join key. |
| WebView playback | `src/features/avatar/components/AvatarVRM.js` | New in-page API `startStreamingPlayback / appendAudioChunk / endStreamingPlayback / setSpeechEmotion`: base64 PCM → Int16 → Float32 AudioBuffers scheduled gaplessly (`nextStartTime`); first chunk keeps the 10ms anchor semantics; underruns restart +20ms and shift the anchor so visemes stay aligned (count reported in `audioEnd`). `_stopCurrent` cancels scheduled sources (barge-in). Eager AudioContext at boot. RN ref exposes the same + `supportsStreamingAudio: true`. Fixed pre-existing leak: `stopAudio()` now resolves the in-flight play promise. |
| Hook orchestration | `src/features/voice/hooks/useAvatarConversation.js`, `sentenceTracker.js` | `createSentenceSplitter` extracted (identical `.!?` + early-comma-at->150-chars logic, parity-tested); producer routes sentences to WS-flush + subtitle records (streaming) or the TTS queue (legacy/fallback — the queue is also the failure-replay target). Subtitles/emotion synced to *playback* via charTimes→wallclock timers, not synthesis. Barge-in aborts WS + STT + speculative + playback. |
| Settings | `src/context/SettingsContext.tsx`, `ProfileScreen.js` | `fastVoiceMode` (default **true** — user kill switch, "Faster Voice Responses"), `handsFreeMode` (default false). `speechRate` default 0.78 → **0.9** with hydration migration (a stored 0.78 is the old default — it was never a selectable option — so it's dropped in favour of the new default). |
| Config | `src/lib/voice/voiceConfig.js` | Single source of truth (ragConfig pattern) for every flag/threshold named above. Flip `ELEVEN_STREAM_MODEL` to `eleven_turbo_v2_5` for the quality A/B. |

## Latency instrumentation

Existing `[LATENCY]` format kept; new checkpoints: `stt_partial_first_ms`, `stt_final_ms` (+`source=live|whisper|whisper-rescue`), `rag_speculative=hit|miss|none`, `ws_open_ms`, `tts_first_chunk_ms`. `[LATENCY SUMMARY]` gains `mode: streaming|streaming-degraded|legacy`. `scripts/parse-latency.mjs` still parses the summary lines.

## Measured results (Richman's iPhone, Wi-Fi, 2026-07-18, Unity avatar → legacy TTS mode)

| Turn | to_first_audio | stt_final | rag | llm_to_token | tts_first | Notes |
|---|---|---|---|---|---|---|
| 1 (cold) | 7599ms | 56ms | 3458ms | 1667ms | 1871ms | first-of-session: cold embed cache, cold Supabase, cold ElevenLabs |
| 2 | 3983ms | 48ms | 1853ms | 1097ms | 728ms | |
| 3 | 2719ms | 37ms | 1580ms | 703ms | 311ms | warm floor on this network |
| later | 4447ms | 181ms | 2819ms | 683ms | 411ms | RAG variance dominates |

Pre-overhaul, the same turns would have added ~0.7–1.5s Whisper upload + up to 750ms throttle on top of the same RAG/LLM costs. STT itself improved 700–1500ms → 37–181ms.

**Where the remaining time goes:** RAG (1.5–3.5s from the phone — two sequential round trips, embedding then `match_chunks`, over a mobile radio whose pooled connections idle out between turns) and LLM TTFT (~0.7–1.7s). Speculative RAG removes the former when it fires; hands-free mode guarantees the firing window (its 1.2s silence wait ⊇ the 600ms stabilization window).

## Device issues found & fixed during rollout (all committed)

1. **`expo-speech-recognition` version trap** — `latest` (56.0.1) targets Expo SDK 56 / iOS 16.4; CocoaPods autolinking *silently* skips pods whose platform requirement exceeds the app target (15.1), leaving `Cannot find native module`. The npm dist-tag `sdk-54` → **3.1.3**. (`f1c667b`)
2. **Simulator builds are impossible with UaaL** — vendored `UnityFramework` is a device-only arm64 dylib; `expo run:ios` against a simulator fails at link. Physical device only. The JS-side `requireNativeModule('UnityAvatarModule')` also ran at import time and killed app boot wherever the module was missing — now guarded (warns + disables Unity avatar). (`86fc0ac`)
3. **Recognition died instantly with "Audio session was interrupted"** — the WebView's AudioContext held the AVAudioSession. Fix: recognition starts with `iosCategory: playAndRecord + defaultToSpeaker/allowBluetooth + measurement`. (`86fc0ac`)
4. **Every reply then played quiet** — playAndRecord/measurement outlives the recognition session, and expo-av's `setAudioModeAsync` resets only the *category*, not the session *mode*; `measurement` mode strangles speaker loudness. Fix: explicit `setCategoryIOS(playback/default)` + expo-av re-sync on stop/cancel/settle. User-confirmed. (`ca0e802`, `cf50136`)
5. **Intermittent empty live transcripts → 1.4–2.4s whisper-rescue turns** — speech that starts before the recognizer's audio tap opens is lost. Fix: `startLiveSession` waits (≤1.5s) for `start`/`audiostart` before the UI shows "listening". Verified back to `source=live` at 181ms. (`cf50136`)
6. **Wrong voices** — the old ElevenLabs voice-ID regex fallback made *every* avatar speak as Brian; the first fix then gave the male CC4 Aaron a female voice by name-matching "cc4_aria". Profiles now carry explicit `elevenVoiceId`/`openaiVoice` per character: Aria profiles → Bella/nova, Eric + Aaron → Brian/onyx (+ Aaron's Azure voice → en-US-EricNeural). (`3a433ef`, `6500a5c`)

## Unity avatar (CC4 Aaron) notes

- The Unity renderer keeps the **legacy per-sentence TTS path by design** (`supportsStreamingAudio` is only implemented in the WebView renderer). Streaming for Unity is future work (would need chunked audio through the native bridge).
- **Camera framing** (submodule `472e2d6`): `render_focus_` moved 0.60→0.42m, y 1.595→1.628, pitch 6°→1.5° — head-and-shoulders portrait with ~13% clear headroom so the Dynamic Island no longer overlaps the avatar. Framing was iterated with phone-aspect renders straight from the Editor (RenderTexture via MCP `execute_code`) before rebuilding.
- **UnityLibrary refresh workflow** (submodule `480e68f` added `Assets/Scripts/Editor/UaalExportBuild.cs`):
  1. Editor menu `Tools → UaaL → Export iOS (uaal-export)` — or headless via MCP: `EditorApplication.delayCall += UaalExportBuild.Run;` then poll `uaal-export/export_result.json`.
  2. `cd uaal-export && xcodebuild -project Unity-iPhone.xcodeproj -scheme UnityFramework -configuration Release -sdk iphoneos -destination generic/platform=iOS -derivedDataPath build_dd build`
  3. `ditto uaal-export/Data UnityLibrary/Data && ditto uaal-export/build_dd/Build/Products/Release-iphoneos/UnityFramework.framework UnityLibrary/UnityFramework.framework`
  4. `npx expo prebuild` (plugin copies into `ios/UnityLibrary`) → `npx expo run:ios --device <udid>`.
  The stale-avatar bug this session (old beard/mouth behaviour on device) was exactly a missed step 3: a fresh Jul-14 build sat in `build_dd` while `UnityLibrary` still held Jul-12.

## Verification

- 111 jest tests (12 suites) incl. new: splitter parity vs the original inline producer, accumulator (both alignment reference frames, word carry-over, flush), speculative hit/miss/cap/cancel table, `createVisemeTimeline` streaming vs one-shot, stream service (BOS/word buffering/flush semantics/normalization/watchdogs/abort) — `npx jest`.
- Safety: prompt path untouched (`buildSystemPrompt`/`buildUserContent`/citations byte-identical; chunks arrive via the same shape from the speculative path). `npm run rag:eval:safety` unaffected.
- Fallback drills still owed on device: airplane-mode mid-stream (expect REST replay), invalid ElevenLabs key (cascade), mic permission denied (Whisper path), barge-in at each stage.

## Open items / next levers

1. **Single-round-trip retrieval**: a Supabase Edge Function doing embed + `match_chunks` server-side would collapse the phone's two sequential round trips — the dominant remaining cost (1.5–3.5s → likely well under 1s). Biggest and cheapest remaining win for the legacy path.
2. **Streaming-mode field test**: `mode:"streaming"` (WS TTS + PCM playback + sub-sentence first audio) has not yet been exercised on device — requires a Three.js avatar (Classic/New Look/Eric). Verify lip-sync quality (debug overlay), underrun counts, and flash_v2_5 pronunciation of NZ helplines before defaulting anything further.
3. **Hands-free field test**: endpointing thresholds (1.2s silence, volume < 0) are un-tuned against real elderly/hesitant speech; also the natural path to speculative-RAG hits.
4. **flash vs turbo A/B** on NZ health content (`ELEVEN_STREAM_MODEL`).
5. Deprecation cleanup: expo-av is deprecated in SDK 54 (warning at boot) — Unity-path playback and the Whisper fallback recorder should migrate to `expo-audio` eventually.
