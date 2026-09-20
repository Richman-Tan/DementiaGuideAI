# Speech recognition on dementia speech — whisper-1 — snapshot 0419750

Generated 2026-09-18T21:49:23.428Z by `scripts/eval/stt/wer-report.mjs`. Corpus: DementiaBank ADReSS-2020 (Cookie Theft, participant utterances only). 1973 rows in references (1973 utterances, 1973 audio chunks — sub-chunks of one utterance are merged before scoring), 1973 scored, 0 without a hypothesis. Unit of analysis: speaker (155). Reference cleaning per `prepare-adress.py`; normalisation per `scripts/eval/lib/wer.js` (lowercase, punctuation, small numbers, contractions).

Data use: DementiaBank membership; cite Becker et al. (1994) and acknowledge NIA AG03705 and AG05133. Only aggregates are recorded here; audio, transcripts and hypotheses stay in the git-ignored data directory.

## Primary policy — fillers stripped from both sides (what `whisper-1` drops by design)

| Group | Speakers | Ref words | Mean WER (95% CI over speakers) | Median WER | Pooled WER | Sub | Del | Ins |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| control | 77 | 8571 | 35.1% (28.1%–42.8%) | 20.3% | 31.4% | 14.0% | 12.6% | 4.8% |
| dementia | 78 | 7500 | 44.1% (37.1%–51.5%) | 32.5% | 44.7% | 19.3% | 20.7% | 4.7% |

Dementia vs control (per-speaker WER): Mann–Whitney U = 2237.0, z = 2.74, p = 0.006, Cliff's δ = 0.26 (n = 78 vs 77).
WER vs MMSE (per speaker): Spearman ρ = -0.181, p = 0.023, n = 154.

## Hallucination and runaway decoding

Whisper-family decoders emit stock phrases on very short or near-silent audio and can loop on pause-heavy speech; pause-heavy speech is what the dementia group produces, so part of any group gap can be decoder behaviour rather than misrecognition. The deployed model family behaves the same way, so these cases are reported here rather than filtered out of the headline above. Runaway = hypothesis at least twice the reference length and at least five words longer; phrase = a fixed stock phrase ("thank you", "thanks for watching", "subscribe", "bye") present in the hypothesis but not the reference; repetition = some trigram repeated three or more times; empty = no words returned for a non-empty reference. "Excluding" sets aside runaway and phrase utterances.

| Group | Utterances | Runaway | Phrase | Repetition | Empty | Mean WER excl. (95% CI) | Pooled WER excl. | Ins excl. |
|---|---:|---:|---:|---:|---:|---|---:|---:|
| control | 992 | 1.2% (12) | 2.8% (28) | 0.3% (3) | 2.6% (26) | 32.0% (26.1%–38.5%) | 28.2% | 3.0% |
| dementia | 981 | 0.7% (7) | 3.8% (37) | 0.4% (4) | 4.1% (40) | 41.6% (35.4%–47.8%) | 41.4% | 3.7% |

## Secondary policy — fillers kept (what reaches the retriever untouched)

| Group | Speakers | Ref words | Mean WER (95% CI over speakers) | Median WER | Pooled WER | Sub | Del | Ins |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| control | 77 | 8838 | 36.4% (29.7%–43.8%) | 23.0% | 32.9% | 14.1% | 14.4% | 4.4% |
| dementia | 78 | 7797 | 45.1% (38.4%–52.2%) | 35.0% | 45.9% | 19.3% | 22.6% | 4.0% |

Dementia vs control: U = 2281.0, p = 0.010, δ = 0.24.

## Error character (fillers stripped)

Function-word share of deletions: 59.6% (1572 function, 1064 content). A high share means the recogniser drops grammar rather than meaning; content-word deletions are the ones that change a retrieval query.

Top substitutions (reference → hypothesis, count):

- the → a (34)
- she → he (21)
- a → the (20)
- gonna → to (17)
- waters → is (11)
- the → this (11)
- is → was (10)
- is → boys (10)
- that → it (9)
- is → you (9)
- and → in (9)
- the → i (7)
- the → bye (6)
- the → and (6)
- sink → thing (6)
- is → i (6)
- is → has (5)
- the → is (5)
- mothers → is (5)
- the → there (5)
- cookie → cooking (5)
- the → do (5)
- okay → ok (5)
- drying → drawing (5)
- the → water (5)
- she → you (5)
- windows → is (5)
- the → to (5)
- the → it (5)
- the → thank (4)

Most-deleted words:

- the (289)
- is (175)
- and (163)
- i (84)
- a (74)
- she (70)
- that (54)
- it (50)
- he (43)
- not (41)
- in (36)
- there (32)
- do (30)
- s (29) [content]
- to (29)

## Latency

API round trip per chunk: median 1383 ms, mean 1446 ms (n = 1973); real-time factor 0.91. Measured from this machine; report alongside E4.

## Paired comparison against other models (per-speaker WER, fillers stripped)

| Comparison | Speakers | Mean Δ WER (this − other) | Wilcoxon p | Rank-biserial |
|---|---:|---:|---:|---:|
| whisper-1 vs local:large-v2-mlx-8bit | 155 | -2.6 pp | <0.001 | -0.42 |

## Threats

- Cookie Theft picture descriptions, US English, clinical recordings from the 1980s–2000s (denoised in this release). This bounds robustness to impaired speech, not to New Zealand accent or to caregiver vocabulary.
- The production-primary recogniser on the web (browser Web Speech API, en-NZ) is not measured here; see the live-harness subset if run.
- Reference transcripts follow CHAT conventions; retraced words are kept because they were spoken, and omitted sounds are scored as the full word.
