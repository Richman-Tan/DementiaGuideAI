# RAG Source Inventory

> STATUS: SKELETON — populated fully in Stage 9 (after the production snapshot and licence checks). Fields per the audit brief: source name, organisation, document title, URL/identifier, publication date, last reviewed, region, category, authority level, licence/usage status, ingestion version, chunk count, known limitations, verdict (retain / update / supplement / remove).

## Currently deployed sources (as of 2026-07-16, 449 chunks)

| # | Source | Org | Region | Chunks | Licence status | Provenance | Verdict (provisional) |
|---|---|---|---|---|---|---|---|
| 1 | Hand-authored curated chunks (70; 10 × 7 categories) | DementiaGuideAI (internal) | **New Zealand (rewritten 2026-07-17)** | 70 | Original paraphrase; per-chunk `source_org`/`source_url` now point to NZ authorities | In repo: `src/features/library/data/knowledgeBase.js` | **Done (in repo) — awaiting re-ingestion.** NZ-only rewrite complete: all Australian services/orgs replaced with verified NZ equivalents (NASC, Carer Support Subsidy, Residential Care Subsidy, Work and Income, Alzheimers NZ/Dementia NZ, YODAT, Brain Research NZ); emergency number 000→111; 0800 004 001 re-attributed to Alzheimers NZ. Zero AU references remain. **USER: reconcile the 2 extra `clinical` chunks that exist only in the live DB, then `npm run kb:ingest -- --doc curated`.** |
| 2 | WHO iSupport / NZ iSupport course material (`document_id:isupport-*` tags, category `isupport-course`) | WHO / NZ adaptation (unconfirmed) | NZ/global | ~379 | **Unknown — no licence record in repo.** WHO original manual is CC BY-NC-SA 3.0 IGO ([IRIS](https://iris.who.int/handle/10665/324794)); terms of the NZ adaptation unverified | **None in repo** — chunks exist only in the live DB; no source files, ingestion script, URLs, dates, or versions | **Remove & replace** — supersede with licence-confirmed re-ingestion from official materials (Stage 9) |

## Planned / candidate sources (evaluate before ingestion — authority, recency, region, licence, overlap)

| Candidate | Org | Why | Status |
|---|---|---|---|
| iSupport for dementia: training and support manual (2019, ISBN 978-92-4-151586-3, 275 pp) | WHO | Canonical source of the current bulk corpus | **CLEARED FOR INGESTION 2026-07-17.** Fetched + licence verified from the document (CC BY-NC-SA 3.0 IGO, see `content/sources/MANIFEST.md`); non-commercial use confirmed by the project owner. Registry entry `isupport-who-v2026` is `enabled: true`. Extraction: 250 chunks after running-header/footer stripping (logo boilerplate reduced from 87%→9% of chunks). Ingest, eval, then prune the old provenance-free `isupport-who` ids. |
| iSupport NZ adaptation | University of Auckland research group (Sani, Cheung, Peri et al. — [scoping review](https://journals.sagepub.com/doi/10.1177/14713012241283860), [carer study](https://pmc.ncbi.nlm.nih.gov/articles/PMC11667949/)) | NZ-specific service context; **almost certainly the origin of the existing `isupport-nz` chunks** (this is the project owner's research context) | Not publicly distributed. USER supplies the adapted manual file + confirms terms with the research group, then registry entry `isupport-nz-v2026` is pointed at it |
| Alzheimers NZ public guidance pages (helplines, support services) | Alzheimers New Zealand | Authoritative NZ service info (0800 004 001 verified 2026-07-16) | Candidate — check site terms before any ingestion |
| Health NZ / Te Whatu Ora dementia + Healthline pages | Health New Zealand | Official public-health guidance; Healthline 0800 611 116 verified 2026-07-16 | Candidate — Crown copyright terms to check |
| Dementia NZ information sheets | Dementia New Zealand | Practical caregiver guidance, regional services | Candidate — check terms |

## Refresh / retirement process

Defined in [rag-target-architecture.md §5](rag-target-architecture.md): the ingestion registry is the single list of intended content; refresh = registry update → hash-diff re-ingest → eval → prune superseded versions. Review dates recorded here per source once populated.
