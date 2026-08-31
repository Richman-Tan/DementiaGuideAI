# Library source map

Grounding for every web library article (`apps/web/src/data/articles/*.js`).
Each body must be written from the mapped KB entries (`apps/mobile/src/features/
library/data/knowledgeBase.js` — also the RAG `curated` source, read-only) and the
WHO iSupport manual (`content/sources/who-isupport-manual-2019.pdf`, CC BY-NC-SA
3.0 IGO, non-commercial use confirmed 2026-07-17; do not use the WHO logo).
Cite the KB entries' own `source_org`/`source_url` plus iSupport where used.

Depth tiers: **full** ~1,000–1,200 words · **standard** ~800–1,000 · **thin**
450–700 (sources genuinely thin — kept short and honest, never padded; thin ids
are allowlisted in `apps/web/tests/libraryContent.test.js`).

iSupport modules: M1 Introduction to dementia · M2 Being a carer (L1 journey,
L2 improving communication, L3 supported decision-making, L4 involving others) ·
M3 Caring for me (L1 reducing stress, L2 pleasant activities, L3 thinking
differently) · M4 Everyday care (L1 mealtimes, L2 eating/health problems,
L3 toileting & continence, L4 personal care, L5 an enjoyable day) · M5 Behaviour
changes (L2 memory loss, L3 aggression, L4 depression/anxiety/apathy, L5 sleep,
L6 delusions/hallucinations, L7 repetitive behaviour, L8 walking & getting lost,
L9 judgement).

| Web article | KB entries | iSupport | Tier | Notes |
|---|---|---|---|---|
| managing-sundowning | caregiving_001 | M5 L5 | full | expand existing body, keep its prose |
| safe-home | homesafety_010, homesafety_004 | — | standard | room-by-room sweep framing |
| hygiene-bathing | caregiving_003 | M4 L4 | full | dignity + refusals overlap → link refusals |
| mealtimes | caregiving_004 | M4 L1, L2 | full | swallowing → GP/speech therapist, no medical detail |
| daily-routine | caregiving_007 | M4 L5 | standard | |
| continence | caregiving_006 | M4 L3 | full | |
| sleep-rest | caregiving_005 | M5 L5 | standard | keep distinct from sundowning (nights, not evenings) |
| stages | clinical_001 | M1 | full | |
| medications | clinical_003, homesafety_003 | — | standard | NO doses, no drug recommendations; classes + questions for GP |
| urgent-review | clinical_004, clinical_008 | — | standard | delirium vs dementia; 111 framing |
| types | clinical_002, alzheimers_disease_001, alzheimers_disease_002, clinical_009 | M1 | full | |
| gp-specialists | clinical_005, caregiving_008 | — | standard | NZ pathway: GP → memory service/geriatrician; DSL |
| pain | clinical_006 | — | standard | observation cues; no analgesic dosing |
| diagnosis | clinical_005, prevention_006 | M2 L1 | full | |
| repetitive | caregiving_002 | M5 L7 | standard | |
| aggression | bestpractices_001, bestpractices_003 | M5 L3 | full | carer safety explicit; crisis → wellbeing_008 numbers |
| burnout | bestpractices_007 | M3 L1 | full | |
| person-centred | communication_003, communication_004 | M2 L1 | standard | principles frame; Te Ao Māori mention only if sourced |
| music-reminiscence | communication_004 | M4 L5 | standard | |
| refusals | bestpractices_003, caregiving_003 | M4 L4 | standard | |
| validation | communication_003 | M5 L6 | standard | delusions/hallucinations touchpoint |
| memory-loss-communication | communication_001, communication_005, communication_009 | M2 L2 | full | |
| talking-diagnosis | prevention_006, clinical_005 | M2 L3 | standard | whānau framing per title |
| non-verbal | communication_002, communication_007 | M2 L2 | standard | |
| driving | homesafety_006 | M5 L9 | standard | NZ: on-road assessment, NZTA/medical certificate |
| staying-connected | communication_006, wellbeing_003 | M2 L4 | standard | |
| later-stages-communication | communication_007, communication_002 | — | standard | |
| visiting | — | M2 L4 | **thin** | iSupport-only grounding |
| wandering | bestpractices_005, homesafety_005 | M5 L8 | full | safe-return plan; police/111 when missing |
| anxiety-environment | bestpractices_002 | — | standard | |
| kitchen-bathroom | homesafety_001, homesafety_002, homesafety_009 | — | full | |
| falls | bestpractices_008, homesafety_002, homesafety_007 | — | full | |
| wayfinding | homesafety_007 | — | standard | |
| home-technology | homesafety_008, wellbeing_009 | — | standard | |
| doors | homesafety_005 | M5 L8 | standard | dignity/least-restrictive framing |
| carer-stress | wellbeing_002, bestpractices_007 | M3 L1 | full | |
| respite | wellbeing_001, wellbeing_010 | M3 L2 | full | NASC pathway |
| accepting-help | wellbeing_006 | M2 L4 | standard | |
| grief | wellbeing_002 | M3 L3 | standard | anticipatory grief; 1737 support line |
| own-health | wellbeing_005 | M3 L1 | standard | |
| support-groups | wellbeing_003, caregiving_009 | — | **thin** | directory-style; keep honest |
| work-caring | wellbeing_004, caregiving_009 | M3 L1 | standard | NZ entitlements only as sourced (Carers NZ) |
| early-signs | prevention_002 | M1 | full | |
| risk-factors | prevention_001 | — | full | **14** modifiable risks (Lancet 2024) — web `sum` corrected from 12 |
| brain-habits | prevention_003, prevention_004, prevention_008 | — | full | |
| hearing-vision | prevention_001 | — | standard | |
| normal-ageing | prevention_002, prevention_007 | — | **thin** | overlaps early-signs; keep tight |
| memory-assessment | clinical_005, prevention_007 | — | standard | what happens at a memory clinic |
| heart-brain | prevention_003, prevention_008 | — | standard | |

Category slug mapping (web → KB): `best` → `best-practices`, `safety` →
`home-safety`; others identical.

Safety rules enforced by `apps/web/tests/libraryContent.test.js`: NZ numbers only
(111, Healthline 0800 611 116, Alzheimers NZ 0800 004 001, 1737), no 000/911/999,
no AU services (Dementia Australia, My Aged Care, Carer Gateway, NDIS, Centrelink),
no medication doses, no NHS/A&E/Medicare terms in body prose, and a
when-to-seek-help `warn` block in every caregiving/clinical/safety/best article.
