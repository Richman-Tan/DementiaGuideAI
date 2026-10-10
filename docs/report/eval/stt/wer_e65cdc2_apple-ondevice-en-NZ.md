# Speech recognition on dementia speech — apple-ondevice:en-NZ — snapshot e65cdc2

Generated 2026-10-08T20:08:48.916Z by `scripts/eval/stt/wer-report.mjs`. Corpus: DementiaBank ADReSS-2020 (Cookie Theft, participant utterances only). 2063 rows in references (2063 utterances, 2063 audio chunks — sub-chunks of one utterance are merged before scoring), 2063 scored, 0 without a hypothesis. Unit of analysis: speaker (156). Reference cleaning per `prepare-adress.py`; normalisation per `scripts/eval/lib/wer.js` (lowercase, punctuation, small numbers, contractions).

Data use: DementiaBank membership; cite Becker et al. (1994) and acknowledge NIA AG03705 and AG05133. Only aggregates are recorded here; audio, transcripts and hypotheses stay in the git-ignored data directory.

## Primary policy — fillers stripped from both sides (what `whisper-1` drops by design)

| Group | Speakers | Ref words | Mean WER (95% CI over speakers) | Median WER | Pooled WER | Sub | Del | Ins |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| control | 78 | 9194 | 44.5% (38.2%–51.1%) | 33.8% | 41.8% | 10.1% | 30.4% | 1.3% |
| dementia | 78 | 7870 | 57.5% (51.9%–63.0%) | 55.5% | 58.5% | 9.2% | 48.4% | 0.9% |

Dementia vs control (per-speaker WER): Mann–Whitney U = 2102.5, z = 3.33, p = <0.001, Cliff's δ = 0.31 (n = 78 vs 78).
WER vs MMSE (per speaker): Spearman ρ = -0.204, p = 0.010, n = 155.

## Hallucination and runaway decoding

Whisper-family decoders emit stock phrases on very short or near-silent audio and can loop on pause-heavy speech; pause-heavy speech is what the dementia group produces, so part of any group gap can be decoder behaviour rather than misrecognition. The deployed model family behaves the same way, so these cases are reported here rather than filtered out of the headline above. Runaway = hypothesis at least twice the reference length and at least five words longer; phrase = a fixed stock phrase ("thank you", "thanks for watching", "subscribe", "bye") present in the hypothesis but not the reference; repetition = some trigram repeated three or more times; empty = no words returned for a non-empty reference. "Excluding" sets aside runaway and phrase utterances.

| Group | Utterances | Runaway | Phrase | Repetition | Empty | Mean WER excl. (95% CI) | Pooled WER excl. | Ins excl. |
|---|---:|---:|---:|---:|---:|---|---:|---:|
| control | 1045 | 0.5% (5) | 0.1% (1) | 0.0% (0) | 17.0% (178) | 44.0% (38.0%–50.4%) | 41.3% | 0.9% |
| dementia | 1018 | 0.0% (0) | 0.0% (0) | 0.0% (0) | 24.0% (244) | 57.5% (51.9%–63.0%) | 58.5% | 0.9% |

## Secondary policy — fillers kept (what reaches the retriever untouched)

| Group | Speakers | Ref words | Mean WER (95% CI over speakers) | Median WER | Pooled WER | Sub | Del | Ins |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| control | 78 | 9474 | 46.2% (40.0%–52.5%) | 37.5% | 43.4% | 9.9% | 32.3% | 1.1% |
| dementia | 78 | 8176 | 58.6% (53.0%–64.1%) | 58.5% | 59.8% | 9.1% | 50.1% | 0.6% |

Dementia vs control: U = 2148.5, p = 0.002, δ = 0.29.

## Error character (fillers stripped)

Function-word share of deletions: 57.6% (3808 function, 2800 content). A high share means the recogniser drops grammar rather than meaning; content-word deletions are the ones that change a retrieval query.

Top substitutions (reference → hypothesis, count):

- the → a (32)
- waters → is (26)
- and → in (24)
- a → the (21)
- is → was (19)
- stool → store (19)
- is → boys (13)
- that → it (12)
- her → your (8)
- the → water (8)
- waters → water (7)
- falling → fallen (7)
- up → out (6)
- cookie → cooking (6)
- drying → dry (6)
- the → my (6)
- is → the (5)
- the → i (5)
- mothers → is (5)
- it → that (5)
- out → at (5)
- is → i (4)
- is → has (4)
- to → the (4)
- boy → boys (4)
- is → girls (4)
- shrubbery → strawberry (4)
- sink → think (4)
- standing → stand (4)
- ladys → ladies (4)

Most-deleted words:

- the (615)
- is (509)
- and (352)
- a (204)
- i (182)
- that (153)
- it (137)
- she (136)
- not (118)
- he (100)
- there (97)
- to (87)
- on (82)
- in (76)
- cookie (65) [content]

## Latency

API round trip per chunk: median 309 ms, mean 453 ms (n = 2063); real-time factor 0.12. Measured from this machine; report alongside E4.

## Paired comparison against other models (per-speaker WER, fillers stripped)

| Comparison | Speakers | Mean Δ WER (this − other) | Wilcoxon p | Rank-biserial |
|---|---:|---:|---:|---:|
| apple-ondevice:en-NZ vs whisper-1 | 156 | +14.5 pp | <0.001 | 0.81 |

## Threats

- Cookie Theft picture descriptions, US English, clinical recordings from the 1980s–2000s (denoised in this release). This bounds robustness to impaired speech, not to New Zealand accent or to caregiver vocabulary.
- The production-primary recogniser on the web (browser Web Speech API, en-NZ) is not measured here; see the live-harness subset if run.
- Reference transcripts follow CHAT conventions; retraced words are kept because they were spoken, and omitted sounds are scored as the full word.
