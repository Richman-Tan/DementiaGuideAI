# Speech recognition on dementia speech — local:large-v2-mlx-8bit — snapshot ecdceaf

Generated 2026-09-18T09:56:34.931Z by `scripts/eval/stt/wer-report.mjs`. Corpus: DementiaBank ADReSS-2020 (Cookie Theft, participant utterances only). 2063 rows in references (2063 utterances, 2063 audio chunks — sub-chunks of one utterance are merged before scoring), 2063 scored, 0 without a hypothesis. Unit of analysis: speaker (156). Reference cleaning per `prepare-adress.py`; normalisation per `scripts/eval/lib/wer.js` (lowercase, punctuation, small numbers, contractions).

Data use: DementiaBank membership; cite Becker et al. (1994) and acknowledge NIA AG03705 and AG05133. Only aggregates are recorded here; audio, transcripts and hypotheses stay in the git-ignored data directory.

## Primary policy — fillers stripped from both sides (what `whisper-1` drops by design)

| Group | Speakers | Ref words | Mean WER (95% CI over speakers) | Median WER | Pooled WER | Sub | Del | Ins |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| control | 78 | 9194 | 39.4% (30.2%–50.2%) | 19.8% | 34.6% | 12.9% | 10.8% | 10.9% |
| dementia | 78 | 7870 | 58.1% (44.7%–72.6%) | 33.8% | 59.7% | 19.1% | 18.6% | 22.0% |

Dementia vs control (per-speaker WER): Mann–Whitney U = 2295.5, z = 2.65, p = 0.008, Cliff's δ = 0.25 (n = 78 vs 78).
WER vs MMSE (per speaker): Spearman ρ = -0.176, p = 0.027, n = 155.

## Hallucination and runaway decoding

Whisper-family decoders emit stock phrases on very short or near-silent audio and can loop on pause-heavy speech; pause-heavy speech is what the dementia group produces, so part of any group gap can be decoder behaviour rather than misrecognition. The deployed model family behaves the same way, so these cases are reported here rather than filtered out of the headline above. Runaway = hypothesis at least twice the reference length and at least five words longer; phrase = a fixed stock phrase ("thank you", "thanks for watching", "subscribe", "bye") present in the hypothesis but not the reference; repetition = some trigram repeated three or more times; empty = no words returned for a non-empty reference. "Excluding" sets aside runaway and phrase utterances.

| Group | Utterances | Runaway | Phrase | Repetition | Empty | Mean WER excl. (95% CI) | Pooled WER excl. | Ins excl. |
|---|---:|---:|---:|---:|---:|---|---:|---:|
| control | 1045 | 2.8% (29) | 4.6% (48) | 1.0% (10) | 3.9% (41) | 29.1% (22.9%–35.8%) | 24.6% | 3.6% |
| dementia | 1018 | 2.9% (30) | 9.9% (101) | 1.5% (15) | 4.3% (44) | 39.2% (32.8%–46.0%) | 35.8% | 4.2% |

## Secondary policy — fillers kept (what reaches the retriever untouched)

| Group | Speakers | Ref words | Mean WER (95% CI over speakers) | Median WER | Pooled WER | Sub | Del | Ins |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| control | 78 | 9474 | 41.0% (32.0%–51.3%) | 21.7% | 36.1% | 13.0% | 12.9% | 10.2% |
| dementia | 78 | 8176 | 58.9% (46.2%–73.1%) | 35.5% | 60.4% | 19.3% | 20.7% | 20.5% |

Dementia vs control: U = 2319.5, p = 0.010, δ = 0.24.

## Error character (fillers stripped)

Function-word share of deletions: 59.2% (1452 function, 1002 content). A high share means the recogniser drops grammar rather than meaning; content-word deletions are the ones that change a retrieval query.

Top substitutions (reference → hypothesis, count):

- the → a (34)
- a → the (24)
- waters → is (21)
- the → thank (20)
- gonna → to (19)
- that → it (10)
- is → you (10)
- the → to (10)
- is → was (10)
- the → this (10)
- is → thank (9)
- the → i (7)
- it → you (7)
- sink → thing (7)
- a → you (6)
- and → in (6)
- mothers → is (6)
- he → it (6)
- it → that (6)
- is → boys (6)
- see → you (6)
- dishes → you (6)
- the → that (6)
- is → it (6)
- cookie → the (5)
- the → you (5)
- i → thank (5)
- cookie → cooking (5)
- her → your (5)
- windows → is (5)

Most-deleted words:

- the (237)
- is (171)
- and (150)
- i (94)
- a (73)
- she (56)
- that (52)
- it (52)
- he (45)
- not (41)
- do (34)
- there (32)
- in (31)
- s (30) [content]
- to (30)

## Latency

API round trip per chunk: median 2905 ms, mean 4809 ms (n = 2063); real-time factor 1.86. Measured from this machine; report alongside E4.

## Threats

- Cookie Theft picture descriptions, US English, clinical recordings from the 1980s–2000s (denoised in this release). This bounds robustness to impaired speech, not to New Zealand accent or to caregiver vocabulary.
- The production-primary recogniser on the web (browser Web Speech API, en-NZ) is not measured here; see the live-harness subset if run.
- Reference transcripts follow CHAT conventions; retraced words are kept because they were spoken, and omitted sounds are scored as the full word.
