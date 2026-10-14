# Post hoc check of the §19B whisper-1 error model against whisper-1's real transcripts

Dementia group, condition (a): 1001 utterances with a non-empty reference. Simulated: the committed w1 model applied to each reference, 5 seeds (42 to 46); mean over seeds, range in brackets. Aggregates only.

| Measure | whisper-1, real | Error model, simulated |
|---|---|---|
| Pooled WER | 0.416 | 0.394 (0.387–0.397) |
| Mean per-utterance WER | 0.582 | 0.411 (0.399–0.419) |
| SD of per-utterance WER | 1.410 | 0.328 (0.286–0.372) |
| Utterances with no error | 0.236 | 0.117 (0.112–0.120) |
| Utterances with WER ≥ 50% | 0.412 | 0.337 (0.315–0.358) |
| P(error | previous position an error) | 0.758 | 0.423 (0.421–0.425) |
| Error share of aligned positions | 0.388 | 0.376 (0.371–0.379) |
| Reference content words kept | 0.634 | 0.656 (0.646–0.665) |
| Spearman ρ, real vs simulated per-utterance WER | — | -0.009 |

