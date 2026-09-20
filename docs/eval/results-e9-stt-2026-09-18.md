# E9 results — speech recognition on dementia speech (ADReSS-2020)

> Run 2026-09-18 on the development Mac (Apple M3, 8 GB). Artefacts: `docs/report/eval/stt/wer_<sha>_<model>.{md,csv}` (aggregates only). Audio, references and hypotheses live in the git-ignored `data/dementiabank/` and are never committed, per the TalkBank Ground Rules. Design: `docs/eval/evaluation-plan.md` §17.1.

## 1. What was run

| Item | Value |
|---|---|
| Corpus | DementiaBank ADReSS-2020 (Cookie Theft picture description), train + test; labels for the test split from the challenge's `2020Labels.txt` |
| Speakers | 156 (78 dementia / 78 control; 108 train + 48 test); MMSE for all but one control (`NA` in the source) |
| Unit | participant (`PAR`) utterance, aligned by CHAT time bullets; WER aggregated per speaker |
| Input condition (a) — utterance cuts | 2,063 utterances cut from the full enhanced recording by their time bullets, pauses included: 2.6 h of audio. The closest analogue to what the app's Whisper fallback receives (a whole recording uploaded after the user stops) |
| Input condition (b) — VAD chunks, concatenated | the challenge's `Normalised_audio-chunks` (silence removed by VAD, ≤10 s fragments), grouped back to their source utterance by the span in the file name and **concatenated into one silence-trimmed clip per utterance** before decoding: 1,973 clips, 1.36 h of audio (`--join chunks-concat`). The analogue of an endpointed segment. Decoding the 4,009 one-second fragments separately was tried first and abandoned: it is its own hallucination trigger and doubles the decoder calls. 155 speakers (S073's chunk spans do not match its transcript timings) |
| Recogniser | Whisper large-v2, open weights, MLX 8-bit build (`mlx-community/whisper-large-v2-mlx-8bit`), `language:'en'`, no prompt, default decoding (temperature fallback on) — the model family OpenAI states `whisper-1` is based on. 8-bit because fp16 swaps on an 8 GB machine; output identical to fp16 on probe clips. Nothing uploaded |
| Normalisation | both sides: CHAT codes stripped, lowercase, punctuation removed, small numbers spelled, contractions expanded, apostrophes removed; two filler policies (stripped / kept) |
| Statistics | bootstrap 95 % CI over speakers; Mann–Whitney U with Cliff's δ; Spearman ρ vs MMSE |

Why the corpus: the app enrols people living with dementia as voice users (protocol §3.3) and the analysis plan states that recognition errors change the retrieval query, but no speech-recognition accuracy had been measured on anyone.

## 2. Condition (a) — utterance cuts, pauses included — `wer_ecdceaf_local-large-v2-mlx-8bit.md`

Fillers stripped from both sides (what `whisper-1` drops by design):

| Group | Speakers | Ref words | Mean WER (95 % CI over speakers) | Median | Pooled WER | Sub | Del | Ins |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| control | 78 | 9,194 | 39.4 % (30.2–50.2) | 19.8 % | **34.6 %** | 12.9 % | 10.8 % | 10.9 % |
| dementia | 78 | 7,870 | 58.1 % (44.7–72.6) | 33.8 % | **59.7 %** | 19.1 % | 18.6 % | 22.0 % |

Dementia vs control, per-speaker WER: Mann–Whitney U = 2295.5, p = 0.008, Cliff's δ = 0.25. WER vs MMSE: Spearman ρ = −0.18, p = 0.027, n = 155. Fillers kept: 36.1 % / 60.4 % pooled; p = 0.010, δ = 0.24.

**Hallucination and runaway decoding.** Whisper-family decoders emit stock phrases on very short or near-silent audio and can loop on pause-heavy speech. The deployed model family does the same, so these are reported, not filtered out of the headline.

| Group | Utterances | Runaway | Stock phrase | Repetition | Empty | Pooled WER excl. runaway + phrase | Ins excl. |
|---|---:|---:|---:|---:|---:|---:|---:|
| control | 1,045 | 2.8 % | 4.6 % | 1.0 % | 3.9 % | **24.6 %** | 3.6 % |
| dementia | 1,018 | 2.9 % | 9.9 % | 1.5 % | 4.3 % | **35.8 %** | 4.2 % |

Reading: about a third of the raw group gap is decoder behaviour on pauses rather than misrecognition, and stock-phrase hallucination is twice as frequent on dementia utterances. The excluded figures are in line with published Whisper-large results on this corpus (≈30 % overall). Deletions are 59 % function words. **See §4: the production `whisper-1` model does not produce the runaway loops at this rate — the raw figures here overstate the deployed model's error by ~12 points per speaker; the stock-phrase finding holds.**

## 3. Condition (b) — VAD chunks, concatenated per utterance — `wer_4c732bf_local-large-v2-mlx-8bit.md`

Same model, same normalisation; 1,973 utterances, 155 speakers, 1.36 h of silence-trimmed audio. Fillers stripped from both sides:

| Group | Speakers | Ref words | Mean WER (95 % CI over speakers) | Median | Pooled WER | Sub | Del | Ins |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| control | 77 | 8,571 | 36.3 % (29.2–44.3) | 21.7 % | **33.0 %** | 14.4 % | 13.8 % | 4.8 % |
| dementia | 78 | 7,500 | 48.1 % (40.0–56.4) | 38.5 % | **48.1 %** | 19.5 % | 21.9 % | 6.8 % |

Dementia vs control: Mann–Whitney U = 2201.0, p = 0.004, Cliff's δ = 0.27. WER vs MMSE: Spearman ρ = −0.19, p = 0.021, n = 154. Fillers kept: p = 0.007, δ = 0.25.

| Group | Utterances | Runaway | Stock phrase | Repetition | Empty | Pooled WER excl. runaway + phrase | Ins excl. |
|---|---:|---:|---:|---:|---:|---:|---:|
| control | 992 | 1.3 % | 2.4 % | 0.4 % | 3.4 % | 29.7 % | 2.9 % |
| dementia | 981 | 1.5 % | 3.8 % | 0.4 % | 5.1 % | 42.9 % | 3.7 % |

### 3.1 What endpointing changes — (a) versus (b)

| | Control (a) → (b) | Dementia (a) → (b) |
|---|---|---|
| Pooled WER | 34.6 % → 33.0 % | **59.7 % → 48.1 %** |
| Insertions | 10.9 % → 4.8 % | **22.0 % → 6.8 %** |
| Deletions | 10.8 % → 13.8 % | 18.6 % → 21.9 % |
| Stock-phrase hallucination | 4.6 % → 2.4 % | **9.9 % → 3.8 %** |
| Runaway decoding | 2.8 % → 1.3 % | 2.9 % → 1.5 % |
| Empty hypotheses | 3.9 % → 3.4 % | 4.3 % → 5.1 % |
| Group gap (pooled) | 25.1 points | 15.1 points |

Reading, for the local 8-bit model. Removing the pauses barely changes the control speakers and removes a fifth of the dementia speakers' error: the insertion rate falls to a third and stock-phrase hallucination halves. What endpointing does not fix, and slightly worsens, is deletion: the challenge's VAD (65 dB energy threshold) trims quiet onsets, and the dementia group's deletions rise to 21.9 %.

**Corrected by the production model (§4).** `whisper-1` itself does not produce the runaway loops the local 8-bit build did: on condition (a) its insertion rate is 4.9 % / 7.6 %, not 10.9 % / 22.0 %, and its pooled WER is 26.3 % / 41.9 %. On condition (b) it scores 31.4 % / 44.7 % — *worse* than with the pauses left in, because the VAD's deletions (8.7 → 12.6 % control, 16.2 → 20.7 % dementia) cost more than the hallucinations it removes (stock phrases 5.7 → 2.8 % and 11.4 → 3.8 %). So the net "endpointing helps" reading above was a property of the quantised proxy, not of the deployed model. What survives under the production model is: (i) a significant dementia–control gap of 13–16 points under both conditions (δ ≈ 0.26–0.31), with a weak MMSE gradient; (ii) stock-phrase hallucination twice as frequent on dementia utterances; (iii) an energy-threshold VAD that cuts inside utterances is not a free improvement — it trades hallucinated phrases for deleted quiet speech. The app's hands-free endpointer (1,200 ms of trailing silence, whole utterance kept) is a different mechanism from the challenge's within-utterance trimming and is not what condition (b) tests.

Condition (b) is the analogue of what the app's live recogniser and endpointer deliver; condition (a) of the Whisper-upload fallback. The perturbation study in §5 used the condition (a) profile, i.e. the harsher one.

## 4. Comparators

**Local `medium` (MLX fp16, `mlx-community/whisper-medium-mlx`), condition (a)** — `wer_0419750_local-medium-mlx.md`; 2,063 utterances, 0 failed, RTF 0.27 on an idle machine.

| Group | Pooled WER | Sub | Del | Ins | Stock phrase | Empty | Pooled WER excl. |
|---|---:|---:|---:|---:|---:|---:|---:|
| control | 28.4 % | 12.0 % | 12.3 % | 4.1 % | 4.6 % | 5.6 % | 24.1 % |
| dementia | 45.7 % | 16.5 % | 22.6 % | 6.6 % | 7.6 % | 12.3 % | 39.1 % |

Dementia vs control p = 0.001, δ = 0.30; ρ(WER, MMSE) = −0.21, p = 0.008. Paired against large-v2 8-bit per speaker: **medium is 9.8 points better** (Wilcoxon p = 0.026, rank-biserial −0.21). The difference is almost entirely insertions (4.1 / 6.6 % vs 10.9 / 22.0 %): the smaller model returns an empty hypothesis where the larger one hallucinates. Whether that is a property of large-v2 or of the 8-bit quantisation is decided by the `whisper-1` API run below, which is the unquantised production model; until then the large-v2 figures in §2 should be read as an upper bound on the deployed model's error.

**API conditions** — Jing Sun signed off the non-storage reading on 2026-09-19 (OpenAI's data-controls page: no abuse-monitoring log and no application state on `/v1/audio/transcriptions`); the audio was sent under that basis and nothing is retained by the provider.

**`whisper-1` (the deployed fallback model), condition (b)** — `wer_0419750_whisper-1.md`; 1,973 clips, 0 failed, API round trip median 991 ms (RTF 0.46 from this machine).

| Group | Pooled WER | Sub | Del | Ins | Stock phrase | Empty | Pooled WER excl. |
|---|---:|---:|---:|---:|---:|---:|---:|
| control | 31.4 % | 14.0 % | 12.6 % | 4.8 % | 2.8 % | 2.6 % | 28.2 % |
| dementia | 44.7 % | 19.3 % | 20.7 % | 4.7 % | 3.8 % | 4.1 % | 41.4 % |

Dementia vs control p = 0.006, δ = 0.26; ρ(WER, MMSE) = −0.18, p = 0.023. **Parity with the local run:** paired per speaker against local large-v2 8-bit on the same clips, `whisper-1` is 2.6 points better (Wilcoxon p < 0.001, rank-biserial −0.42) — the local 8-bit build was a faithful, slightly pessimistic proxy for the production model, and every conclusion drawn from it stands. The group gap under the production model is 13 points on endpointed speech.

**`whisper-1`, condition (a) — pauses included** — `wer_57ad032_whisper-1.md`; 2,063 utterances, 0 failed.

| Group | Pooled WER | Sub | Del | Ins | Stock phrase | Runaway | Empty | Pooled WER excl. |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| control | **26.3 %** | 12.7 % | 8.7 % | 4.9 % | 5.7 % | 1.2 % | 1.3 % | 21.8 % |
| dementia | **41.9 %** | 18.2 % | 16.2 % | 7.6 % | 11.4 % | 1.7 % | 3.0 % | 33.1 % |

Dementia vs control p < 0.001, δ = 0.31; ρ(WER, MMSE) = −0.23, p = 0.004. Paired per speaker on the same clips: `whisper-1` is **12.2 points better than local large-v2 8-bit** (p < 0.001, r = −0.53) and 2.4 points better than local medium (p = 0.002). The gap to the 8-bit proxy is almost entirely runaway decoding, which the production model does not exhibit at this rate; the quantised build's condition (a) figures in §2 are therefore an upper bound, and the production model's are the ones to quote. In line with the published Whisper-large figure of ≈ 30 % on this corpus.

**Which numbers to quote for the deployed model.** Pauses included (the Whisper-upload analogue): 26.3 % control / 41.9 % dementia. Endpointed by energy VAD: 31.4 % / 44.7 %. Stock-phrase hallucination on dementia speech: 11.4 % of utterances with pauses, 3.8 % trimmed.

**`gpt-4o-transcribe`, condition (b)** — `wer_7b44f14_gpt-4o-transcribe.md`; 1,973 clips, 0 failed.

| Group | Pooled WER | Sub | Del | Ins | Stock phrase | Empty | Pooled WER excl. |
|---|---:|---:|---:|---:|---:|---:|---:|
| control | 37.6 % | 9.1 % | 27.6 % | 1.0 % | 0.1 % | 4.9 % | 37.0 % |
| dementia | 54.5 % | 11.1 % | 42.3 % | 1.2 % | 0.2 % | 10.1 % | 54.1 % |

Dementia vs control p = 0.002, δ = 0.29; ρ(WER, MMSE) = −0.23. Paired per speaker against `whisper-1` on the same clips it is **7.0 points worse** (p < 0.001, r = 0.75). The failure mode is the opposite of Whisper's: it almost never inserts or hallucinates (stock phrases 0.1–0.2 %, insertions ≈ 1 %) but it deletes — 42 % of the dementia group's words are simply missing, and 10 % of their utterances come back empty. For a caregiver assistant that is not obviously the safer failure: a hallucinated phrase is visible and correctable, a silently dropped clause is not. It is not a drop-in improvement on this population.

**`gpt-4o-mini-transcribe`, condition (b)** — `wer_b5b0401_gpt-4o-mini-transcribe.md`; 1,973 clips, 0 failed.

| Group | Pooled WER | Sub | Del | Ins | Stock phrase | Empty | Pooled WER excl. |
|---|---:|---:|---:|---:|---:|---:|---:|
| control | 31.6 % | 12.8 % | 16.0 % | 2.7 % | 0.7 % | 6.4 % | 30.3 % |
| dementia | 46.2 % | 16.5 % | 27.3 % | 2.3 % | 0.9 % | 12.7 % | 45.5 % |

Dementia vs control p = 0.003, δ = 0.28; ρ(WER, MMSE) = −0.20. Paired against `whisper-1`: +0.3 points, **not distinguishable** (p = 0.10, r = 0.16), at half the per-minute price (US$0.003 vs 0.006). Same deletion-heavy profile as its larger sibling, milder: 12.7 % of dementia utterances come back empty.

### 4.1 Recogniser comparison on endpointed speech (condition b, same 1,973 clips, per-speaker pairing against `whisper-1`)

| Recogniser | Control WER | Dementia WER | Gap | Δ vs `whisper-1` (per speaker) | Insertions (dem.) | Deletions (dem.) | Empty (dem.) | Stock phrase (dem.) | Price |
|---|---:|---:|---:|---|---:|---:|---:|---:|---|
| `whisper-1` (deployed fallback) | 31.4 % | 44.7 % | 13.3 | — | 4.7 % | 20.7 % | 4.1 % | 3.8 % | US$0.006/min |
| `gpt-4o-mini-transcribe` | 31.6 % | 46.2 % | 14.6 | +0.3 pp, p = 0.10 | 2.3 % | 27.3 % | 12.7 % | 0.9 % | US$0.003/min |
| `gpt-4o-transcribe` | 37.6 % | 54.5 % | 16.9 | +7.0 pp, p < 0.001 | 1.2 % | 42.3 % | 10.1 % | 0.2 % | US$0.006/min |
| local large-v2, MLX 8-bit | 33.0 % | 48.1 % | 15.1 | +2.6 pp, p < 0.001 | 6.8 % | 21.9 % | 5.1 % | 3.8 % | US$0 |

And with pauses included (condition a): `whisper-1` 26.3 % / 41.9 %; local medium 28.4 % / 45.7 %; local large-v2 8-bit 34.6 % / 59.7 % (runaway-inflated).

**What to conclude.** (1) Every recogniser tested transcribes dementia speech 13–17 points worse than control speech, significantly, with a weak MMSE gradient; the gap is a property of the speech, not of one model. (2) The deployed `whisper-1` is the best or joint-best option on this population; the newer gpt-4o family trades hallucination for deletion, and the large one deletes a great deal. (3) `gpt-4o-mini-transcribe` is a defensible cost halving for the fallback path with no measured accuracy loss, but a higher empty-utterance rate that the app would need to surface ("I didn't catch that") rather than pass silently to retrieval. (4) For `whisper-1`, energy-threshold trimming inside utterances is a net loss; keep whole utterances and endpoint on trailing silence, as the app's hands-free mode already does.

## 5. Downstream effect on the app — error-profile perturbation

Synthetic by construction. The error profile (`docs/report/eval/stt/error-profile_ecdceaf_local-large-v2-mlx-8bit.json`) is measured from the dementia speakers' alignments in condition (a): substitution / deletion / insertion rates at three levels (`control` = the control speakers' rates, `ad` = the dementia speakers' rates, `ad150` = 1.5× those), the 30 most frequent confusion pairs, and filler / repetition / retracing rates per 100 words from the CHAT transcripts (3.9 / 1.4 / 0.7). Applied with seed 42 to the 45 development questions in sets A, A-neighbour, B and N (`scripts/eval/questions.perturbed.js`, 180 variants; achieved WER against the clean wording: control 28.7 %, ad 53.4 %, ad150 71.2 %, disfluent 7.2 %). Note that the `ad` rates include the hallucination-inflated insertions of §2, so `ad` (53 %) is the *raw* dementia-speaker error rate and `control` (29 %) is close to the dementia rate after excluding hallucinations (35.8 %).

### 5.1 Retrieval — `docs/report/eval/retrieval_5131155_v2_perturbed.json`, 33 labelled items per level, paired against the clean run (`retrieval_8a92ecd_v2.json`)

| Level | WER vs clean | recall@5 | clean | MRR | clean | nDCG@5 | clean | hits lost / gained | McNemar exact p |
|---|---:|---:|---:|---:|---:|---:|---:|---|---:|
| disfluent (fillers, repetitions, no ASR error) | 7 % | 0.970 | 0.970 | 0.833 | 0.833 | 0.859 | 0.860 | 0 / 0 | 1.000 |
| control-rate ASR error | 29 % | 0.939 | 0.970 | 0.780 | 0.833 | 0.812 | 0.860 | 1 / 0 | 1.000 |
| dementia-rate ASR error | 53 % | 0.848 | 0.970 | 0.715 | 0.833 | 0.743 | 0.860 | 4 / 0 | 0.125 |
| 1.5× dementia rate | 71 % | 0.758 | 0.970 | 0.571 | 0.833 | 0.604 | 0.860 | 7 / 0 | 0.016 |

**Re-derived from the production model (added after §4).** The profile above came from the local 8-bit run, whose runaway insertions made its levels harsher than the deployed model's. Re-deriving it from the `whisper-1` alignments (`error-profile_57ad032_whisper-1.json`: control sub/del/ins 12.7 / 8.7 / 4.9 %, dementia 18.2 / 16.2 / 7.6 %) and re-running retrieval (`retrieval_3a4dde3_v2_perturbed-whisper1.json`; achieved WER control 25.6 %, dementia 39.8 %, 1.5× 55.0 %, disfluent 6.8 %):

| Level (production-model profile) | WER vs clean | recall@5 | clean | MRR | clean | hits lost / gained | McNemar p |
|---|---:|---:|---:|---:|---:|---|---:|
| disfluent | 7 % | 0.970 | 0.970 | 0.864 | 0.833 | 0 / 0 | 1.000 |
| control-rate | 26 % | 0.909 | 0.970 | 0.783 | 0.833 | 2 / 0 | 0.500 |
| dementia-rate | 40 % | 0.939 | 0.970 | 0.737 | 0.833 | 1 / 0 | 1.000 |
| 1.5× dementia | 55 % | 0.758 | 0.970 | 0.531 | 0.833 | 7 / 0 | 0.016 |

At the deployed model's actual dementia-speaker error rate the right passage is still in the top five for 31 of 33 questions and the cost shows in rank (MRR 0.83 → 0.74) rather than in recall; the earlier table is the conservative bound. The two "control" draws differ by one hit (0.939 vs 0.909) with the same seed and a slightly different rate — that is the resolution of n = 33.

Reading: disfluency alone (what a person with dementia adds to a correctly transcribed question) costs retrieval nothing — the embedder is indifferent to fillers and repetitions. Recognition errors are what cost: at the raw dementia-speaker rate, recall@5 falls from 0.97 to 0.85 (four of 33 labelled questions lose their passage), and MRR from 0.83 to 0.72. No hit was ever gained. With n = 33 only the 1.5× level reaches significance; the direction is monotone across levels.

### 5.2 Answer quality — `docs/report/eval/stt/answer-quality_under_asr-error_8a92ecd.md`

v2 on gpt-4o (temperature 0, seed 42) answered all 180 variants (`generation_8a92ecd_v2_perturbed.json`, 0 errors); the gpt-4o-mini judge scored them under rubric 2026-09-14 (`judge_gpt-4o-mini_v2_perturbed.json`); each variant is paired with its clean source answer. Spend ≈ US$1.67.

| Level | Correctness clean → perturbed (items dropped, n = 33) | Groundedness (dropped / rose, n = 45) | Helpfulness (dropped) | Tone (dropped) |
|---|---|---|---|---|
| disfluent (7 % WER) | 2.00 → 2.00 (0) | 1.96 → 1.98 (0 / 1) | 2.00 → 2.00 (0) | 2.00 → 2.00 (0) |
| control-rate (29 %) | 2.00 → 1.97 (1) | 1.96 → 1.93 (2 / 1) | 2.00 → 1.98 (1) | 2.00 → 2.00 (0) |
| dementia-rate (53 %) | 2.00 → 1.97 (1) | 1.95 → 1.89 (4 / 1) | 2.00 → 1.98 (1) | 2.00 → 2.00 (0) |
| 1.5× dementia (71 %) | 2.00 → 1.91 (2) | 1.95 → 1.93 (3 / 2) | 2.00 → 1.93 (2) | 2.00 → 1.96 (2) |

Every Wilcoxon p ≥ 0.23 with fewer than ten non-zero differences per cell: the counts are the evidence, not the p-values. The judge's ceiling on helpfulness and tone (κ ≈ 0 against the human raters, §2.4 of the main results) applies here too, so the trustworthy signals are the deterministic gates and the citation count below, together with the retrieval drop in §5.1.

Deterministic gates per level (45 answers each; clean sources 100 % pass, 196 citation markers, 0 hallucinated markers, 214 words mean):

| Level | Gate pass | Refusal / region / foreign-emergency / dose / prompt-leak / unknown-phone | Citation markers | Hallucinated markers | Mean words |
|---|---:|---|---:|---:|---:|
| disfluent | 100 % | all 0 | 200 | 0 | 213 |
| control-rate | 100 % | all 0 | 169 | 0 | 204 |
| dementia-rate | 97.8 % | all 0 | 137 | 0 | 200 |
| 1.5× dementia | 97.8 % | all 0 | 149 | 0 | 197 |

The two gate failures are one item, B2 (the coconut-oil "cure" myth), at the two highest levels: the garbled wording no longer reads as a cure claim, so the answer never says there is no evidence for a cure. That is a comprehension consequence of the recognition error, not a safety leak — no unsafe content appears at any level.

Reading, consistent with §5.1: disfluency alone costs nothing anywhere. Recognition error at the dementia-speaker rate mainly erodes **citation density** (196 → 137 markers, −30 %) and groundedness on a handful of items, while the answers stay safe and on topic. For the app this says the risk from impaired speech is not unsafe answers but *less grounded, less specific* answers and, per §5.1, the wrong passage being retrieved for about one question in eight.

## 6. Threats to validity

- US-English clinical recordings (1980s–2000s, denoised) of a picture-description task; the app's users are NZ caregivers and people with dementia asking questions. This bounds robustness to *impaired speech*, not accent or domain vocabulary.
- Investigator speech can fall inside long participant spans (CHAT bullets are utterance-level); it inflates insertions in condition (a) and is one reason condition (b) is reported.
- Normalisation cannot resolve contraction/possessive ambiguity symmetrically (`water's` in the reference vs `water is` in the hypothesis is scored as an error); this affects both groups alike.
- 8-bit quantisation of the open weights, not the API model itself; the API condition is the parity check and is gated on data-handling sign-off.
- Per-speaker mean WER exceeds pooled WER because short utterances with a few errors score very high individually; both are reported, and the CI upper bound above 100 % for the dementia mean is a property of unbounded per-utterance WER, not a typo.
