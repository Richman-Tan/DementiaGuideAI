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

## 19C.13 Amendment, 9 Oct 2026 — the cloud control; committed before any DementiaBank audio

**When and why.**
- The first offline proof (20:13:39–20:21:38 NZDT, `chrome-ondevice-offline-proof_4a92057.json`) failed one criterion: the same-locale cloud control returned transcripts instead of failing.
- A diagnostic (20:23:03–20:24:51, offline, synthetic audio only; `chrome-ondevice-cloud-diagnostic_4a92057.json`) showed why. With the English pack installed, Chrome 155 serves an English request on-device even when `processLocally` is false, and makes no speech request. A French request (no pack installed) does try Google's speech endpoint, is refused by the local proxy, and fails with `network`.
- The evaluation stopped, as §19C.10 requires, and was reported (`results-2026-10-10-e9c.md`, §19C.6 proposal).
- On 9 October the author approved the proposal. This amendment adopts it as proposed, plus the two clarifications below.
- It is written after the failed criterion and **before any DementiaBank audio**. No DementiaBank cut has been served to Chrome, and no hypothesis exists. The failed proof and the diagnostic stay committed as the record.

**1. The cloud control becomes fr-FR**, a locale with no installed pack.
- Two synthetic French sentences (`say -v Jacques -o`, never played) are recognised with `processLocally = false`, 5 s apart, after the English steps.
- **Pass:** each returns no transcript and a `network` error. In each step's window (start → end + 2 s), the NetLog shows a speech URL, and the proxy refused a `CONNECT www.google.com:443`.
- This replaces the same-locale cloud control in the offline proof and in the run's preflight.

**2. Added check: English requests make no speech request.**
- After a 10 s settle, two English clips are recognised in the locale under test with `processLocally = false`, 5 s apart.
- **Pass:** each step's window (start → end + 2 s) contains no NetLog speech URL and no proxy request for `www.google.com`.
- Every English request in the DementiaBank run is still made with `processLocally = true`. The diagnostic shows that, where no pack exists, such a request is refused (`language-not-supported`), not sent to the cloud.

**Amended offline-proof criteria (all must hold), for en-NZ and en-US:**
1. on-device recognition works offline (unchanged);
2. the fr-FR cloud control fails with `network`;
3. its speech request is visible in the NetLog and refused by the proxy;
4. the English `processLocally = false` steps make no speech request;
5. every speech URL falls inside a fr-FR control window;
6. no external socket (lsof, but see clarification 3);
7. no TCP flow, and no UDP flow moving a byte (nettop);
8. no sandbox network denial;
9. no TCP connection to a non-loopback address (NetLog);
10. no microphone access request.

**The run's preflight** uses the same three parts on two clips each: English on-device, English `processLocally = false`, and French cloud.
- It judges them only once the NetLog shows the last French speech request. The NetLog is written in order, so every earlier step is then on disk.
- The gate opens only if all the checks hold.

**3. Clarification: lsof and Chrome's IPv6 reachability check.**
- In the first proof, the NetLog showed 53 UDP `connect()` calls to `[2001:4860:4860::8888]:443` in 8 minutes: Chrome's IPv6 reachability check. It sends no datagram, and nettop saw no flow from it. These are baseline socket addresses, and the pre-registered NetLog rule already allows baseline addresses.
- lsof never caught one of these sockets in 394 snapshots, because each lives for microseconds. Over a run of several hours it might.
- Such a socket (UDP, peer exactly `[2001:4860:4860::8888]:443`) is therefore **counted separately by lsof rather than treated as an external socket**. This makes lsof consistent with the NetLog baseline.
- Any other non-loopback peer still stops the run. nettop still stops the run if any UDP flow of the tree moves a byte.

**4. Clarification: concurrency is k = 1, fixed now.**
- en-NZ and en-US run the same model, SODA en-US Models 1.5075.0 (install record).
- In the first proof, the concurrent en-US passes lost a final word in 1 of 6 clips at both k = 4 and k = 2 ("me", "city"). No final word was lost in 24 sequential recognitions.
- Because the model is the same, that finding applies to en-NZ. A lost final word under concurrency would be a systematic deletion bias.
- The DementiaBank run therefore uses **k = 1** (one page), as instructed if the en-US finding affects en-NZ. The amended proof's k = 4 and k = 2 checks are kept for the record only.
- Runtime becomes about 3.5 h per locale. en-US runs afterwards only if time allows.
- The robustness re-run (§19C.9) is also k = 1, so it now measures run-to-run repeatability at the same setting.

Everything else in §19C.1–§19C.12 is unchanged:
- the question and label;
- the request settings;
- the sample;
- the scorer and the paired rows;
- expectations C1–C4;
- the stop rules and contingencies.

## 19C.14 Deviation, 9–10 Oct 2026 — audio lead-in; one stopped start discarded; committed before the run restarts

**What happened.**
- The first en-NZ start ran at k = 1 from 21:09:28 NZDT on 9 October. Its guards were armed and its gate opened at 21:10:55. It was stopped by hand at 21:21:16, after 54 cuts. Then the five-hour usage limit intervened; work resumed at 09:26 on 10 October.
- **Why it was stopped:** throughput was 0.37× real time, against the plan's estimate of about 0.75×. The per-cut timing in the cache showed a median of 5,029 ms between `start(track)` and the clip, which equals the harness's 5,000 ms `audiostart` timeout. 15 of the 54 outputs were empty, including utterances of 8–12 reference words.
- The plan (§19C.5) says the clip begins 250 ms after the recogniser's `audiostart` event, with the track carrying silence until then. In this first harness, the track carried nothing until the clip's source was connected.

**Diagnosis**, offline, synthetic audio only, every guard on (`chrome-ondevice-lead-diagnostic_f017660.json`, 10 Oct 09:27–09:29). The six English clips were recognised on-device in two ways.

| Track before the clip | `start` event | `audiostart` | Clip begins | Mean WER |
|---|---|---|---|---|
| nothing connected (first harness) | ~5,020 ms, when the clip was connected after the 5 s fallback | 5,045–6,181 ms; **after** the clip had begun in one case (syn1, whose first word was lost) | ~5,258 ms | 0.013 |
| zero-valued keep-alive source from before `start()` | ~9 ms | ~38 ms | ~288 ms (250 ms after `audiostart`) | 0.000 |

On this path Chrome does not start the session until audio frames flow on the track. Without a source the track carries no frames, so the session started only when the clip was connected. The recogniser could then open after the speech had begun, losing its start.

**Change** (tool version `chrome-ondevice-stt 2`, so no version-1 cache is reused):
- A `ConstantSourceNode` with offset 0 feeds the destination from before `start(track)`, so the track carries digital zeros from the first frame. This realises the pre-registered timing: `audiostart` fires in about 40 ms, and the clip starts 250 ms after it.
- **New check:** a cut whose `audiostart` came after the clip began is an error (`late-audiostart`). It is retried once, like the other errors.
- Nothing else in the request changes: `continuous`, `interimResults`, `processLocally = true`, the 1,000 ms tail, the 20 s end cap and the hypothesis rule are as before.

**The stopped start is discarded.** Its 54 hypotheses could have lost the start of speech, so they are not valid under the corrected method.
- They are kept, never scored, in `data/dementiabank/cache/chrome-ondevice-en-NZ-stopped-lead5s/`, as a labelled discarded start.
- A post-hoc audit of that session's NetLog after arming found:
  - no speech URL;
  - no URL outside the baseline (only `ListAccounts`, `c2dm/register3` and `pso/ping`);
  - no socket address other than the IPv6 reachability probe.
- No guard fired before the manual stop.

**Before the run restarts:**
1. This note and the tooling are committed and pushed.
2. The offline proof (§19C.13 criteria) is re-run with the corrected harness and committed.

The run then restarts from an empty cache: en-NZ, k = 1, headless, every monitor on. The expectations, sample, scorer and stop rules are unchanged.

## 19C.15 Deviation, 10 Oct 2026 — a background stop and a baseline addition (the §19C.10 procedure)

**What happened.**
- The run restarted with the corrected harness at 09:36:03 NZDT. Its preflight passed, and the guards were armed and the gate opened at 09:36:55.
- It stopped 10 s later (09:37:05) on the proxy rule: `POST update.googleapis.com`, a request for a host outside the baseline.
- One cut had been served. Its result was not written before the stop, so the cache is empty.

**Investigation**, as §19C.10 requires before anything else:
- The request is Chrome's component-updater check, sent over plain HTTP. Its NetLog URL, `http://update.googleapis.com/service/update2/json`, is already in the baseline of `chrome-ondevice-offline-proof_3545bda.json`.
- Its proxy host key, `update.googleapis.com` (no port, because it is plain HTTP), is missing from that proof's proxy baseline for one reason: in that proof, the request happened to land inside a cloud-control window, and those windows are excluded from the proxy baseline. It was in the baseline of the earlier passing proof (`chrome-ondevice-offline-proof_e3b4142.json`).
- After arming, the session's NetLog shows **0 speech URLs**. The only URLs are the component updater's `update2/json`, over HTTPS and HTTP, both in the baseline.
- No socket of the tree had a non-loopback peer, nettop saw no flow, there was no sandbox denial and no microphone request.
- The request was refused by the local proxy, like every other.

**Disposition** (the §19C.10 rule for a non-speech background URL refused by the local proxy):
- `update.googleapis.com` is added to the proxy-host baseline through the committed file `docs/report/eval/stt/chrome-ondevice-baseline-additions.json`, which the run reads with `--baseline-add`. The tool refuses any addition that mentions speech.
- Every other stop rule is unchanged. A speech URL, an external socket or flow, a sandbox denial, a `network` error or a microphone request still abandons the run.
- The run resumes from the (empty) cache. Any later background stop is handled the same way, with its own dated entry in the additions file and in this section.

## 19C.16 Deviation, 10 Oct 2026 — a deliberate pause and the resume; committed before the run resumes

**What happened.**
- The restarted en-NZ run (§19C.15) opened its gate at 09:39:42 NZDT on 10 October: k = 1, headless, every monitor on, held to the baseline of `chrome-ondevice-offline-proof_3545bda.json` plus `chrome-ondevice-baseline-additions.json`. No guard fired.
- At 11:27 NZDT the run was **stopped deliberately** (SIGTERM to the tool) because the author had to leave. This was a clean pause, not a guard stop.
- By then 1,016 of the 2,063 cuts had a cached hypothesis: cuts 0–1015 in `references.csv` order. Throughput was 0.68× real time.
- Because the tool was killed, it did not write that session's run record. The evidence for the session is:
  - the run log shows no guard signal;
  - a post-hoc audit of the session's NetLog after arming, with the tool's own parsing rules, found **0 speech URLs** and **nothing outside the baseline**. The only URLs were the component updater (`update2/json`, over HTTP and HTTPS), `c2dm/register3`, `pso/ping` and `ListAccounts`. The only socket address was the IPv6 reachability check (§19C.13, clarification 3).

**Cache check, before resuming.** All 1,016 entries in `data/dementiabank/cache/chrome-ondevice-en-NZ/` were checked, reading counts and timings only:
- every file parses, and its key matches exactly one cut;
- every entry is tool version 2, en-NZ, Chrome 155.0.8059.39, k = 1, first pass;
- no entry has an error, and no recogniser error event of any kind;
- none ended early;
- in every entry, `audiostart` came before the clip, the session reached `end`, and `stop()` came 1,000 ms after the clip's last sample.

The seven entries written in the last minute before the pause (cuts 1009–1015, 11:26:44–11:27:22.8) are normal sessions by every one of these checks. Chrome's own log shows the next cut's session (cut 1016) still running about 5 s after the last entry was written. The pause therefore interrupted cut 1016, which left no entry, and it runs on the resume.

Four entries (cuts 337, 474, 525 and 632, written between 10:16 and 10:44) have a decoded length 0.1–4.0 s shorter than the reference `duration_s`. Their WAV files are that length. This is a property of the prepared cuts, which every recogniser received; it is not caused by the pause.

**No entry was removed.**

**The resume.** The run resumes the same day, from the cache, with the same method and settings:
- the same tool (version 2) and harness;
- the same harness profile and language pack (SODA en-US Models 1.5075.0);
- Chrome 155.0.8059.39, headless, k = 1;
- the same request settings;
- the same baseline (`chrome-ondevice-offline-proof_3545bda.json` plus the additions file);
- the same stop rules.

Before it resumes:
1. this note is committed and pushed;
2. the amended offline proof (§19C.13 criteria) is re-run with every monitor. The run resumes only if every criterion holds.

The resumed session runs its own preflight before its gate opens. Cached cuts are not re-run. The expectations, sample, scorer and stop rules are unchanged.
