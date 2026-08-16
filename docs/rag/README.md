# RAG pipeline

The chat is powered by a cloud RAG pipeline over Supabase pgvector and OpenAI.

All prompt and retrieval configuration lives in **[`packages/core/rag/`](../../packages/core/rag)** —
plain CommonJS shared by the mobile app, the web app, Jest and the Node scripts.
Change values there, never in per-script copies.

## Configuration

| Setting | Value |
|---|---|
| Embedding model | `text-embedding-3-small` (1536 dims) |
| Chat model | `gpt-4o` (temp 0.7 in app; eval runs temp 0 + seed for comparability) |
| Vector DB | Supabase `knowledge_chunks` (pgvector `vector(1536)` + tsvector, hybrid `match_chunks` RPC) |
| Retrieval | Oversample 50 → source-family cap (iSupport max 2) → top 5; min similarity 0.25 |
| Prompt | `v2-nz-safety` — NZ region, 111-first emergency escalation, no dosing/diagnosis output. `PROMPT_VERSION='v1'` in `ragConfig.js` is the one-line rollback |
| Citations | Inline `[S#]` markers validated against supplied passages (`CITATION_MODE='trailing'` rolls back) |
| Context window | Last 6 messages |
| Telemetry | Device-local ring buffer of retrieval traces (ids/scores/latency — never message text) |

**Flow:** user query → embed (LRU-cached) → `match_chunks` hybrid RPC →
cap/diversity → passages injected as `[S1]…` blocks → gpt-4o → citation
extraction and validation → answer plus tappable sources. The voice path strips
markers before TTS and delivers the same structured sources.

## Adding content to the knowledge base

Every source must be registered in `scripts/ingest/registry.js` with provenance
(document_id, version, country, licence). Unregistered content cannot be
ingested, and sources stay `enabled: false` until their licence is confirmed.
Source files live in `content/sources/` with checksums in `MANIFEST.md`.

```bash
npm run kb:ingest:dry -- --doc curated     # plan (hash-diff, no writes)
npm run kb:ingest -- --doc curated         # tag + embed only new/changed chunks
npm run kb:ingest -- --doc <id> --prune    # also remove chunks the source no longer produces
```

Ingestion is idempotent by content hash: unchanged chunks are skipped, edited
chunks re-embed, and every chunk carries full provenance columns (requires
`scripts/migrations/2026-07-17_a_provenance_columns.sql`).

## Evaluating the pipeline

```bash
npm run rag:eval:retrieval    # deterministic recall@k / MRR / nDCG vs the labelled set
npm run rag:eval:generation   # answers for all sets (temp 0, seeded)
npm run rag:eval:safety  -- docs/report/eval/generation_<sha>_<prompt>.json   # MUST/MUST-NOT gates (exit code)
npm run rag:grade        -- docs/report/eval/generation_<sha>_<prompt>.json   # groundedness judge + spot-check file
npm run rag:eval:sweep        # min_similarity × diversity-cap parameter sweep
npm run rag:introspect        # dump live corpus → docs/report/kb_chunks_reference.csv
```

The frozen pre-overhaul baseline is in `docs/report/baseline/` — compare any
change against it. Metric definitions and known limitations are in the
[evaluation plan](rag-evaluation-plan.md).

## Reference documents

| Doc | What it covers |
|---|---|
| [rag-target-architecture.md](rag-target-architecture.md) | The intended design — start here |
| [rag-current-state-audit.md](rag-current-state-audit.md) | Audit of what was actually implemented |
| [rag-industry-research.md](rag-industry-research.md) | Background research behind the design choices |
| [rag-evaluation-plan.md](rag-evaluation-plan.md) | Metric definitions, method, known limitations |
| [rag-improvement-results.md](rag-improvement-results.md) | Measured before/after results |
| [rag-source-inventory.md](rag-source-inventory.md) | Every knowledge-base source and its review verdict |

## Where this is heading

The RAG core is deliberately free of platform imports so it can move
server-side. See [../architecture/backend-plan.md](../architecture/backend-plan.md).
