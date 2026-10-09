# Addendum 2026-10-09 — §19C / E9-C: Chrome's on-device speech recogniser on dementia speech (ADReSS-2020)

> Pre-registration, in the style of `evaluation-plan.md` §18.3. Written and committed on Friday 9 October 2026 (NZDT) and pushed on branch `eval/e9c-chrome-ondevice` **before any DementiaBank audio is processed**. The commit order is the record that the question, governance, offline proof, locales, request settings, sample, scorer, expectations, analysis and contingencies were fixed first.
>
> **What ran before this commit.** Only no-audio checks of the tooling:
> - Three short "probe" launches of the harness Chrome with the offline guards described below, on a blank local page, querying `SpeechRecognition.available()` and watching Chrome's own background traffic for 20–45 s.
> - A curl check of a kernel sandbox profile, and one launch of Chrome on `about:blank` under it (see "Kernel-level block, considered and dropped").
>
> - Two `--dry-run`s of the new transcriber. Each read `references.csv` and hashed the cut files in Node to count cached results; nothing else was done with them.
>
> No language pack has been installed. No audio of any kind, synthetic or DementiaBank, has been played into Chrome, and no DementiaBank file has been served to it.

## 19C.1 Question

How accurately does Chrome's **on-device** Web Speech recogniser transcribe the ADReSS-2020 dementia and control speakers? How does it compare with:
- the fallback recogniser (`whisper-1`), measured in E9; and
- Apple's on-device recogniser, measured in E9-A (§18.3)?

This answers the examiner's point that the app's primary recognisers were never tested on dementia speech. E9-A covered the iOS side by proxy; this covers the web side by proxy.

## 19C.2 App facts the label depends on

The web app's primary recogniser is Chrome's Web Speech API (`apps/web/src/services/sttWeb.js`, live provider):
- `rec.lang = 'en-NZ'`, `interimResults = true`, `continuous = true` (lines 124–126);
- `processLocally` is not set, so Chrome uses its **cloud** recogniser, a Google web service;
- the transcript is the concatenation of every result's top alternative, trimmed (`onresult`);
- on stop, the app waits up to 700 ms for the final result (`STT_FINAL_TIMEOUT_MS`);
- an empty live result is rescued through `whisper-1`.

The cloud recogniser cannot be used. The DementiaBank/TalkBank Ground Rules forbid uploading the data to web services unless a selectable non-storage option is in force, and they name Google. Chrome's **on-device** recogniser runs Google's speech model locally. Its result is therefore a **proxy** for what the web app's users get, not a measurement of it. This parallels E9-A, where the iOS app requests server-capable recognition and Apple's on-device recogniser stood in for it.

**Label:** "Chrome on-device recogniser (Web Speech, `processLocally`) on desktop macOS — a proxy for the web app's cloud recogniser".

## 19C.3 Governance

**Absolute rule: no DementiaBank audio, transcript or derived text leaves this Mac.**

**Authorisation.** The author authorised downloading Google's on-device language packs on 9 October 2026. No other network use is authorised: there are no API calls and no spend.

**Dedicated harness profile.** Every phase uses one Chrome profile of its own: a `--user-data-dir` in the session's scratch directory, never the author's normal Chrome profile. The language pack is installed into it. The browser is Google Chrome 155.0.8059.39 (official build) on macOS 27.0.1 (26A434), Apple M3 with 8 GB of memory.

**Phase 1 — install (the only phase with network on).**
- The harness Chrome loads a local blank harness page from `127.0.0.1`.
- For each locale, it calls `SpeechRecognition.install({langs: [L], processLocally: true})` from a trusted click, so the call has user activation.
- No audio is played and no DementiaBank file is served.
- Recorded: the Chrome version; `available()` before and after, for both `processLocally` values and for en-NZ, en-US, en-AU and en-GB; the `install()` result; how long it took; the profile size before and after, with any SODA directories and their sizes; the `chrome://components` speech entries; the NetLog URL hosts.
- File: `docs/report/eval/stt/chrome-ondevice-install_<sha>.json`.

**Offline method (every later phase).**
- **Network block.** Chrome's network stack is pointed at a local refusing proxy (`--proxy-server=http://127.0.0.1:<port>`). Loopback bypasses the proxy, which is Chrome's default. The proxy reads the request line, answers `502` and closes, so nothing is forwarded. For HTTPS, that request line is a `CONNECT` naming the host, before any TLS or request body.
- **No name resolution.** `--host-resolver-rules="MAP * ~NOTFOUND , EXCLUDE 127.0.0.1"`. The page is served from `127.0.0.1`, so no name needs to resolve.
- **Background requests trimmed.** `--disable-quic --disable-background-networking --disable-sync --no-pings --disable-domain-reliability --disable-client-side-phishing-detection --disable-default-apps --disable-extensions --disable-breakpad --metrics-recording-only`.
- **Chrome's own sandbox stays on.**
- **Monitors**, all on for the whole session:
  1. **lsof** on the harness Chrome's process tree, every second: any socket with a non-loopback peer.
  2. **nettop** on the non-loopback interfaces, every second: any TCP flow owned by the tree, and any UDP flow of the tree that moves a byte. nettop reads the kernel's network statistics, so it also sees flows too short for lsof.
  3. **The kernel log** of `network-outbound` denials by Chrome's own sandbox in the tree.
  4. **The proxy log**: every request, with its method, host and time.
  5. **Chrome's NetLog** (`--log-net-log`, default capture mode), read live every 3 s: every URL, and every socket address, that Chrome's network stack touches.
  6. **The microphone (TCC) watchdog** from E4-B.

  The no-audio probes showed that, even with the switches above, Chrome's own background services request a handful of Google endpoints at start-up and periodically. Examples are network time, account listing, the GCM check-in, the component updater and the optimisation guide. All of these were refused by the local proxy, and none produced an external socket or flow. The NetLog also shows Chrome's IPv6 reachability check: a UDP `connect()` to `[2001:4860:4860::8888]:443` that sends no datagram. Neither kind of traffic carries speech. Both are recorded and reported, and they form the baseline below.
- **Nothing audible, no microphone.** This is the E4-B method (§18.4 and its deviation note).
  - The clip is decoded by the page and played by an `AudioContext` that is never connected to the speakers, into a `MediaStreamAudioDestinationNode`. The resulting track is passed to the recogniser with `start(track)`.
  - The page replaces `getUserMedia` with a refusal, and refuses `start()` without a track.
  - Chrome runs with `--mute-audio --use-fake-device-for-media-stream --use-fake-ui-for-media-stream --disable-audio-input`.
  - The TCC watchdog kills Chrome at the first real-microphone access request by its process tree, or by anything with Terminal as the responsible app.
  - Synthetic clips are written with `say -o` to files and converted with `afconvert`. They are never played.

**Kernel-level block, considered and dropped.**
- A `sandbox-exec` profile denying all non-loopback outbound connections and the DNS socket worked for curl.
- Chrome's own sandbox cannot start inside it ("sandbox initialization failed").
- Running Chrome with its sandbox disabled was refused by a safety check in this session.
- The method is therefore not used. The proxy, resolver rules and monitors above are the block, as the brief specifies.

**Phase 2 — offline proof, synthetic audio only, before any DementiaBank audio.**
- Six sentences of our own (none from DementiaBank) are synthesised with three voices: Samantha (US), Daniel (UK) and Karen (AU).
- For each locale:
  - `available(L, processLocally: true)` returns "available";
  - every clip, recognised on-device, gives a non-empty transcript with WER ≤ 0.5 against its script;
  - the **cloud control** (`processLocally = false`) on two clips **fails**: no transcript and an error.
- A concurrency check runs the six clips across 4 and then 2 pages at once, plus a repeat of the sequential pass. A final minute of idling records Chrome's periodic background traffic.
- **Pass criteria (all must hold):**
  - on-device recognition works offline in every locale;
  - the cloud control fails in every locale;
  - every NetLog URL containing "speech" falls inside a cloud-control window;
  - lsof saw no socket of the tree with a non-loopback peer;
  - nettop saw no TCP flow, and no UDP flow moving a byte, owned by the tree;
  - there was no sandbox network denial in the tree;
  - the NetLog shows no TCP connection to a non-loopback address;
  - there was no microphone access request.
- **Baseline.** The NetLog URL keys (scheme, host and path) and socket-address keys seen in the proof, excluding the deliberate cloud-control speech requests, together with the proxy hosts seen outside the cloud-control windows, form the **baseline** that the DementiaBank run is held to.
- File: `docs/report/eval/stt/chrome-ondevice-offline-proof_<sha>.json` (synthetic text only).
- **If any criterion fails, the evaluation stops there and is reported. No DementiaBank audio is processed.**

**Phase 3 — DementiaBank run.**
- The run starts a fresh harness Chrome with the same offline method and repeats the proof in it before any cut can be served:
  - `available()` returns "available";
  - two synthetic clips are recognised on-device;
  - the cloud control fails on both.
- Only then are the guards **armed** and the page server's gate opened. The server refuses every cut request while the gate is closed.
- **While the guards are armed, any of the following kills Chrome and stops the run:**
  - lsof sees a socket of the tree with a non-loopback peer;
  - nettop sees a TCP flow of the tree, or a UDP flow of the tree that moves a byte;
  - the sandbox denies a network operation in the tree;
  - the NetLog shows any URL containing "speech";
  - the NetLog shows any URL key or socket address outside the baseline;
  - the proxy receives a request for a host outside the baseline;
  - the recogniser reports a `network`, `service-not-allowed`, `language-not-supported` or `not-allowed` error;
  - the TCC watchdog trips.
- **Data handling.**
  - The cut WAVs are read from the git-ignored `data/dementiabank/` of the main checkout. The page fetches them by index from `127.0.0.1`. They are never copied into a committed path.
  - Hypotheses are cached under `data/dementiabank/cache/chrome-ondevice-<locale>/`. The hypothesis CSV is `data/dementiabank/hyps_chrome-ondevice-<locale>.csv`.
  - Committed: only the aggregates written by `wer-report.mjs`, plus a run record with counts, times and guard results and no transcript text.

## 19C.4 Locales

- **Primary: en-NZ.** This is the web app's locale (`sttWeb.js` sets `en-NZ`; it does not set en-US).
- **Secondary: en-US**, the accent of the corpus. It runs only if time permits after the primary condition is complete; otherwise it is reported as not run.

If installing one locale makes the other "available" (one shared English pack), that is recorded. The secondary condition still runs, because the locale string is still passed to the recogniser. A near-identical result would then be expected; it is reported descriptively. §19C fixes no expectation for en-US.

## 19C.5 Request settings and the hypothesis

These mirror `sttWeb.js`, plus `processLocally`:
- `lang` = the locale, `continuous = true`, `interimResults = true`, `maxAlternatives = 1` (the default), **`processLocally = true`**;
- no `phrases`, and no grammar.

**Audio and timing.**
- Each cut is decoded by the page (the cuts are 44.1 kHz mono 16-bit; the harness `AudioContext` runs at 48 kHz) and streamed in real time as the track described above. One new track is used per cut.
- The recogniser is started on the track first. The clip begins **250 ms after the recogniser's `audiostart` event**; the track carries silence until then, so the start of speech is not clipped.
- **`stop()` is called 1,000 ms after the clip's last sample.**
- The result is awaited until the recogniser's `end` event, with a 20 s cap, after which the session is aborted and counted as an error.

**Hypothesis.** The transcript is built as the app builds it: the concatenation of every result's top alternative in the last `result` event, trimmed.
- The app's 700 ms final-result cap is **not** applied, because the measurement is of the recogniser, not of the app's timeout. The share of cuts whose `end` came within 700 ms of `stop()` is reported descriptively.
- The app's Whisper rescue of an empty live result is not part of this measurement; that is a different recogniser.

**Empty output and no speech.** A `no-speech` error or no result gives an **empty hypothesis**, scored as deletions. This is the rule E9 applied to `whisper-1`'s empty outputs and §18.3 applied to Apple's "no speech detected".

**Errors.**
- `network`, `service-not-allowed`, `language-not-supported` or `not-allowed` stop the run: each means the path is not local, or the set-up is broken.
- Any other error is retried once, after the first pass: `aborted`, `audio-capture`, a missing `audiostart`, or the 20 s end cap. A cut still in error is left missing and counted.

**Headless or headed.** The run is headless (`--headless=new`) if on-device recognition works headless in the offline proof. Otherwise it uses a small window off to the side of the screen, and this is recorded. The window makes no sound.

**Concurrency.** Up to 4 pages recognise at once. Timing does not matter for WER, and each page has its own track and recogniser.
- The level is chosen from the offline proof: the largest k ∈ {4, 2} whose concurrent pass had no errors and a mean synthetic WER no more than 0.02 above the sequential pass.
- If neither qualifies, k = 1.

**Resumable.** The per-cut cache is keyed by tool version, locale and audio bytes. An interrupted run resumes where it stopped.

## 19C.6 Sample

Condition (a) of E9: **2,063 utterance cuts from 156 speakers** (78 dementia, 78 control), 156.9 minutes of audio. They are scored against the unchanged `data/dementiabank/references.csv`. This is the sample E9-A used.

## 19C.7 Scorer and analysis

**Scorer.** `scripts/eval/stt/wer-report.mjs`, unchanged: the same scorer and normalisation as E9 and E9-A.
- It is called once for each locale, with:
  - the Chrome hypotheses;
  - `hyps_whisper-1.csv` (condition (a));
  - `hyps_apple-ondevice-en-NZ.csv`;
  - for en-US, additionally `hyps_apple-ondevice-en-US.csv` and the Chrome en-NZ file.
- The paired comparisons are therefore computed on the same speakers in the same call.
- **Check:** the re-scored `whisper-1` and Apple rows must reproduce their committed reports:
  - `whisper-1` pooled 26.3 % control / 41.9 % dementia (mean 30.0 % / 43.0 %);
  - Apple en-NZ pooled 41.8 % / 58.5 %.
- Only the Chrome reports are committed: `docs/report/eval/stt/wer_<sha>_chrome-ondevice-<locale>.{md,csv}`.

**Analysis**, as §18.3:
- Both filler policies are reported; the primary policy strips fillers.
- For each group: mean WER with a bootstrap 95 % CI over speakers, pooled WER, and the S/D/I split.
- Dementia against control: Mann–Whitney with Cliff's δ, and Spearman ρ against MMSE.
- The hallucination and empty-output table.
- Paired Wilcoxon over speakers (per-speaker WER, fillers stripped) against `whisper-1` condition (a) and against Apple on-device en-NZ.
- Descriptive only:
  - errors and empty outputs;
  - sessions that ended before the clip did;
  - the distribution of the wait from `stop()` to `end`;
  - throughput in multiples of real time.

## 19C.8 Expectations

Each expectation is directional and can fail.
- **C1.** Dementia WER exceeds control WER (Mann–Whitney p < 0.05, δ > 0), as it did for every recogniser in E9 and E9-A.
- **C2.** Pooled WER is higher than `whisper-1`'s condition (a) figures (26.3 % control, 41.9 % dementia) in both groups, with a positive paired Δ (Wilcoxon p < 0.05). Reason: a smaller, streaming on-device model.
- **C3.** Pooled WER is lower than Apple on-device en-NZ (41.8 % control, 58.5 % dementia) in both groups, with a negative paired Δ (Wilcoxon p < 0.05). Reason: Apple's errors were dominated by whole-utterance empty outputs (17.0 % / 24.0 %), and a streaming recogniser in continuous mode is expected to return text more often.
- **C4.** The empty-output rate is below Apple en-NZ's (17.0 % / 24.0 %) in both groups, but above `whisper-1`'s (1.3 % / 3.0 %). The stock-phrase rate is below `whisper-1`'s (5.7 % / 11.4 %).

The dementia–control gap (δ) is compared with `whisper-1`'s (0.31) and Apple's (0.31) descriptively.

## 19C.9 Robustness check (pre-specified; does not change any score)

After the primary pass, 60 cuts are re-run **one at a time (k = 1)** in a fresh harness Chrome under the same guards, into a separate cache that is not scored (`transcribe-chrome.mjs --robustness`).
- The cuts are drawn by seeded random draw (`mulberry32(19)`): 30 dementia and 30 control.
- Reported: how many hypotheses are identical to the primary pass, and the mean absolute per-cut WER difference.
- If that difference exceeds 5 percentage points, the result is reported with the caveat that concurrency or real-time streaming makes the recogniser non-repeatable.

## 19C.10 Contingencies

- **Install fails, or the pack never becomes "available".** E9-C is reported as not run, with what was seen.
- **On-device recognition does not work headless.** The headed small-window launch is used, and this is recorded.
- **`start(track)` does not work with `processLocally`.** E9-C is reported as not run. There is no fallback to the real microphone or to the fake-device file.
- **Any offline-proof criterion fails.** The evaluation stops and is reported. No DementiaBank audio is processed.
- **The run stops on a guard.** The cause is investigated before anything else.
  - If the cause is an external socket or data flow, a sandbox denial, a speech URL or a recogniser `network` error, the run is **abandoned**. That locale's hypothesis cache is deleted, and the stop is reported.
  - If the cause is a Chrome background-service URL that is not about speech and was refused by the local proxy, it is recorded in a dated deviation note, committed before the run resumes. That URL is then added to the baseline. Hypotheses produced so far are kept, because the proxy refused everything throughout.
- **More than 5 % of cuts are still in error after the retry.** The result is reported with that caveat.
- **Time.** The primary condition must finish. The secondary condition and the robustness check run only if time permits.

## 19C.11 Runtime and cost

- **Runtime.** 156.9 minutes of audio stream in real time, plus about 1.25 s of lead and tail and the final-result wait per cut. That is about 3.7 h sequentially, or about 1 h per locale at k = 4. Throughput is recorded.
- **Cost.** US$0, with no API calls. No production database is touched.

## 19C.12 Outputs

- Tooling:
  - `scripts/eval/stt/transcribe-chrome.mjs`;
  - `scripts/eval/stt/chrome-ondevice/harness.html`.
- Records:
  - `docs/report/eval/stt/chrome-ondevice-install_<sha>.json`;
  - `chrome-ondevice-offline-proof_<sha>.json`;
  - `chrome-ondevice-run_<sha>_<locale>.json` (counts, times and guard results only).
- Aggregates: `docs/report/eval/stt/wer_<sha>_chrome-ondevice-<locale>.{md,csv}`.
- Results: `docs/eval/results-2026-10-10-e9c.md`, under the heading **§19C**.
