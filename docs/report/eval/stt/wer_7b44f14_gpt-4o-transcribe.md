# Speech recognition on dementia speech — gpt-4o-transcribe — snapshot 7b44f14

Generated 2026-09-18T23:15:41.333Z by `scripts/eval/stt/wer-report.mjs`. Corpus: DementiaBank ADReSS-2020 (Cookie Theft, participant utterances only). 1973 rows in references (1973 utterances, 1973 audio chunks — sub-chunks of one utterance are merged before scoring), 1973 scored, 0 without a hypothesis. Unit of analysis: speaker (155). Reference cleaning per `prepare-adress.py`; normalisation per `scripts/eval/lib/wer.js` (lowercase, punctuation, small numbers, contractions).

Data use: DementiaBank membership; cite Becker et al. (1994) and acknowledge NIA AG03705 and AG05133. Only aggregates are recorded here; audio, transcripts and hypotheses stay in the git-ignored data directory.

## Primary policy — fillers stripped from both sides (what `whisper-1` drops by design)

| Group | Speakers | Ref words | Mean WER (95% CI over speakers) | Median WER | Pooled WER | Sub | Del | Ins |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| control | 77 | 8571 | 40.4% (34.1%–47.1%) | 30.6% | 37.6% | 9.1% | 27.6% | 1.0% |
| dementia | 78 | 7500 | 52.7% (46.7%–58.9%) | 46.4% | 54.5% | 11.1% | 42.3% | 1.2% |

Dementia vs control (per-speaker WER): Mann–Whitney U = 2137.0, z = 3.10, p = 0.002, Cliff's δ = 0.29 (n = 78 vs 77).
WER vs MMSE (per speaker): Spearman ρ = -0.226, p = 0.004, n = 154.

## Hallucination and runaway decoding

Whisper-family decoders emit stock phrases on very short or near-silent audio and can loop on pause-heavy speech; pause-heavy speech is what the dementia group produces, so part of any group gap can be decoder behaviour rather than misrecognition. The deployed model family behaves the same way, so these cases are reported here rather than filtered out of the headline above. Runaway = hypothesis at least twice the reference length and at least five words longer; phrase = a fixed stock phrase ("thank you", "thanks for watching", "subscribe", "bye") present in the hypothesis but not the reference; repetition = some trigram repeated three or more times; empty = no words returned for a non-empty reference. "Excluding" sets aside runaway and phrase utterances.

| Group | Utterances | Runaway | Phrase | Repetition | Empty | Mean WER excl. (95% CI) | Pooled WER excl. | Ins excl. |
|---|---:|---:|---:|---:|---:|---|---:|---:|
| control | 992 | 0.5% (5) | 0.1% (1) | 0.0% (0) | 4.9% (49) | 39.7% (33.7%–46.0%) | 37.0% | 0.6% |
| dementia | 981 | 0.2% (2) | 0.2% (2) | 0.0% (0) | 10.1% (99) | 52.4% (46.4%–58.7%) | 54.1% | 1.0% |

## Secondary policy — fillers kept (what reaches the retriever untouched)

| Group | Speakers | Ref words | Mean WER (95% CI over speakers) | Median WER | Pooled WER | Sub | Del | Ins |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| control | 77 | 8838 | 42.1% (36.1%–48.5%) | 34.5% | 39.4% | 8.9% | 29.6% | 0.9% |
| dementia | 78 | 7797 | 54.0% (48.2%–60.2%) | 50.1% | 56.0% | 11.0% | 44.1% | 0.9% |

Dementia vs control: U = 2159.0, p = 0.003, δ = 0.28.

## Error character (fillers stripped)

Function-word share of deletions: 59.8% (3309 function, 2225 content). A high share means the recogniser drops grammar rather than meaning; content-word deletions are the ones that change a retrieval query.

Top substitutions (reference → hypothesis, count):

- the → a (25)
- she → he (21)
- is → was (16)
- okay → ok (10)
- a → the (9)
- is → boys (9)
- gonna → to (8)
- waters → is (6)
- the → water (5)
- is → am (5)
- is → girls (5)
- is → he (5)
- is → i (5)
- that → it (5)
- windows → is (5)
- overflowing → flowing (4)
- the → i (4)
- her → the (4)
- is → the (3)
- waters → water (3)
- the → my (3)
- ladys → ladies (3)
- alright → right (3)
- not → you (3)
- spilling → filling (3)
- boys → is (3)
- girls → girl (3)
- falling → fallen (3)
- is → you (2)
- he → she (2)

Most-deleted words:

- the (562)
- is (403)
- and (356)
- i (167)
- a (161)
- she (140)
- that (130)
- it (97)
- not (95)
- he (82)
- to (74)
- in (72)
- there (65)
- of (61)
- cookie (60) [content]

## Latency

API round trip per chunk: median 700 ms, mean 848 ms (n = 1973); real-time factor 0.51. Measured from this machine; report alongside E4.

## Paired comparison against other models (per-speaker WER, fillers stripped)

| Comparison | Speakers | Mean Δ WER (this − other) | Wilcoxon p | Rank-biserial |
|---|---:|---:|---:|---:|
| gpt-4o-transcribe vs whisper-1 | 155 | +7.0 pp | <0.001 | 0.75 |

## Threats

- Cookie Theft picture descriptions, US English, clinical recordings from the 1980s–2000s (denoised in this release). This bounds robustness to impaired speech, not to New Zealand accent or to caregiver vocabulary.
- The production-primary recogniser on the web (browser Web Speech API, en-NZ) is not measured here; see the live-harness subset if run.
- Reference transcripts follow CHAT conventions; retraced words are kept because they were spoken, and omitted sounds are scored as the full word.
