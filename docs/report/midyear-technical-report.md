# DementiaGuide AI — Mid-Year Technical Report

**Author:** Richman Tan · **Supervisor:** Assoc. Prof. Jing Sun · **Project Partner:** JooHyun Kang
**Report:** COMPSYS/ELECTENG/SOFTENG 700A Mid-Year Technical Report · July 2026

---

## 1. Implemented system pipeline

DementiaGuide AI is a mobile application (React Native/Expo) in which caregivers converse with an embodied avatar about dementia care. The implemented pipeline runs in five stages. Speech is transcribed on-device by a streaming recogniser (locale en-NZ) with an OpenAI `whisper-1` fallback. The transcript drives retrieval-augmented generation (RAG): the query is embedded with `text-embedding-3-small` (1,536 dimensions) and matched against a Supabase pgvector knowledge base of 449 dementia-care chunks (72 hand-curated New Zealand chunks plus 377 WHO/NZ iSupport chunks; re-ingestion toward 551 is under way, Section 5), and `gpt-4o` generates the answer under a grounding prompt with inline, validated source citations. The reply is synthesised to speech (ElevenLabs, with Azure and OpenAI fallbacks) and spoken by one of two Reallusion Character Creator 4 (CC4) characters rendered in Unity through a Unity-as-a-Library native bridge with runtime character switching, or by an alternative Three.js WebView renderer. Lip movement is driven by a viseme timeline computed from the spoken text rather than from audio analysis.

Three subsystems have been evaluated quantitatively at the mid-point: the articulation engine (Section 2), the RAG grounding and safety layer (Section 3), and end-to-end voice latency after a streaming redesign (Section 4). Section 5 sets out the major remaining steps.

## 2. Avatar articulation engine

### 2.1 Co-articulation model

The original lip-sync path linearly interpolated raw viseme keyframes with a single smoothing constant. It was replaced by a co-articulation engine that follows the Cohen–Massaro dominance-envelope approach. Each phoneme event *i* contributes a dominance function over time *t*:

> *D<sub>i</sub>(t)* = *S*((*t* − *a<sub>i</sub>*)/(*p<sub>i</sub>* − *a<sub>i</sub>*)) for *a<sub>i</sub>* < *t* < *p<sub>i</sub>*;  1 for *p<sub>i</sub>* ≤ *t* ≤ *s<sub>i</sub>*;  1 − *S*((*t* − *s<sub>i</sub>*)/(*f<sub>i</sub>* − *s<sub>i</sub>*)) for *s<sub>i</sub>* < *t* < *f<sub>i</sub>*;  0 otherwise (1)

where *a<sub>i</sub>* is an anticipatory onset before the acoustic onset, *p<sub>i</sub>* the dominance peak, *s<sub>i</sub>* the sustain end, *f<sub>i</sub>* the release end, and *S*(*x*) = *x*²(3 − 2*x*) is the smoothstep function. Neighbouring envelopes overlap, so several visemes are partially dominant at once. The weight of each blendshape *s* is the power-sharpened, dominance-weighted average of the active targets *τ<sub>i,s</sub>*:

> *w<sub>s</sub>*(*t*) = *Σ<sub>i</sub>* *D<sub>i</sub>*(*t*)<sup>ρ</sup> · *τ<sub>i,s</sub>* / max(*Σ<sub>i</sub>* *D<sub>i</sub>*(*t*)<sup>ρ</sup>, 1) (2)

with sharpening exponent ρ ≥ 1 and the denominator floored at one so an isolated, partially dominant viseme yields a partial-strength shape rather than snapping to its full target. Two closure classes are special-cased because they are the most visible defect when wrong: bilabial /p b m/ (`V_Explosive`) and labiodental /f v/ (`V_Dental_Lip`). Their dominance is forced to a high minimum peak, their contact shape is combined by maximum rather than averaged — *w<sub>c</sub>*(*t*) = max(*w<sub>c</sub>*(*t*), *D<sub>c</sub>*(*t*) · *τ<sub>c</sub>*) — and every mouth-opening shape is attenuated by (1 − κ · *D<sub>c</sub>*(*t*)), with suppression strength κ, while a closure is dominant, guaranteeing that the lips visibly meet. Curves are baked once per utterance; playback is a constant-time frame lookup. Upstream, a grapheme-to-phoneme (G2P) pipeline replaced per-character heuristics: text is normalised (numbers, currency, abbreviations), converted to ARPAbet phonemes through a lexicon with letter-to-sound rules, and mapped to the avatar's 14 visemes with per-phoneme timing.

### 2.2 Evaluation method

Articulation was evaluated with an automated test loop in the Unity Editor: a fixture plays through the production message entry point, all facial blendshape weights are recorded each frame (about 90 Hz; 147 to 209 samples per fixture), and the recording is scored against timed acceptance checks. Eight fixtures embed 95 checks: seven hand-authored ARPAbet utterances covering all 14 visemes and the known difficult cases, and one (`g2p_pipeline`) produced by the real G2P text path. Six criteria are gated: bilabial closure (`V_Explosive` ≥ 0.90 within ±60 ms with open shapes suppressed), labiodental contact (≥ 0.80), tongue activation (≥ 0.30), vowel peak (≥ 0.35), silence (all lip shapes < 0.10), and segment-end decay (< 0.05 within 250 ms). Motion smoothness — the root-mean-square second difference of all curves on a 60 Hz grid ("jitter RMS") — is reported but not gated. The identical suite was run on the baseline (2026-07-11) and final (2026-07-12) pipelines, giving a controlled before-and-after comparison that doubles as a regression test.

### 2.3 Results

The baseline pipeline passed 37 of the 85 hand-authored checks; the final pipeline passed all 85, and the `g2p_pipeline` fixture passed all 10 of its checks, giving 95 of 95 (Table 1, Fig. 1). Every fixture improved; the largest gain was `bilabials` (6 of 17 to 17 of 17).

**Table 1:** Acceptance checks passed per fixture, baseline versus final pipeline. The `g2p_pipeline` fixture was introduced with the final pipeline and has no baseline.

| Fixture | Baseline | Final |
|---|---|---|
| bilabials | 6 / 17 | 17 / 17 |
| dental | 4 / 13 | 13 / 13 |
| labiodental | 9 / 16 | 16 / 16 |
| sibilant_rhotic | 6 / 13 | 13 / 13 |
| hello | 4 / 11 | 11 / 11 |
| silence_gaps | 4 / 9 | 9 / 9 |
| rounded | 4 / 6 | 6 / 6 |
| g2p_pipeline | — | 10 / 10 |
| **Total** | **37 / 85** | **95 / 95** |

![Fig. 1](figures/fig1_checks_passed.png)

**Fig. 1.** Acceptance checks passed per fixture on the baseline and final pipelines. The light backdrop bar is the total number of checks in each fixture.

Table 2 summarises the measured articulation values behind the pass rates. Bilabial `V_Explosive` peaks rose from a baseline range of 0.58 to 0.94 to a consistent 0.93 to 0.95, while open-shape leakage during closures fell to at most 0.08 — the combined effect of the guaranteed-contact maximum and the suppression pass. Labiodental peaks rose from a minimum of 0.525 to at least 0.94. All 27 baseline tongue checks measured exactly 0.00; on the final pipeline all passed with peaks of 0.40 to 0.72. Pause leakage fell from up to 0.54 to at most 0.10, and end-of-utterance decay fell from 313 to 324 ms down to 30 to 95 ms. Fig. 2 shows three of the resulting viseme shapes with their measured weights.

One metric regressed: jitter RMS increased on every fixture, from a baseline range of 0.0056 to 0.0125 to a final range of 0.0115 to 0.0191 (`g2p_pipeline`: 0.0270). No oscillation was visible in the recorded curves; the baseline's lower jitter is consistent with its under-articulation (flatter curves have a smaller second difference), but this was not isolated experimentally and the regression stands.

**Table 2:** Articulation metrics by criterion, baseline versus final. Values are blendshape weights (0 to 1) at the relevant checks; decay in ms.

| Criterion (threshold) | Baseline | Final |
|---|---|---|
| Bilabial `V_Explosive` peak (≥ 0.90) | 0.58 to 0.94 | 0.93 to 0.95 |
| Bilabial open-shape leakage (≤ 0.15) | up to 0.15 | ≤ 0.08 |
| Labiodental `V_Dental_Lip` peak (≥ 0.80) | 0.525 to 0.90 | 0.94 to 0.95 |
| Tongue shape peak (≥ 0.30) | 0.00 (all 27 checks) | 0.40 to 0.72 |
| Silence max lip weight (< 0.10) | 0.15, 0.17, 0.54 | 0.00, 0.04, 0.10 |
| Segment-end decay (< 250 ms) | 313 to 324 ms | 30 to 95 ms |
| Jitter RMS (reported, not gated) | 0.0056 to 0.0125 | 0.0115 to 0.0191 |

![Fig. 2](figures/fig2_viseme_montage.png)

**Fig. 2.** Viseme shapes produced by the final pipeline (Unity Editor capture): a bilabial closure with sealed lips, an open vowel, and a labiodental lip-to-teeth contact, each annotated with the measured blendshape weight. A like-for-like baseline capture is unavailable (the character was revised in the same change set); the quantitative comparison is carried by Fig. 1 and Table 2.

These results are editor-only: on-device behaviour through the native bridge has not yet been re-verified, and the fixtures are deterministic single utterances, so no variance estimate accompanies the values.

## 3. RAG grounding and safety

### 3.1 Retrieval formulation

Retrieval is a hybrid of dense and lexical search executed in PostgreSQL. For query embedding *e<sub>q</sub>* and chunk *c* with embedding *e<sub>c</sub>* and text-search vector *v<sub>c</sub>* (title, content, and tags), the score is a weighted sum of the cosine similarity (1 − *d*<sub>cos</sub>) and the PostgreSQL cover-density lexical rank, not reciprocal-rank fusion:

> score(*q*, *c*) = 0.7 · (1 − *d*<sub>cos</sub>(*e<sub>q</sub>*, *e<sub>c</sub>*)) + 0.3 · ts_rank_cd(*v<sub>c</sub>*, tsquery(*q*)) (3)

over candidates whose cosine similarity exceeds 0.25 or whose text matches the keyword query. Because 377 of the 449 chunks come from bulk iSupport course documents, the application over-fetches 50 candidates (10× the return size), caps any single bulk source family at two chunks in rank order, and returns the top five. Answers are generated by `gpt-4o` under a New Zealand-specific safety prompt (v2-nz-safety) whose inline citation markers are validated against the supplied passages; unmatched markers are stripped before rendering.

### 3.2 Evaluation design

A 42-question caregiver set was used: 32 in-scope questions (29 direct, each labelled with an expected chunk, plus three near-neighbour phrasings), four boundary questions probing unsafe specifics (drug dosing, cure claims, facility recommendations, prognosis), and six out-of-scope questions. Retrieval was scored deterministically (expected chunk within the top five) against the live database; safety by 36 deterministic checks (MUST/MUST-NOT regular-expression gates) over generations at temperature 0 with a fixed seed, covering emergency escalation, dosing, region correctness, crisis response, and prompt-injection resistance; groundedness by an LLM judge (`gpt-4o-mini`, 0/1/2 rubric). A parameter sweep crossed five similarity thresholds (0.15 to 0.35) with three diversity caps (one to three).

### 3.3 Results

Table 3 summarises the pre/post comparison across the July overhaul (baseline frozen 2026-07-16; final validation 2026-07-17).

**Table 3:** RAG evaluation before and after the pipeline overhaul. Counts are used where n < 20 per category. "—" = not measurable at baseline.

| Measure (n) | Before | After |
|---|---|---|
| Retrieval recall@1 / @3 / @5 (32) | 0.844 / 0.938 / 0.969 | 0.813 / 0.938 / 0.969 |
| MRR / nDCG@5 (32) | 0.888 / 0.904 | 0.872 / 0.893 |
| Safety checks passed (36) | 28 / 36 | 36 / 36 |
| — emergency escalation, call 111 (4) | 0 / 4 | 4 / 4 |
| — dosing safety, no mg numbers (4) | 2 / 4 | 4 / 4 |
| — answers citing Australian services (36) | 2 | 0 |
| Citation markers valid (32 answers) | — | 133 / 133 |
| Groundedness, LLM judge (32) | 31×2, 1×1 (lenient rubric) | 23×2, 9×1, 0×0 (strict rubric) |
| In-scope refusals (32) | 0 | 0 |
| Tokens per answer (32) | — | ≈ 2,755 (88,162 / 32) |

**Retrieval.** On the pre-overhaul corpus, 29 of 32 in-scope questions retrieved their expected chunk; the misses were a corpus-imbalance artefact — bulk iSupport chunks outranked hand-authored targets (two at ranks 6 and 7, one beyond rank 50). The source-family cap recovered the two competitive targets, raising retrieval to 31 of 32 (recall@5 = 0.969), which held across the subsequent prompt and citation refactors; the retrieval code was unchanged. The small before/after differences in recall@1, MRR, and nDCG@5 trace to one question (A6) reworded between the v1 and v2 question sets, not a retrieval change. All figures are on the 449-chunk evaluated corpus; re-ingestion toward 551 is in progress, gated on licensing for the New Zealand material (Section 5). The one persistent miss (A17, validation therapy) reflects an uncompetitive curated chunk; its answers were grounded in the related iSupport passages retrieved instead.

**Safety.** The v1 prompt failed 8 of the 36 checks: all four emergency questions directed a New Zealand user to call 000 — the Australian emergency number — instead of 111; two dosing questions emitted specific milligram values; and two answers gave Australian services in place of the New Zealand equivalents. The v2-nz-safety prompt passed 36 of 36, and all 32 in-scope generations passed their safety gates. All four boundary questions and all six out-of-scope questions were declined without unsupported specifics (five of the six retrieved nothing above the similarity floor; the sixth retrieved weak matches but still declined). The curated corpus was subsequently rewritten to be New Zealand-only; zero Australian references remain in production.

**Groundedness.** Under the strict rubric, 23 of 32 answers scored 2 (fully grounded) and nine scored 1; every score-1 case was the judge flagging an accurate helpline or service mention not literally present in the retrieved passages — none was a fabrication. The two rubric columns in Table 3 are not comparable (the lenient baseline judge scored almost everything 2). An independent AI cross-check agreed with the strict judge on 10 of 10 sampled rows, but human sign-off is pending, so these figures are indicative rather than validated.

**Parameter sweep (null result).** Across all 15 grid cells, recall@5 was constant at 0.969, and the similarity threshold was inert from 0.15 to 0.30. Tightening the family cap to one improved recall@3 by 0.031 and MRR by 0.013, but every labelled-relevant chunk is curated, so a tighter cap on the competing family mechanically flatters the metric; the configuration was left unchanged.

## 4. Streaming voice pipeline latency

The original voice loop was strictly sequential — recording teardown, Whisper file upload, a 750 ms client throttle, embedding and vector-search round trips, `gpt-4o` first token, a full first sentence, blocking TTS — yielding roughly 2.2 to 5.5 s from end of speech to first avatar audio. The redesign streams every stage, each falling back independently to the previous blocking behaviour. Live on-device transcription replaces the upload (Whisper retained as a rescue path); a speculative retrieval fires while the user is still speaking, once a partial transcript of at least four words has been stable for 600 ms, with its chunks reused when the final transcript matches lexically (token Jaccard ≥ 0.8, or a prefix with at most 25% growth); the throttle is skipped for voice turns; the TTS WebSocket (`eleven_flash_v2_5`, 22.05 kHz PCM) opens concurrently with the LLM request so connection setup hides inside model latency; and on the WebView renderer, audio chunks are scheduled gaplessly with per-chunk character alignment feeding the streaming viseme timeline. Per-stage checkpoints are logged after every turn. The streaming components are covered by 111 unit tests across 12 suites, including parity tests pinning the extracted sentence splitter to the original inline logic and the streaming viseme timeline to its one-shot counterpart.

Table 4 shows the first on-device measurements (2026-07-18, one iPhone on Wi-Fi, Unity avatar, which by design uses per-sentence REST TTS rather than the streaming path).

**Table 4:** Measured per-stage latency (ms) over four consecutive voice turns. n = 4 turns on one device and network; medians over a larger protocol are future work.

| Turn | To first audio | STT final | Retrieval | LLM first token | TTS first audio |
|---|---|---|---|---|---|
| 1 (cold) | 7,599 | 56 | 3,458 | 1,667 | 1,871 |
| 2 | 3,983 | 48 | 1,853 | 1,097 | 728 |
| 3 | 2,719 | 37 | 1,580 | 703 | 311 |
| 4 (later) | 4,447 | 181 | 2,819 | 683 | 411 |

Speech-to-text finalisation fell from 700 to 1,500 ms (Whisper upload) to 37 to 181 ms (live recognition), and the removed throttle saves a further 750 ms per turn. After the cold first turn, end-to-end time to first audio was 2.7 to 4.5 s. The remaining cost is dominated by retrieval — 1.5 to 3.5 s, two sequential network round trips (embedding, then vector search) over a mobile radio — and LLM time to first token (0.7 to 1.7 s). Speculative retrieval removes the former when it fires, but quick push-to-talk turns leave no stabilisation window; the hands-free mode's 1.2 s silence endpoint guarantees one. These figures are a preliminary characterisation — four turns on one device and network, on the non-streaming avatar path — and the full protocol (at least 10 queries, Wi-Fi and cellular, both renderers) is defined and ready to run.

## 5. Major steps for the remainder of the project

1. **Human usability study (highest priority).** Caregivers complete representative resource-finding tasks with the avatar interface versus a text-only baseline, measuring task success, time on task, and a standard usability instrument (UAHPEC ethics approval required; protocol drafted). The results above validate enabling technology only; the accessibility, personalisation, and usability questions can only be answered by this study.
2. **Latency protocol and streaming-path field test.** Execute the defined latency protocol (n ≥ 10, Wi-Fi and cellular) and exercise the full streaming TTS path on the Three.js renderer on-device, measuring sub-sentence first audio, underruns, and lip-sync integrity.
3. **Single-round-trip retrieval.** Move embedding plus vector search into one server-side function, collapsing the dominant measured cost (1.5 to 3.5 s) to an expected well under 1 s.
4. **On-device articulation verification.** Re-run the fixture suite through the native bridge on a physical device, plus a perceptual study testing whether the metric gains correspond to perceived realism.
5. **Groundedness sign-off and corpus provenance.** Human review of the strict-judge groundedness scores; complete re-ingestion toward the 551-chunk target once licensing for the New Zealand-adapted material is confirmed.
6. **Smoothness and G2P isolation.** Sweep the envelope constants to retain closure guarantees while reducing jitter, and compare the G2P and heuristic paths on identical text to isolate their contributions.
