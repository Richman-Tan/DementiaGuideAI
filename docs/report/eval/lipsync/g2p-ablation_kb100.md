# G2P vs character-heuristic ablation — kb100

100 sentences from the curated knowledge base (seeded sample), synthetic alignment at 0.055 s/char, both arms share the alignment. Ground truth = the pruned CMUdict lexicon; words outside it (OOV) are identical in both arms by construction.

| Measure | Value |
|---|---|
| Words | 1502 (OOV 4.8% [3.8–6.0] (72/1502)) |
| Viseme labels changed by G2P (edit ops / longer sequence) | 39.0% |
| Normalised edit distance per sentence | median 0.400, mean 0.389, p90 0.480 |
| Bilabial closures (P/B/M words) produced — G2P | 100.0% [99.1–100.0] (422/422) |
| Bilabial closures produced — heuristic | 100.0% [99.1–100.0] (422/422) |
| Labiodental (F/V) produced — G2P / heuristic | 100.0% [98.5–100.0] (248/248) / 100.0% [98.5–100.0] (248/248) |
| Dental (TH/DH) produced — G2P / heuristic | 100.0% [97.8–100.0] (168/168) / 100.0% [97.8–100.0] (168/168) |
| False bilabial closure in words with no P/B/M — G2P / heuristic | 0.0% [0.0–0.4] (0/1008) / 0.0% [0.0–0.4] (0/1008) |
| False labiodental in words with no F/V — G2P / heuristic | 0.0% [0.0–0.3] (0/1182) / 0.0% [0.0–0.3] (0/1182) |
| Heuristic mouth shapes with no phoneme counterpart (spurious, e.g. silent letters) | 9.7% [9.0–10.3] (719/7447) of heuristic shapes |
| Phoneme shapes the heuristic never produced (missing) | 1.4% [1.2–1.7] (98/6826) of G2P shapes |
| Shape substitutions (different viseme at the same position) | 31.0% [30.0–32.2] (2089/6728) of aligned shapes |

## Class confusion (rows = G2P arm, columns = heuristic arm; counts of aligned visemes)

| G2P \ heuristic | (none) | bilabial | labiodental | rhotic | sibilant | tongue | vowel |
|---|---|---|---|---|---|---|---|
| (none) | 0 | 2 | 3 | 6 | 4 | 190 | 514 |
| bilabial | 0 | 496 | 0 | 0 | 0 | 3 | 4 |
| labiodental | 0 | 0 | 269 | 0 | 0 | 0 | 1 |
| rhotic | 0 | 0 | 0 | 533 | 0 | 2 | 3 |
| sibilant | 19 | 0 | 0 | 0 | 650 | 24 | 72 |
| tongue | 21 | 1 | 1 | 0 | 4 | 1906 | 77 |
| vowel | 58 | 4 | 0 | 5 | 16 | 203 | 2454 |

Bilabial words the heuristic missed (first 0): (none)
Words where the heuristic produced a closure the dictionary does not have (first 0): (none)

