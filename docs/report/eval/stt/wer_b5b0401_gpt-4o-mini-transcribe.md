# Speech recognition on dementia speech — gpt-4o-mini-transcribe — snapshot b5b0401

Generated 2026-09-18T23:23:14.280Z by `scripts/eval/stt/wer-report.mjs`. Corpus: DementiaBank ADReSS-2020 (Cookie Theft, participant utterances only). 1973 rows in references (1973 utterances, 1973 audio chunks — sub-chunks of one utterance are merged before scoring), 1973 scored, 0 without a hypothesis. Unit of analysis: speaker (155). Reference cleaning per `prepare-adress.py`; normalisation per `scripts/eval/lib/wer.js` (lowercase, punctuation, small numbers, contractions).

Data use: DementiaBank membership; cite Becker et al. (1994) and acknowledge NIA AG03705 and AG05133. Only aggregates are recorded here; audio, transcripts and hypotheses stay in the git-ignored data directory.

## Primary policy — fillers stripped from both sides (what `whisper-1` drops by design)

| Group | Speakers | Ref words | Mean WER (95% CI over speakers) | Median WER | Pooled WER | Sub | Del | Ins |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| control | 77 | 8571 | 34.5% (28.2%–41.7%) | 23.2% | 31.6% | 12.8% | 16.0% | 2.7% |
| dementia | 78 | 7500 | 45.2% (39.1%–51.6%) | 36.7% | 46.2% | 16.5% | 27.3% | 2.3% |

Dementia vs control (per-speaker WER): Mann–Whitney U = 2167.0, z = 2.99, p = 0.003, Cliff's δ = 0.28 (n = 78 vs 77).
WER vs MMSE (per speaker): Spearman ρ = -0.200, p = 0.012, n = 154.

## Hallucination and runaway decoding

Whisper-family decoders emit stock phrases on very short or near-silent audio and can loop on pause-heavy speech; pause-heavy speech is what the dementia group produces, so part of any group gap can be decoder behaviour rather than misrecognition. The deployed model family behaves the same way, so these cases are reported here rather than filtered out of the headline above. Runaway = hypothesis at least twice the reference length and at least five words longer; phrase = a fixed stock phrase ("thank you", "thanks for watching", "subscribe", "bye") present in the hypothesis but not the reference; repetition = some trigram repeated three or more times; empty = no words returned for a non-empty reference. "Excluding" sets aside runaway and phrase utterances.

| Group | Utterances | Runaway | Phrase | Repetition | Empty | Mean WER excl. (95% CI) | Pooled WER excl. | Ins excl. |
|---|---:|---:|---:|---:|---:|---|---:|---:|
| control | 992 | 0.8% (8) | 0.7% (7) | 0.0% (0) | 6.4% (63) | 33.6% (27.7%–40.2%) | 30.3% | 2.0% |
| dementia | 981 | 0.3% (3) | 0.9% (9) | 0.0% (0) | 12.7% (125) | 44.8% (38.6%–51.0%) | 45.5% | 2.0% |

## Secondary policy — fillers kept (what reaches the retriever untouched)

| Group | Speakers | Ref words | Mean WER (95% CI over speakers) | Median WER | Pooled WER | Sub | Del | Ins |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| control | 77 | 8838 | 36.1% (29.9%–43.0%) | 25.0% | 33.2% | 13.0% | 17.9% | 2.3% |
| dementia | 78 | 7797 | 46.3% (40.4%–52.6%) | 38.6% | 47.6% | 16.5% | 29.3% | 1.8% |

Dementia vs control: U = 2192.0, p = 0.004, δ = 0.27.

## Error character (fillers stripped)

Function-word share of deletions: 58.6% (2004 function, 1417 content). A high share means the recogniser drops grammar rather than meaning; content-word deletions are the ones that change a retrieval query.

Top substitutions (reference → hypothesis, count):

- the → a (38)
- she → he (34)
- okay → ok (29)
- waters → is (19)
- a → the (18)
- is → was (13)
- the → this (11)
- she → you (11)
- that → it (10)
- the → i (10)
- the → is (8)
- sink → thing (8)
- is → are (7)
- is → i (7)
- mothers → is (6)
- is → girls (6)
- he → you (6)
- alright → right (6)
- boys → is (6)
- windows → is (6)
- and → in (6)
- is → you (5)
- her → the (5)
- her → your (5)
- the → do (5)
- the → my (5)
- the → water (5)
- there → here (5)
- well → all (5)
- running → run (5)

Most-deleted words:

- the (321)
- is (247)
- and (210)
- i (105)
- she (99)
- a (93)
- that (76)
- it (64)
- not (60)
- he (57)
- to (46)
- in (42)
- do (41)
- there (40)
- cookie (35) [content]

## Latency

API round trip per chunk: median 636 ms, mean 681 ms (n = 1973); real-time factor 0.42. Measured from this machine; report alongside E4.

## Paired comparison against other models (per-speaker WER, fillers stripped)

| Comparison | Speakers | Mean Δ WER (this − other) | Wilcoxon p | Rank-biserial |
|---|---:|---:|---:|---:|
| gpt-4o-mini-transcribe vs whisper-1 | 155 | +0.3 pp | 0.104 | 0.16 |

## Threats

- Cookie Theft picture descriptions, US English, clinical recordings from the 1980s–2000s (denoised in this release). This bounds robustness to impaired speech, not to New Zealand accent or to caregiver vocabulary.
- The production-primary recogniser on the web (browser Web Speech API, en-NZ) is not measured here; see the live-harness subset if run.
- Reference transcripts follow CHAT conventions; retraced words are kept because they were spoken, and omitted sounds are scored as the full word.
