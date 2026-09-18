# E9 results — speech recognition on dementia speech (ADReSS-2020)

> Run 2026-09-18 on the development Mac (Apple M3, 8 GB). Artefacts: `docs/report/eval/stt/wer_<sha>_<model>.{md,csv}` (aggregates only). Audio, references and hypotheses live in the git-ignored `data/dementiabank/` and are never committed, per the TalkBank Ground Rules. Design: `docs/eval/evaluation-plan.md` §17.1.

## 1. What was run

| Item | Value |
|---|---|
| Corpus | DementiaBank ADReSS-2020 (Cookie Theft picture description), train + test; labels for the test split from the challenge's `2020Labels.txt` |
| Speakers | 156 (78 dementia / 78 control; 108 train + 48 test); MMSE for all but one control (`NA` in the source) |
| Unit | participant (`PAR`) utterance, aligned by CHAT time bullets; WER aggregated per speaker |
| Input condition (a) — utterance cuts | 2,063 utterances cut from the full enhanced recording by their time bullets, pauses included: 2.6 h of audio. The closest analogue to what the app's Whisper fallback receives (a whole recording uploaded after the user stops) |
| Input condition (b) — VAD chunks | the challenge's `Normalised_audio-chunks` (silence removed, ≤10 s), 4,009 sub-chunks grouped back to 1,973 utterances by the span in the file name, hypotheses concatenated before scoring: 1.36 h of audio. The analogue of an endpointed segment. 155 speakers (S073's chunk spans do not match its transcript timings) |
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

Reading: about a third of the raw group gap is decoder behaviour on pauses rather than misrecognition, and stock-phrase hallucination is twice as frequent on dementia utterances. The excluded figures are in line with published Whisper-large results on this corpus (≈30 % overall). Deletions are 59 % function words.

## 3. Condition (b) — VAD chunks

*Running; filled in from `wer_<sha>_local-large-v2-mlx-8bit_chunks.md` when the run completes. Nothing is claimed here until then.*

## 4. Comparators

*Local `medium` (MLX fp16): pending. API conditions (`whisper-1`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`): not run — awaiting supervisor sign-off on the non-storage basis (§17.1).*

## 5. Downstream effect on the app — error-profile perturbation

*Pending: the error profile derived from the dementia-speaker alignments is applied to the development question set; retrieval recall@5 and judged answer quality versus the clean questions are reported here. Synthetic by construction; labelled as such.*

## 6. Threats to validity

- US-English clinical recordings (1980s–2000s, denoised) of a picture-description task; the app's users are NZ caregivers and people with dementia asking questions. This bounds robustness to *impaired speech*, not accent or domain vocabulary.
- Investigator speech can fall inside long participant spans (CHAT bullets are utterance-level); it inflates insertions in condition (a) and is one reason condition (b) is reported.
- Normalisation cannot resolve contraction/possessive ambiguity symmetrically (`water's` in the reference vs `water is` in the hypothesis is scored as an error); this affects both groups alike.
- 8-bit quantisation of the open weights, not the API model itself; the API condition is the parity check and is gated on data-handling sign-off.
- Per-speaker mean WER exceeds pooled WER because short utterances with a few errors score very high individually; both are reported, and the CI upper bound above 100 % for the dementia mean is a property of unbounded per-utterance WER, not a typo.
