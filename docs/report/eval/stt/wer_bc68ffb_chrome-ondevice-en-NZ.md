# Speech recognition on dementia speech — chrome-ondevice:en-NZ — snapshot bc68ffb

Generated 2026-10-10T05:03:01.123Z by `scripts/eval/stt/wer-report.mjs`. Corpus: DementiaBank ADReSS-2020 (Cookie Theft, participant utterances only). 2063 rows in references (2063 utterances, 2063 audio chunks — sub-chunks of one utterance are merged before scoring), 2063 scored, 0 without a hypothesis. Unit of analysis: speaker (156). Reference cleaning per `prepare-adress.py`; normalisation per `scripts/eval/lib/wer.js` (lowercase, punctuation, small numbers, contractions).

Data use: DementiaBank membership; cite Becker et al. (1994) and acknowledge NIA AG03705 and AG05133. Only aggregates are recorded here; audio, transcripts and hypotheses stay in the git-ignored data directory.

## Primary policy — fillers stripped from both sides (what `whisper-1` drops by design)

| Group | Speakers | Ref words | Mean WER (95% CI over speakers) | Median WER | Pooled WER | Sub | Del | Ins |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| control | 78 | 9194 | 36.0% (29.5%–43.1%) | 22.3% | 33.8% | 10.8% | 20.5% | 2.4% |
| dementia | 78 | 7870 | 47.0% (40.9%–53.3%) | 41.6% | 47.7% | 12.2% | 33.7% | 1.8% |

Dementia vs control (per-speaker WER): Mann–Whitney U = 2225.0, z = 2.90, p = 0.004, Cliff's δ = 0.27 (n = 78 vs 78).
WER vs MMSE (per speaker): Spearman ρ = -0.188, p = 0.018, n = 155.

## Hallucination and runaway decoding

Whisper-family decoders emit stock phrases on very short or near-silent audio and can loop on pause-heavy speech; pause-heavy speech is what the dementia group produces, so part of any group gap can be decoder behaviour rather than misrecognition. The deployed model family behaves the same way, so these cases are reported here rather than filtered out of the headline above. Runaway = hypothesis at least twice the reference length and at least five words longer; phrase = a fixed stock phrase ("thank you", "thanks for watching", "subscribe", "bye") present in the hypothesis but not the reference; repetition = some trigram repeated three or more times; empty = no words returned for a non-empty reference. "Excluding" sets aside runaway and phrase utterances.

| Group | Utterances | Runaway | Phrase | Repetition | Empty | Mean WER excl. (95% CI) | Pooled WER excl. | Ins excl. |
|---|---:|---:|---:|---:|---:|---|---:|---:|
| control | 1045 | 0.8% (8) | 0.3% (3) | 0.0% (0) | 11.2% (117) | 35.1% (29.0%–41.6%) | 32.8% | 1.7% |
| dementia | 1018 | 0.1% (1) | 0.0% (0) | 0.0% (0) | 21.9% (223) | 46.8% (40.7%–53.0%) | 47.6% | 1.7% |

## Secondary policy — fillers kept (what reaches the retriever untouched)

| Group | Speakers | Ref words | Mean WER (95% CI over speakers) | Median WER | Pooled WER | Sub | Del | Ins |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| control | 78 | 9474 | 37.1% (30.8%–44.0%) | 24.3% | 34.9% | 10.8% | 22.0% | 2.1% |
| dementia | 78 | 8176 | 48.2% (42.1%–54.4%) | 43.7% | 48.9% | 12.1% | 35.4% | 1.4% |

Dementia vs control: U = 2208.5, p = 0.003, δ = 0.27.

## Error character (fillers stripped)

Function-word share of deletions: 57.6% (2615 function, 1928 content). A high share means the recogniser drops grammar rather than meaning; content-word deletions are the ones that change a retrieval query.

Top substitutions (reference → hypothesis, count):

- the → a (34)
- a → the (23)
- and → in (20)
- drying → drawing (19)
- is → boys (17)
- the → this (16)
- gonna → to (12)
- that → it (12)
- the → my (9)
- cookie → cooking (8)
- her → your (8)
- is → girls (7)
- she → he (7)
- sink → thing (7)
- waters → is (6)
- ladys → ladies (6)
- is → was (6)
- stool → store (5)
- is → just (5)
- alright → right (5)
- is → this (5)
- there → here (5)
- and → when (5)
- the → to (5)
- her → our (4)
- is → you (4)
- is → the (4)
- is → doors (4)
- s → this (4)
- stool → school (4)

Most-deleted words:

- the (456)
- is (309)
- and (252)
- a (133)
- i (120)
- she (104)
- that (95)
- it (92)
- not (84)
- he (63)
- to (61)
- in (58)
- there (52)
- cookie (51) [content]
- on (48)

## Latency

API round trip per chunk: median 1 ms, mean 1108 ms (n = 872); real-time factor 0.47. Measured from this machine; report alongside E4.

## Paired comparison against other models (per-speaker WER, fillers stripped)

| Comparison | Speakers | Mean Δ WER (this − other) | Wilcoxon p | Rank-biserial |
|---|---:|---:|---:|---:|
| chrome-ondevice:en-NZ vs whisper-1 | 156 | +4.9 pp | <0.001 | 0.58 |
| chrome-ondevice:en-NZ vs apple-ondevice:en-NZ | 156 | -9.5 pp | <0.001 | -0.86 |

## Threats

- Cookie Theft picture descriptions, US English, clinical recordings from the 1980s–2000s (denoised in this release). This bounds robustness to impaired speech, not to New Zealand accent or to caregiver vocabulary.
- The production-primary recogniser on the web (browser Web Speech API, en-NZ) is not measured here; see the live-harness subset if run.
- Reference transcripts follow CHAT conventions; retraced words are kept because they were spoken, and omitted sounds are scored as the full word.
