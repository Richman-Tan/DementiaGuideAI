# Speech recognition on dementia speech — local:medium-mlx — snapshot 0419750

Generated 2026-09-18T21:19:06.836Z by `scripts/eval/stt/wer-report.mjs`. Corpus: DementiaBank ADReSS-2020 (Cookie Theft, participant utterances only). 2063 rows in references (2063 utterances, 2063 audio chunks — sub-chunks of one utterance are merged before scoring), 2063 scored, 0 without a hypothesis. Unit of analysis: speaker (156). Reference cleaning per `prepare-adress.py`; normalisation per `scripts/eval/lib/wer.js` (lowercase, punctuation, small numbers, contractions).

Data use: DementiaBank membership; cite Becker et al. (1994) and acknowledge NIA AG03705 and AG05133. Only aggregates are recorded here; audio, transcripts and hypotheses stay in the git-ignored data directory.

## Primary policy — fillers stripped from both sides (what `whisper-1` drops by design)

| Group | Speakers | Ref words | Mean WER (95% CI over speakers) | Median WER | Pooled WER | Sub | Del | Ins |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| control | 78 | 9194 | 32.0% (25.3%–39.1%) | 19.4% | 28.4% | 12.0% | 12.3% | 4.1% |
| dementia | 78 | 7870 | 45.9% (38.7%–53.3%) | 36.6% | 45.7% | 16.5% | 22.6% | 6.6% |

Dementia vs control (per-speaker WER): Mann–Whitney U = 2141.5, z = 3.19, p = 0.001, Cliff's δ = 0.30 (n = 78 vs 78).
WER vs MMSE (per speaker): Spearman ρ = -0.211, p = 0.008, n = 155.

## Hallucination and runaway decoding

Whisper-family decoders emit stock phrases on very short or near-silent audio and can loop on pause-heavy speech; pause-heavy speech is what the dementia group produces, so part of any group gap can be decoder behaviour rather than misrecognition. The deployed model family behaves the same way, so these cases are reported here rather than filtered out of the headline above. Runaway = hypothesis at least twice the reference length and at least five words longer; phrase = a fixed stock phrase ("thank you", "thanks for watching", "subscribe", "bye") present in the hypothesis but not the reference; repetition = some trigram repeated three or more times; empty = no words returned for a non-empty reference. "Excluding" sets aside runaway and phrase utterances.

| Group | Utterances | Runaway | Phrase | Repetition | Empty | Mean WER excl. (95% CI) | Pooled WER excl. | Ins excl. |
|---|---:|---:|---:|---:|---:|---|---:|---:|
| control | 1045 | 1.5% (16) | 4.6% (48) | 0.1% (1) | 5.6% (58) | 28.8% (22.9%–35.0%) | 24.1% | 2.4% |
| dementia | 1018 | 0.9% (9) | 7.6% (77) | 0.6% (6) | 12.3% (125) | 41.3% (34.7%–47.8%) | 39.1% | 3.3% |

## Secondary policy — fillers kept (what reaches the retriever untouched)

| Group | Speakers | Ref words | Mean WER (95% CI over speakers) | Median WER | Pooled WER | Sub | Del | Ins |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| control | 78 | 9474 | 33.8% (27.3%–40.5%) | 22.4% | 30.1% | 12.0% | 14.4% | 3.7% |
| dementia | 78 | 8176 | 47.1% (40.1%–54.4%) | 39.3% | 47.2% | 16.7% | 24.6% | 5.8% |

Dementia vs control: U = 2170.0, p = 0.002, δ = 0.29.

## Error character (fillers stripped)

Function-word share of deletions: 58.9% (1713 function, 1195 content). A high share means the recogniser drops grammar rather than meaning; content-word deletions are the ones that change a retrieval query.

Top substitutions (reference → hypothesis, count):

- a → the (39)
- the → a (32)
- waters → is (25)
- gonna → to (18)
- the → thank (12)
- is → thank (12)
- that → it (10)
- is → was (10)
- the → this (9)
- cookie → cooking (9)
- is → boys (7)
- is → you (6)
- is → the (6)
- the → am (6)
- mothers → is (6)
- it → you (6)
- the → i (6)
- waters → water (6)
- the → is (6)
- out → is (5)
- dishes → you (5)
- is → has (5)
- the → you (5)
- okay → you (5)
- sink → thing (5)
- drying → drawing (5)
- see → you (5)
- is → so (5)
- she → you (5)
- hafta → to (5)

Most-deleted words:

- the (270)
- is (204)
- and (169)
- i (102)
- a (92)
- she (74)
- that (67)
- it (66)
- not (55)
- he (51)
- do (43)
- in (37)
- there (34)
- to (33)
- well (31) [content]

## Latency

API round trip per chunk: median 991 ms, mean 1236 ms (n = 2063); real-time factor 0.46. Measured from this machine; report alongside E4.

## Paired comparison against other models (per-speaker WER, fillers stripped)

| Comparison | Speakers | Mean Δ WER (this − other) | Wilcoxon p | Rank-biserial |
|---|---:|---:|---:|---:|
| local:medium-mlx vs local:large-v2-mlx-8bit | 156 | -9.8 pp | 0.026 | -0.21 |

## Threats

- Cookie Theft picture descriptions, US English, clinical recordings from the 1980s–2000s (denoised in this release). This bounds robustness to impaired speech, not to New Zealand accent or to caregiver vocabulary.
- The production-primary recogniser on the web (browser Web Speech API, en-NZ) is not measured here; see the live-harness subset if run.
- Reference transcripts follow CHAT conventions; retraced words are kept because they were spoken, and omitted sounds are scored as the full word.
