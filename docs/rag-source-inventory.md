# RAG Source Inventory

> STATUS: SKELETON — populated fully in Stage 9 (after the production snapshot and licence checks). Fields per the audit brief: source name, organisation, document title, URL/identifier, publication date, last reviewed, region, category, authority level, licence/usage status, ingestion version, chunk count, known limitations, verdict (retain / update / supplement / remove).

## Currently deployed sources (as of 2026-07-16, 449 chunks)

| # | Source | Org | Region | Chunks | Licence status | Provenance | Verdict (provisional) |
|---|---|---|---|---|---|---|---|
| 1 | Hand-authored curated chunks (70; 10 × 7 categories) — paraphrased from Dementia Australia, NHS UK, Alzheimer's Society UK, WHO and similar | DementiaGuideAI (internal) | Mixed AU/UK/global — **region-incorrect for NZ target** | 70 | Original paraphrase; per-chunk `source_org`/`source_url` attribution present | In repo: `src/features/library/data/knowledgeBase.js` | **Update** — NZ rewrite of Australia-specific service content (Stage 9, user-reviewed) |
| 2 | WHO iSupport / NZ iSupport course material (`document_id:isupport-*` tags, category `isupport-course`) | WHO / NZ adaptation (unconfirmed) | NZ/global | ~379 | **Unknown — no licence record in repo.** WHO original manual is CC BY-NC-SA 3.0 IGO ([IRIS](https://iris.who.int/handle/10665/324794)); terms of the NZ adaptation unverified | **None in repo** — chunks exist only in the live DB; no source files, ingestion script, URLs, dates, or versions | **Remove & replace** — supersede with licence-confirmed re-ingestion from official materials (Stage 9) |

## Planned / candidate sources (evaluate before ingestion — authority, recency, region, licence, overlap)

| Candidate | Org | Why | Status |
|---|---|---|---|
| iSupport for dementia: training and support manual (2019) | WHO | Canonical source of the current bulk corpus; CC BY-NC-SA 3.0 IGO | Fetch + licence confirmation pending (USER gate) |
| iSupport NZ adaptation | (to identify — likely via University of Auckland / NZ dementia orgs) | NZ-specific service context | Identify official distribution + terms (USER gate) |
| Alzheimers NZ public guidance pages (helplines, support services) | Alzheimers New Zealand | Authoritative NZ service info (0800 004 001 verified 2026-07-16) | Candidate — check site terms before any ingestion |
| Health NZ / Te Whatu Ora dementia + Healthline pages | Health New Zealand | Official public-health guidance; Healthline 0800 611 116 verified 2026-07-16 | Candidate — Crown copyright terms to check |
| Dementia NZ information sheets | Dementia New Zealand | Practical caregiver guidance, regional services | Candidate — check terms |

## Refresh / retirement process

Defined in [rag-target-architecture.md §5](rag-target-architecture.md): the ingestion registry is the single list of intended content; refresh = registry update → hash-diff re-ingest → eval → prune superseded versions. Review dates recorded here per source once populated.
