# Speech recognition on dementia speech — local:large-v2-mlx-8bit — snapshot 4c732bf

Generated 2026-09-18T12:11:13.077Z by `scripts/eval/stt/wer-report.mjs`. Corpus: DementiaBank ADReSS-2020 (Cookie Theft, participant utterances only). 1973 rows in references (1973 utterances, 1973 audio chunks — sub-chunks of one utterance are merged before scoring), 1973 scored, 0 without a hypothesis. Unit of analysis: speaker (155). Reference cleaning per `prepare-adress.py`; normalisation per `scripts/eval/lib/wer.js` (lowercase, punctuation, small numbers, contractions).

Data use: DementiaBank membership; cite Becker et al. (1994) and acknowledge NIA AG03705 and AG05133. Only aggregates are recorded here; audio, transcripts and hypotheses stay in the git-ignored data directory.

## Primary policy — fillers stripped from both sides (what `whisper-1` drops by design)

| Group | Speakers | Ref words | Mean WER (95% CI over speakers) | Median WER | Pooled WER | Sub | Del | Ins |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| control | 77 | 8571 | 36.3% (29.2%–44.3%) | 21.7% | 33.0% | 14.4% | 13.8% | 4.8% |
| dementia | 78 | 7500 | 48.1% (40.0%–56.4%) | 38.5% | 48.1% | 19.5% | 21.9% | 6.8% |

Dementia vs control (per-speaker WER): Mann–Whitney U = 2201.0, z = 2.87, p = 0.004, Cliff's δ = 0.27 (n = 78 vs 77).
WER vs MMSE (per speaker): Spearman ρ = -0.185, p = 0.021, n = 154.

## Hallucination and runaway decoding

Whisper-family decoders emit stock phrases on very short or near-silent audio and can loop on pause-heavy speech; pause-heavy speech is what the dementia group produces, so part of any group gap can be decoder behaviour rather than misrecognition. The deployed model family behaves the same way, so these cases are reported here rather than filtered out of the headline above. Runaway = hypothesis at least twice the reference length and at least five words longer; phrase = a fixed stock phrase ("thank you", "thanks for watching", "subscribe", "bye") present in the hypothesis but not the reference; repetition = some trigram repeated three or more times; empty = no words returned for a non-empty reference. "Excluding" sets aside runaway and phrase utterances.

| Group | Utterances | Runaway | Phrase | Repetition | Empty | Mean WER excl. (95% CI) | Pooled WER excl. | Ins excl. |
|---|---:|---:|---:|---:|---:|---|---:|---:|
| control | 992 | 1.3% (13) | 2.4% (24) | 0.4% (4) | 3.4% (34) | 33.7% (27.3%–40.7%) | 29.7% | 2.9% |
| dementia | 981 | 1.5% (15) | 3.8% (37) | 0.4% (4) | 5.1% (50) | 42.5% (36.3%–48.6%) | 42.9% | 3.7% |

## Secondary policy — fillers kept (what reaches the retriever untouched)

| Group | Speakers | Ref words | Mean WER (95% CI over speakers) | Median WER | Pooled WER | Sub | Del | Ins |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| control | 77 | 8838 | 37.8% (30.8%–45.5%) | 24.6% | 34.6% | 14.4% | 15.8% | 4.3% |
| dementia | 78 | 7797 | 49.1% (41.3%–57.3%) | 39.0% | 49.5% | 19.5% | 23.9% | 6.0% |

Dementia vs control: U = 2246.0, p = 0.007, δ = 0.25.

## Error character (fillers stripped)

Function-word share of deletions: 59.3% (1676 function, 1148 content). A high share means the recogniser drops grammar rather than meaning; content-word deletions are the ones that change a retrieval query.

Top substitutions (reference → hypothesis, count):

- the → a (32)
- a → the (21)
- she → he (21)
- gonna → to (14)
- is → was (11)
- waters → is (11)
- the → this (11)
- that → it (8)
- the → and (8)
- is → boys (8)
- she → you (8)
- the → is (7)
- the → to (7)
- is → are (7)
- the → i (7)
- and → in (7)
- is → i (7)
- the → thank (6)
- drying → drawing (6)
- sink → thing (6)
- is → you (5)
- is → has (5)
- the → do (5)
- the → my (5)
- cookie → cooking (5)
- the → water (5)
- see → say (4)
- is → and (4)
- is → doors (4)
- well → oh (4)

Most-deleted words:

- the (302)
- is (198)
- and (173)
- i (88)
- she (84)
- a (77)
- that (63)
- it (51)
- he (49)
- not (41)
- in (39)
- well (35) [content]
- do (35)
- there (34)
- to (32)

## Latency

API round trip per chunk: median 2478 ms, mean 3915 ms (n = 1973); real-time factor 2.60. Measured from this machine; report alongside E4.

## Threats

- Cookie Theft picture descriptions, US English, clinical recordings from the 1980s–2000s (denoised in this release). This bounds robustness to impaired speech, not to New Zealand accent or to caregiver vocabulary.
- The production-primary recogniser on the web (browser Web Speech API, en-NZ) is not measured here; see the live-harness subset if run.
- Reference transcripts follow CHAT conventions; retraced words are kept because they were spoken, and omitted sounds are scored as the full word.
