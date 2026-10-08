# Speech recognition on dementia speech — apple-ondevice:en-US — snapshot 0b81b1c

Generated 2026-10-08T20:34:22.266Z by `scripts/eval/stt/wer-report.mjs`. Corpus: DementiaBank ADReSS-2020 (Cookie Theft, participant utterances only). 2063 rows in references (2063 utterances, 2063 audio chunks — sub-chunks of one utterance are merged before scoring), 2063 scored, 0 without a hypothesis. Unit of analysis: speaker (156). Reference cleaning per `prepare-adress.py`; normalisation per `scripts/eval/lib/wer.js` (lowercase, punctuation, small numbers, contractions).

Data use: DementiaBank membership; cite Becker et al. (1994) and acknowledge NIA AG03705 and AG05133. Only aggregates are recorded here; audio, transcripts and hypotheses stay in the git-ignored data directory.

## Primary policy — fillers stripped from both sides (what `whisper-1` drops by design)

| Group | Speakers | Ref words | Mean WER (95% CI over speakers) | Median WER | Pooled WER | Sub | Del | Ins |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| control | 78 | 9194 | 45.4% (39.2%–51.8%) | 37.1% | 42.2% | 10.1% | 30.7% | 1.4% |
| dementia | 78 | 7870 | 58.0% (52.5%–63.5%) | 57.0% | 58.9% | 9.6% | 48.3% | 1.0% |

Dementia vs control (per-speaker WER): Mann–Whitney U = 2099.0, z = 3.34, p = <0.001, Cliff's δ = 0.31 (n = 78 vs 78).
WER vs MMSE (per speaker): Spearman ρ = -0.205, p = 0.009, n = 155.

## Hallucination and runaway decoding

Whisper-family decoders emit stock phrases on very short or near-silent audio and can loop on pause-heavy speech; pause-heavy speech is what the dementia group produces, so part of any group gap can be decoder behaviour rather than misrecognition. The deployed model family behaves the same way, so these cases are reported here rather than filtered out of the headline above. Runaway = hypothesis at least twice the reference length and at least five words longer; phrase = a fixed stock phrase ("thank you", "thanks for watching", "subscribe", "bye") present in the hypothesis but not the reference; repetition = some trigram repeated three or more times; empty = no words returned for a non-empty reference. "Excluding" sets aside runaway and phrase utterances.

| Group | Utterances | Runaway | Phrase | Repetition | Empty | Mean WER excl. (95% CI) | Pooled WER excl. | Ins excl. |
|---|---:|---:|---:|---:|---:|---|---:|---:|
| control | 1045 | 0.5% (5) | 0.1% (1) | 0.0% (0) | 18.4% (192) | 44.9% (38.8%–51.1%) | 41.7% | 1.0% |
| dementia | 1018 | 0.0% (0) | 0.0% (0) | 0.0% (0) | 25.0% (255) | 58.0% (52.5%–63.5%) | 58.9% | 1.0% |

## Secondary policy — fillers kept (what reaches the retriever untouched)

| Group | Speakers | Ref words | Mean WER (95% CI over speakers) | Median WER | Pooled WER | Sub | Del | Ins |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| control | 78 | 9474 | 46.9% (40.8%–53.2%) | 38.5% | 43.8% | 10.1% | 32.6% | 1.1% |
| dementia | 78 | 8176 | 59.1% (53.6%–64.6%) | 58.6% | 60.2% | 9.6% | 50.0% | 0.6% |

Dementia vs control: U = 2151.5, p = 0.002, δ = 0.29.

## Error character (fillers stripped)

Function-word share of deletions: 57.5% (3814 function, 2815 content). A high share means the recogniser drops grammar rather than meaning; content-word deletions are the ones that change a retrieval query.

Top substitutions (reference → hypothesis, count):

- the → a (33)
- okay → ok (28)
- and → in (25)
- waters → is (25)
- a → the (22)
- is → was (18)
- stool → store (18)
- is → boys (13)
- that → it (12)
- up → out (10)
- the → water (9)
- the → my (9)
- drying → dry (7)
- falling → fallen (7)
- is → the (6)
- her → your (6)
- waters → water (6)
- in → and (6)
- the → i (5)
- standing → stand (5)
- is → has (4)
- to → the (4)
- cookie → cooking (4)
- jar → job (4)
- boy → boys (4)
- is → girls (4)
- shrubbery → strawberry (4)
- she → he (4)
- is → i (4)
- is → as (4)

Most-deleted words:

- the (620)
- is (507)
- and (352)
- a (201)
- i (182)
- that (153)
- she (136)
- it (133)
- not (117)
- there (98)
- he (95)
- to (86)
- on (85)
- in (79)
- do (64)

## Latency

API round trip per chunk: median 216 ms, mean 353 ms (n = 2063); real-time factor 0.09. Measured from this machine; report alongside E4.

## Paired comparison against other models (per-speaker WER, fillers stripped)

| Comparison | Speakers | Mean Δ WER (this − other) | Wilcoxon p | Rank-biserial |
|---|---:|---:|---:|---:|
| apple-ondevice:en-US vs apple-ondevice:en-NZ | 156 | +0.7 pp | 0.005 | 0.31 |
| apple-ondevice:en-US vs whisper-1 | 156 | +15.1 pp | <0.001 | 0.82 |

## Threats

- Cookie Theft picture descriptions, US English, clinical recordings from the 1980s–2000s (denoised in this release). This bounds robustness to impaired speech, not to New Zealand accent or to caregiver vocabulary.
- The production-primary recogniser on the web (browser Web Speech API, en-NZ) is not measured here; see the live-harness subset if run.
- Reference transcripts follow CHAT conventions; retraced words are kept because they were spoken, and omitted sounds are scored as the full word.
