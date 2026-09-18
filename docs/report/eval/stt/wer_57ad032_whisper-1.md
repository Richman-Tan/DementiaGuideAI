# Speech recognition on dementia speech — whisper-1 — snapshot 57ad032

Generated 2026-09-18T22:50:59.110Z by `scripts/eval/stt/wer-report.mjs`. Corpus: DementiaBank ADReSS-2020 (Cookie Theft, participant utterances only). 2063 rows in references (2063 utterances, 2063 audio chunks — sub-chunks of one utterance are merged before scoring), 2063 scored, 0 without a hypothesis. Unit of analysis: speaker (156). Reference cleaning per `prepare-adress.py`; normalisation per `scripts/eval/lib/wer.js` (lowercase, punctuation, small numbers, contractions).

Data use: DementiaBank membership; cite Becker et al. (1994) and acknowledge NIA AG03705 and AG05133. Only aggregates are recorded here; audio, transcripts and hypotheses stay in the git-ignored data directory.

## Primary policy — fillers stripped from both sides (what `whisper-1` drops by design)

| Group | Speakers | Ref words | Mean WER (95% CI over speakers) | Median WER | Pooled WER | Sub | Del | Ins |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| control | 78 | 9194 | 30.0% (23.3%–37.1%) | 16.6% | 26.3% | 12.7% | 8.7% | 4.9% |
| dementia | 78 | 7870 | 43.0% (35.7%–50.4%) | 29.6% | 41.9% | 18.2% | 16.2% | 7.6% |

Dementia vs control (per-speaker WER): Mann–Whitney U = 2102.0, z = 3.33, p = <0.001, Cliff's δ = 0.31 (n = 78 vs 78).
WER vs MMSE (per speaker): Spearman ρ = -0.229, p = 0.004, n = 155.

## Hallucination and runaway decoding

Whisper-family decoders emit stock phrases on very short or near-silent audio and can loop on pause-heavy speech; pause-heavy speech is what the dementia group produces, so part of any group gap can be decoder behaviour rather than misrecognition. The deployed model family behaves the same way, so these cases are reported here rather than filtered out of the headline above. Runaway = hypothesis at least twice the reference length and at least five words longer; phrase = a fixed stock phrase ("thank you", "thanks for watching", "subscribe", "bye") present in the hypothesis but not the reference; repetition = some trigram repeated three or more times; empty = no words returned for a non-empty reference. "Excluding" sets aside runaway and phrase utterances.

| Group | Utterances | Runaway | Phrase | Repetition | Empty | Mean WER excl. (95% CI) | Pooled WER excl. | Ins excl. |
|---|---:|---:|---:|---:|---:|---|---:|---:|
| control | 1045 | 1.2% (13) | 5.7% (60) | 0.2% (2) | 1.3% (14) | 26.3% (20.5%–32.3%) | 21.8% | 3.5% |
| dementia | 1018 | 1.7% (17) | 11.4% (116) | 0.6% (6) | 3.0% (31) | 36.4% (30.7%–42.4%) | 33.1% | 4.5% |

## Secondary policy — fillers kept (what reaches the retriever untouched)

| Group | Speakers | Ref words | Mean WER (95% CI over speakers) | Median WER | Pooled WER | Sub | Del | Ins |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| control | 78 | 9474 | 31.6% (25.2%–38.5%) | 19.2% | 28.0% | 12.9% | 10.7% | 4.4% |
| dementia | 78 | 8176 | 44.1% (37.1%–51.3%) | 30.0% | 43.2% | 18.2% | 18.2% | 6.8% |

Dementia vs control: U = 2169.0, p = 0.002, δ = 0.29.

## Error character (fillers stripped)

Function-word share of deletions: 59.5% (1234 function, 841 content). A high share means the recogniser drops grammar rather than meaning; content-word deletions are the ones that change a retrieval query.

Top substitutions (reference → hypothesis, count):

- the → a (38)
- a → the (25)
- gonna → to (24)
- waters → is (18)
- the → thank (17)
- is → was (13)
- the → is (12)
- is → thank (11)
- the → this (10)
- is → you (9)
- the → to (9)
- dishes → you (9)
- is → it (9)
- that → it (8)
- it → you (8)
- is → has (7)
- the → you (7)
- okay → you (6)
- and → in (6)
- i → thank (6)
- else → you (6)
- mothers → is (6)
- the → i (6)
- is → am (6)
- is → boys (6)
- a → thank (6)
- sink → thing (6)
- she → he (6)
- jar → you (5)
- cookie → cooking (5)

Most-deleted words:

- the (211)
- is (139)
- and (136)
- i (79)
- a (72)
- that (45)
- it (43)
- not (38)
- she (38)
- he (35)
- do (31)
- s (27) [content]
- there (26)
- in (25)
- on (21)

## Latency

API round trip per chunk: median 1482 ms, mean 1563 ms (n = 2063); real-time factor 0.55. Measured from this machine; report alongside E4.

## Paired comparison against other models (per-speaker WER, fillers stripped)

| Comparison | Speakers | Mean Δ WER (this − other) | Wilcoxon p | Rank-biserial |
|---|---:|---:|---:|---:|
| whisper-1 vs local:large-v2-mlx-8bit | 156 | -12.2 pp | <0.001 | -0.53 |
| whisper-1 vs local:medium-mlx | 156 | -2.4 pp | 0.002 | -0.30 |

## Threats

- Cookie Theft picture descriptions, US English, clinical recordings from the 1980s–2000s (denoised in this release). This bounds robustness to impaired speech, not to New Zealand accent or to caregiver vocabulary.
- The production-primary recogniser on the web (browser Web Speech API, en-NZ) is not measured here; see the live-harness subset if run.
- Reference transcripts follow CHAT conventions; retraced words are kept because they were spoken, and omitted sounds are scored as the full word.
