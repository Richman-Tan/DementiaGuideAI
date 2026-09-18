# Retrieval relevance labels — first annotator vs R2 — snapshot e97b0ef

Generated 2026-09-18T22:10:46.270Z by `scripts/eval/import-labels.mjs` from `data/labelpool/retrieval-labels_JooHyun.json`. Pool: 33 questions, 294 judged (question, passage) pairs out of 294 shown (0 left unmarked). The pool is the union of the hybrid top-10, the dense-only top-10 and the existing labels, shuffled; the second annotator saw no marks. Scale: relevant / partly (= existing "acceptable") / not.

| Agreement | Value |
|---|---:|
| Exact agreement, 3-level | 34.7 % |
| Cohen's κ, unweighted | 0.12 |
| Cohen's κ, linear weights | 0.18 |
| Cohen's κ, quadratic weights | 0.22 |
| Agreement on *relevant* vs not, binary | 72.4 % |
| Cohen's κ, binary relevant | 0.32 |

**Read the κ with the design in mind.** The first annotator's set marks ONE primary passage per question (plus an occasional alternate); every other passage in the pool counts as "not" for it, whether or not anyone judged it. R2 marked every passage shown. The 3-level κ therefore measures how exhaustive the July labels are, not whether the two people disagree about what is relevant. The statistic that answers the second question is the primary-confirmation rate: **R2 marked the first annotator's primary passage relevant in 32 of 33** (partly 1, not 0, unmarked 0), and found on average 3.4 relevant passages per question. Recall@k against the single primary label is therefore a conservative measure; the pooled labels below give the fuller one.

Confusion (rows: first annotator; columns: R2; not / partly / relevant):

| | not | partly | relevant |
|---|---:|---:|---:|
| not | 69 | 111 | 75 |
| partly | 0 | 1 | 5 |
| relevant | 0 | 1 | 32 |

Pooled labels (union, graded): 80 passages newly *relevant*, 111 newly *acceptable*; 1 first-annotator relevant passages that R2 marked lower (kept, per the union rule; listed in the JSON).

Questions where the two disagree on what is relevant:

- A1: first = caregiving_001; R2 = bestpractices_003, bestpractices_002, isupport_nz_c078, caregiving_001 (partly: caregiving_007, caregiving_005, caregiving_002, isupport_nz_c120)
- A2: first = caregiving_002; R2 = isupport_nz_c113, isupport_who_c119, caregiving_002
- A3: first = caregiving_004; R2 = isupport_nz_c086, isupport_who_c065, caregiving_004 (partly: communication_001, bestpractices_009)
- A4: first = caregiving_005; R2 = isupport_who_c113, caregiving_005, isupport_nz_c121 (partly: caregiving_001, homesafety_005, bestpractices_005, caregiving_008, caregiving_007)
- A5: first = caregiving_006; R2 = isupport_nz_c096, isupport_who_c072, caregiving_006 (partly: homesafety_002, caregiving_003, homesafety_007, bestpractices_010)
- A6: first = caregiving_009; R2 = wellbeing_001, wellbeing_010, isupport_nz_c020, isupport_nz_c019, wellbeing_004, caregiving_009 (partly: bestpractices_007, wellbeing_006, wellbeing_003)
- A7: first = clinical_001; R2 = isupport_nz_c010, clinical_001, isupport_who_c010 (partly: clinical_002, alzheimers_disease_001)
- A8: first = clinical_003; R2 = isupport_nz_c009 (partly: dg_delirium_v2026_09_736cfad1, clinical_011, bestpractices_008, bestpractices_009, isupport_nz_c013, homesafety_003, clinical_003, clinical_002)
- A9: first = clinical_004; R2 = dg_delirium_v2026_09_9d3492c4, clinical_004 (partly: caregiving_006, dg_delirium_v2026_09_736cfad1, isupport_nz_c135, caregiving_008, wellbeing_008)
- A10: first = clinical_007; R2 = prevention_006, wellbeing_011, caregiving_010, clinical_007, isupport_nz_c017 (partly: wellbeing_004, clinical_001, isupport_nz_c042)
- A11: first = clinical_008; R2 = clinical_004, clinical_005, clinical_008, dg_delirium_v2026_09_736cfad1 (partly: prevention_002, isupport_nz_c009, clinical_002, bestpractices_006, clinical_011)
- A12: first = bestpractices_003; R2 = bestpractices_001, bestpractices_003, isupport_who_c099, isupport_who_c100
- A13: first = bestpractices_004; R2 = bestpractices_004, isupport_nz_c141, isupport_who_c117 (partly: caregiving_002, bestpractices_006)
- A14: first = bestpractices_005; R2 = isupport_nz_c125, homesafety_008, bestpractices_005, isupport_who_c122, homesafety_005 (partly: caregiving_005, bestpractices_002, homesafety_007, homesafety_011)
- A15: first = bestpractices_007; R2 = wellbeing_005, bestpractices_007 (partly: caregiving_002, isupport_who_c058, wellbeing_006, isupport_nz_c063, wellbeing_002)
- A16: first = communication_001; R2 = communication_009, communication_005, isupport_who_c020, communication_001, isupport_nz_c032 (partly: communication_002, communication_010, communication_007, caregiving_002, bestpractices_012)
- A19: first = homesafety_002; R2 = caregiving_003, isupport_nz_c094, homesafety_002, bestpractices_008 (partly: isupport_who_c072, homesafety_010, bestpractices_010, homesafety_009, homesafety_007)
- A20: first = homesafety_003; R2 = homesafety_008, homesafety_001, homesafety_003 (partly: isupport_nz_c089, isupport_nz_c109)
- A21: first = homesafety_006; R2 = isupport_nz_c131, homesafety_006, isupport_who_c126 (partly: prevention_006, prevention_002)
- A22: first = wellbeing_001; R2 = caregiving_009, isupport_nz_c020, wellbeing_001 (partly: bestpractices_007, wellbeing_006, wellbeing_005, wellbeing_004, isupport_nz_p037)
- A23: first = wellbeing_004; R2 = wellbeing_001, isupport_nz_c020, caregiving_009, wellbeing_004 (partly: isupport_nz_c019, wellbeing_006, caregiving_012)
- A25: first = wellbeing_010; R2 = isupport_nz_c019, wellbeing_004, wellbeing_010, caregiving_009 (partly: wellbeing_006, wellbeing_007, isupport_nz_c020, wellbeing_001)
- A26: first = prevention_002; R2 = isupport_nz_c011, clinical_001, alzheimers_disease_001, clinical_002, prevention_002, isupport_who_c010 (partly: clinical_011)
- A27: first = prevention_001; R2 = prevention_003, prevention_004, prevention_008, prevention_001, isupport_nz_c014, isupport_nz_c015
- A28: first = prevention_005; R2 = caregiving_010, prevention_005 (partly: wellbeing_003, prevention_006, isupport_who_c130, isupport_nz_c044, clinical_005, wellbeing_009, caregiving_009)
- A33: first = dg_delirium_v2026_09_736cfad1; R2 = dg_delirium_v2026_09_9d3492c4, dg_delirium_v2026_09_736cfad1, clinical_004 (partly: clinical_008)
- A30: first = bestpractices_008; R2 = homesafety_002, homesafety_010, bestpractices_005, bestpractices_010, homesafety_007, bestpractices_008 (partly: isupport_who_c122)
- A31: first = homesafety_005; R2 = bestpractices_005, isupport_nz_c125, homesafety_005, isupport_who_c122 (partly: homesafety_007)
- A32: first = wellbeing_008; R2 = bestpractices_001, clinical_004, caregiving_008, wellbeing_008 (partly: isupport_nz_c137, wellbeing_006, bestpractices_003, caregiving_001, isupport_nz_c105)

Adoption: re-run `node scripts/eval/run-retrieval.mjs` against the pooled labels to report recall@k with the second annotator's judgements included, and quote κ next to it.
